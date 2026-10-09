package verification.salu;

import java.io.IOException;
import org.springframework.transaction.annotation.Transactional;

public class TransactionProbeService {
    private final TransactionProbeMapper mapper;

    public TransactionProbeService(TransactionProbeMapper mapper) { this.mapper = mapper; }

    @Transactional
    public void commit(String prefix) {
        mapper.insert(prefix + "-one");
        mapper.insert(prefix + "-two");
    }

    @Transactional
    public void runtimeFailure(String prefix) {
        mapper.insert(prefix + "-one");
        throw new IllegalStateException("검증용 중간 실패");
    }

    @Transactional(rollbackFor = IOException.class)
    public void checkedFailure(String prefix) throws IOException {
        mapper.insert(prefix + "-one");
        throw new IOException("검증용 checked exception");
    }

    @Transactional
    public void duplicateFailure(String prefix) {
        mapper.insert(prefix + "-one");
        mapper.insert(prefix + "-one");
    }
}
