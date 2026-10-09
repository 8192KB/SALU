import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class CreateDevMember {
    public static void main(String[] args) throws Exception {
        String email, name;
        char[] password;
        if (args.length == 1 && args[0].equals("--stdin")) {
            var input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            email = input.readLine(); name = input.readLine(); String raw = input.readLine();
            if (email == null || name == null || raw == null) throw new IllegalArgumentException("입력 누락");
            password = raw.toCharArray();
        } else {
            var console = System.console();
            if (console == null) { System.err.println("대화형 터미널에서 실행하세요."); System.exit(1); return; }
            email = console.readLine("이메일: "); name = console.readLine("표시 이름: "); password = console.readPassword("비밀번호: ");
        }
        email = email.strip().toLowerCase(Locale.ROOT); name = name.strip();
        String raw = new String(password);
        if (email.length() > 254 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || name.isEmpty() || name.length() > 50
            || raw.length() < 12 || raw.getBytes(StandardCharsets.UTF_8).length > 72) {
            Arrays.fill(password, '\0'); System.err.println("입력 오류: 이메일·이름, 비밀번호 12자 이상·UTF-8 72바이트 이하 확인"); System.exit(1); return;
        }
        String hash = new BCryptPasswordEncoder().encode(raw); Arrays.fill(password, '\0'); raw = null;
        var env = System.getenv();
        String host = env.getOrDefault("SALU_DB_HOST", "127.0.0.1"), port = env.getOrDefault("SALU_DB_PORT", "3307");
        if (!host.equals("127.0.0.1") || !port.equals("3307")) { System.err.println("실행 거부: 로컬 개발 DB만 지원"); System.exit(1); return; }
        try (var connection = DriverManager.getConnection("jdbc:mysql://127.0.0.1:3307/salu_dev?connectionTimeZone=UTC", env.getOrDefault("SALU_DB_USER", "salu_app"), env.get("SALU_DB_PASSWORD"))) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement("INSERT INTO members(email,password_hash,display_name,status) VALUES (?,?,?,'ACTIVE')")) {
                statement.setString(1,email); statement.setString(2,hash); statement.setString(3,name); statement.executeUpdate(); connection.commit();
                System.out.println("개발 계정: 생성 완료");
            } catch (SQLException exception) { connection.rollback(); System.err.println(exception.getErrorCode() == 1062 ? "개발 계정: 이메일 중복, 기존 계정 유지" : "개발 계정: 저장 실패"); System.exit(1); }
        } catch (SQLException exception) { System.err.println("개발 계정: DB 연결 실패"); System.exit(1); }
    }
}
