package kr.salu.payment;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface PaymentMapper {
    record Order(String consultationId, long customerId, String orderId, int amount, String paymentKey, String status) {}
    String ORDER = "SELECT pay.consultation_id,c.customer_id,pay.order_id,pay.amount,pay.payment_key,pay.status FROM consultation_payments pay JOIN consultations c ON c.id=pay.consultation_id ";
    @Select(ORDER + "WHERE pay.order_id=#{orderId}") Order byOrder(String orderId);
    @Select(ORDER + "WHERE pay.consultation_id=#{id}") Order byConsultation(String id);
    @Select(ORDER + "WHERE pay.consultation_id=#{id} FOR UPDATE") Order lock(String id);
    @Update("UPDATE consultation_payments SET status='PAID',payment_key=#{paymentKey},paid_at=CURRENT_TIMESTAMP(6) WHERE consultation_id=#{id} AND status='READY'") int markPaid(String id, String paymentKey);
    @Update("UPDATE consultations SET status='REQUESTED',sent_at=CURRENT_TIMESTAMP(6) WHERE id=#{id} AND status='PAYMENT_PENDING'") int openConsultation(String id);
    // 첫 답변(markAnswered)과 같은 행을 조건부로 바꿔 둘 중 하나만 성공함
    @Update("UPDATE consultations SET status='CANCELED',canceled_at=CURRENT_TIMESTAMP(6) WHERE id=#{id} AND status IN ('PAYMENT_PENDING','REQUESTED')") int cancelConsultation(String id);
    @Update("UPDATE consultation_payments SET status=CASE status WHEN 'PAID' THEN 'REFUND_PENDING' ELSE 'CANCELED' END,canceled_at=CASE status WHEN 'PAID' THEN NULL ELSE CURRENT_TIMESTAMP(6) END WHERE consultation_id=#{id} AND status IN ('READY','PAID')") int cancelPayment(String id);
    @Update("UPDATE consultation_payments SET status='EXPIRED' WHERE consultation_id=#{id} AND status='READY'") int expirePayment(String id);
    @Update("UPDATE consultation_payments SET status='CANCELED',canceled_at=CURRENT_TIMESTAMP(6) WHERE consultation_id=#{id} AND status='REFUND_PENDING'") int refunded(String id);
    @Update("UPDATE consultation_payments SET refund_attempts=refund_attempts+1 WHERE consultation_id=#{id}") int refundFailed(String id);
    @Select("SELECT c.id FROM consultations c WHERE c.status='PAYMENT_PENDING' AND c.sent_at < CURRENT_TIMESTAMP(6) - INTERVAL 30 MINUTE LIMIT 100") List<String> stalePending();
    @Select("SELECT c.id FROM consultations c JOIN consultation_payments pay ON pay.consultation_id=c.id WHERE c.status='REQUESTED' AND pay.status='PAID' AND c.sent_at < CURRENT_TIMESTAMP(6) - INTERVAL 72 HOUR LIMIT 100") List<String> unanswered();
    @Select("SELECT consultation_id FROM consultation_payments WHERE status='REFUND_PENDING' AND refund_attempts < 20 LIMIT 100") List<String> refundPending();
    @Select("SELECT c.customer_id FROM consultations c WHERE c.id=#{id}") long customer(String id);
    @Select("SELECT p.member_id FROM consultations c JOIN designer_profiles p ON p.id=c.designer_id WHERE c.id=#{id}") long designerMember(String id);
    @Select("SELECT customer_name FROM consultations WHERE id=#{id}") String customerName(String id);
}
