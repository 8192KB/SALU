package verification.salu;

import java.io.IOException;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TransactionProbeController {
    private final TransactionProbeService service;

    public TransactionProbeController(TransactionProbeService service) { this.service = service; }

    @PostMapping("/__verify/transaction/{kind}")
    public Map<String, String> write(@PathVariable String kind, @RequestParam String prefix) throws IOException {
        switch (kind) {
            case "commit" -> service.commit(prefix);
            case "runtime" -> service.runtimeFailure(prefix);
            case "checked" -> service.checkedFailure(prefix);
            case "duplicate" -> service.duplicateFailure(prefix);
            default -> throw kr.salu.common.error.ApiException.notFound();
        }
        return Map.of("status", "committed");
    }
}
