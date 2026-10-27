package kr.salu.review;

import java.util.List;
import java.util.UUID;
import kr.salu.auth.MemberPrincipal;
import kr.salu.auth.StorageContext;
import kr.salu.common.Inputs;
import kr.salu.common.error.ApiException;
import kr.salu.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewService {
    public record ReviewInput(Integer rating, String content) {}
    public record Review(String id, String consultationId, String designerId, AuthorView author, int rating, String content, String createdAt, String updatedAt, boolean mine) {}
    public record AuthorView(String displayName) {}
    public record DesignerReviews(int count, Double averageRating, List<Review> items) {}
    private final ReviewMapper mapper; private final NotificationService notifications;
    public ReviewService(ReviewMapper mapper, NotificationService notifications) { this.mapper=mapper; this.notifications=notifications; }

    private static int rating(ReviewInput input) {
        if (input == null || input.rating() == null || input.rating() < 1 || input.rating() > 5) throw ApiException.invalidRequest();
        return input.rating();
    }
    // 상담의 보낸 회원만 후기를 다룸. 받은 디자이너는 403, 그 밖의 회원은 상담이 있는지도 알리지 않음
    private ReviewMapper.Target owned(MemberPrincipal principal, ReviewMapper.Target target) {
        if (target == null || (target.customerId() != principal.id() && target.designerMemberId() != principal.id())) throw ApiException.notFound();
        if (target.customerId() != principal.id()) throw ApiException.forbidden();
        return target;
    }
    private ReviewMapper.Target locked(MemberPrincipal principal, String consultation) {
        if (!Inputs.uuid(consultation)) throw ApiException.notFound();
        return owned(principal, mapper.lockConsultation(consultation));
    }

    @Transactional(rollbackFor=Exception.class)
    public Review write(MemberPrincipal principal, String context, String consultation, ReviewInput input) {
        StorageContext.check(principal, context);
        int rating = rating(input); String content = Inputs.text(input.content(), 1000);
        var target = locked(principal, consultation);
        // 답변을 받은 뒤에만, 상담마다 한 번만 씀. 상담당 하나는 DB UNIQUE로도 막음
        if (!"ANSWERED".equals(target.status()) || mapper.byConsultation(consultation) != null) throw ApiException.conflict();
        if (mapper.insert(UUID.randomUUID().toString(), target, rating, content) != 1) throw ApiException.conflict();
        notifications.create(target.designerMemberId(), NotificationService.REVIEW_RECEIVED, consultation, target.customerName());
        return view(mapper.byConsultation(consultation), principal.id());
    }

    @Transactional(rollbackFor=Exception.class)
    public Review update(MemberPrincipal principal, String context, String consultation, ReviewInput input) {
        StorageContext.check(principal, context);
        int rating = rating(input); String content = Inputs.text(input.content(), 1000);
        locked(principal, consultation);
        if (mapper.update(consultation, principal.id(), rating, content) != 1) throw ApiException.notFound();
        return view(mapper.byConsultation(consultation), principal.id());
    }

    @Transactional(rollbackFor=Exception.class)
    public void delete(MemberPrincipal principal, String context, String consultation) {
        StorageContext.check(principal, context);
        var target = locked(principal, consultation);
        if (mapper.delete(consultation, principal.id()) != 1) throw ApiException.notFound();
        notifications.withdraw(target.designerMemberId(), NotificationService.REVIEW_RECEIVED, consultation);
    }

    // 상담의 두 참여자가 그 상담의 후기를 봄. 아직 없으면 404
    @Transactional(readOnly=true)
    public Review ofConsultation(MemberPrincipal principal, String consultation) {
        if (!Inputs.uuid(consultation)) throw ApiException.notFound();
        var target = mapper.consultation(consultation);
        if (target == null || (target.customerId() != principal.id() && target.designerMemberId() != principal.id())) throw ApiException.notFound();
        var review = mapper.byConsultation(consultation);
        if (review == null) throw ApiException.notFound();
        return view(review, principal.id());
    }

    @Transactional(readOnly=true)
    public DesignerReviews ofDesigner(String designer, MemberPrincipal viewer) {
        if (!Inputs.uuid(designer) || mapper.publicDesigner(designer) == null) throw ApiException.notFound();
        long id = viewer == null ? 0 : viewer.id();
        var summary = mapper.summary(designer);
        return new DesignerReviews(summary.count(), summary.average(), mapper.byDesigner(designer).stream().map(r -> view(r, id)).toList());
    }

    private static Review view(ReviewMapper.Review r, long viewer) {
        return new Review(r.id(), r.consultationId(), r.designerId(), new AuthorView(r.authorName()), r.rating(), r.content(), Inputs.time(r.createdAt()), Inputs.time(r.updatedAt()), r.authorId() == viewer);
    }
}
