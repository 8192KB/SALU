package kr.salu.review;

import java.time.Instant;
import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface ReviewMapper {
    record Review(String id, String consultationId, String designerId, long authorId, String authorName, int rating, String content, Instant createdAt, Instant updatedAt) {}
    record Target(String id, long customerId, String designerId, long designerMemberId, String status, String customerName) {}
    record Summary(int count, Double average) {}
    String REVIEW = "SELECT id,consultation_id,designer_id,author_id,author_name,rating,content,created_at,updated_at FROM designer_reviews ";
    @Select("SELECT c.id,c.customer_id,c.designer_id,p.member_id AS designer_member_id,c.status,c.customer_name FROM consultations c JOIN designer_profiles p ON p.id=c.designer_id WHERE c.id=#{id} FOR UPDATE") Target lockConsultation(String id);
    @Select("SELECT c.id,c.customer_id,c.designer_id,p.member_id AS designer_member_id,c.status,c.customer_name FROM consultations c JOIN designer_profiles p ON p.id=c.designer_id WHERE c.id=#{id}") Target consultation(String id);
    @Select(REVIEW + "WHERE consultation_id=#{consultation}") Review byConsultation(String consultation);
    @Insert("INSERT INTO designer_reviews(id,consultation_id,designer_id,author_id,author_name,rating,content) VALUES(#{id},#{target.id},#{target.designerId},#{target.customerId},#{target.customerName},#{rating},#{content})") int insert(String id, Target target, int rating, String content);
    @Update("UPDATE designer_reviews SET rating=#{rating},content=#{content} WHERE consultation_id=#{consultation} AND author_id=#{author}") int update(String consultation, long author, int rating, String content);
    @Delete("DELETE FROM designer_reviews WHERE consultation_id=#{consultation} AND author_id=#{author}") int delete(String consultation, long author);
    @Select("SELECT p.id FROM designer_profiles p JOIN members m ON m.id=p.member_id WHERE p.id=#{id} AND p.visibility='PUBLIC' AND m.status='ACTIVE'") String publicDesigner(String id);
    @Select(REVIEW + "WHERE designer_id=#{designer} ORDER BY created_at DESC,id LIMIT 100") List<Review> byDesigner(String designer);
    @Select("SELECT COUNT(*) AS count,ROUND(AVG(rating),1) AS average FROM designer_reviews WHERE designer_id=#{designer}") Summary summary(String designer);
}
