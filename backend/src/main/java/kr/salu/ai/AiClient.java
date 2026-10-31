package kr.salu.ai;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import kr.salu.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// OpenAI 호환 chat completions 호출. Ollama와 OpenAI가 같은 형식이라 주소·모델·키만 바꿈(docs/ai-api.md)
@Component
public class AiClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final ObjectMapper json;
    private final String baseUrl, model, apiKey, reasoningEffort;
    public AiClient(ObjectMapper json, @Value("${salu.ai.base-url:}") String baseUrl, @Value("${salu.ai.model:qwen3:8b}") String model,
            @Value("${salu.ai.api-key:}") String apiKey, @Value("${salu.ai.reasoning-effort:none}") String reasoningEffort) {
        this.json = json; this.baseUrl = baseUrl.replaceAll("/+$", ""); this.model = model; this.apiKey = apiKey; this.reasoningEffort = reasoningEffort;
    }
    public boolean enabled() { return !baseUrl.isBlank(); }
    public String chat(String system, String user) {
        if (!enabled()) throw ApiException.aiUnavailable();
        try {
            var payload = new java.util.HashMap<String, Object>(Map.of("model", model, "stream", false,
                "messages", List.of(Map.of("role", "system", "content", system), Map.of("role", "user", "content", user))));
            // 추론 모델이 길게 생각하면 응답이 수십 초 걸림. Ollama는 none, OpenAI gpt-5 계열은 minimal
            if (!reasoningEffort.isBlank()) payload.put("reasoning_effort", reasoningEffort);
            var body = json.writeValueAsString(payload);
            var request = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/chat/completions")).timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
            if (!apiKey.isBlank()) request.header("Authorization", "Bearer " + apiKey);
            var response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw ApiException.aiUnavailable();
            String content = json.readTree(response.body()).path("choices").path(0).path("message").path("content").asString("");
            // 추론을 끄지 못한 모델은 생각한 내용을 <think>로 먼저 내보냄
            content = content.replaceAll("(?s)<think>.*?</think>", "").strip();
            if (content.isEmpty()) throw ApiException.aiUnavailable();
            return content;
        } catch (ApiException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ApiException.aiUnavailable();
        } catch (Exception e) {
            throw ApiException.aiUnavailable();
        }
    }
}
