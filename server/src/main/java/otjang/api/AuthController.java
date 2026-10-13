package otjang.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import otjang.security.AuthService;
import otjang.security.BetaUser;
import otjang.security.OwnerScope;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final Map<String, Attempts> attempts = new ConcurrentHashMap<>();
    public AuthController(AuthService auth) { this.auth = auth; }
    public record Register(String username, String password, String inviteCode) {}
    public record Login(String username, String password) {}
    private record Attempts(long start, int count) {}
    private void throttle(HttpServletRequest request) {
        long now = System.currentTimeMillis();
        if (attempts.size() > 10000) attempts.entrySet().removeIf(e -> now - e.getValue().start() > 60000);
        Attempts current = attempts.compute(request.getRemoteAddr(), (k, a) -> a == null || now - a.start() > 60000 ? new Attempts(now, 1) : new Attempts(a.start(), a.count() + 1));
        if (current.count() > 20) throw new ApiException(429, "잠시 후 다시 시도해 주세요");
    }
    @PostMapping("/register") public AuthService.Session register(@RequestBody Register body, HttpServletRequest request) {
        throttle(request); return auth.register(body.username(), body.password(), body.inviteCode());
    }
    @PostMapping("/login") public AuthService.Session login(@RequestBody Login body, HttpServletRequest request) {
        throttle(request); return auth.login(body.username(), body.password());
    }
    @GetMapping("/me") public BetaUser me() { return OwnerScope.user(); }
    @PostMapping("/logout") public ResponseEntity<Void> logout(@RequestHeader("Authorization") String header) {
        auth.logout(header.substring(7)); return ResponseEntity.noContent().build();
    }
}
