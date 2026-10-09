package kr.salu;

import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

class SaluApplicationTest {
    @Test
    void missingSecretIdentifiesVariableWithoutPrintingValues() {
        assertThatThrownBy(() -> SaluApplication.validateEnvironment(Map.of()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("SALU_DB_PASSWORD");
        assertThatThrownBy(() -> SaluApplication.validateEnvironment(Map.of("SALU_DB_PASSWORD", "secret")))
                .hasMessageContaining("SALU_PHOTO_ROOT").hasMessageNotContaining("secret");
    }

    @Test
    void requiresExternalAbsolutePhotoPathAndConfiguredPassword() {
        assertThatThrownBy(() -> SaluApplication.validateEnvironment(Map.of(
                "SALU_DB_PASSWORD", "secret", "SALU_PHOTO_ROOT", "photos")))
                .hasMessageContaining("SALU_CONFIG_INVALID");
        assertThatThrownBy(() -> SaluApplication.validateEnvironment(Map.of(
                "SALU_DB_PASSWORD", "CHANGE_ME_PASSWORD", "SALU_PHOTO_ROOT", "/tmp/salu-photos")))
                .hasMessageContaining("SALU_CONFIG_MISSING");
        assertThatCode(() -> SaluApplication.validateEnvironment(Map.of(
                "SALU_DB_PASSWORD", "secret", "SALU_PHOTO_ROOT", "/tmp/salu-photos")))
                .doesNotThrowAnyException();
    }
}
