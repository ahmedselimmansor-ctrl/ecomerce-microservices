package com.topchoice.identity.api;

import com.topchoice.identity.api.dto.Dtos.*;
import com.topchoice.identity.service.UserService;
import com.topchoice.identity.web.AuthInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService users;

    public UserController(UserService users) {
        this.users = users;
    }

    @GetMapping("/me")
    public UserView me(HttpServletRequest req) {
        return users.getProfile(currentUser(req));
    }

    @PatchMapping("/me")
    public UserView updateMe(HttpServletRequest req,
                             @Valid @RequestBody UpdateProfileRequest body) {
        return users.updateProfile(currentUser(req), body);
    }

    @PostMapping("/me/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(HttpServletRequest req,
                               @Valid @RequestBody ChangePasswordRequest body) {
        users.changePassword(currentUser(req), body);
    }

    // --------------------------------------------------------------- addresses

    @GetMapping("/me/addresses")
    public ListResponse<AddressView> listAddresses(HttpServletRequest req) {
        return ListResponse.of(users.listAddresses(currentUser(req)));
    }

    @PostMapping("/me/addresses")
    @ResponseStatus(HttpStatus.CREATED)
    public AddressView addAddress(HttpServletRequest req,
                                  @Valid @RequestBody AddressRequest body) {
        return users.addAddress(currentUser(req), body);
    }

    @GetMapping("/me/addresses/{addressId}")
    public AddressView getAddress(HttpServletRequest req, @PathVariable UUID addressId) {
        return users.getAddress(currentUser(req), addressId);
    }

    @PutMapping("/me/addresses/{addressId}/default")
    public AddressView setDefault(HttpServletRequest req, @PathVariable UUID addressId) {
        return users.setDefaultAddress(currentUser(req), addressId);
    }

    @DeleteMapping("/me/addresses/{addressId}")
    public ResponseEntity<Void> deleteAddress(HttpServletRequest req, @PathVariable UUID addressId) {
        users.deleteAddress(currentUser(req), addressId);
        return ResponseEntity.noContent().build();
    }

    private static UUID currentUser(HttpServletRequest req) {
        return (UUID) req.getAttribute(AuthInterceptor.ATTR_USER_ID);
    }
}
