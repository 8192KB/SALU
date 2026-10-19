package kr.salu.consultation;

import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import kr.salu.backup.BackupCrypto;
import kr.salu.common.Inputs;
import kr.salu.common.PhotoCheck;
import kr.salu.common.error.ApiException;
import kr.salu.notification.NotificationService;
import kr.salu.realtime.RealtimePublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class ConsultationService {
    public record AttachmentInput(String cutDate, String service, String summary) {}
    public record SendInput(String requestKey, String designerId, String request, AttachmentInput attachment) {}
    public record MessageInput(String clientKey, String content) {}
    public record ReadInput(Long messageId) {}
    public record Upload(String contentType, byte[] bytes) {}
    public record Sent(boolean created, Consultation consultation) {}
    public record Posted(boolean created, Message message) {}
    public record Consultation(String id, String status, DesignerView designer, CustomerView customer, Attachment attachment,
        String request, String sentAt, Reply reply, boolean canReply, String lastMessageAt, int unreadCount, String reviewId, boolean canReview) {}
    public record DesignerView(String id, String name, String salonName) {}
    public record CustomerView(String displayName) {}
    public record Attachment(String cutDate, String service, String summary, String photoUrl) {}
    public record Reply(String content, String repliedAt) {}
    public record Message(long id, String sender, String content, String sentAt, boolean mine) {}
    public record PhotoFile(String contentType, byte[] bytes) {}

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final ConsultationMapper mapper; private final BackupCrypto crypto; private final ObjectMapper json;
    private final NotificationService notifications; private final RealtimePublisher realtime;
    public ConsultationService(ConsultationMapper mapper, BackupCrypto crypto, ObjectMapper json, NotificationService notifications, RealtimePublisher realtime) {
        this.mapper=mapper; this.crypto=crypto; this.json=json; this.notifications=notifications; this.realtime=realtime;
    }
    private static String aad(String id) { return "salu:v1:consultation:" + id + ":photo"; }

    @Transactional(rollbackFor=Exception.class)
    public Sent send(MemberPrincipal principal, String context, SendInput input, Upload photo) {
        StorageContext.check(principal, context);
        if (input == null || input.attachment() == null || !Inputs.uuid(input.requestKey()) || !Inputs.uuid(input.designerId())) throw ApiException.invalidRequest();
        String request = Inputs.text(input.request(), 2000), service = Inputs.text(input.attachment().service(), 60), summary = Inputs.text(input.attachment().summary(), 2000);
        LocalDate cutDate;
        try { cutDate = LocalDate.parse(input.attachment().cutDate()); } catch (RuntimeException e) { throw ApiException.invalidRequest(); }
        if (cutDate.isAfter(LocalDate.now(SEOUL))) throw ApiException.invalidRequest();
        if (photo != null) {
            if (photo.bytes().length > PhotoCheck.MAX_BYTES) throw ApiException.tooLarge();
            if (!PhotoCheck.readable(photo.contentType(), photo.bytes())) throw ApiException.unsupportedMedia();
        }
        // 같은 회원의 보내기를 차례로 처리해 같은 requestKey가 두 건으로 저장되지 않게 함
        String customerName = mapper.lockMember(principal.id());
        if (customerName == null) throw ApiException.notFound();
        byte[] hash = hash(input.designerId(), cutDate, service, summary, request, photo);
        var existing = mapper.byRequestKey(principal.id(), input.requestKey());
        if (existing != null) {
            if (!MessageDigest.isEqual(existing.contentHash(), hash)) throw ApiException.conflict();
            return new Sent(false, view(existing, principal.id()));
        }
        var designer = mapper.publicDesigner(input.designerId());
        if (designer == null) throw ApiException.notFound();
        if (designer.memberId() == principal.id()) throw ApiException.invalidRequest();
        String id = UUID.randomUUID().toString();
        if (mapper.insert(id, principal.id(), designer, input.requestKey(), hash, customerName, cutDate, service, summary, request) != 1) throw ApiException.conflict();
        if (photo != null && mapper.insertPhoto(id, photo.contentType(), photo.bytes().length, crypto.encrypt(photo.bytes(), aad(id))) != 1) throw ApiException.conflict();
        notifications.create(designer.memberId(), NotificationService.CONSULTATION_REQUESTED, id, customerName);
        realtime.send(designer.memberId(), RealtimePublisher.CONSULTATION, id);
        return new Sent(true, view(mapper.get(id, principal.id()), principal.id()));
    }

    private byte[] hash(String designerId, LocalDate cutDate, String service, String summary, String request, Upload photo) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(json.writeValueAsBytes(List.of(designerId, cutDate.toString(), service, summary, request, photo == null ? "" : photo.contentType())));
            if (photo != null) digest.update(photo.bytes());
            return digest.digest();
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(); }
    }

    @Transactional(readOnly=true) public List<Consultation> sent(MemberPrincipal principal) { return mapper.sent(principal.id()).stream().map(row -> view(row, principal.id())).toList(); }
    @Transactional(readOnly=true) public List<Consultation> received(MemberPrincipal principal) { return mapper.received(principal.id()).stream().map(row -> view(row, principal.id())).toList(); }
    @Transactional(readOnly=true) public Consultation get(MemberPrincipal principal, String id) { return view(participant(principal, id), principal.id()); }

    @Transactional(readOnly=true) public PhotoFile photo(MemberPrincipal principal, String id) {
        participant(principal, id);
        var photo = mapper.photo(id);
        if (photo == null) throw ApiException.notFound();
        return new PhotoFile(photo.contentType(), crypto.decrypt(photo.keyId(), photo.nonce(), photo.ciphertext(), aad(id)));
    }

    // 이전 화면과 맞추려고 남긴 첫 답변 API. 디자이너의 첫 메시지와 같음
    @Transactional(rollbackFor=Exception.class)
    public Consultation reply(MemberPrincipal principal, String context, String id, String content) {
        StorageContext.check(principal, context);
        String reply = Inputs.text(content, 2000);
        var row = lockedParticipant(principal, id);
        if (row.designerMemberId() != principal.id()) throw ApiException.forbidden();
        if (!"REQUESTED".equals(row.status())) throw ApiException.conflict();
        post(row, principal.id(), UUID.randomUUID().toString(), reply);
        return view(mapper.get(id, principal.id()), principal.id());
    }

    @Transactional(readOnly=true)
    public List<Message> messages(MemberPrincipal principal, String id, Long after) {
        participant(principal, id);
        if (after != null && after < 0) throw ApiException.invalidRequest();
        var rows = after == null ? mapper.latestMessages(id) : mapper.messagesAfter(id, after);
        return rows.stream().map(m -> message(m, principal.id())).toList();
    }

    @Transactional(rollbackFor=Exception.class)
    public Posted sendMessage(MemberPrincipal principal, String context, String id, MessageInput input) {
        StorageContext.check(principal, context);
        if (input == null || !Inputs.uuid(input.clientKey())) throw ApiException.invalidRequest();
        String content = Inputs.text(input.content(), 2000);
        var row = lockedParticipant(principal, id);
        // 응답을 못 받아 다시 보낸 같은 메시지는 처음 저장한 것을 돌려줌
        var existing = mapper.messageByKey(id, principal.id(), input.clientKey());
        if (existing != null) {
            if (!existing.content().equals(content)) throw ApiException.conflict();
            return new Posted(false, message(existing, principal.id()));
        }
        return new Posted(true, message(post(row, principal.id(), input.clientKey(), content), principal.id()));
    }

    @Transactional
    public void markRead(MemberPrincipal principal, String id, ReadInput input) {
        if (input == null || input.messageId() == null) throw ApiException.invalidRequest();
        var row = participant(principal, id);
        if (mapper.messageIn(id, input.messageId()) != 1) throw ApiException.invalidRequest();
        int updated = row.customerId() == principal.id() ? mapper.readByCustomer(id, input.messageId()) : mapper.readByDesigner(id, input.messageId());
        if (updated != 1) throw ApiException.conflict();
    }

    private ConsultationMapper.Message post(ConsultationMapper.Row row, long sender, String key, String content) {
        boolean customer = row.customerId() == sender;
        if (mapper.insertMessage(row.id(), sender, customer ? "CUSTOMER" : "DESIGNER", key, content) != 1) throw ApiException.conflict();
        long messageId = mapper.lastId();
        if (!customer && "REQUESTED".equals(row.status()) && mapper.markAnswered(row.id(), messageId) != 1) throw ApiException.conflict();
        // 보낸 사람은 자기 메시지까지 읽은 것으로 둠
        if ((customer ? mapper.readByCustomer(row.id(), messageId) : mapper.readByDesigner(row.id(), messageId)) != 1) throw ApiException.conflict();
        long recipient = customer ? row.designerMemberId() : row.customerId();
        notifications.create(recipient, NotificationService.CONSULTATION_MESSAGE, row.id(), customer ? row.customerName() : row.designerName());
        realtime.send(row.customerId(), RealtimePublisher.CONSULTATION, row.id());
        realtime.send(row.designerMemberId(), RealtimePublisher.CONSULTATION, row.id());
        return mapper.message(messageId);
    }

    // 보낸 회원·받은 디자이너가 아니면 상담이 있는지도 알리지 않음
    private ConsultationMapper.Row participant(MemberPrincipal principal, String id) {
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var row = mapper.get(id, principal.id());
        if (row == null || (row.customerId() != principal.id() && row.designerMemberId() != principal.id())) throw ApiException.notFound();
        return row;
    }
    private ConsultationMapper.Row lockedParticipant(MemberPrincipal principal, String id) {
        if (!Inputs.uuid(id) || mapper.lock(id) == null) throw ApiException.notFound();
        return participant(principal, id);
    }

    private static Message message(ConsultationMapper.Message m, long viewer) {
        return new Message(m.id(), m.senderRole(), m.content(), Inputs.time(m.sentAt()), m.senderId() == viewer);
    }
    private static Consultation view(ConsultationMapper.Row row, long viewer) {
        boolean answered = "ANSWERED".equals(row.status());
        boolean customer = row.customerId() == viewer;
        return new Consultation(row.id(), row.status(),
            new DesignerView(row.designerId(), row.designerName(), row.salonName()),
            new CustomerView(row.customerName()),
            new Attachment(row.cutDate().toString(), row.service(), row.summary(), row.hasPhoto() ? "/api/consultations/" + row.id() + "/photo" : null),
            row.requestText(), Inputs.time(row.sentAt()),
            answered ? new Reply(row.replyText(), Inputs.time(row.repliedAt())) : null,
            !answered && row.designerMemberId() == viewer,
            Inputs.time(row.lastMessageAt() == null ? row.sentAt() : row.lastMessageAt()),
            row.unreadCount(), row.reviewId(),
            customer && answered && row.reviewId() == null);
    }
}
