from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import ORJSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from .config import get_settings
from .indexer import CatalogIndexer
from .search_engine import SearchEngine

settings = get_settings()

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger("search-service")

engine = SearchEngine(settings)
indexer = CatalogIndexer(settings, engine)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # لا نبدأ الاستهلاك قبل جاهزية الفهرس، وإلا ضاعت أول دفعة أحداث
    if not await engine.ensure_index():
        log.error("starting without a usable index — search will return empty results")
    await indexer.start()
    log.info("search-service ready")
    yield
    await indexer.stop()
    await engine.close()


app = FastAPI(
    title="topchoice search-service",
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    docs_url="/docs",
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def _locale(request: Request) -> str:
    header = request.headers.get("accept-language", "ar")
    first = header.split(",")[0].strip().split("-")[0].lower()
    return "en" if first == "en" else "ar"


# --------------------------------------------------------------------- health


@app.get("/health/live", include_in_schema=False)
async def live() -> dict[str, str]:
    return {"status": "UP"}


@app.get("/health/ready", include_in_schema=False)
async def ready() -> dict[str, Any]:
    try:
        health = await engine.health()
    except Exception as exc:  # noqa: BLE001
        # OpenSearch هو مخزن البحث نفسه — سقوطه يعني عدم الجاهزية
        raise HTTPException(status_code=503, detail={"status": "DOWN", "reason": str(exc)}) from exc
    return {"status": "UP", "opensearch": health, "indexer": indexer.stats}


# --------------------------------------------------------------------- search


@app.get("/api/v1/search")
async def search(
    request: Request,
    q: Annotated[str | None, Query(max_length=200)] = None,
    category: Annotated[str | None, Query(max_length=64)] = None,
    brand: Annotated[list[str] | None, Query()] = None,
    tag: Annotated[list[str] | None, Query()] = None,
    min_price: Annotated[int | None, Query(ge=0)] = None,
    max_price: Annotated[int | None, Query(ge=0)] = None,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    in_stock: Annotated[bool, Query()] = False,
    page: Annotated[int, Query(ge=0, le=400)] = 0,
    size: Annotated[int, Query(ge=1)] = 24,
    sort: Annotated[str, Query(pattern="^(relevance|price_asc|price_desc|rating|newest|popularity)$")] = "relevance",
) -> dict[str, Any]:
    """
    بحث المنتجات مع الفلاتر والـ facets.

    الحد الأقصى للصفحات مقصود: الترقيم العميق مكلف جدًا في محركات البحث
    الموزّعة، والمستخدم الحقيقي لا يتجاوز الصفحات الأولى.
    """
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(status_code=400, detail={
            "code": "INVALID_PRICE_RANGE",
            "message": "min_price cannot exceed max_price",
        })

    size = min(size, settings.max_page_size)

    try:
        return await engine.search(
            query=q,
            locale=_locale(request),
            page=page,
            size=size,
            sort=sort,
            category=category,
            brands=brand,
            min_price=min_price,
            max_price=max_price,
            min_rating=min_rating,
            in_stock_only=in_stock,
            tags=tag,
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("search failed")
        raise HTTPException(status_code=503, detail={
            "code": "SEARCH_UNAVAILABLE",
            "message": "Search is temporarily unavailable",
        }) from exc


@app.get("/api/v1/search/suggest")
async def suggest(
    request: Request,
    q: Annotated[str, Query(min_length=2, max_length=64)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> dict[str, Any]:
    """إكمال تلقائي أثناء الكتابة — يجب أن يبقى تحت 50ms."""
    try:
        items = await engine.suggest(q, _locale(request), limit)
    except Exception:  # noqa: BLE001
        log.warning("suggest failed for q=%r", q)
        # الاقتراحات تحسين لا ضرورة: نعيد قائمة فارغة بدل خطأ
        items = []
    return {"query": q, "suggestions": items}


# ------------------------------------------------------------- admin/indexing


@app.post("/api/v1/search/admin/reindex", include_in_schema=False)
async def reindex(request: Request) -> dict[str, Any]:
    """
    إعادة إنشاء الفهرس. الاستخدام الحقيقي: تغيير الـ mapping.
    الخطوات الآمنة في الإنتاج: فهرس جديد ← إعادة تشغيل أحداث Kafka ← تبديل alias.
    """
    if not request.headers.get("x-internal-caller"):
        raise HTTPException(status_code=403, detail={"code": "INTERNAL_ONLY"})
    await engine.ensure_index()
    return {"status": "ok", "index": settings.opensearch_index, "stats": indexer.stats}
