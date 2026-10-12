package verification.salu;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import kr.salu.auth.MemberPrincipal;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@TestConfiguration(proxyBeanMethods=false)
public class StorageFixtureConfiguration {
    static final Set<Long> owners=ConcurrentHashMap.newKeySet();
    @RestController static class FixtureController {
        private final JdbcTemplate jdbc;
        FixtureController(JdbcTemplate jdbc) { this.jdbc=jdbc; }
        @PostMapping("/api/__storage-test/reset") ResponseEntity<Void> reset(@AuthenticationPrincipal MemberPrincipal principal) {
            if(principal==null || !owners.contains(principal.id())) throw new org.springframework.security.access.AccessDeniedException("테스트 계정만 허용");
            jdbc.update("DELETE FROM designer_profiles WHERE member_id=?",principal.id());
            jdbc.update("DELETE FROM salons WHERE created_by=? AND NOT EXISTS(SELECT 1 FROM designer_affiliations WHERE salon_id=salons.id)",principal.id());
            jdbc.update("DELETE FROM personal_backup_items WHERE member_id=?",principal.id());
            jdbc.update("DELETE FROM personal_backup_photos WHERE member_id=?",principal.id());
            return ResponseEntity.noContent().build();
        }
    }
}
