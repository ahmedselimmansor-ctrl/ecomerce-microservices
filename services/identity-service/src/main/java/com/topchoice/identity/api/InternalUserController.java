package com.topchoice.identity.api;

import com.topchoice.identity.error.ApiException;
import com.topchoice.identity.repository.UserRepository;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * نقاط داخلية للخدمات الأخرى (notification-service يحتاج الإيميل والاسم).
 *
 * <p>محمية بطبقتين: {@code x-internal-caller} كحاجز أول، و<b>NetworkPolicy</b>
 * في Kubernetes كحاجز حقيقي. الـ api-gateway تحظر أي مسار يحوي
 * {@code /internal/} فلا يمكن الوصول إليها من الإنترنت أصلًا.
 */
@RestController
@RequestMapping("/api/v1/internal/users")
public class InternalUserController {

    private final UserRepository users;

    public InternalUserController(UserRepository users) {
        this.users = users;
    }

    public record InternalUserView(String id, String email, String phone,
                                   String fullName, String locale) {
    }

    @GetMapping("/{userId}")
    public InternalUserView get(@PathVariable UUID userId,
                                @RequestHeader(value = "x-internal-caller", required = false) String caller) {
        if (caller == null || caller.isBlank()) {
            throw ApiException.forbidden("INTERNAL_ONLY",
                    "This endpoint is reachable from internal services only");
        }
        return users.findById(userId)
                .map(u -> new InternalUserView(u.getId().toString(), u.getEmail(),
                        u.getPhone(), u.getFullName(), u.getLocale()))
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User not found"));
    }
}
