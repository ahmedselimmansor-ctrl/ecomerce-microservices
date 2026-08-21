"""اختبارات محرك البحث — الأجزاء النقية منه.

نختبر تشكيل النتائج وتعريف الـ facets دون OpenSearch: هذه هي الطبقة التي
تُترجم رد المحرك إلى عقد الـ API، وأي انزلاق فيها يظهر كترقيم صفحات خاطئ أو
فلاتر فارغة — وهو ما لا يمسكه اختبار تكامل يفحص رمز الحالة فقط.
"""

from app.index_mapping import FACET_FIELDS
from app.search_engine import SearchEngine


def _hits(count: int, total: int) -> dict:
    return {
        "took": 7,
        "hits": {
            "total": {"value": total, "relation": "eq"},
            "hits": [
                {
                    "_score": 1.5 - i * 0.1,
                    "_source": {"sku": f"TC-{i}", "title": f"منتج {i}", "priceMinor": 1000 * i},
                }
                for i in range(count)
            ],
        },
    }


class TestFormatResults:
    def test_maps_source_and_score(self) -> None:
        out = SearchEngine._format_results(_hits(2, 2), page=0, size=20)

        assert len(out["items"]) == 2
        assert out["items"][0]["sku"] == "TC-0"
        # الدرجة تُرفع إلى مستوى العنصر حتى تستطيع الواجهة الترتيب أو التشخيص
        assert out["items"][0]["_score"] == 1.5
        assert out["tookMs"] == 7

    def test_total_pages_rounds_up(self) -> None:
        """21 نتيجة على 20 لكل صفحة = صفحتان لا واحدة.

        القسمة الصحيحة وحدها كانت ستُخفي النتيجة الحادية والعشرين تمامًا.
        """
        out = SearchEngine._format_results(_hits(20, 21), page=0, size=20)
        assert out["totalPages"] == 2
        assert out["hasNext"] is True

    def test_exact_multiple_has_no_extra_page(self) -> None:
        out = SearchEngine._format_results(_hits(20, 40), page=1, size=20)
        assert out["totalPages"] == 2
        assert out["hasNext"] is False  # الصفحة 1 هي الأخيرة (صفرية الأساس)

    def test_empty_result(self) -> None:
        out = SearchEngine._format_results(_hits(0, 0), page=0, size=20)
        assert out["items"] == []
        assert out["totalItems"] == 0
        assert out["totalPages"] == 0
        assert out["hasNext"] is False

    def test_zero_size_does_not_divide_by_zero(self) -> None:
        out = SearchEngine._format_results(_hits(0, 10), page=0, size=0)
        assert out["totalPages"] == 0

    def test_accepts_plain_total(self) -> None:
        """بعض إصدارات المحرك تُعيد `total` رقمًا لا كائنًا."""
        raw = _hits(1, 1)
        raw["hits"]["total"] = 1
        out = SearchEngine._format_results(raw, page=0, size=20)
        assert out["totalItems"] == 1

    def test_buckets_become_value_count_pairs(self) -> None:
        raw = _hits(1, 1)
        raw["aggregations"] = {
            "brand": {"buckets": [{"key": "Apple", "doc_count": 5}, {"key": "Sony", "doc_count": 2}]},
            "price_stats": {"min": 100, "max": 900},
        }
        out = SearchEngine._format_results(raw, page=0, size=20)

        assert out["facets"]["brand"] == [
            {"value": "Apple", "count": 5},
            {"value": "Sony", "count": 2},
        ]
        # التجميعات الإحصائية تمرّ كما هي — لا buckets فيها
        assert out["facets"]["price_stats"] == {"min": 100, "max": 900}

    def test_missing_aggregations_gives_empty_facets(self) -> None:
        out = SearchEngine._format_results(_hits(1, 1), page=0, size=20)
        assert out["facets"] == {}


class TestFacetAggregations:
    def test_covers_every_declared_facet(self) -> None:
        aggs = SearchEngine._facet_aggregations()
        for display in FACET_FIELDS.values():
            assert display in aggs, f"facet مفقود: {display}"

    def test_aggregates_on_the_mapped_field(self) -> None:
        """الحقل المُجمَّع عليه يجب أن يكون المُعرَّف في الخريطة.

        هذا بالضبط ما انكسر في الإنتاج: بُني الفهرس ديناميكيًا بحقول text،
        والتجميع على text مرفوض في OpenSearch — فرجع البحث 503.
        """
        aggs = SearchEngine._facet_aggregations()
        for field, display in FACET_FIELDS.items():
            assert aggs[display]["terms"]["field"] == field

    def test_price_ranges_are_contiguous(self) -> None:
        ranges = SearchEngine._facet_aggregations()["price_ranges"]["range"]["ranges"]
        # كل نطاق يبدأ حيث انتهى سابقه: فجوة تعني منتجات لا تظهر في أي فلتر
        for previous, current in zip(ranges, ranges[1:], strict=False):
            assert current["from"] == previous["to"]

    def test_price_ranges_cover_both_ends(self) -> None:
        ranges = SearchEngine._facet_aggregations()["price_ranges"]["range"]["ranges"]
        assert "from" not in ranges[0]   # مفتوح من الأسفل
        assert "to" not in ranges[-1]    # مفتوح من الأعلى
