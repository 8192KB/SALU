package kr.salu.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.salu.backup.BackupService;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

// 디자이너 찾기·AI 상담에 넣을 내 기록 고르기(docs/ai-api.md `내 기록 고르기`). 고르는 일은 코드가 하고 모델에는 고른 줄만 보냄
@Component
class AiRecords {
    // content는 이름표를 뺀 기록 내용. 고민과 겹치는 정도는 이것으로만 셈
    // profileId는 커트에 연결한 디자이너 프로필. 직접 적은 담당자면 빈 값
    // related는 질문과 글자가 겹쳐 고른 기록. 아니면 자리를 채운 최근 기록
    record Fact(String date, String label, String text, String content, String designer, String profileId, boolean related) {
        Fact asRelated() { return new Fact(date, label, text, content, designer, profileId, true); }
    }
    record Picked(List<Fact> facts) {
        String prompt() { return String.join("\n", facts.stream().map(f -> "- " + (f.related() ? "(질문과 관련) " : "(최근 기록) ") + f.text()).toList()); }
        List<String> basis() { return facts.stream().map(Fact::label).toList(); }
        // 후보를 좁히거나 담당 디자이너를 남길 때는 관련 기록만 씀
        Picked related() { return new Picked(facts.stream().filter(Fact::related).toList()); }
    }

    // 관련 기록 최대 3개, 최근 기록으로 채워 모두 최대 5개(Salon이 최근 예약 5건을 넣던 것과 같은 수)
    private static final int ITEMS = 40, RELATED = 3, MAX = 5, FIELD = 120;
    private static final Map<String, String> AREAS = Map.of("FRONT", "앞머리", "SIDE", "옆머리", "TOP", "윗머리", "BACK", "뒤·목선", "ENDS", "머리끝", "WHOLE", "전체");
    // 말끝·흔한 말에서 나온 두 글자는 겹쳐도 관련 있다고 보지 않음
    private static final Set<String> COMMON = Set.of("해요", "어요", "아요", "워요", "져요", "줘요", "세요", "에서", "으로", "는데", "하고", "해서", "하는", "있어", "없어", "같아", "너무", "자꾸", "커트", "머리", "고민", "같이", "주로", "좋아", "제안", "정도", "싶어", "보여");

    private static final java.util.regex.Pattern PARTICLE = java.util.regex.Pattern.compile("(이랑|에서|으로|을|를|이|가|은|는|도|에|의|로|와|과|랑)$");

    private final BackupService backups;
    AiRecords(BackupService backups) { this.backups = backups; }

    Picked pick(long member, String concern) {
        List<JsonNode> payloads;
        try {
            payloads = backups.recentPayloads(member, ITEMS);
        } catch (RuntimeException e) {
            // 백업 키가 없거나 읽지 못하면 기록 없이 고름. 읽기만 하므로 남는 변경은 없음
            return new Picked(List.of());
        }
        var cuts = new ArrayList<Fact>();
        var progress = new ArrayList<Fact>();
        var seen = new HashSet<String>();
        for (var payload : payloads) {
            var state = payload.path("state");
            var cutDates = new java.util.HashMap<String, String>();
            for (var cut : state.path("cuts")) {
                String id = cut.path("id").asString(""), date = cut.path("cutDate").asString("");
                cutDates.put(id, date);
                if (date.isEmpty() || !seen.add("cut:" + id)) continue;
                var parts = new ArrayList<String>();
                add(parts, "시술", cut.path("service").asString(""));
                add(parts, "부위", areas(cut.path("areas")));
                add(parts, "좋았던 점", cut.path("goodNote").asString(""));
                add(parts, "미용실", cut.path("salonName").asString(""));
                add(parts, "디자이너", cut.path("designerName").asString(""));
                String service = cut.path("service").asString("").strip();
                String name = label(date, service.isEmpty() ? "커트" : service);
                // 모델이 날짜를 바꿔 말하지 않게 화면과 같은 `9월 20일 투블럭 커트` 이름으로 줄을 시작함
                cuts.add(new Fact(date, name, name + " | " + String.join(" | ", parts), content(cut, "service", "goodNote"), cut.path("designerName").asString("").strip(), cut.path("designerProfileId").asString("").strip(), false));
            }
            for (var entry : state.path("progress")) {
                String id = entry.path("id").asString(""), date = entry.path("observedOn").asString("");
                if (date.isEmpty() || !seen.add("progress:" + id)) continue;
                var parts = new ArrayList<String>();
                String cutDate = cutDates.getOrDefault(entry.path("cutId").asString(""), "");
                // 경과는 그 경과 날짜로 말하게 하고, 어느 커트의 경과인지는 괄호로만 둠
                add(parts, "부위", areas(entry.path("areas")));
                add(parts, "불편한 점", entry.path("discomfort").asString(""));
                add(parts, "손질", entry.path("styling").asString(""));
                add(parts, "궁금한 점", entry.path("question").asString(""));
                String name = label(date, "경과");
                String after = cutDate.isEmpty() ? "" : "(" + label(cutDate, "커트") + " 뒤)";
                progress.add(new Fact(date, name, name + after + " | " + String.join(" | ", parts), content(entry, "discomfort", "styling", "question"), "", "", false));
            }
        }
        Comparator<Fact> recent = Comparator.comparing(Fact::date).reversed();
        cuts.sort(recent);
        var all = new ArrayList<Fact>(cuts);
        all.addAll(progress);
        Set<String> wanted = grams(concern);
        var related = all.stream().filter(f -> overlap(wanted, grams(f.content())) > 0)
            .sorted(Comparator.<Fact>comparingInt(f -> overlap(wanted, grams(f.content()))).reversed().thenComparing(recent))
            .limit(RELATED).map(Fact::asRelated).toList();
        var chosen = new ArrayList<Fact>(related);
        // 남는 자리는 최근 기록으로 채움. 같은 기록은 두 번 넣지 않음
        all.stream().sorted(recent).filter(f -> related.stream().noneMatch(r -> r.text().equals(f.text())))
            .limit(MAX - related.size()).forEach(chosen::add);
        chosen.sort(recent);
        return new Picked(chosen);
    }

    // 고른 커트를 맡았던 디자이너면 기록 그대로 한 줄. 모델이 쓰지 않고 코드가 만듦
    // 프로필을 연결한 커트는 ID로, 담당자 이름만 적은 커트는 이름으로 맞춤(같은 이름의 다른 디자이너에게 붙지 않게)
    static String history(Picked picked, String profileId, String designerName) {
        for (var fact : picked.facts()) {
            boolean same = fact.profileId().isEmpty()
                ? !fact.designer().isEmpty() && fact.designer().equals(designerName.strip())
                : fact.profileId().equals(profileId);
            if (!same) continue;
            return fact.label() + " 담당 디자이너예요.";
        }
        return null;
    }

    // 고민과 프로필이 겹치는 정도. 한국어 형태소 분석 대신 두 글자 묶음으로 셈
    static int overlap(Set<String> a, Set<String> b) {
        int count = 0;
        for (String gram : a) if (b.contains(gram)) count++;
        return count;
    }

    static Set<String> grams(String text) {
        String plain = text.replaceAll("[^\\p{IsHangul}\\p{IsAlphabetic}\\p{IsDigit}]+", " ").toLowerCase();
        var result = new HashSet<String>();
        for (String raw : plain.split(" ")) {
            // `옆머리를`·`앞머리를`이 조사 `리를`로 겹치지 않게 단어 끝 조사를 뗌
            String word = raw.length() > 2 ? PARTICLE.matcher(raw).replaceFirst("") : raw;
            for (int i = 0; i + 2 <= word.length(); i++) {
                String gram = word.substring(i, i + 2);
                if (!COMMON.contains(gram)) result.add(gram);
            }
        }
        return result;
    }

    private static void add(List<String> parts, String name, String value) {
        String text = value.replaceAll("\\s+", " ").strip();
        if (text.isEmpty()) return;
        parts.add(name + ": " + (text.length() > FIELD ? text.substring(0, FIELD) : text));
    }

    private static String content(JsonNode node, String... fields) {
        var text = new StringBuilder(areas(node.path("areas")));
        for (String field : fields) text.append(' ').append(node.path(field).asString(""));
        return text.toString();
    }

    private static String areas(JsonNode list) {
        var names = new ArrayList<String>();
        for (var area : list) names.add(AREAS.getOrDefault(area.asString(""), area.asString("")));
        return String.join("·", names);
    }

    // 2026-09-20 → 9월 20일 투블럭 커트(화면의 cutTitle과 같은 이름). 형식이 다르면 날짜를 그대로 씀
    private static String label(String date, String kind) {
        var match = java.util.regex.Pattern.compile("^\\d{4}-(\\d{2})-(\\d{2})").matcher(date);
        if (!match.find()) return date + " " + kind;
        return Integer.parseInt(match.group(1)) + "월 " + Integer.parseInt(match.group(2)) + "일 " + kind;
    }
}
