package com.topchoice.order.api.dto;

import com.topchoice.order.domain.Order;
import com.topchoice.order.domain.OrderItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class OrderDtos {

    private OrderDtos() {
    }

    // --------------------------------------------------------------- requests

    /**
     * ملاحظة متعمّدة: الطلب <b>لا يحتوي على أسعار</b>.
     * السعر يُقرأ من catalog-service وقت الإنشاء.
     */
    public record CreateOrderRequest(
            @NotEmpty(message = "order must contain at least one item")
            @Size(max = 50, message = "maximum 50 line items per order")
            @Valid List<LineItem> items,

            @NotNull Map<String, Object> shippingAddress,

            @NotBlank @Pattern(regexp = "^(CARD|COD|APPLE_PAY|TABBY)$")
            String paymentMethod,

            @Pattern(regexp = "^[A-Z0-9-]{3,32}$") String couponCode) {

        public record LineItem(
                @NotBlank @Size(max = 64) String sku,
                @Min(1) @Max(20) int quantity) {
        }
    }

    public record CancelOrderRequest(@Size(max = 255) String reason) {
    }

    public record UpdateStatusRequest(
            @NotBlank @Pattern(regexp = "^(PROCESSING|SHIPPED|DELIVERED)$") String status) {
    }

    // -------------------------------------------------------------- responses

    public record OrderItemView(String sku, String title, String imageUrl,
                                long unitPriceMinor, int quantity, long lineTotalMinor,
                                String sellerId) {

        static OrderItemView of(OrderItem i) {
            return new OrderItemView(i.getSku(), i.getTitle(), i.getImageUrl(),
                    i.getUnitPriceMinor(), i.getQuantity(), i.lineTotalMinor(), i.getSellerId());
        }
    }

    public record OrderView(
            UUID id,
            String orderNumber,
            String status,
            String currency,
            long subtotalMinor,
            long shippingMinor,
            long discountMinor,
            long taxMinor,
            long totalMinor,
            String paymentMethod,
            UUID paymentId,
            String failureReason,
            Map<String, Object> shippingAddress,
            List<OrderItemView> items,
            Instant createdAt,
            Instant updatedAt) {

        public static OrderView of(Order o) {
            return new OrderView(
                    o.getId(), o.getOrderNumber(), o.getStatus().name(), o.getCurrency(),
                    o.getSubtotalMinor(), o.getShippingMinor(), o.getDiscountMinor(),
                    o.getTaxMinor(), o.getTotalMinor(), o.getPaymentMethod(), o.getPaymentId(),
                    o.getFailureReason(), o.getShippingAddress(),
                    o.getItems().stream().map(OrderItemView::of).toList(),
                    o.getCreatedAt(), o.getUpdatedAt());
        }

        /** نسخة مختصرة لقائمة «طلباتي» — بلا عنوان الشحن ولا كل الأسطر. */
        public static OrderSummary summaryOf(Order o) {
            return new OrderSummary(o.getId(), o.getOrderNumber(), o.getStatus().name(),
                    o.getCurrency(), o.getTotalMinor(), o.getItems().size(), o.getCreatedAt());
        }
    }

    public record OrderSummary(UUID id, String orderNumber, String status, String currency,
                               long totalMinor, int itemCount, Instant createdAt) {
    }

    public record PageResponse<T>(List<T> items, int page, int size,
                                  long totalItems, int totalPages, boolean hasNext) {
    }

    // ------------------------------------------------------------------ admin

    public record AdminStatusRequest(
            @NotBlank
            @Pattern(regexp = "^(PENDING|AWAITING_PAYMENT|CONFIRMED|PROCESSING|SHIPPED|DELIVERED|CANCELLED|REFUNDED)$")
            String status) {
    }

    /** ملخص لوحة التحكم: يحمل معرّف المستخدم — لا يظهر في واجهة العميل. */
    public record AdminOrderSummary(
            UUID id, String orderNumber, UUID userId, String status, String currency,
            long totalMinor, int itemCount, String paymentMethod, String failureReason,
            Instant createdAt) {

        public static AdminOrderSummary of(Order o) {
            return new AdminOrderSummary(o.getId(), o.getOrderNumber(), o.getUserId(),
                    o.getStatus().name(), o.getCurrency(), o.getTotalMinor(),
                    o.getItems().size(), o.getPaymentMethod(), o.getFailureReason(),
                    o.getCreatedAt());
        }
    }

    public record OrderStats(
            long totalOrders,
            long pending,
            long confirmed,
            long processing,
            long shipped,
            long delivered,
            long cancelled,
            long revenueMinor,
            long todayOrders,
            long todayRevenueMinor,
            double averageOrderMinor) {
    }
}
