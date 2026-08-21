package com.topchoice.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "topchoice.jwt")
public record JwtProperties(
        String secret,
        String issuer,
        long accessTtlSeconds,
        long refreshTtlSeconds
) {
    /**
     * مفاتيح مرفوضة صراحةً: قيم ظهرت يومًا في هذا المستودع أو في ملفات المثال.
     *
     * <p>التحقق من الطول وحده لا يكفي. المفتاح المنشور سابقًا كان ٤٨ بايتًا،
     * أي أنه كان يجتاز فحص الطول ويمرّ بصمت. الخطر ليس المفتاح القصير بل
     * المفتاح المعروف.
     */
    private static final String[] REJECTED = {
            "local-dev-only-change-me",
            "change-me",
            "changeme",
            "secret",
    };

    public JwtProperties {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "topchoice.jwt.secret مفقود — اضبط متغيّر البيئة JWT_SECRET. "
                    + "لا قيمة افتراضية عمدًا: مفتاح افتراضي منشور أسوأ من فشل الإقلاع.");
        }
        if (secret.getBytes().length < 32) {
            throw new IllegalStateException(
                    "topchoice.jwt.secret must be at least 32 bytes for HS256");
        }
        String lowered = secret.toLowerCase();
        for (String bad : REJECTED) {
            if (lowered.contains(bad)) {
                throw new IllegalStateException(
                        "topchoice.jwt.secret يحتوي قيمة معروفة (" + bad + "). "
                        + "ولّد مفتاحًا عشوائيًا: openssl rand -base64 48");
            }
        }
    }
}
