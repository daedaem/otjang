package otjang.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.Vocab;
import otjang.domain.Wardrobe;
import otjang.domain.WardrobeOps;
import otjang.service.WardrobeService;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 옷장 전체. GET /api/wardrobe 는 저장된 상태(보유·후보·처분 모두, 사진 포함), /export 는 옷장 파일(스키마 2, 보유 옷만, 선택 옵션),
 * /import 는 옷장 파일(스키마 1·2) 가져오기(멱등: Idempotency-Key).
 */
@RestController
@RequestMapping("/api/wardrobe")
public class WardrobeController {
    private final WardrobeService service;

    public WardrobeController(WardrobeService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> state(@RequestParam(defaultValue = "true") boolean photos) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schema", Vocab.SCHEMA); out.put("owner", service.owner()); out.put("items", service.allItems(photos)); out.put("decisions", service.allDecisions());
        return out;
    }

    @GetMapping("/owner")
    public Wardrobe.Owner owner() {
        return service.owner();
    }

    @PutMapping("/owner")
    public Wardrobe.Owner updateOwner(@RequestBody Map<String, Object> raw) {
        return service.updateOwner(raw);
    }

    @GetMapping("/export")
    public Map<String, Object> export(@RequestParam(defaultValue = "true") boolean img, @RequestParam(defaultValue = "false") boolean otherImg, @RequestParam(defaultValue = "false") boolean cands,
                                      @RequestParam(defaultValue = "false") boolean price, @RequestParam(defaultValue = "false") boolean body, @RequestParam(defaultValue = "false") boolean log) {
        return service.export(new WardrobeOps.ExportOptions(img, otherImg, cands, price, body, log));
    }

    @PostMapping("/import")
    public ResponseEntity<WardrobeService.ImportResult> importFile(@RequestBody String body, @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        WardrobeService.ImportResult r = service.importWardrobe(Bodies.map(body), key, body);
        return ResponseEntity.ok().header("Idempotent-Replayed", String.valueOf(r.replayed())).body(r);
    }
}
