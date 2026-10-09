package kr.salu.auth;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;
import verification.salu.ProbeConfiguration;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:mysql://${SALU_DB_HOST:127.0.0.1}:${SALU_DB_PORT:3307}/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&connectTimeout=2000&socketTimeout=3000",
    "spring.datasource.username=salu_test", "spring.flyway.locations=classpath:db/migration,classpath:db/verification"
})
@Import(ProbeConfiguration.class)
@EnabledIfEnvironmentVariable(named = "SALU_RUN_DB_TESTS", matches = "true")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LoginIntegrationTest {
    @Autowired DataSource dataSource;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper json;
    @LocalServerPort int port;
    private JdbcTemplate jdbc;
    private String email;
    private final String password = "Salu-test-123!";
    private CookieManager cookies;
    private HttpClient client;
    @BeforeEach void prepare() throws Exception {
        try (var connection = dataSource.getConnection()) { assertThat(connection.getCatalog()).isEqualTo("salu_test"); }
        jdbc = new JdbcTemplate(dataSource); email = UUID.randomUUID() + "@example.test";
        jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES (?,?,?)", email, encoder.encode(password), "검증 회원");
        cookies = new CookieManager(); client = HttpClient.newBuilder().cookieHandler(cookies).build();
    }
    @AfterEach void cleanup() { jdbc.update("DELETE FROM members WHERE email=?", email); }
    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    private String token() throws Exception { return json.readTree(get("/api/csrf").body()).get("token").asString(); }
    private String session() { return cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("SALU_SESSION")).findFirst().orElseThrow().getValue(); }
    private HttpResponse<String> post(String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
            .header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) builder.header("X-CSRF-TOKEN", token);
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    private String form(String email, String password) {
        return "email=" + URLEncoder.encode(email, StandardCharsets.UTF_8) + "&password=" + URLEncoder.encode(password, StandardCharsets.UTF_8);
    }
    @Test @Order(1) void sessionLoginRefreshLogoutAndReplayAreProtected() throws Exception {
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        String oldToken = token(), oldSession = session();
        var response = post("/api/auth/login", form("  " + email.toUpperCase() + "  ", password) + "&role=ADMIN&memberId=1", oldToken);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(email, "검증 회원").doesNotContain("password", "hash", "ROLE_ADMIN", password);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(session()).isNotEqualTo(oldSession);
        var cookie = response.headers().allValues("Set-Cookie").toString();
        assertThat(cookie).contains("HttpOnly", "SameSite=Lax");
        assertThat(get("/api/auth/me").body()).isEqualTo(response.body());
        assertThat(get("/api/records").statusCode()).isEqualTo(404);
        assertThat(post("/api/auth/logout", "", oldToken).statusCode()).isEqualTo(403);
        assertThat(post("/api/auth/logout", "", null).statusCode()).isEqualTo(403);
        String newToken = token(), authenticatedSession = session();
        assertThat(post("/api/auth/logout", "", newToken).statusCode()).isEqualTo(204);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        var replay = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/me"))
            .header("Cookie", "SALU_SESSION=" + authenticatedSession).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(replay.statusCode()).isEqualTo(401);
        var old = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/me"))
            .header("Cookie", "SALU_SESSION=" + oldSession).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(old.statusCode()).isEqualTo(401);
        assertThat(post("/api/auth/login", form(email, password), token()).statusCode()).isEqualTo(200);
    }
    @Test @Order(2) void unknownWrongAndInactiveCredentialsShareFailure() throws Exception {
        String csrf = token();
        var wrong = post("/api/auth/login", form(email, "wrong"), csrf);
        var missing = post("/api/auth/login", form("unknown@example.test", password), csrf);
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(missing.body()).isEqualTo(wrong.body());
        for (String state : new String[]{"SUSPENDED", "WITHDRAWN"}) {
            jdbc.update("UPDATE members SET status=? WHERE email=?", state, email);
            var blocked = post("/api/auth/login", form(email, password), csrf);
            assertThat(blocked.statusCode()).isEqualTo(401);
            assertThat(blocked.body()).isEqualTo(wrong.body());
        }
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
    }
    @Test @Order(3) void existingSessionIsRevokedAfterStatusChange() throws Exception {
        assertThat(post("/api/auth/login", form(email, password), token()).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE members SET status='WITHDRAWN' WHERE email=?", email);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        jdbc.update("UPDATE members SET status='ACTIVE' WHERE email=?", email);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
    }
    @Test @Order(5) void actualHttpLoginAttemptsReach429WithoutBlockingHealth() throws Exception {
        String csrf = token();
        HttpResponse<String> last = null;
        for (int attempt = 0; attempt < 31; attempt++) {
            last = post("/api/auth/login", form("unknown@example.test", password), csrf);
            assertThat(last.statusCode()).isIn(401, 429);
        }
        assertThat(last.statusCode()).isEqualTo(429);
        assertThat(last.headers().firstValue("Retry-After")).contains("60");
        assertThat(json.readTree(last.body()).get("code").asString()).isEqualTo("LOGIN_RATE_LIMITED");
        assertThat(get("/api/health").statusCode()).isEqualTo(200);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
    }
    @Test @Order(4) void loginCsrfInputLimitsAndMethodsAreEnforced() throws Exception {
        assertThat(post("/api/auth/login", form(email, password), null).statusCode()).isEqualTo(403);
        String csrf = token();
        for (String body : new String[]{"email=x&password=test", form(email, "한".repeat(25)), form(email, password)+"&email=other@example.test", form(email, "")})
            assertThat(post("/api/auth/login", body, csrf).statusCode()).isEqualTo(400);
        assertThat(post("/api/auth/login?password=forbidden-in-url", form(email, password), csrf).statusCode()).isEqualTo(400);
        var injection = post("/api/auth/login", form("injection'@example.test", password), csrf);
        assertThat(injection.statusCode()).isEqualTo(401);
        assertThat(get("/api/auth/login").statusCode()).isEqualTo(401);
        assertThat(post("/api/auth/login", form(email, password), csrf).statusCode()).isEqualTo(200);
        assertThat(get("/api/auth/logout").statusCode()).isEqualTo(404);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(200);
    }
}
