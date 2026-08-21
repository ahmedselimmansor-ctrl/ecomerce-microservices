package com.topchoice.order.domain;

import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * حساب مبالغ الطلب والانتقال بين حالاته.
 *
 * <p>كل المبالغ بالوحدة الصغرى (قرش) كأعداد صحيحة. الاختبارات هنا تحرس هذا
 * القرار: أي انزلاق إلى {@code double} سيظهر كفرق قرش في أحد هذه التأكيدات.
 */
class OrderTest {

    private static final int VAT = 14;              // ضريبة القيمة المضافة في مصر
    private static final long SHIPPING = 3_500L;    // ٣٥ جنيهًا

    private Order newOrder() {
        return new Order("TC-1001", UUID.randomUUID(), "EGP",
                Map.of("city", "القاهرة"), "CARD");
    }

    @Nested
    @DisplayName("حساب المجاميع")
    class Totals {

        @Test
        @DisplayName("المجموع الفرعي حاصل ضرب السعر في الكمية لكل سطر")
        void subtotalIsSumOfLines() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج أ", null, 1_250_50L, 2, "tc-retail"));
            order.addItem(new OrderItem("TC-B", "منتج ب", null, 99_99L, 3, "tc-retail"));

            order.recalculateTotals(SHIPPING, VAT, 0);

            assertThat(order.getSubtotalMinor()).isEqualTo(1_250_50L * 2 + 99_99L * 3);
        }

        @Test
        @DisplayName("الضريبة تُحسب بعد الخصم لا قبله")
        void vatAppliesAfterDiscount() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج", null, 100_00L, 1, "tc-retail"));

            order.recalculateTotals(0, VAT, 20_00L);

            // الوعاء الخاضع للضريبة = ١٠٠ − ٢٠ = ٨٠ جنيهًا، والضريبة ١٤٪ منها
            assertThat(order.getTaxMinor()).isEqualTo(11_20L);
            assertThat(order.getTotalMinor()).isEqualTo(80_00L + 11_20L);
        }

        @Test
        @DisplayName("الإجمالي = (فرعي − خصم) + شحن + ضريبة")
        void totalFormula() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج", null, 500_00L, 2, "tc-retail"));

            order.recalculateTotals(SHIPPING, VAT, 100_00L);

            long taxable = 1_000_00L - 100_00L;
            long tax = Math.round(taxable * VAT / 100.0);
            assertThat(order.getTotalMinor()).isEqualTo(taxable + SHIPPING + tax);
        }

        /**
         * قسيمة أكبر من قيمة السلة يجب ألّا تنتج مجموعًا سالبًا — أي أن يدفع
         * المتجر للعميل. الحدّ عند قيمة السلة.
         */
        @Test
        @DisplayName("الخصم لا يتجاوز المجموع الفرعي")
        void discountIsCappedAtSubtotal() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج", null, 50_00L, 1, "tc-retail"));

            order.recalculateTotals(0, VAT, 999_999_00L);

            assertThat(order.getDiscountMinor()).isEqualTo(50_00L);
            assertThat(order.getTaxMinor()).isZero();
            assertThat(order.getTotalMinor()).isZero();
        }

        @Test
        @DisplayName("إعادة الحساب لا تتأثر بمجاميع سابقة")
        void recalculationIsIdempotent() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج", null, 250_00L, 4, "tc-retail"));

            order.recalculateTotals(SHIPPING, VAT, 0);
            long first = order.getTotalMinor();
            order.recalculateTotals(SHIPPING, VAT, 0);

            assertThat(order.getTotalMinor()).isEqualTo(first);
        }

        /**
         * ٣٣٫٣٣ × ٣ = ٩٩٫٩٩ بالضبط بالأعداد الصحيحة. بالفاصلة العائمة كانت
         * تعطي 99.99000000000001 — وهذا التأكيد هو ما يمسك الانزلاق.
         */
        @Test
        @DisplayName("لا كسور عائمة في المبالغ")
        void noFloatingPointDrift() {
            Order order = newOrder();
            order.addItem(new OrderItem("TC-A", "منتج", null, 33_33L, 3, "tc-retail"));

            order.recalculateTotals(0, 0, 0);

            assertThat(order.getSubtotalMinor()).isEqualTo(99_99L);
        }

        @Test
        @DisplayName("سلة فارغة تعطي أصفارًا لا استثناء")
        void emptyCart() {
            Order order = newOrder();

            order.recalculateTotals(0, VAT, 0);

            assertThat(order.getSubtotalMinor()).isZero();
            assertThat(order.getTotalMinor()).isZero();
        }
    }

    @Nested
    @DisplayName("الانتقال بين الحالات")
    class Transitions {

        @Test
        @DisplayName("الطلب الجديد يبدأ PENDING")
        void startsPending() {
            assertThat(newOrder().getStatus()).isEqualTo(OrderStatus.PENDING);
        }

        @Test
        @DisplayName("الانتقال المسموح يُطبَّق ويعيد true")
        void allowedTransitionApplies() {
            Order order = newOrder();

            assertThat(order.transitionTo(OrderStatus.AWAITING_PAYMENT, null)).isTrue();
            assertThat(order.getStatus()).isEqualTo(OrderStatus.AWAITING_PAYMENT);
        }

        /**
         * الأهم في هذا الملف: الانتقال المرفوض لا يغيّر الحالة. لو غيّرها ثم
         * أعاد false لكان الطلب فسد فعليًا وبقي الخطأ صامتًا في السجل.
         */
        @Test
        @DisplayName("الانتقال المرفوض لا يغيّر الحالة")
        void rejectedTransitionLeavesStateUntouched() {
            Order order = newOrder();

            assertThat(order.transitionTo(OrderStatus.DELIVERED, null)).isFalse();
            assertThat(order.getStatus()).isEqualTo(OrderStatus.PENDING);
        }

        @Test
        @DisplayName("سبب الفشل يُحفظ عند الإلغاء")
        void cancellationRecordsReason() {
            Order order = newOrder();

            order.transitionTo(OrderStatus.CANCELLED, "PAYMENT_DECLINED");

            assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
            assertThat(order.getFailureReason()).isEqualTo("PAYMENT_DECLINED");
        }

        @Test
        @DisplayName("الطلب الملغى لا يُعاد تأكيده بحدث متأخر")
        void cancelledOrderRejectsLatePaymentEvent() {
            Order order = newOrder();
            order.transitionTo(OrderStatus.AWAITING_PAYMENT, null);
            order.transitionTo(OrderStatus.CANCELLED, "OUT_OF_STOCK");

            assertThat(order.transitionTo(OrderStatus.CONFIRMED, null)).isFalse();
            assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
        }
    }
}
