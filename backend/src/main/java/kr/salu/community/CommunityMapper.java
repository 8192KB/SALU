package kr.salu.community;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface CommunityMapper {
    record PostRow(String id, long authorId, String authorName, byte[] contentHash, String category, String title, String content,
        LocalDate cutDate, String service, String summary, String status, Instant createdAt, Instant updatedAt,
        int photoCount, int commentCount, int reactionCount, boolean reacted, int openReports) {}
    record ActiveSanction(java.time.Instant endsAt, String reason) {}
    record Locked(String id, long authorId, String status) {}
    record CommentRow(long id, String postId, long authorId, String authorName, String clientKey, String content, String status, Instant createdAt) {}
    record Photo(String contentType, byte[] data) {}
    // 수는 반응·댓글 표에서 셈. 열 순서가 PostRow 생성자 순서와 같아야 함
    String POST = "SELECT p.id,p.author_id,p.author_name,p.content_hash,p.category,p.title,p.content,p.cut_date,p.service,p.summary,p.status,p.created_at,p.updated_at,"
        + "(SELECT COUNT(*) FROM community_post_photos f WHERE f.post_id=p.id) AS photo_count,"
        + "(SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id AND c.status='VISIBLE') AS comment_count,"
        + "(SELECT COUNT(*) FROM community_reactions r WHERE r.post_id=p.id) AS reaction_count,"
        + "EXISTS(SELECT 1 FROM community_reactions r WHERE r.post_id=p.id AND r.member_id=#{viewer}) AS reacted,"
        + "(SELECT COUNT(*) FROM community_post_reports o WHERE o.post_id=p.id AND o.status='OPEN') AS open_reports "
        + "FROM community_posts p ";
    String COMMENT = "SELECT id,post_id,author_id,author_name,client_key,content,status,created_at FROM community_comments ";

    @Select("SELECT display_name FROM members WHERE id=#{member} AND status='ACTIVE' FOR UPDATE") String lockMember(long member);
    @Select("SELECT COUNT(*) FROM member_sanctions WHERE member_id=#{member} AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>CURRENT_TIMESTAMP(6))") int activeSanctions(long member);
    // 가장 늦게 끝나는 제재. 기간 없음(NULL)을 가장 늦은 것으로 봄
    @Select("SELECT ends_at,reason FROM member_sanctions WHERE member_id=#{member} AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>CURRENT_TIMESTAMP(6)) ORDER BY ends_at IS NULL DESC,ends_at DESC,id DESC LIMIT 1") ActiveSanction activeSanction(long member);

    @Select("<script>" + POST + "WHERE p.status='VISIBLE'"
        + "<if test='category != null'> AND p.category=#{category}</if>"
        + "<if test='service != null'> AND p.service=#{service}</if>"
        + "<if test='query != null'> AND (p.title LIKE CONCAT('%',#{query},'%') OR p.content LIKE CONCAT('%',#{query},'%') OR p.summary LIKE CONCAT('%',#{query},'%'))</if>"
        + "<if test='before != null'> AND (p.created_at,p.id) &lt; (SELECT b.created_at,b.id FROM community_posts b WHERE b.id=#{before})</if>"
        + " ORDER BY p.created_at DESC,p.id DESC LIMIT 30</script>")
    List<PostRow> posts(long viewer, String category, String service, String query, String before);
    @Select(POST + "WHERE p.author_id=#{viewer} AND p.status<>'DELETED' ORDER BY p.created_at DESC,p.id DESC LIMIT 100") List<PostRow> mine(long viewer);
    @Select(POST + "WHERE p.id=#{id}") PostRow post(String id, long viewer);
    @Select(POST + "WHERE p.author_id=#{viewer} AND p.request_key=#{key}") PostRow byRequestKey(long viewer, String key);
    @Insert("INSERT INTO community_posts(id,author_id,author_name,request_key,content_hash,category,title,content,cut_date,service,summary) VALUES(#{id},#{author},#{authorName},#{key},#{hash},#{category},#{title},#{content},#{cutDate},#{service},#{summary})")
    int insertPost(String id, long author, String authorName, String key, byte[] hash, String category, String title, String content, LocalDate cutDate, String service, String summary);
    @Insert("INSERT INTO community_post_photos(post_id,position,content_type,byte_size,data) VALUES(#{post},#{position},#{type},#{size},#{data})") int insertPhoto(String post, int position, String type, int size, byte[] data);
    @Select("SELECT f.content_type,f.data FROM community_post_photos f JOIN community_posts p ON p.id=f.post_id WHERE f.post_id=#{post} AND f.position=#{position} AND p.status='VISIBLE'") Photo photo(String post, int position);
    // 관리자 검토용이라 숨김·삭제된 글의 사진도 줌
    @Select("SELECT f.content_type,f.data FROM community_post_photos f WHERE f.post_id=#{post} AND f.position=#{position}") Photo adminPhoto(String post, int position);
    @Select("SELECT id,author_id,status FROM community_posts WHERE id=#{id} FOR UPDATE") Locked lockPost(String id);
    @Update("UPDATE community_posts SET title=#{title},content=#{content} WHERE id=#{id} AND author_id=#{author} AND status='VISIBLE'") int updatePost(String id, long author, String title, String content);
    @Update("UPDATE community_posts SET status='DELETED' WHERE id=#{id} AND author_id=#{author} AND status<>'DELETED'") int deletePost(String id, long author);

    @Select(COMMENT + "WHERE post_id=#{post} AND (status='VISIBLE' OR (status='HIDDEN' AND author_id=#{viewer})) ORDER BY id LIMIT 300") List<CommentRow> comments(String post, long viewer);
    @Select(COMMENT + "WHERE post_id=#{post} AND author_id=#{author} AND client_key=#{key}") CommentRow commentByKey(String post, long author, String key);
    @Select(COMMENT + "WHERE id=#{id}") CommentRow comment(long id);
    @Select(COMMENT + "WHERE id=#{id} FOR UPDATE") CommentRow lockComment(long id);
    @Insert("INSERT INTO community_comments(post_id,author_id,author_name,client_key,content) VALUES(#{post},#{author},#{authorName},#{key},#{content})") int insertComment(String post, long author, String authorName, String key, String content);
    @Select("SELECT LAST_INSERT_ID()") long lastId();
    @Update("UPDATE community_comments SET status='DELETED' WHERE id=#{id} AND author_id=#{author} AND status<>'DELETED'") int deleteComment(long id, long author);

    @Insert("INSERT INTO community_reactions(post_id,member_id) VALUES(#{post},#{member}) ON DUPLICATE KEY UPDATE member_id=member_id") int react(String post, long member);
    @Delete("DELETE FROM community_reactions WHERE post_id=#{post} AND member_id=#{member}") int unreact(String post, long member);

    @Insert("INSERT INTO community_post_reports(post_id,reporter_id,reason,detail) VALUES(#{post},#{reporter},#{reason},#{detail})") int reportPost(String post, long reporter, String reason, String detail);
    @Insert("INSERT INTO community_comment_reports(comment_id,reporter_id,reason,detail) VALUES(#{comment},#{reporter},#{reason},#{detail})") int reportComment(long comment, long reporter, String reason, String detail);
    @Select("SELECT COUNT(*) FROM community_post_reports WHERE post_id=#{post} AND status='OPEN'") int openPostReports(String post);
    @Select("SELECT COUNT(*) FROM community_comment_reports WHERE comment_id=#{comment} AND status='OPEN'") int openCommentReports(long comment);
    @Update("UPDATE community_posts SET status='HIDDEN' WHERE id=#{post} AND status='VISIBLE'") int hidePost(String post);
    @Update("UPDATE community_comments SET status='HIDDEN' WHERE id=#{comment} AND status='VISIBLE'") int hideComment(long comment);
}
