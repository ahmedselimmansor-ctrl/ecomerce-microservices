"""
تكامل Amazon Personalize.

الوصفات المستخدمة:
  * ``aws-user-personalization-v2`` — «مقترح لك» على الصفحة الرئيسية
  * ``aws-similar-items``           — «منتجات مشابهة» في صفحة المنتج
  * ``aws-personalized-ranking``    — إعادة ترتيب نتائج البحث لكل مستخدم

التصميم هنا محكوم بقاعدة واحدة: **التوصيات ليست حرجة**. أي فشل أو تأخّر
يسقط تلقائيًا إلى البديل المحلي، لأن صفحة منتج بلا قسم «مقترح لك» أفضل
بكثير من صفحة منتج لا تُحمَّل.
"""

from __future__ import annotations

import logging
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from .config import Settings

log = logging.getLogger(__name__)


class PersonalizeClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._runtime: Any | None = None
        self._events: Any | None = None

        boto_config = BotoConfig(
            region_name=settings.aws_region,
            connect_timeout=settings.personalize_timeout_seconds,
            read_timeout=settings.personalize_timeout_seconds,
            # محاولة واحدة فقط: إعادة المحاولة تعني تجاوز ميزانية زمن الاستجابة
            retries={"max_attempts": 1, "mode": "standard"},
        )

        if settings.personalize_campaign_user or settings.personalize_campaign_related:
            try:
                kwargs: dict[str, Any] = {"config": boto_config}
                if settings.aws_endpoint_url:
                    kwargs["endpoint_url"] = settings.aws_endpoint_url
                self._runtime = boto3.client("personalize-runtime", **kwargs)
                log.info("Amazon Personalize runtime initialised")
            except Exception:  # noqa: BLE001
                log.exception("failed to init personalize-runtime — using local fallback")

        if settings.personalize_tracking_id:
            try:
                kwargs = {"config": boto_config}
                if settings.aws_endpoint_url:
                    kwargs["endpoint_url"] = settings.aws_endpoint_url
                self._events = boto3.client("personalize-events", **kwargs)
            except Exception:  # noqa: BLE001
                log.exception("failed to init personalize-events")

    @property
    def enabled(self) -> bool:
        return self._runtime is not None

    # ----------------------------------------------------------- inference

    def recommend_for_user(self, user_id: str, limit: int) -> list[str] | None:
        """يعيد قائمة sku، أو ``None`` إن تعذّر — فيتولى المستدعي البديل."""
        if not self._runtime or not self.settings.personalize_campaign_user:
            return None
        try:
            response = self._runtime.get_recommendations(
                campaignArn=self.settings.personalize_campaign_user,
                userId=user_id,
                numResults=limit,
            )
            return [item["itemId"] for item in response.get("itemList", [])]
        except (ClientError, BotoCoreError) as exc:
            log.warning("personalize get_recommendations failed: %s", exc)
            return None

    def related_items(self, sku: str, user_id: str | None, limit: int) -> list[str] | None:
        if not self._runtime or not self.settings.personalize_campaign_related:
            return None
        try:
            params: dict[str, Any] = {
                "campaignArn": self.settings.personalize_campaign_related,
                "itemId": sku,
                "numResults": limit,
            }
            if user_id:
                # تمرير المستخدم يجعل «المشابه» مخصّصًا لا عامًا
                params["userId"] = user_id
            response = self._runtime.get_recommendations(**params)
            return [item["itemId"] for item in response.get("itemList", [])]
        except (ClientError, BotoCoreError) as exc:
            log.warning("personalize related_items failed: %s", exc)
            return None

    def rerank(self, user_id: str, skus: list[str]) -> list[str] | None:
        """إعادة ترتيب نتائج البحث حسب تفضيلات المستخدم."""
        if not self._runtime or not self.settings.personalize_campaign_ranking or not skus:
            return None
        try:
            response = self._runtime.get_personalized_ranking(
                campaignArn=self.settings.personalize_campaign_ranking,
                userId=user_id,
                inputList=skus[:500],
            )
            return [item["itemId"] for item in response.get("personalizedRanking", [])]
        except (ClientError, BotoCoreError) as exc:
            log.warning("personalize rerank failed: %s", exc)
            return None

    # -------------------------------------------------------------- events

    def track(self, user_id: str | None, session_id: str, event_type: str,
              sku: str | None, timestamp: float) -> None:
        """
        بثّ تفاعل المستخدم إلى Personalize Event Tracker.

        يُستدعى بعد إرسال الرد للمستخدم — التتبّع لا يجوز أن يبطّئ التصفّح.
        """
        if not self._events or not self.settings.personalize_tracking_id:
            return
        try:
            properties = {"itemId": sku} if sku else {}
            self._events.put_events(
                trackingId=self.settings.personalize_tracking_id,
                userId=user_id or session_id,
                sessionId=session_id,
                eventList=[{
                    "eventType": event_type,
                    "sentAt": timestamp,
                    "properties": str(properties).replace("'", '"'),
                }],
            )
        except (ClientError, BotoCoreError) as exc:
            log.debug("personalize put_events failed: %s", exc)
