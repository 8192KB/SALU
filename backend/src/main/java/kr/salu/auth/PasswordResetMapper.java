package kr.salu.auth;

import org.apache.ibatis.annotations.*;

@Mapper
public interface PasswordResetMapper {
    record Target(long id, String email) {}
    record Token(long id, long memberId) {}
    @Select("SELECT id, email FROM members WHERE email = #{email} AND status = 'ACTIVE' AND password_hash IS NOT NULL FOR UPDATE") Target target(String email);
    @Select("SELECT COUNT(*) FROM password_reset_tokens WHERE member_id = #{member} AND created_at > CURRENT_TIMESTAMP(6) - INTERVAL 1 MINUTE") int recent(long member);
    @Update("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP(6) WHERE member_id = #{member} AND used_at IS NULL") int closeAll(long member);
    @Insert("INSERT INTO password_reset_tokens(member_id, token_hash, expires_at) VALUES (#{member}, #{hash}, CURRENT_TIMESTAMP(6) + INTERVAL 30 MINUTE)") int insert(long member, String hash);
    @Select("SELECT t.id, t.member_id FROM password_reset_tokens t JOIN members m ON m.id = t.member_id WHERE t.token_hash = #{hash} AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP(6) AND m.status = 'ACTIVE' AND m.password_hash IS NOT NULL FOR UPDATE") Token usable(String hash);
    @Update("UPDATE members SET password_hash = #{next} WHERE id = #{id} AND status = 'ACTIVE' AND password_hash IS NOT NULL") int setPassword(long id, String next);
}
