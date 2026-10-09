package kr.salu.health;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface HealthMapper {
    @Select("SELECT 1")
    @Options(timeout = 2)
    int ping();
}
