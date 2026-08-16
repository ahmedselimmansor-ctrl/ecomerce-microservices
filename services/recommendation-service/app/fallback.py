"""
محرك التوصيات الاحتياطي.

يعمل عندما لا تكون حملة Personalize متاحة — وهذا ليس استثناءً نادرًا:
في الأسابيع الأولى لأي متجر لا توجد بيانات تفاعل كافية لتدريب نموذج
(مشكلة الانطلاق البارد). هذا المحرك يغطي تلك الفترة وأي انقطاع لاحق.

الاستراتيجية:
  * «مقترح لك»  → الأكثر رواجًا في الأقسام التي تصفّحها المستخدم
  * «مشابه»      → منتجات نفس القسم مرتّبة بالرواج
  * الرواج       → Redis Sorted Set بنافذة زمنية متدحرجة
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from redis.asyncio import Redis

from .config import Settings

log = logging.getLogger(__name__)

# أوزان التفاعلات: الشراء إشارة أقوى بكثير من مجرد المشاهدة
EVENT_WEIGHTS: dict[str, float] = {
    "view": 1.0,
    "search": 0.5,
    "wishlist": 3.0,
    "add_to_cart": 5.0,
    "purchase": 15.0,
}


class FallbackEngine:
    def __init__(self, settings: Settings, redis: Redis) -> None:
        self.settings = settings
        self.redis = redis
        self._http = httpx.AsyncClient(
            base_url=settings.catalog_url,
            timeout=httpx.Timeout(2.0, connect=0.8),
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=16),
        )

    async def close(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------- tracking

    async def record_interaction(
        self, user_id: str | None, sku: str | None, event_type: str,
        category: str | None = None,
    ) -> None:
        """يسجّل التفاعل في Redis لتغذية الرواج وسجل تصفّح المستخدم."""
        weight = EVENT_WEIGHTS.get(event_type, 1.0)
        pipe = self.redis.pipeline()

        if sku:
            # نافذة متدحرجة: مفتاح لكل ساعة، والرواج = مجموع آخر N ساعة
            hour_bucket = int(time.time() // 3600)
            key = f"trending:h{hour_bucket}"
            pipe.zincrby(key, weight, sku)
            pipe.expire(key, self.settings.trending_window_hours * 3600 + 3600)

            if category:
                cat_key = f"trending:cat:{category}:h{hour_bucket}"
                pipe.zincrby(cat_key, weight, sku)
                pipe.expire(cat_key, self.settings.trending_window_hours * 3600 + 3600)

        if user_id and sku:
            history_key = f"user:history:{user_id}"
            pipe.zadd(history_key, {sku: time.time()})
            # نحتفظ بآخر 100 تفاعل فقط
            pipe.zremrangebyrank(history_key, 0, -101)
            pipe.expire(history_key, 60 * 60 * 24 * 30)

        try:
            await pipe.execute()
        except Exception:  # noqa: BLE001
            log.warning("failed recording interaction", exc_info=True)

    # ------------------------------------------------------ recommendations

    async def trending(self, limit: int, category: str | None = None) -> list[str]:
        """الأكثر رواجًا خلال النافذة الزمنية، بدمج مفاتيح الساعات."""
        now_hour = int(time.time() // 3600)
        prefix = f"trending:cat:{category}:h" if category else "trending:h"
        keys = [f"{prefix}{now_hour - i}" for i in range(self.settings.trending_window_hours)]

        dest = f"trending:agg:{category or 'all'}"
        try:
            # ZUNIONSTORE يدمج نوافذ الساعات في ترتيب واحد
            await self.redis.zunionstore(dest, keys)
            await self.redis.expire(dest, 300)
            return await self.redis.zrevrange(dest, 0, limit - 1)
        except Exception:  # noqa: BLE001
            log.warning("trending computation failed", exc_info=True)
            return []

    async def for_user(self, user_id: str, limit: int) -> list[str]:
        """
        اقتراحات لمستخدم: الرائج في الأقسام التي تفاعل معها،
        مستبعدًا ما شاهده بالفعل.
        """
        try:
            seen: list[str] = await self.redis.zrevrange(f"user:history:{user_id}", 0, 49)
        except Exception:  # noqa: BLE001
            seen = []

        if not seen:
            return await self.trending(limit)

        categories = await self._categories_of(seen[:10])
        candidates: list[str] = []
        for category in categories[:3]:
            candidates.extend(await self.trending(limit, category))

        if len(candidates) < limit:
            candidates.extend(await self.trending(limit * 2))

        seen_set = set(seen)
        result: list[str] = []
        for sku in candidates:
            if sku not in seen_set and sku not in result:
                result.append(sku)
            if len(result) >= limit:
                break
        return result

    async def related(self, sku: str, limit: int) -> list[str]:
        """منتجات مشابهة: نستعير منطق «نفس القسم» من الكتالوج."""
        try:
            response = await self._http.get(
                f"/api/v1/products/{sku}/similar", params={"limit": limit}
            )
            if response.status_code == 200:
                return [item["sku"] for item in response.json()]
        except httpx.HTTPError:
            log.warning("catalog similar lookup failed for %s", sku)
        return await self.trending(limit)

    # ---------------------------------------------------------------- utils

    async def _categories_of(self, skus: list[str]) -> list[str]:
        """أقسام مجموعة منتجات، مرتّبة بالتكرار."""
        if not skus:
            return []
        try:
            response = await self._http.post("/api/v1/products/bulk", json={"skus": skus})
            if response.status_code != 200:
                return []
            counts: dict[str, int] = {}
            for item in response.json():
                # الملخّص لا يحمل مسار القسم، لذا نستخدم الوسوم كبديل تقريبي
                for tag in item.get("tags") or []:
                    counts[tag] = counts.get(tag, 0) + 1
            return sorted(counts, key=lambda k: counts[k], reverse=True)
        except httpx.HTTPError:
            return []

    async def hydrate(self, skus: list[str], locale: str) -> list[dict[str, Any]]:
        """تحويل قائمة sku إلى بطاقات منتجات كاملة، مع الحفاظ على الترتيب."""
        if not skus:
            return []
        try:
            response = await self._http.post(
                "/api/v1/products/bulk",
                json={"skus": skus},
                headers={"accept-language": locale},
            )
            if response.status_code != 200:
                return []
            by_sku = {item["sku"]: item for item in response.json()}
            # ترتيب التوصية هو المهم — لا ترتيب قاعدة البيانات
            return [by_sku[sku] for sku in skus if sku in by_sku]
        except httpx.HTTPError:
            log.warning("hydrate failed")
            return []
