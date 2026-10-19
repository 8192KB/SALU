package kr.salu.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// DB가 rollback된 변경을 알리지 않도록 commit 뒤에만 보냄. 놓친 신호는 화면이 다시 연결할 때 API로 다시 불러와 맞춤
@Component
public class RealtimePublisher {
    public static final String NOTIFICATION = "NOTIFICATION";
    public static final String CONSULTATION = "CONSULTATION";
    public record Event(String type, String id) {}
    private static final Logger log = LoggerFactory.getLogger(RealtimePublisher.class);
    private final SimpMessagingTemplate template;
    public RealtimePublisher(SimpMessagingTemplate template) { this.template = template; }

    public void send(long memberId, String type, String id) {
        var event = new Event(type, id);
        Runnable push = () -> {
            try { template.convertAndSendToUser(Long.toString(memberId), WebSocketConfig.EVENTS, event); }
            catch (RuntimeException e) { log.warn("실시간 전송 실패: type={}", type); }
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) { push.run(); return; }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { push.run(); }
        });
    }
}
