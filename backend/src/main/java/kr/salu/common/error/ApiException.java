package kr.salu.common.error;

import org.springframework.http.HttpStatus;

public final class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    private ApiException(HttpStatus status) { this(status, null, ApiError.forStatus(status.value()).message()); }
    private ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ApiException invalidRequest() { return new ApiException(HttpStatus.BAD_REQUEST); }
    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND); }
    public static ApiException conflict() { return new ApiException(HttpStatus.CONFLICT); }
    public static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN); }
    public static ApiException tooLarge() { return new ApiException(HttpStatus.CONTENT_TOO_LARGE); }
    public static ApiException unsupportedMedia() { return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE); }
    public static ApiException storageContextChanged() { return new ApiException(HttpStatus.CONFLICT, "STORAGE_CONTEXT_CHANGED", "로그인 상태를 다시 확인하세요."); }
    public static ApiException communitySuspended() { return new ApiException(HttpStatus.FORBIDDEN, "COMMUNITY_SUSPENDED", "커뮤니티 이용이 제한된 상태입니다."); }
    public static ApiException unavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE); }
    public String code() { return code; }
    public HttpStatus status() { return status; }
}
