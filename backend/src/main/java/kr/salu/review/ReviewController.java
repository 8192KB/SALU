package kr.salu.review;

import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class ReviewController {
    private final ReviewService service;
    public ReviewController(ReviewService service) { this.service=service; }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }

    @GetMapping("/api/designers/{id}/reviews") ResponseEntity<ReviewService.DesignerReviews> designer(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return ok(service.ofDesigner(id, member)); }
    @GetMapping("/api/consultations/{id}/review") ResponseEntity<ReviewService.Review> get(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return ok(service.ofConsultation(member, id)); }
    @PostMapping(path="/api/consultations/{id}/review", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ReviewService.Review> write(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody ReviewService.ReviewInput input) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.write(member, context, id, input));
    }
    @PutMapping(path="/api/consultations/{id}/review", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ReviewService.Review> update(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody ReviewService.ReviewInput input) {
        return ok(service.update(member, context, id, input));
    }
    @DeleteMapping("/api/consultations/{id}/review")
    ResponseEntity<Void> delete(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id) {
        service.delete(member, context, id);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
