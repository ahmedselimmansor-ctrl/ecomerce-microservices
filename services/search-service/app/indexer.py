"""
مزامنة فهرس البحث من Kafka.

<p>الفهرس ليس مصدر الحقيقة — MongoDB هي. لذلك نستهلك أحداث الكتالوج ونعيد
البناء عند الحاجة. هذا هو سبب اختيار Kafka بدل SQS: القدرة على إعادة تشغيل
الأحداث من البداية (replay) لبناء فهرس جديد دون لمس قاعدة البيانات.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiokafka import AIOKafkaConsumer

from .config import Settings
from .search_engine import SearchEngine

log = logging.getLogger(__name__)

BATCH_SIZE = 100
BATCH_TIMEOUT_SECONDS = 2.0


class CatalogIndexer:
    def __init__(self, settings: Settings, engine: SearchEngine) -> None:
        self.settings = settings
        self.engine = engine
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None
        self.stats = {"indexed": 0, "deleted": 0, "skipped": 0, "errors": 0}

    async def start(self) -> None:
        if not self.settings.kafka_enabled:
            log.warning("kafka indexing disabled — search index will not auto-update")
            return

        self._consumer = AIOKafkaConsumer(
            self.settings.kafka_topic_catalog,
            bootstrap_servers=self.settings.kafka_bootstrap_servers,
            group_id=self.settings.kafka_group_id,
            auto_offset_reset="earliest",
            enable_auto_commit=True,
            auto_commit_interval_ms=5_000,
            max_poll_records=BATCH_SIZE,
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume_loop())
        log.info("indexer consuming %s", self.settings.kafka_topic_catalog)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._consumer:
            await self._consumer.stop()

    async def _consume_loop(self) -> None:
        assert self._consumer is not None
        try:
            while True:
                # الفهرسة الدفعية أسرع بمراتب من مستند-بمستند على OpenSearch
                batches = await self._consumer.getmany(
                    timeout_ms=int(BATCH_TIMEOUT_SECONDS * 1000),
                    max_records=BATCH_SIZE,
                )
                to_index: list[dict[str, Any]] = []
                to_delete: list[str] = []

                # المفتاح (TopicPartition) لا يُستعمل — نستهلك القيم فقط
                for messages in batches.values():
                    for message in messages:
                        try:
                            event = json.loads(message.value)
                        except (ValueError, TypeError):
                            log.error("malformed message at offset %s", message.offset)
                            self.stats["errors"] += 1
                            continue

                        event_type = event.get("eventType", "")
                        payload = event.get("payload") or {}

                        if event_type == "catalog.product.upserted":
                            doc = self._to_document(payload)
                            if doc is None:
                                self.stats["skipped"] += 1
                            elif doc.get("status") == "ACTIVE":
                                to_index.append(doc)
                            else:
                                # منتج أُلغي تفعيله يُحذف من الفهرس لا يُحدَّث
                                to_delete.append(doc["sku"])
                        elif event_type == "catalog.product.deleted":
                            sku = payload.get("sku")
                            if sku:
                                to_delete.append(sku)

                if to_index:
                    count = await self.engine.bulk_upsert(to_index)
                    self.stats["indexed"] += count

                for sku in to_delete:
                    await self.engine.delete(sku)
                self.stats["deleted"] += len(to_delete)

                if to_index or to_delete:
                    log.info(
                        "indexed=%d deleted=%d (total indexed=%d)",
                        len(to_index), len(to_delete), self.stats["indexed"],
                    )

        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("indexer loop crashed — restarting in 5s")
            await asyncio.sleep(5)
            self._task = asyncio.create_task(self._consume_loop())

    @staticmethod
    def _to_document(payload: dict[str, Any]) -> dict[str, Any] | None:
        """تحويل حدث الكتالوج إلى مستند البحث. `None` يعني حمولة غير صالحة."""
        sku = payload.get("sku")
        if not sku:
            return None

        price = payload.get("priceMinor")
        images = payload.get("images") or []

        return {
            "sku": sku,
            "slug": payload.get("slug"),
            "titleAr": payload.get("titleAr") or payload.get("titleEn") or sku,
            "titleEn": payload.get("titleEn") or payload.get("titleAr") or sku,
            "brandId": payload.get("brandId"),
            "brandName": payload.get("brandName"),
            "categoryPath": payload.get("categoryPath") or [],
            "priceMinor": price if isinstance(price, int) else 0,
            "wasMinor": payload.get("wasMinor"),
            "currency": payload.get("currency") or "AED",
            "image": images[0] if images else None,
            "rating": payload.get("rating") or 0.0,
            "ratingCount": payload.get("ratingCount") or 0,
            "attributes": payload.get("attributes") or {},
            "tags": payload.get("tags") or [],
            "inStock": True,
            # الشعبية تُحسب لاحقًا من أحداث التفاعل؛ التقييم بديل مبدئي معقول
            "popularity": float(payload.get("ratingCount") or 0),
            "status": payload.get("status") or "ACTIVE",
            "updatedAt": payload.get("updatedAt"),
        }
