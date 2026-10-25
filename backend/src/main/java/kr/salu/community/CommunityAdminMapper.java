package kr.salu.community;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface CommunityAdminMapper {
    record ReportedPost(String id, String title, long authorId, String authorName, String status, int openCount, String reasons, Instant latestAt) {}
    record ReportedComment(long id, String postId, String content, long authorId, String authorName, String status, int openCount, String reasons, Instant latestAt) {}
    record Report(String reason, String detail, String status, Instant createdAt) {}
    record Sanction(long id, long memberId, String reason, Instant endsAt, Instant createdAt, Instant liftedAt) {}

    @Select("SELECT p.id,p.title,p.author_id,p.author_name,p.status,COUNT(*) AS open_count,GROUP_CONCAT(DISTINCT r.reason ORDER BY r.reason) AS reasons,MAX(r.created_at) AS latest_at "
        + "FROM community_post_reports r JOIN community_posts p ON p.id=r.post_id WHERE r.status='OPEN' GROUP BY p.id,p.title,p.author_id,p.author_name,p.status ORDER BY latest_at DESC LIMIT 100")
    List<ReportedPost> reportedPosts();
    @Select("SELECT c.id,c.post_id,c.content,c.author_id,c.author_name,c.status,COUNT(*) AS open_count,GROUP_CONCAT(DISTINCT r.reason ORDER BY r.reason) AS reasons,MAX(r.created_at) AS latest_at "
        + "FROM community_comment_reports r JOIN community_comments c ON c.id=r.comment_id WHERE r.status='OPEN' GROUP BY c.id,c.post_id,c.content,c.author_id,c.author_name,c.status ORDER BY latest_at DESC LIMIT 100")
    List<ReportedComment> reportedComments();
    @Select("SELECT reason,detail,status,created_at FROM community_post_reports WHERE post_id=#{post} ORDER BY created_at DESC LIMIT 100") List<Report> postReports(String post);
    @Select("SELECT reason,detail,status,created_at FROM community_comment_reports WHERE comment_id=#{comment} ORDER BY created_at DESC LIMIT 100") List<Report> commentReports(long comment);
    @Update("UPDATE community_posts SET status=#{status} WHERE id=#{post} AND status IN ('VISIBLE','HIDDEN')") int setPostStatus(String post, String status);
    @Update("UPDATE community_comments SET status=#{status} WHERE id=#{comment} AND status IN ('VISIBLE','HIDDEN')") int setCommentStatus(long comment, String status);
    @Update("UPDATE community_post_reports SET status=#{status},handled_at=CURRENT_TIMESTAMP(6),handled_by=#{admin} WHERE post_id=#{post} AND status='OPEN'") int closePostReports(String post, String status, long admin);
    @Update("UPDATE community_comment_reports SET status=#{status},handled_at=CURRENT_TIMESTAMP(6),handled_by=#{admin} WHERE comment_id=#{comment} AND status='OPEN'") int closeCommentReports(long comment, String status, long admin);
    // 숨겼던 것을 다시 보이게 하면 받아들였던 신고도 기각으로 바꿔 실제 상태와 맞춤
    @Update("UPDATE community_post_reports SET status='DISMISSED',handled_at=CURRENT_TIMESTAMP(6),handled_by=#{admin} WHERE post_id=#{post} AND status='ACCEPTED'") int dismissAcceptedPostReports(String post, long admin);
    @Update("UPDATE community_comment_reports SET status='DISMISSED',handled_at=CURRENT_TIMESTAMP(6),handled_by=#{admin} WHERE comment_id=#{comment} AND status='ACCEPTED'") int dismissAcceptedCommentReports(long comment, long admin);
    @Select("SELECT COUNT(*) FROM members WHERE id=#{member}") int memberExists(long member);
    @Insert("INSERT INTO member_sanctions(member_id,reason,ends_at,created_by) VALUES(#{member},#{reason},CASE WHEN #{days,jdbcType=INTEGER} IS NULL THEN NULL ELSE CURRENT_TIMESTAMP(6) + INTERVAL #{days,jdbcType=INTEGER} DAY END,#{admin})") int insertSanction(long member, String reason, Integer days, long admin);
    @Select("SELECT LAST_INSERT_ID()") long lastId();
    @Select("SELECT id,member_id,reason,ends_at,created_at,lifted_at FROM member_sanctions WHERE id=#{id}") Sanction sanction(long id);
    @Select("SELECT id,member_id,reason,ends_at,created_at,lifted_at FROM member_sanctions WHERE member_id=#{member} ORDER BY created_at DESC,id DESC LIMIT 100") List<Sanction> sanctions(long member);
    @Update("UPDATE member_sanctions SET lifted_at=CURRENT_TIMESTAMP(6),lifted_by=#{admin} WHERE id=#{id} AND lifted_at IS NULL") int lift(long id, long admin);
}
