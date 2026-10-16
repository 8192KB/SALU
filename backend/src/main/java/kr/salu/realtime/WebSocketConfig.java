package kr.salu.realtime;

import java.security.Principal;
import java.util.Map;
import kr.salu.auth.MemberPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.security.core.Authentication;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

// 서버가 회원에게 "바뀌었으니 다시 불러오라"는 신호만 보내는 단방향 연결. 화면은 메시지를 보내지 않음
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    public static final String ENDPOINT = "/api/ws";
    public static final String EVENTS = "/queue/events";
    private final String publicOrigin;
    private TaskScheduler heartbeat;
    public WebSocketConfig(@Value("${salu.public-origin}") String publicOrigin) { this.publicOrigin = publicOrigin; }
    @Autowired void heartbeat(@Lazy TaskScheduler messageBrokerTaskScheduler) { this.heartbeat = messageBrokerTaskScheduler; }

    @Override public void registerStompEndpoints(StompEndpointRegistry registry) {
        // 연결 요청은 SecurityConfig의 로그인 규칙을 거침. 같은 출처와 공개 주소만 허용
        registry.addEndpoint(ENDPOINT).setHandshakeHandler(new MemberHandshake()).setAllowedOrigins(publicOrigin);
    }
    @Override public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue").setHeartbeatValue(new long[]{20000, 20000}).setTaskScheduler(heartbeat);
        registry.setUserDestinationPrefix("/user");
    }
    @Override public void configureClientInboundChannel(ChannelRegistration registration) { registration.interceptors(new InboundGuard()); }

    // 전송 대상 이름을 회원 ID로 맞춤. 기본값은 이메일이라 소셜 계정처럼 이메일이 없으면 어긋남
    static final class MemberHandshake extends DefaultHandshakeHandler {
        @Override protected Principal determineUser(ServerHttpRequest request, WebSocketHandler handler, Map<String, Object> attributes) {
            if (request.getPrincipal() instanceof Authentication auth && auth.getPrincipal() instanceof MemberPrincipal member) {
                String name = Long.toString(member.id());
                return () -> name;
            }
            return null;
        }
    }

    static final class InboundGuard implements ChannelInterceptor {
        @Override public Message<?> preSend(Message<?> message, MessageChannel channel) {
            var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
            if (accessor == null || accessor.getCommand() == null) return message;
            switch (accessor.getCommand()) {
                case CONNECT, STOMP -> { if (accessor.getUser() == null) throw new MessagingException("로그인이 필요합니다."); }
                case SUBSCRIBE -> { if (!("/user" + EVENTS).equals(accessor.getDestination())) throw new MessagingException("구독할 수 없는 주소입니다."); }
                case UNSUBSCRIBE, DISCONNECT -> { }
                default -> throw new MessagingException("지원하지 않는 요청입니다.");
            }
            return message;
        }
    }
}
