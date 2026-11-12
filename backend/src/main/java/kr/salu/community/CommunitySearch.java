package kr.salu.community;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;

// 커뮤니티 글 검색(docs/community-api.md `검색 서버`). Elasticsearch REST API를 직접 부름
// 검색 서버는 글 ID와 순서만 정하고, 글 내용과 공개 여부는 CommunityService가 DB에서 다시 읽음
// 주소가 비었거나, 색인 중이거나, 응답이 없으면 null을 돌려 DB 검색으로 넘김
@Component
public class CommunitySearch {
    private static final Logger log = LoggerFactory.getLogger(CommunitySearch.class);
    // DB에서 숨김·삭제 글이 빠져도 한 쪽(30건)을 채우도록 조금 더 받음
    private static final int SIZE = 50;
    private static final int BULK = 200;
    // 색인을 못 만들었으면 이만큼 지난 뒤 들어온 검색에서 다시 만들어 봄
    private static final long RETRY_MILLIS = 60_000;
    // korean: 한국어 낱말과 조사를 나눔(nori). 색인은 `옆머리`·`옆`·`머리`, `떠요`·`뜨`처럼 원래 꼴과 조각을 함께 넣고
    // 검색어는 조각만 써서 `옆머리가 떠요`로 `옆머리가 뜨는` 글도 찾음. pair: 두 글자씩 잘라 `옆머`처럼 낱말 일부로도 찾게 함
    private static final String SETTINGS = """
        {"settings":{"number_of_shards":1,"number_of_replicas":0,"analysis":{
          "tokenizer":{"korean":{"type":"nori_tokenizer","decompound_mode":"mixed"},
                       "korean_parts":{"type":"nori_tokenizer","decompound_mode":"discard"},
                       "pair":{"type":"ngram","min_gram":2,"max_gram":2,"token_chars":["letter","digit"]}},
          "analyzer":{"korean":{"type":"custom","tokenizer":"korean","filter":["nori_part_of_speech","lowercase"]},
                      "korean_search":{"type":"custom","tokenizer":"korean_parts","filter":["nori_part_of_speech","lowercase"]},
                      "pair":{"type":"custom","tokenizer":"pair","filter":["lowercase"]}}}},
         "mappings":{"dynamic":"strict","properties":{
          "id":{"type":"keyword"},"category":{"type":"keyword"},"service":{"type":"keyword"},"createdAt":{"type":"long"},
          "title":{"type":"text","analyzer":"korean","search_analyzer":"korean_search","fields":{"pair":{"type":"text","analyzer":"pair"}}},
          "content":{"type":"text","analyzer":"korean","search_analyzer":"korean_search","fields":{"pair":{"type":"text","analyzer":"pair"}}},
          "summary":{"type":"text","analyzer":"korean","search_analyzer":"korean_search","fields":{"pair":{"type":"text","analyzer":"pair"}}}}}}""";

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final ObjectMapper json;
    private final CommunityMapper mapper;
    private final String baseUrl, index;
    private volatile boolean ready;
    private volatile long lastTry;

    public CommunitySearch(ObjectMapper json, CommunityMapper mapper, @Value("${salu.search.url:}") String baseUrl,
            @Value("${salu.search.index:salu-community-posts}") String index) {
        this.json = json; this.mapper = mapper; this.baseUrl = baseUrl.replaceAll("/+$", ""); this.index = index;
    }

    public boolean enabled() { return !baseUrl.isBlank(); }

    // 서버가 뜨면 공개 글 전체로 색인을 새로 만듦. 다 만들기 전까지 검색은 DB로 감
    @EventListener(ApplicationReadyEvent.class)
    public void start() { if (enabled()) rebuild(); }

    synchronized boolean rebuild() {
        lastTry = System.currentTimeMillis();
        ready = false;
        try {
            send("DELETE", "/" + index, null, 200, 404);
            send("PUT", "/" + index, SETTINGS, 200);
            var rows = mapper.indexRows();
            for (int from = 0; from < rows.size(); from += BULK) {
                var lines = new StringBuilder();
                for (var row : rows.subList(from, Math.min(rows.size(), from + BULK)))
                    lines.append(json.writeValueAsString(Map.of("index", Map.of("_id", row.id())))).append('\n')
                        .append(json.writeValueAsString(document(row))).append('\n');
                var result = json.readTree(send("POST", "/" + index + "/_bulk?refresh=true", lines.toString(), 200));
                if (result.path("errors").asBoolean()) throw new IllegalStateException("bulk");
            }
            ready = true;
            log.info("커뮤니티 검색 색인을 만듦: 공개 글 {}개", rows.size());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("커뮤니티 검색 색인을 만들지 못함. DB 검색으로 답함: {}", e.getClass().getSimpleName());
        }
        return ready;
    }

    // 공개 글 ID를 DB 목록과 같은 순서(최신순)로 돌려줌. before는 앞 쪽의 마지막 글. null이면 DB 검색으로
    List<String> find(String category, String service, String query, CommunityMapper.IndexRow before) {
        if (!enabled()) return null;
        if (!ready && (System.currentTimeMillis() - lastTry < RETRY_MILLIS || !rebuild())) return null;
        try {
            var filters = new ArrayList<Object>();
            if (category != null) filters.add(Map.of("term", Map.of("category", category)));
            if (service != null) filters.add(Map.of("term", Map.of("service", service)));
            // 띄어 쓴 낱말마다 제목·내용·요약 어디엔가 있어야 찾음. 낱말은 nori로 보고, 안 맞으면 두 글자 묶음(낱말 일부)으로 봄
            // `펌`처럼 한 글자 낱말은 두 글자 묶음이 없어서 nori로만 맞춰 봄
            var words = new ArrayList<Object>();
            for (String word : query.strip().split("\\s+"))
                words.add(Map.of("bool", Map.of("minimum_should_match", 1, "should", List.of(
                    Map.of("multi_match", Map.of("query", word, "type", "cross_fields", "operator", "and", "fields", List.of("title", "content", "summary"))),
                    Map.of("multi_match", Map.of("query", word, "type", "cross_fields", "operator", "and", "fields", List.of("title.pair", "content.pair", "summary.pair")))))));
            var body = new LinkedHashMap<String, Object>();
            body.put("size", SIZE);
            body.put("_source", false);
            body.put("track_total_hits", false);
            body.put("sort", List.of(Map.of("createdAt", "desc"), Map.of("id", "desc")));
            body.put("query", Map.of("bool", Map.of("filter", filters, "must", words)));
            if (before != null) body.put("search_after", List.of(micros(before.createdAt()), before.id()));
            var result = json.readTree(send("POST", "/" + index + "/_search", json.writeValueAsString(body), 200));
            var ids = new ArrayList<String>();
            for (var hit : result.path("hits").path("hits")) ids.add(hit.path("_id").asString());
            return ids;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            log.warn("커뮤니티 검색 서버에 묻지 못함. DB 검색으로 답함: {}", e.getClass().getSimpleName());
            return null;
        }
    }

    // 글을 쓰거나 바꾼 transaction이 commit된 뒤 이 글의 색인을 DB 상태에 맞춤. 실패해도 다음 재색인 때 맞춰짐
    void sync(String postId) {
        if (!enabled()) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) { apply(postId); return; }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { apply(postId); }
        });
    }

    private void apply(String postId) {
        if (!ready) return;
        try {
            var row = mapper.indexRow(postId);
            if (row != null && "VISIBLE".equals(row.status()))
                send("PUT", "/" + index + "/_doc/" + postId + "?refresh=true", json.writeValueAsString(document(row)), 200, 201);
            else send("DELETE", "/" + index + "/_doc/" + postId + "?refresh=true", null, 200, 404);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("커뮤니티 검색 색인을 맞추지 못함: {}", e.getClass().getSimpleName());
        }
    }

    private Map<String, Object> document(CommunityMapper.IndexRow row) {
        var doc = new LinkedHashMap<String, Object>();
        doc.put("id", row.id());
        doc.put("category", row.category());
        doc.put("service", row.service());
        doc.put("createdAt", micros(row.createdAt()));
        doc.put("title", row.title());
        doc.put("content", row.content());
        doc.put("summary", row.summary());
        return doc;
    }

    // DB created_at이 마이크로초까지라 같은 단위로 정렬해야 DB 목록과 순서가 같음
    private static long micros(Instant at) { return at.getEpochSecond() * 1_000_000 + at.getNano() / 1_000; }

    private String send(String method, String path, String body, int... ok) throws Exception {
        String type = path.contains("/_bulk") ? "application/x-ndjson" : "application/json";
        var request = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(Duration.ofSeconds(5)).header("Content-Type", type)
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        for (int code : ok) if (response.statusCode() == code) return response.body();
        throw new IllegalStateException("status " + response.statusCode());
    }
}
