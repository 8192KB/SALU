package kr.salu.common.error;

import kr.salu.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import verification.salu.ProbeController;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProbeController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class, ProbeController.class})
class GlobalExceptionHandlerTest {
    @Autowired MockMvc mvc;
    @org.springframework.test.context.bean.override.mockito.MockitoBean kr.salu.member.MemberMapper members;
    @org.springframework.test.context.bean.override.mockito.MockitoBean org.springframework.security.core.userdetails.UserDetailsService users;

    @Test
    void expectedErrorsShareJsonEnvelope() throws Exception {
        for (String[] sample : new String[][] {
                {"bad", "400", "INVALID_REQUEST"}, {"missing", "404", "RESOURCE_NOT_FOUND"},
                {"conflict", "409", "RESOURCE_CONFLICT"}, {"unexpected", "500", "INTERNAL_ERROR"}}) {
            mvc.perform(get("/__verify/errors/" + sample[0]).with(user("test")))
                    .andExpect(status().is(Integer.parseInt(sample[1])))
                    .andExpect(content().contentTypeCompatibleWith("application/json"))
                    .andExpect(jsonPath("$.code").value(sample[2]))
                    .andExpect(jsonPath("$.message").isNotEmpty())
                    .andExpect(content().string(not(containsString("never-expose-this"))))
                    .andExpect(header().string("Cache-Control", "no-store"));
        }
    }

    @Test
    void invalidBeanAndMalformedJsonReturn400() throws Exception {
        for (String body : new String[] {"{\"value\":\"\"}", "{"}) {
            mvc.perform(post("/__verify/validate").with(user("test")).with(csrf())
                    .contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
    }

    @Test
    void missingRouteAndWrongMethodRetainFrameworkStatus() throws Exception {
        mvc.perform(get("/__verify/no-such-route").with(user("test")))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        mvc.perform(get("/__verify/validate").with(user("test")))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"))
                .andExpect(header().string("Allow", containsString("POST")));
    }
}
