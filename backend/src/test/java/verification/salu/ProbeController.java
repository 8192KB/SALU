package verification.salu;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import kr.salu.common.error.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/__verify")
public class ProbeController {
    @GetMapping("/errors/{kind}")
    public void error(@PathVariable String kind) {
        switch (kind) {
            case "bad" -> throw ApiException.invalidRequest();
            case "missing" -> throw ApiException.notFound();
            case "conflict" -> throw ApiException.conflict();
            default -> throw new IllegalStateException("password=never-expose-this");
        }
    }

    @PostMapping("/validate")
    public Map<String, String> validate(@Valid @RequestBody Input input) {
        return Map.of("value", input.value());
    }

    public record Input(@NotBlank String value) {}
}
