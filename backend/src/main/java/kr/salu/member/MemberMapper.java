package kr.salu.member;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MemberMapper {
    @Select("SELECT id, email, password_hash, display_name, status FROM members WHERE email = #{email}")
    MemberAccount findByEmail(String email);

    @Select("SELECT id, email, password_hash, display_name, status FROM members WHERE id = #{id}")
    MemberAccount findById(long id);

    @Insert("INSERT INTO members(email, password_hash, display_name, status) VALUES (#{email}, #{passwordHash}, #{displayName}, 'ACTIVE')")
    int createLocal(@Param("email") String email, @Param("passwordHash") String passwordHash,
                    @Param("displayName") String displayName);
}
