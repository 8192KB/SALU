package kr.salu.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import jakarta.annotation.PreDestroy;
import kr.salu.common.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// 비밀번호 찾기(docs/login.md). 가입 여부를 응답·시간으로 드러내지 않도록 메일은 commit 뒤 별도 thread에서 보냄
@Service
public class PasswordResetService {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private final PasswordResetMapper mapper;
    private final PasswordEncoder passwords;
    private final ObjectProvider<JavaMailSender> mail;
    private final String from, origin, host;
    private final SecureRandom random = new SecureRandom();
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> { var t = new Thread(r, "password-reset-mail"); t.setDaemon(true); return t; });
    public PasswordResetService(PasswordResetMapper mapper, PasswordEncoder passwords, ObjectProvider<JavaMailSender> mail,
            @Value("${salu.mail-from:}") String from, @Value("${salu.public-origin}") String origin, @Value("${spring.mail.host:}") String host) {
        this.mapper = mapper; this.passwords = passwords; this.mail = mail; this.from = from; this.origin = origin.replaceAll("/+$", ""); this.host = host;
    }
    @PreDestroy void stop() { sender.shutdown(); }

    // 메일 host가 빈 값이어도 Spring이 발송 객체를 만들 수 있어 host를 직접 확인함
    public boolean enabled() { return !host.isBlank() && !from.isBlank() && mail.getIfAvailable() != null; }

    static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    @Transactional
    public void request(String email) {
        if (!enabled()) throw ApiException.mailUnavailable();
        var target = mapper.target(email);
        // 없는 계정·소셜 가입 계정·1분 안에 보낸 계정은 조용히 넘어감. 응답은 같음
        if (target == null || mapper.recent(target.id()) > 0) return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        mapper.closeAll(target.id());
        if (mapper.insert(target.id(), hash(token)) != 1) throw ApiException.conflict();
        String to = target.email();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { sender.execute(() -> send(to, token)); }
        });
    }

    private void send(String to, String token) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject("[SALU] 비밀번호 다시 정하기");
        message.setText("SALU 비밀번호를 다시 정하려면 30분 안에 아래 주소를 여세요.\n\n"
            + origin + "/password-reset#token=" + token
            + "\n\n직접 요청하지 않았다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.");
        try {
            mail.getObject().send(message);
        } catch (RuntimeException e) {
            log.warn("비밀번호 찾기 메일 발송 실패: type={}", e.getClass().getName());
        }
    }

    @Transactional
    public void confirm(String token, String next) {
        if (next.getBytes(StandardCharsets.UTF_8).length > 72) throw ApiException.invalidRequest();
        var usable = mapper.usable(hash(token));
        if (usable == null) throw ApiException.resetTokenInvalid();
        if (mapper.setPassword(usable.memberId(), passwords.encode(next)) != 1) throw ApiException.resetTokenInvalid();
        mapper.closeAll(usable.memberId());
    }
}
