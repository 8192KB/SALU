package kr.salu.directory;

import java.net.*;
import java.net.http.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={
    "spring.datasource.url=jdbc:mysql://${SALU_DB_HOST:127.0.0.1}:${SALU_DB_PORT:3307}/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&connectTimeout=2000&socketTimeout=3000",
    "spring.datasource.username=salu_test", "spring.flyway.locations=classpath:db/migration,classpath:db/verification", "spring.flyway.out-of-order=true",
    "salu.oauth.google-id=", "salu.oauth.naver-id="
})
@EnabledIfEnvironmentVariable(named="SALU_RUN_DB_TESTS",matches="true")
class DirectoryIntegrationTest {
    @Autowired DirectoryService directory; @Autowired DataSource dataSource; @Autowired PasswordEncoder encoder; @Autowired ObjectMapper json;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean DirectoryMapper mapper;
    @LocalServerPort int port;
    JdbcTemplate jdbc; List<Long> owners=new ArrayList<>(); HttpClient client; long owner;
    @BeforeEach void prepare() throws Exception {try(var c=dataSource.getConnection()) {assertThat(c.getCatalog()).isEqualTo("salu_test");} jdbc=new JdbcTemplate(dataSource); account();}
    @AfterEach void cleanup() {for(long id:owners) {jdbc.update("DELETE FROM designer_profiles WHERE member_id=?",id); jdbc.update("DELETE FROM salons WHERE created_by=?",id);jdbc.update("DELETE FROM members WHERE id=?",id);}}
    void account() throws Exception {
        String email=UUID.randomUUID()+"@example.test";
        jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES(?,?,?)",email,encoder.encode("Test-directory-123!"),"목록 검증");
        owner=jdbc.queryForObject("SELECT id FROM members WHERE email=?",Long.class,email);owners.add(owner);
        client=HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        String csrf=json.readTree(send("GET","/api/csrf",null,null).body()).path("token").asString();
        var response=client.send(HttpRequest.newBuilder(uri("/api/auth/login")).header("X-CSRF-TOKEN",csrf).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString("email="+email+"&password=Test-directory-123%21")).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
    }
    URI uri(String path) {return URI.create("http://127.0.0.1:"+port+path);}
    HttpResponse<String> send(String method,String path,String body,String csrf) throws Exception {
        var builder=HttpRequest.newBuilder(uri(path)).method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        if(body!=null) builder.header("Content-Type","application/json"); if(csrf!=null) builder.header("X-CSRF-TOKEN",csrf);
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> write(String method,String path,String body) throws Exception {return send(method,path,body,json.readTree(send("GET","/api/csrf",null,null).body()).path("token").asString());}
    String salon() throws Exception {var result=write("POST","/api/salons",json.writeValueAsString(Map.of("name","검증 매장 "+UUID.randomUUID(),"region","서울","branch","본점")));assertThat(result.statusCode()).isEqualTo(201);return json.readTree(result.body()).path("id").asString();}
    String profile(String name,String salon,String visibility) throws Exception {var body=new HashMap<String,Object>();body.put("name",name);body.put("introduction","소개");body.put("specialties",List.of("커트","앞머리"));body.put("salonId",salon);body.put("visibility",visibility);return json.writeValueAsString(body);}
    @Test void publicReadSelfOwnershipStableIdentityAndVisibility() throws Exception {
        String salon=salon(); long original=owner;
        var created=write("POST","/api/my/designer-profile",profile("등록 디자이너",salon,"PUBLIC"));assertThat(created.statusCode()).isEqualTo(201);
        String id=json.readTree(created.body()).path("id").asString();assertThat(created.body()).doesNotContain("memberId","email");
        assertThat(jdbc.queryForObject("SELECT salon_id FROM designer_affiliations WHERE designer_id=?",String.class,id)).isEqualTo(salon);
        var guest=HttpClient.newHttpClient();assertThat(guest.send(HttpRequest.newBuilder(uri("/api/designers/"+id)).GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(200);
        assertThat(write("POST","/api/my/designer-profile",profile("중복",salon,"PUBLIC")).statusCode()).isEqualTo(409);
        assertThat(send("PUT","/api/my/designer-profile",profile("위조",salon,"PUBLIC"),null).statusCode()).isEqualTo(403);
        account();assertThat(send("GET","/api/my/designer-profile",null,null).statusCode()).isEqualTo(204);
        assertThat(write("PUT","/api/my/designer-profile",profile("다른 회원",salon,"PUBLIC")).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT name FROM designer_profiles WHERE member_id=?",String.class,original)).isEqualTo("등록 디자이너");
        assertThat(write("PUT","/api/designers/"+id,profile("타인 수정",salon,"PUBLIC")).statusCode()).isEqualTo(405);
        // 첫 계정 서비스 호출도 proxy를 경유해 커밋 여부를 별도 조회함
        directory.save(original,new DirectoryService.ProfileInput("변경 이름","소개",List.of("커트"),"PRIVATE",null),false);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM designer_affiliations WHERE designer_id=?",Integer.class,id)).isZero();
        assertThat(send("GET","/api/designers/"+id,null,null).statusCode()).isEqualTo(404);
        assertThat(jdbc.queryForObject("SELECT id FROM designer_profiles WHERE member_id=?",String.class,original)).isEqualTo(id);
        directory.save(original,new DirectoryService.ProfileInput("재공개","소개",List.of("커트"),"PUBLIC",salon),false);
        jdbc.update("UPDATE members SET status='SUSPENDED' WHERE id=?",original);
        assertThat(guest.send(HttpRequest.newBuilder(uri("/api/designers/"+id)).GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
        assertThat(guest.send(HttpRequest.newBuilder(uri("/api/designers")).GET().build(),HttpResponse.BodyHandlers.ofString()).body()).doesNotContain(id);
        assertThatThrownBy(() -> directory.save(original,new DirectoryService.ProfileInput("변경 거부","소개",List.of(),"PUBLIC",salon),false)).isInstanceOf(kr.salu.common.error.ApiException.class);
        jdbc.update("UPDATE members SET status='ACTIVE' WHERE id=?",original);

    }
    @Test void failedAffiliationRollsBackProfileAndUpdate() throws Exception {
        String salon=salon();
        org.mockito.Mockito.doThrow(new IllegalStateException("검증 실패")).when(mapper).insertAffiliation(anyString(),eq(salon));
        assertThat(write("POST","/api/my/designer-profile",profile("롤백 확인",salon,"PUBLIC")).statusCode()).isEqualTo(500);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM designer_profiles WHERE member_id=?",Integer.class,owner)).isZero();
        org.mockito.Mockito.reset(mapper);
        assertThat(write("POST","/api/my/designer-profile",profile("원본",salon,"PUBLIC")).statusCode()).isEqualTo(201);
        String second=salon();
        org.mockito.Mockito.doReturn(0).when(mapper).insertAffiliation(anyString(),eq(second));
        assertThat(write("PUT","/api/my/designer-profile",profile("취소될 수정",second,"PRIVATE")).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT name FROM designer_profiles WHERE member_id=?",String.class,owner)).isEqualTo("원본");
        assertThat(jdbc.queryForObject("SELECT a.salon_id FROM designer_affiliations a JOIN designer_profiles p ON p.id=a.designer_id WHERE p.member_id=?",String.class,owner)).isEqualTo(salon);
        assertThat(write("PUT","/api/my/designer-profile",profile("없음",UUID.randomUUID().toString(),"PUBLIC")).statusCode()).isEqualTo(400);
    }
}
