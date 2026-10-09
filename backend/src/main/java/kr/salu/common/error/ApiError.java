package kr.salu.common.error;

public record ApiError(String code, String message) {
    public static ApiError forStatus(int status) {
        return switch (status) {
            case 400 -> new ApiError("INVALID_REQUEST", "입력 형식이나 필수 값을 확인하세요.");
            case 401 -> new ApiError("AUTHENTICATION_REQUIRED", "로그인이 필요합니다.");
            case 403 -> new ApiError("ACCESS_DENIED", "접근 권한이 없습니다.");
            case 404 -> new ApiError("RESOURCE_NOT_FOUND", "요청한 대상을 찾을 수 없습니다.");
            case 405 -> new ApiError("METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식입니다.");
            case 406 -> new ApiError("NOT_ACCEPTABLE", "지원하는 응답 형식을 요청하세요.");
            case 409 -> new ApiError("RESOURCE_CONFLICT", "이미 처리되었거나 중복된 요청입니다.");
            case 413 -> new ApiError("UPLOAD_TOO_LARGE", "업로드 허용 크기를 초과했습니다.");
            case 415 -> new ApiError("UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 입력 형식입니다.");
            case 500 -> new ApiError("INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다.");
            default -> new ApiError("REQUEST_FAILED", "요청을 처리할 수 없습니다.");
        };
    }
}
