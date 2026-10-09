package kr.salu.health;

import kr.salu.auth.CsrfController;
import kr.salu.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({HealthController.class, CsrfController.class})
@Import(SecurityConfig.class)
class HealthSecurityTest {
    @Autowired MockMvc mvc;
    @org.springframework.test.context.bean.override.mockito.MockitoBean kr.salu.member.MemberMapper members;
    @org.springframework.test.context.bean.override.mockito.MockitoBean org.springframework.security.core.userdetails.UserDetailsService users;
    @MockitoBean HealthMapper mapper;

    @Test
    void healthIsPublicAndReportsActualProbe() throws Exception {
        when(mapper.ping()).thenReturn(1);
        mvc.perform(get("/api/health")).andExpect(status().isOk())
                .andExpect(jsonPath("$.server").value("UP"))
                .andExpect(jsonPath("$.database").value("UP"))
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void failedDatabaseReturns503WithoutConnectionDetails() throws Exception {
        when(mapper.ping()).thenThrow(new DataAccessResourceFailureException("password=private"));
        mvc.perform(get("/api/health")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.database").value("DOWN"))
                .andExpect(jsonPath("$.code").value("DATABASE_UNAVAILABLE"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private"))));
    }

    @Test
    void anonymousProtectedRequestReturnsJsonWithoutRedirect() throws Exception {
        mvc.perform(get("/api/records")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void unsafeRequestsRequireCsrfEvenBeforeAuthentication() throws Exception {
        mvc.perform(post("/api/records")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        mvc.perform(post("/api/records").with(user("member")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CSRF_INVALID"));
        mvc.perform(post("/api/records").with(csrf())).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void csrfEndpointCreatesSessionAndReturnsTokenForReact() throws Exception {
        mvc.perform(get("/api/csrf")).andExpect(status().isOk())
                .andExpect(jsonPath("$.headerName").value("X-CSRF-TOKEN"))
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(header().string("Cache-Control", "no-store"));
    }
}
