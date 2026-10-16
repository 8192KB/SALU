package kr.salu.consultation;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import kr.salu.backup.BackupCrypto;
import org.apache.ibatis.annotations.*;

@Mapper
public interface ConsultationMapper {
    record Row(String id, long customerId, String designerId, long designerMemberId, byte[] contentHash,
        String customerName, String designerName, String salonName, LocalDate cutDate, String service, String summary,
        String requestText, String status, String replyText, Instant sentAt, Instant repliedAt, boolean hasPhoto) {}
    record Designer(String id, long memberId, String name, String salonName) {}
    record Photo(String contentType, String keyId, byte[] nonce, byte[] ciphertext) {}
    String ROW = "SELECT c.id,c.customer_id,c.designer_id,p.member_id AS designer_member_id,c.content_hash,c.customer_name,c.designer_name,c.salon_name,c.cut_date,c.service,c.summary,c.request_text,c.status,c.reply_text,c.sent_at,c.replied_at,(f.consultation_id IS NOT NULL) AS has_photo FROM consultations c JOIN designer_profiles p ON p.id=c.designer_id LEFT JOIN consultation_photos f ON f.consultation_id=c.id ";
    @Select("SELECT display_name FROM members WHERE id=#{member} AND status='ACTIVE' FOR UPDATE") String lockMember(long member);
    @Select("SELECT p.id,p.member_id,p.name,CASE WHEN s.id IS NULL THEN NULL ELSE TRIM(CONCAT(s.name,' ',s.branch)) END AS salon_name FROM designer_profiles p JOIN members m ON m.id=p.member_id LEFT JOIN designer_affiliations a ON a.designer_id=p.id LEFT JOIN salons s ON s.id=a.salon_id WHERE p.id=#{id} AND p.visibility='PUBLIC' AND m.status='ACTIVE'") Designer publicDesigner(String id);
    @Select("SELECT id FROM designer_profiles WHERE member_id=#{member}") String ownDesigner(long member);
    @Select(ROW + "WHERE c.customer_id=#{customer} AND c.request_key=#{key}") Row byRequestKey(long customer, String key);
    @Select(ROW + "WHERE c.id=#{id}") Row get(String id);
    @Select(ROW + "WHERE c.customer_id=#{customer} ORDER BY c.sent_at DESC,c.id LIMIT 100") List<Row> sent(long customer);
    @Select(ROW + "WHERE p.member_id=#{member} ORDER BY c.sent_at DESC,c.id LIMIT 100") List<Row> received(long member);
    @Insert("INSERT INTO consultations(id,customer_id,designer_id,request_key,content_hash,customer_name,designer_name,salon_name,cut_date,service,summary,request_text) VALUES(#{id},#{customer},#{designer.id},#{key},#{hash},#{customerName},#{designer.name},#{designer.salonName},#{cutDate},#{service},#{summary},#{request})")
    int insert(String id, long customer, Designer designer, String key, byte[] hash, String customerName, LocalDate cutDate, String service, String summary, String request);
    @Insert("INSERT INTO consultation_photos(consultation_id,content_type,byte_size,key_id,nonce,ciphertext) VALUES(#{id},#{type},#{size},#{data.keyId},#{data.nonce},#{data.ciphertext})") int insertPhoto(String id, String type, int size, BackupCrypto.Encrypted data);
    @Select("SELECT content_type,key_id,nonce,ciphertext FROM consultation_photos WHERE consultation_id=#{id}") Photo photo(String id);
    @Update("UPDATE consultations SET status='ANSWERED',reply_text=#{content},replied_at=CURRENT_TIMESTAMP(6) WHERE id=#{id} AND status='REQUESTED'") int reply(String id, String content);
}
