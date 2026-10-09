package kr.salu.auth;

import java.io.IOException;
import jakarta.servlet.http.HttpServletResponse;
import kr.salu.common.error.ApiError;
import tools.jackson.databind.ObjectMapper;

public final class AuthJson {
    private AuthJson() {}
    public static void error(HttpServletResponse response, ObjectMapper mapper, int status, String code, String message) throws IOException {
        body(response, mapper, status, new ApiError(code, message));
    }
    public static void body(HttpServletResponse response, ObjectMapper mapper, int status, Object body) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write(mapper.writeValueAsString(body));
    }
}
