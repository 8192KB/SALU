package kr.salu.member;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MemberMapper {
    @Select("SELECT id, email, password_hash, display_name, status, role FROM members WHERE email = #{email}")
    MemberAccount findByEmail(String email);

    @Select("SELECT id, email, password_hash, display_name, status, role FROM members WHERE id = #{id}")
    MemberAccount findById(long id);

    @Insert("INSERT INTO members(email, password_hash, display_name, status) VALUES (#{email}, #{passwordHash}, #{displayName}, 'ACTIVE')")
    int createLocal(@Param("email") String email, @Param("passwordHash") String passwordHash,
                    @Param("displayName") String displayName);

    @Select("SELECT COUNT(*) > 0 FROM members WHERE email = #{email}")
    boolean emailExists(String email);

    @Update("UPDATE members SET display_name = #{displayName} WHERE id = #{id} AND status = 'ACTIVE'")
    int rename(@Param("id") long id, @Param("displayName") String displayName);

    // 읽은 해시가 그대로일 때만 바꿈. 그 사이 다른 요청이 바꿨으면 0행
    @Update("UPDATE members SET password_hash = #{next} WHERE id = #{id} AND status = 'ACTIVE' AND password_hash = #{previous}")
    int changePassword(@Param("id") long id, @Param("previous") String previous, @Param("next") String next);
}
