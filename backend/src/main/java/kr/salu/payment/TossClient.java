package kr.salu.payment;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

// 토스페이먼츠 승인·취소 API. 토스의 오류 문구는 화면에 그대로 보내지 않음
@Component
public class TossClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final PaymentSettings settings;
    private final ObjectMapper json;
    public TossClient(PaymentSettings settings, ObjectMapper json) { this.settings = settings; this.json = json; }

    public void confirm(String paymentKey, String orderId, int amount) {
        send("/v1/payments/confirm", "confirm-" + orderId, Map.of("paymentKey", paymentKey, "orderId", orderId, "amount", amount));
    }
    // 같은 Idempotency-Key로 다시 부르면 토스가 처음 결과를 돌려줘 두 번 환불되지 않음
    public void cancel(String paymentKey, String idempotencyKey, String reason) {
        send("/v1/payments/" + URLEncoder.encode(paymentKey, StandardCharsets.UTF_8) + "/cancel", idempotencyKey, Map.of("cancelReason", reason));
    }

    private void send(String path, String idempotencyKey, Map<String, Object> body) {
        if (!settings.enabled()) throw ApiException.paymentUnavailable();
        HttpResponse<String> response;
        try {
            var request = HttpRequest.newBuilder(URI.create(settings.apiBase() + path)).timeout(Duration.ofSeconds(30))
                .header("Authorization", "Basic " + Base64.getEncoder().encodeToString((settings.secretKey() + ":").getBytes(StandardCharsets.UTF_8)))
                .header("Content-Type", "application/json").header("Idempotency-Key", idempotencyKey)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ApiException.paymentUnavailable();
        } catch (Exception e) {
            throw ApiException.paymentUnavailable();
        }
        if (response.statusCode() / 100 == 2) return;
        // 키가 틀린 401·403은 결제 수단 문제가 아니라 서버 설정 문제라 사용 불가로 알림
        if (response.statusCode() >= 500 || response.statusCode() == 401 || response.statusCode() == 403) throw ApiException.paymentUnavailable();
        throw ApiException.paymentRejected();
    }
}
