package kr.salu.config;

import jakarta.servlet.DispatcherType;
import kr.salu.auth.*;
import kr.salu.auth.social.*;
import kr.salu.member.MemberMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.csrf.CsrfException;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper json, UserDetailsService users, PasswordEncoder encoder, MemberMapper members, org.springframework.beans.factory.ObjectProvider<SocialClients> clientProvider, org.springframework.beans.factory.ObjectProvider<SocialFlow> flowProvider) throws Exception {
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        http.authenticationProvider(provider)
            .authorizeHttpRequests(authorize -> authorize
                .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                .requestMatchers(HttpMethod.GET, "/api/health", "/api/csrf", "/api/salons", "/api/designers", "/api/designers/*", "/api/designers/*/reviews", "/api/designers/*/affiliations", "/api/auth/oauth2/providers", "/api/auth/oauth2/authorize/*", "/api/auth/oauth2/callback/*").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/community/posts", "/api/community/posts/*", "/api/community/posts/*/comments", "/api/community/posts/*/photos/*").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/signup").permitAll()
                .anyRequest().authenticated())
            .formLogin(login -> login.loginPage("/api/auth/me").loginProcessingUrl("/api/auth/login")
                .usernameParameter("email").passwordParameter("password")
                .successHandler((request, response, auth) -> AuthJson.body(response, json, 200, SessionMember.from((MemberPrincipal) auth.getPrincipal())))
                .failureHandler((request, response, exception) -> {
                    if (exception instanceof InternalAuthenticationServiceException)
                        AuthJson.error(response, json, 503, "AUTHENTICATION_UNAVAILABLE", "잠시 후 다시 시도하세요.");
                    else AuthJson.error(response, json, 401, "LOGIN_FAILED", "이메일 또는 비밀번호를 확인하세요.");
                }))
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout.logoutUrl("/api/auth/logout").deleteCookies("SALU_SESSION")
                .logoutSuccessHandler((request, response, auth) -> { response.setStatus(204); response.setHeader("Cache-Control", "no-store"); }))
            .sessionManagement(session -> session.sessionFixation(fixation -> fixation.changeSessionId()))
            .requestCache(cache -> cache.disable())
            .addFilterBefore(new LoginGuard(json), UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(new ActiveSessionGuard(members, json), AnonymousAuthenticationFilter.class)
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, exception) -> AuthJson.error(response, json, 401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다."))
                .accessDeniedHandler((request, response, exception) -> AuthJson.error(response, json, 403,
                    exception instanceof CsrfException ? "CSRF_INVALID" : "ACCESS_DENIED",
                    exception instanceof CsrfException ? "CSRF 토큰을 다시 받아 요청하세요." : "접근 권한이 없습니다.")));
        var clients=clientProvider.getIfAvailable(); var social=flowProvider.getIfAvailable();
        if(clients!=null && clients.enabled()) http.oauth2Login(oauth -> oauth.clientRegistrationRepository(clients).loginPage("/api/auth/me")
            .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(social))
            .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/auth/oauth2/callback/*"))
            .userInfoEndpoint(info -> info.userService(social::oauth).oidcUserService(social::oidc))
            .successHandler((request,response,auth) -> { request.getSession().removeAttribute(SocialFlow.LINK); response.setHeader("Cache-Control","no-store"); response.sendRedirect("/auth/complete"); })
            .failureHandler((request,response,error) -> { if(request.getSession(false)!=null) request.getSession(false).removeAttribute(SocialFlow.LINK); response.setHeader("Cache-Control","no-store"); response.sendRedirect("/login?socialError=1"); }));
        return http.build();
    }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
}
