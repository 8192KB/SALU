package kr.salu.auth.social;
import java.util.List;
import org.apache.ibatis.annotations.*;
@Mapper
public interface SocialMapper {
    @Select("SELECT member_id FROM social_identities WHERE provider=#{provider} AND provider_subject=#{subject}") Long find(String provider,String subject);
    @Select("SELECT provider FROM social_identities WHERE member_id=#{owner} ORDER BY provider") List<String> linked(long owner);
    @Select("SELECT id FROM members WHERE id=#{owner} AND status='ACTIVE' FOR UPDATE") Long activeLock(long owner);
    @Insert("INSERT INTO members(email,password_hash,display_name) VALUES(NULL,NULL,#{name})") int newMember(String name);
    @Select("SELECT LAST_INSERT_ID()") long newId();
    @Insert("INSERT INTO social_identities(provider,provider_subject,member_id) VALUES(#{provider},#{subject},#{owner})") int link(String provider,String subject,long owner);
}
