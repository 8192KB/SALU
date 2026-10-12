package kr.salu.backup;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "spring.datasource.url=jdbc:mysql://${SALU_DB_HOST:127.0.0.1}:${SALU_DB_PORT:3307}/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&connectTimeout=2000&socketTimeout=3000",
    "spring.datasource.username=salu_test", "spring.flyway.locations=classpath:db/migration,classpath:db/verification", "spring.flyway.out-of-order=true"
})
@EnabledIfEnvironmentVariable(named="SALU_RUN_DB_TESTS",matches="true")
class BackupIntegrationTest {
    static final Path keyFile;
    static { try { keyFile=Files.createTempFile("salu-backup-test-",".json"); byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);Files.writeString(keyFile,"{\"v1\":\""+Base64.getEncoder().encodeToString(key)+"\"}");keyFile.toFile().deleteOnExit(); } catch(Exception e) { throw new IllegalStateException(); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) { p.add("salu.backup-key-file",()->keyFile.toString()); }
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean BackupMapper mapper;
    @Autowired DataSource dataSource; @Autowired PasswordEncoder encoder; @Autowired ObjectMapper json;
    @LocalServerPort int port;
    JdbcTemplate jdbc; List<String> emails=new ArrayList<>(); HttpClient client; String context; long owner;
    @BeforeEach void prepare() throws Exception { try(var c=dataSource.getConnection()) { assertThat(c.getCatalog()).isEqualTo("salu_test"); } jdbc=new JdbcTemplate(dataSource); account(); }
    @AfterEach void cleanup() { emails.forEach(email->jdbc.update("DELETE FROM members WHERE email=?",email)); }
    void account() throws Exception {
        String email=UUID.randomUUID()+"@example.test";emails.add(email);jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES(?,?,?)",email,encoder.encode("Test-backup-123!"),"백업 검증");
        client=HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        String csrf=json.readTree(get("/api/csrf").body()).path("token").asString();
        var response=send("POST","/api/auth/login","email="+email+"&password=Test-backup-123%21","application/x-www-form-urlencoded",csrf,null);
        assertThat(response.statusCode()).isEqualTo(200);var body=json.readTree(response.body());context=body.path("storageContext").asString();owner=body.path("id").asLong();
    }
    HttpResponse<String> get(String path) throws Exception { return send("GET",path,null,null,null,context); }
    HttpResponse<String> send(String method,String path,String body,String type,String csrf,String ctx) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        if(type!=null)builder.header("Content-Type",type);if(csrf!=null)builder.header("X-CSRF-TOKEN",csrf);if(ctx!=null)builder.header("X-SALU-Storage-Context",ctx);
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> put(String id,long revision,String mutation,String note,List<String> photos) throws Exception {
        var cut=new LinkedHashMap<String,Object>();cut.put("id","cut-record");cut.put("cutDate","2026-10-01");cut.put("service","커트");cut.put("areas",List.of("SIDE"));cut.put("goodNote",note);cut.put("salonName","");cut.put("designerName","");
        var draft=new LinkedHashMap<>(cut);draft.remove("id");draft.put("price","");draft.put("photos",List.of());
        var draftValues=new LinkedHashMap<String,Object>();draftValues.put("cutDraft",draft);draftValues.put("progressDrafts",Map.of());draftValues.put("cutEdits",Map.of());draftValues.put("progressEdits",Map.of());draftValues.put("requests",Map.of());draftValues.put("currentRequestId",null);draftValues.put("steps",Map.of());draftValues.put("recoveredCuts",List.of());
        var payload=Map.of("version",1,"state",Map.of("cuts",List.of(cut),"progress",List.of(),"photos",photos.stream().map(p->Map.of("id",p,"url","","caption","사진","cutId","cut-record","date","2026-10-01")).toList(),"designers",List.of(),"previews",List.of()),"drafts",draftValues);
        String body=json.writeValueAsString(Map.of("expectedRevision",revision,"mutationId",mutation,"payload",payload,"photoIds",photos));
        return send("PUT","/api/personal-backups/"+id,body,"application/json",json.readTree(get("/api/csrf").body()).path("token").asString(),context);
    }
    @Test void encryptedCommitReplayRevisionAndOwnership() throws Exception {
        assertThat(put("cut-test",0,"mutation-1","비공개 원문",List.of()).statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT revision FROM personal_backup_items WHERE member_id=? AND client_id='cut-test'",Long.class,owner)).isEqualTo(1);
        byte[] cipher=jdbc.queryForObject("SELECT ciphertext FROM personal_backup_items WHERE member_id=? AND client_id='cut-test'",byte[].class,owner);assertThat(new String(cipher,StandardCharsets.UTF_8)).doesNotContain("비공개 원문");
        assertThat(get("/api/personal-backups/cut-test").body()).contains("비공개 원문");
        assertThat(put("cut-test",0,"mutation-1","비공개 원문",List.of()).body()).contains("\"revision\":1");
        assertThat(put("cut-test",0,"mutation-2","충돌 원문",List.of()).statusCode()).isEqualTo(409);
        assertThat(put("cut-test",1,"mutation-1","다른 요청",List.of()).statusCode()).isEqualTo(409);
        assertThat(put("cut-test",1,"mutation-2","최신 원문",List.of()).statusCode()).isEqualTo(200);
        assertThat(put("cut-test",0,"mutation-1","비공개 원문",List.of()).body()).contains("\"revision\":1");
        assertThat(get("/api/personal-backups/cut-test").body()).contains("최신 원문");
        String oldContext=context;account();
        assertThat(get("/api/personal-backups/cut-test").statusCode()).isEqualTo(404);
        assertThat(get("/api/personal-backups").body()).isEqualTo("[]");
        assertThat(send("GET","/api/personal-backups",null,null,null,oldContext).statusCode()).isEqualTo(409);
    }
    @Test void missingPhotosAndDatabaseFailureDoNotPartiallyCommit() throws Exception {
        assertThat(put("cut-missing",0,"missing-mutation","사진 연결",List.of("missing-photo")).statusCode()).isEqualTo(400);
        org.mockito.Mockito.doAnswer(invocation -> {
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM personal_backup_items WHERE member_id=? AND client_id='cut-rollback'",Integer.class,owner)).isEqualTo(1);
            throw new IllegalStateException("테스트 저장 실패");
        }).when(mapper).insertMutation(org.mockito.ArgumentMatchers.eq(owner),org.mockito.ArgumentMatchers.eq("cut-rollback"),org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.anyLong(),org.mockito.ArgumentMatchers.any());
        assertThat(put("cut-rollback",0,"rollback-mutation","롤백 확인",List.of()).statusCode()).isEqualTo(500);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM personal_backup_items WHERE member_id=?",Integer.class,owner)).isZero();
    }
    @Test void webpBackupPreservesBytesAndRejectsBrokenImage() throws Exception {
        byte[] webp;
        try (var input=getClass().getResourceAsStream("/photos/pixel.webp")) {
            assertThat(input).isNotNull(); webp=input.readAllBytes();
        }
        String csrf=json.readTree(get("/api/csrf").body()).path("token").asString();
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/personal-backup-photos/photo-webp"))
            .header("Content-Type","image/webp").header("X-CSRF-TOKEN",csrf).header("X-SALU-Storage-Context",context)
            .PUT(HttpRequest.BodyPublishers.ofByteArray(webp)).build();
        assertThat(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(204);
        var restored=client.send(HttpRequest.newBuilder(request.uri()).header("X-SALU-Storage-Context",context).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
        assertThat(restored.headers().firstValue("Content-Type")).contains("image/webp");
        assertThat(restored.body()).isEqualTo(webp);
        assertThat(jdbc.queryForObject("SELECT ciphertext FROM personal_backup_photos WHERE member_id=? AND client_id='photo-webp'",byte[].class,owner)).isNotEqualTo(webp);
        var broken=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/personal-backup-photos/photo-broken"))
            .header("Content-Type","image/webp").header("X-CSRF-TOKEN",csrf).header("X-SALU-Storage-Context",context)
            .PUT(HttpRequest.BodyPublishers.ofByteArray(Arrays.copyOf(webp,13))).build();
        assertThat(client.send(broken,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM personal_backup_photos WHERE member_id=?",Integer.class,owner)).isEqualTo(1);
    }
    @Test void privatePhotoBytesAreEncryptedAndImmutable() throws Exception {
        var image=new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB);var stream=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(image,"png",stream);byte[] png=stream.toByteArray();
        String csrf=json.readTree(get("/api/csrf").body()).path("token").asString();
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/personal-backup-photos/photo-test")).header("Content-Type","image/png").header("X-CSRF-TOKEN",csrf).header("X-SALU-Storage-Context",context).PUT(HttpRequest.BodyPublishers.ofByteArray(png)).build();
        assertThat(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(204);
        assertThat(client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(204);
        byte[] cipher=jdbc.queryForObject("SELECT ciphertext FROM personal_backup_photos WHERE member_id=?",byte[].class,owner);assertThat(cipher).isNotEqualTo(png);
        var get=HttpRequest.newBuilder(request.uri()).header("X-SALU-Storage-Context",context).GET().build();
        var restored=client.send(get,HttpResponse.BodyHandlers.ofByteArray());assertThat(restored.body()).isEqualTo(png);assertThat(restored.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(put("cut-photo",0,"photo-mutation","사진 저장",List.of("photo-test")).statusCode()).isEqualTo(200);
        String oldContext=context; account();
        var foreign=HttpRequest.newBuilder(request.uri()).header("X-SALU-Storage-Context",context).GET().build();assertThat(client.send(foreign,HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
        assertThat(send("PUT","/api/personal-backups/cut-stale","{\"expectedRevision\":0,\"mutationId\":\"stale\",\"payload\":{},\"photoIds\":[]}","application/json",json.readTree(get("/api/csrf").body()).path("token").asString(),oldContext).statusCode()).isEqualTo(409);
    }
}
