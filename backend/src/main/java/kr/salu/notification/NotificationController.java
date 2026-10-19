package kr.salu.notification;

import kr.salu.auth.MemberPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service=service; }
    @GetMapping("/api/my/notifications") ResponseEntity<NotificationService.Inbox> inbox(@AuthenticationPrincipal MemberPrincipal member) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.inbox(member)); }
    @GetMapping("/api/my/notifications/unread-count") ResponseEntity<NotificationService.Count> unread(@AuthenticationPrincipal MemberPrincipal member) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.unread(member)); }
    @PostMapping("/api/my/notifications/{id}/read") ResponseEntity<Void> read(@AuthenticationPrincipal MemberPrincipal member, @PathVariable long id) { service.read(member, id); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
    @PostMapping("/api/my/notifications/read-all") ResponseEntity<Void> readAll(@AuthenticationPrincipal MemberPrincipal member) { service.readAll(member); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
}
