package com.noon.identity.service;

import com.noon.identity.api.dto.Dtos.*;
import com.noon.identity.domain.Address;
import com.noon.identity.domain.User;
import com.noon.identity.error.ApiException;
import com.noon.identity.repository.AddressRepository;
import com.noon.identity.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class UserService {

    private static final int MAX_ADDRESSES = 20;

    private final UserRepository users;
    private final AddressRepository addresses;
    private final PasswordEncoder encoder;
    private final AuthService authService;

    public UserService(UserRepository users, AddressRepository addresses,
                       PasswordEncoder encoder, AuthService authService) {
        this.users = users;
        this.addresses = addresses;
        this.encoder = encoder;
        this.authService = authService;
    }

    @Transactional(readOnly = true)
    public UserView getProfile(UUID userId) {
        return UserView.of(loadUser(userId));
    }

    @Transactional
    public UserView updateProfile(UUID userId, UpdateProfileRequest req) {
        User user = loadUser(userId);
        if (req.fullName() != null && !req.fullName().isBlank()) {
            user.setFullName(req.fullName().trim());
        }
        if (req.phone() != null && !req.phone().isBlank()) {
            users.findByPhone(req.phone()).ifPresent(other -> {
                if (!other.getId().equals(userId)) {
                    throw ApiException.conflict("PHONE_TAKEN", "Phone already in use");
                }
            });
            user.setPhone(req.phone().trim());
        }
        if (req.locale() != null) {
            user.setLocale(req.locale());
        }
        return UserView.of(users.save(user));
    }

    /** تغيير كلمة المرور يُبطل كل الجلسات الأخرى. */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        User user = loadUser(userId);
        if (!encoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw ApiException.unauthorized("INVALID_CREDENTIALS", "Current password is incorrect");
        }
        if (encoder.matches(req.newPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("PASSWORD_UNCHANGED",
                    "New password must differ from the current one");
        }
        user.setPasswordHash(encoder.encode(req.newPassword()));
        users.save(user);
        authService.logoutAll(userId);
    }

    // --------------------------------------------------------------- addresses

    @Transactional(readOnly = true)
    public List<AddressView> listAddresses(UUID userId) {
        return addresses.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId)
                .stream().map(AddressView::of).toList();
    }

    @Transactional
    public AddressView addAddress(UUID userId, AddressRequest req) {
        long existing = addresses.countByUserId(userId);
        if (existing >= MAX_ADDRESSES) {
            throw ApiException.badRequest("TOO_MANY_ADDRESSES",
                    "Maximum of " + MAX_ADDRESSES + " addresses reached");
        }
        // أول عنوان يصبح الافتراضي تلقائيًا
        boolean makeDefault = Boolean.TRUE.equals(req.isDefault()) || existing == 0;
        if (makeDefault) {
            addresses.clearDefaults(userId);
        }
        Address saved = addresses.save(new Address(
                userId, req.label(), req.fullName(), req.phone(), req.line1(), req.line2(),
                req.area(), req.city(), req.country(), req.lat(), req.lng(), makeDefault));
        return AddressView.of(saved);
    }

    @Transactional
    public AddressView setDefaultAddress(UUID userId, UUID addressId) {
        Address address = addresses.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> ApiException.notFound("ADDRESS_NOT_FOUND", "Address not found"));
        addresses.clearDefaults(userId);
        address.setDefault(true);
        return AddressView.of(addresses.save(address));
    }

    @Transactional
    public void deleteAddress(UUID userId, UUID addressId) {
        Address address = addresses.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> ApiException.notFound("ADDRESS_NOT_FOUND", "Address not found"));
        boolean wasDefault = address.isDefault();
        addresses.delete(address);
        if (wasDefault) {
            // رقّي أحدث عنوان متبقٍ ليكون الافتراضي
            addresses.findByUserIdOrderByIsDefaultDescCreatedAtDesc(userId)
                    .stream().findFirst()
                    .ifPresent(next -> {
                        next.setDefault(true);
                        addresses.save(next);
                    });
        }
    }

    /** يستدعيها order-service وقت الـ checkout للتحقق من ملكية العنوان. */
    @Transactional(readOnly = true)
    public AddressView getAddress(UUID userId, UUID addressId) {
        return addresses.findByIdAndUserId(addressId, userId)
                .map(AddressView::of)
                .orElseThrow(() -> ApiException.notFound("ADDRESS_NOT_FOUND", "Address not found"));
    }

    private User loadUser(UUID userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "User not found"));
    }
}
