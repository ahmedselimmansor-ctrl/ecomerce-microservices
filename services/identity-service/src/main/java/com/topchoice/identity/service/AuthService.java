package com.topchoice.identity.service;

import com.topchoice.identity.api.dto.Dtos.*;
import com.topchoice.identity.domain.RefreshToken;
import com.topchoice.identity.domain.User;
import com.topchoice.identity.error.ApiException;
import com.topchoice.identity.repository.RefreshTokenRepository;
import com.topchoice.identity.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** هاش وهمي لموازنة زمن الاستجابة ومنع تعداد الحسابات عبر توقيت الرد. */
    private static final String DUMMY_HASH =
            "$2a$10$4IYf.EQ3NNkB4hdgUrlbfu/SJKs3KJXJZdDWrUzcyoShWU6itSH9y";

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder encoder;
    private final TokenService tokens;

    public AuthService(UserRepository users, RefreshTokenRepository refreshTokens,
                       PasswordEncoder encoder, TokenService tokens) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
        this.tokens = tokens;
    }

    @Transactional
    public TokenPair register(RegisterRequest req, String userAgent) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("EMAIL_TAKEN", "This email is already registered");
        }
        User user = new User(email, blankToNull(req.phone()),
                encoder.encode(req.password()), req.fullName().trim(), req.locale());
        try {
            user = users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // سباق بين طلبين متزامنين بنفس الإيميل/الهاتف
            throw ApiException.conflict("EMAIL_TAKEN", "This email or phone is already registered");
        }
        log.info("user registered id={}", user.getId());
        return issuePair(user, UUID.randomUUID(), userAgent);
    }

    @Transactional
    public TokenPair login(LoginRequest req, String userAgent) {
        var maybeUser = users.findByEmailIgnoreCase(req.email().trim());
        if (maybeUser.isEmpty()) {
            encoder.matches(req.password(), DUMMY_HASH);   // زمن ثابت
            throw ApiException.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
        }
        User user = maybeUser.get();
        if (!encoder.matches(req.password(), user.getPasswordHash())) {
            throw ApiException.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
        }
        if (!user.isActive()) {
            throw ApiException.forbidden("ACCOUNT_SUSPENDED", "This account is not active");
        }
        return issuePair(user, UUID.randomUUID(), userAgent);
    }

    /**
     * تدوير توكن التحديث مع كشف إعادة الاستخدام:
     * لو وصل توكن مسحوب بالفعل فهذا مؤشر تسريب ⇒ نُبطل كل عائلة التوكنات.
     */
    @Transactional
    public TokenPair refresh(String rawRefreshToken, String userAgent) {
        String hash = tokens.hash(rawRefreshToken);
        RefreshToken stored = refreshTokens.findByTokenHash(hash)
                .orElseThrow(() -> ApiException.unauthorized(
                        "INVALID_REFRESH_TOKEN", "Refresh token is invalid"));

        if (stored.getRevokedAt() != null) {
            int revoked = refreshTokens.revokeFamily(stored.getFamilyId(), Instant.now());
            log.warn("refresh token reuse detected userId={} family={} revoked={}",
                    stored.getUserId(), stored.getFamilyId(), revoked);
            throw ApiException.unauthorized("TOKEN_REUSE_DETECTED",
                    "Refresh token reuse detected — all sessions were revoked");
        }
        if (!stored.isUsable()) {
            throw ApiException.unauthorized("REFRESH_TOKEN_EXPIRED", "Refresh token expired");
        }

        User user = users.findById(stored.getUserId())
                .orElseThrow(() -> ApiException.unauthorized("USER_NOT_FOUND", "User no longer exists"));
        if (!user.isActive()) {
            throw ApiException.forbidden("ACCOUNT_SUSPENDED", "This account is not active");
        }

        stored.revoke();
        refreshTokens.save(stored);
        return issuePair(user, stored.getFamilyId(), userAgent);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.findByTokenHash(tokens.hash(rawRefreshToken)).ifPresent(t -> {
            refreshTokens.revokeFamily(t.getFamilyId(), Instant.now());
        });
    }

    @Transactional
    public void logoutAll(UUID userId) {
        refreshTokens.revokeAllForUser(userId, Instant.now());
    }

    /** يستخدمها الـ api-gateway للتحقق من التوكن دون مشاركة السرّ. */
    @Transactional(readOnly = true)
    public IntrospectResponse introspect(String accessToken) {
        try {
            Claims claims = tokens.parse(accessToken);
            @SuppressWarnings("unchecked")
            Set<String> roles = Set.copyOf((java.util.List<String>) claims.get("roles"));
            return new IntrospectResponse(true, claims.getSubject(), roles,
                    claims.getExpiration().toInstant().getEpochSecond());
        } catch (JwtException | IllegalArgumentException | ClassCastException e) {
            return new IntrospectResponse(false, null, Set.of(), null);
        }
    }

    private TokenPair issuePair(User user, UUID familyId, String userAgent) {
        String access = tokens.issueAccessToken(user);
        String refresh = tokens.generateRefreshToken();
        refreshTokens.save(new RefreshToken(
                user.getId(), tokens.hash(refresh), familyId,
                truncate(userAgent, 255),
                Instant.now().plusSeconds(tokens.refreshTtlSeconds())));
        return new TokenPair(access, refresh, "Bearer",
                tokens.accessTtlSeconds(), UserView.of(user));
    }

    /** تنظيف دوري للتوكنات المنتهية — في الإنتاج ينفَّذ كـ CronJob في Kubernetes. */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        int deleted = refreshTokens.deleteExpired(Instant.now().minusSeconds(86_400));
        if (deleted > 0) {
            log.info("purged {} expired refresh tokens", deleted);
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
