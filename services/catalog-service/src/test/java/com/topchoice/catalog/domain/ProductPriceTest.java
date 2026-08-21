package com.topchoice.catalog.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * نسبة الخصم المعروضة على بطاقة المنتج.
 *
 * <p>نفس المنطق منفَّذ مرتين: هنا وفي {@code frontend/web/src/lib/format.ts}،
 * لأن الخادم يحتاجه للفهرسة والواجهة تحتاجه للعرض الفوري. التكرار مقبول لكن
 * الانحراف ليس: بطاقة تقول ٢٥٪ ونتيجة بحث تقول ٢٤٪ لنفس المنتج تبدو خللًا.
 * الحالات أدناه هي العقد المشترك بين التنفيذين.
 */
class ProductPriceTest {

    private Product.Price price(long amountMinor, Long wasMinor) {
        return new Product.Price("EGP", amountMinor, wasMinor);
    }

    @ParameterizedTest(name = "{0} بعد أن كان {1} ⇒ {2}%")
    @CsvSource({
            "  7500,  10000, 25",
            "  5000,  10000, 50",
            "  9000,  10000, 10",
            "449900, 529900, 15",
            "     1,    100, 99",
    })
    @DisplayName("النسبة تُحسب من السعر القديم لا الجديد")
    void computesFromOriginalPrice(long amount, long was, int expected) {
        assertThat(price(amount, was).discountPercent()).isEqualTo(expected);
    }

    @Test
    @DisplayName("بلا سعر سابق ⇒ لا شارة خصم")
    void nullWhenNoPreviousPrice() {
        assertThat(price(10_000L, null).discountPercent()).isNull();
    }

    /**
     * سعر «سابق» أقل من الحالي يعني ارتفاع السعر لا خصمًا. إظهار نسبة سالبة
     * أو صفر هنا يقرأ كخلل في الواجهة.
     */
    @Test
    @DisplayName("السعر السابق الأقل ⇒ لا شارة")
    void nullWhenPreviousIsLower() {
        assertThat(price(10_000L, 8_000L).discountPercent()).isNull();
    }

    @Test
    @DisplayName("السعر السابق المساوي ⇒ لا شارة")
    void nullWhenPreviousEqualsCurrent() {
        assertThat(price(10_000L, 10_000L).discountPercent()).isNull();
    }

    @Test
    @DisplayName("السعر السابق صفر ⇒ لا شارة (لا قسمة على صفر)")
    void nullWhenPreviousIsZero() {
        assertThat(price(10_000L, 0L).discountPercent()).isNull();
    }

    /**
     * ٣٣٫٣٣٪ تُقرَّب إلى ٣٣ لا تُبتر إلى ٣٢. التقريب هو ما تفعله الواجهة
     * بـ Math.round، والبتر كان سيُظهر رقمين مختلفين في مكانين.
     */
    @ParameterizedTest(name = "{0} من {1} ⇒ {2}%")
    @CsvSource({
            " 6667, 10000, 33",
            " 6666, 10000, 33",
            " 9950, 10000,  1",
            " 9949, 10000,  1",
    })
    @DisplayName("التقريب لأقرب صحيح لا البتر")
    void roundsRatherThanTruncates(long amount, long was, int expected) {
        assertThat(price(amount, was).discountPercent()).isEqualTo(expected);
    }

    @Test
    @DisplayName("المبالغ الكبيرة لا تفيض")
    void handlesLargeAmounts() {
        // ٩٩ مليون جنيه — أكبر بكثير من أي منتج، وما زال ضمن long
        assertThat(price(5_000_000_000L, 10_000_000_000L).discountPercent()).isEqualTo(50);
    }
}
