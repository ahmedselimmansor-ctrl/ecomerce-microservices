"""إعدادات الخدمة — تُقرأ من البيئة وتُتحقَّق عند الإقلاع."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8087
    host: str = "0.0.0.0"
    log_level: str = "INFO"

    opensearch_url: str = "http://localhost:9200"
    opensearch_index: str = "products-v1"
    opensearch_user: str | None = None
    opensearch_password: str | None = None
    # على Amazon OpenSearch Service: توقيع SigV4 عبر IRSA بدل اسم/كلمة مرور
    opensearch_use_aws_auth: bool = False
    aws_region: str = "me-south-1"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_topic_catalog: str = "catalog.product.v1"
    kafka_group_id: str = "search-service"
    # يسمح بتشغيل الـ API بلا مستهلك (مفيد لمهام إعادة الفهرسة)
    kafka_enabled: bool = True

    default_page_size: int = 24
    max_page_size: int = 100
    search_timeout_seconds: float = 3.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
