package kr.salu.common.error;

import org.springframework.http.HttpStatus;

public final class ApiException extends RuntimeException {
    private final HttpStatus status;

    private ApiException(HttpStatus status) {
        super(ApiError.forStatus(status.value()).message());
        this.status = status;
    }

    public static ApiException invalidRequest() { return new ApiException(HttpStatus.BAD_REQUEST); }
    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND); }
    public static ApiException conflict() { return new ApiException(HttpStatus.CONFLICT); }
    public HttpStatus status() { return status; }
}
