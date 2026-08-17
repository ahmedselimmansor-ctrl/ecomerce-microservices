package com.topchoice.identity.api.dto;

import com.topchoice.identity.domain.Address;
import com.topchoice.identity.domain.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** كل عقود الـ API لهذه الخدمة في مكان واحد. */
public final class Dtos {

    private Dtos() {
    }

    // ------------------------------------------------------------------ auth

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 160) String email,
            @Pattern(regexp = "^\\+?[0-9]{7,20}$", message = "phone must be a valid E.164 number")
            String phone,
            @NotBlank @Size(min = 8, max = 72, message = "password must be 8-72 characters")
            String password,
            @NotBlank @Size(max = 160) String fullName,
            String locale) {
    }

    public record LoginRequest(
            @NotBlank String email,
            @NotBlank String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record IntrospectRequest(@NotBlank String token) {
    }

    public record TokenPair(
            String accessToken,
            String refreshToken,
            String tokenType,
            long expiresIn,
            UserView user) {
    }

    public record IntrospectResponse(
            boolean active,
            String userId,
            Set<String> roles,
            Long expiresAt) {
    }

    // ------------------------------------------------------------------ user

    public record UserView(
            UUID id,
            String email,
            String phone,
            String fullName,
            String locale,
            boolean emailVerified,
            Set<String> roles) {

        public static UserView of(User u) {
            return new UserView(u.getId(), u.getEmail(), u.getPhone(), u.getFullName(),
                    u.getLocale(), u.isEmailVerified(), u.getRoles());
        }
    }

    public record UpdateProfileRequest(
            @Size(max = 160) String fullName,
            @Pattern(regexp = "^\\+?[0-9]{7,20}$") String phone,
            @Pattern(regexp = "^(ar|en)$") String locale) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 72) String newPassword) {
    }

    // --------------------------------------------------------------- address

    public record AddressRequest(
            @Size(max = 48) String label,
            @NotBlank @Size(max = 160) String fullName,
            @NotBlank @Pattern(regexp = "^\\+?[0-9]{7,20}$") String phone,
            @NotBlank @Size(max = 255) String line1,
            @Size(max = 255) String line2,
            @Size(max = 120) String area,
            @NotBlank @Size(max = 120) String city,
            @Pattern(regexp = "^[A-Z]{2}$") String country,
            BigDecimal lat,
            BigDecimal lng,
            Boolean isDefault) {
    }

    public record AddressView(
            UUID id, String label, String fullName, String phone,
            String line1, String line2, String area, String city, String country,
            BigDecimal lat, BigDecimal lng, boolean isDefault) {

        public static AddressView of(Address a) {
            return new AddressView(a.getId(), a.getLabel(), a.getFullName(), a.getPhone(),
                    a.getLine1(), a.getLine2(), a.getArea(), a.getCity(), a.getCountry(),
                    a.getLat(), a.getLng(), a.isDefault());
        }
    }

    public record ListResponse<T>(List<T> items, int count) {
        public static <T> ListResponse<T> of(List<T> items) {
            return new ListResponse<>(items, items.size());
        }
    }
}
