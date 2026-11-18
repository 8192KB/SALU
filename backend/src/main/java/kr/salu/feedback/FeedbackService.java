package kr.salu.feedback;

import java.util.List;
import java.util.Objects;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.Inputs;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 이용 의견. 보낸 회원도 다시 읽지 못하고 관리자만 목록을 봄(docs/feedback-api.md)
@Service
public class FeedbackService {
    public record Input(String requestKey, String content) {}
    public record Sent(long id, String createdAt) {}
    public record Item(long id, Long memberId, String authorName, String content, String createdAt) {}
    public record Result(boolean created, Sent body) {}

    private final FeedbackMapper mapper;
    public FeedbackService(FeedbackMapper mapper) { this.mapper = mapper; }

    @Transactional(rollbackFor=Exception.class)
    // 로그인하지 않았으면 principal이 null이고 보낸 사람 없이 저장함
    public Result send(MemberPrincipal principal, Input input) {
        if (input == null || !Inputs.uuid(input.requestKey())) throw ApiException.invalidRequest();
        String content = Inputs.text(input.content(), 2000);
        Long member = principal == null ? null : principal.id();
        var existing = mapper.byKey(input.requestKey());
        if (existing != null) {
            if (!Objects.equals(existing.memberId(), member) || !existing.content().equals(content)) throw ApiException.conflict();
            return new Result(false, sent(existing));
        }
        if (mapper.insert(member, input.requestKey(), content) != 1) throw ApiException.conflict();
        return new Result(true, sent(mapper.last()));
    }

    @Transactional(readOnly=true)
    public List<Item> recent() {
        return mapper.recent().stream()
            .map(row -> new Item(row.id(), row.memberId(), row.authorName(), row.content(), Inputs.time(row.createdAt())))
            .toList();
    }

    private static Sent sent(FeedbackMapper.Saved saved) { return new Sent(saved.id(), Inputs.time(saved.createdAt())); }
}
