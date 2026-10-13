package otjang.domain;

import java.util.List;

/**
 * 사람이 직접 넣은 상품(상품 목록 스키마 1). 가격·확인일은 사람이 확인한 시점의 값이고, 서버가 찾아오거나 갱신하지 않는다.
 * 규칙에서는 항상 구매 후보(status = candidate)로 취급한다.
 */
public record CatalogProduct(String id, String brand, String name, String code, String cat, String kind, String family, Integer light, Integer formality, String pattern,
                             List<String> seasons, String link, Long price, String checkedAt, String img, String note, String addedAt) implements Garment {
    @Override
    public String status() {
        return "candidate";
    }

    public record Catalog(int schema, String name, String note, List<CatalogProduct> products) {
        public static final int SCHEMA = 1;
    }
}
