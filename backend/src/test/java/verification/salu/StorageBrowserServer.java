package verification.salu;

import java.nio.file.*;
import java.util.*;
import kr.salu.SaluApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;

/** Browser fixtures live exclusively in the test classpath and salu_test. */
public class StorageBrowserServer {
    public static void main(String[] args) throws Exception {
        Path fixture=Path.of(System.getenv().getOrDefault("SALU_STORAGE_FIXTURE","/tmp/salu-storage-fixture.json"));
        Path keys=Files.createTempFile("salu-storage-browser-keys-",".json");
        byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);
        Files.writeString(keys,"{\"v1\":\""+Base64.getEncoder().encodeToString(key)+"\"}");
        var app=new SpringApplication(SaluApplication.class,StorageFixtureConfiguration.class);
        app.setRegisterShutdownHook(false);
        var context=app.run("--server.port=8083","--spring.datasource.url=jdbc:mysql://127.0.0.1:3307/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true","--spring.datasource.username=salu_test","--spring.flyway.locations=classpath:db/migration,classpath:db/verification","--spring.flyway.out-of-order=true","--salu.backup-key-file="+keys,"--salu.oauth.google-id=","--salu.oauth.naver-id=");
        var jdbc=context.getBean(JdbcTemplate.class);
        if(!jdbc.queryForObject("SELECT DATABASE()",String.class).equals("salu_test")) throw new IllegalStateException("테스트 DB 확인 실패");
        var encoder=context.getBean(PasswordEncoder.class);var json=context.getBean(ObjectMapper.class);
        var accounts=new ArrayList<Map<String,Object>>();
        for(int i=0;i<2;i++) {
            String email="storage-"+UUID.randomUUID()+"@example.test",password=UUID.randomUUID()+"aA!",name="기기 저장 검증 "+(i+1);
            jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES(?,?,?)",email,encoder.encode(password),name);
            long id=jdbc.queryForObject("SELECT id FROM members WHERE email=?",Long.class,email);
            StorageFixtureConfiguration.owners.add(id);
            accounts.add(Map.of("id",id,"email",email,"password",password,"displayName",name));
        }
        Files.writeString(fixture,json.writeValueAsString(accounts));
        Files.setPosixFilePermissions(fixture,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        Runtime.getRuntime().addShutdownHook(new Thread(()-> {
            accounts.forEach(a->jdbc.update("DELETE FROM designer_profiles WHERE member_id=?",a.get("id")));
            accounts.forEach(a->jdbc.update("DELETE FROM salons WHERE created_by=?",a.get("id")));
            accounts.forEach(a->jdbc.update("DELETE FROM members WHERE id=?",a.get("id")));
            context.close();
            try { Files.deleteIfExists(fixture);Files.deleteIfExists(keys); } catch(Exception ignored) {}
        }));
        System.out.println("브라우저 저장 검증 서버: 준비 완료 — salu_test 임시 계정");
        Thread.currentThread().join();
    }
}
