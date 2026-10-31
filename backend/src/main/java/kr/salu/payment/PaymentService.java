package kr.salu.payment;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import jakarta.annotation.PreDestroy;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.Inputs;
import kr.salu.common.error.ApiException;
import kr.salu.consultation.ConsultationMapper;
import kr.salu.consultation.ConsultationService;
import kr.salu.notification.NotificationService;
import kr.salu.realtime.RealtimePublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

// 상담 요금 결제(docs/payment-api.md). 토스 호출은 DB transaction 밖에서 하고, 앞뒤 DB 변경만 transaction으로 묶음
@Service
public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    public record ConfirmInput(String paymentKey, String orderId, Integer amount) {}
    private final PaymentMapper payments; private final ConsultationMapper consultations; private final TossClient toss;
    private final NotificationService notifications; private final RealtimePublisher realtime; private final TransactionTemplate tx;
    private final ExecutorService refunds = Executors.newSingleThreadExecutor(r -> { var t = new Thread(r, "payment-refund"); t.setDaemon(true); return t; });
    public PaymentService(PaymentMapper payments, ConsultationMapper consultations, TossClient toss, NotificationService notifications,
            RealtimePublisher realtime, TransactionTemplate tx) {
        this.payments = payments; this.consultations = consultations; this.toss = toss; this.notifications = notifications; this.realtime = realtime; this.tx = tx;
    }
    @PreDestroy void stop() { refunds.shutdown(); }

    public ConsultationService.Consultation confirm(MemberPrincipal principal, ConfirmInput input) {
        if (input == null || input.amount() == null || input.paymentKey() == null || input.paymentKey().isBlank() || input.paymentKey().length() > 200
                || input.orderId() == null || !input.orderId().matches("salu-[a-f0-9]{32}")) throw ApiException.invalidRequest();
        var order = tx.execute(status -> payments.byOrder(input.orderId()));
        if (order == null || order.customerId() != principal.id()) throw ApiException.notFound();
        // 승인 응답을 못 받아 다시 보낸 같은 결제는 성공으로 돌려줌
        if ("PAID".equals(order.status()) && input.paymentKey().equals(order.paymentKey())) return view(order.consultationId(), principal.id());
        if (!"READY".equals(order.status()) || order.amount() != input.amount()) throw ApiException.paymentMismatch();
        toss.confirm(input.paymentKey(), input.orderId(), order.amount());
        try {
            tx.executeWithoutResult(status -> {
                if (consultations.lock(order.consultationId()) == null) throw ApiException.notFound();
                if (payments.markPaid(order.consultationId(), input.paymentKey()) != 1 || payments.openConsultation(order.consultationId()) != 1) throw ApiException.paymentMismatch();
                long designer = payments.designerMember(order.consultationId());
                notifications.create(designer, NotificationService.CONSULTATION_REQUESTED, order.consultationId(), payments.customerName(order.consultationId()));
                realtime.send(designer, RealtimePublisher.CONSULTATION, order.consultationId());
            });
        } catch (RuntimeException e) {
            // 승인은 됐는데 저장하지 못했으면 승인을 되돌림(예: 그사이 30분이 지나 상담이 정리됨)
            try { toss.cancel(input.paymentKey(), "rollback-" + input.orderId(), "상담 저장 실패"); }
            catch (RuntimeException cancel) { log.warn("결제 승인 되돌리기 실패: order={}", input.orderId()); }
            throw e;
        }
        return view(order.consultationId(), principal.id());
    }

    // 답변 전 고객 취소. 결제했으면 환불 대기로 바꾸고 commit 뒤 환불함
    public ConsultationService.Consultation cancel(MemberPrincipal principal, String id) {
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        tx.executeWithoutResult(status -> {
            if (consultations.lock(id) == null) throw ApiException.notFound();
            var row = consultations.get(id, principal.id());
            if (row == null || (row.customerId() != principal.id() && row.designerMemberId() != principal.id())
                    || (row.customerId() != principal.id() && "PAYMENT_PENDING".equals(row.status()))) throw ApiException.notFound();
            if (row.customerId() != principal.id()) throw ApiException.forbidden();
            if (!cancelLocked(id)) throw ApiException.conflict();
        });
        return view(id, principal.id());
    }

    // 상담 행을 잠근 transaction 안에서 부름. 취소했으면 true
    private boolean cancelLocked(String id) {
        if (payments.cancelConsultation(id) != 1) return false;
        var order = payments.lock(id);
        if (order != null) payments.cancelPayment(id);
        realtime.send(payments.customer(id), RealtimePublisher.CONSULTATION, id);
        realtime.send(payments.designerMember(id), RealtimePublisher.CONSULTATION, id);
        // 취소된 요청의 알림은 남기지 않음. 상담은 받은 상담 목록에 취소 상태로 남음
        notifications.withdraw(payments.designerMember(id), NotificationService.CONSULTATION_REQUESTED, id);
        if (order != null && "PAID".equals(order.status()))
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { refunds.execute(() -> refund(id)); }
            });
        return true;
    }

    void refund(String id) {
        var order = tx.execute(status -> payments.byConsultation(id));
        if (order == null || !"REFUND_PENDING".equals(order.status())) return;
        try {
            toss.cancel(order.paymentKey(), "refund-" + order.orderId(), "상담 취소");
            tx.executeWithoutResult(status -> payments.refunded(id));
        } catch (RuntimeException e) {
            tx.executeWithoutResult(status -> payments.refundFailed(id));
            log.warn("환불 실패, 다음 정기 작업에서 다시 시도: consultation={}", id);
        }
    }

    // 1분마다: 30분 넘게 결제하지 않은 상담 정리, 72시간 답이 없는 결제 상담 취소, 남은 환불 다시 시도
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void sweep() {
        try {
            for (String id : tx.execute(status -> payments.stalePending()))
                tx.executeWithoutResult(status -> { if (consultations.lock(id) != null && payments.cancelConsultation(id) == 1) payments.expirePayment(id); });
            for (String id : tx.execute(status -> payments.unanswered()))
                tx.executeWithoutResult(status -> { if (consultations.lock(id) != null) cancelLocked(id); });
            for (String id : tx.execute(status -> payments.refundPending())) refund(id);
        } catch (RuntimeException e) {
            log.warn("결제 정기 작업 실패: type={}", e.getClass().getName());
        }
    }

    private ConsultationService.Consultation view(String id, long viewer) {
        return tx.execute(status -> ConsultationService.view(consultations.get(id, viewer), viewer));
    }
}
