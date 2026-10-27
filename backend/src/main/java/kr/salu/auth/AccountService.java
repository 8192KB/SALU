package kr.salu.auth;

import java.nio.charset.StandardCharsets;
import kr.salu.common.error.ApiException;
import kr.salu.member.MemberAccount;
import kr.salu.member.MemberMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    private final MemberMapper members;
    private final PasswordEncoder passwords;
    public AccountService(MemberMapper members, PasswordEncoder passwords) {
        this.members = members;
        this.passwords = passwords;
    }
    @Transactional(readOnly = true)
    public boolean emailAvailable(String email) {
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw ApiException.invalidRequest();
        return !members.emailExists(email);
    }
    // 세션의 이름은 로그인할 때 값이라 화면에 보낼 이름은 DB에서 다시 읽음
    @Transactional(readOnly = true)
    public SessionMember current(MemberPrincipal principal) {
        MemberAccount account = members.findById(principal.id());
        if (account == null) throw ApiException.notFound();
        return SessionMember.from(principal, account.displayName());
    }
    @Transactional
    public SessionMember rename(MemberPrincipal principal, String displayName) {
        if (members.rename(principal.id(), displayName) != 1) throw ApiException.notFound();
        return SessionMember.from(principal, displayName);
    }
    @Transactional
    public void changePassword(MemberPrincipal principal, String current, String next) {
        if (next.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.invalidRequest();
        MemberAccount account = members.findById(principal.id());
        if (account == null) throw ApiException.notFound();
        if (account.passwordHash() == null) throw ApiException.passwordNotSet();
        if (!passwords.matches(current, account.passwordHash())) throw ApiException.currentPasswordInvalid();
        if (members.changePassword(principal.id(), account.passwordHash(), passwords.encode(next)) != 1)
            throw ApiException.conflict();
    }
}
