package kr.salu.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

public final class LoginGuard extends OncePerRequestFilter {
    private record Window(long started, int count) {}
    // 경로마다 따로 세며, 비밀번호를 받는 로그인만 폼 형식을 이 필터에서 검사함
    private static final java.util.Set<String> LIMITED = java.util.Set.of("/api/auth/login", "/api/auth/signup", "/api/auth/email-check", "/api/auth/password");
    private final Map<String, Window> windows = new HashMap<>();
    private final ObjectMapper json;
    public LoginGuard(ObjectMapper json) { this.json = json; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && LIMITED.contains(request.getServletPath()));
    }
    private synchronized boolean allow(String address) {
        long now = System.nanoTime();
        windows.entrySet().removeIf(e -> now - e.getValue().started() >= 60_000_000_000L);
        Window old = windows.get(address);
        if (old == null && windows.size() >= 1024) return false;
        if (old != null && old.count() >= 30) return false;
        windows.put(address, new Window(old == null ? now : old.started(), old == null ? 1 : old.count() + 1));
        return true;
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        String path = request.getServletPath();
        if (!allow(path + ":" + request.getRemoteAddr())) {
            response.setHeader("Retry-After", "60");
            String code = switch (path) { case "/api/auth/login" -> "LOGIN_RATE_LIMITED"; case "/api/auth/signup" -> "SIGNUP_RATE_LIMITED"; default -> "ACCOUNT_RATE_LIMITED"; };
            AuthJson.error(response, json, 429, code, "계정 요청이 많습니다. 잠시 후 다시 시도하세요."); return;
        }
        if (!"/api/auth/login".equals(path)) {
            if (request.getQueryString() != null) {
                AuthJson.error(response, json, 400, "INVALID_REQUEST", "입력 형식을 확인하세요."); return;
            }
            chain.doFilter(request, response); return;
        }
        String type = request.getContentType();
        if (type == null || !type.toLowerCase(java.util.Locale.ROOT).startsWith("application/x-www-form-urlencoded")) {
            AuthJson.error(response, json, 415, "UNSUPPORTED_MEDIA_TYPE", "요청 형식을 확인하세요."); return;
        }
        String[] emails = request.getParameterValues("email"), passwords = request.getParameterValues("password");
        if (request.getQueryString() != null || emails == null || emails.length != 1 || passwords == null || passwords.length != 1
                || emails[0].isBlank() || emails[0].length() > 254 || !emails[0].strip().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
                || passwords[0].isEmpty() || passwords[0].getBytes(StandardCharsets.UTF_8).length > 72) {
            AuthJson.error(response, json, 400, "INVALID_REQUEST", "이메일과 비밀번호 입력을 확인하세요."); return;
        }
        chain.doFilter(request, response);
    }
}
