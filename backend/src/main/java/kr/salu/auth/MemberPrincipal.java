package kr.salu.auth;

import java.util.Collection;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import kr.salu.member.MemberAccount;

public final class MemberPrincipal implements UserDetails, CredentialsContainer {
    private final long id;
    private final String email;
    private final String displayName;
    private final boolean active;
    private String password;

    public MemberPrincipal(MemberAccount account) {
        id = account.id(); email = account.email(); displayName = account.displayName();
        active = "ACTIVE".equals(account.status()); password = account.passwordHash();
    }
    public long id() { return id; }
    public String displayName() { return displayName; }
    @Override public String getUsername() { return email; }
    @Override public String getPassword() { return password; }
    @Override public boolean isEnabled() { return active; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return java.util.List.of(new SimpleGrantedAuthority("ROLE_MEMBER"));
    }
    @Override public void eraseCredentials() { password = null; }
}
