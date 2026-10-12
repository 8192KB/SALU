package kr.salu.directory;

import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DirectoryService {
    public record SalonInput(@NotBlank @Size(max=100) String name, @NotBlank @Size(max=100) String region, @NotNull @Size(max=100) String branch) {}
    public record ProfileInput(@NotBlank @Size(max=100) String name, @NotBlank @Size(max=2000) String introduction,
        @NotNull @Size(max=10) List<@NotBlank @Size(max=40) String> specialties,
        @NotNull @Pattern(regexp="PUBLIC|PRIVATE") String visibility,
        @Pattern(regexp="[a-f0-9-]{36}") String salonId) {}
    private final DirectoryMapper mapper;
    public DirectoryService(DirectoryMapper mapper) { this.mapper=mapper; }
    @Transactional(readOnly=true) public List<DirectoryMapper.Salon> salons() { return mapper.salons(); }
    @Transactional(readOnly=true) public List<DirectoryMapper.Profile> profiles() { return mapper.profiles(); }
    @Transactional(readOnly=true) public DirectoryMapper.Profile profile(String id) { var p=mapper.publicProfile(id); if(p==null) throw ApiException.notFound(); return p; }
    @Transactional(readOnly=true) public DirectoryMapper.Profile own(long owner) { return mapper.ownProfile(owner); }
    private void active(long owner) { if(mapper.lockOwner(owner)==null) throw ApiException.notFound(); }
    @Transactional public DirectoryMapper.Salon createSalon(long owner, SalonInput input) {
        active(owner); String id=UUID.randomUUID().toString();
        if(mapper.insertSalon(id,input.name().trim(),input.region().trim(),input.branch().trim(),owner)!=1) throw ApiException.conflict();
        return mapper.salon(id);
    }
    @Transactional public DirectoryMapper.Profile save(long owner, ProfileInput input, boolean create) {
        active(owner); var previous=mapper.ownProfile(owner);
        if(create && previous!=null) throw ApiException.conflict();
        if(!create && previous==null) throw ApiException.notFound();
        if(input.salonId()!=null && mapper.salon(input.salonId())==null) throw ApiException.invalidRequest();
        String id=previous==null?UUID.randomUUID().toString():previous.id();
        String specialties=String.join(",",input.specialties().stream().map(String::trim).distinct().toList());
        int count=create?mapper.insertProfile(id,owner,input.name().trim(),input.introduction().trim(),specialties,input.visibility()):mapper.updateProfile(id,owner,input.name().trim(),input.introduction().trim(),specialties,input.visibility());
        if(count!=1) throw ApiException.conflict();
        mapper.clearAffiliation(id);
        if(input.salonId()!=null && mapper.insertAffiliation(id,input.salonId())!=1) throw ApiException.conflict();
        return mapper.ownProfile(owner);
    }
}
