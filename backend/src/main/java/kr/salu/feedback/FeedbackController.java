package kr.salu.feedback;

import java.util.List;
import kr.salu.auth.MemberPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class FeedbackController {
    private final FeedbackService service;
    public FeedbackController(FeedbackService service) { this.service = service; }

    @PostMapping(path="/api/feedback", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<FeedbackService.Sent> send(@AuthenticationPrincipal MemberPrincipal member, @RequestBody FeedbackService.Input input) {
        var result = service.send(member, input);
        return ResponseEntity.status(result.created() ? 201 : 200).cacheControl(CacheControl.noStore()).body(result.body());
    }

    // /api/admin/** 는 SecurityConfig에서 관리자만 통과시킴
    @GetMapping("/api/admin/feedback")
    ResponseEntity<List<FeedbackService.Item>> recent() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.recent()); }
}
