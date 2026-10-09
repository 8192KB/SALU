package kr.salu;

import java.nio.file.Path;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SaluApplication {
    public static void main(String[] args) {
        validateEnvironment(System.getenv());
        SpringApplication.run(SaluApplication.class, args);
    }

    static void validateEnvironment(Map<String, String> environment) {
        for (String name : new String[] {"SALU_DB_PASSWORD", "SALU_PHOTO_ROOT"}) {
            String value = environment.get(name);
            if (value == null || value.isBlank() || value.startsWith("CHANGE_ME")) {
                throw new IllegalStateException("SALU_CONFIG_MISSING: " + name
                        + " 환경변수를 설정하세요. README.md의 실행 절차를 확인하세요.");
            }
        }
        if (!Path.of(environment.get("SALU_PHOTO_ROOT")).isAbsolute()) {
            throw new IllegalStateException("SALU_CONFIG_INVALID: SALU_PHOTO_ROOT는 절대 경로여야 합니다.");
        }
    }
}
