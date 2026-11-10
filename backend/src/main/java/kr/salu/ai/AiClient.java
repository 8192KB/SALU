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
    private final String baseUrl, model, apiKey, reasoningEffort, temperature;
    public AiClient(ObjectMapper json, @Value("${salu.ai.base-url:}") String baseUrl, @Value("${salu.ai.model:qwen3:8b}") String model,
            @Value("${salu.ai.api-key:}") String apiKey, @Value("${salu.ai.reasoning-effort:none}") String reasoningEffort,
            @Value("${salu.ai.temperature:0}") String temperature) {
        this.json = json; this.baseUrl = baseUrl.replaceAll("/+$", ""); this.model = model; this.apiKey = apiKey; this.reasoningEffort = reasoningEffort;
        this.temperature = temperature.strip();
    }
    public boolean enabled() { return !baseUrl.isBlank(); }
    public String chat(String system, String user) {
        return chat(system, List.of(), user);
    }
    // turns: 앞선 대화(role user·assistant, content). AI 상담만 씀
    public String chat(String system, List<Map<String, String>> turns, String user) {
        if (!enabled()) throw ApiException.aiUnavailable();
        try {
            var messages = new java.util.ArrayList<Map<String, String>>();
            messages.add(Map.of("role", "system", "content", system));
            messages.addAll(turns);
            messages.add(Map.of("role", "user", "content", user));
            var payload = new java.util.HashMap<String, Object>(Map.of("model", model, "stream", false, "messages", messages));
            // 추론 모델이 길게 생각하면 응답이 수십 초 걸림. Ollama는 none, OpenAI gpt-5 계열은 minimal
            if (!reasoningEffort.isBlank()) payload.put("reasoning_effort", reasoningEffort);
            // 같은 질문에 답이 흔들리지 않게 낮게 고정. 값을 받지 않는 모델이면 환경 값을 비움
            if (!temperature.isEmpty()) payload.put("temperature", Double.parseDouble(temperature));
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
