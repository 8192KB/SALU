package kr.salu.auth.social;

import java.net.URI;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.*;

@Component
public class SocialClients implements ClientRegistrationRepository, Iterable<ClientRegistration> {
    private final Map<String,ClientRegistration> clients=new LinkedHashMap<>();
    public SocialClients(Environment env) {
        String origin=env.getProperty("salu.public-origin","http://127.0.0.1:5174");
        URI uri=URI.create(origin);
        if(uri.getHost()==null || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null || (uri.getPath()!=null && !uri.getPath().isEmpty()) || !(uri.getScheme().equals("https") || (uri.getScheme().equals("http") && Set.of("127.0.0.1","localhost").contains(uri.getHost())))) throw new IllegalStateException("SALU 공개 주소 설정을 확인하세요.");
        for(String provider:List.of("google","naver")) {
            String id=env.getProperty("salu.oauth."+provider+"-id",""); String secret=env.getProperty("salu.oauth."+provider+"-secret","");
            if(id.isBlank() || secret.isBlank()) continue;
            var builder=ClientRegistration.withRegistrationId(provider).clientId(id).clientSecret(secret).authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE).redirectUri(origin+"/api/auth/oauth2/callback/"+provider);
            if(provider.equals("google")) builder.clientName("Google").clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC).scope("openid","profile","email").authorizationUri("https://accounts.google.com/o/oauth2/v2/auth").tokenUri("https://oauth2.googleapis.com/token").userInfoUri("https://openidconnect.googleapis.com/v1/userinfo").jwkSetUri("https://www.googleapis.com/oauth2/v3/certs").issuerUri("https://accounts.google.com").userNameAttributeName("sub");
            else builder.clientName("네이버").clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST).scope("name","email").authorizationUri("https://nid.naver.com/oauth2.0/authorize").tokenUri("https://nid.naver.com/oauth2.0/token").userInfoUri("https://openapi.naver.com/v1/nid/me").userNameAttributeName("response");
            clients.put(provider,builder.build());
        }
    }
    public boolean enabled() { return !clients.isEmpty(); }
    @Override public ClientRegistration findByRegistrationId(String id) { return clients.get(id); }
    @Override public Iterator<ClientRegistration> iterator() { return clients.values().iterator(); }
}
