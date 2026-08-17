package com.topchoice.identity.web;

import com.topchoice.identity.error.ApiException;
import com.topchoice.identity.service.TokenService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

/**
 * Zero-trust: الخدمة تتحقق من التوكن بنفسها ولا تثق في ترويسة
 * {@code X-User-Id} القادمة من الـ gateway وحدها.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_USER_ID = "topchoice.userId";
    public static final String ATTR_ROLES = "topchoice.roles";

    private final TokenService tokens;

    public AuthInterceptor(TokenService tokens) {
        this.tokens = tokens;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw ApiException.unauthorized("MISSING_TOKEN", "Authorization header is required");
        }
        try {
            Claims claims = tokens.parse(header.substring(7).trim());
            request.setAttribute(ATTR_USER_ID, UUID.fromString(claims.getSubject()));
            request.setAttribute(ATTR_ROLES, claims.get("roles"));
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            throw ApiException.unauthorized("INVALID_TOKEN", "Access token is invalid or expired");
        }
    }
}
