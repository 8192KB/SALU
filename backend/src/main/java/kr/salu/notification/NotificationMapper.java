package kr.salu.notification;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface NotificationMapper {
    record Row(long id, String type, String targetId, String actorName, Instant createdAt, Instant readAt) {}
    @Insert("INSERT INTO notifications(member_id,type,target_id,actor_name) VALUES(#{member},#{type},#{target},#{actor,jdbcType=VARCHAR})") int insert(long member, String type, String target, String actor);
    @Select("SELECT LAST_INSERT_ID()") long lastId();
    @Select("SELECT id,type,target_id,actor_name,created_at,read_at FROM notifications WHERE member_id=#{member} ORDER BY id DESC LIMIT 50") List<Row> recent(long member);
    @Select("SELECT COUNT(*) FROM notifications WHERE member_id=#{member} AND read_at IS NULL") int unread(long member);
    // 이미 읽은 알림도 찾은 행으로 세어 다시 눌러도 성공함. 다른 회원의 알림은 0행
    @Update("UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP(6)) WHERE id=#{id} AND member_id=#{member}") int read(long id, long member);
    @Update("UPDATE notifications SET read_at=CURRENT_TIMESTAMP(6) WHERE member_id=#{member} AND read_at IS NULL") int readAll(long member);
}
