"""
تكامل Vertex AI Search for commerce (‏Retail API).

نماذج التقديم المستخدمة (serving configs):
  * ``recommended-for-you`` — «مقترح لك» على الصفحة الرئيسية
  * ``similar-items``       — «منتجات مشابهة» في صفحة المنتج
  * ``search`` مع التخصيص   — إعادة ترتيب نتائج البحث لكل مستخدم

التصميم هنا محكوم بقاعدة واحدة: **التوصيات ليست حرجة**. أي فشل أو تأخّر
يسقط تلقائيًا إلى البديل المحلي، لأن صفحة منتج بلا قسم «مقترح لك» أفضل
بكثير من صفحة منتج لا تُحمَّل.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.api_core import client_options as client_options_lib
from google.api_core.exceptions import GoogleAPICallError, RetryError
from google.auth.exceptions import GoogleAuthError
from google.cloud import retail_v2

from .config import Settings

log = logging.getLogger(__name__)

# أخطاء نعدّها «تعذّر التخصيص» لا خللًا في الخدمة: انتهاء مهلة، رفض صلاحية،
# غياب اعتماد ADC أصلًا. جميعها تنتهي بالسقوط إلى المحرك الاحتياطي.
_RECOVERABLE = (GoogleAPICallError, GoogleAuthError, RetryError)

# Retail يفرض قائمة مغلقة لأنواع الأحداث، ولا يقبل اسمًا خارجها. ما لا مقابل
# له نخفضه إلى أقرب حدث مقبول بدل ترقيته: تحويل «قائمة الأمنيات» إلى
# add-to-cart كان سيرفع معدّل التحويل الظاهري ويُفسد النموذج الذي يتعلّم منه.
_EVENT_TYPES: dict[str, str] = {
    "view": "detail-page-view",
    "wishlist": "detail-page-view",
    "add_to_cart": "add-to-cart",
}

# Retail يشترط visitor_id غير فارغ في كل طلب تنبؤ. للزائر غير المسجّل لا
# نملك هوية، ونتيجته مخزّنة في Redis عند المستدعي ومشتركة بين كل الزوار
# أصلًا — فدمجهم تحت هوية واحدة لا يخسر تخصيصًا غير موجود.
_ANONYMOUS_VISITOR = "anonymous"


class RetailClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._prediction: retail_v2.PredictionServiceClient | None = None
        self._search: retail_v2.SearchServiceClient | None = None
        self._events: retail_v2.UserEventServiceClient | None = None

        options = None
        if settings.retail_api_endpoint:
            options = client_options_lib.ClientOptions(
                api_endpoint=settings.retail_api_endpoint
            )

        if not settings.gcp_project_id:
            # لا مشروع ⇒ لا محاولة اتصال. هذا هو وضع التطوير المحلي الافتراضي،
            # وليس خطأ يستحق تحذيرًا في كل إقلاع.
            return

        if settings.retail_serving_config_user or settings.retail_serving_config_related:
            try:
                self._prediction = retail_v2.PredictionServiceClient(client_options=options)
                log.info("Vertex AI Search for commerce prediction client initialised")
            except Exception:  # noqa: BLE001
                log.exception("failed to init Retail prediction client — using local fallback")

        if settings.retail_serving_config_ranking:
            try:
                self._search = retail_v2.SearchServiceClient(client_options=options)
            except Exception:  # noqa: BLE001
                log.exception("failed to init Retail search client")

        if settings.retail_user_events_enabled:
            try:
                self._events = retail_v2.UserEventServiceClient(client_options=options)
            except Exception:  # noqa: BLE001
                log.exception("failed to init Retail user-event client")

    @property
    def enabled(self) -> bool:
        return self._prediction is not None

    # ------------------------------------------------------------- resources

    def _catalog(self) -> str:
        return (
            f"projects/{self.settings.gcp_project_id}"
            f"/locations/{self.settings.retail_location}"
            f"/catalogs/{self.settings.retail_catalog}"
        )

    def _placement(self, serving_config: str) -> str:
        return f"{self._catalog()}/{self.settings.retail_placement}/{serving_config}"

    # ----------------------------------------------------------- inference

    def recommend_for_user(self, user_id: str, limit: int) -> list[str] | None:
        """يعيد قائمة sku، أو ``None`` إن تعذّر — فيتولى المستدعي البديل."""
        if not self._prediction or not self.settings.retail_serving_config_user:
            return None
        try:
            response = self._prediction.predict(
                request=retail_v2.PredictRequest(
                    placement=self._placement(self.settings.retail_serving_config_user),
                    user_event=retail_v2.UserEvent(
                        event_type="home-page-view",
                        visitor_id=user_id,
                        user_info=retail_v2.UserInfo(user_id=user_id),
                    ),
                    page_size=limit,
                ),
                timeout=self.settings.retail_timeout_seconds,
                # محاولة واحدة فقط: إعادة المحاولة تعني تجاوز ميزانية زمن الاستجابة
                retry=None,
            )
            return [result.id for result in response.results]
        except _RECOVERABLE as exc:
            log.warning("retail predict for-you failed: %s", exc)
            return None

    def related_items(self, sku: str, user_id: str | None, limit: int) -> list[str] | None:
        if not self._prediction or not self.settings.retail_serving_config_related:
            return None
        try:
            event = retail_v2.UserEvent(
                event_type="detail-page-view",
                visitor_id=user_id or _ANONYMOUS_VISITOR,
                # المنتج المعروض هو سياق النموذج كله: بدونه يعيد similar-items
                # توصيات عامة لا علاقة لها بالصفحة المفتوحة.
                product_details=[
                    retail_v2.ProductDetail(product=retail_v2.Product(id=sku))
                ],
            )
            if user_id:
                # تمرير المستخدم يجعل «المشابه» مخصّصًا لا عامًا
                event.user_info = retail_v2.UserInfo(user_id=user_id)

            response = self._prediction.predict(
                request=retail_v2.PredictRequest(
                    placement=self._placement(self.settings.retail_serving_config_related),
                    user_event=event,
                    page_size=limit,
                ),
                timeout=self.settings.retail_timeout_seconds,
                retry=None,
            )
            return [result.id for result in response.results]
        except _RECOVERABLE as exc:
            log.warning("retail predict related-items failed: %s", exc)
            return None

    def rerank(self, user_id: str, skus: list[str]) -> list[str] | None:
        """
        إعادة ترتيب نتائج البحث حسب تفضيلات المستخدم.

        لا يعرض Retail نداءً يأخذ قائمة جاهزة ويعيدها مرتّبة. البديل المعتمد
        هو بحث محصور بمعرّفات القائمة مع تفعيل التخصيص، فيتولّى النموذج
        الترتيب داخل هذا الحصر.
        """
        if not self._search or not self.settings.retail_serving_config_ranking or not skus:
            return None

        # المعرّفات تُحقن في تعبير نصّي، ومعرّف يحمل علامة اقتباس يكسر التعبير
        # كله. نسقط الشاذ بدل إفشال الطلب بأكمله.
        window = [sku for sku in skus[:500] if '"' not in sku and "\\" not in sku]
        if not window:
            return None

        try:
            response = self._search.search(
                request=retail_v2.SearchRequest(
                    placement=self._placement(self.settings.retail_serving_config_ranking),
                    visitor_id=user_id,
                    user_info=retail_v2.UserInfo(user_id=user_id),
                    query="",
                    filter='id: ANY("' + '","'.join(window) + '")',
                    page_size=len(window),
                    personalization_spec=retail_v2.SearchRequest.PersonalizationSpec(
                        mode=retail_v2.SearchRequest.PersonalizationSpec.Mode.AUTO,
                    ),
                ),
                timeout=self.settings.retail_timeout_seconds,
                retry=None,
            )
            allowed = set(window)
            ranked = [
                result.id for result in response.results if result.id in allowed
            ]
        except _RECOVERABLE as exc:
            log.warning("retail rerank failed: %s", exc)
            return None

        if not ranked:
            return None

        # منتج لم يدخل فهرس Retail بعد يختفي من نتيجة البحث. العقد مع المستدعي
        # أن يستعيد قائمته كاملة مرتّبة، لا مقتطعة، فنُلحق الغائبين بترتيبهم
        # الأصلي في الذيل — أسوأ حالة ترتيب غير مخصّص، لا نتائج ناقصة.
        seen = set(ranked)
        ranked.extend(sku for sku in window if sku not in seen)
        return ranked

    # -------------------------------------------------------------- events

    def track(self, user_id: str | None, session_id: str, event_type: str,
              sku: str | None, timestamp: float) -> None:
        """
        بثّ تفاعل المستخدم إلى Retail User Events.

        يُستدعى بعد إرسال الرد للمستخدم — التتبّع لا يجوز أن يبطّئ التصفّح.
        """
        if not self._events:
            return

        retail_event_type = _EVENT_TYPES.get(event_type)
        if not retail_event_type:
            # ‏search يشترط searchQuery و purchase يشترط
            # purchaseTransaction.revenue، وكلاهما لا يصل إلى هذه الطبقة.
            # إرسال حدث ناقص يرفضه الـ API ويملأ السجل بأخطاء بلا فائدة؛
            # صاحب البيانات هو من ينشرهما (search-service و order-service).
            # المحرك الاحتياطي يسجّل التفاعلين محليًا في كل الأحوال، فلا
            # تضيع إشارتهما على حساب الرواج.
            log.debug("event type %s has no Retail equivalent — skipped", event_type)
            return

        # ‏visitor_id هوية الجلسة و user_info.user_id هوية الحساب: الفصل
        # بينهما هو ما يسمح لـ Retail بربط تصفّح الزائر بحسابه بعد الدخول.
        event = retail_v2.UserEvent(
            event_type=retail_event_type,
            visitor_id=session_id,
            event_time=datetime.fromtimestamp(timestamp, tz=timezone.utc),
        )
        if user_id:
            event.user_info = retail_v2.UserInfo(user_id=user_id)
        if sku:
            event.product_details = [
                retail_v2.ProductDetail(product=retail_v2.Product(id=sku))
            ]

        try:
            self._events.write_user_event(
                request=retail_v2.WriteUserEventRequest(
                    parent=self._catalog(),
                    user_event=event,
                ),
                timeout=self.settings.retail_timeout_seconds,
                retry=None,
            )
        except _RECOVERABLE as exc:
            log.debug("retail write_user_event failed: %s", exc)
