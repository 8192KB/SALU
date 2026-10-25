package kr.salu.consultation;

import java.io.IOException;
import java.util.List;
import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import kr.salu.common.error.ApiException;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class ConsultationController {
    public record ReplyInput(String content) {}
    private final ConsultationService service;
    public ConsultationController(ConsultationService service) { this.service=service; }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }

    @PostMapping(path="/api/consultations", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<ConsultationService.Consultation> send(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader("X-SALU-Storage-Context") String context,
            @RequestPart("consultation") ConsultationService.SendInput input, @RequestPart(value="photo", required=false) List<MultipartFile> photos) throws IOException {
        var uploads = new java.util.ArrayList<ConsultationService.Upload>();
        if (photos != null) for (var photo : photos) uploads.add(new ConsultationService.Upload(photo.getContentType(), readPhoto(photo)));
        var sent = service.send(member, context, input, uploads);
        return ResponseEntity.status(sent.created() ? 201 : 200).cacheControl(CacheControl.noStore()).body(sent.consultation());
    }
    private static byte[] readPhoto(MultipartFile photo) throws IOException {
        if (photo.getSize() > kr.salu.common.PhotoCheck.MAX_BYTES) throw ApiException.tooLarge();
        return photo.getBytes();
    }
    @GetMapping("/api/my/sent-consultations") ResponseEntity<List<ConsultationService.Consultation>> sent(@AuthenticationPrincipal MemberPrincipal member) { return ok(service.sent(member)); }
    @GetMapping("/api/my/received-consultations") ResponseEntity<List<ConsultationService.Consultation>> received(@AuthenticationPrincipal MemberPrincipal member) { return ok(service.received(member)); }
    @GetMapping("/api/consultations/{id}") ResponseEntity<ConsultationService.Consultation> get(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return ok(service.get(member, id)); }
    // 예전 주소는 첫 사진
    @GetMapping("/api/consultations/{id}/photo") ResponseEntity<byte[]> firstPhoto(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return photo(member, id, 0); }
    @GetMapping("/api/consultations/{id}/photos/{position}") ResponseEntity<byte[]> photo(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id, @PathVariable int position) {
        var photo = service.photo(member, id, position);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(photo.contentType())).header("X-Content-Type-Options","nosniff").body(photo.bytes());
    }
    @GetMapping("/api/consultations/{id}/messages") ResponseEntity<List<ConsultationService.Message>> messages(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id, @RequestParam(required=false) Long after) { return ok(service.messages(member, id, after)); }
    @PostMapping(path="/api/consultations/{id}/messages", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ConsultationService.Message> sendMessage(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody ConsultationService.MessageInput input) {
        var posted = service.sendMessage(member, context, id, input);
        return ResponseEntity.status(posted.created() ? 201 : 200).cacheControl(CacheControl.noStore()).body(posted.message());
    }
    @PostMapping(path="/api/consultations/{id}/read", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> read(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id, @RequestBody ConsultationService.ReadInput input) {
        service.markRead(member, id, input);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    @PostMapping(path="/api/consultations/{id}/reply", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ConsultationService.Consultation> reply(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader("X-SALU-Storage-Context") String context, @PathVariable String id, @RequestBody ReplyInput input) {
        return ok(service.reply(member, context, id, input == null ? null : input.content()));
    }
}
