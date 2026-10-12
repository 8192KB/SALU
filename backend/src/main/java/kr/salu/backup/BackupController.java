package kr.salu.backup;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.error.ApiException;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class BackupController {
    private final BackupService service;
    public BackupController(BackupService service) { this.service=service; }
    private <T> ResponseEntity<T> response(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    @GetMapping("/api/personal-backups") ResponseEntity<List<BackupMapper.Summary>> list(@AuthenticationPrincipal MemberPrincipal member,@RequestHeader("X-SALU-Storage-Context") String context) { return response(service.list(member,context)); }
    @GetMapping("/api/personal-backups/{id}") ResponseEntity<BackupService.Content> get(@AuthenticationPrincipal MemberPrincipal member,@RequestHeader("X-SALU-Storage-Context") String context,@PathVariable String id) { return response(service.get(member,context,id)); }
    @PutMapping("/api/personal-backups/{id}") ResponseEntity<BackupService.Saved> put(@AuthenticationPrincipal MemberPrincipal member,@RequestHeader("X-SALU-Storage-Context") String context,@PathVariable String id,@RequestBody BackupService.Change change) { return response(service.put(member,context,id,change)); }
    @GetMapping("/api/personal-backup-photos/{id}") ResponseEntity<byte[]> photo(@AuthenticationPrincipal MemberPrincipal member,@RequestHeader("X-SALU-Storage-Context") String context,@PathVariable String id) { var photo=service.photo(member,context,id); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(photo.contentType())).header("X-Content-Type-Options","nosniff").body(photo.ciphertext()); }
    @PutMapping("/api/personal-backup-photos/{id}") ResponseEntity<Void> putPhoto(@AuthenticationPrincipal MemberPrincipal member,@RequestHeader("X-SALU-Storage-Context") String context,@PathVariable String id,HttpServletRequest request) throws IOException {
        if(request.getContentLengthLong()>5*1024*1024) throw ApiException.invalidRequest();
        byte[] bytes=request.getInputStream().readNBytes(5*1024*1024+1);
        service.putPhoto(member,context,id,request.getContentType(),bytes);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
