package kr.salu.auth;

public record SessionMember(long id, String email, String displayName) {
    public static SessionMember from(MemberPrincipal principal) {
        return new SessionMember(principal.id(), principal.getUsername(), principal.displayName());
    }
}
