package kr.salu.community;

import java.util.List;
import kr.salu.auth.MemberPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class CommunityAdminController {
    private final CommunityAdminService service;
    public CommunityAdminController(CommunityAdminService service) { this.service=service; }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    private static ResponseEntity<Void> done() { return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }

    @GetMapping("/api/admin/community/reports") ResponseEntity<CommunityAdminService.Reports> reports() { return ok(service.reports()); }
    @GetMapping("/api/admin/community/posts/{id}") ResponseEntity<CommunityAdminService.PostReview> post(@PathVariable String id) { return ok(service.post(id)); }
    @GetMapping("/api/admin/community/comments/{id}/reports") ResponseEntity<List<CommunityAdminService.Report>> commentReports(@PathVariable long id) { return ok(service.commentReports(id)); }
    @PostMapping(path="/api/admin/community/posts/{id}/decision", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> decidePost(@AuthenticationPrincipal MemberPrincipal admin, @PathVariable String id, @RequestBody CommunityAdminService.Decision decision) { service.decidePost(admin, id, decision); return done(); }
    @PostMapping(path="/api/admin/community/comments/{id}/decision", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> decideComment(@AuthenticationPrincipal MemberPrincipal admin, @PathVariable long id, @RequestBody CommunityAdminService.Decision decision) { service.decideComment(admin, id, decision); return done(); }
    @GetMapping("/api/admin/members/{id}/sanctions") ResponseEntity<List<CommunityAdminService.Sanction>> sanctions(@PathVariable long id) { return ok(service.sanctions(id)); }
    @PostMapping(path="/api/admin/members/{id}/sanctions", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<CommunityAdminService.Sanction> sanction(@AuthenticationPrincipal MemberPrincipal admin, @PathVariable long id, @RequestBody CommunityAdminService.SanctionInput input) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.sanction(admin, id, input));
    }
    @PostMapping("/api/admin/sanctions/{id}/lift") ResponseEntity<Void> lift(@AuthenticationPrincipal MemberPrincipal admin, @PathVariable long id) { service.lift(admin, id); return done(); }
}
