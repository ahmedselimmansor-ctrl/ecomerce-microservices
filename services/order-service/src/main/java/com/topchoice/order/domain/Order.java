package com.topchoice.order.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "order_number", nullable = false, unique = true, length = 32)
    private String orderNumber;

    @Column(name = "user_id", nullable = false, columnDefinition = "uuid")
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OrderStatus status = OrderStatus.PENDING;

    @Column(nullable = false, columnDefinition = "bpchar(3)")
    private String currency = "AED";

    @Column(name = "subtotal_minor", nullable = false)
    private long subtotalMinor;

    @Column(name = "shipping_minor", nullable = false)
    private long shippingMinor;

    @Column(name = "discount_minor", nullable = false)
    private long discountMinor;

    @Column(name = "tax_minor", nullable = false)
    private long taxMinor;

    @Column(name = "total_minor", nullable = false)
    private long totalMinor;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "shipping_address", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> shippingAddress;

    @Column(name = "payment_method", nullable = false, length = 24)
    private String paymentMethod = "CARD";

    @Column(name = "payment_id", columnDefinition = "uuid")
    private UUID paymentId;

    @Column(name = "failure_reason", length = 64)
    private String failureReason;

    /**
     * {@code @BatchSize} يحوّل N+1 إلى استعلامين عند عرض صفحة «طلباتي»:
     * واحد للطلبات وآخر يجلب أسطر كل الطلبات دفعة واحدة.
     */
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    @BatchSize(size = 50)
    private List<OrderItem> items = new ArrayList<>();

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected Order() {
    }

    public Order(String orderNumber, UUID userId, String currency,
                 Map<String, Object> shippingAddress, String paymentMethod) {
        this.orderNumber = orderNumber;
        this.userId = userId;
        this.currency = currency;
        this.shippingAddress = shippingAddress;
        this.paymentMethod = paymentMethod;
    }

    public void addItem(OrderItem item) {
        item.setOrder(this);
        this.items.add(item);
    }

    /** يعيد الحساب من الأسطر — لا نثق أبدًا في مجاميع يرسلها العميل. */
    public void recalculateTotals(long shippingFeeMinor, int vatPercent, long discountMinor) {
        this.subtotalMinor = items.stream()
                .mapToLong(i -> i.getUnitPriceMinor() * i.getQuantity())
                .sum();
        this.discountMinor = Math.min(discountMinor, this.subtotalMinor);
        this.shippingMinor = shippingFeeMinor;

        long taxable = this.subtotalMinor - this.discountMinor;
        this.taxMinor = Math.round(taxable * vatPercent / 100.0);
        this.totalMinor = taxable + this.shippingMinor + this.taxMinor;
    }

    /**
     * انتقال محكوم بالحالة. يعيد {@code false} إن كان الانتقال غير مسموح،
     * فيتجاهل المستدعي الحدث المتأخر بدل إفساد حالة الطلب.
     */
    public boolean transitionTo(OrderStatus next, String reason) {
        if (!status.canTransitionTo(next)) {
            return false;
        }
        this.status = next;
        if (reason != null) {
            this.failureReason = reason;
        }
        this.updatedAt = Instant.now();
        return true;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getOrderNumber() { return orderNumber; }
    public UUID getUserId() { return userId; }
    public OrderStatus getStatus() { return status; }
    public String getCurrency() { return currency; }
    public long getSubtotalMinor() { return subtotalMinor; }
    public long getShippingMinor() { return shippingMinor; }
    public long getDiscountMinor() { return discountMinor; }
    public long getTaxMinor() { return taxMinor; }
    public long getTotalMinor() { return totalMinor; }
    public Map<String, Object> getShippingAddress() { return shippingAddress; }
    public String getPaymentMethod() { return paymentMethod; }
    public UUID getPaymentId() { return paymentId; }
    public String getFailureReason() { return failureReason; }
    public List<OrderItem> getItems() { return items; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getVersion() { return version; }

    public void setPaymentId(UUID paymentId) { this.paymentId = paymentId; }
}
