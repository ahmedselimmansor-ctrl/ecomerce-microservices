package com.noon.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.noon.payment.domain.Payment;
import com.noon.payment.domain.PaymentAudit;
import com.noon.payment.domain.ProcessedEvent;
import com.noon.payment.domain.Refund;
import com.noon.payment.error.ApiException;
import com.noon.payment.events.EventEnvelope;
import com.noon.payment.gateway.PaymentGateway;
import com.noon.payment.repository.*;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    private static final String CONSUMER = "payment-service";

    private final PaymentRepository payments;
    private final RefundRepository refunds;
    private final PaymentAuditRepository audit;
    private final ProcessedEventRepository processed;
    private final PaymentGateway gateway;
    private final KafkaTemplate<String, Object> kafka;
    private final ObjectMapper mapper;
    private final String paymentTopic;

    private final Counter authorizedCounter;
    private final Counter failedCounter;
    private final Timer gatewayTimer;

    public PaymentService(PaymentRepository payments, RefundRepository refunds,
                          PaymentAuditRepository audit, ProcessedEventRepository processed,
                          PaymentGateway gateway, KafkaTemplate<String, Object> kafka,
                          ObjectMapper mapper, MeterRegistry metrics,
                          @Value("${noon.topics.payment-events}") String paymentTopic) {
        this.payments = payments;
        this.refunds = refunds;
        this.audit = audit;
        this.processed = processed;
        this.gateway = gateway;
        this.kafka = kafka;
        this.mapper = mapper;
        this.paymentTopic = paymentTopic;
        this.authorizedCounter = Counter.builder("noon.payments")
                .tag("result", "authorized").register(metrics);
        this.failedCounter = Counter.builder("noon.payments")
                .tag("result", "failed").register(metrics);
        this.gatewayTimer = Timer.builder("noon.payment.gateway.duration")
                .tag("provider", gateway.name()).register(metrics);
    }

    /**
     * معالجة طلب دفع قادم من الـ Saga.
     *
     * <p>ترتيب متعمّد: نُثبّت صف الدفعة أولًا (بحالة {@code REQUIRES_AUTH})
     * <b>ثم</b> نستدعي المزوّد. لو سقطت الخدمة أثناء النداء الخارجي يبقى لدينا
     * أثر للتسوية بدل خصم بلا سجل.
     */
    @Transactional
    public void handlePaymentRequest(UUID orderId, UUID userId, long amountMinor,
                                     String currency, String method, String traceId) {

        // دفعة موجودة؟ إذن هذه إعادة تسليم — لا نخصم مرتين
        var existing = payments.findByOrderId(orderId);
        if (existing.isPresent()) {
            Payment p = existing.get();
            log.info("payment already exists for order={} status={} — replaying result",
                    orderId, p.getStatus());
            republishOutcome(p, traceId);
            return;
        }

        Payment payment = new Payment(orderId, userId, amountMinor, currency, method, gateway.name());
        try {
            payment = payments.saveAndFlush(payment);
        } catch (DataIntegrityViolationException e) {
            // سباق: نسخة أخرى أنشأت الدفعة في نفس اللحظة
            log.info("concurrent payment creation for order={} — deferring to the winner", orderId);
            payments.findByOrderId(orderId).ifPresent(p -> republishOutcome(p, traceId));
            return;
        }
        audit.save(new PaymentAudit(payment.getId(), null, Payment.REQUIRES_AUTH,
                "payment record created"));

        var request = new PaymentGateway.AuthorizationRequest(
                orderId.toString(), orderId.toString(), userId.toString(),
                amountMinor, currency, method);

        PaymentGateway.AuthorizationResult result;
        try {
            result = gatewayTimer.recordCallable(() -> gateway.authorize(request));
        } catch (Exception e) {
            log.error("gateway error for order={} — marking as failed", orderId, e);
            payment.markFailed("GATEWAY_ERROR");
            payments.save(payment);
            audit.save(new PaymentAudit(payment.getId(), Payment.REQUIRES_AUTH,
                    Payment.FAILED, e.toString()));
            failedCounter.increment();
            publish("payment.failed", orderId, failurePayload(payment, "GATEWAY_ERROR"), traceId);
            return;
        }

        if (result == null || !result.approved()) {
            String code = result == null ? "GATEWAY_ERROR" : result.failureCode();
            payment.markFailed(code);
            payments.save(payment);
            audit.save(new PaymentAudit(payment.getId(), Payment.REQUIRES_AUTH,
                    Payment.FAILED, result == null ? null : result.failureMessage()));
            failedCounter.increment();
            log.info("payment declined order={} code={}", orderId, code);
            publish("payment.failed", orderId, failurePayload(payment, code), traceId);
            return;
        }

        payment.markAuthorized(result.providerRef());
        payments.save(payment);
        audit.save(new PaymentAudit(payment.getId(), Payment.REQUIRES_AUTH,
                Payment.AUTHORIZED, "providerRef=" + result.providerRef()));
        authorizedCounter.increment();
        log.info("payment authorized order={} paymentId={} ref={}",
                orderId, payment.getId(), result.providerRef());
        publish("payment.authorized", orderId, successPayload(payment), traceId);
    }

    /** الخصم الفعلي — يُستدعى عند شحن الطلب. */
    @Transactional
    public void capture(UUID orderId, String traceId) {
        Payment payment = payments.findByOrderId(orderId)
                .orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "No payment for order"));
        if (Payment.CAPTURED.equals(payment.getStatus())) {
            return;
        }
        if (!Payment.AUTHORIZED.equals(payment.getStatus())) {
            throw ApiException.conflict("NOT_CAPTURABLE",
                    "Payment is " + payment.getStatus() + " and cannot be captured");
        }
        var result = gateway.capture(payment.getProviderRef(), payment.getAmountMinor());
        if (!result.success()) {
            throw ApiException.conflict("CAPTURE_FAILED", "Gateway refused the capture");
        }
        payment.markCaptured(result.providerRef());
        payments.save(payment);
        audit.save(new PaymentAudit(payment.getId(), Payment.AUTHORIZED, Payment.CAPTURED, null));
        publish("payment.captured", orderId, successPayload(payment), traceId);
    }

    /** تعويض Saga: إلغاء التفويض عند إلغاء الطلب قبل الشحن. */
    @Transactional
    public void voidPayment(UUID orderId, String traceId) {
        payments.findByOrderId(orderId).ifPresent(payment -> {
            if (!Payment.AUTHORIZED.equals(payment.getStatus())) {
                return;
            }
            try {
                gateway.voidAuthorization(payment.getProviderRef());
            } catch (Exception e) {
                log.error("void failed for order={} — needs manual reconciliation", orderId, e);
                return;
            }
            payment.markVoided();
            payments.save(payment);
            audit.save(new PaymentAudit(payment.getId(), Payment.AUTHORIZED,
                    Payment.VOIDED, "order cancelled"));
            publish("payment.voided", orderId, successPayload(payment), traceId);
        });
    }

    @Transactional
    public Refund refund(UUID orderId, long amountMinor, String reason, String traceId) {
        Payment payment = payments.findByOrderId(orderId)
                .orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "No payment for order"));
        if (!payment.isRefundable()) {
            throw ApiException.conflict("NOT_REFUNDABLE",
                    "Payment is " + payment.getStatus());
        }
        long alreadyRefunded = refunds.findByPaymentId(payment.getId()).stream()
                .filter(r -> "COMPLETED".equals(r.getStatus()))
                .mapToLong(Refund::getAmountMinor).sum();
        if (alreadyRefunded + amountMinor > payment.getAmountMinor()) {
            throw ApiException.badRequest("REFUND_EXCEEDS_PAYMENT",
                    "Refund total would exceed the original payment");
        }

        Refund refund = refunds.save(new Refund(payment.getId(), amountMinor, reason));
        var result = gateway.refund(payment.getProviderRef(), amountMinor, reason);
        if (!result.success()) {
            refund.fail();
            refunds.save(refund);
            throw ApiException.conflict("REFUND_FAILED", "Gateway refused the refund");
        }
        refund.complete(result.providerRef());
        refunds.save(refund);

        if (alreadyRefunded + amountMinor == payment.getAmountMinor()) {
            payment.markRefunded();
            payments.save(payment);
            audit.save(new PaymentAudit(payment.getId(), Payment.CAPTURED,
                    Payment.REFUNDED, reason));
        }
        publish("payment.refunded", orderId, Map.of(
                "orderId", orderId.toString(),
                "paymentId", payment.getId().toString(),
                "refundId", refund.getId().toString(),
                "amountMinor", amountMinor), traceId);
        return refund;
    }

    // ------------------------------------------------------------------ reads

    @Transactional(readOnly = true)
    public Payment getByOrder(UUID orderId, UUID userId) {
        Payment payment = payments.findByOrderId(orderId)
                .orElseThrow(() -> ApiException.notFound("PAYMENT_NOT_FOUND", "No payment for order"));
        if (!payment.getUserId().equals(userId)) {
            // 404 لا 403 — لا نكشف وجود دفعة لطلب ليس للمستخدم
            throw ApiException.notFound("PAYMENT_NOT_FOUND", "No payment for order");
        }
        return payment;
    }

    // ----------------------------------------------------------- idempotency

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean claimEvent(UUID eventId) {
        if (processed.existsById(new ProcessedEvent.Key(eventId, CONSUMER))) {
            return false;
        }
        try {
            processed.saveAndFlush(new ProcessedEvent(eventId, CONSUMER));
            return true;
        } catch (DataIntegrityViolationException e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- events

    private void republishOutcome(Payment payment, String traceId) {
        if (payment.isSettled()) {
            publish("payment.authorized", payment.getOrderId(), successPayload(payment), traceId);
        } else if (Payment.FAILED.equals(payment.getStatus())) {
            publish("payment.failed", payment.getOrderId(),
                    failurePayload(payment, payment.getFailureCode()), traceId);
        }
    }

    private Map<String, Object> successPayload(Payment p) {
        Map<String, Object> m = new HashMap<>();
        m.put("orderId", p.getOrderId().toString());
        m.put("paymentId", p.getId().toString());
        m.put("userId", p.getUserId().toString());
        m.put("amountMinor", p.getAmountMinor());
        m.put("currency", p.getCurrency());
        m.put("provider", p.getProvider());
        m.put("providerRef", p.getProviderRef());
        m.put("status", p.getStatus());
        return m;
    }

    private Map<String, Object> failurePayload(Payment p, String code) {
        Map<String, Object> m = new HashMap<>();
        m.put("orderId", p.getOrderId().toString());
        m.put("paymentId", p.getId().toString());
        m.put("userId", p.getUserId().toString());
        m.put("amountMinor", p.getAmountMinor());
        m.put("currency", p.getCurrency());
        m.put("failureCode", code == null ? "UNKNOWN" : code);
        return m;
    }

    private void publish(String eventType, UUID orderId, Map<String, Object> payload, String traceId) {
        EventEnvelope envelope = new EventEnvelope(
                UUID.randomUUID().toString(), eventType, 1, Instant.now().toString(),
                traceId, orderId.toString(), mapper.valueToTree(payload));

        kafka.send(paymentTopic, orderId.toString(), envelope)
                .whenComplete((res, ex) -> {
                    if (ex != null) {
                        // حرج: الـ Saga ستعلق. التنبيه هنا يجب أن يوقظ فريق العمليات
                        log.error("CRITICAL: failed publishing {} for order={} — saga will stall",
                                eventType, orderId, ex);
                    }
                });
    }

    // ------------------------------------------------------ scheduled sweeps

    /** تفويضات قديمة لم تُخصم — تنتهي تلقائيًا لدى المزوّد، فننبّه قبل ذلك. */
    @Scheduled(cron = "0 0 */6 * * *")
    @Transactional(readOnly = true)
    public void reportStaleAuthorizations() {
        List<Payment> stale = payments.findStaleAuthorizations(
                Instant.now().minus(5, ChronoUnit.DAYS),
                org.springframework.data.domain.PageRequest.of(0, 100));
        if (!stale.isEmpty()) {
            log.warn("{} authorizations older than 5 days are still uncaptured", stale.size());
        }
    }

    @Scheduled(cron = "0 50 3 * * *")
    @Transactional
    public void purgeProcessedEvents() {
        int deleted = processed.purgeOlderThan(Instant.now().minus(30, ChronoUnit.DAYS));
        if (deleted > 0) {
            log.info("purged {} processed-event records", deleted);
        }
    }
}
