package kr.salu.community;

import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import kr.salu.common.Inputs;
import kr.salu.common.PhotoCheck;
import kr.salu.common.error.ApiException;
import kr.salu.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class CommunityService {
    public static final int MAX_PHOTOS = 3;
    // 신고가 이만큼 쌓이면 관리자 확인 전까지 자동으로 숨김
    public static final int AUTO_HIDE_REPORTS = 5;
    public static final Set<String> CATEGORIES = Set.of("CASE", "QUESTION");
    public static final Set<String> REASONS = Set.of("SPAM", "ABUSE", "PRIVACY", "ILLEGAL", "OTHER");
    public record CutInput(String cutDate, String service, String summary) {}
    public record PostInput(String requestKey, String category, String title, String content, CutInput cut) {}
    public record EditInput(String title, String content) {}
    public record CommentInput(String clientKey, String content) {}
    public record ReportInput(String reason, String detail) {}
    public record Upload(String contentType, byte[] bytes) {}
    public record AuthorView(String displayName) {}
    public record CutView(String cutDate, String service, String summary) {}
    public record PostSummary(String id, String category, String title, String excerpt, AuthorView author, CutView cut, String photoUrl,
        int photoCount, int commentCount, int reactionCount, String status, String hiddenBy, String createdAt) {}
    public record Post(String id, String category, String title, String content, AuthorView author, CutView cut, List<String> photoUrls,
        int commentCount, int reactionCount, boolean reacted, boolean mine, String status, String createdAt, String updatedAt) {}
    public record Comment(long id, AuthorView author, String content, boolean mine, boolean hidden, String createdAt) {}
    public record Status(boolean suspended, String endsAt, String reason) {}
    public record Created<T>(boolean created, T body) {}
    public record PhotoFile(String contentType, byte[] bytes) {}

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final CommunityMapper mapper; private final NotificationService notifications; private final ObjectMapper json;
    public CommunityService(CommunityMapper mapper, NotificationService notifications, ObjectMapper json) { this.mapper=mapper; this.notifications=notifications; this.json=json; }

    @Transactional(readOnly=true)
    public List<PostSummary> posts(MemberPrincipal viewer, String category, String service, String query, String before) {
        if (category != null && !CATEGORIES.contains(category)) throw ApiException.invalidRequest();
        if (before != null && !Inputs.uuid(before)) throw ApiException.invalidRequest();
        String q = query == null || query.isBlank() ? null : like(Inputs.text(query, 50));
        String s = service == null || service.isBlank() ? null : Inputs.text(service, 60);
        return mapper.posts(id(viewer), category, s, q, before).stream().map(CommunityService::summary).toList();
    }
    // LIKE의 %·_를 글자 그대로 찾게 함
    private static String like(String value) { return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"); }

    @Transactional(readOnly=true) public List<PostSummary> mine(MemberPrincipal principal) { return mapper.mine(principal.id()).stream().map(CommunityService::summary).toList(); }

    // 글·댓글을 쓰기 전에 화면이 막힌 이유와 기간을 먼저 보여 주려고 씀
    @Transactional(readOnly=true)
    public Status status(MemberPrincipal principal) {
        var sanction = mapper.activeSanction(principal.id());
        return sanction == null ? new Status(false, null, null) : new Status(true, Inputs.time(sanction.endsAt()), sanction.reason());
    }

    @Transactional(readOnly=true)
    public Post post(MemberPrincipal viewer, String id) { return detail(visible(id, id(viewer)), id(viewer)); }

    @Transactional(readOnly=true)
    public PhotoFile photo(String id, int position) {
        if (!Inputs.uuid(id) || position < 0 || position >= MAX_PHOTOS) throw ApiException.notFound();
        var photo = mapper.photo(id, position);
        if (photo == null) throw ApiException.notFound();
        return new PhotoFile(photo.contentType(), photo.data());
    }

    @Transactional(rollbackFor=Exception.class)
    public Created<Post> write(MemberPrincipal principal, String context, PostInput input, List<Upload> photos) {
        StorageContext.check(principal, context);
        if (input == null || !Inputs.uuid(input.requestKey()) || input.category() == null || !CATEGORIES.contains(input.category())) throw ApiException.invalidRequest();
        String title = Inputs.text(input.title(), 100), content = Inputs.text(input.content(), 5000);
        LocalDate cutDate = null; String service = null, summary = null;
        if (input.cut() != null) {
            try { cutDate = LocalDate.parse(input.cut().cutDate()); } catch (RuntimeException e) { throw ApiException.invalidRequest(); }
            if (cutDate.isAfter(LocalDate.now(SEOUL))) throw ApiException.invalidRequest();
            service = Inputs.text(input.cut().service(), 60); summary = Inputs.text(input.cut().summary(), 2000);
        }
        if ("CASE".equals(input.category()) && cutDate == null) throw ApiException.invalidRequest();
        List<Upload> files = photos == null ? List.of() : photos;
        if (files.size() > MAX_PHOTOS) throw ApiException.invalidRequest();
        for (var photo : files) {
            if (photo.bytes().length > PhotoCheck.MAX_BYTES) throw ApiException.tooLarge();
            if (!PhotoCheck.readable(photo.contentType(), photo.bytes())) throw ApiException.unsupportedMedia();
        }
        String authorName = writer(principal);
        byte[] hash = hash(input.category(), title, content, cutDate, service, summary, files);
        var existing = mapper.byRequestKey(principal.id(), input.requestKey());
        if (existing != null) {
            if (!MessageDigest.isEqual(existing.contentHash(), hash)) throw ApiException.conflict();
            return new Created<>(false, detail(existing, principal.id()));
        }
        String id = UUID.randomUUID().toString();
        if (mapper.insertPost(id, principal.id(), authorName, input.requestKey(), hash, input.category(), title, content, cutDate, service, summary) != 1) throw ApiException.conflict();
        for (int i = 0; i < files.size(); i++)
            if (mapper.insertPhoto(id, i, files.get(i).contentType(), files.get(i).bytes().length, files.get(i).bytes()) != 1) throw ApiException.conflict();
        return new Created<>(true, detail(mapper.post(id, principal.id()), principal.id()));
    }

    @Transactional(rollbackFor=Exception.class)
    public Post edit(MemberPrincipal principal, String context, String id, EditInput input) {
        StorageContext.check(principal, context);
        if (input == null) throw ApiException.invalidRequest();
        String title = Inputs.text(input.title(), 100), content = Inputs.text(input.content(), 5000);
        writer(principal);
        var post = lockedVisible(id);
        if (post.authorId() != principal.id()) throw ApiException.forbidden();
        if (mapper.updatePost(id, principal.id(), title, content) != 1) throw ApiException.conflict();
        return detail(mapper.post(id, principal.id()), principal.id());
    }

    @Transactional(rollbackFor=Exception.class)
    public void delete(MemberPrincipal principal, String context, String id) {
        StorageContext.check(principal, context);
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var post = mapper.lockPost(id);
        if (post == null || "DELETED".equals(post.status())) throw ApiException.notFound();
        if (post.authorId() != principal.id()) throw ApiException.forbidden();
        if (mapper.deletePost(id, principal.id()) != 1) throw ApiException.conflict();
    }

    @Transactional(readOnly=true)
    public List<Comment> comments(MemberPrincipal viewer, String postId) {
        visible(postId, id(viewer));
        long me = id(viewer);
        // 숨긴 댓글은 쓴 회원에게만 숨김 표시와 함께 보임
        return mapper.comments(postId, me).stream().map(c -> comment(c, me)).toList();
    }

    @Transactional(rollbackFor=Exception.class)
    public Created<Comment> comment(MemberPrincipal principal, String context, String postId, CommentInput input) {
        StorageContext.check(principal, context);
        if (input == null || !Inputs.uuid(input.clientKey())) throw ApiException.invalidRequest();
        String content = Inputs.text(input.content(), 1000);
        String authorName = writer(principal);
        var post = lockedVisible(postId);
        var existing = mapper.commentByKey(postId, principal.id(), input.clientKey());
        if (existing != null) {
            if (!existing.content().equals(content)) throw ApiException.conflict();
            return new Created<>(false, comment(existing, principal.id()));
        }
        if (mapper.insertComment(postId, principal.id(), authorName, input.clientKey(), content) != 1) throw ApiException.conflict();
        var saved = mapper.comment(mapper.lastId());
        if (post.authorId() != principal.id()) notifications.create(post.authorId(), NotificationService.COMMUNITY_COMMENT, postId, authorName);
        return new Created<>(true, comment(saved, principal.id()));
    }

    @Transactional(rollbackFor=Exception.class)
    public void deleteComment(MemberPrincipal principal, String context, long id) {
        StorageContext.check(principal, context);
        var comment = mapper.lockComment(id);
        if (comment == null || "DELETED".equals(comment.status())) throw ApiException.notFound();
        if (comment.authorId() != principal.id()) throw ApiException.forbidden();
        if (mapper.deleteComment(id, principal.id()) != 1) throw ApiException.conflict();
    }

    @Transactional public void react(MemberPrincipal principal, String postId) { lockedVisible(postId); mapper.react(postId, principal.id()); }
    @Transactional public void unreact(MemberPrincipal principal, String postId) { lockedVisible(postId); mapper.unreact(postId, principal.id()); }

    // 같은 회원이 같은 대상을 두 번 신고하면 409. 열린 신고가 기준을 넘으면 숨김
    @Transactional(rollbackFor=Exception.class)
    public void reportPost(MemberPrincipal principal, String context, String postId, ReportInput input) {
        StorageContext.check(principal, context);
        var reason = reason(input);
        var post = lockedVisible(postId);
        if (post.authorId() == principal.id()) throw ApiException.invalidRequest();
        if (mapper.reportPost(postId, principal.id(), reason[0], reason[1]) != 1) throw ApiException.conflict();
        if (mapper.openPostReports(postId) >= AUTO_HIDE_REPORTS) {
            if (mapper.hidePost(postId) != 1) throw ApiException.conflict();
            notifications.create(post.authorId(), NotificationService.COMMUNITY_POST_HIDDEN, postId, null);
        }
    }

    @Transactional(rollbackFor=Exception.class)
    public void reportComment(MemberPrincipal principal, String context, long commentId, ReportInput input) {
        StorageContext.check(principal, context);
        var reason = reason(input);
        var comment = mapper.lockComment(commentId);
        if (comment == null || !"VISIBLE".equals(comment.status())) throw ApiException.notFound();
        if (comment.authorId() == principal.id()) throw ApiException.invalidRequest();
        if (mapper.reportComment(commentId, principal.id(), reason[0], reason[1]) != 1) throw ApiException.conflict();
        if (mapper.openCommentReports(commentId) >= AUTO_HIDE_REPORTS) {
            if (mapper.hideComment(commentId) != 1) throw ApiException.conflict();
            notifications.create(comment.authorId(), NotificationService.COMMUNITY_COMMENT_HIDDEN, comment.postId(), null);
        }
    }

    private static String[] reason(ReportInput input) {
        if (input == null || input.reason() == null || !REASONS.contains(input.reason())) throw ApiException.invalidRequest();
        String detail = Inputs.optionalText(input.detail(), 200);
        if ("OTHER".equals(input.reason()) && detail == null) throw ApiException.invalidRequest();
        return new String[]{input.reason(), detail};
    }
    // 글·댓글을 쓰는 회원을 잠그고 제재 중인지 확인함
    private String writer(MemberPrincipal principal) {
        String name = mapper.lockMember(principal.id());
        if (name == null) throw ApiException.notFound();
        if (mapper.activeSanctions(principal.id()) > 0) throw ApiException.communitySuspended();
        return name;
    }
    private CommunityMapper.PostRow visible(String id, long viewer) {
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var post = mapper.post(id, viewer);
        if (post == null || !"VISIBLE".equals(post.status())) throw ApiException.notFound();
        return post;
    }
    private CommunityMapper.Locked lockedVisible(String id) {
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var post = mapper.lockPost(id);
        if (post == null || !"VISIBLE".equals(post.status())) throw ApiException.notFound();
        return post;
    }
    private static long id(MemberPrincipal viewer) { return viewer == null ? 0 : viewer.id(); }

    private byte[] hash(String category, String title, String content, LocalDate cutDate, String service, String summary, List<Upload> photos) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            var fields = new ArrayList<String>(List.of(category, title, content, cutDate == null ? "" : cutDate.toString(), service == null ? "" : service, summary == null ? "" : summary));
            photos.forEach(p -> fields.add(p.contentType()));
            digest.update(json.writeValueAsBytes(fields));
            photos.forEach(p -> digest.update(p.bytes()));
            return digest.digest();
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(); }
    }

    static String photoUrl(String id, int position) { return "/api/community/posts/" + id + "/photos/" + position; }
    private static CutView cut(CommunityMapper.PostRow p) { return p.cutDate() == null ? null : new CutView(p.cutDate().toString(), p.service(), p.summary()); }
    private static String excerpt(String content) {
        int end = content.codePointCount(0, content.length()) <= 120 ? content.length() : content.offsetByCodePoints(0, 120);
        return content.substring(0, end);
    }
    // 처리 전 신고가 남아 있으면 신고가 쌓여 자동으로 숨긴 것, 없으면 관리자가 숨기기로 정한 것
    static PostSummary summary(CommunityMapper.PostRow p) {
        String hiddenBy = "HIDDEN".equals(p.status()) ? (p.openReports() > 0 ? "REPORTS" : "ADMIN") : null;
        return new PostSummary(p.id(), p.category(), p.title(), excerpt(p.content()), new AuthorView(p.authorName()), cut(p),
            p.photoCount() > 0 ? photoUrl(p.id(), 0) : null, p.photoCount(), p.commentCount(), p.reactionCount(), p.status(), hiddenBy, Inputs.time(p.createdAt()));
    }
    static Post detail(CommunityMapper.PostRow p, long viewer) {
        return new Post(p.id(), p.category(), p.title(), p.content(), new AuthorView(p.authorName()), cut(p),
            IntStream.range(0, p.photoCount()).mapToObj(i -> photoUrl(p.id(), i)).toList(),
            p.commentCount(), p.reactionCount(), p.reacted(), p.authorId() == viewer, p.status(), Inputs.time(p.createdAt()), Inputs.time(p.updatedAt()));
    }
    private static Comment comment(CommunityMapper.CommentRow c, long viewer) {
        return new Comment(c.id(), new AuthorView(c.authorName()), c.content(), c.authorId() == viewer, "HIDDEN".equals(c.status()), Inputs.time(c.createdAt()));
    }
}
