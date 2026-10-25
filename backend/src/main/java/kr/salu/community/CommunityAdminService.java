package kr.salu.community;

import java.util.List;
import java.util.Set;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.Inputs;
import kr.salu.common.error.ApiException;
import kr.salu.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// /api/admin/** 는 SecurityConfig에서 ADMIN만 들어옴
@Service
public class CommunityAdminService {
    public static final Set<Integer> SANCTION_DAYS = Set.of(3, 7, 30);
    public record Decision(String action) {}
    public record SanctionInput(Integer days, String reason) {}
    public record ReportedPost(String id, String title, long authorId, String authorName, String status, int openCount, List<String> reasons, String latestAt) {}
    public record ReportedComment(long id, String postId, String content, long authorId, String authorName, String status, int openCount, List<String> reasons, String latestAt) {}
    public record Reports(List<ReportedPost> posts, List<ReportedComment> comments) {}
    public record Report(String reason, String detail, String status, String createdAt) {}
    public record PostReview(CommunityService.Post post, long authorId, List<Report> reports) {}
    public record Sanction(long id, long memberId, String reason, String endsAt, String createdAt, String liftedAt, boolean active) {}
    private final CommunityAdminMapper mapper; private final CommunityMapper posts; private final NotificationService notifications;
    public CommunityAdminService(CommunityAdminMapper mapper, CommunityMapper posts, NotificationService notifications) { this.mapper=mapper; this.posts=posts; this.notifications=notifications; }

    private static List<String> reasons(String value) { return value == null ? List.of() : List.of(value.split(",")); }

    @Transactional(readOnly=true)
    public Reports reports() {
        return new Reports(
            mapper.reportedPosts().stream().map(p -> new ReportedPost(p.id(), p.title(), p.authorId(), p.authorName(), p.status(), p.openCount(), reasons(p.reasons()), Inputs.time(p.latestAt()))).toList(),
            mapper.reportedComments().stream().map(c -> new ReportedComment(c.id(), c.postId(), c.content(), c.authorId(), c.authorName(), c.status(), c.openCount(), reasons(c.reasons()), Inputs.time(c.latestAt()))).toList());
    }

    // 숨김·삭제된 글도 관리자는 내용과 신고를 봄
    @Transactional(readOnly=true)
    public PostReview post(String id) {
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var row = posts.post(id, 0);
        if (row == null) throw ApiException.notFound();
        return new PostReview(CommunityService.detail(row, 0), row.authorId(), mapper.postReports(id).stream().map(CommunityAdminService::report).toList());
    }

    // HIDE는 숨기고 신고를 받아들임, KEEP은 다시 보이게 하고 앞서 받아들인 신고까지 기각함. 작성자가 지운 글은 신고만 정리함
    // 보이던 것을 숨길 때만 작성자에게 알림. 신고가 쌓여 이미 숨겨진 것을 확정할 때는 다시 알리지 않음
    @Transactional
    public void decidePost(MemberPrincipal admin, String id, Decision decision) {
        boolean hide = "HIDE".equals(action(decision));
        if (!Inputs.uuid(id)) throw ApiException.notFound();
        var post = posts.lockPost(id);
        if (post == null) throw ApiException.notFound();
        if (!"DELETED".equals(post.status()) && mapper.setPostStatus(id, hide ? "HIDDEN" : "VISIBLE") != 1) throw ApiException.conflict();
        mapper.closePostReports(id, hide ? "ACCEPTED" : "DISMISSED", admin.id());
        if (!hide) mapper.dismissAcceptedPostReports(id, admin.id());
        if (hide && "VISIBLE".equals(post.status())) notifications.create(post.authorId(), NotificationService.COMMUNITY_POST_HIDDEN, id, null);
    }

    @Transactional
    public void decideComment(MemberPrincipal admin, long id, Decision decision) {
        boolean hide = "HIDE".equals(action(decision));
        var comment = posts.lockComment(id);
        if (comment == null) throw ApiException.notFound();
        if (!"DELETED".equals(comment.status()) && mapper.setCommentStatus(id, hide ? "HIDDEN" : "VISIBLE") != 1) throw ApiException.conflict();
        mapper.closeCommentReports(id, hide ? "ACCEPTED" : "DISMISSED", admin.id());
        if (!hide) mapper.dismissAcceptedCommentReports(id, admin.id());
        if (hide && "VISIBLE".equals(comment.status())) notifications.create(comment.authorId(), NotificationService.COMMUNITY_COMMENT_HIDDEN, comment.postId(), null);
    }

    @Transactional(readOnly=true)
    public List<Report> commentReports(long id) {
        if (posts.comment(id) == null) throw ApiException.notFound();
        return mapper.commentReports(id).stream().map(CommunityAdminService::report).toList();
    }

    @Transactional(readOnly=true)
    public List<Sanction> sanctions(long member) {
        if (mapper.memberExists(member) != 1) throw ApiException.notFound();
        return mapper.sanctions(member).stream().map(CommunityAdminService::sanction).toList();
    }

    @Transactional
    public Sanction sanction(MemberPrincipal admin, long member, SanctionInput input) {
        if (input == null || (input.days() != null && !SANCTION_DAYS.contains(input.days()))) throw ApiException.invalidRequest();
        String reason = Inputs.text(input.reason(), 200);
        if (mapper.memberExists(member) != 1) throw ApiException.notFound();
        if (member == admin.id()) throw ApiException.invalidRequest();
        if (mapper.insertSanction(member, reason, input.days(), admin.id()) != 1) throw ApiException.conflict();
        long id = mapper.lastId();
        notifications.create(member, NotificationService.COMMUNITY_SUSPENDED, Long.toString(id), null);
        return sanction(mapper.sanction(id));
    }

    @Transactional
    public void lift(MemberPrincipal admin, long id) {
        if (mapper.sanction(id) == null) throw ApiException.notFound();
        if (mapper.lift(id, admin.id()) != 1) throw ApiException.conflict();
    }

    private static String action(Decision decision) {
        if (decision == null || !("HIDE".equals(decision.action()) || "KEEP".equals(decision.action()))) throw ApiException.invalidRequest();
        return decision.action();
    }
    private static Report report(CommunityAdminMapper.Report r) { return new Report(r.reason(), r.detail(), r.status(), Inputs.time(r.createdAt())); }
    private static Sanction sanction(CommunityAdminMapper.Sanction s) {
        boolean active = s.liftedAt() == null && (s.endsAt() == null || s.endsAt().isAfter(java.time.Instant.now()));
        return new Sanction(s.id(), s.memberId(), s.reason(), Inputs.time(s.endsAt()), Inputs.time(s.createdAt()), Inputs.time(s.liftedAt()), active);
    }
}
