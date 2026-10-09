package verification.salu;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface TransactionProbeMapper {
    @Insert("INSERT INTO transaction_probe (token) VALUES (#{token})")
    int insert(String token);

    @Select("SELECT COUNT(*) FROM transaction_probe WHERE token LIKE CONCAT(#{prefix}, '%')")
    int count(@Param("prefix") String prefix);
}
