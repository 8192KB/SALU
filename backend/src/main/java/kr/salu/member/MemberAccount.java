package kr.salu.member;

public record MemberAccount(long id, String email, String passwordHash, String displayName, String status, String role) {
    @Override public String toString() { return "MemberAccount[id=" + id + "]"; }
}
