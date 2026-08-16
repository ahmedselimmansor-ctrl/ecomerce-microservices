package com.noon.payment.gateway;

/**
 * واجهة مزوّد الدفع.
 *
 * <p>الفصل هنا متعمّد: تبديل Stripe بـ Checkout.com أو Tabby يجب أن يكون
 * تغيير implementation واحد، لا إعادة كتابة منطق الطلبات.
 */
public interface PaymentGateway {

    String name();

    /** حجز المبلغ دون خصمه. */
    AuthorizationResult authorize(AuthorizationRequest request);

    /** الخصم الفعلي بعد تجهيز الشحنة. */
    CaptureResult capture(String providerRef, long amountMinor);

    /** إلغاء تفويض لم يُخصم بعد. */
    void voidAuthorization(String providerRef);

    RefundResult refund(String providerRef, long amountMinor, String reason);

    record AuthorizationRequest(
            String idempotencyKey,
            String orderId,
            String userId,
            long amountMinor,
            String currency,
            String method) {
    }

    record AuthorizationResult(boolean approved, String providerRef,
                               String failureCode, String failureMessage) {

        public static AuthorizationResult approved(String ref) {
            return new AuthorizationResult(true, ref, null, null);
        }

        public static AuthorizationResult declined(String code, String message) {
            return new AuthorizationResult(false, null, code, message);
        }
    }

    record CaptureResult(boolean success, String providerRef, String failureCode) {
    }

    record RefundResult(boolean success, String providerRef, String failureCode) {
    }
}
