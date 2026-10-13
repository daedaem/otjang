package otjang.domain;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 앱(JavaScript)과 서버(Java)의 규칙 결과가 같은지 확인한다. app/tools/golden.mjs 가 만든 app/test/golden/sample-results.json 과
 * 같은 입력(스키마 1 예시 → 옮기기, 스키마 2 예시)으로 같은 구조를 만들어 JSON 으로 견준다.
 * JUnit 없이도 돌 수 있게 main 을 두었다: java -cp <gson.jar>:<classes> otjang.domain.GoldenParity <저장소 루트>
 * (Maven Central 이 막힌 환경에서 javac + Maven 배포판의 gson 으로 확인했다. 2026-10-12)
 */
public final class GoldenParity {
    private GoldenParity() {}

    private static final Gson GSON = new GsonBuilder().serializeNulls().create();

    /** 비교에 쓰는 후보 6벌 (golden.mjs CANDS 와 같다). */
    static List<Item> cands() {
        List<Map<String, Object>> raws = List.of(
                cand("g-shirt-white", "top", "shirt", "white", 95, 3, "solid"),
                cand("g-sweat-navy", "top", "sweat", "navy", 18, 1, "graphic"),
                cand("g-knit-navy", "top", "knit", "navy", 18, 2, "solid"),
                cand("g-jacket-beige", "outer", "jacket", "beige", 72, 2, "solid"),
                cand("g-derby-black", "shoes", "derby", "black", 10, 3, "solid"),
                cand("g-slacks-gray", "bottom", "slacks", "gray", 45, 3, "solid"));
        List<Item> out = new ArrayList<>();
        for (Map<String, Object> r : raws) out.add(WardrobeCleaner.cleanItem(r, 0));
        return out;
    }

    /** 예시 B(원피스·스커트 옷장)에 비춰 볼 후보 6벌 (golden.mjs CANDS_B 와 같다). */
    static List<Item> candsB() {
        List<Map<String, Object>> raws = List.of(
                cand("g-dress-black", "dress", "dress", "black", 12, 3, "solid"),
                cand("g-dress-navy", "dress", "dress", "navy", 20, 3, "solid"),
                cand("g-blazer-black", "outer", "blazer", "black", 12, 3, "solid"),
                cand("g-skirt-pink", "bottom", "skirt", "pink", 80, 2, "solid"),
                cand("g-blouse-yellow", "top", "blouse", "yellow", 70, 3, "solid"),
                cand("g-heels-black", "shoes", "heels", "black", 12, 3, "solid"));
        List<Item> out = new ArrayList<>();
        for (Map<String, Object> r : raws) out.add(WardrobeCleaner.cleanItem(r, 0));
        return out;
    }

    private static Map<String, Object> cand(String id, String cat, String kind, String family, int light, int formality, String pattern) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("status", "candidate"); m.put("cat", cat); m.put("kind", kind); m.put("family", family); m.put("light", light);
        m.put("formality", formality); m.put("pattern", pattern); m.put("seasons", Vocab.SEASONS); m.put("name", id);
        return m;
    }

    /** golden.mjs 의 compute 와 같은 구조. */
    // Assumed confirmation only inside rule fixtures. Real source JSON is never upgraded or written.
    private static List<Item> ruleFixture(List<Item> items) {
        List<Item> out = new ArrayList<>();
        for (Item item : items) {
            Map<String, Object> raw = GSON.fromJson(GSON.toJson(item), new TypeToken<Map<String, Object>>() {}.getType());
            raw.put("attrSource", "owner-confirmed");
            if (item.seasons().isEmpty()) raw.put("seasons", Vocab.SEASONS);
            out.add(WardrobeCleaner.cleanItem(raw, 0));
        }
        return out;
    }

    private static List<CatalogProduct> ruleProducts(List<CatalogProduct> products) {
        List<CatalogProduct> out = new ArrayList<>();
        for (CatalogProduct p : products) {
            Map<String, Object> raw = GSON.fromJson(GSON.toJson(p), new TypeToken<Map<String, Object>>() {}.getType());
            if (p.seasons().isEmpty()) raw.put("seasons", Vocab.SEASONS);
            out.add(WardrobeCleaner.cleanProduct(raw, 0));
        }
        return out;
    }

    public static Map<String, Object> compute(List<Item> items, List<Item> tpl) {
        return compute(items, tpl, cands());
    }

    public static Map<String, Object> compute(List<Item> items, List<Item> tpl, List<Item> cands) {
        items = ruleFixture(items); tpl = ruleFixture(tpl);
        Map<String, Object> judge = new LinkedHashMap<>(), recommend = new LinkedHashMap<>(), compare = new LinkedHashMap<>();
        for (Item c : cands) for (String season : List.of("", "겨울")) {
            Judge.Verdict r = Judge.judgeCandidate(items, c, season);
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("supported", r.supported());
            List<Object> overlaps = new ArrayList<>();
            for (Judge.Overlap ov : r.overlaps()) overlaps.add(List.of(ov.item().id(), ov.level(), ov.same(), ov.diff()));
            o.put("overlaps", overlaps); o.put("before", r.before()); o.put("after", r.after());
            List<Object> added = new ArrayList<>();
            for (Judge.Added a : r.added()) added.add(java.util.Arrays.asList(a.top().id(), a.bottom() == null ? null : a.bottom().id(), a.score(), a.why()));   // 원피스는 bottom 이 null
            o.put("added", added);
            List<Object> top3 = new ArrayList<>();
            for (Judge.Pick p : r.top3()) top3.add(ids(p.top().id(), p.bottom() == null ? null : p.bottom().id(), p.outer() == null ? null : p.outer().id(), p.score(), p.why(), List.of()));
            o.put("top3", top3);
            List<Object> blockers = new ArrayList<>();
            for (Judge.Blocker b : r.blockers()) { Map<String, Object> bm = new LinkedHashMap<>(); bm.put("text", b.text()); bm.put("count", b.count()); bm.put("total", b.total()); bm.put("word", b.word()); blockers.add(bm); }
            o.put("blockers", blockers); o.put("needs", r.needs()); o.put("note", r.note());
            judge.put(c.id() + (season.isEmpty() ? "" : "@" + season), o);
        }
        List<Item> owned = new ArrayList<>();
        for (Item i : items) if (i.isOwned()) owned.add(i);
        for (String season : List.of("", "봄", "여름", "가을", "겨울")) {
            List<Item> pool = new ArrayList<>();
            for (Item i : owned) if (i.inSeason(season)) pool.add(i);
            List<Recommend.Combo> first = Recommend.recommend(pool, 3, null);
            List<String> keys = new ArrayList<>();
            for (Recommend.Combo c : first) keys.add(c.key());
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("first", combos(first)); rec.put("next", combos(Recommend.recommend(pool, 3, keys)));
            recommend.put(season.isEmpty() ? "all" : season, rec);
            Judge.Comparison cmp = Judge.compareWardrobes(items, tpl, season);
            Map<String, Object> cm = new LinkedHashMap<>();
            List<Object> both = new ArrayList<>();
            for (Judge.Match m : cmp.both()) both.add(List.of(m.mine().id(), m.theirs().id(), m.how()));
            cm.put("both", both); cm.put("onlyTheirs", idsOf(cmp.onlyTheirs())); cm.put("onlyMine", idsOf(cmp.onlyMine()));
            compare.put(season.isEmpty() ? "all" : season, cm);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("judge", judge); out.put("recommend", recommend); out.put("compare", compare);
        return out;
    }

    private static List<Object> combos(List<Recommend.Combo> list) {
        List<Object> out = new ArrayList<>();
        for (Recommend.Combo c : list) {
            Map<String, Object> m = ids(c.top(), c.bottom(), c.outer(), c.score(), c.why(), c.caution());
            if (c.dress()) m.put("dress", true);                                                     // 앱은 원피스 차림에만 dress: true 를 둔다
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> ids(String top, String bottom, String outer, int score, List<String> why, List<String> caution) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("top", top); m.put("bottom", bottom); m.put("outer", outer); m.put("score", score); m.put("why", why); m.put("caution", caution);
        return m;
    }

    private static List<String> idsOf(List<Garment> list) {
        List<String> out = new ArrayList<>();
        for (Garment g : list) out.add(g.id());
        return out;
    }

    static Object readJson(Path p) throws IOException {
        return GSON.fromJson(Files.readString(p, StandardCharsets.UTF_8), new TypeToken<Object>() {}.getType());
    }

    /** 저장소 루트를 받아 두 입력(스키마 1 → 옮김, 스키마 2) 모두 골든과 같은지 확인한다. 다르면 첫 차이를 담은 메시지를 돌려주고, 같으면 null. */
    public static String check(Path repoRoot) throws IOException {
        Path app = repoRoot.resolve("app");
        JsonElement golden = JsonParser.parseString(Files.readString(app.resolve("test/golden/sample-results.json"), StandardCharsets.UTF_8));
        Wardrobe tplW = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("data/template-ivy.json")));
        Wardrobe v1 = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("test/fixtures/wardrobe-v1.json")));
        Wardrobe v2 = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("data/sample-wardrobe.json")));
        if (tplW == null || v1 == null || v2 == null) return "입력 파일을 옷장으로 읽지 못했다";
        for (var in : List.of(Map.entry("v1→v2", v1), Map.entry("v2", v2))) {
            JsonElement got = GSON.toJsonTree(compute(in.getValue().items(), tplW.items()));
            String diff = firstDiff("", golden, got);
            if (diff != null) return in.getKey() + ": " + diff;
        }
        JsonElement goldenB = JsonParser.parseString(Files.readString(app.resolve("test/golden/sample-b-results.json"), StandardCharsets.UTF_8));
        Wardrobe vB = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("data/sample-wardrobe-b.json")));
        if (vB == null) return "예시 B 를 옷장으로 읽지 못했다";
        String diffB = firstDiff("", goldenB, GSON.toJsonTree(compute(vB.items(), tplW.items(), candsB())));
        if (diffB != null) return "예시 B: " + diffB;
        return null;
    }

    /** 첫 차이의 경로와 값. 같으면 null. */
    static String firstDiff(String path, JsonElement a, JsonElement b) {
        if (a.equals(b)) return null;
        if (a.isJsonObject() && b.isJsonObject()) {
            for (String k : a.getAsJsonObject().keySet()) {
                if (!b.getAsJsonObject().has(k)) return path + "/" + k + " 가 서버 결과에 없다";
                String d = firstDiff(path + "/" + k, a.getAsJsonObject().get(k), b.getAsJsonObject().get(k));
                if (d != null) return d;
            }
            for (String k : b.getAsJsonObject().keySet()) if (!a.getAsJsonObject().has(k)) return path + "/" + k + " 가 골든에 없다";
            return path + " 알 수 없는 차이";
        }
        if (a.isJsonArray() && b.isJsonArray()) {
            if (a.getAsJsonArray().size() != b.getAsJsonArray().size()) return path + " 길이 " + a.getAsJsonArray().size() + " ≠ " + b.getAsJsonArray().size();
            for (int i = 0; i < a.getAsJsonArray().size(); i++) {
                String d = firstDiff(path + "[" + i + "]", a.getAsJsonArray().get(i), b.getAsJsonArray().get(i));
                if (d != null) return d;
            }
            return path + " 알 수 없는 차이";
        }
        return path + ": 골든 " + a + " ≠ 서버 " + b;
    }

    /** 상품 순위·상품→후보·재확인 필요 판정이 server/tools/gen-rank-golden.mjs 가 만든 스냅샷과 같은지. 다르면 첫 차이, 같으면 null. */
    public static String checkCatalog(Path repoRoot) throws IOException {
        Path app = repoRoot.resolve("app");
        JsonElement golden = JsonParser.parseString(Files.readString(repoRoot.resolve("server/src/test/resources/golden/catalog-rank.json"), StandardCharsets.UTF_8));
        Wardrobe tplW = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("data/template-ivy.json")));
        Wardrobe v2 = WardrobeCleaner.cleanWardrobe(readJson(app.resolve("data/sample-wardrobe.json")));
        String today = golden.getAsJsonObject().get("today").getAsString();
        List<CatalogProduct> products = new ArrayList<>();
        Object goldenRaw = readJson(repoRoot.resolve("server/src/test/resources/golden/catalog-rank.json"));
        List<?> praw = goldenRaw instanceof Map<?, ?> m && m.get("products") instanceof List<?> l ? l : List.of();
        for (int i = 0; i < praw.size(); i++) products.add(WardrobeCleaner.cleanProduct(praw.get(i), i));
        List<Item> fixtureItems = ruleFixture(v2.items());
        List<Garment> gaps = Judge.compareWardrobes(fixtureItems, ruleFixture(tplW.items()), "").onlyTheirs();
        List<CatalogProduct> fixtureProducts = ruleProducts(products);
        Map<String, Object> rank = new LinkedHashMap<>();
        rank.put("all", picks(CatalogRank.rank(fixtureItems, fixtureProducts, "", gaps, today, null)));
        rank.put("겨울", picks(CatalogRank.rank(fixtureItems, fixtureProducts, "겨울", gaps, today, null)));
        rank.put("noGaps", picks(CatalogRank.rank(fixtureItems, fixtureProducts, "", null, today, null)));
        rank.put("stale30", picks(CatalogRank.rank(fixtureItems, fixtureProducts, "", gaps, today, 30)));
        List<Object> toCand = new ArrayList<>(), stale = new ArrayList<>();
        for (CatalogProduct p : products) {
            toCand.add(CatalogRank.toCandidate(p, today));
            List<Object> row = new ArrayList<>(); row.add(p.id()); row.add(CatalogRank.isStale(p, today, null)); row.add(CatalogRank.daysSince(p.checkedAt(), today)); stale.add(row);
        }
        Map<String, Object> got = new LinkedHashMap<>();
        got.put("today", today); got.put("products", products); got.put("rank", rank); got.put("toCandidate", toCand); got.put("stale", stale);
        return firstDiff("", golden, GSON.toJsonTree(got));
    }

    private static List<Object> picks(List<CatalogRank.Ranked> list) {
        List<Object> out = new ArrayList<>();
        for (CatalogRank.Ranked r : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.product().id()); m.put("score", r.score()); m.put("reasons", r.reasons()); m.put("cautions", r.cautions()); m.put("added", r.added());
            m.put("overlaps", r.overlaps());
            List<Object> blockers = new ArrayList<>();
            for (Judge.Blocker b : r.blockers()) { Map<String, Object> bm = new LinkedHashMap<>(); bm.put("text", b.text()); bm.put("count", b.count()); bm.put("total", b.total()); bm.put("word", b.word()); blockers.add(bm); }
            m.put("blockers", blockers); m.put("gap", r.gap() == null ? null : r.gap().id()); m.put("stale", r.stale()); m.put("supported", r.supported());
            List<Object> top3 = new ArrayList<>();
            for (Judge.Pick c : r.top3()) { Map<String, Object> cm = new LinkedHashMap<>(); cm.put("top", c.top().id()); cm.put("bottom", c.bottom() == null ? null : c.bottom().id()); cm.put("outer", c.outer() == null ? null : c.outer().id()); cm.put("score", c.score()); top3.add(cm); }
            m.put("top3", top3);
            out.add(m);
        }
        return out;
    }

    public static void main(String[] args) throws IOException {
        Path root = Path.of(args.length > 0 ? args[0] : ".");
        String diff = check(root);
        if (diff != null) { System.out.println("차이(판정·코디·비교): " + diff); System.exit(1); }
        System.out.println("골든 회귀 일치: 앱(JS)과 서버(Java)의 판정·코디·비교 결과가 같다 (예시 A 두 입력 + 원피스·스커트 예시 B)");
        diff = checkCatalog(root);
        if (diff != null) { System.out.println("차이(상품 순위): " + diff); System.exit(1); }
        System.out.println("골든 회귀 일치: 상품 순위·상품→후보·재확인 필요 판정이 같다");
    }
}
