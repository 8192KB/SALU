package kr.salu.auth;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
    @GetMapping("/api/auth/me")
    ResponseEntity<SessionMember> currentMember(@AuthenticationPrincipal MemberPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(SessionMember.from(principal));
    }
}
