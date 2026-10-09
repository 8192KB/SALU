package kr.salu.auth;

import java.util.Locale;
import kr.salu.member.MemberMapper;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;

@Service
public class MemberDetailsService implements UserDetailsService {
    private final MemberMapper mapper;
    public MemberDetailsService(MemberMapper mapper) { this.mapper = mapper; }
    @Override
    public UserDetails loadUserByUsername(String email) {
        try {
            var account = mapper.findByEmail(email.strip().toLowerCase(Locale.ROOT));
            if (account == null) throw new UsernameNotFoundException("인증 실패");
            return new MemberPrincipal(account);
        } catch (DataAccessException exception) {
            // 인증 필터의 오류 로그에 SQL·접속 정보가 전달되지 않도록 원인 예외 제외
            throw new InternalAuthenticationServiceException("인증 저장소 연결 실패");
        }
    }
}
