package kr.salu.community;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import kr.salu.common.PhotoCheck;
import kr.salu.common.error.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class CommunityController {
    private final CommunityService service;
    public CommunityController(CommunityService service) { this.service=service; }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
    private static ResponseEntity<Void> done() { return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
    private static <T> ResponseEntity<T> created(CommunityService.Created<T> result) { return ResponseEntity.status(result.created() ? 201 : 200).cacheControl(CacheControl.noStore()).body(result.body()); }

    @GetMapping("/api/community/posts") ResponseEntity<List<CommunityService.PostSummary>> posts(@AuthenticationPrincipal MemberPrincipal member,
            @RequestParam(required=false) String category, @RequestParam(required=false) String service, @RequestParam(required=false) String q, @RequestParam(required=false) String before) {
        return ok(this.service.posts(member, category, service, q, before));
    }
    @GetMapping("/api/community/posts/{id}") ResponseEntity<CommunityService.Post> post(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return ok(service.post(member, id)); }
    @GetMapping("/api/community/posts/{id}/photos/{position}") ResponseEntity<byte[]> photo(@PathVariable String id, @PathVariable int position) {
        var photo = service.photo(id, position);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(photo.contentType())).header("X-Content-Type-Options","nosniff").body(photo.bytes());
    }
    @GetMapping("/api/community/posts/{id}/comments") ResponseEntity<List<CommunityService.Comment>> comments(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { return ok(service.comments(member, id)); }
    @GetMapping("/api/my/community-posts") ResponseEntity<List<CommunityService.PostSummary>> mine(@AuthenticationPrincipal MemberPrincipal member) { return ok(service.mine(member)); }
    @GetMapping("/api/my/community-status") ResponseEntity<CommunityService.Status> status(@AuthenticationPrincipal MemberPrincipal member) { return ok(service.status(member)); }

    @PostMapping(path="/api/community/posts", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<CommunityService.Post> write(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context,
            @RequestPart("post") CommunityService.PostInput input, @RequestPart(value="photos", required=false) List<MultipartFile> photos) throws IOException {
        var uploads = new ArrayList<CommunityService.Upload>();
        if (photos != null) for (var photo : photos) {
            if (photo.getSize() > PhotoCheck.MAX_BYTES) throw ApiException.tooLarge();
            uploads.add(new CommunityService.Upload(photo.getContentType(), photo.getBytes()));
        }
        return created(service.write(member, context, input, uploads));
    }
    @PutMapping(path="/api/community/posts/{id}", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<CommunityService.Post> edit(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody CommunityService.EditInput input) {
        return ok(service.edit(member, context, id, input));
    }
    @DeleteMapping("/api/community/posts/{id}") ResponseEntity<Void> delete(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id) { service.delete(member, context, id); return done(); }
    @PostMapping(path="/api/community/posts/{id}/comments", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<CommunityService.Comment> comment(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody CommunityService.CommentInput input) {
        return created(service.comment(member, context, id, input));
    }
    @DeleteMapping("/api/community/comments/{id}") ResponseEntity<Void> deleteComment(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable long id) { service.deleteComment(member, context, id); return done(); }
    @PutMapping("/api/community/posts/{id}/reaction") ResponseEntity<Void> react(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { service.react(member, id); return done(); }
    @DeleteMapping("/api/community/posts/{id}/reaction") ResponseEntity<Void> unreact(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { service.unreact(member, id); return done(); }
    @PostMapping(path="/api/community/posts/{id}/reports", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> reportPost(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable String id, @RequestBody CommunityService.ReportInput input) {
        service.reportPost(member, context, id, input); return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).build();
    }
    @PostMapping(path="/api/community/comments/{id}/reports", consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> reportComment(@AuthenticationPrincipal MemberPrincipal member, @RequestHeader(StorageContext.HEADER) String context, @PathVariable long id, @RequestBody CommunityService.ReportInput input) {
        service.reportComment(member, context, id, input); return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).build();
    }
}
