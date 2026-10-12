package kr.salu.auth;

public record SessionMember(long id, String email, String displayName, String storageContext) {
    public static SessionMember from(MemberPrincipal principal) {
        return new SessionMember(principal.id(), principal.email(), principal.displayName(), principal.storageContext());
    }
}
