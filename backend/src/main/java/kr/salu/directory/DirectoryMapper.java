package kr.salu.directory;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface DirectoryMapper {
    record Salon(String id, String name, String region, String branch) {}
    record Profile(String id, String name, String introduction, String specialties, String visibility, String salonId, String salonName, String region, String branch, int reviewCount, Double averageRating) {}
    record Affiliation(String salonId, String salonName, String region, String branch, java.time.Instant startedAt, java.time.Instant endedAt) {}
    // 열 순서가 Profile 생성자 순서와 같아야 함
    String PROFILE = "SELECT p.id,p.name,p.introduction,p.specialties,p.visibility,s.id AS salon_id,s.name AS salon_name,s.region,s.branch,"
        + "(SELECT COUNT(*) FROM designer_reviews r WHERE r.designer_id=p.id) AS review_count,(SELECT ROUND(AVG(r.rating),1) FROM designer_reviews r WHERE r.designer_id=p.id) AS average_rating "
        + "FROM designer_profiles p JOIN members m ON m.id=p.member_id LEFT JOIN designer_affiliations a ON a.designer_id=p.id LEFT JOIN salons s ON s.id=a.salon_id ";
    @Select("SELECT id FROM members WHERE id=#{owner} AND status='ACTIVE' FOR UPDATE") Long lockOwner(long owner);
    @Select("SELECT id,name,region,branch FROM salons ORDER BY name,region,branch LIMIT 500") List<Salon> salons();
    @Select("SELECT id,name,region,branch FROM salons WHERE id=#{id}") Salon salon(String id);
    @Insert("INSERT INTO salons(id,name,region,branch,created_by) VALUES(#{id},#{name},#{region},#{branch},#{owner})") int insertSalon(String id, String name, String region, String branch, long owner);
    @Select(PROFILE + "WHERE p.visibility='PUBLIC' AND m.status='ACTIVE' ORDER BY p.name,p.id LIMIT 500") List<Profile> profiles();
    @Select(PROFILE + "WHERE p.id=#{id} AND p.visibility='PUBLIC' AND m.status='ACTIVE'") Profile publicProfile(String id);
    @Select(PROFILE + "WHERE p.member_id=#{owner} AND m.status='ACTIVE'") Profile ownProfile(long owner);
    @Insert("INSERT INTO designer_profiles(id,member_id,name,introduction,specialties,visibility) VALUES(#{id},#{owner},#{name},#{introduction},#{specialties},#{visibility})") int insertProfile(String id, long owner, String name, String introduction, String specialties, String visibility);
    @Update("UPDATE designer_profiles SET name=#{name},introduction=#{introduction},specialties=#{specialties},visibility=#{visibility} WHERE id=#{id} AND member_id=#{owner}") int updateProfile(String id, long owner, String name, String introduction, String specialties, String visibility);
    @Delete("DELETE FROM designer_affiliations WHERE designer_id=#{id}") int clearAffiliation(String id);
    @Insert("INSERT INTO designer_affiliations(designer_id,salon_id) VALUES(#{id},#{salon})") int insertAffiliation(String id, String salon);
    @Update("UPDATE designer_affiliation_history SET ended_at=CURRENT_TIMESTAMP(6) WHERE designer_id=#{id} AND ended_at IS NULL") int closeHistory(String id);
    @Insert("INSERT INTO designer_affiliation_history(designer_id,salon_id) VALUES(#{id},#{salon})") int openHistory(String id, String salon);
    @Select("SELECT h.salon_id,s.name AS salon_name,s.region,s.branch,h.started_at,h.ended_at FROM designer_affiliation_history h JOIN salons s ON s.id=h.salon_id WHERE h.designer_id=#{id} ORDER BY h.started_at DESC,h.id DESC LIMIT 50") List<Affiliation> history(String id);
    @Select(PROFILE + "JOIN designer_favorites f ON f.designer_id=p.id WHERE f.member_id=#{member} AND p.visibility='PUBLIC' AND m.status='ACTIVE' ORDER BY f.created_at DESC,p.id LIMIT 500") List<Profile> favorites(long member);
    @Insert("INSERT INTO designer_favorites(member_id,designer_id) VALUES(#{member},#{designer}) ON DUPLICATE KEY UPDATE designer_id=designer_id") int addFavorite(long member, String designer);
    @Delete("DELETE FROM designer_favorites WHERE member_id=#{member} AND designer_id=#{designer}") int removeFavorite(long member, String designer);
    @Select("SELECT member_id FROM designer_profiles WHERE id=#{id}") Long profileOwner(String id);
}
