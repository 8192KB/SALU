package verification.salu;

import org.mybatis.spring.annotation.MapperScan;
import kr.salu.health.HealthMapper;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@TestConfiguration(proxyBeanMethods = false)
@MapperScan(basePackageClasses = {HealthMapper.class, kr.salu.member.MemberMapper.class, TransactionProbeMapper.class})
public class ProbeConfiguration {
    @Bean
    ProbeController probeController() { return new ProbeController(); }

    @Bean
    TransactionProbeController transactionProbeController(TransactionProbeService service) {
        return new TransactionProbeController(service);
    }

    @Bean
    @Order(0)
    SecurityFilterChain probeSecurity(HttpSecurity http) throws Exception {
        return http.securityMatcher("/__verify/**")
                .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll()).build();
    }

    @Bean
    TransactionProbeService transactionProbeService(TransactionProbeMapper mapper) {
        return new TransactionProbeService(mapper);
    }
}
