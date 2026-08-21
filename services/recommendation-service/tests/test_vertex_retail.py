"""اختبارات تكامل Vertex AI Search for commerce.

المحور هنا ليس نجاح النداء بل **فشله**: هذه الخدمة تعمل في dev بلا اعتماد
Google إطلاقًا، وفي الإنتاج قد تسقط الواجهة أو تتجاوز ميزانية الزمن. العقد
المتفق عليه مع ``main.py`` أن كل دالة تُعيد ``None`` عند التعذّر لا أن ترفع
استثناءً — فيتولّى المحرك الاحتياطي الأمر وتبقى صفحة المنتج تعمل.

كسر هذا العقد لا يمسكه اختبار تكامل: الخدمة سترد 500 فقط حين تسقط Vertex،
أي في اللحظة التي لا نريد فيها عطلًا إضافيًا.
"""

import pytest
from google.api_core.exceptions import DeadlineExceeded, ServiceUnavailable

from app.config import Settings
from app.vertex_retail import RetailClient


@pytest.fixture
def disabled() -> RetailClient:
    """عميل بلا اعتماد — الحالة الافتراضية محليًا وفي dev."""
    return RetailClient(Settings(gcp_project_id="", retail_serving_config_user=""))


class TestDisabled:
    def test_reports_itself_disabled(self, disabled: RetailClient) -> None:
        assert disabled.enabled is False

    def test_recommend_returns_none_not_exception(self, disabled: RetailClient) -> None:
        assert disabled.recommend_for_user("u1", 10) is None

    def test_related_returns_none(self, disabled: RetailClient) -> None:
        assert disabled.related_items("TC-A", "u1", 10) is None

    def test_rerank_returns_none(self, disabled: RetailClient) -> None:
        assert disabled.rerank("u1", ["TC-A", "TC-B"]) is None

    def test_track_does_not_raise(self, disabled: RetailClient) -> None:
        """تتبّع التفاعلات يجب ألّا يُسقط طلبًا مهما كان حال Vertex."""
        from datetime import datetime, timezone

        disabled.track("u1", "s1", "detail-page-view", "TC-A", datetime.now(timezone.utc))


class _Boom:
    """عميل predict يفشل دائمًا بالخطأ المُعطى."""

    def __init__(self, error: Exception) -> None:
        self.error = error
        self.calls = 0

    def predict(self, **_: object) -> object:
        self.calls += 1
        raise self.error


class TestRecoverableFailures:
    """كل خطأ عابر يُترجم إلى None لا إلى استثناء يصعد للمستدعي."""

    @pytest.fixture
    def client(self) -> RetailClient:
        c = RetailClient(
            Settings(
                gcp_project_id="p",
                retail_serving_config_user="sc-user",
                retail_serving_config_related="sc-related",
            )
        )
        return c

    @pytest.mark.parametrize(
        "error",
        [
            ServiceUnavailable("retail down"),
            DeadlineExceeded("too slow"),
        ],
        ids=["unavailable", "deadline"],
    )
    def test_predict_failure_degrades(self, client: RetailClient, error: Exception) -> None:
        client._prediction = _Boom(error)  # type: ignore[assignment]

        assert client.recommend_for_user("u1", 5) is None
        assert client.related_items("TC-A", "u1", 5) is None

    def test_no_retry_on_timeout(self, client: RetailClient) -> None:
        """محاولة واحدة فقط.

        إعادة المحاولة داخل نداء له ميزانية زمن ضيقة تضاعف التأخير بدل أن
        تُنقذه — والصفحة تنتظر. الفشل السريع إلى الاحتياطي أفضل.
        """
        boom = _Boom(DeadlineExceeded("slow"))
        client._prediction = boom  # type: ignore[assignment]

        client.recommend_for_user("u1", 5)

        assert boom.calls == 1


class TestResourceNames:
    """أسماء موارد Retail طويلة ومتداخلة، وخطأ فيها يظهر كـ 404 غامض."""

    @pytest.fixture
    def client(self) -> RetailClient:
        return RetailClient(
            Settings(
                gcp_project_id="my-project",
                retail_location="global",
                retail_catalog="default_catalog",
                retail_placement="placements",
            )
        )

    def test_catalog_path(self, client: RetailClient) -> None:
        assert client._catalog() == (
            "projects/my-project/locations/global/catalogs/default_catalog"
        )

    def test_placement_path_includes_serving_config(self, client: RetailClient) -> None:
        assert client._placement("recently_viewed") == (
            "projects/my-project/locations/global/catalogs/default_catalog"
            "/placements/recently_viewed"
        )
