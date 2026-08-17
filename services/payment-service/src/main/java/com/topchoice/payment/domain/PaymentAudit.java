package com.topchoice.payment.domain;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * سجل تدقيق append-only لكل انتقال حالة.
 * لا تحديث ولا حذف — يُعامَل كدفتر محاسبي.
 */
@Entity
@Table(name = "payment_audit")
public class PaymentAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "payment_id", nullable = false, columnDefinition = "uuid")
    private UUID paymentId;

    @Column(name = "from_status", length = 24)
    private String fromStatus;

    @Column(name = "to_status", nullable = false, length = 24)
    private String toStatus;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected PaymentAudit() {
    }

    public PaymentAudit(UUID paymentId, String fromStatus, String toStatus, String detail) {
        this.paymentId = paymentId;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.detail = detail;
    }

    public Long getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
    public String getToStatus() { return toStatus; }
}
