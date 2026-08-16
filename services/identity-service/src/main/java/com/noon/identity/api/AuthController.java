package com.noon.identity.api;

import com.noon.identity.api.dto.Dtos.*;
import com.noon.identity.service.AuthService;
import com.noon.identity.web.AuthInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public TokenPair register(@Valid @RequestBody RegisterRequest req,
                              @RequestHeader(value = "User-Agent", required = false) String ua) {
        return auth.register(req, ua);
    }

    @PostMapping("/login")
    public TokenPair login(@Valid @RequestBody LoginRequest req,
                           @RequestHeader(value = "User-Agent", required = false) String ua) {
        return auth.login(req, ua);
    }

    @PostMapping("/refresh")
    public TokenPair refresh(@Valid @RequestBody RefreshRequest req,
                             @RequestHeader(value = "User-Agent", required = false) String ua) {
        return auth.refresh(req.refreshToken(), ua);
    }

    /** يستدعيها api-gateway للتحقق من التوكن (بديل مشاركة السرّ). */
    @PostMapping("/introspect")
    public IntrospectResponse introspect(@Valid @RequestBody IntrospectRequest req) {
        return auth.introspect(req.token());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest req) {
        auth.logout(req.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll(HttpServletRequest request) {
        UUID userId = (UUID) request.getAttribute(AuthInterceptor.ATTR_USER_ID);
        auth.logoutAll(userId);
        return ResponseEntity.noContent().build();
    }
}
