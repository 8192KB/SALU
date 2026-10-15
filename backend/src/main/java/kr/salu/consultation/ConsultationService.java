package kr.salu.consultation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import kr.salu.auth.MemberPrincipal;
import kr.salu.backup.BackupCrypto;
import kr.salu.common.PhotoCheck;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class ConsultationService {
    public record AttachmentInput(String cutDate, String service, String summary) {}
    public record SendInput(String requestKey, String designerId, String request, AttachmentInput attachment) {}
    public record Upload(String contentType, byte[] bytes) {}
    public record Sent(boolean created, Consultation consultation) {}
    public record Consultation(String id, String status, DesignerView designer, CustomerView customer, Attachment attachment,
        String request, String sentAt, Reply reply, boolean canReply) {}
    public record DesignerView(String id, String name, String salonName) {}
    public record CustomerView(String displayName) {}
    public record Attachment(String cutDate, String service, String summary, String photoUrl) {}
    public record Reply(String content, String repliedAt) {}
    public record PhotoFile(String contentType, byte[] bytes) {}

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private final ConsultationMapper mapper; private final BackupCrypto crypto; private final ObjectMapper json;
    public ConsultationService(ConsultationMapper mapper, BackupCrypto crypto, ObjectMapper json) { this.mapper=mapper; this.crypto=crypto; this.json=json; }

    private static void context(MemberPrincipal principal, String context) {
        if (context == null || !MessageDigest.isEqual(principal.storageContext().getBytes(StandardCharsets.UTF_8), context.getBytes(StandardCharsets.UTF_8))) throw ApiException.storageContextChanged();
    }
    private static String text(String value, int max) {
        if (value == null) throw ApiException.invalidRequest();
        String trimmed = value.strip();
        if (trimmed.isEmpty() || trimmed.codePointCount(0, trimmed.length()) > max) throw ApiException.invalidRequest();
        return trimmed;
    }
    private static String aad(String id) { return "salu:v1:consultation:" + id + ":photo"; }

    @Transactional(rollbackFor=Exception.class)
    public Sent send(MemberPrincipal principal, String context, SendInput input, Upload photo) {
        context(principal, context);
        if (input == null || input.attachment() == null || input.requestKey() == null || !input.requestKey().matches(UUID_PATTERN)
            || input.designerId() == null || !input.designerId().matches(UUID_PATTERN)) throw ApiException.invalidRequest();
        String request = text(input.request(), 2000), service = text(input.attachment().service(), 60), summary = text(input.attachment().summary(), 2000);
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
        return new Sent(true, view(mapper.get(id), principal.id()));
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

    @Transactional(rollbackFor=Exception.class)
    public Consultation reply(MemberPrincipal principal, String context, String id, String content) {
        context(principal, context);
        String reply = text(content, 2000);
        var row = participant(principal, id);
        if (row.designerMemberId() != principal.id()) throw ApiException.forbidden();
        if (mapper.reply(id, reply) != 1) throw ApiException.conflict();
        return view(mapper.get(id), principal.id());
    }

    // 보낸 회원·받은 디자이너가 아니면 상담이 있는지도 알리지 않음
    private ConsultationMapper.Row participant(MemberPrincipal principal, String id) {
        if (id == null || !id.matches(UUID_PATTERN)) throw ApiException.notFound();
        var row = mapper.get(id);
        if (row == null || (row.customerId() != principal.id() && row.designerMemberId() != principal.id())) throw ApiException.notFound();
        return row;
    }

    private static String time(java.time.Instant value) { return value.truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString(); }
    private static Consultation view(ConsultationMapper.Row row, long viewer) {
        boolean answered = "ANSWERED".equals(row.status());
        return new Consultation(row.id(), row.status(),
            new DesignerView(row.designerId(), row.designerName(), row.salonName()),
            new CustomerView(row.customerName()),
            new Attachment(row.cutDate().toString(), row.service(), row.summary(), row.hasPhoto() ? "/api/consultations/" + row.id() + "/photo" : null),
            row.requestText(), time(row.sentAt()),
            answered ? new Reply(row.replyText(), time(row.repliedAt())) : null,
            !answered && row.designerMemberId() == viewer);
    }
}
