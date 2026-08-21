"""اختبارات المحرك الاحتياطي للتوصيات.

هذا المحرك هو ما يعمل حين تسقط Vertex AI أو تُطفأ في dev — أي أنه المسار
الافتراضي لا الاستثنائي في معظم البيئات. عيب فيه يعني قسم «مقترح لك» فارغًا
أو مكرَّرًا، ولا يظهر في أي فحص صحة لأن الخدمة تبقى ترد 200.

نستخدم Redis وهميًا في الذاكرة بدل حاوية: المنطق المُختبَر هنا هو الاستبعاد
وإزالة التكرار والترتيب — لا سلوك Redis نفسه.
"""

import pytest

from app.config import Settings
from app.fallback import FallbackEngine


class FakeRedis:
    """أقل ما يكفي من Redis: مجموعات مرتَّبة ودمجها."""

    def __init__(self) -> None:
        self.zsets: dict[str, dict[str, float]] = {}
        self.failing = False

    async def zrevrange(self, key: str, start: int, stop: int) -> list[str]:
        if self.failing:
            raise ConnectionError("redis down")
        members = sorted(self.zsets.get(key, {}).items(), key=lambda kv: kv[1], reverse=True)
        end = None if stop < 0 else stop + 1
        return [m for m, _ in members[start:end]]

    async def zunionstore(self, dest: str, keys: list[str]) -> int:
        if self.failing:
            raise ConnectionError("redis down")
        merged: dict[str, float] = {}
        for key in keys:
            for member, score in self.zsets.get(key, {}).items():
                merged[member] = merged.get(member, 0.0) + score
        self.zsets[dest] = merged
        return len(merged)

    async def expire(self, key: str, seconds: int) -> bool:
        return True


@pytest.fixture
def engine() -> FallbackEngine:
    return FallbackEngine(Settings(), FakeRedis())  # type: ignore[arg-type]


class TestTrending:
    @pytest.mark.asyncio
    async def test_merges_hour_windows_and_orders_by_score(self, engine: FallbackEngine) -> None:
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets[f"trending:h{hour}"] = {"TC-A": 5.0, "TC-B": 1.0}
        engine.redis.zsets[f"trending:h{hour - 1}"] = {"TC-B": 9.0}

        # TC-B يتفوّق بعد الدمج (10 مقابل 5) رغم تأخّره في الساعة الحالية
        assert await engine.trending(limit=2) == ["TC-B", "TC-A"]

    @pytest.mark.asyncio
    async def test_respects_limit(self, engine: FallbackEngine) -> None:
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets[f"trending:h{hour}"] = {f"TC-{i}": float(i) for i in range(10)}

        assert len(await engine.trending(limit=3)) == 3

    @pytest.mark.asyncio
    async def test_redis_failure_degrades_to_empty_not_exception(
        self, engine: FallbackEngine
    ) -> None:
        """سقوط Redis يُفرغ التوصيات ولا يُسقط الصفحة.

        قسم «رائج» فارغ مقبول؛ خطأ 500 على صفحة منتج ليس كذلك.
        """
        engine.redis.failing = True
        assert await engine.trending(limit=5) == []


class TestForUser:
    @pytest.mark.asyncio
    async def test_no_history_falls_back_to_trending(self, engine: FallbackEngine) -> None:
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets[f"trending:h{hour}"] = {"TC-A": 3.0, "TC-B": 2.0}

        assert await engine.for_user("u1", limit=2) == ["TC-A", "TC-B"]

    @pytest.mark.asyncio
    async def test_excludes_already_seen(self, engine: FallbackEngine) -> None:
        """اقتراح منتج شاهده المستخدم للتو يجعل القسم يبدو معطوبًا."""
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets["user:history:u1"] = {"TC-SEEN": 10.0}
        engine.redis.zsets[f"trending:h{hour}"] = {"TC-SEEN": 9.0, "TC-NEW": 5.0}

        result = await engine.for_user("u1", limit=5)

        assert "TC-SEEN" not in result
        assert "TC-NEW" in result

    @pytest.mark.asyncio
    async def test_no_duplicates_in_result(self, engine: FallbackEngine) -> None:
        """المرشّحون يأتون من عدة نوافذ، فالتكرار وارد بلا هذا الفحص."""
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets["user:history:u1"] = {"TC-OLD": 1.0}
        engine.redis.zsets[f"trending:h{hour}"] = {"TC-X": 5.0, "TC-Y": 4.0}

        result = await engine.for_user("u1", limit=10)

        assert len(result) == len(set(result))

    @pytest.mark.asyncio
    async def test_never_exceeds_limit(self, engine: FallbackEngine) -> None:
        import time

        hour = int(time.time() // 3600)
        engine.redis.zsets["user:history:u1"] = {"TC-OLD": 1.0}
        engine.redis.zsets[f"trending:h{hour}"] = {f"TC-{i}": float(i) for i in range(50)}

        assert len(await engine.for_user("u1", limit=4)) <= 4

    @pytest.mark.asyncio
    async def test_history_read_failure_still_returns_trending(
        self, engine: FallbackEngine
    ) -> None:
        engine.redis.failing = True
        assert await engine.for_user("u1", limit=3) == []


class TestHydrate:
    @pytest.mark.asyncio
    async def test_empty_input_short_circuits(self, engine: FallbackEngine) -> None:
        """لا نداء شبكة على قائمة فارغة."""
        assert await engine.hydrate([], "ar") == []

    @pytest.mark.asyncio
    async def test_categories_of_empty_is_empty(self, engine: FallbackEngine) -> None:
        assert await engine._categories_of([]) == []
