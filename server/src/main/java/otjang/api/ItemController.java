package otjang.api;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.Item;
import otjang.domain.WardrobeOps;
import otjang.service.WardrobeService;

import java.util.List;
import java.util.Map;

/**
 * 옷 한 벌과 그 상태 바꾸기. 상태는 여기 있는 동작(사용자 동작)으로만 바뀐다.
 * 사진 상태: 내 사진(photo/own) → 상품 사진 임시 걸기(photo/product: substitute|candidate) → 확인(confirm) → 확인 취소(DELETE confirm) → 떼기(DELETE photo/product).
 */
@RestController
@RequestMapping("/api/items")
public class ItemController {
    private final WardrobeService service;

    public ItemController(WardrobeService service) {
        this.service = service;
    }

    public record OwnPhoto(String img) {}
    public record ProductPhoto(String kind, String img, String sourceName, String sourceUrl, String checkedAt, String brand, String name, String code, String evidence, String note, String at) {
        WardrobeOps.ProductPhotoInput input() {
            return new WardrobeOps.ProductPhotoInput(img, sourceName, sourceUrl, checkedAt, brand, name, code, evidence, note, at);
        }
    }
    public record Candidate(String brand, String name, String evidence, String note, String url) {}
    public record Look(String kind, String fabric) {}
    public record AttrSource(String attrSource) {}

    @GetMapping
    public List<Item> list(@RequestParam(defaultValue = "false") boolean photos) {
        return service.allItems(photos);
    }

    @GetMapping("/{id}")
    public Item one(@PathVariable String id) {
        return service.item(id);
    }

    /** 옷을 만들거나(없는 id) 통째로 덮어쓴다(있는 id). 본문은 옷장 파일의 옷 한 벌 모양. 모르는 항목은 버리고 빠진 항목은 기본값. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Item create(@RequestBody Map<String, Object> raw) {
        return service.save(raw);
    }

    @PutMapping("/{id}")
    public Item replace(@PathVariable String id, @RequestBody Map<String, Object> raw) {
        raw.put("id", id);
        return service.save(raw);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        service.delete(id);
    }

    @PutMapping("/{id}/photo/own")
    public Item ownPhoto(@PathVariable String id, @RequestBody OwnPhoto body) {
        return service.mutate(id, (it) -> WardrobeOps.setOwnPhoto(it, body.img()));
    }

    /** 상품 사진을 임시로 건다. kind 는 substitute(대체 이미지) 또는 candidate(미확인 후보). confirmed 는 여기서 만들 수 없다(400). */
    @PutMapping("/{id}/photo/product")
    public Item productPhoto(@PathVariable String id, @RequestBody ProductPhoto body) {
        return service.mutate(id, (it) -> WardrobeOps.setProductPhoto(it, body.kind() == null ? "" : body.kind(), body.input()));
    }

    @DeleteMapping("/{id}/photo/product")
    public Item clearProductPhoto(@PathVariable String id) {
        return service.mutate(id, WardrobeOps::clearProductPhoto);
    }

    @PostMapping("/{id}/candidates")
    public Item addCandidate(@PathVariable String id, @RequestBody Candidate c) {
        return service.mutate(id, (it) -> WardrobeOps.addCandidate(it, new Item.MatchCandidate(c.brand(), c.name(), c.evidence(), c.note(), c.url())));
    }

    @DeleteMapping("/{id}/candidates/{index}")
    public Item removeCandidate(@PathVariable String id, @PathVariable int index) {
        return service.mutate(id, (it) -> WardrobeOps.removeCandidate(it, index));
    }

    /** 사용자가 "같은 상품"이라고 확인했을 때만. 브랜드나 상품명이 있어야 한다(없으면 400). */
    @PostMapping("/{id}/confirm")
    public Item confirm(@PathVariable String id, @RequestBody ProductPhoto body) {
        return service.mutate(id, (it) -> WardrobeOps.confirmProduct(it, body.input()));
    }

    @DeleteMapping("/{id}/confirm")
    public Item unconfirm(@PathVariable String id) {
        return service.mutate(id, WardrobeOps::unconfirm);
    }

    @PutMapping("/{id}/look3d")
    public Item look3d(@PathVariable String id, @RequestBody Look look) {
        return service.mutate(id, (it) -> WardrobeOps.setLook3d(it, look.kind() == null ? null : new Item.Look3d(look.kind(), look.fabric())));
    }

    @PutMapping("/{id}/attr-source")
    public Item attrSource(@PathVariable String id, @RequestBody AttrSource body) {
        return service.mutate(id, (it) -> WardrobeOps.setAttrSource(it, body.attrSource()));
    }
}
