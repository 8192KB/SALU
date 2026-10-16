package kr.salu.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import kr.salu.common.error.ApiException;

// 다른 탭에서 계정이 바뀐 뒤 이전 계정 화면에서 쓴 글이 새 계정 이름으로 저장되지 않게 함
public final class StorageContext {
    public static final String HEADER = "X-SALU-Storage-Context";
    private StorageContext() {}
    public static void check(MemberPrincipal principal, String context) {
        if (context == null || !MessageDigest.isEqual(principal.storageContext().getBytes(StandardCharsets.UTF_8), context.getBytes(StandardCharsets.UTF_8))) throw ApiException.storageContextChanged();
    }
}
