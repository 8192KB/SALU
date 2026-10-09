package kr.salu.member;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MemberMapper {
    @Select("SELECT id, email, password_hash, display_name, status FROM members WHERE email = #{email}")
    MemberAccount findByEmail(String email);

    @Select("SELECT id, email, password_hash, display_name, status FROM members WHERE id = #{id}")
    MemberAccount findById(long id);
}
