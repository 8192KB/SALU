package kr.salu.common;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import kr.salu.common.error.ApiException;

public final class Inputs {
    public static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private Inputs() {}
    public static boolean uuid(String value) { return value != null && value.matches(UUID_PATTERN); }
    // 앞뒤 공백을 뺀 1~max 글자. 글자 수는 이모지도 한 글자로 셈
    public static String text(String value, int max) {
        if (value == null) throw ApiException.invalidRequest();
        String trimmed = value.strip();
        if (trimmed.isEmpty() || trimmed.codePointCount(0, trimmed.length()) > max) throw ApiException.invalidRequest();
        return trimmed;
    }
    public static String optionalText(String value, int max) { return value == null || value.isBlank() ? null : text(value, max); }
    public static String time(Instant value) { return value == null ? null : value.truncatedTo(ChronoUnit.MILLIS).toString(); }
}
