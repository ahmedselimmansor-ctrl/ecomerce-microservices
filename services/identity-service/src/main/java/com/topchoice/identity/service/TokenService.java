package com.topchoice.identity.service;

import com.topchoice.identity.config.JwtProperties;
import com.topchoice.identity.domain.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * إصدار وتحقق توكنات JWT.
 *
 * <p>محليًا نستخدم HS256 بمفتاح مشترك. في الإنتاج على AWS يُستبدل بـ RS256/ES256
 * مع مفتاح خاص في KMS ونشر JWKS على {@code /.well-known/jwks.json}، فتتحقق باقي
 * الخدمات دون الحاجة لمعرفة أي سرّ مشترك.
 */
@Service
public class TokenService {

    private final JwtProperties props;
    private final SecretKey key;
    private final SecureRandom random = new SecureRandom();

    public TokenService(JwtProperties props) {
        this.props = props;
        this.key = Keys.hmacShaKeyFor(props.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String issueAccessToken(User user) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(props.accessTtlSeconds());
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .issuer(props.issuer())
                .subject(user.getId().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .claim("email", user.getEmail())
                .claim("name", user.getFullName())
                .claim("locale", user.getLocale())
                .claim("roles", List.copyOf(user.getRoles()))
                .signWith(key)
                .compact();
    }

    /** توكن التحديث قيمة عشوائية غير مفهرسة (opaque) — أقصر وأسهل في الإبطال من JWT. */
    public String generateRefreshToken() {
        byte[] buf = new byte[48];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    public String hash(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public Claims parse(String token) throws JwtException {
        Jws<Claims> jws = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(props.issuer())
                .clockSkewSeconds(30)
                .build()
                .parseSignedClaims(token);
        return jws.getPayload();
    }

    public long accessTtlSeconds() {
        return props.accessTtlSeconds();
    }

    public long refreshTtlSeconds() {
        return props.refreshTtlSeconds();
    }
}
