package kr.salu.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    private final AccountService accounts;
    public AuthController(AccountService accounts) { this.accounts = accounts; }
    @GetMapping("/api/auth/me")
    ResponseEntity<SessionMember> currentMember(@AuthenticationPrincipal MemberPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(accounts.current(principal));
    }
    @PatchMapping("/api/auth/me")
    ResponseEntity<SessionMember> rename(@AuthenticationPrincipal MemberPrincipal principal, @Valid @RequestBody AccountRequests.Rename request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(accounts.rename(principal, request.displayName()));
    }
    @PostMapping("/api/auth/email-check")
    ResponseEntity<Map<String, Boolean>> emailCheck(@Valid @RequestBody AccountRequests.EmailCheck request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("available", accounts.emailAvailable(request.email())));
    }
    @PostMapping("/api/auth/password")
    ResponseEntity<Void> changePassword(@AuthenticationPrincipal MemberPrincipal principal, @Valid @RequestBody AccountRequests.PasswordChange request, HttpServletRequest http) {
        accounts.changePassword(principal, request.currentPassword(), request.newPassword());
        // 비밀번호를 바꾼 세션은 ID를 새로 받음
        http.changeSessionId();
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
