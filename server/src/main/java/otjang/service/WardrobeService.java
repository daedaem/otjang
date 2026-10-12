package otjang.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import otjang.api.ApiException;
import otjang.domain.Item;
import otjang.domain.Sanitize;
import otjang.domain.Vocab;
import otjang.domain.Wardrobe;
import otjang.domain.WardrobeCleaner;
import otjang.domain.WardrobeOps;
import otjang.persistence.DecisionEntity;
import otjang.persistence.DecisionRepository;
import otjang.persistence.ImportReceiptEntity;
import otjang.persistence.ImportReceiptRepository;
import otjang.persistence.ItemEntity;
import otjang.persistence.ItemRepository;
import otjang.persistence.OwnerEntity;
import otjang.persistence.OwnerRepository;
import otjang.store.LocalDirPhotoStore;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;

/**
 * 옷장(옷·판정 기록·주인) 저장과 가져오기·내보내기. 로컬 한 사람(owner 1)으로 시작한다.
 * 가져오기는 멱등이다: 같은 Idempotency-Key 와 같은 내용이면 저장된 응답을 그대로 돌려주고 다시 쓰지 않는다. 키가 없어도 (owner, client_id) 유일 제약으로 같은 옷은 덮어쓰기만 된다.
 */
@Service
public class WardrobeService {
    /** 로컬 개인판의 주인. V1 마이그레이션이 미리 만든다. */
    public static final long OWNER_ID = 1L;

    private final OwnerRepository owners;
    private final ItemRepository items;
    private final DecisionRepository decisions;
    private final ImportReceiptRepository receipts;
    private final ItemMapper mapper;

    public WardrobeService(OwnerRepository owners, ItemRepository items, DecisionRepository decisions, ImportReceiptRepository receipts, ItemMapper mapper) {
        this.owners = owners; this.items = items; this.decisions = decisions; this.receipts = receipts; this.mapper = mapper;
    }

    public record ImportResult(int items, int created, int updated, int decisions, boolean replayed) {}

    /** 가져오기 결과를 jsonb 영수증에 넣기 위한 작은 JSON. */
    static String toJson(ImportResult r) {
        return "{\"items\":" + r.items() + ",\"created\":" + r.created() + ",\"updated\":" + r.updated() + ",\"decisions\":" + r.decisions() + "}";
    }

    static ImportResult fromJson(String json) {
        Map<String, Double> m = Json.parseNumberMap(json);
        return new ImportResult(m.getOrDefault("items", 0.0).intValue(), m.getOrDefault("created", 0.0).intValue(), m.getOrDefault("updated", 0.0).intValue(), m.getOrDefault("decisions", 0.0).intValue(), true);
    }

    @Transactional(readOnly = true)
    public Wardrobe.Owner owner() {
        OwnerEntity o = owners.findById(OWNER_ID).orElseThrow(() -> new ApiException(500, "owner 1 이 없다. V1 마이그레이션이 적용됐는지 확인한다"));
        return new Wardrobe.Owner(o.getNickname(), o.getHeight() == null ? null : o.getHeight().doubleValue(), o.getTopSize(), o.getBottomSize());
    }

    @Transactional
    public Wardrobe.Owner updateOwner(Map<String, Object> raw) {
        OwnerEntity o = owners.findById(OWNER_ID).orElseThrow(() -> new ApiException(500, "owner 1 이 없다"));
        if (raw.containsKey("nickname")) o.setNickname(Sanitize.str(raw.get("nickname"), 30));
        if (raw.containsKey("height")) { Double h = Sanitize.num(raw.get("height"), 100, 230); o.setHeight(h == null ? null : BigDecimal.valueOf(h)); }
        if (raw.containsKey("topSize")) o.setTopSize(Sanitize.str(raw.get("topSize"), 20));
        if (raw.containsKey("bottomSize")) o.setBottomSize(Sanitize.str(raw.get("bottomSize"), 20));
        o.touch();
        return owner();
    }

    /** 모든 옷(보유·후보·처분). withPhotos=false 면 사진 data URL 을 비운다(목록 화면용). */
    @Transactional(readOnly = true)
    public List<Item> allItems(boolean withPhotos) {
        List<Item> out = new ArrayList<>();
        for (ItemEntity e : items.findAllByOwner(OWNER_ID)) out.add(mapper.toDomain(e, withPhotos));
        return out;
    }

    @Transactional(readOnly = true)
    public Item item(String clientId) {
        return mapper.toDomain(entity(clientId), true);
    }

    private ItemEntity entity(String clientId) {
        return items.findByOwnerIdAndClientId(OWNER_ID, clientId).orElseThrow(() -> new ApiException(404, "그런 옷이 없다: " + clientId));
    }

    /** 옷 한 벌을 정리해 저장한다(같은 id 가 있으면 덮어쓴다). 정리 결과가 null 이면 400. */
    @Transactional
    public Item save(Map<String, Object> raw) {
        Item it = WardrobeCleaner.cleanItem(raw, 0);
        if (it == null) throw new ApiException(400, "옷으로 읽을 수 없다(cat 이 outer/top/bottom/shoes 가운데 하나여야 한다)");
        return mapper.toDomain(items.save(mapper.apply(it, items.findByOwnerIdAndClientId(OWNER_ID, it.id()).orElseGet(ItemEntity::new), OWNER_ID)), true);
    }

    /** 이미 정리된 옷을 저장한다(같은 id 가 있으면 덮어쓴다). */
    @Transactional
    public Item saveItem(Item it) {
        return mapper.toDomain(items.save(mapper.apply(it, items.findByOwnerIdAndClientId(OWNER_ID, it.id()).orElseGet(ItemEntity::new), OWNER_ID)), true);
    }

    @Transactional
    public void delete(String clientId) {
        items.delete(entity(clientId));
    }

    /** 사용자 동작으로 상태를 바꾼다(WardrobeOps). 바뀐 옷을 저장하고 돌려준다. */
    @Transactional
    public Item mutate(String clientId, UnaryOperator<Item> op) {
        ItemEntity e = entity(clientId);
        Item before = mapper.toDomain(e, true);
        Item after;
        try { after = op.apply(before); } catch (IllegalArgumentException ex) { throw new ApiException(400, ex.getMessage()); }
        return mapper.toDomain(items.save(mapper.apply(after, e, OWNER_ID)), true);
    }

    /**
     * 옷장 파일(스키마 1·2)을 가져온다. 같은 client id 는 덮어쓰고(updated), 없던 것은 만든다(created). 구매 후보·처분 옷도 그대로 들어간다.
     * idempotencyKey 가 있으면 영수증을 남기고, 같은 키가 다시 오면 내용 해시가 같을 때 저장된 결과를 돌려주고 다를 때 409.
     */
    @Transactional
    public ImportResult importWardrobe(Map<String, Object> raw, String idempotencyKey, String rawBodyForHash) {
        String hash = LocalDirPhotoStore.sha256(rawBodyForHash == null ? String.valueOf(raw) : rawBodyForHash);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            var prev = receipts.findByOwnerIdAndIdempotencyKey(OWNER_ID, idempotencyKey);
            if (prev.isPresent()) {
                if (!prev.get().getRequestHash().equals(hash)) throw new ApiException(409, "같은 Idempotency-Key 로 다른 내용이 왔다");
                return fromJson(prev.get().getResponse());
            }
        }
        Wardrobe w = WardrobeCleaner.cleanWardrobe(raw);
        if (w == null) throw new ApiException(400, "옷장 파일이 아니다(schema 1 또는 2, items 배열이 있어야 한다)");
        int created = 0, updated = 0;
        for (Item it : w.items()) {
            var existing = items.findByOwnerIdAndClientId(OWNER_ID, it.id());
            if (existing.isPresent()) updated++; else created++;
            items.save(mapper.apply(it, existing.orElseGet(ItemEntity::new), OWNER_ID));
        }
        for (Wardrobe.Decision d : w.decisions()) {
            if (d.id().isEmpty()) continue;
            decisions.save(mapper.apply(d, decisions.findByOwnerIdAndClientId(OWNER_ID, d.id()).orElseGet(DecisionEntity::new), OWNER_ID));
        }
        if (w.kind().equals("wardrobe") && !w.owner().nickname().isEmpty()) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("nickname", w.owner().nickname()); if (w.owner().height() != null) o.put("height", w.owner().height());
            o.put("topSize", w.owner().topSize()); o.put("bottomSize", w.owner().bottomSize());
            updateOwner(o);
        }
        ImportResult r = new ImportResult(w.items().size(), created, updated, w.decisions().size(), false);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) receipts.save(ImportReceiptEntity.of(OWNER_ID, idempotencyKey, hash, toJson(r)));
        return r;
    }

    /** 옷장 파일(스키마 2)로 내보낸다. 보유 옷만. 선택에 따라 내 사진·남의 상품 사진·후보·가격·체형·판정 기록을 넣는다. */
    @Transactional(readOnly = true)
    public Map<String, Object> export(WardrobeOps.ExportOptions opts) {
        Wardrobe w = WardrobeOps.exportWardrobe(owner(), allItems(true), allDecisions(), opts);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schema", Vocab.SCHEMA); out.put("kind", "wardrobe"); out.put("exportedAt", Sanitize.today()); out.put("name", w.name());
        out.put("owner", w.owner()); out.put("items", w.items()); out.put("decisions", w.decisions());
        return out;
    }

    @Transactional(readOnly = true)
    public List<Wardrobe.Decision> allDecisions() {
        List<Wardrobe.Decision> out = new ArrayList<>();
        for (DecisionEntity e : decisions.findByOwnerIdOrderByIdAsc(OWNER_ID)) out.add(mapper.toDomain(e));
        return out;
    }

    @Transactional
    public Wardrobe.Decision saveDecision(Map<String, Object> raw) {
        Wardrobe.Decision d = WardrobeCleaner.cleanDecision(raw);
        if (d == null || d.id().isEmpty()) throw new ApiException(400, "판정 기록으로 읽을 수 없다(id 와 before.lean 이 있어야 한다)");
        return mapper.toDomain(decisions.save(mapper.apply(d, decisions.findByOwnerIdAndClientId(OWNER_ID, d.id()).orElseGet(DecisionEntity::new), OWNER_ID)));
    }

    @Transactional
    public void deleteDecision(String clientId) {
        decisions.delete(decisions.findByOwnerIdAndClientId(OWNER_ID, clientId).orElseThrow(() -> new ApiException(404, "그런 판정 기록이 없다: " + clientId)));
    }
}
