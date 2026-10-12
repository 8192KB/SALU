package kr.salu.auth.social;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.error.ApiException;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class SocialController {
    private final SocialClients clients; private final SocialMapper mapper;
    public SocialController(SocialClients clients,SocialMapper mapper) { this.clients=clients; this.mapper=mapper; }
    @GetMapping("/api/auth/oauth2/providers") ResponseEntity<List<String>> providers() { var result=new ArrayList<String>(); clients.forEach(c->result.add(c.getRegistrationId())); return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result); }
    @GetMapping("/api/auth/oauth2/linked") ResponseEntity<List<String>> linked(@AuthenticationPrincipal MemberPrincipal principal) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mapper.linked(principal.id())); }
    @PostMapping("/api/auth/oauth2/link/{provider}") ResponseEntity<Map<String,String>> link(@AuthenticationPrincipal MemberPrincipal principal,@RequestHeader("X-SALU-Storage-Context") String context,@PathVariable String provider,HttpServletRequest request) {
        if(!principal.storageContext().equals(context)) throw ApiException.storageContextChanged();
        if(clients.findByRegistrationId(provider)==null) throw ApiException.notFound();
        request.getSession().setAttribute(SocialFlow.LINK,new SocialFlow.Link(principal.id(),context,provider,System.currentTimeMillis()+300000,null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("url","/api/auth/oauth2/authorize/"+provider+"?link=1"));
    }
}
