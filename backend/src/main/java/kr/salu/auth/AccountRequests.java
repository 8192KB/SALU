package kr.salu.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Locale;

public final class AccountRequests {
    private AccountRequests() {}
    public record EmailCheck(@NotBlank @Email @Size(max = 254) String email) {
        public EmailCheck { email = email == null ? null : email.strip().toLowerCase(Locale.ROOT); }
    }
    public record Rename(@NotBlank @Size(max = 50) String displayName) {
        public Rename { displayName = displayName == null ? null : displayName.strip(); }
    }
    public record PasswordChange(@NotBlank @Size(max = 72) String currentPassword, @NotBlank @Size(min = 8, max = 72) String newPassword) {
        @Override public String toString() { return "PasswordChange"; }
    }
}
