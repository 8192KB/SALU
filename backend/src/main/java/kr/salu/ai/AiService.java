package kr.salu.ai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kr.salu.common.error.ApiException;
import kr.salu.directory.DirectoryMapper;
import kr.salu.directory.DirectoryService;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class AiService {
    public record DraftInput(@NotBlank @Size(max=2000) String text) {}
    public record Draft(String text) {}
    public record MatchInput(@NotBlank @Size(max=1000) String concern) {}
    public record Match(String designerId, String name, String reason) {}
    public record Matches(List<Match> items) {}
    private record Window(long started, int count) {}

    // 커트 준비에서 온 글은 `부위(방향): 내용` 줄이 여러 개라 줄과 앞 표시를 지키게 함
    private static final String DRAFT_PROMPT = """
        너는 고객이 미용 디자이너에게 보낼 상담 요청 글을 고쳐 주는 도우미다.
        글쓴이는 고객이다. 고객의 입장을 그대로 두고, 맞춤법·띄어쓰기를 고쳐 해요체 완성 문장(~요, ~까요?)으로 다듬는다.
        고객이 쓰지 않은 사실, 시술, 일정, 해결책, 질문, 디자이너의 말을 절대 덧붙이지 않는다. 묻는 말은 질문으로, 부탁은 부탁으로 남긴다.
        여러 줄이면 줄 수와 순서를 그대로 두고, 줄 앞의 `옆머리(물어보기):` 같은 표시는 고치지 않고 뒤의 내용만 고친다. 뜻을 알 수 없는 내용은 그대로 둔다.
        고친 글만 출력한다.

        예시 1
        입력: 앞머리 넘 짧게 잘림 다시 기를때 어케 해야됨
        출력: 앞머리가 너무 짧게 잘렸어요. 다시 기를 때는 어떻게 하면 좋을까요?

        예시 2
        입력:
        옆머리(바꾸기): 귀옆이 자꾸 뜸 숱 좀 쳐주세요
        뒤·목선(물어보기): 짧게 하는게 나을지
        집에서 손질: 드라이만함
        출력:
        옆머리(바꾸기): 귀 옆이 자꾸 떠요. 숱을 좀 쳐 주세요.
        뒤·목선(물어보기): 짧게 하는 게 나을까요?
        집에서 손질: 드라이만 해요.""";
    // 디자이너 ID 대신 목록 번호로 받아 출력 토큰을 줄임. 번호는 서버가 ID로 되돌림
    private static final String MATCH_PROMPT = """
        너는 미용실 상담 앱에서 고객의 머리 고민에 맞는 디자이너를 고른다.
        아래 디자이너 목록에 있는 사람만, 전문 분야와 소개가 고민과 실제로 관련 있을 때만 고른다. 관련 있는 사람이 없으면 []를 낸다. 최대 3명, 잘 맞는 순서.
        이유는 그 디자이너의 전문 분야·소개에 적힌 내용만 근거로 30자 안팎 한국어 한 문장, 해요체로 쓴다.
        출력은 JSON 배열 하나뿐이다: [{"no":목록 번호,"reason":"고른 이유"}]""";

    private final AiClient client;
    private final DirectoryService directory;
    private final ObjectMapper json;
    private final Map<Long, Window> windows = new HashMap<>();
    public AiService(AiClient client, DirectoryService directory, ObjectMapper json) { this.client = client; this.directory = directory; this.json = json; }

    public boolean enabled() { return client.enabled(); }

    // 회원당 1분 10번. 서버 한 대의 메모리라 재시작하면 처음부터 셈
    private synchronized void allow(long member) {
        long now = System.nanoTime();
        windows.entrySet().removeIf(e -> now - e.getValue().started() >= 60_000_000_000L);
        Window old = windows.get(member);
        if (old != null && old.count() >= 10) throw ApiException.aiRateLimited();
        windows.put(member, new Window(old == null ? now : old.started(), old == null ? 1 : old.count() + 1));
    }

    public Draft draft(long member, DraftInput input) {
        if (!client.enabled()) throw ApiException.aiUnavailable();
        allow(member);
        // 모델이 Markdown 줄바꿈으로 줄 끝에 붙이는 공백은 지움
        String text = client.chat(DRAFT_PROMPT, input.text().strip()).replaceAll("[ \\t]+\\n", "\n").strip();
        return new Draft(text.length() > 2000 ? text.substring(0, 2000) : text);
    }

    public Matches match(long member, MatchInput input) {
        if (!client.enabled()) throw ApiException.aiUnavailable();
        allow(member);
        // 목록 조회는 읽기 transaction으로 끝내고, 모델 호출은 transaction 밖에서 함
        List<DirectoryMapper.Profile> profiles = directory.profiles().stream().limit(50).toList();
        if (profiles.isEmpty()) return new Matches(List.of());
        var list = new StringBuilder();
        for (int i = 0; i < profiles.size(); i++) {
            var p = profiles.get(i);
            String intro = p.introduction().replaceAll("\\s+", " ");
            list.append(i + 1).append(". 이름: ").append(p.name()).append(" | 전문 분야: ").append(p.specialties())
                .append(" | 소개: ").append(intro, 0, Math.min(200, intro.length())).append('\n');
        }
        String answer = client.chat(MATCH_PROMPT, "디자이너 목록:\n" + list + "\n고객 고민: " + input.concern().strip());
        int start = answer.indexOf('['), end = answer.lastIndexOf(']');
        if (start < 0 || end < start) throw ApiException.aiUnavailable();
        try {
            var items = new ArrayList<Match>();
            var used = new java.util.HashSet<Integer>();
            for (var node : json.readTree(answer.substring(start, end + 1))) {
                int no = node.path("no").asInt(0);
                String reason = node.path("reason").asString("").strip();
                // 목록 밖 번호·중복·빈 이유는 버림
                if (no < 1 || no > profiles.size() || !used.add(no) || reason.isEmpty()) continue;
                var profile = profiles.get(no - 1);
                items.add(new Match(profile.id(), profile.name(), reason.length() > 200 ? reason.substring(0, 200) : reason));
                if (items.size() == 3) break;
            }
            return new Matches(items);
        } catch (RuntimeException e) {
            throw ApiException.aiUnavailable();
        }
    }
}
