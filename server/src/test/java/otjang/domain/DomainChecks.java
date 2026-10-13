package otjang.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 사진 상태 전이와 내보내기 규칙 확인. app/test/wardrobe.test.cjs 의 핵심 단언을 옮긴 것이다. JUnit 없이도 돈다: java -cp <classes> otjang.domain.DomainChecks
 * 지키는 규칙: 상태는 사용자 동작으로만 오른다. 정리 함수가 상태를 올리는 길은 없다. 대체 이미지·후보의 브랜드·가격은 내 옷 정보에 들어가지 않는다.
 */
public final class DomainChecks {
    private DomainChecks() {}

    static final String IMG = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
    private static int failed = 0;

    static void ok(boolean cond, String label) {
        System.out.println((cond ? "  ok   " : "  FAIL ") + label);
        if (!cond) failed++;
    }

    static Map<String, Object> raw(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    /** 실패한 단언의 수를 돌려준다. */
    public static int run() {
        failed = 0;
        Item base = WardrobeCleaner.cleanItem(raw("cat", "top", "kind", "shirt", "name", "x", "img", IMG), 0);
        ok(base.photo().kind().equals("own") && base.photo().img().equals(IMG) && base.photo().ownImg().equals(IMG), "스키마 1의 img 는 내 사진(own)으로 옮겨지고 ownImg 에도 남는다");
        ok(base.attrSource().equals("owner") && base.status().equals("owned") && base.family() == null && base.light() == null && base.formality() == null, "미확인 값은 기본값을 만들지 않고 null로 남긴다");

        Item fake = WardrobeCleaner.cleanItem(raw("cat", "top", "kind", "shirt", "name", "x", "photo", raw("kind", "confirmed", "img", IMG, "sourceName", "쇼핑몰")), 0);
        ok(fake.photo().kind().equals("candidate") && fake.product() == null, "확인 기록 없는 '확인됨'은 후보로 내려간다");
        Item fake2 = WardrobeCleaner.cleanItem(raw("cat", "top", "kind", "shirt", "name", "x", "photo", raw("kind", "confirmed"), "product", raw("brand", "B", "name", "N")), 0);
        ok(fake2.photo().kind().equals("candidate") && fake2.product() == null, "confirmedAt 없는 product 는 버려지고 후보로 내려간다");
        Item fake3 = WardrobeCleaner.cleanItem(raw("cat", "top", "kind", "shirt", "name", "x", "photo", raw("kind", "own", "img", IMG), "product", raw("brand", "B", "name", "N", "confirmedAt", "2026-10-12")), 0);
        ok(fake3.product() == null && fake3.photo().kind().equals("own"), "사진 상태가 확인됨이 아니면 product 는 버려진다");
        Item real = WardrobeCleaner.cleanItem(raw("cat", "top", "kind", "shirt", "name", "x", "photo", raw("kind", "confirmed", "img", IMG), "product", raw("brand", "B", "name", "N", "confirmedAt", "2026-10-12")), 0);
        ok(real.photo().kind().equals("confirmed") && real.product() != null && real.product().confirmedAt().equals("2026-10-12"), "확인 기록이 있는 확인됨은 유지된다");

        Item sub = WardrobeOps.setProductPhoto(base, "substitute", new WardrobeOps.ProductPhotoInput(IMG, "다른 상품 사진", "https://example.com/p", "", "", "", "", "", "", ""));
        ok(sub.photo().kind().equals("substitute") && sub.product() == null && sub.photo().ownImg().equals(IMG) && sub.photo().sourceUrl().equals("https://example.com/p") && sub.matchCandidates().isEmpty(), "대체 이미지: 내 사진은 ownImg 에 남고 후보도 만들지 않는다");
        Item cand = WardrobeOps.setProductPhoto(sub, "candidate", new WardrobeOps.ProductPhotoInput("", "같아 보이는 상품", "", "", "B", "N", "", "", "", ""));
        ok(cand.photo().kind().equals("candidate") && cand.product() == null && cand.matchCandidates().size() == 1 && cand.brand().isEmpty(), "후보: matchCandidates 에만 들어가고 brand 는 비어 있다");
        Item okc = WardrobeOps.confirmProduct(cand, new WardrobeOps.ProductPhotoInput("", "", "", "", "B", "N", "123", "", "", ""));
        ok(okc.photo().kind().equals("confirmed") && okc.product().equals(new Item.Product("B", "N", "123", Sanitize.today())) && okc.brand().equals("B") && okc.model().equals("N") && okc.matchCandidates().isEmpty(), "확인하면 확인된 동일 제품이 되고 브랜드·상품명이 내 기록으로 들어가며 후보에서 빠진다");
        Item re = WardrobeCleaner.cleanItem(toRaw(okc), 0);
        ok(re.photo().kind().equals("confirmed") && re.product() != null, "확인 기록이 있는 확인됨은 정리해도 유지된다");
        Item undo = WardrobeOps.unconfirm(okc);
        ok(undo.photo().kind().equals("candidate") && undo.product() == null && undo.brand().equals("B") && undo.matchCandidates().size() == 1 && undo.matchCandidates().get(0).note().equals("확인을 취소함"), "확인 취소: 후보로 내려가고 내 기록은 그대로, 후보 목록으로 돌아간다");
        Item back = WardrobeOps.clearProductPhoto(undo);
        ok(back.photo().kind().equals("own") && back.photo().img().equals(IMG) && back.product() == null, "상품 사진을 떼면 내 사진으로 돌아간다");
        boolean threw = false;
        try { WardrobeOps.confirmProduct(base, new WardrobeOps.ProductPhotoInput("", "", "", "", "", "", "", "", "", "")); } catch (IllegalArgumentException e) { threw = true; }
        ok(threw, "브랜드도 상품명도 없으면 확인할 수 없다");
        threw = false;
        try { WardrobeOps.setProductPhoto(base, "confirmed", new WardrobeOps.ProductPhotoInput("", "", "", "", "", "", "", "", "", "")); } catch (IllegalArgumentException e) { threw = true; }
        ok(threw, "setProductPhoto 로는 확인됨을 만들 수 없다");

        Item jacket = WardrobeCleaner.cleanItem(raw("cat", "outer", "kind", "jacket", "name", "내 재킷"), 0);
        Item jsub = WardrobeOps.setProductPhoto(jacket, "substitute", new WardrobeOps.ProductPhotoInput("", "어느 브랜드 재킷", "https://shop.example/x", "", "어느 브랜드", "재킷 A", "", "", "", ""));
        ok(jsub.brand().isEmpty() && jsub.model().isEmpty() && jsub.link().isEmpty() && jsub.price() == null && jsub.matchCandidates().isEmpty(), "대체 이미지의 브랜드·이름·주소는 내 옷 정보에 들어가지 않는다");
        Item jc = WardrobeOps.addCandidate(jsub, new Item.MatchCandidate("어느 브랜드", "재킷 A", "logo", "", "https://shop.example/x"));
        ok(jc.brand().isEmpty() && jc.link().isEmpty() && jc.matchCandidates().size() == 1, "후보를 더해도 내 옷 정보는 그대로");
        Item jc2 = WardrobeOps.addCandidate(jc, new Item.MatchCandidate("어느 브랜드", "재킷 A", "owner", "", ""));
        ok(jc2.matchCandidates().size() == 1, "같은 브랜드·이름 후보는 한 번만");
        Item many = jc;
        for (int i = 0; i < 7; i++) many = WardrobeOps.addCandidate(many, new Item.MatchCandidate("B" + i, "N", "owner", "", ""));
        ok(many.matchCandidates().size() == Vocab.MAX_CANDS && many.matchCandidates().get(0).brand().equals("B2"), "후보는 최근 5개만 남긴다");

        List<Item> items = List.of(okc, jc, base.withStatus("candidate").withId("c1"), base.withStatus("gone").withId("g1"));
        Wardrobe exp = WardrobeOps.exportWardrobe(new Wardrobe.Owner("시험", 175.0, "M", "32"), items, List.of(), WardrobeOps.ExportOptions.DEFAULT);
        ok(exp.items().size() == 2 && exp.items().stream().allMatch((i) -> i.status().equals("owned")), "내보내기에는 보유 옷만 들어간다");
        ok(exp.items().get(0).photo().kind().equals("confirmed") && exp.items().get(0).photo().img().isEmpty() && exp.items().get(0).product() != null, "남의 상품 사진은 기본으로 빠지고 확인된 상품 정보는 남는다");
        ok(exp.items().get(1).matchCandidates().isEmpty() && exp.owner().height() == null && exp.name().equals("시험의 옷장"), "후보 목록과 체형은 기본으로 빠진다");
        Wardrobe exp2 = WardrobeOps.exportWardrobe(new Wardrobe.Owner("시험", 175.0, "M", "32"), items, List.of(), new WardrobeOps.ExportOptions(false, true, true, true, true, true));
        Item withShot = WardrobeOps.confirmProduct(cand, new WardrobeOps.ProductPhotoInput(IMG, "", "", "", "B", "N", "", "", "", ""));
        Wardrobe exp3 = WardrobeOps.exportWardrobe(Wardrobe.Owner.EMPTY, List.of(withShot), List.of(), new WardrobeOps.ExportOptions(false, true, false, false, false, false));
        ok(exp2.items().get(0).photo().ownImg().isEmpty() && exp2.items().get(1).matchCandidates().size() == 1 && exp2.owner().height() == 175.0 && exp3.items().get(0).photo().img().equals(IMG) && exp3.items().get(0).photo().ownImg().isEmpty(), "선택하면 남의 상품 사진·후보·체형이 들어가고 내 사진은 빠진다");

        Map<String, Object> bad = raw("schema", 2, "owner", raw("nickname", "<img src=x onerror=alert(1)>"), "items", List.of(raw("id", "b1", "cat", "top", "kind", "shirt", "name", "<script>alert(2)</script>", "family", "white", "light", 90,
                "photo", raw("kind", "confirmed", "img", "javascript:alert(4)", "sourceUrl", "javascript:alert(5)"), "product", raw("brand", "B", "name", "N"), "matchCandidates", List.of(raw("brand", "x", "url", "javascript:alert(8)")), "link", "javascript:alert(5)")));
        Wardrobe cleaned = WardrobeCleaner.cleanWardrobe(bad);
        Item b1 = cleaned.items().get(0);
        ok(b1.photo().img().isEmpty() && b1.photo().sourceUrl().isEmpty() && b1.link().isEmpty() && b1.photo().kind().equals("candidate") && b1.product() == null && b1.matchCandidates().get(0).url().isEmpty(), "위험한 주소는 버려지고 확인 기록 없는 확인됨은 후보로 내려간다 (글자는 그대로 두고 화면이 textContent 로 넣는다)");
        ok(WardrobeCleaner.cleanWardrobe(raw("schema", 3, "items", List.of())) == null && WardrobeCleaner.cleanWardrobe(raw("schema", 2)) == null, "모르는 스키마나 items 없는 파일은 읽지 않는다");
        Wardrobe twice = WardrobeCleaner.cleanWardrobe(toRawWardrobe(cleaned));
        ok(twice.equals(cleaned), "정리는 멱등이다");

        // 0.5.0-beta: 원피스·새 종류·새 색, 결정 뒤 물음
        Item jump = WardrobeCleaner.cleanItem(raw("cat", "dress", "kind", "jumpsuit", "name", "점프수트", "family", "purple", "light", 40, "measures", raw("length", 110, "waist", 70, "rise", 30)), 0);
        ok(jump.cat().equals("dress") && jump.kind().equals("jumpsuit") && jump.family().equals("purple") && jump.measures().equals(Map.of("length", 110.0, "waist", 70.0)), "원피스 분류·점프수트·퍼플·원피스 실측(총장·허리)이 남는다");
        ok(WardrobeCleaner.cleanItem(raw("cat", "dress", "kind", "tee"), 0).kind() == null && WardrobeCleaner.cleanItem(raw("cat", "bottom", "kind", "skirt"), 0).kind().equals("skirt")
                && WardrobeCleaner.cleanItem(raw("cat", "shoes", "kind", "heels"), 0).kind().equals("heels"), "모르는 원피스 종류는 미확인, 스커트·힐은 그대로");
        Map<String, Object> after = raw("decision", "buy", "helpful", "yes", "at", "2026-09-01", "shift", "same");
        Wardrobe.Decision d1 = WardrobeCleaner.cleanDecision(raw("id", "d", "before", raw("lean", "buy"), "after", after, "follow", raw("at", "2026-09-20", "worn", "notbought", "feel", "regret")));
        ok(d1.follow() != null && d1.follow().worn().equals("notbought") && d1.follow().feel().isEmpty(), "결국 안 샀다면 만족은 비운다");
        ok(WardrobeCleaner.cleanDecision(raw("id", "d", "before", raw("lean", "buy"), "after", after, "follow", raw("at", "2026-09-20", "worn", "few"))).follow() == null, "산다인데 만족을 안 고르면 받지 않는다");
        Map<String, Object> skip = raw("decision", "skip", "helpful", "some", "at", "2026-09-01");
        Wardrobe.Decision d2 = WardrobeCleaner.cleanDecision(raw("id", "d", "before", raw("lean", "buy"), "after", skip, "follow", raw("at", "2026-09-20", "worn", "many", "feel", "regret")));
        ok(d2.follow() != null && d2.follow().worn().isEmpty() && d2.follow().feel().equals("regret"), "안 산다는 아쉬움만 받는다");
        ok(WardrobeCleaner.cleanDecision(raw("id", "d", "before", raw("lean", "buy"), "follow", raw("at", "2026-09-20", "feel", "good"))).follow() == null
                && WardrobeCleaner.cleanDecision(raw("id", "d", "before", raw("lean", "buy"), "after", raw("decision", "hold"), "follow", raw("at", "2026-09-20", "feel", "good"))).follow() == null, "결정 전이나 보류에는 물음 답이 없다");
        Item dressN = WardrobeCleaner.cleanItem(raw("id", "dn", "cat", "dress", "kind", "dress", "family", "navy", "light", 18, "formality", 3, "pattern", "solid"), 0);
        Item coat = WardrobeCleaner.cleanItem(raw("id", "co", "cat", "outer", "kind", "coat", "family", "black", "light", 12, "formality", 3, "pattern", "solid"), 0);
        List<Recommend.Combo> recs = Recommend.recommend(List.of(dressN, coat), 3, null);
        ok(recs.size() == 1 && recs.get(0).dress() && recs.get(0).bottom() == null && recs.get(0).key().equals("dn||co"), "원피스만 있어도 코디가 나오고 키는 '원피스||아우터'");
        Item cd = WardrobeCleaner.cleanItem(raw("id", "cd", "status", "candidate", "cat", "dress", "kind", "dress", "family", "black", "light", 14, "formality", 3, "pattern", "solid"), 0);
        Judge.Verdict vd = Judge.judgeCandidate(List.of(dressN, coat), cd, "");
        ok(vd.supported() && vd.before() == 1 && vd.after() == 2 && vd.top3().size() == 1 && vd.top3().get(0).outer() == null && vd.blockers().size() == 1 && vd.needs().size() == 1, "원피스 후보: 차림 1 → 2, 색이 비슷한 아우터는 걸리는 점으로 센다");
        System.out.println(failed == 0 ? "모두 통과" : failed + "건 실패");
        return failed;
    }

    /** Item → JSON 모양의 Map (정리 함수에 다시 넣기 위해). */
    static Map<String, Object> toRaw(Item it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", it.id()); m.put("status", it.status()); m.put("cat", it.cat()); m.put("kind", it.kind()); m.put("name", it.name()); m.put("detail", it.detail());
        m.put("family", it.family()); m.put("light", it.light()); m.put("formality", it.formality()); m.put("pattern", it.pattern()); m.put("seasons", it.seasons());
        m.put("attrSource", it.attrSource()); m.put("draftNote", it.draftNote());
        m.put("photo", raw("kind", it.photo().kind(), "img", it.photo().img(), "ownImg", it.photo().ownImg(), "sourceName", it.photo().sourceName(), "sourceUrl", it.photo().sourceUrl(), "checkedAt", it.photo().checkedAt()));
        m.put("product", it.product() == null ? null : raw("brand", it.product().brand(), "name", it.product().name(), "code", it.product().code(), "confirmedAt", it.product().confirmedAt()));
        List<Object> cands = new ArrayList<>();
        for (Item.MatchCandidate c : it.matchCandidates()) cands.add(raw("brand", c.brand(), "name", c.name(), "evidence", c.evidence(), "note", c.note(), "url", c.url()));
        m.put("matchCandidates", cands);
        m.put("look3d", it.look3d() == null ? null : raw("kind", it.look3d().kind(), "fabric", it.look3d().fabric()));
        m.put("brand", it.brand()); m.put("model", it.model()); m.put("size", it.size()); m.put("boughtYear", it.boughtYear()); m.put("review", it.review()); m.put("rebuy", it.rebuy());
        m.put("fabric", it.fabric()); m.put("neck", it.neck()); m.put("measures", it.measures()); m.put("link", it.link()); m.put("price", it.price()); m.put("checkedAt", it.checkedAt());
        return m;
    }

    static Map<String, Object> toRawWardrobe(Wardrobe w) {
        List<Object> items = new ArrayList<>();
        for (Item it : w.items()) items.add(toRaw(it));
        return raw("schema", w.schema(), "kind", w.kind(), "name", w.name(), "draft", w.draft(), "note", w.note(),
                "owner", raw("nickname", w.owner().nickname(), "height", w.owner().height(), "topSize", w.owner().topSize(), "bottomSize", w.owner().bottomSize()), "items", items, "decisions", List.of());
    }

    public static void main(String[] args) {
        System.exit(run() == 0 ? 0 : 1);
    }
}
