package otjang.domain;

import java.util.List;
import java.util.Map;

/**
 * 옷 한 벌 (옷장 파일 스키마 2). app/src/wardrobe.js 머리말의 뼈대와 같다. 불변 객체이고, 상태를 바꾸는 함수(WardrobeOps)는 새 객체를 돌려준다.
 *
 * <ul>
 *   <li>attrSource: photo-draft(사진에서 뽑은 초안) | owner(주인 입력) | owner-confirmed(주인이 확인함)</li>
 *   <li>photo.kind: own | confirmed | candidate | substitute | none. product 는 photo.kind 가 confirmed 일 때만 있다(사용자가 확인해야 생긴다)</li>
 *   <li>matchCandidates: 확인 전 후보. 내 옷 정보가 아니다</li>
 *   <li>look3d: 3D 옷장에 거는 종류와 원단. 종류로 그린 모습이지 상품 재현이 아니다</li>
 * </ul>
 */
public record Item(
        String id, String status, String cat, String kind, String name, String detail,
        String family, Integer light, Integer formality, String pattern, List<String> seasons,
        String attrSource, String draftNote,
        Photo photo, Product product, List<MatchCandidate> matchCandidates, Look3d look3d,
        String brand, String model, String size, Integer boughtYear, String review, String rebuy, String fabric, String neck,
        Map<String, Double> measures, String link, Long price, String checkedAt) implements Garment {

    public record Photo(String kind, String img, String ownImg, String sourceName, String sourceUrl, String checkedAt) {
        /** 내 사진만 있거나 사진이 없는 상태. */
        public static Photo own(String ownImg) {
            String o = ownImg == null ? "" : ownImg;
            return new Photo(o.isEmpty() ? "none" : "own", o, o, "", "", "");
        }
        public boolean hasProductPhoto() {
            return !kind.equals("own") && !kind.equals("none");
        }
        public Photo withKind(String k) { return new Photo(k, img, ownImg, sourceName, sourceUrl, checkedAt); }
        public Photo withOwnImg(String o) { return new Photo(kind, img, o, sourceName, sourceUrl, checkedAt); }
        public Photo withImg(String i) { return new Photo(kind, i, ownImg, sourceName, sourceUrl, checkedAt); }
    }

    public record Product(String brand, String name, String code, String confirmedAt) {}

    public record MatchCandidate(String brand, String name, String evidence, String note, String url) {}

    public record Look3d(String kind, String fabric) {}

    public boolean isDraft() {
        return "photo-draft".equals(attrSource);
    }

    public Item withId(String v) { return copy(v, status, photo, product, matchCandidates, look3d, brand, model, attrSource, price, link, checkedAt); }
    public Item withStatus(String v) { return copy(id, v, photo, product, matchCandidates, look3d, brand, model, attrSource, price, link, checkedAt); }
    public Item withPhoto(Photo v) { return copy(id, status, v, product, matchCandidates, look3d, brand, model, attrSource, price, link, checkedAt); }
    public Item withProduct(Product v) { return copy(id, status, photo, v, matchCandidates, look3d, brand, model, attrSource, price, link, checkedAt); }
    public Item withMatchCandidates(List<MatchCandidate> v) { return copy(id, status, photo, product, List.copyOf(v), look3d, brand, model, attrSource, price, link, checkedAt); }
    public Item withLook3d(Look3d v) { return copy(id, status, photo, product, matchCandidates, v, brand, model, attrSource, price, link, checkedAt); }
    public Item withBrand(String v) { return copy(id, status, photo, product, matchCandidates, look3d, v, model, attrSource, price, link, checkedAt); }
    public Item withModel(String v) { return copy(id, status, photo, product, matchCandidates, look3d, brand, v, attrSource, price, link, checkedAt); }
    public Item withAttrSource(String v) { return copy(id, status, photo, product, matchCandidates, look3d, brand, model, v, price, link, checkedAt); }
    /** 내보내기에서 가격·링크·확인일을 뺄 때. */
    public Item withoutPrice() { return copy(id, status, photo, product, matchCandidates, look3d, brand, model, attrSource, null, "", ""); }

    private Item copy(String id, String status, Photo photo, Product product, List<MatchCandidate> cands, Look3d look3d, String brand, String model, String attrSource,
                      Long price, String link, String checkedAt) {
        return new Item(id, status, cat, kind, name, detail, family, light, formality, pattern, seasons, attrSource, draftNote, photo, product, cands, look3d,
                brand, model, size, boughtYear, review, rebuy, fabric, neck, measures, link, price, checkedAt);
    }
}
