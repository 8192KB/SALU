package kr.salu.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

class LoginGuardTest {
    @Test void limitsAttemptsPerRemoteAddressAndDoesNotTrustForwardedHeaders() throws Exception {
        var guard = new LoginGuard(new ObjectMapper());
        for (int i = 0; i < 31; i++) {
            var request = new MockHttpServletRequest("POST", "/api/auth/login");
            request.setServletPath("/api/auth/login"); request.setRemoteAddr("127.0.0.1");
            request.addHeader("X-Forwarded-For", "192.0.2." + i);
            request.setContentType("application/x-www-form-urlencoded");
            request.addParameter("email", "test@example.test"); request.addParameter("password", "secret");
            var response = new MockHttpServletResponse();
            guard.doFilter(request, response, (req, res) -> ((jakarta.servlet.http.HttpServletResponse) res).setStatus(204));
            assertThat(response.getStatus()).isEqualTo(i < 30 ? 204 : 429);
            if (i == 30) { assertThat(response.getHeader("Retry-After")).isEqualTo("60"); assertThat(response.getContentAsString()).contains("LOGIN_RATE_LIMITED"); }
        }
    }
}
