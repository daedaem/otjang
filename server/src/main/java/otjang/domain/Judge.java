package otjang.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Collections;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 구매 후보 판정과 옷장 비교. AI 를 쓰지 않는다. app/src/judge.js 를 옮긴 것이다.
 * 결과에 확률이나 "사라/사지 마라"는 판정은 없다. 규칙이 본 사실과 그 근거 문장만 돌려준다.
 */
public final class Judge {
    private Judge() {}

    /** 밝기 차이가 이 안이면 "비슷한 밝기"로 본다 [제안값]. */
    public static final int LIGHT_NEAR = 15;

    public record Similarity(Boolean overlap, String level, List<String> same, List<String> diff, Integer gap) {}
    public record Overlap(Garment item, String level, List<String> same, List<String> diff, int gap) {}
    /**
     * 후보로 새로 생기는 상의·하의 쌍. partner 는 후보의 짝(상의 후보면 하의, 하의 후보면 상의, 아우터 후보면 상의).
     * 원피스 차림은 top 자리에 원피스, bottom 은 null, dress 는 true 다 (judge.js 와 같다).
     */
    public record Added(Garment top, Garment bottom, Garment partner, int score, List<String> why, List<Garment> outers, boolean dress) {
        public Added(Garment top, Garment bottom, Garment partner, int score, List<String> why, List<Garment> outers) { this(top, bottom, partner, score, why, outers, false); }
    }
    public record Pick(Garment top, Garment bottom, Garment outer, int score, List<String> why, boolean dress) {
        public Pick(Garment top, Garment bottom, Garment outer, int score, List<String> why) { this(top, bottom, outer, score, why, false); }
    }
    public record Blocker(String text, int count, int total, String word) {}
    /** 주의 사항 없는 차림 하나. 원피스면 bottom 은 null, dress 는 true. */
    public record Pair(Garment top, Garment bottom, int score, List<String> why, boolean dress) {
        public Pair(Garment top, Garment bottom, int score, List<String> why) { this(top, bottom, score, why, false); }
    }

    /**
     * 판정 결과. before/after 는 주의 사항 없는 차림(상의·하의 쌍 + 원피스)의 수(아우터 후보는 그 아우터를 걸칠 수 있는 차림의 수), added 는 새로 생기는 쌍,
     * top3 는 대표 조합, blockers 는 조합이 안 되는 이유와 그 이유에 걸린 옷의 수, needs 는 조합이 하나도 없을 때 필요한 옷 문장.
     */
    public record ReviewItem(Garment item, List<String> missing) {}
    public record Verdict(boolean supported, List<Overlap> overlaps, Integer before, Integer after, List<Added> added, List<Pick> top3, List<Blocker> blockers, List<String> needs, String note,
                          String status, List<String> missing, List<ReviewItem> excludedItems, int assessedCount) {
        public Verdict(boolean supported, List<Overlap> overlaps, Integer before, Integer after, List<Added> added, List<Pick> top3, List<Blocker> blockers, List<String> needs, String note) {
            this(supported, overlaps, before, after, added, top3, blockers, needs, note, "ready", List.of(), List.of(), 0);
        }
    }

    public record Match(Garment mine, Garment theirs, String how) {}
    public record Comparison(List<Match> both, List<Garment> onlyTheirs, List<Garment> onlyMine, List<ReviewItem> unassessedMine, List<ReviewItem> unassessedTheirs, String status) {}

    private static boolean samePattern(Garment a, Garment b) {
        return a.patterned() ? a.pattern().equals(b.pattern()) : !b.patterned();
    }

    static String norm(String s) {
        return (s == null ? "" : s).toLowerCase(Locale.ROOT).replaceAll("(?U)[\\s·.,/()\\-_]+", "");
    }

    /** 두 옷이 겹쳐 보이는지. 같은 점과 다른 점을 문장으로 돌려준다. */
    public static Similarity similarity(Garment a, Garment b) {
        List<String> same = new ArrayList<>(), diff = new ArrayList<>();
        if (!Assessment.assess(a).ready() || !Assessment.assess(b).ready()) return new Similarity(null, "unassessed", same, diff, null);
        if (!a.cat().equals(b.cat())) return new Similarity(false, "none", same, diff, 0);
        int gap = Math.abs(a.light() - b.light());
        boolean sameKind = a.kind().equals(b.kind()), sameGroup = Vocab.group(a).equals(Vocab.group(b)), sp = samePattern(a, b);
        (sameKind ? same : diff).add(sameKind ? "종류가 같습니다" : "종류가 다릅니다");
        (sameGroup ? same : diff).add(sameGroup ? "색 계열이 같습니다" : "색 계열이 다릅니다");
        (gap <= LIGHT_NEAR ? same : diff).add(gap <= LIGHT_NEAR ? "밝기가 비슷합니다" : "밝기가 다릅니다");
        (sp ? same : diff).add(sp ? (a.patterned() ? "무늬가 같습니다" : "둘 다 무지입니다") : "무늬가 다릅니다");
        int fgap = Math.abs(formalityOr2(a) - formalityOr2(b));
        (fgap <= 1 ? same : diff).add(fgap <= 1 ? "격식이 비슷합니다" : "격식이 다릅니다");
        boolean colorClose = sameGroup && gap <= LIGHT_NEAR;
        boolean overlap = colorClose && (sameKind || sp);
        String level = !overlap ? "none" : (sameKind && sp && fgap <= 1 ? "strong" : "partial");
        return new Similarity(overlap, level, List.copyOf(same), List.copyOf(diff), gap);
    }

    private static int formalityOr2(Garment g) {
        return g.formality();
    }

    /** 후보와 겹쳐 보이는 보유 옷. 많이 겹치는 것부터, 같은 수준이면 밝기 차이가 작은 것부터. */
    public static List<Overlap> findOverlaps(Garment candidate, List<? extends Garment> items) {
        List<Overlap> out = new ArrayList<>();
        if (!Assessment.assess(candidate).ready()) return out;
        for (Garment it : items) {
            if (!it.isOwned() || it.id().equals(candidate.id()) || !Assessment.assess(it).ready()) continue;
            Similarity s = similarity(candidate, it);
            if (s.overlap()) out.add(new Overlap(it, s.level(), s.same(), s.diff(), s.gap()));
        }
        out.sort((x, y) -> x.level().equals(y.level()) ? Integer.compare(x.gap(), y.gap()) : (x.level().equals("strong") ? -1 : 1));
        return out;
    }

    /** 상의·하의 쌍 가운데 주의 사항이 없는 것. */
    public static List<Pair> cleanPairs(List<? extends Garment> items) {
        List<Pair> out = new ArrayList<>();
        for (Garment top : items) {
            if (!Assessment.assess(top).ready() || !top.cat().equals("top")) continue;
            for (Garment bottom : items) {
                if (!Assessment.assess(bottom).ready() || !bottom.cat().equals("bottom")) continue;
                Recommend.Score p = Recommend.scorePair(top, bottom);
                if (p.caution().isEmpty()) out.add(new Pair(top, bottom, p.score(), p.why()));
            }
        }
        return out;
    }

    /** 주의 사항 없는 차림: 상의·하의 쌍 + 원피스 한 벌씩. */
    public static List<Pair> cleanOutfits(List<? extends Garment> items) {
        List<Pair> out = new ArrayList<>(cleanPairs(items));
        for (Garment d : items) {
            if (!d.cat().equals("dress")) continue;
            Recommend.Score s = Recommend.scoreDress(d);
            out.add(new Pair(d, null, s.score(), s.why(), true));
        }
        return out;
    }

    private static List<Blocker> tally(List<String> cautions, int total, String word) {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (String s : cautions) m.merge(s, 1, Integer::sum);
        List<Blocker> out = new ArrayList<>();
        m.forEach((text, count) -> out.add(new Blocker(text, count, total, word)));
        out.sort(Comparator.comparingInt(Blocker::count).reversed().thenComparing(Blocker::text));
        return out;
    }

    /** 후보 한 벌을 보유 옷에 비춰 본다. season 이 비어 있지 않으면 그 계절의 옷만 쓴다. */
    public static Verdict judgeCandidate(List<? extends Garment> allItems, Garment candidate, String season) {
        List<Garment> pool = new ArrayList<>(), owned = new ArrayList<>();
        List<ReviewItem> excluded = new ArrayList<>();
        for (Garment it : allItems) {
            if (!it.isOwned() || it.id().equals(candidate.id())) continue;
            pool.add(it); Assessment.Readiness a = Assessment.assess(it, season);
            if (!a.ready()) excluded.add(new ReviewItem(it, a.missing()));
            else if (it.inSeason(season)) owned.add(it);
        }
        Assessment.Readiness c = Assessment.assess(candidate, season);
        if (!c.ready() || owned.isEmpty()) {
            String note = !c.ready() ? "구매 후보의 속성을 확인해야 비교할 수 있습니다." : pool.isEmpty() ? "비교할 보유 옷을 먼저 등록해 주세요." : "확인된 보유 옷이 없어 비교를 보류합니다.";
            return new Verdict(true, List.of(), null, null, List.of(), List.of(), List.of(), List.of(), note, "needs-confirmation", c.missing(), List.copyOf(excluded), owned.size());
        }
        Verdict v = judgeReady(owned, candidate, season);
        return new Verdict(v.supported(), v.overlaps(), v.before(), v.after(), v.added(), v.top3(), v.blockers(), v.needs(), v.note(), excluded.isEmpty() ? "ready" : "partial", c.missing(), List.copyOf(excluded), owned.size());
    }

    private static Verdict judgeReady(List<? extends Garment> allItems, Garment candidate, String season) {
        List<Garment> owned = new ArrayList<>();
        for (Garment it : allItems) if (it.isOwned() && !it.id().equals(candidate.id()) && it.inSeason(season)) owned.add(it);
        List<Overlap> overlaps = findOverlaps(candidate, owned);
        List<Garment> tops = new ArrayList<>(), bottoms = new ArrayList<>(), outers = new ArrayList<>();
        for (Garment g : owned) switch (g.cat()) { case "top" -> tops.add(g); case "bottom" -> bottoms.add(g); case "outer" -> outers.add(g); default -> { } }
        List<Pair> pairsBefore = cleanOutfits(owned);

        if (candidate.cat().equals("top") || candidate.cat().equals("bottom")) {
            boolean isTop = candidate.cat().equals("top");
            List<Garment> partners = isTop ? bottoms : tops;
            String word = isTop ? "하의" : "상의";
            if (partners.isEmpty()) return new Verdict(true, overlaps, 0, 0, List.of(), List.of(), List.of(), List.of(), "보유한 " + word + "가 없어 조합을 만들 수 없습니다.");
            List<String> cautions = new ArrayList<>();
            List<Added> added = new ArrayList<>();
            for (Garment p : partners) {
                Garment top = isTop ? candidate : p, bottom = isTop ? p : candidate;
                Recommend.Score s = Recommend.scorePair(top, bottom);
                if (s.caution().isEmpty()) {
                    List<Garment> ok = new ArrayList<>();
                    for (Garment o : outers) if (Recommend.scoreOuter(o, top, bottom).caution().isEmpty()) ok.add(o);   // 걸칠 수 있는 아우터: 아우터 규칙에서도 주의 사항이 없는 것
                    added.add(new Added(top, bottom, p, s.score(), s.why(), List.copyOf(ok)));
                } else cautions.addAll(s.caution());
            }
            List<Added> sorted = new ArrayList<>(added);
            sorted.sort(Comparator.comparingInt(Added::score).reversed().thenComparing(a -> a.partner().id()));
            List<Pick> top3 = new ArrayList<>();
            for (Added c : sorted.subList(0, Math.min(3, sorted.size()))) {
                Garment bestO = null; Recommend.Score bestS = null;                                    // 아우터가 있으면 점수가 가장 높은 것을 하나 얹어 보여 준다
                for (Garment o : c.outers()) {
                    Recommend.Score so = Recommend.scoreOuter(o, c.top(), c.bottom());
                    if (bestS == null || so.score() > bestS.score()) { bestO = o; bestS = so; }
                }
                boolean useOuter = bestS != null && bestS.score() > 0;
                List<String> why = new ArrayList<>(c.why());
                if (useOuter) why.addAll(bestS.why());
                top3.add(new Pick(c.top(), c.bottom(), useOuter ? bestO : null, c.score() + (useOuter ? bestS.score() : 0), List.copyOf(why)));
            }
            List<String> needs = new ArrayList<>();
            if (added.isEmpty()) {
                int lo = candidate.light() - 18, hi = candidate.light() + 18;
                List<String> parts = new ArrayList<>();
                if (lo >= 0) parts.add("밝기 " + lo + " 이하");
                if (hi <= 100) parts.add("밝기 " + hi + " 이상");
                if (!parts.isEmpty()) needs.add("이 옷과 밝기 차이가 나는 " + word + "가 있으면 조합이 생깁니다 (" + String.join("이거나 ", parts) + ").");
            }
            return new Verdict(true, overlaps, pairsBefore.size(), pairsBefore.size() + added.size(), List.copyOf(added), List.copyOf(top3), tally(cautions, partners.size(), word), List.copyOf(needs), "");
        }

        if (candidate.cat().equals("outer")) {
            if (pairsBefore.isEmpty()) return new Verdict(true, overlaps, 0, 0, List.of(), List.of(), List.of(), List.of(), "주의 사항 없는 상의·하의 조합이 아직 없어 아우터를 얹어 볼 수 없습니다.");
            List<String> cautions = new ArrayList<>();
            List<Added> added = new ArrayList<>();
            for (Pair p : pairsBefore) {
                Recommend.Score s = p.dress() ? Recommend.scoreDressOuter(candidate, p.top()) : Recommend.scoreOuter(candidate, p.top(), p.bottom());
                if (s.caution().isEmpty()) {
                    List<String> why = new ArrayList<>(p.why()); why.addAll(s.why());
                    added.add(new Added(p.top(), p.bottom(), p.top(), p.score() + s.score(), List.copyOf(why), List.of(), p.dress()));
                } else cautions.addAll(s.caution());
            }
            List<Added> sorted = new ArrayList<>(added);
            sorted.sort(Comparator.comparingInt(Added::score).reversed().thenComparing(a -> a.top().id() + (a.bottom() == null ? "" : a.bottom().id())));
            Set<String> seenTop = new HashSet<>();
            List<Added> picked = new ArrayList<>();
            for (Added c : sorted) if (picked.size() < 3 && seenTop.add(c.top().id())) picked.add(c);
            for (Added c : sorted) if (picked.size() < 3 && !picked.contains(c)) picked.add(c);
            List<Pick> top3 = new ArrayList<>();
            for (Added c : picked) top3.add(new Pick(c.top(), c.bottom(), candidate, c.score(), c.why(), c.dress()));
            // 지금 아우터들이 걸칠 수 있는 쌍의 수와 견줄 수 있게, 기준은 "쌍의 수"로 둔다
            return new Verdict(true, overlaps, pairsBefore.size(), added.size(), List.copyOf(added), List.copyOf(top3), tally(cautions, pairsBefore.size(), "조합"), List.of(), "");
        }

        if (candidate.cat().equals("dress")) {
            // 원피스는 혼자서 차림 하나가 된다. 걸칠 수 있는 아우터를 함께 본다
            record Ok(Garment o, Recommend.Score s) {}
            Recommend.Score self = Recommend.scoreDress(candidate);
            List<String> cautions = new ArrayList<>();
            List<Ok> ok = new ArrayList<>();
            for (Garment o : outers) {
                Recommend.Score s = Recommend.scoreDressOuter(o, candidate);
                if (s.caution().isEmpty()) ok.add(new Ok(o, s)); else cautions.addAll(s.caution());
            }
            ok.sort(Comparator.comparingInt((Ok x) -> x.s().score()).reversed().thenComparing(x -> x.o().id()));
            List<Garment> okOuters = new ArrayList<>();
            for (Ok x : ok) okOuters.add(x.o());
            List<Added> added = List.of(new Added(candidate, null, candidate, self.score(), self.why(), List.copyOf(okOuters), true));
            List<Pick> top3 = new ArrayList<>();
            for (Ok x : ok.subList(0, Math.min(3, ok.size()))) {
                List<String> why = new ArrayList<>(self.why()); why.addAll(x.s().why());
                top3.add(new Pick(candidate, null, x.o(), self.score() + x.s().score(), List.copyOf(why), true));
            }
            if (top3.isEmpty()) top3.add(new Pick(candidate, null, null, self.score(), self.why(), true));
            List<String> needs = !outers.isEmpty() && ok.isEmpty() ? List.of("이 원피스와 색이나 격식이 다른 아우터가 있으면 겹쳐 입을 수 있습니다.") : List.of();
            return new Verdict(true, overlaps, pairsBefore.size(), pairsBefore.size() + 1, added, List.copyOf(top3), tally(cautions, outers.size(), "아우터"), needs, "");
        }

        return new Verdict(false, overlaps, 0, 0, List.of(), List.of(), List.of(), List.of(), "신발과 소품은 조합 규칙이 아직 없어 겹치는 옷만 보여 줍니다.");
    }

    /** 두 옷이 같은 자리를 채우는 옷인지(옷장 비교용). 브랜드와 이름이 같으면 같은 옷(exact), 종류·색·밝기·짜임 무늬가 비슷하면 similar, 아니면 빈 문자열. */
    public static String matchKind(Garment a, Garment b) {
        if (!Assessment.assess(a).ready() || !Assessment.assess(b).ready() || !a.cat().equals(b.cat())) return "";
        if (!Sanitize.isBlank(a.brand()) && !Sanitize.isBlank(b.brand()) && norm(a.brand()).equals(norm(b.brand())) && norm(a.name()).equals(norm(b.name()))) return "exact";
        boolean wa = isWoven(a), wb = isWoven(b);                                                   // 프린트는 자리를 가르지 않는다. 줄무늬와 체크만 무지와 다른 자리로 본다
        if (a.kind().equals(b.kind()) && Vocab.group(a).equals(Vocab.group(b)) && Math.abs(a.light() - b.light()) <= LIGHT_NEAR + 5 && wa == wb) return "similar";
        return "";
    }

    private static boolean isWoven(Garment x) {
        return "stripe".equals(x.pattern()) || "check".equals(x.pattern());
    }

    /** 내 옷장과 다른 옷장(또는 기본 옷장)을 견준다. 한 벌은 한 벌과만 짝짓는다. exact 짝을 먼저, 그다음 similar 짝을 찾는다. */
    public static Comparison compareWardrobes(List<? extends Garment> mineAll, List<? extends Garment> theirsAll, String season) {
        List<Garment> mine = new ArrayList<>(), theirs = new ArrayList<>();
        List<ReviewItem> unassessedMine = new ArrayList<>(), unassessedTheirs = new ArrayList<>();
        for (Garment it : mineAll) if (it.isOwned()) { Assessment.Readiness a = Assessment.assess(it, season); if (!a.ready()) unassessedMine.add(new ReviewItem(it, a.missing())); else if (it.inSeason(season)) mine.add(it); }
        for (Garment it : theirsAll) if (it.isOwned()) { Assessment.Readiness a = Assessment.assess(it, season); if (!a.ready()) unassessedTheirs.add(new ReviewItem(it, a.missing())); else if (it.inSeason(season)) theirs.add(it); }
        Set<String> used = new HashSet<>();
        Set<Garment> matchedTheirs = Collections.newSetFromMap(new IdentityHashMap<>());    // JS 의 === 과 같이 같은 객체인지로 본다
        List<Match> both = new ArrayList<>();
        for (String pass : List.of("exact", "similar")) {
            for (Garment t : theirs) {
                if (matchedTheirs.contains(t)) continue;
                for (Garment m : mine) {
                    if (!used.contains(m.id()) && matchKind(m, t).equals(pass)) { used.add(m.id()); matchedTheirs.add(t); both.add(new Match(m, t, pass)); break; }
                }
            }
        }
        List<Garment> onlyTheirs = new ArrayList<>(), onlyMine = new ArrayList<>();
        for (Garment t : theirs) if (!matchedTheirs.contains(t)) onlyTheirs.add(t);
        for (Garment m : mine) if (!used.contains(m.id())) onlyMine.add(m);
        return new Comparison(List.copyOf(both), List.copyOf(onlyTheirs), List.copyOf(onlyMine), List.copyOf(unassessedMine), List.copyOf(unassessedTheirs), unassessedMine.isEmpty() && unassessedTheirs.isEmpty() ? "ready" : "partial");
    }
}
