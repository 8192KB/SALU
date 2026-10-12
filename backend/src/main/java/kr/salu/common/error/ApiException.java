package kr.salu.common.error;

import org.springframework.http.HttpStatus;

public final class ApiException extends RuntimeException {
    private final HttpStatus status;
    private String code;

    private ApiException(HttpStatus status) {
        super(ApiError.forStatus(status.value()).message());
        this.status = status;
    }

    public static ApiException invalidRequest() { return new ApiException(HttpStatus.BAD_REQUEST); }
    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND); }
    public static ApiException conflict() { return new ApiException(HttpStatus.CONFLICT); }
    public static ApiException storageContextChanged() { var error = new ApiException(HttpStatus.CONFLICT); error.code = "STORAGE_CONTEXT_CHANGED"; return error; }
    public static ApiException unavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE); }
    public String code() { return code; }
    public HttpStatus status() { return status; }
}
