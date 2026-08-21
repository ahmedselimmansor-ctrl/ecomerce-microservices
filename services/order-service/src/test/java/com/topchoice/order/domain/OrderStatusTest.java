package com.topchoice.order.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * آلة حالات الطلب.
 *
 * <p>هذه الاختبارات ليست تغطية شكلية: الـ Saga تتلقى أحداثًا من Kafka بضمان
 * «مرة واحدة على الأقل»، أي أن الحدث المكرر والحدث المتأخر واردان دائمًا.
 * آلة الحالات هي ما يمنع حدثًا متأخرًا من إرجاع طلب مُسلَّم إلى «قيد الانتظار».
 */
class OrderStatusTest {

    @Nested
    @DisplayName("المسار السعيد")
    class HappyPath {

        @Test
        @DisplayName("PENDING → AWAITING_PAYMENT → CONFIRMED → PROCESSING → SHIPPED → DELIVERED")
        void fullLifecycleIsAllowed() {
            assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.AWAITING_PAYMENT)).isTrue();
            assertThat(OrderStatus.AWAITING_PAYMENT.canTransitionTo(OrderStatus.CONFIRMED)).isTrue();
            assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.PROCESSING)).isTrue();
            assertThat(OrderStatus.PROCESSING.canTransitionTo(OrderStatus.SHIPPED)).isTrue();
            assertThat(OrderStatus.SHIPPED.canTransitionTo(OrderStatus.DELIVERED)).isTrue();
        }
    }

    @Nested
    @DisplayName("تكرار الأحداث")
    class Idempotency {

        /**
         * Kafka يسلّم «مرة واحدة على الأقل». إعادة تسليم نفس الحدث يجب أن
         * تُقبل بلا أثر، لا أن تُرفض كانتقال غير قانوني — وإلا امتلأ الـ DLQ
         * بأحداث سليمة.
         */
        @ParameterizedTest
        @EnumSource(OrderStatus.class)
        @DisplayName("الانتقال إلى نفس الحالة مسموح دائمًا")
        void selfTransitionIsAlwaysAllowed(OrderStatus status) {
            assertThat(status.canTransitionTo(status)).isTrue();
        }
    }

    @Nested
    @DisplayName("الحالات النهائية")
    class TerminalStates {

        @ParameterizedTest
        @EnumSource(value = OrderStatus.class, names = {"DELIVERED", "CANCELLED", "REFUNDED"})
        void areMarkedTerminal(OrderStatus status) {
            assertThat(status.isTerminal()).isTrue();
        }

        @ParameterizedTest
        @EnumSource(value = OrderStatus.class,
                names = {"PENDING", "AWAITING_PAYMENT", "CONFIRMED", "PROCESSING", "SHIPPED"})
        void othersAreNotTerminal(OrderStatus status) {
            assertThat(status.isTerminal()).isFalse();
        }

        /**
         * الطلب الملغى نهاية مطلقة. لو سمحنا بالخروج منه لأمكن لحدث دفع متأخر
         * أن يؤكّد طلبًا حُرّر مخزونه بالفعل — فنبيع ما لا نملك.
         */
        @ParameterizedTest
        @EnumSource(OrderStatus.class)
        @DisplayName("CANCELLED لا يخرج إلى أي حالة أخرى")
        void cancelledIsAbsorbing(OrderStatus target) {
            if (target == OrderStatus.CANCELLED) {
                return;
            }
            assertThat(OrderStatus.CANCELLED.canTransitionTo(target)).isFalse();
        }

        @ParameterizedTest
        @EnumSource(OrderStatus.class)
        @DisplayName("REFUNDED لا يخرج إلى أي حالة أخرى")
        void refundedIsAbsorbing(OrderStatus target) {
            if (target == OrderStatus.REFUNDED) {
                return;
            }
            assertThat(OrderStatus.REFUNDED.canTransitionTo(target)).isFalse();
        }
    }

    @Nested
    @DisplayName("الانتقالات الممنوعة")
    class ForbiddenTransitions {

        /**
         * القفزة التي يحاولها المشرف عادةً من لوحة التحكم. الرفض هنا هو ما
         * يجعل اختبار لوحة التحكم يتوقّع 409 — والمسار الصحيح يمرّ بالتجهيز
         * والشحن، وإلا فقدنا أثر الطلب المادي.
         */
        @Test
        @DisplayName("CONFIRMED لا يقفز إلى DELIVERED")
        void confirmedCannotJumpToDelivered() {
            assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.DELIVERED)).isFalse();
        }

        @Test
        @DisplayName("لا رجوع إلى الخلف")
        void noBackwardTransitions() {
            assertThat(OrderStatus.SHIPPED.canTransitionTo(OrderStatus.PROCESSING)).isFalse();
            assertThat(OrderStatus.PROCESSING.canTransitionTo(OrderStatus.CONFIRMED)).isFalse();
            assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.AWAITING_PAYMENT)).isFalse();
            assertThat(OrderStatus.AWAITING_PAYMENT.canTransitionTo(OrderStatus.PENDING)).isFalse();
        }

        @Test
        @DisplayName("لا دفع قبل حجز المخزون")
        void pendingCannotBeConfirmedDirectly() {
            assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.CONFIRMED)).isFalse();
        }

        /**
         * الشحنة غادرت المستودع فعلًا — الإلغاء بعدها مسار استرداد لا إلغاء،
         * ويمرّ عبر DELIVERED ثم REFUNDED.
         */
        @Test
        @DisplayName("الشحنة المغادرة لا تُلغى")
        void shippedCannotBeCancelled() {
            assertThat(OrderStatus.SHIPPED.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
        }
    }

    @Nested
    @DisplayName("مسارات التعويض")
    class Compensation {

        /**
         * فشل الدفع أو نفاد المخزون يجب أن يجد طريقًا إلى الإلغاء من كل حالة
         * قبل الشحن — وإلا علقت الـ Saga بلا مخرج.
         */
        @ParameterizedTest
        @EnumSource(value = OrderStatus.class,
                names = {"PENDING", "AWAITING_PAYMENT", "CONFIRMED", "PROCESSING"})
        @DisplayName("كل حالة قبل الشحن تقبل الإلغاء")
        void preShipmentStatesCanCancel(OrderStatus status) {
            assertThat(status.canTransitionTo(OrderStatus.CANCELLED)).isTrue();
        }

        @Test
        @DisplayName("الاسترداد من CONFIRMED أو DELIVERED فقط")
        void refundOnlyAfterPayment() {
            assertThat(OrderStatus.CONFIRMED.canTransitionTo(OrderStatus.REFUNDED)).isTrue();
            assertThat(OrderStatus.DELIVERED.canTransitionTo(OrderStatus.REFUNDED)).isTrue();

            // لم يُدفع شيء بعد، فلا شيء يُسترد
            assertThat(OrderStatus.PENDING.canTransitionTo(OrderStatus.REFUNDED)).isFalse();
            assertThat(OrderStatus.AWAITING_PAYMENT.canTransitionTo(OrderStatus.REFUNDED)).isFalse();
        }
    }
}
