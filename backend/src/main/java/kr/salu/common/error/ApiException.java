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
    public static ApiException currentPasswordInvalid() { return new ApiException(HttpStatus.BAD_REQUEST, "CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인하세요."); }
    public static ApiException passwordNotSet() { return new ApiException(HttpStatus.CONFLICT, "PASSWORD_NOT_SET", "비밀번호 없이 소셜 계정으로 가입한 계정입니다."); }
    public static ApiException unavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE); }
    public static ApiException mailUnavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MAIL_UNAVAILABLE", "지금은 메일을 보낼 수 없습니다. 잠시 후 다시 시도하세요."); }
    public static ApiException resetTokenInvalid() { return new ApiException(HttpStatus.BAD_REQUEST, "RESET_TOKEN_INVALID", "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 요청하세요."); }
    public static ApiException paymentUnavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_UNAVAILABLE", "지금은 결제를 진행할 수 없습니다. 잠시 후 다시 시도하세요."); }
    public static ApiException paymentRejected() { return new ApiException(HttpStatus.BAD_REQUEST, "PAYMENT_REJECTED", "결제가 승인되지 않았습니다. 결제 수단을 확인한 뒤 다시 시도하세요."); }
    public static ApiException paymentMismatch() { return new ApiException(HttpStatus.CONFLICT, "PAYMENT_MISMATCH", "결제 정보가 상담과 맞지 않거나 이미 처리된 결제입니다."); }
    public static ApiException aiUnavailable() { return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_UNAVAILABLE", "AI 도우미를 지금 쓸 수 없습니다. 잠시 후 다시 시도하세요."); }
    public static ApiException aiRateLimited() { return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "AI_RATE_LIMITED", "AI 도우미 요청이 많습니다. 잠시 후 다시 시도하세요."); }
    public String code() { return code; }
    public HttpStatus status() { return status; }
}
