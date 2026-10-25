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
        String requestText, String status, String replyText, Instant sentAt, Instant repliedAt, String photoLabels,
        Instant lastMessageAt, int unreadCount, String reviewId) {}
    record Designer(String id, long memberId, String name, String salonName) {}
    record Photo(String contentType, String keyId, byte[] nonce, byte[] ciphertext) {}
    record Message(long id, long senderId, String senderRole, String clientKey, String content, Instant sentAt) {}
    // 열 순서가 Row 생성자 순서와 같아야 함. 안 읽은 수는 상대가 보낸 메시지 중 내 읽음 위치 뒤의 것
    String ROW = "SELECT c.id,c.customer_id,c.designer_id,p.member_id AS designer_member_id,c.content_hash,c.customer_name,c.designer_name,c.salon_name,c.cut_date,c.service,c.summary,c.request_text,c.status,"
        + "(SELECT m.content FROM consultation_messages m WHERE m.consultation_id=c.id AND m.sender_role='DESIGNER' ORDER BY m.id LIMIT 1) AS reply_text,"
        + "c.sent_at,c.replied_at,(SELECT GROUP_CONCAT(f.label ORDER BY f.position SEPARATOR '\\n') FROM consultation_photos f WHERE f.consultation_id=c.id) AS photo_labels,"
        + "(SELECT MAX(m.sent_at) FROM consultation_messages m WHERE m.consultation_id=c.id) AS last_message_at,"
        + "(SELECT COUNT(*) FROM consultation_messages m WHERE m.consultation_id=c.id AND m.sender_id<>#{viewer} AND m.id>COALESCE(CASE WHEN c.customer_id=#{viewer} THEN c.customer_read_message_id ELSE c.designer_read_message_id END,0)) AS unread_count,"
        + "(SELECT r.id FROM designer_reviews r WHERE r.consultation_id=c.id) AS review_id "
        + "FROM consultations c JOIN designer_profiles p ON p.id=c.designer_id ";
    String MESSAGE = "SELECT id,sender_id,sender_role,client_key,content,sent_at FROM consultation_messages ";
    @Select("SELECT display_name FROM members WHERE id=#{member} AND status='ACTIVE' FOR UPDATE") String lockMember(long member);
    @Select("SELECT p.id,p.member_id,p.name,CASE WHEN s.id IS NULL THEN NULL ELSE TRIM(CONCAT(s.name,' ',s.branch)) END AS salon_name FROM designer_profiles p JOIN members m ON m.id=p.member_id LEFT JOIN designer_affiliations a ON a.designer_id=p.id LEFT JOIN salons s ON s.id=a.salon_id WHERE p.id=#{id} AND p.visibility='PUBLIC' AND m.status='ACTIVE'") Designer publicDesigner(String id);
    @Select("SELECT id FROM designer_profiles WHERE member_id=#{member}") String ownDesigner(long member);
    @Select(ROW + "WHERE c.customer_id=#{viewer} AND c.request_key=#{key}") Row byRequestKey(long viewer, String key);
    @Select(ROW + "WHERE c.id=#{id}") Row get(String id, long viewer);
    @Select(ROW + "WHERE c.customer_id=#{viewer} ORDER BY c.sent_at DESC,c.id LIMIT 100") List<Row> sent(long viewer);
    @Select(ROW + "WHERE p.member_id=#{viewer} ORDER BY c.sent_at DESC,c.id LIMIT 100") List<Row> received(long viewer);
    @Insert("INSERT INTO consultations(id,customer_id,designer_id,request_key,content_hash,customer_name,designer_name,salon_name,cut_date,service,summary,request_text) VALUES(#{id},#{customer},#{designer.id},#{key},#{hash},#{customerName},#{designer.name},#{designer.salonName},#{cutDate},#{service},#{summary},#{request})")
    int insert(String id, long customer, Designer designer, String key, byte[] hash, String customerName, LocalDate cutDate, String service, String summary, String request);
    @Insert("INSERT INTO consultation_photos(consultation_id,position,label,content_type,byte_size,key_id,nonce,ciphertext) VALUES(#{id},#{position},#{label},#{type},#{size},#{data.keyId},#{data.nonce},#{data.ciphertext})") int insertPhoto(String id, int position, String label, String type, int size, BackupCrypto.Encrypted data);
    @Select("SELECT content_type,key_id,nonce,ciphertext FROM consultation_photos WHERE consultation_id=#{id} AND position=#{position}") Photo photo(String id, int position);
    // 같은 상담의 메시지 보내기·첫 답변 처리를 차례로 하려고 상담 행을 잠금
    @Select("SELECT id FROM consultations WHERE id=#{id} FOR UPDATE") String lock(String id);
    @Select("SELECT * FROM (" + MESSAGE + "WHERE consultation_id=#{id} ORDER BY id DESC LIMIT 200) t ORDER BY id") List<Message> latestMessages(String id);
    @Select(MESSAGE + "WHERE consultation_id=#{id} AND id>#{after} ORDER BY id LIMIT 200") List<Message> messagesAfter(String id, long after);
    @Select(MESSAGE + "WHERE consultation_id=#{id} AND sender_id=#{sender} AND client_key=#{key}") Message messageByKey(String id, long sender, String key);
    @Select(MESSAGE + "WHERE id=#{message}") Message message(long message);
    @Insert("INSERT INTO consultation_messages(consultation_id,sender_id,sender_role,client_key,content) VALUES(#{id},#{sender},#{role},#{key},#{content})") int insertMessage(String id, long sender, String role, String key, String content);
    @Select("SELECT LAST_INSERT_ID()") long lastId();
    @Update("UPDATE consultations SET status='ANSWERED',replied_at=(SELECT sent_at FROM consultation_messages WHERE id=#{message}) WHERE id=#{id} AND status='REQUESTED'") int markAnswered(String id, long message);
    @Select("SELECT COUNT(*) FROM consultation_messages WHERE id=#{message} AND consultation_id=#{id}") int messageIn(String id, long message);
    @Update("UPDATE consultations SET customer_read_message_id=GREATEST(COALESCE(customer_read_message_id,0),#{message}) WHERE id=#{id}") int readByCustomer(String id, long message);
    @Update("UPDATE consultations SET designer_read_message_id=GREATEST(COALESCE(designer_read_message_id,0),#{message}) WHERE id=#{id}") int readByDesigner(String id, long message);
}
