package com.topchoice.payment.api;

import com.topchoice.payment.domain.Payment;
import com.topchoice.payment.service.PaymentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    /** استجابة العميل — بلا مراجع المزوّد الداخلية. */
    public record PaymentView(UUID id, UUID orderId, long amountMinor, String currency,
                              String method, String status, String failureCode,
                              Instant createdAt) {

        static PaymentView of(Payment p) {
            return new PaymentView(p.getId(), p.getOrderId(), p.getAmountMinor(),
                    p.getCurrency(), p.getMethod(), p.getStatus(), p.getFailureCode(),
                    p.getCreatedAt());
        }
    }

    public record RefundRequest(@Positive long amountMinor, @Size(max = 255) String reason) {
    }

    @GetMapping("/order/{orderId}")
    public PaymentView byOrder(@RequestHeader("X-User-Id") UUID userId,
                               @PathVariable UUID orderId) {
        return PaymentView.of(payments.getByOrder(orderId, userId));
    }

    // ----------------------------------------------------- internal endpoints

    @PostMapping("/internal/order/{orderId}/capture")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void capture(@PathVariable UUID orderId,
                        @RequestHeader(value = "x-request-id", required = false) String traceId) {
        payments.capture(orderId, traceId);
    }

    @PostMapping("/internal/order/{orderId}/refund")
    public UUID refund(@PathVariable UUID orderId,
                       @Valid @RequestBody RefundRequest req,
                       @RequestHeader(value = "x-request-id", required = false) String traceId) {
        return payments.refund(orderId, req.amountMinor(), req.reason(), traceId).getId();
    }
}
