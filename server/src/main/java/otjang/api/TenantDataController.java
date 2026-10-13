package otjang.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import otjang.service.TenantDataService;
import java.util.Map;

@RestController
public class TenantDataController {
    private final TenantDataService data;
    public TenantDataController(TenantDataService data) {this.data=data;}
    public record Restore(Map<String,Object> backup,boolean confirmReplace){}
    public record DeleteAccount(String password){}
    @GetMapping("/api/backup") public Map<String,Object> backup(){return data.backup();}
    @PostMapping("/api/backup/restore") public Map<String,Object> restore(@RequestBody Restore body){return data.restore(body.backup(),body.confirmReplace());}
    @DeleteMapping("/api/account") public ResponseEntity<Void> delete(@RequestBody DeleteAccount body){data.deleteAccount(body.password());return ResponseEntity.noContent().build();}
}
