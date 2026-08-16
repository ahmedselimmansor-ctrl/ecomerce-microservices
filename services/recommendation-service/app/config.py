from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8088
    host: str = "0.0.0.0"
    log_level: str = "INFO"

    aws_region: str = "me-south-1"
    aws_endpoint_url: str | None = None

    # ---- Amazon Personalize ------------------------------------------------
    # حملة لكل وصفة (recipe). فراغ أي منها ⇒ يعمل البديل الداخلي تلقائيًا،
    # فتبقى الخدمة صالحة للتطوير المحلي ولليوم الأول قبل تدريب النموذج.
    personalize_campaign_user: str = ""      # user-personalization-v2
    personalize_campaign_related: str = ""   # similar-items
    personalize_campaign_ranking: str = ""   # personalized-ranking
    personalize_tracking_id: str = ""        # event tracker
    personalize_timeout_seconds: float = 0.6

    redis_url: str = "redis://localhost:6379"
    catalog_url: str = "http://localhost:8082"

    default_limit: int = 12
    max_limit: int = 50
    cache_ttl_seconds: int = 300
    trending_window_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
