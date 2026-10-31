package kr.salu.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// 토스페이먼츠 키. 클라이언트 키는 화면에 주고, 시크릿 키는 서버에만 둠
@Component
public class PaymentSettings {
    private final String clientKey, secretKey, apiBase;
    public PaymentSettings(@Value("${salu.payment.client-key:}") String clientKey, @Value("${salu.payment.secret-key:}") String secretKey,
            @Value("${salu.payment.api-base:https://api.tosspayments.com}") String apiBase) {
        this.clientKey = clientKey; this.secretKey = secretKey; this.apiBase = apiBase.replaceAll("/+$", "");
    }
    public boolean enabled() { return !clientKey.isBlank() && !secretKey.isBlank(); }
    public String clientKey() { return enabled() ? clientKey : null; }
    String secretKey() { return secretKey; }
    String apiBase() { return apiBase; }
}
