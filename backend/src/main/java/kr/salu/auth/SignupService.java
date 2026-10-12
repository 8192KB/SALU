package kr.salu.auth;

import java.nio.charset.StandardCharsets;
import kr.salu.common.error.ApiException;
import kr.salu.member.MemberMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SignupService {
    private final MemberMapper members;
    private final PasswordEncoder passwords;
    public SignupService(MemberMapper members, PasswordEncoder passwords) {
        this.members = members;
        this.passwords = passwords;
    }
    @Transactional
    public void signup(SignupRequest request) {
        if (!request.email().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
                || request.password().getBytes(StandardCharsets.UTF_8).length > 72)
            throw ApiException.invalidRequest();
        if (members.createLocal(request.email(), passwords.encode(request.password()), request.displayName()) != 1)
            throw ApiException.conflict();
    }
}
