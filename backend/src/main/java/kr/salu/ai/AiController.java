package kr.salu.ai;

import java.util.Map;
import jakarta.validation.Valid;
import kr.salu.auth.MemberPrincipal;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class AiController {
    private final AiService service;
    public AiController(AiService service) { this.service = service; }
    @GetMapping("/api/ai/status") ResponseEntity<Map<String, Boolean>> status() { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("enabled", service.enabled())); }
    @PostMapping("/api/ai/request-draft") ResponseEntity<AiService.Draft> draft(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody AiService.DraftInput input) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.draft(member.id(), input)); }
    @PostMapping("/api/ai/chat") ResponseEntity<AiService.ChatAnswer> chat(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody AiService.ChatInput input) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.chat(member.id(), input)); }
    @PostMapping("/api/ai/designer-match") ResponseEntity<AiService.Matches> match(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody AiService.MatchInput input) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.match(member.id(), input)); }
}
