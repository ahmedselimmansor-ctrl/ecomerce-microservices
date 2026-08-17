package com.topchoice.payment.gateway;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * بوابة دفع وهمية للتطوير والاختبار.
 *
 * <p>ترفض نسبة من العمليات عمدًا ({@code mock-failure-rate}) حتى يُختبر مسار
 * التعويض في الـ Saga فعليًا بدل أن يبقى كودًا لا يمرّ به أحد.
 *
 * <p>البديل في الإنتاج: {@code StripeGateway} أو {@code CheckoutGateway}
 * بمفاتيح من Secrets Manager. لا تُخزَّن بيانات البطاقات عندنا إطلاقًا —
 * tokenization لدى المزوّد فقط، وهذا ما يبقي نطاق PCI-DSS في أضيق حدوده.
 */
@Component
@ConditionalOnProperty(name = "topchoice.gateway.provider", havingValue = "mock", matchIfMissing = true)
public class MockPaymentGateway implements PaymentGateway {

    private static final Logger log = LoggerFactory.getLogger(MockPaymentGateway.class);

    private final SecureRandom random = new SecureRandom();
    private final double failureRate;
    private final long latencyMs;

    public MockPaymentGateway(@Value("${topchoice.gateway.mock-failure-rate:0.1}") double failureRate,
                              @Value("${topchoice.gateway.mock-latency-ms:250}") long latencyMs) {
        this.failureRate = failureRate;
        this.latencyMs = latencyMs;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public AuthorizationResult authorize(AuthorizationRequest request) {
        simulateLatency();

        // الدفع عند الاستلام لا يمر ببوابة أصلًا — يُعتمد فورًا
        if ("COD".equals(request.method())) {
            return AuthorizationResult.approved("cod_" + shortRef());
        }

        if (request.amountMinor() > 5_000_000L) {
            return AuthorizationResult.declined("AMOUNT_LIMIT_EXCEEDED",
                    "Amount exceeds the per-transaction limit");
        }

        if (random.nextDouble() < failureRate) {
            String code = random.nextBoolean() ? "INSUFFICIENT_FUNDS" : "CARD_DECLINED";
            log.info("mock gateway declining order={} code={}", request.orderId(), code);
            return AuthorizationResult.declined(code, "The payment was declined by the issuer");
        }

        return AuthorizationResult.approved("ch_" + shortRef());
    }

    @Override
    public CaptureResult capture(String providerRef, long amountMinor) {
        simulateLatency();
        return new CaptureResult(true, providerRef, null);
    }

    @Override
    public void voidAuthorization(String providerRef) {
        simulateLatency();
        log.info("mock gateway voided {}", providerRef);
    }

    @Override
    public RefundResult refund(String providerRef, long amountMinor, String reason) {
        simulateLatency();
        return new RefundResult(true, "re_" + shortRef(), null);
    }

    private String shortRef() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 20);
    }

    private void simulateLatency() {
        if (latencyMs <= 0) {
            return;
        }
        try {
            Thread.sleep(latencyMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
