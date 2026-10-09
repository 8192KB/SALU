package kr.salu.common.error;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> domainError(ApiException exception) {
        return response(exception.status(), new HttpHeaders());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<Object> invalidInput() {
        return response(HttpStatus.BAD_REQUEST, new HttpHeaders());
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Object> duplicate() {
        return response(HttpStatus.CONFLICT, new HttpHeaders());
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> forbidden() {
        return response(HttpStatus.FORBIDDEN, new HttpHeaders());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception exception) {
        // 예외 원문에 SQL·비밀번호·입력값이 포함될 수 있어 타입과 발생 위치만 기록함
        StackTraceElement[] trace = exception.getStackTrace();
        log.error("서버 오류: type={}, at={}", exception.getClass().getName(),
                trace.length == 0 ? "unknown" : trace[0]);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, new HttpHeaders());
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return response(status, headers);
    }

    private ResponseEntity<Object> response(HttpStatusCode status, HttpHeaders originalHeaders) {
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(originalHeaders);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setCacheControl("no-store");
        return new ResponseEntity<>(ApiError.forStatus(status.value()), headers, status);
    }
}
