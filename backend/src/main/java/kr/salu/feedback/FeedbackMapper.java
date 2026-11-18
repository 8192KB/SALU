package kr.salu.feedback;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface FeedbackMapper {
    record Saved(long id, Long memberId, String content, Instant createdAt) {}
    record Row(long id, Long memberId, String authorName, String content, Instant createdAt) {}

    @Select("SELECT id,member_id,content,created_at FROM member_feedback WHERE request_key=#{key}") Saved byKey(String key);
    @Insert("INSERT INTO member_feedback(member_id,request_key,content) VALUES(#{member,jdbcType=BIGINT},#{key},#{content})") int insert(Long member, String key, String content);
    @Select("SELECT id,member_id,content,created_at FROM member_feedback WHERE id=LAST_INSERT_ID()") Saved last();
    // 이름은 보낸 때가 아니라 지금 회원 이름. 이메일은 꺼내지 않음. 로그인 전에 보낸 것은 회원이 없음
    @Select("SELECT f.id,f.member_id,m.display_name AS author_name,f.content,f.created_at FROM member_feedback f LEFT JOIN members m ON m.id=f.member_id ORDER BY f.created_at DESC,f.id DESC LIMIT 100")
    List<Row> recent();
}
