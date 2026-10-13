package otjang.domain;

import java.util.List;

/**
 * 규칙(판정·코디·비교·상품 순위)이 보는 필드. 내 옷(Item)과 상품 목록의 상품(CatalogProduct)이 함께 구현한다.
 * 규칙은 이 인터페이스만 보므로, 상품을 후보로 바꾸지 않고도 같은 규칙에 넣을 수 있다.
 */
public interface Garment {
    String id();
    /** owned | candidate | gone. 상품은 항상 candidate. */
    String status();
    String cat();
    String kind();
    String name();
    String brand();
    String family();
    Integer light();
    Integer formality();
    String pattern();
    /** 비어 있으면 미확인. */
    List<String> seasons();

    default boolean isOwned() {
        return !"candidate".equals(status()) && !"gone".equals(status());
    }

    default boolean patterned() {
        return pattern() != null && !pattern().equals("solid");
    }

    /** 계절이 미확인인 옷은 특정 계절 비교에서 제외한다. */
    default boolean inSeason(String season) {
        if (season == null || season.isEmpty()) return true;
        if (seasons() == null || seasons().isEmpty()) return false;
        return seasons().contains(season);
    }
}
