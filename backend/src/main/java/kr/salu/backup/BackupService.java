package kr.salu.backup;

import java.util.*;
import java.security.MessageDigest;
import kr.salu.auth.MemberPrincipal;
import kr.salu.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.*;

@Service
public class BackupService {
    public record Change(long expectedRevision, String mutationId, JsonNode payload, List<String> photoIds) {}
    public record Saved(long revision) {}
    public record Content(long revision, String mutationId, JsonNode payload) {}
    private final BackupMapper mapper; private final BackupCrypto crypto; private final ObjectMapper json; private final BackupPayloadValidator validator;
    public BackupService(BackupMapper mapper, BackupCrypto crypto, ObjectMapper json, BackupPayloadValidator validator) { this.mapper=mapper; this.crypto=crypto; this.json=json; this.validator=validator; }
    private long owner(MemberPrincipal principal, String context) { if (principal == null || context == null || !MessageDigest.isEqual(principal.storageContext().getBytes(java.nio.charset.StandardCharsets.UTF_8), context.getBytes(java.nio.charset.StandardCharsets.UTF_8))) throw ApiException.storageContextChanged(); return principal.id(); }
    private void id(String id) { if (id == null || !id.matches("[A-Za-z0-9_-]{1,128}")) throw ApiException.invalidRequest(); }
    private String aad(long owner, String kind, String id) { return "salu:v1:" + owner + ":" + kind + ":" + id; }
    @Transactional(readOnly=true) public List<BackupMapper.Summary> list(MemberPrincipal principal, String context) { return mapper.list(owner(principal, context)); }
    @Transactional(readOnly=true) public Content get(MemberPrincipal principal, String context, String id) { id(id); long owner=owner(principal,context); var item=mapper.get(owner,id); if(item==null) throw ApiException.notFound(); return new Content(item.revision(),item.mutationId(),json.readTree(crypto.decrypt(item.keyId(),item.nonce(),item.ciphertext(),aad(owner,"item",id)))); }
    @Transactional public Saved put(MemberPrincipal principal, String context, String id, Change change) {
        id(id); long owner=owner(principal,context);
        if(change == null || change.expectedRevision()<0 || change.mutationId()==null || !change.mutationId().matches("[A-Za-z0-9_-]{1,100}") || change.payload()==null || !change.payload().isObject() || change.payload().path("version").asInt()!=1 || change.photoIds()==null || change.photoIds().size()>1000) throw ApiException.invalidRequest();
        byte[] bytes=json.writeValueAsBytes(change.payload()); if(bytes.length>2*1024*1024) throw ApiException.invalidRequest();
        validator.validate(change.payload());
        var refs = new HashSet<String>(); validateTree(change.payload(),refs,0);
        if(!refs.equals(new HashSet<>(change.photoIds())) || refs.size()!=change.photoIds().size()) throw ApiException.invalidRequest();
        if(mapper.lockOwner(owner)==null) throw new org.springframework.security.access.AccessDeniedException("계정 확인 필요");
        byte[] hash; try { hash=MessageDigest.getInstance("SHA-256").digest(bytes); } catch(Exception e) { throw new IllegalStateException(); }
        var mutation=mapper.mutation(owner,id,change.mutationId());
        if(mutation!=null) { if(!MessageDigest.isEqual(hash,mutation.payloadHash())) throw ApiException.conflict(); return new Saved(mutation.revision()); }
        for(String photoId:refs) if(mapper.photo(owner,photoId)==null) throw ApiException.invalidRequest();
        var current=mapper.get(owner,id); long revision=current==null?0:current.revision(); if(revision!=change.expectedRevision()) throw ApiException.conflict();
        var encrypted=crypto.encrypt(bytes,aad(owner,"item",id));
        if(current==null) { if(mapper.itemCount(owner)>=2000) throw ApiException.invalidRequest(); if(mapper.insert(owner,id,change.mutationId(),encrypted)!=1) throw ApiException.conflict(); }
        else if(mapper.update(owner,id,revision,change.mutationId(),encrypted)!=1) throw ApiException.conflict();
        if(mapper.insertMutation(owner,id,change.mutationId(),revision+1,hash)!=1) throw ApiException.conflict();
        mapper.clearReferences(owner,id);
        for(String photoId:refs) if(mapper.reference(owner,id,photoId)!=1) throw ApiException.conflict();
        return new Saved(revision+1);
    }
    private void validateTree(JsonNode node, Set<String> photos, int depth) {
        if(depth>25) throw ApiException.invalidRequest();
        if(node.isTextual() && node.asString().length()>10000) throw ApiException.invalidRequest();
        if(node.isObject()) {
            if(node.has("url")) { if(!node.path("url").asString().isEmpty() || !node.has("caption") || !node.has("id")) throw ApiException.invalidRequest(); String photoId=node.path("id").asString(); id(photoId); if(photoId.length()>100) throw ApiException.invalidRequest(); photos.add(photoId); }
            for(var entry:node.properties()) validateTree(entry.getValue(),photos,depth+1);
        } else if(node.isArray()) { if(node.size()>10000) throw ApiException.invalidRequest(); for(var value:node) validateTree(value,photos,depth+1); }
    }
    @Transactional(readOnly=true) public BackupMapper.Photo photo(MemberPrincipal principal, String context, String id) { id(id); long owner=owner(principal,context); var photo=mapper.photo(owner,id); if(photo==null) throw ApiException.notFound(); return new BackupMapper.Photo(photo.contentType(),photo.byteSize(),null,null,crypto.decrypt(photo.keyId(),photo.nonce(),photo.ciphertext(),aad(owner,"photo",id))); }
    @Transactional public void putPhoto(MemberPrincipal principal, String context, String id, String type, byte[] bytes) {
        id(id); long owner=owner(principal,context);
        if(id.length()>100 || bytes.length>kr.salu.common.PhotoCheck.MAX_BYTES || !kr.salu.common.PhotoCheck.readable(type,bytes)) throw ApiException.invalidRequest();
        if(mapper.lockOwner(owner)==null) throw new org.springframework.security.access.AccessDeniedException("계정 확인 필요"); mapper.cleanupPhotos(owner); var old=mapper.photo(owner,id);
        if(old!=null) { if(!old.contentType().equals(type) || !MessageDigest.isEqual(crypto.decrypt(old.keyId(),old.nonce(),old.ciphertext(),aad(owner,"photo",id)),bytes)) throw ApiException.conflict(); return; }
        if(mapper.photoBytes(owner)+bytes.length>128*1024*1024) throw ApiException.invalidRequest();
        if(mapper.insertPhoto(owner,id,type,bytes.length,crypto.encrypt(bytes,aad(owner,"photo",id)))!=1) throw ApiException.conflict();
    }
}
