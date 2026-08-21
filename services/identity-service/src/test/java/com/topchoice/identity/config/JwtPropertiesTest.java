package com.topchoice.identity.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * التحقق من مفتاح التوقيع عند الإقلاع.
 *
 * <p>سبب وجود هذا الملف: النسخة السابقة كانت تقبل مفتاحًا افتراضيًا منشورًا في
 * هذا المستودع. طوله ٤٨ بايتًا، أي أنه كان يجتاز فحص الطول ويمرّ بصمت. الخطر
 * ليس المفتاح القصير بل المفتاح المعروف — والاختبارات هنا تحرس ذلك.
 */
class JwtPropertiesTest {

    private static final String VALID =
            "b7f3c9a1e5d2486fa0c4b8e6d3712059af8c1b4e6d9027351cae8f2b60d4917";

    private JwtProperties build(String secret) {
        return new JwtProperties(secret, "topchoice-identity", 900L, 2_592_000L);
    }

    @Test
    @DisplayName("مفتاح عشوائي طويل يُقبل")
    void acceptsStrongSecret() {
        assertThatCode(() -> build(VALID)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("المفتاح المفقود يوقف الإقلاع")
    void rejectsNull() {
        assertThatThrownBy(() -> build(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("JWT_SECRET");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    @DisplayName("المفتاح الفارغ يوقف الإقلاع")
    void rejectsBlank(String secret) {
        assertThatThrownBy(() -> build(secret))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("أقل من ٣٢ بايت مرفوض — HS256 يتطلبها")
    void rejectsShortSecret() {
        assertThatThrownBy(() -> build("a".repeat(31)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    /**
     * جوهر الاختبار: هذه القيم تجتاز فحص الطول بسهولة، ومع ذلك يجب أن تُرفض
     * لأن أي مفتاح ظهر في ملف متتبَّع هو مفتاح يعرفه كل من استنسخ المشروع.
     */
    @ParameterizedTest
    @ValueSource(strings = {
            "local-dev-only-change-me-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e",
            "LOCAL-DEV-ONLY-CHANGE-ME-9f2b7c1d4e6a8b0c2d4e6f8a0b2c4d6e",
            "please-change-me-before-deploying-to-production-1234",
            "my-super-secret-key-that-is-long-enough-to-pass-length",
    })
    @DisplayName("المفاتيح المعروفة مرفوضة رغم طولها الكافي")
    void rejectsKnownPlaceholders(String secret) {
        assertThatThrownBy(() -> build(secret))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("openssl rand");
    }

    @Test
    @DisplayName("الرفض لا يعتمد على حالة الأحرف")
    void rejectionIsCaseInsensitive() {
        assertThatThrownBy(() -> build("PREFIX-ChAnGeMe-" + "x".repeat(40)))
                .isInstanceOf(IllegalStateException.class);
    }
}
