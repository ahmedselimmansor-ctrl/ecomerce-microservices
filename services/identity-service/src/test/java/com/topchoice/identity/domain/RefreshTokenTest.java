package com.topchoice.identity.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * صلاحية توكن التجديد.
 *
 * <p>التوكن يُخزَّن كبصمة SHA-256 لا كنص صريح، ويحمل {@code familyId} تشترك فيه
 * كل التوكنات المتولّدة من جلسة واحدة. هذا ما يجعل كشف إعادة الاستخدام ممكنًا:
 * إن ظهر توكن مسحوب مرة أخرى، تُبطَل العائلة كلها لأن ظهوره يعني أن أحدهم
 * يحمل نسخة مسروقة.
 */
class RefreshTokenTest {

    private RefreshToken token(Duration ttl) {
        return new RefreshToken(UUID.randomUUID(), "sha256-hash", UUID.randomUUID(),
                "Mozilla/5.0", Instant.now().plus(ttl));
    }

    @Test
    @DisplayName("التوكن الجديد صالح للاستخدام")
    void freshTokenIsUsable() {
        assertThat(token(Duration.ofDays(30)).isUsable()).isTrue();
    }

    @Test
    @DisplayName("التوكن المنتهي غير صالح")
    void expiredTokenIsNotUsable() {
        assertThat(token(Duration.ofSeconds(-1)).isUsable()).isFalse();
    }

    @Test
    @DisplayName("السحب يُبطل التوكن فورًا")
    void revokedTokenIsNotUsable() {
        RefreshToken t = token(Duration.ofDays(30));

        t.revoke();

        assertThat(t.isUsable()).isFalse();
        assertThat(t.getRevokedAt()).isNotNull();
    }

    /**
     * لحظة السحب دليل تحقيقي: تغييرها عند كل استدعاء يمحو متى وقعت الحادثة
     * فعلًا، ويجعل تتبّع تسريب توكن مستحيلًا.
     */
    @Test
    @DisplayName("السحب المكرر لا يغيّر لحظة السحب الأولى")
    void revokeIsIdempotent() throws InterruptedException {
        RefreshToken t = token(Duration.ofDays(30));

        t.revoke();
        Instant first = t.getRevokedAt();
        Thread.sleep(5);
        t.revoke();

        assertThat(t.getRevokedAt()).isEqualTo(first);
    }

    @Test
    @DisplayName("لا يُخزَّن التوكن نفسه بل بصمته")
    void storesHashNotToken() {
        RefreshToken t = token(Duration.ofDays(30));

        assertThat(t.getTokenHash()).isEqualTo("sha256-hash");
    }

    @Test
    @DisplayName("توكنات الجلسة الواحدة تشترك في معرّف العائلة")
    void familyIdGroupsSessionTokens() {
        UUID family = UUID.randomUUID();
        UUID user = UUID.randomUUID();

        RefreshToken first = new RefreshToken(user, "hash-1", family, "ua",
                Instant.now().plus(Duration.ofDays(30)));
        RefreshToken rotated = new RefreshToken(user, "hash-2", family, "ua",
                Instant.now().plus(Duration.ofDays(30)));

        assertThat(rotated.getFamilyId()).isEqualTo(first.getFamilyId());
        assertThat(rotated.getTokenHash()).isNotEqualTo(first.getTokenHash());
    }
}
