package kr.salu.notification;

import java.util.List;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.Inputs;
import kr.salu.common.error.ApiException;
import kr.salu.realtime.RealtimePublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    // 종류를 늘리려면 V13의 CHECK도 새 migration으로 함께 바꿈
    public static final String CONSULTATION_REQUESTED = "CONSULTATION_REQUESTED";
    public static final String CONSULTATION_ANSWERED = "CONSULTATION_ANSWERED";
    public static final String CONSULTATION_MESSAGE = "CONSULTATION_MESSAGE";
    public static final String REVIEW_RECEIVED = "REVIEW_RECEIVED";
    public static final String COMMUNITY_COMMENT = "COMMUNITY_COMMENT";
    public static final String COMMUNITY_POST_HIDDEN = "COMMUNITY_POST_HIDDEN";
    public static final String COMMUNITY_COMMENT_HIDDEN = "COMMUNITY_COMMENT_HIDDEN";
    public static final String COMMUNITY_SUSPENDED = "COMMUNITY_SUSPENDED";
    public record Notification(long id, String type, String targetId, String actorName, String createdAt, boolean read) {}
    public record Inbox(int unreadCount, List<Notification> items) {}
    public record Count(int count) {}
    private final NotificationMapper mapper; private final RealtimePublisher realtime;
    public NotificationService(NotificationMapper mapper, RealtimePublisher realtime) { this.mapper=mapper; this.realtime=realtime; }

    // 알림을 만든 업무와 같은 transaction에서만 저장함. 업무가 rollback되면 알림도 남지 않음
    @Transactional(propagation=Propagation.MANDATORY)
    public void create(long member, String type, String targetId, String actorName) {
        if (mapper.insert(member, type, targetId, actorName) != 1) throw ApiException.conflict();
        realtime.send(member, RealtimePublisher.NOTIFICATION, Long.toString(mapper.lastId()));
    }
    // 취소된 일(지운 후기)의 알림은 남기지 않음. 업무와 같은 transaction에서 지우고, 안 읽은 수가 바뀌므로 신호를 보냄
    @Transactional(propagation=Propagation.MANDATORY)
    public void withdraw(long member, String type, String targetId) {
        if (mapper.deleteByTarget(member, type, targetId) > 0) realtime.send(member, RealtimePublisher.NOTIFICATION, targetId);
    }
    @Transactional(readOnly=true) public Inbox inbox(MemberPrincipal principal) {
        return new Inbox(mapper.unread(principal.id()), mapper.recent(principal.id()).stream()
            .map(row -> new Notification(row.id(), row.type(), row.targetId(), row.actorName(), Inputs.time(row.createdAt()), row.readAt() != null)).toList());
    }
    @Transactional(readOnly=true) public Count unread(MemberPrincipal principal) { return new Count(mapper.unread(principal.id())); }
    @Transactional public void read(MemberPrincipal principal, long id) { if (mapper.read(id, principal.id()) != 1) throw ApiException.notFound(); }
    @Transactional public void readAll(MemberPrincipal principal) { mapper.readAll(principal.id()); }
}
