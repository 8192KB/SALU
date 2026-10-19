package kr.salu.auth;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.salu.member.MemberMapper;
import org.springframework.dao.DataAccessException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

public final class ActiveSessionGuard extends OncePerRequestFilter {
    private final MemberMapper mapper;
    private final ObjectMapper json;
    public ActiveSessionGuard(MemberMapper mapper, ObjectMapper json) { this.mapper = mapper; this.json = json; }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.equals("/api/health") || path.equals("/api/csrf") || path.equals("/api/auth/logout");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof MemberPrincipal principal) {
            try {
                var member = mapper.findById(principal.id());
                if (member == null || !"ACTIVE".equals(member.status()) || !member.role().equals(principal.role())) {
                    SecurityContextHolder.clearContext();
                    var session = request.getSession(false);
                    if (session != null) session.invalidate();
                    AuthJson.error(response, json, 401, "AUTHENTICATION_REQUIRED", "다시 로그인하세요."); return;
                }
            } catch (DataAccessException exception) {
                AuthJson.error(response, json, 503, "DATABASE_UNAVAILABLE", "잠시 후 다시 시도하세요."); return;
            }
        }
        chain.doFilter(request, response);
    }
}
