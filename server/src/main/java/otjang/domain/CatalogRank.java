package otjang.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사람이 직접 넣은 상품 목록 안에서만 고르는 구매 추천. app/src/catalog.js 의 rank·isStale·toCandidate 를 옮긴 것이다.
 * 점수는 가산과 감점의 합이고 확률이 아니다. 결과의 상품은 모두 입력 목록 안의 것이다. 가격·재고·링크를 찾아오지 않는다.
 */
public final class CatalogRank {
    private CatalogRank() {}

    /** [제안값] 이보다 오래된 가격은 "재확인 필요"로 표시한다. */
    public static final int STALE_DAYS = 14;

    public record OverlapRef(String id, String name, String level) {}
    public record Ranked(CatalogProduct product, int score, List<String> reasons, List<String> cautions, int added, List<OverlapRef> overlaps,
                         List<Judge.Blocker> blockers, Garment gap, boolean stale, boolean supported, List<Judge.Pick> top3) {}

    /** 확인일로부터 오늘까지 며칠인지. 확인일이 없으면 null. */
    public static Integer daysSince(String date, String today) {
        if (Sanitize.safeDate(date).isEmpty()) return null;
        LocalDate d = LocalDate.parse(date), t = LocalDate.parse(today == null ? Sanitize.today() : today);
        return (int) ChronoUnit.DAYS.between(d, t);
    }

    /** 가격이 있는데 확인일이 없거나 staleDays 보다 오래되면 true. */
    public static boolean isStale(CatalogProduct p, String today, Integer staleDays) {
        if (p.price() == null) return false;
        Integer d = daysSince(p.checkedAt(), today);
        return d == null || d > (staleDays == null ? STALE_DAYS : staleDays);
    }

    /** 상품 하나를 후보 옷(살까 말까)으로 바꾼다. 사진·링크가 있으면 그 상품의 사진이므로 '확인된 동일 제품'이다. JS 와 같이 cleanItem 을 거쳐 길이·형식을 맞춘다. */
    public static Item toCandidate(CatalogProduct p, String today) {
        String at = today == null ? Sanitize.today() : today;
        boolean hasProduct = !p.img().isEmpty() || !p.link().isEmpty();
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("id", "c" + p.id() + "-" + at.replace("-", "")); raw.put("status", "candidate");
        raw.put("cat", p.cat()); raw.put("kind", p.kind()); raw.put("name", p.name()); raw.put("family", p.family()); raw.put("light", p.light());
        raw.put("formality", p.formality()); raw.put("pattern", p.pattern()); raw.put("seasons", p.seasons());
        raw.put("attrSource", "owner"); raw.put("brand", p.brand()); raw.put("model", p.code().isEmpty() ? p.name() : p.name() + " (" + p.code() + ")");
        raw.put("link", p.link()); raw.put("price", p.price()); raw.put("checkedAt", p.checkedAt()); raw.put("detail", p.note());
        Map<String, Object> photo = new LinkedHashMap<>();
        photo.put("kind", hasProduct ? "confirmed" : "none"); photo.put("img", p.img()); photo.put("sourceName", "상품 목록에서 넣음"); photo.put("sourceUrl", p.link()); photo.put("checkedAt", at);
        raw.put("photo", photo);
        if (hasProduct) { Map<String, Object> prod = new LinkedHashMap<>(); prod.put("brand", p.brand()); prod.put("name", p.name()); prod.put("code", p.code()); prod.put("confirmedAt", at); raw.put("product", prod); }
        return WardrobeCleaner.cleanItem(raw, 0);
    }

    /**
     * 내 옷장에 비춰 상품 순서를 매긴다. gaps 는 다른 옷장에는 있고 내게 없는 옷(견준 결과). 점수 내림차순, 같으면 id 순.
     * 새 조합 +min(5, n) / 조합 없음 −2 / 많이 겹침 −2벌당 / 일부 겹침 −1벌당 / 빈틈 채움 +3.
     */
    public static List<Ranked> rank(List<? extends Garment> items, List<CatalogProduct> products, String season, List<? extends Garment> gaps, String today, Integer staleDays) {
        List<Ranked> out = new ArrayList<>();
        for (CatalogProduct p : products) {
            if (!p.inSeason(season)) continue;
            Judge.Verdict v = Judge.judgeCandidate(items, p, season);
            List<String> reasons = new ArrayList<>(), cautions = new ArrayList<>();
            int score = 0;
            List<String> strongNames = new ArrayList<>(), partialNames = new ArrayList<>();
            List<OverlapRef> refs = new ArrayList<>();
            for (Judge.Overlap o : v.overlaps()) { (o.level().equals("strong") ? strongNames : partialNames).add(o.item().name()); refs.add(new OverlapRef(o.item().id(), o.item().name(), o.level())); }
            if (v.supported()) {
                if (!v.added().isEmpty()) { score += Math.min(5, v.added().size()); reasons.add("가진 옷과 주의 사항 없는 조합이 " + v.added().size() + "개 생깁니다."); }
                else if (v.note().isEmpty()) { score -= 2; cautions.add("가진 옷과 주의 사항 없는 조합이 생기지 않습니다."); }
                if (!v.note().isEmpty()) cautions.add(v.note());
            } else cautions.add(v.note().isEmpty() ? "조합 규칙이 없는 종류라 겹치는 옷만 봅니다." : v.note());
            if (!strongNames.isEmpty()) { score -= 2 * strongNames.size(); cautions.add("많이 겹치는 보유 옷이 " + strongNames.size() + "벌 있습니다: " + String.join(", ", strongNames)); }
            if (!partialNames.isEmpty()) { score -= partialNames.size(); cautions.add("일부 겹치는 보유 옷이 " + partialNames.size() + "벌 있습니다: " + String.join(", ", partialNames)); }
            Garment gap = null;
            if (gaps != null) for (Garment g : gaps) if (!Judge.matchKind(p, g).isEmpty()) { gap = g; break; }
            if (gap != null) { score += 3; reasons.add("견준 옷장에는 있고 내게 없는 \"" + gap.name() + "\" 자리를 채웁니다."); }
            if (!v.blockers().isEmpty() && v.supported()) {
                List<String> parts = new ArrayList<>();
                for (Judge.Blocker b : v.blockers()) parts.add(b.text() + " (" + b.count() + "/" + b.total() + ")");
                cautions.add("걸리는 점: " + String.join(" / ", parts));
            }
            out.add(new Ranked(p, score, List.copyOf(reasons), List.copyOf(cautions), v.added().size(), List.copyOf(refs), v.blockers(), gap, isStale(p, today, staleDays), v.supported(), v.top3()));
        }
        out.sort(Comparator.comparingInt(Ranked::score).reversed().thenComparing(r -> r.product().id()));
        return out;
    }
}
