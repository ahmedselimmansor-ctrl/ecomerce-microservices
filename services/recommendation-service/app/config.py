from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    port: int = 8088
    host: str = "0.0.0.0"
    log_level: str = "INFO"

    gcp_project_id: str = ""

    # ---- Vertex AI Search for commerce (Retail API) ------------------------
    # كتالوج التجزئة يسكن `global` لا إقليم الحوسبة: نسخة واحدة تخدم كل
    # الأقاليم، ولا وجود لكتالوج إقليمي في me-central1 يمكن الإشارة إليه.
    retail_location: str = "global"
    retail_catalog: str = "default_catalog"
    # المجموعة التي تُبنى منها مسارات النماذج. `servingConfigs` هي الواجهة
    # الحالية و`placements` القديمة ما تزال مقبولة — جعلناها متغيّرًا كي لا
    # يحتاج التراجع إلى إعادة بناء الصورة.
    retail_placement: str = "servingConfigs"

    # serving config لكل نموذج. فراغ أي منها ⇒ يعمل البديل الداخلي تلقائيًا،
    # فتبقى الخدمة صالحة للتطوير المحلي ولليوم الأول قبل تدريب النموذج.
    retail_serving_config_user: str = ""      # recommended-for-you
    retail_serving_config_related: str = ""   # similar-items
    retail_serving_config_ranking: str = ""   # search + personalization
    # كتابة أحداث المستخدم مطفأة افتراضيًا: بيانات تصفّح بيئة تطوير تُلوّث
    # الكتالوج الحقيقي ولا يمكن سحبها منه بعد وصولها.
    retail_user_events_enabled: bool = False
    # منفذ بديل لواجهة Retail — يخدم الوصول عبر Private Service Connect.
    # لا يوجد محاكي محلي لهذه الواجهة، فتركه فارغًا هو الوضع الطبيعي.
    retail_api_endpoint: str | None = None
    retail_timeout_seconds: float = 0.6

    redis_url: str = "redis://localhost:6379"
    catalog_url: str = "http://localhost:8082"

    default_limit: int = 12
    max_limit: int = 50
    cache_ttl_seconds: int = 300
    trending_window_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
