package kr.salu.auth;

import java.util.Collection;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import kr.salu.member.MemberAccount;

public final class MemberPrincipal implements UserDetails, CredentialsContainer, org.springframework.security.oauth2.core.oidc.user.OidcUser {
    private final long id;
    private final String email;
    private final String displayName;
    private final boolean active;
    private String password;
    private final String storageContext = java.util.UUID.randomUUID().toString();
    private java.util.Map<String,Object> attributes = java.util.Map.of();
    private org.springframework.security.oauth2.core.oidc.OidcIdToken idToken;
    private org.springframework.security.oauth2.core.oidc.OidcUserInfo userInfo;

    public MemberPrincipal(MemberAccount account) {
        id = account.id(); email = account.email(); displayName = account.displayName();
        active = "ACTIVE".equals(account.status()); password = account.passwordHash();
    }
    public long id() { return id; }
    public String storageContext() { return storageContext; }
    public MemberPrincipal social(org.springframework.security.oauth2.core.user.OAuth2User user) {
        password = null;
        // 사용자 정보와 토큰은 세션 안에서만 보관하며 응답 DTO에 노출하지 않음
        attributes = java.util.Map.copyOf(user.getAttributes());
        if (user instanceof org.springframework.security.oauth2.core.oidc.user.OidcUser oidc) { idToken=oidc.getIdToken(); userInfo=oidc.getUserInfo(); }
        return this;
    }
    @Override public String getName() { return Long.toString(id); }
    @Override public java.util.Map<String,Object> getAttributes() { return attributes; }
    @Override public java.util.Map<String,Object> getClaims() { return attributes; }
    @Override public org.springframework.security.oauth2.core.oidc.OidcIdToken getIdToken() { return idToken; }
    @Override public org.springframework.security.oauth2.core.oidc.OidcUserInfo getUserInfo() { return userInfo; }
    public String email() { return email; }
    public String displayName() { return displayName; }
    @Override public String getUsername() { return email != null ? email : "member-" + id; }
    @Override public String getPassword() { return password; }
    @Override public boolean isEnabled() { return active; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return java.util.List.of(new SimpleGrantedAuthority("ROLE_MEMBER"));
    }
    @Override public void eraseCredentials() { password = null; }
}
