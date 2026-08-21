"""بناء استعلامات OpenSearch وتنفيذها."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from opensearchpy import (
    AsyncOpenSearch,
    AuthorizationException,
    NotFoundError,
    RequestError,
)

from .config import Settings
from .index_mapping import FACET_FIELDS, INDEX_SETTINGS

log = logging.getLogger(__name__)

SORT_MAP: dict[str, list[Any]] = {
    "relevance": ["_score", {"popularity": "desc"}],
    "price_asc": [{"priceMinor": "asc"}],
    "price_desc": [{"priceMinor": "desc"}],
    "rating": [{"rating": "desc"}, {"ratingCount": "desc"}],
    "newest": [{"updatedAt": "desc"}],
    "popularity": [{"popularity": "desc"}],
}


class SearchEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.index = settings.opensearch_index

        auth = None
        if settings.opensearch_user and settings.opensearch_password:
            auth = (settings.opensearch_user, settings.opensearch_password)

        self.client = AsyncOpenSearch(
            hosts=[settings.opensearch_url],
            http_auth=auth,
            use_ssl=settings.opensearch_url.startswith("https"),
            verify_certs=False,
            ssl_show_warn=False,
            timeout=settings.search_timeout_seconds,
            max_retries=2,
            retry_on_timeout=True,
        )

    async def close(self) -> None:
        await self.client.close()

    async def ensure_index(self, attempts: int = 10, delay_seconds: float = 3.0) -> bool:
        """
        ينشئ الفهرس إن لم يوجد.

        نعيد المحاولة لأن OpenSearch قد يستغرق عشرات الثواني قبل أن يقبل
        الطلبات؛ الفشل الصامت هنا يعني خدمة بحث تعمل فوق فهرس غير موجود.
        في الإنتاج تُدار الفهارس بـ index templates + alias switching.
        """
        for attempt in range(1, attempts + 1):
            try:
                if await self.client.indices.exists(index=self.index):
                    return True
                await self.client.indices.create(index=self.index, body=INDEX_SETTINGS)
                log.info("created index %s", self.index)
                return True
            except AuthorizationException as exc:
                # ليست حالة عابرة: إعادة المحاولة عشر مرات لن تغيّر شيئًا،
                # فنفشل فورًا برسالة تقول ما العمل بدل أن نُغرق السجل.
                log.error(
                    "إنشاء الفهرس %s محجوب (403). السبب الأشيع أن OpenSearch رفع "
                    "cluster.blocks.create_index بعد امتلاء القرص — وهي كتلة دائمة "
                    "لا تُرفع تلقائيًا بعد تحرير المساحة. الحل: فرّغ القرص ثم "
                    'PUT _cluster/settings {"persistent":{"cluster.blocks.create_index":null}} '
                    "ثم احذف الفهرس ليُعاد إنشاؤه بالخريطة الصريحة. التفاصيل: %s",
                    self.index,
                    exc,
                )
                return False
            except RequestError as exc:
                # 400 resource_already_exists — نسخة أخرى سبقتنا، وهذا مقبول
                if getattr(exc, "error", "") == "resource_already_exists_exception":
                    return True
                log.warning("index creation rejected (attempt %d/%d): %s", attempt, attempts, exc)
            except Exception as exc:  # noqa: BLE001
                log.warning("opensearch not ready (attempt %d/%d): %s", attempt, attempts, exc)
            await asyncio.sleep(delay_seconds)

        log.error("giving up creating index %s after %d attempts", self.index, attempts)
        return False

    # ------------------------------------------------------------------ write

    async def upsert(self, doc: dict[str, Any]) -> None:
        """
        الفهرسة بمعرّف = sku تجعل العملية idempotent: إعادة تسليم نفس الحدث
        من Kafka تكتب فوق المستند بدل إنشاء نسخة ثانية.
        """
        await self.client.index(index=self.index, id=doc["sku"], body=doc, refresh=False)

    async def bulk_upsert(self, docs: list[dict[str, Any]]) -> int:
        if not docs:
            return 0
        body: list[dict[str, Any]] = []
        for doc in docs:
            body.append({"index": {"_index": self.index, "_id": doc["sku"]}})
            body.append(doc)
        result = await self.client.bulk(body=body, refresh=False)
        if result.get("errors"):
            failed = [
                item["index"]
                for item in result["items"]
                if item.get("index", {}).get("error")
            ]
            log.error("bulk indexing had %d failures: %s", len(failed), failed[:3])
        return len(docs)

    async def delete(self, sku: str) -> None:
        try:
            await self.client.delete(index=self.index, id=sku, refresh=False)
        except NotFoundError:
            pass

    # ------------------------------------------------------------------- read

    async def search(
        self,
        query: str | None,
        locale: str,
        page: int,
        size: int,
        sort: str,
        category: str | None = None,
        brands: list[str] | None = None,
        min_price: int | None = None,
        max_price: int | None = None,
        min_rating: float | None = None,
        in_stock_only: bool = False,
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        title_field = "titleAr" if locale == "ar" else "titleEn"
        other_field = "titleEn" if locale == "ar" else "titleAr"

        must: list[dict[str, Any]] = []
        if query:
            must.append(
                {
                    "multi_match": {
                        "query": query,
                        # الترجيح: العنوان بلغة المستخدم أولًا، ثم اللغة الأخرى
                        "fields": [
                            f"{title_field}^4",
                            f"{other_field}^2",
                            "brandName^3",
                            "tags^1.5",
                        ],
                        "type": "best_fields",
                        # يتسامح مع الأخطاء الإملائية بلا إغراق النتائج
                        "fuzziness": "AUTO",
                        "prefix_length": 1,
                        "operator": "and",
                    }
                }
            )
        else:
            must.append({"match_all": {}})

        # الفلاتر في `filter` لا `must`: لا تؤثر على الترتيب وتُخزَّن في filter cache
        filters: list[dict[str, Any]] = [{"term": {"status": "ACTIVE"}}]
        if category:
            filters.append({"term": {"categoryPath": category}})
        if brands:
            filters.append({"terms": {"brandName": brands}})
        if in_stock_only:
            filters.append({"term": {"inStock": True}})
        if tags:
            filters.append({"terms": {"tags": tags}})
        if min_price is not None or max_price is not None:
            price_range: dict[str, int] = {}
            if min_price is not None:
                price_range["gte"] = min_price
            if max_price is not None:
                price_range["lte"] = max_price
            filters.append({"range": {"priceMinor": price_range}})
        if min_rating is not None:
            filters.append({"range": {"rating": {"gte": min_rating}}})

        body: dict[str, Any] = {
            "query": {
                "function_score": {
                    "query": {"bool": {"must": must, "filter": filters}},
                    # الشعبية ترفع النتائج ذات الطلب العالي دون أن تطغى على الصلة
                    "functions": [
                        {
                            "field_value_factor": {
                                "field": "popularity",
                                "factor": 0.3,
                                "modifier": "log1p",
                                "missing": 0,
                            }
                        }
                    ],
                    "boost_mode": "sum",
                }
            },
            "from": page * size,
            "size": size,
            "sort": SORT_MAP.get(sort, SORT_MAP["relevance"]),
            "track_total_hits": 10_000,
            "aggs": self._facet_aggregations(),
            "_source": {"excludes": ["attributes"]},
        }

        try:
            result = await self.client.search(index=self.index, body=body)
        except NotFoundError:
            # الفهرس غير موجود بعد (أول إقلاع أو بعد إعادة بناء) — ننشئه
            # ونعيد نتيجة فارغة بدل خطأ يُسقط صفحة البحث
            log.warning("index %s missing during search — creating it", self.index)
            await self.ensure_index(attempts=1, delay_seconds=0)
            return self._empty(page, size)

        return self._format_results(result, page, size)

    @staticmethod
    def _empty(page: int, size: int) -> dict[str, Any]:
        return {
            "items": [], "page": page, "size": size, "totalItems": 0,
            "totalPages": 0, "hasNext": False, "facets": {}, "tookMs": 0,
        }

    async def suggest(self, prefix: str, locale: str, limit: int) -> list[dict[str, Any]]:
        field = "titleAr.suggest" if locale == "ar" else "titleEn.suggest"
        title = "titleAr" if locale == "ar" else "titleEn"

        body = {
            "query": {
                "bool": {
                    "must": [{"match": {field: {"query": prefix, "operator": "and"}}}],
                    "filter": [{"term": {"status": "ACTIVE"}}],
                }
            },
            "size": limit,
            "_source": ["sku", "slug", title, "image", "priceMinor", "currency", "brandName"],
            "sort": ["_score", {"popularity": "desc"}],
        }
        try:
            result = await self.client.search(index=self.index, body=body)
        except NotFoundError:
            return []
        return [
            {
                "sku": hit["_source"]["sku"],
                "slug": hit["_source"].get("slug"),
                "title": hit["_source"].get(title),
                "image": hit["_source"].get("image"),
                "priceMinor": hit["_source"].get("priceMinor"),
                "currency": hit["_source"].get("currency"),
                "brandName": hit["_source"].get("brandName"),
            }
            for hit in result["hits"]["hits"]
        ]

    async def health(self) -> dict[str, Any]:
        info = await self.client.cluster.health(index=self.index)
        return {"status": info.get("status"), "nodes": info.get("number_of_nodes")}

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _facet_aggregations() -> dict[str, Any]:
        aggs: dict[str, Any] = {
            display: {"terms": {"field": field, "size": 20}}
            for field, display in FACET_FIELDS.items()
        }
        aggs["price_stats"] = {"stats": {"field": "priceMinor"}}
        aggs["price_ranges"] = {
            "range": {
                "field": "priceMinor",
                "ranges": [
                    {"key": "under_100", "to": 10_000},
                    {"key": "100_500", "from": 10_000, "to": 50_000},
                    {"key": "500_1000", "from": 50_000, "to": 100_000},
                    {"key": "1000_5000", "from": 100_000, "to": 500_000},
                    {"key": "over_5000", "from": 500_000},
                ],
            }
        }
        return aggs

    @staticmethod
    def _format_results(result: dict[str, Any], page: int, size: int) -> dict[str, Any]:
        hits = result["hits"]
        total = hits["total"]["value"] if isinstance(hits["total"], dict) else hits["total"]

        items = [{**hit["_source"], "_score": hit["_score"]} for hit in hits["hits"]]

        facets: dict[str, Any] = {}
        for name, agg in (result.get("aggregations") or {}).items():
            if "buckets" in agg:
                facets[name] = [
                    {"value": b["key"], "count": b["doc_count"]} for b in agg["buckets"]
                ]
            else:
                facets[name] = agg

        total_pages = (total + size - 1) // size if size else 0
        return {
            "items": items,
            "page": page,
            "size": size,
            "totalItems": total,
            "totalPages": total_pages,
            "hasNext": page + 1 < total_pages,
            "facets": facets,
            "tookMs": result.get("took"),
        }
