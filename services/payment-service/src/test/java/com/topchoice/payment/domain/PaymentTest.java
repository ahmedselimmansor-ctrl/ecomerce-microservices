package com.topchoice.payment.domain;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * حالة الدفع ومعناها في الـ Saga.
 *
 * <p>{@code isSettled} و{@code isRefundable} ليسا حقلين محفوظين بل استنتاجًا من
 * الحالة. هذا مقصود: حقل محفوظ منفصل يمكن أن يتعارض مع الحالة بعد تحديث
 * جزئي، ويصبح لدينا دفعة «فاشلة وقابلة للاسترداد» في آن واحد.
 */
class PaymentTest {

    private Payment payment() {
        return new Payment(UUID.randomUUID(), UUID.randomUUID(), 1_250_50L,
                "EGP", "CARD", "mock");
    }

    @Nested
    @DisplayName("الحالة الابتدائية")
    class Initial {

        @Test
        @DisplayName("الدفعة تبدأ REQUIRES_AUTH")
        void startsRequiringAuth() {
            Payment p = payment();

            assertThat(p.getStatus()).isEqualTo(Payment.REQUIRES_AUTH);
            assertThat(p.isSettled()).isFalse();
            assertThat(p.isRefundable()).isFalse();
        }

        @Test
        @DisplayName("المبلغ يُحفظ بالوحدة الصغرى كما هو")
        void amountKeptInMinorUnits() {
            assertThat(payment().getAmountMinor()).isEqualTo(1_250_50L);
        }
    }

    @Nested
    @DisplayName("المسار الناجح")
    class Success {

        @Test
        @DisplayName("التفويض يسجّل مرجع البوابة ويجعل الدفعة مستقرة")
        void authorizeSettles() {
            Payment p = payment();

            p.markAuthorized("auth_ref_123");

            assertThat(p.getStatus()).isEqualTo(Payment.AUTHORIZED);
            assertThat(p.getProviderRef()).isEqualTo("auth_ref_123");
            assertThat(p.isSettled()).isTrue();
            assertThat(p.isRefundable()).isTrue();
        }

        @Test
        @DisplayName("التحصيل بعد التفويض")
        void captureAfterAuthorize() {
            Payment p = payment();
            p.markAuthorized("auth_ref_123");

            p.markCaptured("capture_ref_456");

            assertThat(p.getStatus()).isEqualTo(Payment.CAPTURED);
            assertThat(p.getProviderRef()).isEqualTo("capture_ref_456");
            assertThat(p.isSettled()).isTrue();
        }

        /**
         * بعض البوابات لا تعطي مرجعًا جديدًا عند التحصيل. محو المرجع القديم
         * بقيمة فارغة يفقدنا الرابط الوحيد بين دفعتنا وسجل البوابة — وهو ما
         * نحتاجه عند التسوية أو النزاع.
         */
        @Test
        @DisplayName("التحصيل بلا مرجع يحافظ على مرجع التفويض")
        void captureWithNullRefKeepsExistingRef() {
            Payment p = payment();
            p.markAuthorized("auth_ref_123");

            p.markCaptured(null);

            assertThat(p.getProviderRef()).isEqualTo("auth_ref_123");
            assertThat(p.getStatus()).isEqualTo(Payment.CAPTURED);
        }
    }

    @Nested
    @DisplayName("مسارات الفشل والتعويض")
    class Failure {

        @Test
        @DisplayName("الفشل يسجّل رمزه ولا يجعل الدفعة مستقرة")
        void failureRecordsCode() {
            Payment p = payment();

            p.markFailed("INSUFFICIENT_FUNDS");

            assertThat(p.getStatus()).isEqualTo(Payment.FAILED);
            assertThat(p.getFailureCode()).isEqualTo("INSUFFICIENT_FUNDS");
            assertThat(p.isSettled()).isFalse();
            assertThat(p.isRefundable()).isFalse();
        }

        /**
         * إعادة المحاولة بعد فشل عابر يجب أن تمحو رمز الفشل السابق، وإلا بقيت
         * دفعة ناجحة تحمل رمز فشل قديم فيبدو التقرير المالي مضطربًا.
         */
        @Test
        @DisplayName("التفويض بعد فشل يمحو رمز الفشل")
        void reauthorizeClearsFailureCode() {
            Payment p = payment();
            p.markFailed("NETWORK_TIMEOUT");

            p.markAuthorized("auth_retry_789");

            assertThat(p.getFailureCode()).isNull();
            assertThat(p.isSettled()).isTrue();
        }

        @Test
        @DisplayName("الإبطال يُنهي الدفعة بلا استرداد")
        void voidEndsPayment() {
            Payment p = payment();
            p.markAuthorized("auth_ref_123");

            p.markVoided();

            assertThat(p.getStatus()).isEqualTo(Payment.VOIDED);
            assertThat(p.isSettled()).isFalse();
            assertThat(p.isRefundable()).isFalse();
        }

        @Test
        @DisplayName("المستردة لا تُسترد مرة أخرى")
        void refundedIsNotRefundableAgain() {
            Payment p = payment();
            p.markAuthorized("auth_ref_123");
            p.markCaptured("cap_ref_456");

            p.markRefunded();

            assertThat(p.getStatus()).isEqualTo(Payment.REFUNDED);
            assertThat(p.isRefundable()).isFalse();
            assertThat(p.isSettled()).isFalse();
        }
    }
}
