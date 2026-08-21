package com.topchoice.inventory.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * محاسبة المخزون.
 *
 * <p>المعادلة الحاكمة: {@code available = onHand - reserved}. كل عملية هنا
 * يجب أن تُبقيها صحيحة وتُبقي الطرفين غير سالبين. كسرها يعني إمّا بيع ما لا
 * نملك، أو حجز كمية لا يُفرج عنها أبدًا.
 */
class StockItemTest {

    private StockItem stock(int onHand) {
        return new StockItem("TC-APL-IP15-128-BLK", "CAI-1", onHand);
    }

    @Nested
    @DisplayName("الحجز")
    class Reserve {

        @Test
        @DisplayName("الحجز ينقص المتاح ولا يمسّ الموجود")
        void reserveReducesAvailableNotOnHand() {
            StockItem item = stock(100);

            item.reserve(30);

            assertThat(item.getOnHand()).isEqualTo(100);
            assertThat(item.getReserved()).isEqualTo(30);
            assertThat(item.available()).isEqualTo(70);
        }

        @Test
        @DisplayName("حجز كل المتاح مسموح")
        void reserveExactlyAvailable() {
            StockItem item = stock(10);

            item.reserve(10);

            assertThat(item.available()).isZero();
        }

        /**
         * الحدّ الذي يمنع البيع الزائد. بدونه يستطيع طلبان متزامنان حجز نفس
         * القطعة الأخيرة، ويُكتشف العجز عند التجهيز — بعد أن دفع العميلان.
         */
        @Test
        @DisplayName("لا حجز فوق المتاح")
        void cannotReserveBeyondAvailable() {
            StockItem item = stock(5);

            assertThatThrownBy(() -> item.reserve(6))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("insufficient stock");

            assertThat(item.getReserved()).isZero();
        }

        @Test
        @DisplayName("الحجز التراكمي محكوم بالمتاح المتبقي")
        void successiveReservesRespectRemaining() {
            StockItem item = stock(10);
            item.reserve(6);
            item.reserve(4);

            assertThatThrownBy(() -> item.reserve(1))
                    .isInstanceOf(IllegalStateException.class);

            assertThat(item.getReserved()).isEqualTo(10);
        }

        @Test
        @DisplayName("الكمية غير الموجبة مرفوضة")
        void rejectsNonPositive() {
            StockItem item = stock(10);

            assertThat(item.canReserve(0)).isFalse();
            assertThat(item.canReserve(-5)).isFalse();
        }
    }

    @Nested
    @DisplayName("الإفراج")
    class Release {

        @Test
        @DisplayName("الإفراج يعيد الكمية إلى المتاح")
        void releaseRestoresAvailability() {
            StockItem item = stock(100);
            item.reserve(40);

            item.release(40);

            assertThat(item.getReserved()).isZero();
            assertThat(item.available()).isEqualTo(100);
        }

        /**
         * التعويض في Saga قد يصل مرتين (تسليم Kafka «مرة على الأقل»). الإفراج
         * المكرر يجب أن يتوقّف عند الصفر لا أن يجعل المحجوز سالبًا — وإلا صار
         * المتاح أكبر من الموجود فبعنا هواءً.
         */
        @Test
        @DisplayName("الإفراج المكرر لا يجعل المحجوز سالبًا")
        void doubleReleaseClampsAtZero() {
            StockItem item = stock(50);
            item.reserve(10);

            item.release(10);
            item.release(10);

            assertThat(item.getReserved()).isZero();
            assertThat(item.available()).isEqualTo(50);
        }
    }

    @Nested
    @DisplayName("تأكيد البيع")
    class Commit {

        @Test
        @DisplayName("التأكيد يخرج الكمية من المحجوز ومن الموجود معًا")
        void commitDecrementsBoth() {
            StockItem item = stock(100);
            item.reserve(6);

            item.commit(6);

            assertThat(item.getOnHand()).isEqualTo(94);
            assertThat(item.getReserved()).isZero();
            assertThat(item.available()).isEqualTo(94);
        }

        @Test
        @DisplayName("التأكيد محكوم بالمحجوز فعلًا")
        void commitCappedAtReserved() {
            StockItem item = stock(100);
            item.reserve(5);

            item.commit(50);

            assertThat(item.getOnHand()).isEqualTo(95);
            assertThat(item.getReserved()).isZero();
        }

        @Test
        @DisplayName("التأكيد بلا حجز سابق لا يفعل شيئًا")
        void commitWithoutReserveIsNoop() {
            StockItem item = stock(100);

            item.commit(10);

            assertThat(item.getOnHand()).isEqualTo(100);
            assertThat(item.getReserved()).isZero();
        }
    }

    @Nested
    @DisplayName("التعديل اليدوي")
    class ManualAdjustment {

        @Test
        @DisplayName("إعادة التوريد تزيد الموجود والمتاح")
        void restockAddsStock() {
            StockItem item = stock(10);
            item.reserve(4);

            item.restock(20);

            assertThat(item.getOnHand()).isEqualTo(30);
            assertThat(item.available()).isEqualTo(26);
        }

        /**
         * جرد أو تلف ينقص الموجود، لكن الكمية المحجوزة تخصّ طلبات جارية دفع
         * أصحابها بالفعل. النزول تحتها يعني إلغاء طلبات مؤكّدة.
         */
        @Test
        @DisplayName("التخفيض لا ينزل تحت المحجوز")
        void reduceNeverGoesBelowReserved() {
            StockItem item = stock(100);
            item.reserve(30);

            item.reduceOnHand(90);

            assertThat(item.getOnHand()).isGreaterThanOrEqualTo(item.getReserved());
            assertThat(item.available()).isGreaterThanOrEqualTo(0);
        }
    }

    @Nested
    @DisplayName("ثابت المحاسبة")
    class Invariant {

        /**
         * تسلسل يحاكي دورة حياة كاملة بمسارَي نجاح وتعويض، ويتحقّق من الثابت
         * بعد كل خطوة.
         */
        @Test
        @DisplayName("available = onHand − reserved يصمد عبر دورة كاملة")
        void invariantHoldsThroughFullCycle() {
            StockItem item = stock(50);
            assertInvariant(item);

            item.reserve(20);
            assertInvariant(item);

            item.commit(20);            // طلب نجح
            assertInvariant(item);

            item.reserve(10);
            assertInvariant(item);

            item.release(10);           // طلب فشل فعُوِّض
            assertInvariant(item);

            item.restock(100);
            assertInvariant(item);

            assertThat(item.getOnHand()).isEqualTo(130);
            assertThat(item.getReserved()).isZero();
        }

        private void assertInvariant(StockItem item) {
            assertThat(item.available()).isEqualTo(item.getOnHand() - item.getReserved());
            assertThat(item.getOnHand()).isGreaterThanOrEqualTo(0);
            assertThat(item.getReserved()).isGreaterThanOrEqualTo(0);
        }
    }
}
