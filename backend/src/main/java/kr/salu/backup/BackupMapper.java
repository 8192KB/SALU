package kr.salu.backup;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface BackupMapper {
    record Item(String clientId, long revision, String mutationId, String keyId, byte[] nonce, byte[] ciphertext) {}
    record Summary(String itemId, long revision) {}
    record Mutation(long revision, byte[] payloadHash) {}
    record Photo(String contentType, int byteSize, String keyId, byte[] nonce, byte[] ciphertext) {}
    @Select("SELECT id FROM members WHERE id=#{owner} AND status='ACTIVE' FOR UPDATE") Long lockOwner(long owner);
    @Select("SELECT client_id AS item_id,revision FROM personal_backup_items WHERE member_id=#{owner} ORDER BY client_id") List<Summary> list(long owner);
    @Select("SELECT client_id,revision,mutation_id,key_id,nonce,ciphertext FROM personal_backup_items WHERE member_id=#{owner} AND client_id=#{id}") Item get(long owner, String id);
    @Select("SELECT revision,payload_hash FROM personal_backup_mutations WHERE member_id=#{owner} AND client_id=#{id} AND mutation_id=#{mutation}") Mutation mutation(long owner, String id, String mutation);
    @Insert("INSERT INTO personal_backup_items(member_id,client_id,revision,mutation_id,key_id,nonce,ciphertext) VALUES(#{owner},#{id},1,#{mutation},#{data.keyId},#{data.nonce},#{data.ciphertext})") int insert(long owner, String id, String mutation, BackupCrypto.Encrypted data);
    @Update("UPDATE personal_backup_items SET revision=revision+1,mutation_id=#{mutation},key_id=#{data.keyId},nonce=#{data.nonce},ciphertext=#{data.ciphertext} WHERE member_id=#{owner} AND client_id=#{id} AND revision=#{revision}") int update(long owner, String id, long revision, String mutation, BackupCrypto.Encrypted data);
    @Insert("INSERT INTO personal_backup_mutations(member_id,client_id,mutation_id,revision,payload_hash) VALUES(#{owner},#{id},#{mutation},#{revision},#{hash})") int insertMutation(long owner, String id, String mutation, long revision, byte[] hash);
    @Select("SELECT content_type,byte_size,key_id,nonce,ciphertext FROM personal_backup_photos WHERE member_id=#{owner} AND client_id=#{id}") Photo photo(long owner, String id);
    @Select("SELECT COALESCE(SUM(byte_size),0) FROM personal_backup_photos WHERE member_id=#{owner}") long photoBytes(long owner);
    @Select("SELECT COUNT(*) FROM personal_backup_items WHERE member_id=#{owner}") int itemCount(long owner);
    @Insert("INSERT INTO personal_backup_photos(member_id,client_id,content_type,byte_size,key_id,nonce,ciphertext) VALUES(#{owner},#{id},#{type},#{size},#{data.keyId},#{data.nonce},#{data.ciphertext})") int insertPhoto(long owner, String id, String type, int size, BackupCrypto.Encrypted data);
    @Delete("DELETE FROM personal_backup_item_photos WHERE member_id=#{owner} AND item_id=#{id}") int clearReferences(long owner, String id);
    @Insert("INSERT INTO personal_backup_item_photos(member_id,item_id,photo_id) VALUES(#{owner},#{item},#{photo})") int reference(long owner, String item, String photo);
    @Delete("DELETE p FROM personal_backup_photos p WHERE p.member_id=#{owner} AND p.created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY AND NOT EXISTS(SELECT 1 FROM personal_backup_item_photos r WHERE r.member_id=p.member_id AND r.photo_id=p.client_id)") int cleanupPhotos(long owner);
}
