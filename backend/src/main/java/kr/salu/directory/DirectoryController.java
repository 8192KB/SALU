package kr.salu.directory;

import java.util.List;
import jakarta.validation.Valid;
import kr.salu.auth.MemberPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;

@RestController
public class DirectoryController {
    private final DirectoryService service;
    public DirectoryController(DirectoryService service) { this.service=service; }
    @GetMapping("/api/salons") List<DirectoryMapper.Salon> salons() { return service.salons(); }
    @GetMapping("/api/designers") List<DirectoryMapper.Profile> profiles() { return service.profiles(); }
    @GetMapping("/api/designers/{id}") DirectoryMapper.Profile profile(@PathVariable String id) { return service.profile(id); }
    @GetMapping("/api/designers/{id}/affiliations") List<DirectoryService.AffiliationView> affiliations(@PathVariable String id) { return service.affiliations(id); }
    @GetMapping("/api/my/favorite-designers") ResponseEntity<List<DirectoryMapper.Profile>> favorites(@AuthenticationPrincipal MemberPrincipal member) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.favorites(member.id())); }
    @PutMapping("/api/my/favorite-designers/{id}") ResponseEntity<Void> addFavorite(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { service.addFavorite(member.id(),id); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
    @DeleteMapping("/api/my/favorite-designers/{id}") ResponseEntity<Void> removeFavorite(@AuthenticationPrincipal MemberPrincipal member, @PathVariable String id) { service.removeFavorite(member.id(),id); return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build(); }
    @PostMapping("/api/salons") ResponseEntity<DirectoryMapper.Salon> createSalon(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody DirectoryService.SalonInput input) { return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.createSalon(member.id(),input)); }
    @GetMapping("/api/my/designer-profile") ResponseEntity<DirectoryMapper.Profile> own(@AuthenticationPrincipal MemberPrincipal member) { var profile=service.own(member.id()); return profile==null?ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build():ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(profile); }
    @PostMapping("/api/my/designer-profile") ResponseEntity<DirectoryMapper.Profile> create(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody DirectoryService.ProfileInput input) { return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.save(member.id(),input,true)); }
    @PutMapping("/api/my/designer-profile") ResponseEntity<DirectoryMapper.Profile> update(@AuthenticationPrincipal MemberPrincipal member, @Valid @RequestBody DirectoryService.ProfileInput input) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.save(member.id(),input,false)); }
}
