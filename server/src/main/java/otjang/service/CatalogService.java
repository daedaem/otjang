package otjang.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import otjang.api.ApiException;
import otjang.domain.CatalogProduct;
import otjang.domain.CatalogRank;
import otjang.domain.Garment;
import otjang.domain.Item;
import otjang.domain.WardrobeCleaner;
import otjang.persistence.CatalogProductEntity;
import otjang.persistence.CatalogProductRepository;
import otjang.persistence.ImportReceiptEntity;
import otjang.persistence.ImportReceiptRepository;
import otjang.store.LocalDirPhotoStore;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 사람이 직접 넣은 상품 목록. 서버는 상품을 찾아오거나 가격을 갱신하지 않는다. 순위는 CatalogRank(앱과 같은 규칙). */
@Service
public class CatalogService {
    private final CatalogProductRepository products;
    private final ImportReceiptRepository receipts;
    private final ItemMapper mapper;
    private final WardrobeService wardrobe;
    private final TemplateService templates;
    private final otjang.store.PhotoLifecycle lifecycle;

    public CatalogService(CatalogProductRepository products, ImportReceiptRepository receipts, ItemMapper mapper, WardrobeService wardrobe, TemplateService templates, otjang.store.PhotoLifecycle lifecycle) {
        this.products = products; this.receipts = receipts; this.mapper = mapper; this.wardrobe = wardrobe; this.templates = templates; this.lifecycle=lifecycle;
    }

    @Transactional(readOnly = true)
    public List<CatalogProduct> all(boolean withPhotos) {
        List<CatalogProduct> out = new ArrayList<>();
        for (CatalogProductEntity e : products.findByOwnerIdOrderByIdAsc(wardrobe.ownerId())) out.add(mapper.toDomain(e, withPhotos));
        return out;
    }

    private CatalogProductEntity entity(String clientId) {
        return products.findByOwnerIdAndClientId(wardrobe.ownerId(), clientId).orElseThrow(() -> new ApiException(404, "그런 상품이 없다: " + clientId));
    }

    @Transactional
    public CatalogProduct save(Map<String, Object> raw) {
        CatalogProduct p = WardrobeCleaner.cleanProduct(raw, 0);
        if (p == null) throw new ApiException(400, "상품으로 읽을 수 없다(cat 과 name 이 있어야 한다)");
        return mapper.toDomain(products.save(mapper.apply(p, products.findByOwnerIdAndClientId(wardrobe.ownerId(), p.id()).orElseGet(CatalogProductEntity::new), wardrobe.ownerId())), true);
    }

    @Transactional(readOnly = true)
    public void requireExisting(String clientId) { entity(clientId); }

    @Transactional
    public void delete(String clientId) {
        lifecycle.lock();
        CatalogProductEntity e=entity(clientId);
        lifecycle.afterCommit(java.util.List.of(e.getImgRef()));
        products.delete(e);
    }

    /** 상품 목록 파일(스키마 1, kind catalog)을 더한다. 같은 id 는 덮어쓴다. Idempotency-Key 규칙은 옷장 가져오기와 같다. */
    @Transactional
    public WardrobeService.ImportResult importCatalog(Map<String, Object> raw, String idempotencyKey, String rawBodyForHash) {
        String hash = LocalDirPhotoStore.sha256(rawBodyForHash == null ? String.valueOf(raw) : rawBodyForHash);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            var prev = receipts.findByOwnerIdAndIdempotencyKey(wardrobe.ownerId(), idempotencyKey);
            if (prev.isPresent()) {
                if (!prev.get().getRequestHash().equals(hash)) throw new ApiException(409, "같은 Idempotency-Key 로 다른 내용이 왔다");
                return WardrobeService.fromJson(prev.get().getResponse());
            }
        }
        CatalogProduct.Catalog c = WardrobeCleaner.cleanCatalog(raw);
        if (c == null) throw new ApiException(400, "상품 목록 파일이 아니다(schema 1, kind catalog, products 배열)");
        int created = 0, updated = 0;
        for (CatalogProduct p : c.products()) {
            var existing = products.findByOwnerIdAndClientId(wardrobe.ownerId(), p.id());
            if (existing.isPresent()) updated++; else created++;
            products.save(mapper.apply(p, existing.orElseGet(CatalogProductEntity::new), wardrobe.ownerId()));
        }
        WardrobeService.ImportResult r = new WardrobeService.ImportResult(c.products().size(), created, updated, 0, false);
        if (idempotencyKey != null && !idempotencyKey.isBlank()) receipts.save(ImportReceiptEntity.of(wardrobe.ownerId(), idempotencyKey, hash, WardrobeService.toJson(r)));
        return r;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> export() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schema", CatalogProduct.Catalog.SCHEMA); out.put("kind", "catalog"); out.put("name", ""); out.put("note", ""); out.put("products", all(true));
        return out;
    }

    /**
     * 내 옷장에 비춰 상품 순서를 매긴다. gaps: "template" 이면 기본 옷장(아이비 초안)과 견줘 내게 없는 옷을 빈틈으로 쓰고, "none" 이면 쓰지 않는다.
     */
    @Transactional(readOnly = true)
    public List<CatalogRank.Ranked> rank(String season, String gaps, Integer staleDays) {
        List<Item> mine = wardrobe.allItems(false);
        List<? extends Garment> gapList = "none".equals(gaps) ? null : templates.gaps(mine, season);
        return CatalogRank.rank(mine, all(false), season == null ? "" : season, gapList, null, staleDays);
    }

    /** 상품을 살까 말까 후보로 넣는다(옷으로 저장). 사진·링크가 있으면 '확인된 동일 제품' 상태다. */
    @Transactional
    public Item toCandidate(String clientId) {
        CatalogProduct p = mapper.toDomain(entity(clientId), true);
        Item cand = CatalogRank.toCandidate(p, null);
        return wardrobe.saveItem(cand);
    }
}
