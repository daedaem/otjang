package otjang.service;

import org.springframework.stereotype.Component;
import otjang.domain.CatalogProduct;
import otjang.domain.Item;
import otjang.domain.Sanitize;
import otjang.domain.Wardrobe;
import otjang.persistence.CatalogProductEntity;
import otjang.persistence.DecisionEntity;
import otjang.persistence.ItemEntity;
import otjang.persistence.MatchCandidateEntity;
import otjang.store.PhotoStore;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/** 도메인 객체 ↔ JPA 엔티티. 사진 data URL 은 PhotoStore 키로 바꾸고, 읽을 때 다시 data URL 로 푼다. */
@Component
public class ItemMapper {
    private final PhotoStore photos;

    public ItemMapper(PhotoStore photos) {
        this.photos = photos;
    }

    /** 도메인 → 엔티티(새것이거나 기존 것을 덮어씀). */
    public ItemEntity apply(Item it, ItemEntity e, Long ownerId) {
        e.setOwnerId(ownerId); e.setClientId(it.id()); e.setStatus(it.status()); e.setCat(it.cat()); e.setKind(it.kind()); e.setName(it.name()); e.setDetail(it.detail());
        e.setFamily(it.family()); e.setLight((short) it.light()); e.setFormality((short) it.formality()); e.setPattern(it.pattern()); e.setSeasons(it.seasons());
        e.setAttrSource(it.attrSource()); e.setDraftNote(it.draftNote());
        Item.Photo p = it.photo();
        e.setPhotoKind(p.kind()); e.setPhotoImgRef(photos.put(p.img())); e.setPhotoOwnImgRef(photos.put(p.ownImg()));
        boolean productPhoto = p.hasProductPhoto();
        e.setPhotoSourceName(productPhoto ? p.sourceName() : ""); e.setPhotoSourceUrl(productPhoto ? p.sourceUrl() : ""); e.setPhotoCheckedAt(productPhoto ? date(p.checkedAt()) : null);
        if (it.product() != null && p.kind().equals("confirmed")) {
            e.setProductBrand(it.product().brand()); e.setProductName(it.product().name()); e.setProductCode(it.product().code()); e.setProductConfirmedAt(date(it.product().confirmedAt()));
        } else {
            e.setProductBrand(null); e.setProductName(null); e.setProductCode(null); e.setProductConfirmedAt(null);
        }
        e.setLook3dKind(it.look3d() == null ? null : it.look3d().kind()); e.setLook3dFabric(it.look3d() == null ? null : it.look3d().fabric());
        e.setBrand(it.brand()); e.setModel(it.model()); e.setSize(it.size()); e.setBoughtYear(it.boughtYear() == null ? null : it.boughtYear().shortValue());
        e.setReview(it.review()); e.setRebuy(it.rebuy()); e.setFabric(it.fabric()); e.setNeck(it.neck()); e.setMeasures(Json.numberMap(it.measures()));
        e.setLink(it.link()); e.setPrice(it.price()); e.setCheckedAt(date(it.checkedAt()));
        e.getCandidates().clear();
        int pos = 0;
        for (Item.MatchCandidate c : it.matchCandidates()) e.getCandidates().add(MatchCandidateEntity.of(e, pos++, c.brand(), c.name(), c.evidence(), c.note(), c.url()));
        e.touch();
        return e;
    }

    /** 엔티티 → 도메인. 사진은 저장소에서 다시 읽어 data URL 로 넣는다(withPhotos=false 면 비워 둔다). */
    public Item toDomain(ItemEntity e, boolean withPhotos) {
        List<Item.MatchCandidate> cands = new ArrayList<>();
        for (MatchCandidateEntity c : e.getCandidates()) cands.add(new Item.MatchCandidate(c.getBrand(), c.getName(), c.getEvidence(), c.getNote(), c.getUrl()));
        Item.Photo photo = new Item.Photo(e.getPhotoKind(), withPhotos ? photos.get(e.getPhotoImgRef()) : "", withPhotos ? photos.get(e.getPhotoOwnImgRef()) : "",
                e.getPhotoSourceName(), e.getPhotoSourceUrl(), str(e.getPhotoCheckedAt()));
        Item.Product product = e.getPhotoKind().equals("confirmed") && e.getProductConfirmedAt() != null
                ? new Item.Product(nz(e.getProductBrand()), nz(e.getProductName()), nz(e.getProductCode()), e.getProductConfirmedAt().toString()) : null;
        Item.Look3d look = e.getLook3dKind() == null ? null : new Item.Look3d(e.getLook3dKind(), nz(e.getLook3dFabric()));
        return new Item(e.getClientId(), e.getStatus(), e.getCat(), e.getKind(), e.getName(), e.getDetail(), e.getFamily(), e.getLight(), e.getFormality(), e.getPattern(), List.copyOf(e.getSeasons()),
                e.getAttrSource(), e.getDraftNote(), photo, product, List.copyOf(cands), look, e.getBrand(), e.getModel(), e.getSize(), e.getBoughtYear() == null ? null : e.getBoughtYear().intValue(),
                e.getReview(), e.getRebuy(), e.getFabric(), e.getNeck(), Json.parseNumberMap(e.getMeasures()), e.getLink(), e.getPrice(), str(e.getCheckedAt()));
    }

    public CatalogProductEntity apply(CatalogProduct p, CatalogProductEntity e, Long ownerId) {
        e.setOwnerId(ownerId); e.setClientId(p.id()); e.setBrand(p.brand()); e.setName(p.name()); e.setCode(p.code()); e.setCat(p.cat()); e.setKind(p.kind()); e.setFamily(p.family());
        e.setLight((short) p.light()); e.setFormality((short) p.formality()); e.setPattern(p.pattern()); e.setSeasons(p.seasons()); e.setLink(p.link()); e.setPrice(p.price());
        e.setCheckedAt(date(p.checkedAt())); e.setImgRef(photos.put(p.img())); e.setNote(p.note()); e.setAddedAt(date(p.addedAt()));
        e.touch();
        return e;
    }

    public CatalogProduct toDomain(CatalogProductEntity e, boolean withPhotos) {
        return new CatalogProduct(e.getClientId(), e.getBrand(), e.getName(), e.getCode(), e.getCat(), e.getKind(), e.getFamily(), e.getLight(), e.getFormality(), e.getPattern(),
                List.copyOf(e.getSeasons()), e.getLink(), e.getPrice(), str(e.getCheckedAt()), withPhotos ? photos.get(e.getImgRef()) : "", e.getNote(), str(e.getAddedAt()));
    }

    public DecisionEntity apply(Wardrobe.Decision d, DecisionEntity e, Long ownerId) {
        e.setOwnerId(ownerId); e.setClientId(d.id()); e.setItemClientId(d.itemId()); e.setItemName(d.name());
        e.setBeforeLean(d.before().lean()); e.setBeforeReason(d.before().reason()); e.setBeforeAt(date(d.before().at()));
        e.setSummaryOverlaps((short) d.summary().overlaps()); e.setSummaryAdded((short) d.summary().added()); e.setSummaryBlockers((short) d.summary().blockers());
        if (d.after() != null) {
            e.setAfterDecision(d.after().decision()); e.setAfterHelpful(d.after().helpful()); e.setAfterNote(d.after().note()); e.setAfterAt(date(d.after().at())); e.setAfterShift(d.after().shift());
        } else {
            e.setAfterDecision(null); e.setAfterHelpful(null); e.setAfterNote(""); e.setAfterAt(null); e.setAfterShift(null);
        }
        if (d.follow() != null) { e.setFollowAt(date(d.follow().at())); e.setFollowWorn(d.follow().worn()); e.setFollowFeel(d.follow().feel()); }
        else { e.setFollowAt(null); e.setFollowWorn(null); e.setFollowFeel(null); }
        return e;
    }

    public Wardrobe.Decision toDomain(DecisionEntity e) {
        Wardrobe.Decision.After after = e.getAfterDecision() == null ? null
                : new Wardrobe.Decision.After(e.getAfterDecision(), e.getAfterHelpful(), e.getAfterNote(), str(e.getAfterAt()), e.getAfterShift());
        Wardrobe.Decision.Follow follow = e.getFollowAt() == null || after == null ? null : new Wardrobe.Decision.Follow(str(e.getFollowAt()), nz(e.getFollowWorn()), nz(e.getFollowFeel()));
        return new Wardrobe.Decision(e.getClientId(), e.getItemClientId(), e.getItemName(), new Wardrobe.Decision.Before(e.getBeforeLean(), e.getBeforeReason(), str(e.getBeforeAt())),
                new Wardrobe.Decision.Summary(e.getSummaryOverlaps(), e.getSummaryAdded(), e.getSummaryBlockers()), after, follow);
    }

    /** YYYY-MM-DD 모양이고 실제 날짜일 때만 LocalDate. 아니면 null(앱의 str(…, 10) 값은 날짜 모양이 아닐 수 있다). */
    static LocalDate date(String s) {
        if (Sanitize.safeDate(s).isEmpty()) return null;
        try { return LocalDate.parse(s); } catch (DateTimeParseException e) { return null; }
    }

    static String str(LocalDate d) {
        return d == null ? "" : d.toString();
    }

    static String nz(String s) {
        return s == null ? "" : s;
    }
}
