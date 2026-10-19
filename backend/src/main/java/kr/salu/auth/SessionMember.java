package kr.salu.auth;

public record SessionMember(long id, String email, String displayName, String storageContext, String role) {
    public static SessionMember from(MemberPrincipal principal) {
        return new SessionMember(principal.id(), principal.email(), principal.displayName(), principal.storageContext(), principal.role());
    }
}
