package kr.salu.auth;

public record SessionMember(long id, String email, String displayName, String storageContext, String role) {
    public static SessionMember from(MemberPrincipal principal) { return from(principal, principal.displayName()); }
    public static SessionMember from(MemberPrincipal principal, String displayName) {
        return new SessionMember(principal.id(), principal.email(), displayName, principal.storageContext(), principal.role());
    }
}
