package kr.salu.auth;

import kr.salu.member.MemberMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MemberDetailsServiceTest {
    @Test void databaseExceptionDetailsNeverReachAuthenticationFilterLogs() {
        var mapper = mock(MemberMapper.class);
        when(mapper.findByEmail("user@example.test")).thenThrow(new DataAccessResourceFailureException("password=never-expose-this; SQL private"));
        assertThatThrownBy(() -> new MemberDetailsService(mapper).loadUserByUsername("user@example.test"))
            .isInstanceOf(InternalAuthenticationServiceException.class)
            .hasMessage("인증 저장소 연결 실패").hasNoCause();
    }
    @Test void authenticatedPrincipalErasesPasswordHash() {
        var principal = new MemberPrincipal(new kr.salu.member.MemberAccount(1L,"user@example.test","private-hash","member","ACTIVE"));
        principal.eraseCredentials();
        assertThat(principal.getPassword()).isNull();
        assertThat(principal.getAuthorities()).extracting(a -> a.getAuthority()).containsExactly("ROLE_MEMBER");
    }
}
