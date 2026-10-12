package kr.salu.auth.social;

import com.sun.net.httpserver.HttpServer;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.*;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:mysql://${SALU_DB_HOST:127.0.0.1}:${SALU_DB_PORT:3307}/salu_test?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true",
    "spring.datasource.username=salu_test","spring.flyway.locations=classpath:db/migration,classpath:db/verification","spring.flyway.out-of-order=true"
})
@Import(SocialIntegrationTest.Providers.class)
@EnabledIfEnvironmentVariable(named="SALU_RUN_DB_TESTS",matches="true")
class SocialIntegrationTest {
    static final HttpServer idp; static final RSAKey signingKey; static final String issuer;
    static volatile String subject,name,nonce,profileEmail;
    static volatile boolean badNonce;
    static {
        try {
            signingKey=new RSAKeyGenerator(2048).keyID("test-key").generate();
            idp=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);issuer="http://127.0.0.1:"+idp.getAddress().getPort();
            idp.createContext("/token",exchange->{
                String body="{\"access_token\":\"test-access\",\"token_type\":\"Bearer\",\"expires_in\":300}";
                String form=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
                if(form.contains("code=google-code")) try {
                    var claims=new JWTClaimsSet.Builder().issuer(issuer).subject(subject).audience("test-client").issueTime(new Date()).expirationTime(new Date(System.currentTimeMillis()+300000)).claim("nonce",badNonce?"invalid-nonce":nonce).claim("name",name).build();
                    var token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(),claims);token.sign(new RSASSASigner(signingKey));
                    body="{\"access_token\":\"test-access\",\"token_type\":\"Bearer\",\"expires_in\":300,\"scope\":\"openid profile email\",\"id_token\":\""+token.serialize()+"\"}";
                } catch(Exception e) { throw new IllegalStateException(); }
                byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
            });
            idp.createContext("/userinfo",exchange->{
                String body=exchange.getRequestURI().getQuery()!=null?"{}":"{\"resultcode\":\"00\",\"response\":{\"id\":\""+subject+"\",\"name\":\""+name+"\",\"email\":\""+profileEmail+"\"}}";
                byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
            });
            idp.createContext("/google-userinfo",exchange->{ byte[] bytes=("{\"sub\":\""+subject+"\",\"name\":\""+name+"\",\"email\":\""+profileEmail+"\"}").getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close(); });
            idp.createContext("/jwks",exchange->{ byte[] bytes=new JWKSet(signingKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close(); });
            idp.start();
        } catch(Exception e) { throw new IllegalStateException(); }
    }
    @TestConfiguration(proxyBeanMethods=false) static class Providers {
        @Bean @Primary SocialClients testClients(Environment env) {
            return new SocialClients(env) {
                @Override public boolean enabled() { return true; }
                @Override public ClientRegistration findByRegistrationId(String provider) {
                    if(!List.of("google","naver").contains(provider))return null;
                    var b=ClientRegistration.withRegistrationId(provider).clientId("test-client").clientSecret("test-secret").clientName(provider).authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE).clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST).redirectUri("http://127.0.0.1:"+env.getProperty("local.server.port")+"/api/auth/oauth2/callback/"+provider).authorizationUri(issuer+"/authorize").tokenUri(issuer+"/token");
                    if(provider.equals("google"))b.scope("openid","profile","email").issuerUri(issuer).jwkSetUri(issuer+"/jwks").userInfoUri(issuer+"/google-userinfo").userNameAttributeName("sub");
                    else b.scope("name","email").userInfoUri(issuer+"/userinfo").userNameAttributeName("response");
                    return b.build();
                }
                @Override public Iterator<ClientRegistration> iterator() { return List.of(findByRegistrationId("google"),findByRegistrationId("naver")).iterator(); }
            };
        }
    }
    @Autowired DataSource dataSource; @Autowired ObjectMapper json; @Autowired PasswordEncoder encoder; @LocalServerPort int port;
    JdbcTemplate jdbc; HttpClient client; CookieManager cookies; String suffix;
    List<Long> cleanupIds=new ArrayList<>();
    @BeforeEach void prepare() throws Exception { try(var c=dataSource.getConnection()) { assertThat(c.getCatalog()).isEqualTo("salu_test"); } jdbc=new JdbcTemplate(dataSource);suffix=UUID.randomUUID().toString();subject="social-"+suffix;profileEmail="profile-"+suffix+"@example.test";badNonce=false;name="소셜 검증";cookies=new CookieManager();client=HttpClient.newBuilder().cookieHandler(cookies).build(); }
    @AfterEach void cleanup() { jdbc.query("SELECT member_id FROM social_identities WHERE provider_subject IN (?,?)",rs->{cleanupIds.add(rs.getLong(1));},subject,"other-"+suffix);cleanupIds.stream().distinct().forEach(id->jdbc.update("DELETE FROM members WHERE id=?",id)); }
    @AfterAll static void close() { idp.stop(0); }
    HttpResponse<String> get(String path) throws Exception { return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).GET().build(),HttpResponse.BodyHandlers.ofString()); }
    Map<String,String> query(String location) { var map=new HashMap<String,String>();for(String pair:URI.create(location).getRawQuery().split("&")) { var kv=pair.split("=",2);map.put(kv[0],URLDecoder.decode(kv[1],StandardCharsets.UTF_8)); }return map; }
    HttpResponse<String> social(String provider,String extra) throws Exception {
        var start=get("/api/auth/oauth2/authorize/"+provider+extra);assertThat(start.statusCode()).isEqualTo(302);
        var q=query(start.headers().firstValue("Location").orElseThrow());nonce=q.get("nonce");
        return get("/api/auth/oauth2/callback/"+provider+"?code="+provider+"-code&state="+URLEncoder.encode(q.get("state"),StandardCharsets.UTF_8));
    }
    String csrf() throws Exception { return json.readTree(get("/api/csrf").body()).path("token").asString(); }
    HttpResponse<String> post(String path,String body,String type,String context) throws Exception { var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).header("Content-Type",type).header("X-CSRF-TOKEN",csrf()).POST(HttpRequest.BodyPublishers.ofString(body));if(context!=null)request.header("X-SALU-Storage-Context",context);return client.send(request.build(),HttpResponse.BodyHandlers.ofString()); }
    @Test void naverCallbackCreatesStableIdentityAndValidSaluSession() throws Exception {
        csrf();String old=cookies.getCookieStore().getCookies().get(0).getValue();
        assertThat(social("naver","").headers().firstValue("Location").orElseThrow()).endsWith("/auth/complete");
        var me=json.readTree(get("/api/auth/me").body());long id=me.path("id").asLong();cleanupIds.add(id);
        assertThat(me.path("email").isNull()).isTrue();assertThat(me.path("displayName").asString()).isEqualTo(name);assertThat(me.path("storageContext").asString()).isNotBlank();
        assertThat(cookies.getCookieStore().getCookies().get(0).getValue()).isNotEqualTo(old);
        assertThat(post("/api/auth/logout","","application/x-www-form-urlencoded",null).statusCode()).isEqualTo(204);
        social("naver","");assertThat(json.readTree(get("/api/auth/me").body()).path("id").asLong()).isEqualTo(id);
        assertThat(get("/api/personal-backups").statusCode()).isEqualTo(400);
    }
    @Test void googleOidcCallbackVerifiesTokenAndDoesNotMergeEmail() throws Exception {
        String fixture="local-"+suffix+"@example.test";
        profileEmail=fixture;
        // Contact email does not participate in identity resolution.
        jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES(?,?,?)",fixture,encoder.encode("Test-social-123!"),"기존 회원");long local=jdbc.queryForObject("SELECT id FROM members WHERE email=?",Long.class,fixture);cleanupIds.add(local);
        assertThat(social("google","").headers().firstValue("Location").orElseThrow()).endsWith("/auth/complete");
        long social=json.readTree(get("/api/auth/me").body()).path("id").asLong();cleanupIds.add(social);assertThat(social).isNotEqualTo(local);
        assertThat(jdbc.queryForObject("SELECT provider FROM social_identities WHERE member_id=?",String.class,social)).isEqualTo("google");
    }
    @Test void stateFailureAndExplicitAccountLinkPreserveOwnership() throws Exception {
        var start=get("/api/auth/oauth2/authorize/naver");assertThat(start.statusCode()).isEqualTo(302);
        assertThat(get("/api/auth/oauth2/callback/naver?code=naver-code&state=wrong").headers().firstValue("Location").orElseThrow()).endsWith("/login?socialError=1");
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        String email="local-"+suffix+"@example.test";jdbc.update("INSERT INTO members(email,password_hash,display_name) VALUES(?,?,?)",email,encoder.encode("Test-social-123!"),"연결 회원");long local=jdbc.queryForObject("SELECT id FROM members WHERE email=?",Long.class,email);cleanupIds.add(local);
        var login=post("/api/auth/login","email="+email+"&password=Test-social-123%21","application/x-www-form-urlencoded",null);var me=json.readTree(login.body());
        var link=post("/api/auth/oauth2/link/naver","","application/json",me.path("storageContext").asString());assertThat(link.statusCode()).isEqualTo(200);
        assertThat(social("naver","?link=1").headers().firstValue("Location").orElseThrow()).endsWith("/auth/complete");
        assertThat(json.readTree(get("/api/auth/me").body()).path("id").asLong()).isEqualTo(local);
        assertThat(jdbc.queryForObject("SELECT member_id FROM social_identities WHERE provider='naver' AND provider_subject=?",Long.class,subject)).isEqualTo(local);
    }
    @Test void invalidOidcNonceDoesNotCreateAnIdentity() throws Exception {
        badNonce=true;
        assertThat(social("google","").headers().firstValue("Location").orElseThrow()).endsWith("/login?socialError=1");
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM social_identities WHERE provider_subject=?",Integer.class,subject)).isZero();
    }
    @Test void inactiveSocialIdentityCannotLogInAgain() throws Exception {
        social("naver","");long id=json.readTree(get("/api/auth/me").body()).path("id").asLong();cleanupIds.add(id);
        jdbc.update("UPDATE members SET status='SUSPENDED' WHERE id=?",id);
        assertThat(get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(social("naver","").headers().firstValue("Location").orElseThrow()).endsWith("/login?socialError=1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM social_identities WHERE provider_subject=?",Integer.class,subject)).isEqualTo(1);
    }

}
