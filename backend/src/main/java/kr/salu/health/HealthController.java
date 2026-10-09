package kr.salu.health;

import java.time.Instant;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final HealthMapper mapper;

    public HealthController(HealthMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping("/api/health")
    public ResponseEntity<HealthResponse> health() {
        try {
            if (mapper.ping() == 1) {
                return response(200, "UP", "UP", null, "서버와 DB 연결 정상");
            }
        } catch (DataAccessException exception) {
            // 접속 정보와 드라이버 예외는 공개 상태 응답에서 제외함
        }
        return response(503, "DEGRADED", "DOWN", "DATABASE_UNAVAILABLE",
                "DB 연결 실패. DB 실행 상태와 서버 환경변수를 확인하세요.");
    }

    private ResponseEntity<HealthResponse> response(int status, String overall, String database,
                                                    String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(
                new HealthResponse(overall, "UP", database, Instant.now(), code, message));
    }

    public record HealthResponse(String status, String server, String database,
                                 Instant checkedAt, String code, String message) {}
}
