from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import ORJSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field
from redis.asyncio import Redis

from .config import get_settings
from .fallback import FallbackEngine
from .vertex_retail import RetailClient

settings = get_settings()

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("recommendation-service")

redis = Redis.from_url(settings.redis_url, decode_responses=True,
                       socket_connect_timeout=1.0, socket_timeout=1.0)
retail = RetailClient(settings)
fallback = FallbackEngine(settings, redis)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    source = "Vertex AI Search for commerce" if retail.enabled else "local fallback engine"
    log.info("recommendation-service ready — source: %s", source)
    yield
    await fallback.close()
    await redis.aclose()


app = FastAPI(
    title="topchoice recommendation-service",
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _locale(request: Request) -> str:
    header = request.headers.get("accept-language", "ar")
    first = header.split(",")[0].strip().split("-")[0].lower()
    return "en" if first == "en" else "ar"


class InteractionEvent(BaseModel):
    eventType: str = Field(pattern="^(view|add_to_cart|purchase|search|wishlist)$")
    sku: str | None = Field(default=None, max_length=64)
    query: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=64)
    sessionId: str = Field(max_length=128)


class RerankRequest(BaseModel):
    skus: list[str] = Field(max_length=500)


# --------------------------------------------------------------------- health


@app.get("/health/live", include_in_schema=False)
async def live() -> dict[str, str]:
    return {"status": "UP"}


@app.get("/health/ready", include_in_schema=False)
async def ready() -> dict[str, Any]:
    # التوصيات خدمة غير حرجة: تبقى جاهزة حتى لو تعذّر Redis،
    # لأن سقوطها يجب ألا يمنع تحميل صفحات المنتجات
    redis_up = True
    try:
        await redis.ping()
    except Exception:  # noqa: BLE001
        redis_up = False
    return {
        "status": "UP",
        "retail": "ENABLED" if retail.enabled else "FALLBACK",
        "redis": "UP" if redis_up else "DEGRADED",
    }


# ------------------------------------------------------------ recommendations


@app.get("/api/v1/recommendations/for-you")
async def for_you(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    x_user_id: Annotated[str | None, Header()] = None,
) -> list[dict[str, Any]]:
    """
    «مقترح لك».

    للزائر غير المسجّل لا يوجد تخصيص ممكن، فنعرض الأكثر رواجًا —
    وهو ما تفعله المتاجر الكبرى فعليًا في هذه الحالة.
    """
    limit = min(limit, settings.max_limit)
    locale = _locale(request)

    skus: list[str] = []
    if x_user_id:
        result = await asyncio.to_thread(retail.recommend_for_user, x_user_id, limit)
        if result:
            skus = result
        else:
            skus = await fallback.for_user(x_user_id, limit)
    else:
        skus = await fallback.trending(limit)

    return await fallback.hydrate(skus, locale)


@app.get("/api/v1/recommendations/related")
async def related(
    request: Request,
    sku: Annotated[str, Query(max_length=64)],
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    x_user_id: Annotated[str | None, Header()] = None,
) -> list[dict[str, Any]]:
    """«منتجات مشابهة» / «يُشترى معه» في صفحة المنتج."""
    limit = min(limit, settings.max_limit)
    locale = _locale(request)

    cache_key = f"rec:related:{sku}:{locale}:{limit}"
    if not x_user_id:
        try:
            cached = await redis.get(cache_key)
            if cached:
                import orjson
                return orjson.loads(cached)
        except Exception:
            # سقوط الكاش لا يُسقط الطلب — نُكمل إلى المصدر. لكن الصمت التام
            # يخفي انقطاع Redis كليًا، فنسجّل على debug لا error.
            log.debug("تعذّرت قراءة كاش التوصيات", exc_info=True)

    result = await asyncio.to_thread(retail.related_items, sku, x_user_id, limit)
    skus = result if result else await fallback.related(sku, limit)
    items = await fallback.hydrate(skus, locale)

    if not x_user_id and items:
        try:
            import orjson
            await redis.setex(cache_key, settings.cache_ttl_seconds, orjson.dumps(items))
        except Exception:
            log.debug("تعذّرت كتابة كاش التوصيات", exc_info=True)

    return items


@app.get("/api/v1/recommendations/trending")
async def trending(
    request: Request,
    category: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
) -> list[dict[str, Any]]:
    limit = min(limit, settings.max_limit)
    skus = await fallback.trending(limit, category)
    return await fallback.hydrate(skus, _locale(request))


@app.post("/api/v1/recommendations/rerank")
async def rerank(
    body: RerankRequest,
    x_user_id: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """
    إعادة ترتيب نتائج البحث حسب تفضيلات المستخدم.
    عند غياب التخصيص نعيد الترتيب الأصلي كما هو — لا نُفسده.
    """
    if not x_user_id or not body.skus:
        return {"skus": body.skus, "personalized": False}

    result = await asyncio.to_thread(retail.rerank, x_user_id, body.skus)
    if result:
        return {"skus": result, "personalized": True}
    return {"skus": body.skus, "personalized": False}


# ------------------------------------------------------------------- tracking


@app.post("/api/v1/recommendations/events", status_code=202)
async def track_event(
    event: InteractionEvent,
    background: BackgroundTasks,
    x_user_id: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    """
    استقبال تفاعل مستخدم.

    الرد فوري (202) والمعالجة في الخلفية: التتبّع التحليلي لا يجوز أن يضيف
    ميلي ثانية واحدة إلى زمن تصفّح المستخدم.
    """
    now = time.time()

    background.add_task(
        fallback.record_interaction,
        x_user_id, event.sku, event.eventType, event.category,
    )
    if retail.enabled:
        background.add_task(
            asyncio.to_thread,
            retail.track, x_user_id, event.sessionId, event.eventType, event.sku, now,
        )

    return {"accepted": True}


@app.get("/api/v1/recommendations/admin/stats", include_in_schema=False)
async def stats(request: Request) -> dict[str, Any]:
    if not request.headers.get("x-internal-caller"):
        raise HTTPException(status_code=403, detail={"code": "INTERNAL_ONLY"})
    top = await fallback.trending(20)
    return {
        "retail": retail.enabled,
        "topTrending": top,
        "servingConfigs": {
            "user": bool(settings.retail_serving_config_user),
            "related": bool(settings.retail_serving_config_related),
            "ranking": bool(settings.retail_serving_config_ranking),
        },
    }
