package kr.salu.auth.social;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import kr.salu.auth.MemberPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.client.userinfo.*;
import org.springframework.security.oauth2.client.oidc.userinfo.*;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.*;

@Component
public class SocialFlow implements OAuth2AuthorizationRequestResolver {
    public static final String LINK="SALU_SOCIAL_LINK";
    public record Link(long owner,String context,String provider,long expires,String state) implements java.io.Serializable {}
    private final DefaultOAuth2AuthorizationRequestResolver resolver;
    private final SocialIdentityService identities;
    private final DefaultOAuth2UserService oauth=new DefaultOAuth2UserService();
    private final OidcUserService oidc=new OidcUserService();
    public SocialFlow(SocialClients clients,SocialIdentityService identities) { this.identities=identities; resolver=new DefaultOAuth2AuthorizationRequestResolver(clients,"/api/auth/oauth2/authorize"); }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request) { return bind(request,resolver.resolve(request)); }
    @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request,String id) { return bind(request,resolver.resolve(request,id)); }
    private OAuth2AuthorizationRequest bind(HttpServletRequest request,OAuth2AuthorizationRequest auth) {
        if(auth==null) return null;
        if("1".equals(request.getParameter("link"))) {
            var session=request.getSession(false); Object link=session==null?null:session.getAttribute(LINK);
            Object principal=SecurityContextHolder.getContext().getAuthentication()==null?null:SecurityContextHolder.getContext().getAuthentication().getPrincipal();
            String provider=auth.getAttribute("registration_id");
            if(!(link instanceof Link intent) || !(principal instanceof MemberPrincipal member) || intent.owner()!=member.id() || !intent.context().equals(member.storageContext()) || !intent.provider().equals(provider) || intent.expires()<System.currentTimeMillis()) throw new OAuth2AuthenticationException("invalid_link");
            session.setAttribute(LINK,new Link(intent.owner(),intent.context(),provider,intent.expires(),auth.getState()));
        } else if(request.getSession(false)!=null) request.getSession(false).removeAttribute(LINK);
        return auth;
    }
    public OAuth2User oauth(OAuth2UserRequest request) { return map(request.getClientRegistration().getRegistrationId(),oauth.loadUser(request)); }
    public OidcUser oidc(OidcUserRequest request) { return map(request.getClientRegistration().getRegistrationId(),oidc.loadUser(request)); }
    private MemberPrincipal map(String provider,OAuth2User user) {
        try {
            Map<String,Object> values=user.getAttributes();
            if(provider.equals("naver")) { Object nested=values.get("response"); if(!(nested instanceof Map<?,?>)) throw new IllegalArgumentException(); values=(Map<String,Object>)nested; }
            String subject=values.get(provider.equals("google")?"sub":"id") instanceof String s?s:null;
            String name=values.get("name") instanceof String s?s:null;
            var request=((ServletRequestAttributes)RequestContextHolder.currentRequestAttributes()).getRequest();
            var session=request.getSession(false); Object intent=session==null?null:session.getAttribute(LINK);
            Long owner=null;
            if(intent instanceof Link link) {
                Object current=SecurityContextHolder.getContext().getAuthentication()==null?null:SecurityContextHolder.getContext().getAuthentication().getPrincipal();
                if(!(current instanceof MemberPrincipal member) || member.id()!=link.owner() || !member.storageContext().equals(link.context()) || !provider.equals(link.provider()) || link.expires()<System.currentTimeMillis() || !java.util.Objects.equals(link.state(),request.getParameter("state"))) throw new IllegalArgumentException();
                owner=link.owner();
            }
            for(int retry=0; ;retry++) {
                try { return identities.resolve(provider,subject,name,owner).social(user); }
                catch(org.springframework.dao.DuplicateKeyException e) { if(retry>=1) throw e; }
            }
        } catch(Exception e) { throw new OAuth2AuthenticationException(new OAuth2Error("social_login_failed"),"소셜 로그인을 처리하지 못했습니다."); }
    }
}
