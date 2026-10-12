package kr.salu.auth;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SignupController {
    private final SignupService signup;
    public SignupController(SignupService signup) { this.signup = signup; }
    @PostMapping("/api/auth/signup")
    ResponseEntity<Void> create(@Valid @RequestBody SignupRequest request) {
        signup.signup(request);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).build();
    }
}
