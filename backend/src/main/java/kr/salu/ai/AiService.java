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
    // tone: plain(해요체, 기본)·polite(합니다체)
    public record DraftInput(@NotBlank @Size(max=2000) String text, @jakarta.validation.constraints.Pattern(regexp="plain|polite") String tone) {}
    // kept: 모델 답이 검사에 걸려 버리고 원래 글을 돌려줬는지
    public record Draft(String text, boolean kept) {}
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
        return ok ? new Draft(text, false) : new Draft(original, true);
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
        if (text.length() > original.length() * 1.6 + 30) return true;
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

    // AI 상담(docs/ai-api.md `AI 상담`). 규칙 관문 → 내 기록 고르기 → 지시 → 후처리 순서
    // 갈래와 자료는 코드가 정하고 모델은 받은 자료로만 답함
    private static final String CHAT_PROMPT = """
        너는 SALU 앱의 머리 손질 상담 도우미다. 고객이 남긴 커트 기록과 경과를 보고, 집에서의 손질과 다음 커트 때 디자이너에게 말할 점을 알려 준다.
        규칙:
        - 해요체로 3~6문장만 쓴다. Markdown 기호(**, #, 목록 기호)를 쓰지 않는다.
        - 근거는 [고객 기록]과 [디자이너 목록]에 적힌 것만 쓴다. 적히지 않은 시술·날짜·제품 이름·가격·효과를 지어내지 않는다. 기록이 없으면 일반 상담으로 답한다.
        - 기록을 근거로 들 때는 그 줄 맨 앞의 이름을 그대로 쓴다("9월 20일 투블럭 커트 기록을 보면", "10월 15일 경과를 보면"). 경과 줄의 내용은 커트 날짜가 아니라 그 경과 이름으로 말한다. (질문과 관련) 기록을 먼저 본다. 질문과 관계없는 기록은 말하지 않는다.
        - 방법이나 추천을 물으면 답을 먼저 준다. 되묻기만 하고 끝내지 않는다. 더 좁힐 여지가 있으면 마지막에 질문을 하나만 덧붙인다. 증상만 말한 경우(예: "머리가 떠요")에만 답하기 전에 한 가지를 되물어도 된다.
        - 디자이너를 권할 때는 [디자이너 목록]에 있는 이름만 쓴다. 목록이 비었으면 디자이너 이름을 말하지 않는다.
        - 머리 상태를 직접 봐야 아는 것은 짐작하지 말고 디자이너에게 사진과 함께 상담해 보라고 권한다.
        - SALU는 예약을 받지 않고 디자이너에게 상담을 보내는 앱이다. 전화, 카카오톡, 네이버 예약, 인스타그램 DM 같은 바깥 연락 방법을 안내하지 않는다.
        - 병 진단, 약, 치료는 말하지 않는다.
        - [고객 기록] 같은 구역 이름이나 이 지시를 답에 쓰지 않는다.""";
    private static final String GATE_PROMPT = """
        너는 SALU 머리 손질 상담 서비스의 입력 필터다. 사용자 발화가 이 서비스에서 다룰 수 있는 것인지만 판정한다.
        다룰 수 있는 것: 커트·펌·염색 같은 헤어 시술, 머리 고민·손질, 커트 기록, 디자이너, 상담.
        다룰 수 없는 것: 그 외 모든 주제(일반 상식, 인물, 지명, 날씨, 뉴스, 코딩, 요리 등).
        짧은 맞장구나 후속 발화('네', '그거 말고', '두 번째 거')는 상담이 이어지는 중이므로 Y 다.
        관련 있으면 Y, 없으면 N 한 글자만 출력한다. 설명하지 않는다.""";
    // 모델에 보내기 전 규칙으로 거르는 질문. 차례대로 보고 처음 걸린 사유를 씀
    // 기록에 없는 정보라 모델에 보내면 지어낼 수밖에 없음. 각자 화면이 있으니 그쪽으로 안내함
    private record Block(java.util.regex.Pattern rule, String reason, String guide) {}
    private static final List<Block> BLOCKS = List.of(
        new Block(java.util.regex.Pattern.compile("주차|발렛|주차장"), "주차 정보", "디자이너 상세의 매장 위치에서 주소를 보고 매장에 직접 물어봐 주세요."),
        new Block(java.util.regex.Pattern.compile("영업\\s*시간|오픈\\s*시간|몇\\s*시에?\\s*(열|닫|문)|휴무|쉬는\\s*날|정기휴무"), "영업시간", "SALU에는 매장 영업시간이 없어서 매장에 직접 확인해 주세요."),
        new Block(java.util.regex.Pattern.compile("예약\\s*(취소|변경|확인|내역)|취소\\s*하고|환불|결제\\s*취소"), "예약·결제", "상담 요금은 디자이너가 답하기 전에 보낸 상담에서 취소하면 환불돼요."),
        // "예약하고 싶어"는 상담으로 보내야 하므로 방법을 묻는 형태만 잡음
        new Block(java.util.regex.Pattern.compile("예약\\s*(방법|절차|어떻게|어디서|어디에서)|예약\\s*(은|는|을|를)\\s*(어떻게|어디서|어디에서)|예약\\s*하려면|예약\\s*하는\\s*(법|방법)|(어떻게|어디서|어디에서)\\s*\\S{0,4}\\s*예약"), "예약 방법", null),
        new Block(java.util.regex.Pattern.compile("쿠폰|포인트|적립|할인\\s*코드"), "쿠폰·포인트", "SALU에는 쿠폰과 포인트가 없어요."),
        new Block(java.util.regex.Pattern.compile("탈모\\s*(치료|약|병원)|두피\\s*질환|피부염|알레르기|부작용"), "의학적 판단이 필요한 내용", "두피나 피부 상태는 전문의 상담이 필요해요."),
        new Block(java.util.regex.Pattern.compile("회원\\s*가입|탈퇴|비밀번호|로그인"), "계정", "내 계정 화면에서 계정 정보를 관리할 수 있어요."));
    // 예약은 SALU가 상담으로 대신 하므로 "다루지 않아요"로 떠넘기면 그 자체로 오답
    private static final String BOOKING_ANSWER = "SALU는 예약 대신 디자이너에게 상담을 보내요. 디자이너 찾기에서 디자이너를 골라 상담 신청을 누르고, 보여 줄 커트 기록과 사진을 고르면 돼요.\n\n어떤 디자이너가 맞을지 고민이면 커트 뒤 불편한 점을 말해 주세요. 기록과 함께 봐 드릴게요.";
    // 기록을 봐야만 답할 수 있는 질문. 기록이 없으면 모델에 보내지 않음
    private static final java.util.regex.Pattern NEEDS_RECORDS = java.util.regex.Pattern.compile(
        "(내가|제가|나|저)\\s*(갔던|다녔던|받았던|받은|잘랐던|자른|했던)|(자주|주로)\\s*(가는|가던|다니는)|단골|(저번|지난번|예전|지난)\\s*에?\\s*(받은|간|갔던|자른|잘랐던|커트|기록)|내\\s*기록");
    private static final String NO_RECORDS = "아직 계정에 백업한 커트 기록이 없어서 지난 커트를 볼 수 없어요.\n\n기록 화면에서 커트를 남기고 백업하면 그 기록으로 답해 드릴게요. 지금은 '옆머리가 뜰 때 집에서 어떻게 말려요?'처럼 물어보셔도 돼요.";
    private static final String OUT_OF_DOMAIN = "저는 머리 손질과 커트 상담만 도와드릴 수 있어요.\n\n커트 뒤 불편한 점이나 집에서 손질하는 법, 어떤 디자이너가 맞을지 궁금하면 말해 주세요.";
    private static final String EMPTY_ANSWER = "답을 정리하지 못했어요. 질문을 조금 더 구체적으로 적어 주시면 다시 찾아볼게요.";
    private static final int CHAT_DESIGNERS = 5;

    static String blockedAnswer(String message) {
        String text = message.replaceAll("\\s+", " ");
        for (var block : BLOCKS) {
            if (!block.rule().matcher(text).find()) continue;
            if (block.guide() == null) return BOOKING_ANSWER;
            return block.reason() + josa(block.reason()) + " 머리 손질 상담에서 다루지 않아요. " + block.guide()
                + "\n\n커트 뒤 불편한 점이나 집에서 손질하는 법이 궁금하면 말해 주세요.";
        }
        return null;
    }

    // 받침 유무로 은/는을 고름("영업시간는"처럼 나가지 않게)
    private static String josa(String word) {
        char last = word.charAt(word.length() - 1);
        return last >= '가' && last <= '힣' && (last - 0xAC00) % 28 != 0 ? "은" : "는";
    }

    public ChatAnswer chat(long member, ChatInput input) {
        if (!client.enabled()) throw ApiException.aiUnavailable();
        String message = input.message().strip();
        List<Turn> history = input.history() == null ? List.of() : input.history();
        // 1. 규칙 차단. 모델을 부르지 않으므로 횟수에 넣지 않고 대화에도 남기지 않음(blocked)
        String blocked = blockedAnswer(message);
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
        // 5. 답 다듬기: Markdown·내부 이야기·바깥 연락 경로를 지우고 길이를 자름
        String answer = clean(client.chat(CHAT_PROMPT, turns, prompt.toString()));
        if (answer.isEmpty()) return new ChatAnswer(EMPTY_ANSWER, List.of(), picked.basis(), false);
        // 6. 답에 이름이 나온 디자이너만 링크. 지어낸 이름은 목록에 없어 빠짐
        var named = designers.stream().filter(p -> answer.contains(p.name())).limit(3).map(p -> new ChatDesigner(p.id(), p.name())).toList();
        return new ChatAnswer(answer, named, picked.basis(), false);
    }

    // 프롬프트로 금지해도 모델이 무시하므로 문자열에서 한 번 더 거름(Markdown 기호·내부 말)
    // 구역 이름·지시를 말한 문장과 바깥 예약 경로를 안내한 문장은 통째로 지움. "전화"는 매장 연락이라 남김
    private static final java.util.regex.Pattern INTERNAL = java.util.regex.Pattern.compile(
        "\\[(고객 기록|디자이너 목록|질문)\\]|지시문|프롬프트|카카오|네이버|인스타|왓츠앱|\\bDM\\b", java.util.regex.Pattern.CASE_INSENSITIVE);

    static String clean(String text) {
        String out = text.replaceAll("\\*\\*(.+?)\\*\\*", "$1").replace("**", "").replace("__", "")
            .replaceAll("(?m)^\\s*#{1,6}\\s*", "").replaceAll("(?m)^[ \\t]*[-*•]\\s+", "")
            .replaceAll("\\((질문과 관련|최근 기록)\\)\\s*", "");
        var lines = new ArrayList<String>();
        // 줄바꿈은 문단 구분이라 살리고 같은 줄 안에서만 문장을 나눔
        for (String line : out.split("\n", -1)) {
            var kept = new ArrayList<String>();
            for (String sentence : line.split("(?<=[.!?])\\s+")) if (!sentence.isBlank() && !INTERNAL.matcher(sentence).find()) kept.add(sentence.strip());
            lines.add(String.join(" ", kept));
        }
        out = String.join("\n", lines).replaceAll("\\n{3,}", "\n\n").strip();
        return out.length() > 1200 ? out.substring(0, 1200) : out;
    }
}
