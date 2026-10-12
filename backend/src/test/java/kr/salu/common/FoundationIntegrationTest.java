package kr.salu.common;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import verification.salu.ProbeConfiguration;
import verification.salu.TransactionProbeService;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:mysql://${SALU_DB_HOST:127.0.0.1}:${SALU_DB_PORT:3307}/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&connectTimeout=2000&socketTimeout=3000",
    "spring.datasource.username=salu_test",
    "spring.flyway.locations=classpath:db/migration,classpath:db/verification", "spring.flyway.out-of-order=true"
})
@Import(ProbeConfiguration.class)
@EnabledIfEnvironmentVariable(named = "SALU_RUN_DB_TESTS", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FoundationIntegrationTest {
    @Autowired TransactionProbeService service;
    @Autowired DataSource dataSource;
    @Autowired ObjectMapper mapper;
    @LocalServerPort int port;
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();

    @BeforeAll
    void assertIsolatedDatabase() throws Exception {
        try (var connection = dataSource.getConnection()) {
            assertThat(connection.getCatalog()).isEqualTo("salu_test");
        }
    }

    @Test
    void commitsAndRollsBackUsingRealMysqlAndSpringProxy() {
        String prefix = UUID.randomUUID().toString();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        service.commit(prefix + "-commit");
        assertThat(count(jdbc, prefix + "-commit")).isEqualTo(2);
        assertThatThrownBy(() -> service.runtimeFailure(prefix + "-runtime")).isInstanceOf(IllegalStateException.class);
        assertThat(count(jdbc, prefix + "-runtime")).isZero();
        assertThatThrownBy(() -> service.checkedFailure(prefix + "-checked")).isInstanceOf(java.io.IOException.class);
        assertThat(count(jdbc, prefix + "-checked")).isZero();
        assertThatThrownBy(() -> service.duplicateFailure(prefix + "-duplicate")).isInstanceOf(DuplicateKeyException.class);
        assertThat(count(jdbc, prefix + "-duplicate")).isZero();
        jdbc.update("DELETE FROM transaction_probe WHERE token LIKE CONCAT(?, '%')", prefix);
    }

    @Test
    void actualHttpServerUsesCommonErrorsAndCsrf() throws Exception {
        for (String[] sample : new String[][] {
            {"bad", "400", "INVALID_REQUEST"}, {"missing", "404", "RESOURCE_NOT_FOUND"},
            {"conflict", "409", "RESOURCE_CONFLICT"}, {"unexpected", "500", "INTERNAL_ERROR"}}) {
            var response = get("/__verify/errors/" + sample[0]);
            assertThat(response.statusCode()).isEqualTo(Integer.parseInt(sample[1]));
            assertThat(mapper.readTree(response.body()).get("code").asString()).isEqualTo(sample[2]);
            assertThat(response.body()).doesNotContain("password", "never-expose-this", "stackTrace");
        }
        assertThat(get("/api/health").statusCode()).isEqualTo(200);
        assertThat(get("/api/records").statusCode()).isEqualTo(401);
        assertThat(get("/__verify/no-such-route").statusCode()).isEqualTo(404);
        var csrf = mapper.readTree(get("/api/csrf").body());
        for (String body : new String[] {"{\"value\":\"\"}", "{"}) {
            var response = client.send(HttpRequest.newBuilder(uri("/__verify/validate"))
                    .header("Content-Type", "application/json")
                    .header(csrf.get("headerName").asString(), csrf.get("token").asString())
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(mapper.readTree(response.body()).get("code").asString()).isEqualTo("INVALID_REQUEST");
        }
    }

    private long count(JdbcTemplate jdbc, String prefix) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM transaction_probe WHERE token LIKE CONCAT(?, '%')", Long.class, prefix);
    }

    @Test
    void actualHttpWritesCommitAndFailWithoutPartialData() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        var csrf = mapper.readTree(get("/api/csrf").body());
        for (String[] sample : new String[][] {
                {"commit", "200", "2"}, {"runtime", "500", "0"},
                {"checked", "500", "0"}, {"duplicate", "409", "0"}}) {
            String prefix = UUID.randomUUID().toString();
            var response = client.send(HttpRequest.newBuilder(uri("/__verify/transaction/" + sample[0] + "?prefix=" + prefix))
                    .header(csrf.get("headerName").asString(), csrf.get("token").asString())
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(Integer.parseInt(sample[1]));
            assertThat(count(jdbc, prefix)).isEqualTo(Long.parseLong(sample[2]));
            if (sample[0].equals("duplicate")) {
                assertThat(mapper.readTree(response.body()).get("code").asString()).isEqualTo("RESOURCE_CONFLICT");
            }
            jdbc.update("DELETE FROM transaction_probe WHERE token LIKE CONCAT(?, '%')", prefix);
        }
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpResponse<String> get(String path) throws Exception {
        return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
}
