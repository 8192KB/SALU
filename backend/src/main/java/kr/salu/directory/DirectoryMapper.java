package kr.salu.directory;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface DirectoryMapper {
    record Salon(String id, String name, String region, String branch) {}
    record Profile(String id, String name, String introduction, String specialties, String visibility, String salonId, String salonName, String region, String branch) {}
    String PROFILE = "SELECT p.id,p.name,p.introduction,p.specialties,p.visibility,s.id AS salon_id,s.name AS salon_name,s.region,s.branch FROM designer_profiles p JOIN members m ON m.id=p.member_id LEFT JOIN designer_affiliations a ON a.designer_id=p.id LEFT JOIN salons s ON s.id=a.salon_id ";
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
}
