package kr.salu.auth.social;

import java.util.Set;
import kr.salu.auth.MemberPrincipal;
import kr.salu.member.MemberMapper;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SocialIdentityService {
    private final SocialMapper mapper; private final MemberMapper members;
    public SocialIdentityService(SocialMapper mapper,MemberMapper members) { this.mapper=mapper; this.members=members; }
    @Transactional public MemberPrincipal resolve(String provider,String subject,String name,Long linkOwner) {
        if(!Set.of("google","naver").contains(provider) || subject==null || !subject.matches("[\\x21-\\x7E]{1,255}")) throw ApiException.invalidRequest();
        Long owner=mapper.find(provider,subject);
        if(linkOwner!=null) {
            if(mapper.activeLock(linkOwner)==null || (owner!=null && !owner.equals(linkOwner))) throw ApiException.conflict();
            if(owner==null) { if(mapper.link(provider,subject,linkOwner)!=1) throw ApiException.conflict(); owner=linkOwner; }
        } else if(owner==null) {
            String display=name==null || name.isBlank()?"SALU 회원":name.strip(); display=display.substring(0,display.offsetByCodePoints(0,Math.min(50,display.codePointCount(0,display.length()))));
            if(mapper.newMember(display)!=1) throw ApiException.conflict(); owner=mapper.newId();
            if(mapper.link(provider,subject,owner)!=1) throw ApiException.conflict();
        }
        var member=members.findById(owner);
        if(member==null || !"ACTIVE".equals(member.status())) throw ApiException.conflict();
        return new MemberPrincipal(member);
    }
}
