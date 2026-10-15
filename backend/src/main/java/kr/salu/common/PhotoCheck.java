package kr.salu.common;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import javax.imageio.ImageIO;

// 계정 백업과 상담 첨부가 같은 기준으로 사진을 받도록 형식 서명·디코딩·화소 수를 함께 확인함
public final class PhotoCheck {
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    public static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private PhotoCheck() {}

    public static boolean readable(String type, byte[] bytes) {
        if (type == null || !TYPES.contains(type) || bytes.length == 0 || !signature(type, bytes)) return false;
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input); if (!readers.hasNext()) return false;
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                return reader.getWidth(0) * (long) reader.getHeight(0) <= 40000000 && reader.read(0) != null;
            } finally { reader.dispose(); }
        } catch (java.io.IOException | IllegalArgumentException e) { return false; }
    }

    private static boolean signature(String type, byte[] b) {
        if (b.length < 12) return false;
        return switch (type) {
            case "image/jpeg" -> (b[0] & 255) == 255 && (b[1] & 255) == 216 && (b[2] & 255) == 255;
            case "image/png" -> Arrays.equals(Arrays.copyOf(b, 8), new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10});
            default -> new String(b, 0, 4, StandardCharsets.US_ASCII).equals("RIFF") && new String(b, 8, 4, StandardCharsets.US_ASCII).equals("WEBP");
        };
    }
}
