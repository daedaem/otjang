package otjang.domain;

import static otjang.domain.Sanitize.safeDate;
import static otjang.domain.Sanitize.safeImg;
import static otjang.domain.Sanitize.safeLink;
import static otjang.domain.Sanitize.str;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 옷 한 벌의 상태를 바꾸는 동작. 모두 사용자 동작으로만 부르고, 새 객체를 돌려준다. app/src/wardrobe.js 의 같은 이름 함수들을 옮긴 것이다.
 * 사진 상태는 자동으로 오르지 않는다: 대체 이미지 → 미확인 후보 → 확인된 동일 제품은 여기 있는 함수 호출로만 바뀐다.
 */
public final class WardrobeOps {
    private WardrobeOps() {}

    /** 상품 사진을 걸 때 넘기는 값. */
    public record ProductPhotoInput(String img, String sourceName, String sourceUrl, String checkedAt, String brand, String name, String code, String evidence, String note, String at) {}

    /** 내 사진을 넣거나 바꾼다. 상품 사진이 걸려 있으면 화면에는 그대로 상품 사진이 보이고 내 사진은 ownImg 에 남는다. */
    public static Item setOwnPhoto(Item it, String imgRaw) {
        String img = safeImg(imgRaw);
        if (!it.photo().hasProductPhoto()) return it.withPhoto(Item.Photo.own(img));
        return it.withPhoto(it.photo().withOwnImg(img));
    }

    /** 상품 사진을 임시로 건다(substitute = 대체 이미지, candidate = 미확인 후보). 브랜드·이름은 내 옷 정보에 들어가지 않는다. */
    public static Item setProductPhoto(Item it, String kind, ProductPhotoInput p) {
        if (!kind.equals("substitute") && !kind.equals("candidate")) throw new IllegalArgumentException("kind must be substitute or candidate");
        String checked = safeDate(p.checkedAt());
        Item out = it.withPhoto(new Item.Photo(kind, safeImg(p.img()), it.photo().ownImg() == null ? "" : it.photo().ownImg(), str(p.sourceName(), 80).strip(), safeLink(p.sourceUrl()),
                checked.isEmpty() ? Sanitize.today() : checked)).withProduct(null);
        if (kind.equals("candidate") && (!Sanitize.isBlank(p.brand()) || !Sanitize.isBlank(p.name()))) {
            out = addCandidate(out, new Item.MatchCandidate(p.brand(), p.name(), Sanitize.isBlank(p.evidence()) ? "owner" : p.evidence(), p.note(), p.sourceUrl()));
        }
        return out;
    }

    /** 상품 사진을 뗀다. 내 사진이 있으면 그 사진으로 돌아간다. 확인 기록(product)도 지운다. */
    public static Item clearProductPhoto(Item it) {
        if (!it.photo().hasProductPhoto()) return it;
        return it.withPhoto(Item.Photo.own(it.photo().ownImg())).withProduct(null);
    }

    /** 후보를 더한다(브랜드+이름이 같은 것은 한 번만, 최근 MAX_CANDS 개만 남긴다). 정리된 값이 비면 그대로 둔다. */
    public static Item addCandidate(Item it, Item.MatchCandidate c) {
        Item.MatchCandidate cc = WardrobeCleaner.cleanCandidate(Map.of("brand", nz(c.brand()), "name", nz(c.name()), "evidence", nz(c.evidence()), "note", nz(c.note()), "url", nz(c.url())));
        if (cc == null) return it;
        for (Item.MatchCandidate x : it.matchCandidates()) if (x.brand().equals(cc.brand()) && x.name().equals(cc.name())) return it;
        List<Item.MatchCandidate> next = new ArrayList<>(it.matchCandidates());
        next.add(cc);
        if (next.size() > Vocab.MAX_CANDS) next = next.subList(next.size() - Vocab.MAX_CANDS, next.size());
        return it.withMatchCandidates(next);
    }

    public static Item removeCandidate(Item it, int index) {
        if (index < 0 || index >= it.matchCandidates().size()) return it;
        List<Item.MatchCandidate> next = new ArrayList<>(it.matchCandidates());
        next.remove(index);
        return it.withMatchCandidates(next);
    }

    /**
     * 사용자가 "같은 상품"이라고 확인했을 때만 부른다. 사진 상태가 '확인된 동일 제품'이 되고 브랜드·상품명·사진 출처·확인일이 내 옷 정보로 들어간다.
     * 브랜드도 상품명도 없으면 IllegalArgumentException.
     */
    public static Item confirmProduct(Item it, ProductPhotoInput p) {
        String brand = str(p.brand(), 60).strip(), name = str(p.name(), 80).strip();
        if (brand.isEmpty() && name.isEmpty()) throw new IllegalArgumentException("브랜드나 상품명이 있어야 확인할 수 있습니다");
        String at = safeDate(p.at());
        if (at.isEmpty()) at = Sanitize.today();
        boolean had = it.photo().hasProductPhoto();
        String img = safeImg(p.img()), src = str(p.sourceName(), 80).strip(), url = safeLink(p.sourceUrl());
        Item.Photo photo = new Item.Photo("confirmed", !img.isEmpty() ? img : (had ? it.photo().img() : ""), nz(it.photo().ownImg()),
                !src.isEmpty() ? src : (had ? it.photo().sourceName() : ""), !url.isEmpty() ? url : (had ? it.photo().sourceUrl() : ""), at);
        Item out = it.withProduct(new Item.Product(brand, name, str(p.code(), 60).strip(), at)).withPhoto(photo);
        if (Sanitize.isBlank(out.brand()) && !brand.isEmpty()) out = out.withBrand(brand);          // 확인된 제품의 브랜드·상품명은 내 옷 기록이 된다 (이미 적은 값은 두고)
        if (Sanitize.isBlank(out.model()) && !name.isEmpty()) out = out.withModel(name);
        List<Item.MatchCandidate> rest = new ArrayList<>();
        for (Item.MatchCandidate c : out.matchCandidates()) if (!(c.brand().equals(brand) && c.name().equals(name))) rest.add(c);
        return out.withMatchCandidates(rest);
    }

    /** 확인을 취소한다. 사진은 미확인 후보로 내려가고 product 는 비운다. brand·model(내 기록)은 그대로 둔다. */
    public static Item unconfirm(Item it) {
        if (!it.photo().kind().equals("confirmed")) return it;
        Item.Product p = it.product();
        Item out = it.withProduct(null).withPhoto(it.photo().withKind("candidate"));
        if (p != null && (!p.brand().isEmpty() || !p.name().isEmpty())) out = addCandidate(out, new Item.MatchCandidate(p.brand(), p.name(), "owner", "확인을 취소함", ""));
        return out;
    }

    public static Item setLook3d(Item it, Item.Look3d look) {
        return it.withLook3d(look == null ? null : WardrobeCleaner.cleanLook(Map.of("kind", nz(look.kind()), "fabric", nz(look.fabric()))));
    }

    public static Item setAttrSource(Item it, String src) {
        return Vocab.ATTR_SOURCE.containsKey(src) ? it.withAttrSource(src) : it;
    }

    /** 내보내기 선택. img 내 사진(기본 true), otherImg 남의 상품 사진, cands 미확인 후보 목록, price 가격·링크, body 키·사이즈, log 판정 기록(나머지 기본 false). */
    public record ExportOptions(boolean img, boolean otherImg, boolean cands, boolean price, boolean body, boolean log) {
        public static final ExportOptions DEFAULT = new ExportOptions(true, false, false, false, false, false);
    }

    /** 옷장 파일(스키마 2)로 내보낸다. 구매 후보와 처분한 옷은 넣지 않는다. exportedAt 은 호출한 쪽에서 오늘 날짜로 넣는다. */
    public static Wardrobe exportWardrobe(Wardrobe.Owner owner, List<Item> items, List<Wardrobe.Decision> decisions, ExportOptions e) {
        List<Item> out = new ArrayList<>();
        for (Item i : items) {
            if (!i.status().equals("owned")) continue;
            Item it = i;
            Item.Photo ph = it.photo();
            if (!e.img()) { ph = ph.withOwnImg(""); if (ph.kind().equals("own")) ph = Item.Photo.own(""); }
            if (ph.hasProductPhoto() && !e.otherImg()) ph = ph.withImg("");
            it = it.withPhoto(ph);
            if (!e.cands()) it = it.withMatchCandidates(List.of());
            if (!e.price()) it = it.withoutPrice();
            out.add(it);
        }
        String name = Sanitize.isBlank(owner.nickname()) ? "" : owner.nickname() + "의 옷장";
        Wardrobe.Owner o = e.body() ? owner : new Wardrobe.Owner(owner.nickname(), null, "", "");
        return new Wardrobe(Vocab.SCHEMA, "wardrobe", name, false, "", o, List.copyOf(out), e.log() ? List.copyOf(decisions) : List.of());
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
