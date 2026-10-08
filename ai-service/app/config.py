from pathlib import Path
from dotenv import load_dotenv

# Use absolute path so this works regardless of which directory uvicorn is started from
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ai-service"
    app_version: str = "0.1.0"
    debug: bool = False
    llm_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"
    # Generic LLM config (takes priority over groq_* vars)
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    # Shared PostgreSQL database (same instance as Node.js backend)
    database_url: str = "postgresql://postgres:postgres@localhost:5432/comm_readiness"
    # Shared secret required by POST /ai/config — set to a strong random string in production
    internal_api_key: str = "change-me"

    # ── Redis cache (Module 3) ────────────────────────────────────────────────
    # Leave empty to disable caching entirely; Module 3 falls back to the DB.
    redis_url: str = ""
    # TTLs in seconds
    module3_performance_cache_ttl: int = 600    # 10 min — invalidated on ATTEMPT_COMPLETED
    module3_skill_gap_cache_ttl: int = 600      # 10 min — invalidated on ATTEMPT_COMPLETED
    module3_knowledge_cache_ttl: int = 3600     # 1 hour — knowledge docs change infrequently
    module3_web_cache_ttl: int = 3600           # 1 hour — web results stable per skill sig

    # ── Worker pool / autoscaler ─────────────────────────────────────────────
    min_workers: int = 1
    max_workers: int = 4
    target_jobs_per_worker: int = 1
    scale_up_cooldown_seconds: float = 10.0
    scale_down_cooldown_seconds: float = 30.0
    autoscaler_check_interval: float = 5.0
    max_concurrent_agent_jobs: int = 4

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# ── Business rules (not environment-configurable) ─────────────────────────────
# Fixed learning-plan duration. This is a product constraint, not a setting.
# All generation, validation, and persistence must use this constant.
LEARNING_PLAN_DURATION_WEEKS: int = 4
