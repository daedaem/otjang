package otjang.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.Wardrobe;
import otjang.service.WardrobeService;

import java.util.List;
import java.util.Map;

/** 살까 말까 판정 기록. 본문은 옷장 파일의 decisions[] 한 건 모양(id, itemId, name, before{lean, reason, at}, summary{…}, after{…}). 같은 id 는 덮어쓴다. */
@RestController
@RequestMapping("/api/decisions")
public class DecisionController {
    private final WardrobeService service;

    public DecisionController(WardrobeService service) {
        this.service = service;
    }

    @GetMapping
    public List<Wardrobe.Decision> list() {
        return service.allDecisions();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Wardrobe.Decision save(@RequestBody Map<String, Object> raw) {
        return service.saveDecision(raw);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.deleteDecision(id);
    }
}
