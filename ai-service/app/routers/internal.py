"""
Internal endpoints — not exposed to the public internet.
Called by the Node.js backend over the internal network only.

Authentication: X-Internal-Key header must match settings.internal_api_key.
"""
from __future__ import annotations

import base64
import io
import json
import logging

import psycopg2
import pymupdf

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.cache.cache_keys import CacheKeys
from app.cache.cache_service import cache_delete_many
from app.config import settings

logger = logging.getLogger("module3.cache")
logger_resume = logging.getLogger("resume.parse")

router = APIRouter(prefix="/internal", tags=["internal"])


class InvalidateCacheRequest(BaseModel):
    student_id: str


@router.post("/cache/invalidate", status_code=204, response_model=None)
def invalidate_student_cache(
    request: InvalidateCacheRequest,
    x_internal_key: str = Header(default=""),
) -> None:
    """
    Invalidate all Module 3 cache entries for a student.

    Called by the Node.js backend immediately after ATTEMPT_COMPLETED is
    processed so that the next agent run reads fresh performance data.

    Returns 204 regardless of whether Redis is available (Redis unavailability
    must never block the event handler in Node.js).
    """
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    student_id = request.student_id.strip()
    if not student_id:
        raise HTTPException(status_code=422, detail="student_id is required")

    perf_key = CacheKeys.performance(student_id)
    gap_key  = CacheKeys.skill_gap(student_id)

    try:
        cache_delete_many(perf_key, gap_key)
        logger.info("cache invalidated  student_id=<redacted>  keys=[performance, skill_gap]")
    except Exception:
        logger.warning("cache invalidation skipped — Redis unavailable")


# ── POST /internal/parse-resume ───────────────────────────────────────────────

_RESUME_PARSE_PROMPT = """\
You are a resume parser. Extract ALL structured data from the resume text below.

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "summary": "2-3 sentence professional summary (write one if not present)",
  "skills": {
    "languages": ["programming/scripting languages only, e.g. Python, Java, TypeScript"],
    "frameworks": ["libraries & frameworks, e.g. React, Spring Boot, FastAPI"],
    "databases": ["databases & data stores, e.g. PostgreSQL, MongoDB, Redis"],
    "tools": ["tools, platforms, cloud, DevOps, e.g. Docker, AWS, Git, Jenkins"]
  },
  "experience": [
    {"title": "Job Title", "company": "Company Name", "duration": "Jan 2023 - Jun 2024", "description": "Key responsibilities and achievements"}
  ],
  "education": [
    {"degree": "B.Tech Computer Science", "institution": "Anna University", "year": "2022-2026"}
  ],
  "projects": [
    {"title": "Project Name", "techStack": ["React", "Node.js"], "description": "What it does and your role"}
  ],
  "certifications": ["AWS Certified Developer", "Google Cloud Professional"],
  "links": {
    "github": "https://github.com/... or null",
    "linkedin": "https://linkedin.com/in/... or null",
    "portfolio": "any other personal/portfolio URL or null"
  }
}

Extract EVERY piece of information. If a section is absent in the resume, use an empty array [] or null. Do not omit any field.

RESUME TEXT:
{text}
"""

class ParseResumeRequest(BaseModel):
    pdf_base64: str
    student_id: str
    resume_id: str


@router.post("/parse-resume", status_code=200)
def parse_resume(
    request: ParseResumeRequest,
    x_internal_key: str = Header(default=""),
) -> dict:
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    # 1. Decode PDF bytes from base64
    try:
        pdf_bytes = base64.b64decode(request.pdf_base64)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid base64 PDF data: {exc}")

    # 2. Extract text with PyMuPDF
    try:
        doc = pymupdf.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
        pages_text = [page.get_text() for page in doc]  # type: ignore[union-attr]
        doc.close()
        raw_text = "\n".join(pages_text).strip()
    except Exception as exc:
        logger_resume.error("PyMuPDF extraction failed: %s", exc)
        raise HTTPException(status_code=422, detail=f"PDF text extraction failed: {exc}")

    if not raw_text:
        raise HTTPException(status_code=422, detail="PDF contains no extractable text")

    # 3. Parse with Groq openai/gpt-oss-20b
    from app.services.llm_client import get_llm_client
    llm = get_llm_client()
    try:
        prompt = _RESUME_PARSE_PROMPT.replace("{text}", raw_text[:12000])
        parsed: dict = llm._call_json(prompt, max_tokens=2048, temperature=0.1)
    except Exception as exc:
        logger_resume.error("LLM parsing failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"LLM parsing failed: {exc}")

    # 4. Store parsed_text + parsed_data in org.resumes
    try:
        conn = psycopg2.connect(settings.database_url)
        cur = conn.cursor()
        cur.execute(
            """UPDATE org.resumes
               SET parsed_text = %s, parsed_data = %s, updated_at = now()
               WHERE id = %s""",
            (raw_text, json.dumps(parsed), request.resume_id),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        logger_resume.error("DB write failed for resume %s: %s", request.resume_id, exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}")

    logger_resume.info("Resume parsed and stored  student_id=<redacted>  resume_id=<redacted>")
    return {"status": "ok", "skills_found": len(parsed.get("skills", []))}
