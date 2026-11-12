package kr.salu.ai;

import java.util.Comparator;

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
    // tone: plain(해요체, 기본)·polite(합니다체). records: 함께 보낼 기록 요약(생략 가능). 되물을 질문을 고를 때만 씀
    public record DraftInput(@NotBlank @Size(max=2000) String text, @jakarta.validation.constraints.Pattern(regexp="plain|polite") String tone, @Size(max=3000) String records) {}
    // kept: 모델 답이 검사에 걸려 버리고 원래 글을 돌려줬는지. asks: 디자이너가 되물을 만한 질문(최대 3개)
    public record Draft(String text, boolean kept, List<String> asks) {}
    public record MatchInput(@NotBlank @Size(max=1000) String concern) {}
    public record Match(String designerId, String name, String quote, String history) {}
    public record Matches(List<Match> items, List<String> basis) {}
    public record Turn(@NotBlank @jakarta.validation.constraints.Pattern(regexp="user|assistant") String role, @NotBlank @Size(max=1500) String text) {}
    public record ChatInput(@NotBlank @Size(max=500) String message, @Size(max=6) List<@jakarta.validation.Valid Turn> history) {}
    public record ChatDesigner(String designerId, String name) {}
    public record ChatAnswer(String answer, List<ChatDesigner> designers, List<String> basis, boolean blocked) {}
    private record Window(long started, int count) {}

    // 커트 준비에서 온 글은 `부위(방향): 내용` 줄이 여러 개라 줄과 앞 표시를 지키게 함
    private static final String DRAFT_PROMPT = """
        너는 고객이 미용 디자이너에게 보낼 상담 요청 글을 고쳐 주는 도우미다.
        글쓴이는 고객이다. 고객의 입장을 그대로 두고, 맞춤법·띄어쓰기를 고쳐 해요체 완성 문장(~요, ~까요?)으로 다듬는다.
        고객이 쓰지 않은 사실, 시술, 일정, 해결책, 질문, 디자이너의 말을 절대 덧붙이지 않는다. 고객이 쓴 내용도 빼지 않는다. 묻는 말은 물음표로 끝나는 질문으로, 부탁은 부탁으로 남긴다.
        여러 줄이면 줄 수와 순서를 그대로 두고, 줄 앞의 `옆머리(물어보기):` 같은 표시는 고치지 않고 뒤의 내용만 고친다. 뜻을 알 수 없는 내용은 그대로 둔다. 고객이 쓴 말을 뜻이 다른 말로 바꾸지 않는다.
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
    // 후보와 고객 기록은 서버가 골라서 줌. 모델은 고를 사람·순서·근거 구절만 정하고 문장을 짓지 않음
    // (이유 문장을 쓰게 하면 프로필에 없는 효과를 지어냄. 2026-11-05 고정 질문 점검)
    private static final String MATCH_PROMPT = """
        너는 미용실 상담 앱에서 고객의 머리 고민에 맞는 디자이너를 고른다.
        아래 디자이너 목록에 있는 사람만, 전문 분야나 소개가 고민을 직접 다룰 때만 고른다. 막연히 커트를 한다는 정도로는 고르지 않는다. 관련 있는 사람이 없으면 []를 낸다. 최대 3명, 잘 맞는 순서.
        [고객 기록]이 있으면 순서를 정할 때만 참고해, (질문과 관련) 기록을 먼저 보고 기록에 적힌 시술·불편한 점과 맞는 디자이너를 앞에 둔다.
        quote에는 그 디자이너의 전문 분야 하나나 소개 한 문장 중 고민과 가장 관련된 것을 한 글자도 바꾸지 않고 그대로 옮긴다.
        출력은 JSON 배열 하나뿐이다: [{"no":목록 번호,"quote":"프로필에서 그대로 옮긴 부분"}]""";
    // 후보로 넘길 최대 인원. 프로필과 겹치는 사람이 없으면 공개 프로필 50명 전체
    private static final int CANDIDATES = 8;
    // `옆머리(물어보기):`, `집에서 손질:` 같은 줄 앞 표시
    private static final java.util.regex.Pattern LABEL = java.util.regex.Pattern.compile("^([^:\\n]{1,30}):");

    private final AiClient client;
    private final DirectoryService directory;
    private final AiRecords records;
    private final ObjectMapper json;
    private final Map<Long, Window> windows = new HashMap<>();
    public AiService(AiClient client, DirectoryService directory, AiRecords records, ObjectMapper json) { this.client = client; this.directory = directory; this.records = records; this.json = json; }

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
        String original = input.text().strip();
        String text = client.chat(draftPrompt(input.tone()), original).replaceAll("[ \\t]+\\n", "\n").strip();
        if (text.length() > 2000) text = text.substring(0, 2000);
        // 줄 수나 줄 앞 표시가 바뀐 답은 버리고 원래 글을 돌려줌
        boolean ok = sameShape(original, text) && !addsContent(original, text) && keepsQuestions(original, text);
        String records = input.records() == null ? "" : input.records().strip();
        return new Draft(ok ? text : original, !ok, asks(original, records));
    }

    // 고객 글에 넣지 않고 따로 보여 줄 질문이라 다듬기 검사와 별개. 고객이 이 질문의 답을 적어 두면 디자이너가 되묻지 않음
    private static final String ASK_PROMPT = """
        너는 커트 뒤 상담 요청을 받는 미용 디자이너다. 고객이 보낼 요청 글을 읽고, 답하기 전에 고객에게 되물을 만한 것을 고른다.
        - 입력은 [요청 글]이다. 고객이 함께 보낼 기록이 있으면 그 앞에 [함께 보낼 기록]이 붙는다. 디자이너는 둘 다 본다.
        - 머리 상태를 판단하는 데 필요한데 요청 글과 기록 어디에도 없는 것만 묻는다: 커트하고 언제부터 그랬는지, 어느 부위인지, 어떻게 불편한지, 원하는 길이나 모양, 집에서 어떻게 말리고 손질하는지.
        - 요청 글이나 기록에 이미 있는 것은 묻지 않는다. 기록에 커트한 날이나 경과(D+일수)가 있으면 언제 잘랐는지, 언제부터 그랬는지 묻지 않는다. 불편한 점만 있고 앞으로 원하는 길이나 모양이 없으면 그것을 묻는다. 필요한 것이 다 있으면 "없음"만 쓴다.
        - 최대 3개. 한 줄에 하나씩 해요체 질문 한 문장으로 쓰고 물음표로 끝낸다. 번호나 기호를 붙이지 않는다.
        - 시술·제품·가격을 권하거나 머리 상태를 짐작하지 않는다. 질문만 쓴다.

        예시 1
        입력:
        [요청 글]
        옆머리 뜨는거 어케 해요
        출력:
        커트하고 며칠 뒤부터 옆머리가 떴나요?
        아침에 옆머리를 어떻게 말리세요?
        옆머리를 차분하게 두고 싶은지, 더 짧게 하고 싶은지 알려 주실래요?

        예시 2
        입력:
        [함께 보낼 기록]
        9월 20일 커트
        경과 D+9(옆머리): 불편한 점 귀 옆에서 떠요 / 손질 아침에 드라이로 아래로 눌러 말려요
        [요청 글]
        어떻게 하면 좋을까요?
        출력:
        옆머리를 차분하게 두고 싶은지, 더 짧게 하고 싶은지 알려 주실래요?

        예시 3
        입력:
        [요청 글]
        옆머리(바꾸기): 커트하고 일주일 뒤부터 귀 옆이 떠요. 숱을 좀 쳐 주세요.
        집에서 손질: 아침에 드라이로 아래로 눌러 말려요.
        출력:
        없음""";

    // 다듬은 글은 이미 받았으므로 이 호출이 실패해도 요청 전체를 실패시키지 않음
    private List<String> asks(String original, String records) {
        String input = (records.isEmpty() ? "" : "[함께 보낼 기록]\n" + records + "\n") + "[요청 글]\n" + original;
        try {
            // 기록에 있는 날짜·D+일수는 질문에 나와도 지어낸 숫자가 아님
            return parseAsks(original + "\n" + records, client.chat(ASK_PROMPT, input));
        } catch (ApiException e) {
            return List.of();
        }
    }

    static List<String> parseAsks(String original, String answer) {
        var asks = new ArrayList<String>();
        for (String line : answer.split("\\R")) {
            String ask = line.replaceFirst("^\\s*(?:[-*•]|\\d+[.)])\\s*", "").strip();
            if (ask.length() < 6 || ask.length() > 80 || !ask.endsWith("?") || asks.contains(ask)) continue;
            if (newDigits(original, ask) || LEAK.matcher(ask).find() || OUTSIDE.matcher(ask).find()) continue;
            asks.add(ask);
            if (asks.size() == 3) break;
        }
        return asks;
    }

    // 묻는 말이 있던 글이면 다듬은 글도 묻는 말이어야 함. 질문을 빼고 사실만 남기면 뜻이 바뀜
    private static final java.util.regex.Pattern ASKING = java.util.regex.Pattern.compile("\\?|어케|어떻게|어떡|왜|뭐가|무엇|언제|얼마|궁금|나을지|할지|될지|인지|까요|나요");
    // 할지·나을지 같은 간접 질문을 남긴 글도 묻는 말로 봄
    private static final java.util.regex.Pattern ASKED = java.util.regex.Pattern.compile("\\?|궁금|알려 주세요|알고 싶|할지|나을지|될지|인지|고민");
    static boolean keepsQuestions(String original, String text) {
        String[] before = original.split("\\R"), after = text.split("\\R");
        // 줄이 같으면 줄마다, 한 줄짜리 글이면 글 전체로 비교
        if (before.length != after.length) { before = new String[] { original }; after = new String[] { text }; }
        for (int i = 0; i < before.length; i++)
            if (ASKING.matcher(before[i]).find() && !ASKED.matcher(after[i]).find()) return false;
        return true;
    }

    // 맞춤법·말투만 고치면 길이가 크게 늘지 않고 없던 숫자가 생기지 않음. 넘으면 내용을 지어낸 것으로 봄
    static boolean addsContent(String original, String text) {
        return text.length() > original.length() * 1.6 + 30 || newDigits(original, text);
    }

    // 원래 글에 없던 숫자는 모델이 지어낸 날짜·기간·가격
    private static boolean newDigits(String original, String text) {
        var digits = java.util.regex.Pattern.compile("\\d+").matcher(text);
        while (digits.find()) if (!original.contains(digits.group())) return true;
        return false;
    }

    // 모델은 예시 말투를 따라가므로 정중하게는 문장 규칙과 예시 출력을 함께 합니다체로 바꿈
    static String draftPrompt(String tone) {
        if ("polite".equals(tone)) return DRAFT_PROMPT
            .replace("해요체 완성 문장(~요, ~까요?)", "합니다체 완성 문장(~습니다, ~ㄹ까요?, ~해 주십시오)")
            .replace("앞머리가 너무 짧게 잘렸어요.", "앞머리가 너무 짧게 잘렸습니다.")
            .replace("귀 옆이 자꾸 떠요. 숱을 좀 쳐 주세요.", "귀 옆이 자꾸 뜹니다. 숱을 좀 쳐 주십시오.")
            .replace("집에서 손질: 드라이만 해요.", "집에서 손질: 드라이만 합니다.");
        return DRAFT_PROMPT;
    }

    static boolean sameShape(String original, String text) {
        String[] before = original.split("\\R"), after = text.split("\\R");
        // 한 줄이어도 줄 앞 표시가 있으면 같은지 봄(커트 준비 칸이 하나뿐인 경우)
        if (before.length == 1 && !LABEL.matcher(before[0].strip()).find()) return true;
        if (before.length != after.length) return false;
        for (int i = 0; i < before.length; i++) {
            var a = LABEL.matcher(before[i].strip());
            var b = LABEL.matcher(after[i].strip());
            boolean labeled = a.find();
            if (labeled != b.find() || labeled && !a.group(1).strip().equals(b.group(1).strip())) return false;
        }
        return true;
    }

    // 고민·고른 기록과 전문 분야(두 배)·소개가 겹치는 사람을 먼저 고름
    private static List<DirectoryMapper.Profile> candidates(List<DirectoryMapper.Profile> profiles, String wanted) {
        var grams = AiRecords.grams(wanted);
        var scored = new ArrayList<Map.Entry<DirectoryMapper.Profile, Integer>>();
        for (var p : profiles) {
            int score = 2 * AiRecords.overlap(grams, AiRecords.grams(String.valueOf(p.specialties()))) + AiRecords.overlap(grams, AiRecords.grams(p.introduction()));
            if (score > 0) scored.add(Map.entry(p, score));
        }
        if (scored.isEmpty()) return profiles;
        scored.sort(Map.Entry.<DirectoryMapper.Profile, Integer>comparingByValue().reversed());
        return scored.stream().limit(CANDIDATES).map(Map.Entry::getKey).toList();
    }

    public Matches match(long member, MatchInput input) {
        if (!client.enabled()) throw ApiException.aiUnavailable();
        allow(member);
        // 목록 조회는 읽기 transaction으로 끝내고, 모델 호출은 transaction 밖에서 함
        List<DirectoryMapper.Profile> all = directory.profiles().stream().limit(50).toList();
        // 내 기록도 읽기 transaction 안에서 끝냄
        var picked = records.pick(member, input.concern());
        if (all.isEmpty()) return new Matches(List.of(), picked.basis());
        String wanted = input.concern() + "\n" + picked.related().facts().stream().map(AiRecords.Fact::content).collect(java.util.stream.Collectors.joining("\n"));
        var concernGrams = AiRecords.grams(input.concern());
        var profiles = candidates(all, wanted);
        var list = new StringBuilder();
        for (int i = 0; i < profiles.size(); i++) {
            var p = profiles.get(i);
            String intro = p.introduction().replaceAll("\\s+", " ");
            list.append(i + 1).append(". 이름: ").append(p.name()).append(" | 전문 분야: ").append(p.specialties())
                .append(" | 소개: ").append(intro, 0, Math.min(200, intro.length())).append('\n');
        }
        String history = picked.facts().isEmpty() ? "" : "\n[고객 기록] 서버가 고객 계정에 저장된 기록에서 고름\n" + picked.prompt() + "\n";
        String answer = client.chat(MATCH_PROMPT, "[디자이너 목록]\n" + list + history + "\n[고객 고민]\n" + input.concern().strip());
        int start = answer.indexOf('['), end = answer.lastIndexOf(']');
        if (start < 0 || end < start) throw ApiException.aiUnavailable();
        try {
            var items = new ArrayList<Match>();
            var used = new java.util.HashSet<Integer>();
            for (var node : json.readTree(answer.substring(start, end + 1))) {
                int no = node.path("no").asInt(0);
                String quote = node.path("quote").asString("").replaceAll("\\s+", " ").strip();
                // 목록 밖 번호·중복은 버림
                if (no < 1 || no > profiles.size() || !used.add(no)) continue;
                var profile = profiles.get(no - 1);
                // 근거 구절이 프로필에 그대로 있어야 받음. 없으면 프로필에 없는 근거로 고른 것
                String written = (profile.specialties() + " " + profile.introduction()).replaceAll("\\s+", " ");
                if (quote.codePointCount(0, quote.length()) < 2 || !written.contains(quote)) continue;
                // 근거 구절이 고민 글과 겹치는 말이 없고 고른 기록의 커트를 맡지도 않았으면 관계없는 디자이너로 봄
                // (앞머리 고민에 옆머리 구절을 대는 경우)
                // 담당 디자이너로 남기는 것은 관련 기록일 때만. 최근 기록만으로 관계없는 디자이너를 올리지 않음
                String handled = AiRecords.history(picked, profile.id(), profile.name());
                if (AiRecords.history(picked.related(), profile.id(), profile.name()) == null && AiRecords.overlap(concernGrams, AiRecords.grams(quote)) == 0) continue;
                items.add(new Match(profile.id(), profile.name(), quote.length() > 200 ? quote.substring(0, 200) : quote, handled));
                if (items.size() == 3) break;
            }
            return new Matches(items, picked.basis());
        } catch (RuntimeException e) {
            throw ApiException.aiUnavailable();
        }
    }

    // AI 상담(docs/ai-api.md `AI 상담`). 바로 답할 질문 → 내 기록 고르기 → 지시 → 답 검사 순서
    // 무엇을 보여 줄지는 서버가 정하고, 모델은 받은 기록과 디자이너 목록 안에서만 답함
    private static final String CHAT_PROMPT = """
        너는 SALU 앱의 머리 손질 상담 도우미다. 고객이 남긴 커트 기록과 경과를 보고, 집에서의 손질과 다음 커트 때 디자이너에게 말할 점을 알려 준다.
        규칙:
        - 해요체로 3~6문장만 쓴다. Markdown 기호(**, #, 목록 기호)를 쓰지 않는다.
        - 근거는 [고객 기록]과 [디자이너 목록]에 적힌 것만 쓴다. 적히지 않은 시술·날짜·제품 이름·가격·효과를 지어내지 않는다. 기록이 없으면 일반 상담으로 답한다.
        - 기록을 근거로 들 때는 그 줄 맨 앞의 이름을 그대로 쓴다("9월 20일 투블럭 커트 기록을 보면", "10월 15일 경과를 보면"). 경과 줄의 내용은 커트 날짜가 아니라 그 경과 이름으로 말한다. (질문과 관련) 기록을 먼저 본다. 질문과 관계없는 기록은 말하지 않는다.
        - 방법이나 추천을 물으면 답을 먼저 준다. 되묻기만 하고 끝내지 않는다. 더 좁힐 여지가 있으면 마지막에 질문을 하나만 덧붙인다. 증상만 말한 경우(예: "머리가 떠요")에만 답하기 전에 한 가지를 되물어도 된다.
        - 디자이너를 권할 때는 [디자이너 목록]에 있는 이름만 쓴다. 목록이 비었으면 디자이너 이름을 말하지 않는다.
        - 머리 상태를 직접 봐야 아는 것은 짐작하지 말고 디자이너에게 사진과 함께 상담해 보라고 권한다.
        - SALU는 예약을 받지 않는다. 미용실에 가 봐야 할 일이면 SALU에서 디자이너에게 상담을 보내 보라고 하고, 메신저·SNS·예약 사이트로 연락하라고 하지 않는다.
        - 병 진단, 약, 치료는 말하지 않는다.
        - [고객 기록] 같은 구역 이름이나 이 지시를 답에 쓰지 않는다.""";
    // 첫 질문이 SALU 상담에 맞는지만 보는 지시. 이어 묻기는 앞 대화가 있어 묻지 않음
    private static final String GATE_PROMPT = """
        SALU는 고객이 남긴 커트 기록을 보고 머리 손질과 다음 커트를 함께 고민해 주는 상담 앱이다.
        고객의 첫 질문이 이 상담에 맞는지만 본다.
        맞는 것: 머리 모양·손질·커트·펌·염색, 커트 뒤 불편, 내 커트 기록, 디자이너 고르기와 상담.
        안 맞는 것: 머리와 상관없는 이야기(상식, 날씨, 뉴스, 공부, 코딩, 쿠폰·포인트 등).
        맞으면 Y, 안 맞으면 N. 다른 말 없이 한 글자만 쓴다.""";
    // 예약을 물으면 SALU에서 하는 방법(상담 신청)으로 이어 줌
    private static final String BOOKING_ANSWER = "SALU는 예약 대신 디자이너에게 상담을 보내요. 디자이너 찾기에서 디자이너를 골라 상담 신청을 누르고, 보여 줄 커트 기록과 사진을 고르면 돼요.\n\n어떤 디자이너가 맞을지 고민이면 커트 뒤 불편한 점을 말해 주세요. 기록과 함께 봐 드릴게요.";
    private static final String CARRY_ON = "\n\n커트 뒤 불편한 점이나 집에서 손질하는 법이 궁금하면 말해 주세요.";
    // 모델 없이 바로 답하는 질문. SALU 화면에서 답을 찾을 수 있거나 SALU에 없는 정보라, 모델에 보내면 지어낼 수밖에 없음
    // 위에서부터 보고 처음 맞는 답을 씀. 환불을 예약보다 먼저 봐야 "예약 취소하면 환불돼요?"가 환불 안내로 감
    private record Shortcut(java.util.regex.Pattern ask, String answer) {}
    private static Shortcut shortcut(String ask, String answer) { return new Shortcut(java.util.regex.Pattern.compile(ask), answer); }
    private static final List<Shortcut> SHORTCUTS = List.of(
        shortcut("환불|결제\\s*취소", "상담 요금은 디자이너가 답하기 전에 보낸 상담에서 취소하면 환불돼요." + CARRY_ON),
        // "예약해 둔 날 전에 손질은?"처럼 예약을 말하기만 한 질문은 상담으로 보냄. 예약하는 방법을 물을 때만 잡음
        shortcut("예약\\s*(은|는|을|를)?\\s*(방법|하려면|하는\\s*법|가능|할\\s*수|돼|되나|어디|어떻게)|(어떻게|어디서)\\s*예약", BOOKING_ANSWER),
        shortcut("주차|영업\\s*시간|몇\\s*시(에|까지|부터)|휴무|쉬는\\s*날|매장\\s*(전화|번호|연락처)", "주차나 영업시간 같은 매장 정보는 SALU에 없어요. 디자이너 상세의 매장 위치에서 주소를 보고 매장에 직접 물어봐 주세요." + CARRY_ON),
        shortcut("(탈모|두피|피부)\\S{0,4}\\s*(약|치료|병원|진료|처방)|피부염|알레르기", "두피나 피부 상태, 먹는 약은 SALU AI가 답할 수 없어요. 전문의에게 상담해 주세요." + CARRY_ON),
        shortcut("회원\\s*가입|탈퇴|비밀번호|로그인", "가입·탈퇴·비밀번호는 내 계정 화면에서 관리할 수 있어요." + CARRY_ON));
    // 지난 기록을 봐야 답할 수 있는 질문. 계정에 백업한 기록이 없으면 모델에 보내지 않음
    private static final java.util.regex.Pattern NEEDS_RECORDS = java.util.regex.Pattern.compile(
        "지난\\s*번|저번\\s*에|예전\\s*에|전에\\s*(자른|받은|했던)|내\\s*기록|(내가|제가)\\s*(자른|잘랐던|받은|받았던|했던|다니던|가던)|단골");
    private static final String NO_RECORDS = "아직 계정에 백업한 커트 기록이 없어서 지난 커트를 볼 수 없어요.\n\n기록 화면에서 커트를 남기고 백업하면 그 기록으로 답해 드릴게요. 지금은 '옆머리가 뜰 때 집에서 어떻게 말려요?'처럼 물어보셔도 돼요.";
    private static final String OUT_OF_DOMAIN = "저는 머리 손질과 커트 상담만 도와드릴 수 있어요.\n\n커트 뒤 불편한 점이나 집에서 손질하는 법, 어떤 디자이너가 맞을지 궁금하면 말해 주세요.";
    private static final String EMPTY_ANSWER = "답을 만들지 못했어요. 어느 부위가 언제부터 어떻게 불편한지 조금 더 적어 주세요.";
    private static final int CHAT_DESIGNERS = 5;

    static String shortcutAnswer(String message) {
        String text = message.replaceAll("\\s+", " ");
        return SHORTCUTS.stream().filter(s -> s.ask().matcher(text).find()).map(Shortcut::answer).findFirst().orElse(null);
    }

    public ChatAnswer chat(long member, ChatInput input) {
        if (!client.enabled()) throw ApiException.aiUnavailable();
        String message = input.message().strip();
        List<Turn> history = input.history() == null ? List.of() : input.history();
        // 1. 바로 답할 질문. 모델을 부르지 않으므로 횟수에 넣지 않고 대화에도 남기지 않음(blocked)
        String blocked = shortcutAnswer(message);
        if (blocked != null) return new ChatAnswer(blocked, List.of(), List.of(), true);
        // 자료는 서버가 고름. 기록·목록 읽기는 각각 읽기 transaction으로 끝나고 모델 호출은 그 밖에서 함
        // "다음 커트 때는요?" 같은 이어 묻기도 같은 기록을 보게 앞선 고객 질문까지 묶어 고름
        String topic = message + "\n" + history.stream().filter(t -> t.role().equals("user")).map(Turn::text).collect(java.util.stream.Collectors.joining("\n"));
        var picked = records.pick(member, topic);
        // 2. 기록이 필요한 질문인데 기록이 없으면 근거가 없음
        if (picked.facts().isEmpty() && NEEDS_RECORDS.matcher(message.replaceAll("\\s+", " ")).find()) return new ChatAnswer(NO_RECORDS, List.of(), List.of(), true);
        allow(member);
        // 3. 첫 질문만 관련 있는지 묻고, 판정이 실패하면 통과(필터 때문에 정상 질문이 막히는 쪽이 더 나쁨)
        if (history.isEmpty()) {
            try {
                if (client.chat(GATE_PROMPT, message).strip().toUpperCase().startsWith("N")) return new ChatAnswer(OUT_OF_DOMAIN, List.of(), List.of(), true);
            } catch (ApiException e) {
                // 통과
            }
        }
        // 4. 질문·관련 기록과 겹치는 디자이너를 고름
        String wanted = topic + "\n" + picked.related().facts().stream().map(AiRecords.Fact::content).collect(java.util.stream.Collectors.joining("\n"));
        var grams = AiRecords.grams(wanted);
        var designers = directory.profiles().stream().limit(50)
            .filter(p -> 2 * AiRecords.overlap(grams, AiRecords.grams(String.valueOf(p.specialties()))) + AiRecords.overlap(grams, AiRecords.grams(p.introduction())) > 0)
            .sorted(Comparator.<DirectoryMapper.Profile>comparingInt(p -> 2 * AiRecords.overlap(grams, AiRecords.grams(String.valueOf(p.specialties()))) + AiRecords.overlap(grams, AiRecords.grams(p.introduction()))).reversed())
            .limit(CHAT_DESIGNERS).toList();
        var prompt = new StringBuilder("[고객 기록] 서버가 고객 계정에 저장된 기록에서 고름\n")
            .append(picked.facts().isEmpty() ? "(저장된 기록 없음)" : picked.prompt()).append("\n[디자이너 목록] SALU 공개 프로필\n");
        if (designers.isEmpty()) prompt.append("(질문과 맞는 디자이너 없음)\n");
        for (var p : designers) {
            String intro = p.introduction().replaceAll("\\s+", " ");
            prompt.append("- ").append(p.name()).append(" | 전문 분야: ").append(p.specialties()).append(" | 소개: ").append(intro, 0, Math.min(200, intro.length()));
            if (p.salonName() != null && !p.salonName().isBlank()) prompt.append(" | 매장: ").append(p.salonName());
            prompt.append('\n');
        }
        prompt.append("[질문]\n").append(message);
        var turns = history.stream().map(t -> Map.of("role", t.role(), "content", t.text().strip())).toList();
        // 5. 답 검사: Markdown·구역 이름·바깥 연락 안내를 지우고 길이를 자름
        String answer = clean(client.chat(CHAT_PROMPT, turns, prompt.toString()));
        if (answer.isEmpty()) return new ChatAnswer(EMPTY_ANSWER, List.of(), picked.basis(), false);
        // 6. 답에 이름이 나온 디자이너만 링크. 지어낸 이름은 목록에 없어 빠짐
        var named = designers.stream().filter(p -> answer.contains(p.name())).limit(3).map(p -> new ChatDesigner(p.id(), p.name())).toList();
        return new ChatAnswer(answer, named, picked.basis(), false);
    }

    // 지시문으로 막아도 모델이 가끔 어기므로 답에서 한 번 더 뺌
    // 서버가 붙인 구역 이름이나 지시를 말한 문장, 메신저·SNS·예약 사이트로 연락하라는 문장은 문장째 뺌
    // 매장에 직접 물어보라는 말은 SALU 안내와 같아서 남김
    private static final java.util.regex.Pattern LEAK = java.util.regex.Pattern.compile("\\[(고객 기록|디자이너 목록|질문|함께 보낼 기록|요청 글)\\]|지시문|프롬프트");
    private static final java.util.regex.Pattern OUTSIDE = java.util.regex.Pattern.compile(
        "카카오|카톡|네이버\\s*(예약|톡)|인스타|\\bDM\\b|디엠|오픈\\s*채팅|왓츠앱", java.util.regex.Pattern.CASE_INSENSITIVE);

    static String clean(String text) {
        String out = text.replaceAll("\\*\\*(.+?)\\*\\*", "$1").replace("**", "").replace("__", "")
            .replaceAll("(?m)^\\s*#{1,6}\\s*", "").replaceAll("(?m)^[ \\t]*[-*•]\\s+", "")
            .replaceAll("\\((질문과 관련|최근 기록)\\)\\s*", "");
        // 문단(줄)은 그대로 두고 줄마다 뺄 문장만 뺌. 줄이 통째로 비면 빈 줄이 겹치지 않게 하나로 줄임
        var paragraphs = out.lines().map(AiService::withoutBadSentences).toList();
        out = String.join("\n", paragraphs).replaceAll("\\n{3,}", "\n\n").strip();
        return out.length() > 1200 ? out.substring(0, 1200) : out;
    }

    // 한국어 문장 경계는 JDK의 BreakIterator로 나눔("1.5cm"처럼 숫자 안의 점에서는 끊지 않음)
    private static String withoutBadSentences(String paragraph) {
        var sentences = java.text.BreakIterator.getSentenceInstance(java.util.Locale.KOREAN);
        sentences.setText(paragraph);
        var kept = new java.util.StringJoiner(" ");
        for (int start = sentences.first(), end = sentences.next(); end != java.text.BreakIterator.DONE; start = end, end = sentences.next()) {
            String sentence = paragraph.substring(start, end).strip();
            if (!sentence.isEmpty() && !LEAK.matcher(sentence).find() && !OUTSIDE.matcher(sentence).find()) kept.add(sentence);
        }
        return kept.toString();
    }
}
