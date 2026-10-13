package otjang.domain;

import static otjang.domain.Sanitize.arr;
import static otjang.domain.Sanitize.num;
import static otjang.domain.Sanitize.obj;
import static otjang.domain.Sanitize.safeDate;
import static otjang.domain.Sanitize.safeImg;
import static otjang.domain.Sanitize.safeLink;
import static otjang.domain.Sanitize.str;
import static otjang.domain.Sanitize.whole;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 파일이나 요청에서 온 옷장·상품 자료를 아는 항목만 남겨 정리한다. 스키마 1(v0.3)과 2를 모두 받아 2로 돌려준다. 두 번 해도 같다(멱등).
 * app/src/wardrobe.js 의 cleanItem·cleanWardrobe·cleanDecision, app/src/catalog.js 의 cleanProduct·cleanCatalog 를 옮긴 것이다.
 * 입력은 JSON 을 Map/List/String/Number/Boolean 으로 푼 것이다(Jackson, Gson 모두 이 모양을 준다).
 *
 * 지키는 규칙: 사진 상태는 정리 과정에서 올라가지 않는다. 확인 기록(product.confirmedAt)이 없는 "확인됨"은 후보로 내린다.
 */
public final class WardrobeCleaner {
    private WardrobeCleaner() {}

    /** 옷 한 벌. 모르는 분류이면 null(버린다). i 는 id 가 없을 때 쓰는 자리 번호. */
    public static Item cleanItem(Object rawObj, int i) {
        Map<String, Object> raw = obj(rawObj);
        if (raw == null) return null;
        Object catV = raw.get("cat");
        String cat = catV instanceof String c && Vocab.CATS.containsKey(c) ? c : null;
        if (cat == null) return null;

        Map<String, Double> measures = new LinkedHashMap<>();
        Map<String, Object> mraw = obj(raw.get("measures"));
        if (mraw != null) for (String k : Vocab.MEASURES.get(cat)) { Double v = num(mraw.get(k), 1, 300); if (v != null) measures.put(k, v); }

        String attrSource = raw.get("attrSource") instanceof String a && Vocab.ATTR_SOURCE.containsKey(a) ? a : null;
        if (attrSource == null) {                                                                   // 스키마 1: source + confirmed
            attrSource = "photo-draft".equals(raw.get("source")) ? (Boolean.TRUE.equals(raw.get("confirmed")) ? "owner-confirmed" : "photo-draft") : "owner";
        }
        Item.Photo photo = cleanPhoto(raw.get("photo"), raw.get("img"));
        Item.Product product = null;
        if (photo.kind().equals("confirmed")) {
            Map<String, Object> p = obj(raw.get("product"));
            if (p != null && !safeDate(p.get("confirmedAt")).isEmpty()) {
                product = new Item.Product(str(p.get("brand"), 60).strip(), str(p.get("name"), 80).strip(), str(p.get("code"), 60).strip(), (String) p.get("confirmedAt"));
            } else {
                photo = photo.withKind("candidate");                                                  // 확인 기록이 없는 '확인됨'은 후보로 내린다
            }
        }
        List<Item.MatchCandidate> cands = new ArrayList<>();
        List<Object> craw = arr(raw.get("matchCandidates"));
        if (craw != null) for (Object c : craw.subList(0, Math.min(Vocab.MAX_CANDS, craw.size()))) { Item.MatchCandidate cc = cleanCandidate(c); if (cc != null) cands.add(cc); }

        String id = str(raw.get("id"), 40);
        String statusRaw = raw.get("status") instanceof String s ? s : "";
        String kindRaw = raw.get("kind") instanceof String k ? k : "";
        String name = str(raw.get("name"), 80);
        Double light = num(raw.get("light"), 0, 100);
        Integer formality = Sanitize.formality(raw.get("formality"));
        return new Item(
                id.isEmpty() ? "x" + i : id,
                statusRaw.equals("candidate") ? "candidate" : statusRaw.equals("gone") ? "gone" : "owned",
                cat, Vocab.KINDS.get(cat).containsKey(kindRaw) ? kindRaw : null, name.isEmpty() ? "이름 없음" : name, str(raw.get("detail"), 80),
                raw.get("family") instanceof String f && Vocab.FAM.containsKey(f) ? f : null, light == null ? null : (int) Math.round(light),
                formality, raw.get("pattern") instanceof String p && Vocab.PATTERNS.containsKey(p) ? p : null, seasons(raw.get("seasons")),
                attrSource, str(raw.get("draftNote"), 200),
                photo, product, List.copyOf(cands), cleanLook(raw.get("look3d")),
                str(raw.get("brand"), 60), str(raw.get("model"), 80), str(raw.get("size"), 30), yearOf(raw.get("boughtYear")), str(raw.get("review"), 500),
                raw.get("rebuy") instanceof String r && Vocab.REBUY.containsKey(r) ? r : "unknown",
                raw.get("fabric") instanceof String fb && Vocab.FABRIC.containsKey(fb) ? fb : "",
                raw.get("neck") instanceof String nk && Vocab.NECK.containsKey(nk) ? nk : "",
                Map.copyOf(measures), safeLink(raw.get("link")), whole(raw.get("price"), 0, 1e9), safeDate(raw.get("checkedAt")));
    }

    /** 1950..2100 사이 수. JS 는 소수도 두지만 서버는 정수로 저장한다 [서버 쪽 차이]. */
    private static Integer yearOf(Object v) {
        Long y = whole(v, 1950, 2100);
        return y == null ? null : y.intValue();
    }

    public static List<String> seasons(Object v) {
        List<Object> raw = arr(v);
        if (raw == null) return List.of();
        List<String> out = new ArrayList<>();
        for (String s : Vocab.SEASONS) if (raw.contains(s)) out.add(s);
        return List.copyOf(out);
    }

    public static Item.MatchCandidate cleanCandidate(Object rawObj) {
        Map<String, Object> c = obj(rawObj);
        if (c == null) return null;
        String brand = str(c.get("brand"), 60).strip(), name = str(c.get("name"), 80).strip();
        if (brand.isEmpty() && name.isEmpty()) return null;
        String ev = c.get("evidence") instanceof String e && Vocab.EVIDENCE.containsKey(e) ? e : "owner";
        return new Item.MatchCandidate(brand, name, ev, str(c.get("note"), 200), safeLink(c.get("url")));
    }

    /** photo 객체와 스키마 1 의 img 를 함께 받는다. photo.img 키가 아예 없을 때만 스키마 1 의 img 를 쓴다(JS 의 p.img === undefined 와 같다). */
    public static Item.Photo cleanPhoto(Object rawObj, Object legacyImg) {
        Map<String, Object> p = obj(rawObj);
        if (p == null) p = Map.of();
        String img = safeImg(p.get("img"));
        if (img.isEmpty() && !p.containsKey("img")) img = safeImg(legacyImg);
        String ownImg = safeImg(p.get("ownImg"));
        String kind = p.get("kind") instanceof String k && Vocab.PHOTO_KIND.containsKey(k) ? k : (img.isEmpty() ? "none" : "own");
        if (kind.equals("own")) { ownImg = img.isEmpty() ? ownImg : img; img = ownImg; if (img.isEmpty()) kind = "none"; }
        if (kind.equals("none")) { if (!img.isEmpty()) { ownImg = img; kind = "own"; } else if (!ownImg.isEmpty()) { img = ownImg; kind = "own"; } }
        if (kind.equals("own") || kind.equals("none")) return Item.Photo.own(ownImg);
        return new Item.Photo(kind, img, ownImg, str(p.get("sourceName"), 80), safeLink(p.get("sourceUrl")), safeDate(p.get("checkedAt")));
    }

    public static Item.Look3d cleanLook(Object rawObj) {
        Map<String, Object> raw = obj(rawObj);
        if (raw == null || !(raw.get("kind") instanceof String k) || !Vocab.LOOK_KINDS.containsKey(k)) return null;
        return new Item.Look3d(k, str(raw.get("fabric"), 40).replaceAll("[^a-zA-Z0-9-]", ""));
    }

    public static Wardrobe.Decision cleanDecision(Object rawObj) {
        Map<String, Object> d = obj(rawObj);
        if (d == null) return null;
        Map<String, Object> before = obj(d.get("before"));
        if (before == null || !(before.get("lean") instanceof String lean) || !Vocab.LEAN.containsKey(lean)) return null;
        Map<String, Object> s = obj(d.get("summary"));
        if (s == null) s = Map.of();
        Wardrobe.Decision.After after = null;
        Map<String, Object> a = obj(d.get("after"));
        if (a != null && a.get("decision") instanceof String dec && Vocab.DECIDE.containsKey(dec)) {
            after = new Wardrobe.Decision.After(dec, a.get("helpful") instanceof String h && Vocab.HELP.containsKey(h) ? h : "some", str(a.get("note"), 300), safeDate(a.get("at")),
                    a.get("shift") instanceof String sh && Vocab.SHIFT.containsKey(sh) ? sh : "same", str(a.get("insight"), 200),
                    a.get("comparedWith") instanceof String cmp && List.of("none", "chatbot", "photos", "other").contains(cmp) ? cmp : "none", str(a.get("comparisonNote"), 200));
        }
        Wardrobe.Decision.Followup followup = null;
        Map<String, Object> f = obj(d.get("followup"));
        if (after != null && f != null && f.get("outcome") instanceof String outcome && FollowupContract.OUTCOMES.contains(outcome)) {
            followup = new Wardrobe.Decision.Followup(outcome, FollowupContract.value(f.get("worn"), FollowupContract.YES_NO),
                    FollowupContract.value(f.get("regret"), FollowupContract.YES_NO),
                    FollowupContract.sizeRelevant(outcome) ? FollowupContract.value(f.get("sizeResult"), FollowupContract.SIZE_RESULTS) : "unknown",
                    outcome.equals("returned") ? FollowupContract.value(f.get("returnReason"), FollowupContract.RETURN_REASONS) : "unknown",
                    str(f.get("note"), 300), safeDate(f.get("at")));
        }
        return new Wardrobe.Decision(str(d.get("id"), 40), str(d.get("itemId"), 40), str(d.get("name"), 80),
                new Wardrobe.Decision.Before(lean, str(before.get("reason"), 200), safeDate(before.get("at"))),
                new Wardrobe.Decision.Summary(count(s.get("overlaps"), 999), count(s.get("added"), 9999), count(s.get("blockers"), 999)), after, followup,
                after == null ? null : cleanFollow(d.get("follow"), after.decision()));
    }

    /** 결정 뒤 물음의 답(wardrobe.js cleanFollow). 산다: worn 필수, 결국 안 샀다가 아니면 feel 필수. 안 산다: feel 필수. 보류·맞지 않는 값이면 null. */
    public static Wardrobe.Decision.Follow cleanFollow(Object rawObj, String decision) {
        Map<String, Object> f = obj(rawObj);
        if (f == null || safeDate(f.get("at")).isEmpty()) return null;
        String at = (String) f.get("at");
        String worn = f.get("worn") instanceof String w ? w : "", feel = f.get("feel") instanceof String fe ? fe : "";
        if ("buy".equals(decision)) {
            if (!Vocab.WORN.containsKey(worn)) return null;
            if (worn.equals("notbought")) return new Wardrobe.Decision.Follow(at, "notbought", "");
            return Vocab.FEEL_BUY.containsKey(feel) ? new Wardrobe.Decision.Follow(at, worn, feel) : null;
        }
        if ("skip".equals(decision)) return Vocab.FEEL_SKIP.containsKey(feel) ? new Wardrobe.Decision.Follow(at, "", feel) : null;
        return null;
    }

    private static Integer count(Object v, int hi) {
        Double d = num(v, 0, hi);
        return d == null ? null : (int) Math.round(d);
    }

    /** 옷장 파일 전체. 스키마 1이든 2든 스키마 2로. 모르는 파일이면 null. */
    public static Wardrobe cleanWardrobe(Object rawObj) {
        Map<String, Object> raw = obj(rawObj);
        if (raw == null || !(raw.get("schema") instanceof Number sc) || (sc.doubleValue() != 1 && sc.doubleValue() != 2)) return null;
        List<Object> itemsRaw = arr(raw.get("items"));
        if (itemsRaw == null) return null;
        RecordLimits.requireReadable(itemsRaw.size(), "items");
        List<Object> draw = arr(raw.get("decisions"));
        if (draw != null) RecordLimits.requireReadable(draw.size(), "decisions");
        Map<String, Object> o = obj(raw.get("owner"));
        if (o == null) o = Map.of();
        Set<String> ids = new HashSet<>();
        List<Item> items = new ArrayList<>();
        for (int i = 0; i < itemsRaw.size(); i++) { Item it = cleanItem(itemsRaw.get(i), i); if (it != null && ids.add(it.id())) items.add(it); }
        List<Wardrobe.Decision> decisions = new ArrayList<>();
        if (draw != null) for (Object d : draw) { Wardrobe.Decision dd = cleanDecision(d); if (dd != null) decisions.add(dd); }
        return new Wardrobe(Vocab.SCHEMA, "template".equals(raw.get("kind")) ? "template" : "wardrobe", str(raw.get("name"), 60), Boolean.TRUE.equals(raw.get("draft")), str(raw.get("note"), 200),
                new Wardrobe.Owner(str(o.get("nickname"), 30), num(o.get("height"), 100, 230), str(o.get("topSize"), 20), str(o.get("bottomSize"), 20)),
                List.copyOf(items), List.copyOf(decisions));
    }

    // ---------- 상품 목록 (catalog.js) ----------

    public static CatalogProduct cleanProduct(Object rawObj, int i) {
        Map<String, Object> raw = obj(rawObj);
        if (raw == null) return null;
        String cat = raw.get("cat") instanceof String c && Vocab.CATS.containsKey(c) ? c : null;
        if (cat == null) return null;
        String name = str(raw.get("name"), 80).strip();
        if (name.isEmpty()) return null;
        String id = str(raw.get("id"), 40);
        String kindRaw = raw.get("kind") instanceof String k ? k : "";
        Double light = num(raw.get("light"), 0, 100);
        Integer formality = Sanitize.formality(raw.get("formality"));
        return new CatalogProduct(id.isEmpty() ? "p" + i : id, str(raw.get("brand"), 60).strip(), name, str(raw.get("code"), 60).strip(),
                cat, Vocab.KINDS.get(cat).containsKey(kindRaw) ? kindRaw : null, raw.get("family") instanceof String f && Vocab.FAM.containsKey(f) ? f : null,
                light == null ? null : (int) Math.round(light), formality, raw.get("pattern") instanceof String p && Vocab.PATTERNS.containsKey(p) ? p : null,
                seasons(raw.get("seasons")), safeLink(raw.get("link")), whole(raw.get("price"), 0, 1e9), safeDate(raw.get("checkedAt")), safeImg(raw.get("img")),
                str(raw.get("note"), 200), safeDate(raw.get("addedAt")));
    }

    public static CatalogProduct.Catalog cleanCatalog(Object rawObj) {
        Map<String, Object> raw = obj(rawObj);
        if (raw == null || !(raw.get("schema") instanceof Number sc) || sc.doubleValue() != CatalogProduct.Catalog.SCHEMA || !"catalog".equals(raw.get("kind"))) return null;
        List<Object> praw = arr(raw.get("products"));
        if (praw == null) return null;
        RecordLimits.requireReadable(praw.size(), "products");
        Set<String> ids = new HashSet<>();
        List<CatalogProduct> out = new ArrayList<>();
        for (int i = 0; i < praw.size(); i++) { CatalogProduct p = cleanProduct(praw.get(i), i); if (p != null && ids.add(p.id())) out.add(p); }
        return new CatalogProduct.Catalog(CatalogProduct.Catalog.SCHEMA, str(raw.get("name"), 60), str(raw.get("note"), 200), List.copyOf(out));
    }
}
