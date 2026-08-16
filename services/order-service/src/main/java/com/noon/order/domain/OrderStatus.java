package com.noon.order.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * دورة حياة الطلب. الانتقالات المسموحة معرّفة صراحةً حتى لا يستطيع حدث
 * متأخر أو مكرر إرجاع طلب مُسلَّم إلى «قيد الانتظار».
 */
public enum OrderStatus {

    PENDING,            // أُنشئ — بانتظار حجز المخزون
    AWAITING_PAYMENT,   // المخزون محجوز — بانتظار الدفع
    CONFIRMED,          // الدفع نجح
    PROCESSING,         // قيد التجهيز في المستودع
    SHIPPED,
    DELIVERED,
    CANCELLED,
    REFUNDED;

    private static final Set<OrderStatus> TERMINAL =
            EnumSet.of(DELIVERED, CANCELLED, REFUNDED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public boolean canTransitionTo(OrderStatus next) {
        if (this == next) {
            return true;             // إعادة تسليم نفس الحدث — لا تغيير
        }
        return switch (this) {
            case PENDING          -> next == AWAITING_PAYMENT || next == CANCELLED;
            case AWAITING_PAYMENT -> next == CONFIRMED || next == CANCELLED;
            case CONFIRMED        -> next == PROCESSING || next == CANCELLED || next == REFUNDED;
            case PROCESSING       -> next == SHIPPED || next == CANCELLED;
            case SHIPPED          -> next == DELIVERED;
            case DELIVERED        -> next == REFUNDED;
            case CANCELLED, REFUNDED -> false;
        };
    }
}
