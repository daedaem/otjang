package otjang.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.CatalogProduct;
import otjang.domain.CatalogRank;
import otjang.domain.Item;
import otjang.domain.Judge;
import otjang.service.CatalogService;
import otjang.service.WardrobeService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 사람이 직접 넣은 상품 목록과 그 안에서만 고르는 구매 추천. 서버는 상품·가격·재고·링크를 찾아오지 않는다.
 * GET /api/catalog (파일 모양), POST /api/catalog/import (파일, 멱등), GET/POST/PUT/DELETE /api/catalog/products, GET /api/catalog/rank, POST /api/catalog/products/{id}/candidate
 */
@RestController
@RequestMapping("/api/catalog")
public class CatalogController {
    private final CatalogService service;

    public CatalogController(CatalogService service) {
        this.service = service;
    }

    public record RankedDto(CatalogProduct product, int score, List<String> reasons, List<String> cautions, int added, List<CatalogRank.OverlapRef> overlaps, List<Judge.Blocker> blockers,
                            RulesController.Ref gap, boolean stale, boolean supported, List<RulesController.ComboDto> top3) {}

    @GetMapping
    public Map<String, Object> export() {
        return service.export();
    }

    @PostMapping("/import")
    public ResponseEntity<WardrobeService.ImportResult> importFile(@RequestBody String body, @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        WardrobeService.ImportResult r = service.importCatalog(Bodies.map(body), key, body);
        return ResponseEntity.ok().header("Idempotent-Replayed", String.valueOf(r.replayed())).body(r);
    }

    @GetMapping("/products")
    public List<CatalogProduct> list(@RequestParam(defaultValue = "false") boolean photos) {
        return service.all(photos);
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogProduct create(@RequestBody Map<String, Object> raw) {
        return service.save(raw);
    }

    @PutMapping("/products/{id}")
    public CatalogProduct replace(@PathVariable String id, @RequestBody Map<String, Object> raw) {
        raw.put("id", id);
        return service.save(raw);
    }

    @DeleteMapping("/products/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.delete(id);
    }

    /** gaps: template(기본값, 기본 옷장과 견준 빈틈) | none. staleDays 기본 14. */
    @GetMapping("/rank")
    public List<RankedDto> rank(@RequestParam(defaultValue = "") String season, @RequestParam(defaultValue = "template") String gaps, @RequestParam(required = false) Integer staleDays) {
        List<RankedDto> out = new ArrayList<>();
        for (CatalogRank.Ranked r : service.rank(season, gaps, staleDays)) {
            List<RulesController.ComboDto> top3 = new ArrayList<>();
            for (Judge.Pick p : r.top3()) top3.add(new RulesController.ComboDto(RulesController.Ref.of(p.top()), RulesController.Ref.of(p.bottom()), RulesController.Ref.of(p.outer()), p.score(), p.why(), p.dress()));
            out.add(new RankedDto(r.product(), r.score(), r.reasons(), r.cautions(), r.added(), r.overlaps(), r.blockers(), RulesController.Ref.of(r.gap()), r.stale(), r.supported(), top3));
        }
        return out;
    }

    @PostMapping("/products/{id}/candidate")
    @ResponseStatus(HttpStatus.CREATED)
    public Item toCandidate(@PathVariable String id) {
        return service.toCandidate(id);
    }
}
