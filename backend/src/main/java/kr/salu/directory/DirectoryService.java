package kr.salu.directory;

import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DirectoryService {
    public record SalonInput(@NotBlank @Size(max=100) String name, @NotBlank @Size(max=100) String region, @NotNull @Size(max=100) String branch,
        @Size(max=200) String address, @DecimalMin("33") @DecimalMax("39") Double latitude, @DecimalMin("124") @DecimalMax("132") Double longitude) {}
    public record LocationInput(@NotBlank @Size(max=200) String address, @NotNull @DecimalMin("33") @DecimalMax("39") Double latitude, @NotNull @DecimalMin("124") @DecimalMax("132") Double longitude) {}
    public record ProfileInput(@NotBlank @Size(max=100) String name, @NotBlank @Size(max=2000) String introduction,
        @NotNull @Size(max=10) List<@NotBlank @Size(max=40) String> specialties,
        @NotNull @Pattern(regexp="PUBLIC|PRIVATE") String visibility,
        @Pattern(regexp="[a-f0-9-]{36}") String salonId,
        @Min(0) @Max(100000) Integer consultationFee) {}
    private final DirectoryMapper mapper;
    public DirectoryService(DirectoryMapper mapper) { this.mapper=mapper; }
    @Transactional(readOnly=true) public List<DirectoryMapper.Salon> salons() { return mapper.salons(); }
    @Transactional(readOnly=true) public List<DirectoryMapper.Profile> profiles() { return mapper.profiles(); }
    @Transactional(readOnly=true) public DirectoryMapper.Profile profile(String id) { var p=mapper.publicProfile(id); if(p==null) throw ApiException.notFound(); return p; }
    @Transactional(readOnly=true) public DirectoryMapper.Profile own(long owner) { return mapper.ownProfile(owner); }
    private void active(long owner) { if(mapper.lockOwner(owner)==null) throw ApiException.notFound(); }
    @Transactional public DirectoryMapper.Salon createSalon(long owner, SalonInput input) {
        active(owner); String id=UUID.randomUUID().toString();
        // 위치는 주소·좌표가 함께 있거나 함께 없음
        boolean located=input.address()!=null && !input.address().isBlank();
        if(located!=(input.latitude()!=null) || located!=(input.longitude()!=null)) throw ApiException.invalidRequest();
        if(mapper.insertSalon(id,input.name().trim(),input.region().trim(),input.branch().trim(),located?input.address().trim():null,input.latitude(),input.longitude(),owner)!=1) throw ApiException.conflict();
        return mapper.salon(id);
    }
    // 위치는 미용실을 등록한 회원만 바꿈. 남의 미용실은 있는지도 알리지 않음
    @Transactional public DirectoryMapper.Salon updateLocation(long owner, String id, LocationInput input) {
        active(owner);
        if(!kr.salu.common.Inputs.uuid(id) || mapper.updateLocation(id,owner,input.address().trim(),input.latitude(),input.longitude())!=1) throw ApiException.notFound();
        return mapper.salon(id);
    }
    @Transactional public DirectoryMapper.Profile save(long owner, ProfileInput input, boolean create) {
        active(owner); var previous=mapper.ownProfile(owner);
        if(create && previous!=null) throw ApiException.conflict();
        if(!create && previous==null) throw ApiException.notFound();
        if(input.salonId()!=null && mapper.salon(input.salonId())==null) throw ApiException.invalidRequest();
        String id=previous==null?UUID.randomUUID().toString():previous.id();
        String specialties=String.join(",",input.specialties().stream().map(String::trim).distinct().toList());
        // 상담 요금은 천원 단위. 보내지 않으면 무료(docs/payment-api.md)
        int fee=input.consultationFee()==null?0:input.consultationFee();
        if(fee%1000!=0) throw ApiException.invalidRequest();
        int count=create?mapper.insertProfile(id,owner,input.name().trim(),input.introduction().trim(),specialties,input.visibility(),fee):mapper.updateProfile(id,owner,input.name().trim(),input.introduction().trim(),specialties,input.visibility(),fee);
        if(count!=1) throw ApiException.conflict();
        mapper.clearAffiliation(id);
        if(input.salonId()!=null && mapper.insertAffiliation(id,input.salonId())!=1) throw ApiException.conflict();
        // 소속이 바뀌면 지난 기간을 닫고 새 기간을 엶. 열린 기간은 DB UNIQUE로 하나만 허용
        String before=previous==null?null:previous.salonId();
        if(!java.util.Objects.equals(before,input.salonId())) {
            mapper.closeHistory(id);
            if(input.salonId()!=null && mapper.openHistory(id,input.salonId())!=1) throw ApiException.conflict();
        }
        return mapper.ownProfile(owner);
    }
    public record AffiliationView(String salonId, String salonName, String region, String branch, String startedAt, String endedAt) {}
    @Transactional(readOnly=true) public List<AffiliationView> affiliations(String id) {
        profile(id);
        return mapper.history(id).stream().map(a -> new AffiliationView(a.salonId(),a.salonName(),a.region(),a.branch(),kr.salu.common.Inputs.time(a.startedAt()),kr.salu.common.Inputs.time(a.endedAt()))).toList();
    }
    @Transactional(readOnly=true) public List<DirectoryMapper.Profile> favorites(long member) { return mapper.favorites(member); }
    // 찜은 공개 프로필만, 내 프로필은 찜하지 않음. 이미 찜했으면 그대로 성공
    @Transactional public void addFavorite(long member, String designer) {
        if(!kr.salu.common.Inputs.uuid(designer) || mapper.publicProfile(designer)==null) throw ApiException.notFound();
        Long owner=mapper.profileOwner(designer);
        if(owner!=null && owner==member) throw ApiException.invalidRequest();
        mapper.addFavorite(member,designer);
    }
    @Transactional public void removeFavorite(long member, String designer) {
        if(!kr.salu.common.Inputs.uuid(designer)) throw ApiException.notFound();
        mapper.removeFavorite(member,designer);
    }
}
