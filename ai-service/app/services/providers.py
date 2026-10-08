from __future__ import annotations

import json
import re
import time
# Separate reference for quota cooldowns, so patching `time` (to skip retry sleeps) leaves it intact
from time import monotonic as _clock
from abc import ABC, abstractmethod
from typing import Any

# Matches Groq's "Please try again in 11.325s" wording.
_RETRY_AFTER_RE = re.compile(r"try again in ([\d.]+)s", re.IGNORECASE)
_MAX_RATE_LIMIT_RETRIES = 3


def _rate_limit_wait(exc: Exception, attempt: int) -> float:
    """Return seconds to wait before the next retry.

    Prefers the wait time Groq embeds in the error message; falls back to
    capped exponential backoff so we never wait more than 60 s.
    """
    m = _RETRY_AFTER_RE.search(str(exc))
    if m:
        return float(m.group(1)) + 1.0   # add 1 s buffer
    return min(15.0 * (2 ** attempt), 60.0)


class BaseProvider(ABC):
    """Single responsibility: call an LLM and return the raw text response."""

    @abstractmethod
    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str: ...

    @abstractmethod
    def chat_complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]: ...


class OpenAICompatibleProvider(BaseProvider):
    """
    Works with any OpenAI-compatible endpoint.
    Covers: OpenAI, Groq, Together.ai, Ollama, vLLM, LM Studio, Jan.ai, Perplexity, etc.
    """

    # A model that hit its daily token cap (or is unavailable) is skipped this long
    _EXHAUSTED_COOLDOWN_SECONDS = 15 * 60

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        fallback_models: list[str] | None = None,
        fallback_api_keys: list[str] | None = None,
    ) -> None:
        from openai import OpenAI
        self._client = OpenAI(base_url=base_url, api_key=api_key or "local")
        # Extra keys (other accounts) add quota: free-tier limits are per account and model
        self._extra_clients = [
            OpenAI(base_url=base_url, api_key=key) for key in (fallback_api_keys or []) if key and key != api_key
        ]
        self._model = model
        # Tried in order when the primary model's daily quota is used up — on Groq the
        # free-tier token limits are per model, so another model usually still has quota.
        self._fallback_models = [m for m in (fallback_models or []) if m and m != model]
        # (key index, model) → time until which it is skipped
        self._exhausted_until: dict[tuple[int, str], float] = {}
        self._last_usage: dict = {}

    # The primary client is read at call time (tests and config updates replace
    # self._client); fallback settings are optional so partially built providers work.
    def _all_clients(self) -> list[Any]:
        return [self._client, *getattr(self, "_extra_clients", [])]

    def _exhausted(self) -> dict[tuple[int, str], float]:
        if not hasattr(self, "_exhausted_until"):
            self._exhausted_until = {}
        return self._exhausted_until

    def _candidates(self) -> list[tuple[int, str]]:
        """Best model first on every key, then the fallback models on every key."""
        now = _clock()
        models = [self._model, *getattr(self, "_fallback_models", [])]
        pairs = [(k, m) for m in models for k in range(len(self._all_clients()))]
        available = [p for p in pairs if self._exhausted().get(p, 0) <= now]
        return available or pairs  # all exhausted: try anyway, the caller gets the real error

    def _is_model_unavailable(self, exc: Exception) -> bool:
        s = str(exc).lower()
        return "model_not_found" in s or "does not exist" in s or "decommissioned" in s

    def _is_rate_limit(self, exc: Exception) -> bool:
        s = str(exc)
        return "429" in s or "rate_limit" in s.lower() or "rate limit" in s.lower()

    def _is_tpd_exhausted(self, exc: Exception) -> bool:
        """Return True when the 429 signals a daily token cap (not a per-minute rate limit).

        TPD errors must NOT be retried — the quota won't recover for 24 hours.
        Per-minute rate limits can recover in seconds, so they still retry.
        """
        s = str(exc).lower()
        return any(
            kw in s for kw in ("tokens per day", "tpd", "daily token limit", "daily limit")
        )

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        last_exc: Exception | None = None
        for key_index, model in self._candidates():
            try:
                return self._chat_complete_with(
                    self._all_clients()[key_index], model, messages, response_format, temperature, max_tokens)
            except Exception as exc:
                quota_gone = self._is_rate_limit(exc) and self._is_tpd_exhausted(exc)
                if not (quota_gone or self._is_model_unavailable(exc)):
                    raise
                self._exhausted()[(key_index, model)] = _clock() + self._EXHAUSTED_COOLDOWN_SECONDS
                print(f"[providers] key #{key_index + 1} model {model} unavailable "
                      f"({'daily quota' if quota_gone else 'not found'}); trying the next fallback", flush=True)
                last_exc = exc
        assert last_exc is not None
        raise last_exc

    def _chat_complete_with(
        self,
        client: Any,
        model: str,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None,
        temperature: float,
        max_tokens: int | None,
    ) -> str:
        kwargs: dict[str, Any] = dict(
            model=model,
            messages=messages,
            temperature=temperature,
        )
        if response_format:
            kwargs["response_format"] = response_format
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        for attempt in range(_MAX_RATE_LIMIT_RETRIES + 1):
            try:
                resp = client.chat.completions.create(**kwargs)
                usage = getattr(resp, "usage", None)
                self._last_usage = {
                    "input":    getattr(usage, "prompt_tokens",     0) or 0,
                    "output":   getattr(usage, "completion_tokens", 0) or 0,
                    "total":    getattr(usage, "total_tokens",      0) or 0,
                    "attempts": attempt + 1,
                }
                print(
                    f"[providers] request model={model} call=chat_complete"
                    f" attempt={attempt + 1}"
                    f" input_tokens={getattr(usage, 'prompt_tokens', None)}"
                    f" output_tokens={getattr(usage, 'completion_tokens', None)}"
                    f" total_tokens={getattr(usage, 'total_tokens', None)}",
                    flush=True,
                )
                return resp.choices[0].message.content or ""
            except Exception as exc:
                if self._is_rate_limit(exc):
                    if self._is_tpd_exhausted(exc):
                        print(
                            f"[providers] chat_complete TPD_EXHAUSTED"
                            f" attempt={attempt + 1}/{_MAX_RATE_LIMIT_RETRIES + 1}"
                            f" exc_type={type(exc).__name__} exc={exc!r}",
                            flush=True,
                        )
                        raise
                    if attempt < _MAX_RATE_LIMIT_RETRIES:
                        time.sleep(_rate_limit_wait(exc, attempt))
                        continue
                print(
                    f"[providers] chat_complete FAILED"
                    f" attempt={attempt + 1}/{_MAX_RATE_LIMIT_RETRIES + 1}"
                    f" exc_type={type(exc).__name__} exc={exc!r}",
                    flush=True,
                )
                raise

    def chat_complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = dict(model=self._model, messages=messages)
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        attempt_used = 0
        for attempt in range(_MAX_RATE_LIMIT_RETRIES + 1):
            try:
                resp = self._client.chat.completions.create(**kwargs)
                attempt_used = attempt
                break
            except Exception as exc:
                if self._is_rate_limit(exc):
                    if self._is_tpd_exhausted(exc):
                        print(
                            f"[providers] chat_complete_with_tools TPD_EXHAUSTED"
                            f" attempt={attempt + 1}/{_MAX_RATE_LIMIT_RETRIES + 1}"
                            f" exc_type={type(exc).__name__} exc={exc!r}",
                            flush=True,
                        )
                        raise
                    if attempt < _MAX_RATE_LIMIT_RETRIES:
                        time.sleep(_rate_limit_wait(exc, attempt))
                        continue
                print(
                    f"[providers] chat_complete_with_tools FAILED"
                    f" attempt={attempt + 1}/{_MAX_RATE_LIMIT_RETRIES + 1}"
                    f" exc_type={type(exc).__name__} exc={exc!r}",
                    flush=True,
                )
                raise
        usage = getattr(resp, "usage", None)
        self._last_usage = {
            "input":    getattr(usage, "prompt_tokens",     0) or 0,
            "output":   getattr(usage, "completion_tokens", 0) or 0,
            "total":    getattr(usage, "total_tokens",      0) or 0,
            "attempts": attempt_used + 1,
        }
        print(
            f"[providers] request model={self._model} call=chat_complete_with_tools"
            f" attempt={attempt_used + 1}"
            f" input_tokens={getattr(usage, 'prompt_tokens', None)}"
            f" output_tokens={getattr(usage, 'completion_tokens', None)}"
            f" total_tokens={getattr(usage, 'total_tokens', None)}",
            flush=True,
        )
        msg = resp.choices[0].message
        if msg.tool_calls:
            tc = msg.tool_calls[0]
            # Reconstruct the verbatim assistant message so it can be replayed
            # in the next request.  Groq (and OpenAI) require the assistant
            # message that contains tool_calls to appear before the matching
            # tool-result message, and the tool_call_id must round-trip.
            assistant_message: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.function.name,
                            "arguments": call.function.arguments,
                        },
                    }
                    for call in msg.tool_calls
                ],
            }
            return {
                "type": "tool_call",
                "tool_name": tc.function.name,
                "tool_args": json.loads(tc.function.arguments),
                "tool_call_id": tc.id,
                "assistant_message": assistant_message,
            }
        return {"type": "final_answer", "content": msg.content or ""}


class AnthropicProvider(BaseProvider):
    """Anthropic Claude via the official SDK."""

    def __init__(self, api_key: str, model: str = "claude-3-5-haiku-20241022") -> None:
        import anthropic
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
    ) -> str:
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            temperature=temperature,
            messages=messages,
        )
        return resp.content[0].text

    def chat_complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        anthropic_tools = [
            {
                "name": t.get("function", {}).get("name", ""),
                "description": t.get("function", {}).get("description", ""),
                "input_schema": t.get("function", {}).get("parameters", {}),
            }
            for t in tools
        ]
        system_content = ""
        conv_messages: list[dict[str, Any]] = []
        for m in messages:
            if m["role"] == "system":
                system_content = m.get("content", "")
            else:
                conv_messages.append(m)

        kwargs: dict[str, Any] = dict(
            model=self._model, max_tokens=2048, messages=conv_messages
        )
        if system_content:
            kwargs["system"] = system_content
        if anthropic_tools:
            kwargs["tools"] = anthropic_tools

        resp = self._client.messages.create(**kwargs)
        for block in resp.content:
            if block.type == "tool_use":
                return {"type": "tool_call", "tool_name": block.name, "tool_args": block.input}
        text = next((b.text for b in resp.content if hasattr(b, "text")), "")
        return {"type": "final_answer", "content": text}


# ── Tool call sequence the MockProvider cycles through ────────────────────────
_TOOL_SEQUENCE = [
    "GetStudentPerformance",
    "GetSkillGapAnalysis",
    "RetrieveLearningKnowledge",
    "DraftLearningPlan",
]

_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)


class MockProvider(BaseProvider):
    """Offline fallback — platform must work with no API key set."""

    _RESPONSES: dict[str, str] = {
        "generate_question": json.dumps({
            "question_text": "Explain the difference between a stack and a queue, and give a real-world use case for each.",
            "difficulty": "EASY",
            "category": "Data Structures",
        }),
        "evaluate_turn": json.dumps({
            "technical_score": 6.5,
            "communication_score": 7.0,
            "wpm": 130,
            "filler_words": 3,
            "feedback": "Good understanding. Try to use more concrete examples.",
            "strengths": "Clear structure and logical flow.",
            "weaknesses": "Could elaborate more on edge cases.",
            "next_recommended_difficulty": "MEDIUM",
        }),
        "evaluate_listening": json.dumps({
            "score": 7.0,
            "accuracy_level": "MEDIUM",
            "feedback": "You captured the main idea but missed some supporting details.",
            "missed_key_points": ["The timeline mentioned in the story", "The secondary character's role"],
        }),
    }

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        content = messages[-1].get("content", "").lower()
        if "interview question" in content or "generate" in content:
            return self._RESPONSES["generate_question"]
        if "listening" in content:
            return self._RESPONSES["evaluate_listening"]
        return self._RESPONSES["evaluate_turn"]

    def chat_complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        # Determine which tools have already been called via tool-role messages
        called: set[str] = {
            m.get("name", "") for m in messages if m.get("role") == "tool" and m.get("name")
        }

        # Extract the first UUID from system/user messages as studentId
        student_id = "00000000-0000-0000-0000-000000000000"
        for m in messages:
            if m.get("role") in ("system", "user"):
                match = _UUID_RE.search(m.get("content", ""))
                if match:
                    student_id = match.group(0)
                    break

        for tool_name in _TOOL_SEQUENCE:
            if tool_name in called:
                continue
            if tool_name == "GetStudentPerformance":
                return {"type": "tool_call", "tool_name": tool_name, "tool_args": {"studentId": student_id}}
            if tool_name == "GetSkillGapAnalysis":
                return {"type": "tool_call", "tool_name": tool_name, "tool_args": {"studentId": student_id}}
            if tool_name == "RetrieveLearningKnowledge":
                return {"type": "tool_call", "tool_name": tool_name, "tool_args": {"categories": ["TECHNICAL"]}}
            if tool_name == "DraftLearningPlan":
                goal = "Improve interview readiness"
                weak_skills: list[str] = []
                performance_data: dict[str, Any] | None = None
                knowledge_docs: list[Any] = []

                for m in messages:
                    role = m.get("role")
                    name = m.get("name", "")
                    content = m.get("content", "")

                    if role == "user" and "Goal:" in content:
                        parts = content.split("Goal:", 1)
                        if len(parts) > 1:
                            goal = parts[1].strip()
                    elif role == "tool":
                        try:
                            parsed = json.loads(content)
                        except (json.JSONDecodeError, TypeError):
                            parsed = {}
                        if name == "GetSkillGapAnalysis":
                            raw = parsed.get("weakSkills") or []
                            weak_skills = [
                                s["name"] for s in raw if isinstance(s, dict) and "name" in s
                            ]
                        elif name == "GetStudentPerformance":
                            performance_data = parsed.get("profile")
                        elif name == "RetrieveLearningKnowledge":
                            knowledge_docs = parsed.get("documents") or []

                return {
                    "type": "tool_call",
                    "tool_name": tool_name,
                    "tool_args": {
                        "goal": goal,
                        "weakSkills": weak_skills,
                        "performanceData": performance_data,
                        "knowledgeDocs": knowledge_docs,
                        "durationWeeks": 4,
                    },
                }

        return {"type": "final_answer", "content": "Analysis complete. Learning plan has been drafted."}
