package kr.salu.payment;

import java.util.HashMap;
import java.util.Map;
import kr.salu.auth.MemberPrincipal;
import kr.salu.consultation.ConsultationService;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@EnableScheduling
public class PaymentController {
    private final PaymentService service; private final PaymentSettings settings;
    public PaymentController(PaymentService service, PaymentSettings settings) { this.service = service; this.settings = settings; }
    @GetMapping("/api/payments/config") ResponseEntity<Map<String, Object>> config() {
        var body = new HashMap<String, Object>();
        body.put("enabled", settings.enabled()); body.put("clientKey", settings.clientKey());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
    @PostMapping(path="/api/payments/confirm", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ConsultationService.Consultation> confirm(@AuthenticationPrincipal MemberPrincipal member, @RequestBody PaymentService.ConfirmInput input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.confirm(member, input));
    }
    @PostMapping("/api/consultations/{id}/cancel")
    ResponseEntity<ConsultationService.Consultation> cancel(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.cancel(member, id));
    }
}
