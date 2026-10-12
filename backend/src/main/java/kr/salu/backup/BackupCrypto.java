package kr.salu.backup;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import kr.salu.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class BackupCrypto {
    public record Encrypted(String keyId, byte[] nonce, byte[] ciphertext) {}
    private final String activeKey;
    private final Map<String, byte[]> keys = new HashMap<>();
    private final SecureRandom random = new SecureRandom();
    public BackupCrypto(@Value("${salu.backup-key-file:}") String file, @Value("${salu.backup-key-id:v1}") String keyId, ObjectMapper json) {
        activeKey = keyId;
        if (file.isBlank()) return;
        try {
            var tree = json.readTree(Files.readString(Path.of(file)));
            for (var entry : tree.properties()) { byte[] key = Base64.getDecoder().decode(entry.getValue().asString()); if (key.length != 32) throw new IllegalArgumentException(); keys.put(entry.getKey(), key); }
            if (!keys.containsKey(activeKey)) throw new IllegalArgumentException();
        } catch (Exception e) { throw new IllegalStateException("백업 암호화 키 설정을 확인하세요."); }
    }
    public Encrypted encrypt(byte[] plain, String context) {
        byte[] nonce = new byte[12]; random.nextBytes(nonce);
        return new Encrypted(activeKey, nonce, crypt(Cipher.ENCRYPT_MODE, activeKey, nonce, plain, context));
    }
    public byte[] decrypt(String keyId, byte[] nonce, byte[] cipher, String context) { return crypt(Cipher.DECRYPT_MODE, keyId, nonce, cipher, context); }
    private byte[] crypt(int mode, String keyId, byte[] nonce, byte[] input, String context) {
        var key = keys.get(keyId); if (key == null) throw ApiException.unavailable();
        try { var cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce)); cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8)); return cipher.doFinal(input); }
        catch (Exception e) { throw ApiException.unavailable(); }
    }
}
