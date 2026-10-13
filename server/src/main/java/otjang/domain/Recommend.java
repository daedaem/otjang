package otjang.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 규칙 기반 조합 추천. AI 를 쓰지 않고, 같은 입력이면 항상 같은 결과가 나온다. app/src/recommend.js 를 옮긴 것이다.
 * 점수는 가산과 감점의 합이고 확률이 아니다. 문장은 앱과 같은 글자여야 골든 회귀가 맞는다.
 */
public final class Recommend {
    private Recommend() {}

    /** 한 쌍(또는 아우터)의 점수와 근거·주의 문장. */
    public record Score(int score, List<String> why, List<String> caution) {
        static final Score ZERO = new Score(0, List.of(), List.of());
    }

    /** 원피스 한 벌의 기본 점수 [제안값]. 무난한 상의·하의 한 쌍(밝기 차이 적당 + 격식 비슷)과 같은 수준. */
    public static final int DRESS_BASE = 2;

    /**
     * 상의·하의(·아우터) 조합 하나. outer 는 없을 수 있다(null).
     * 원피스 차림은 top 자리에 원피스, bottom 은 null, dress 는 true 다 (recommend.js 와 같다).
     */
    public record Combo(String top, String bottom, String outer, int score, List<String> why, List<String> caution, boolean dress) {
        public Combo(String top, String bottom, String outer, int score, List<String> why, List<String> caution) {
            this(top, bottom, outer, score, why, caution, false);
        }

        public String key() {
            return top + "|" + (bottom == null ? "" : bottom) + "|" + (outer == null ? "" : outer);
        }
    }

    /** 상의와 하의 한 쌍의 점수와 근거. */
    public static Score scorePair(Garment top, Garment bottom) {
        int score = 0;
        List<String> why = new ArrayList<>(), caution = new ArrayList<>();
        int gap = Math.abs(top.light() - bottom.light());
        if (gap >= 35) { score += 2; why.add("상의와 하의의 밝기 차이가 커서 위아래가 또렷하게 나뉩니다."); }
        else if (gap >= 18) { score += 1; why.add("상의와 하의의 밝기가 적당히 다릅니다."); }
        else if (Vocab.group(top).equals(Vocab.group(bottom))) { score -= 2; caution.add("상의와 하의가 비슷한 색이라 한 덩어리로 보일 수 있습니다."); }
        else { score -= 1; caution.add("상의와 하의의 밝기가 비슷합니다."); }

        int fd = Math.abs(top.formality() - bottom.formality());
        if (fd <= 1) { score += 1; why.add("상의와 하의의 격식 수준이 비슷합니다."); }
        else { score -= 1; caution.add("상의와 하의의 격식 차이가 큽니다."); }

        if (top.patterned() && !bottom.patterned()) { score += 1; why.add("무늬는 상의 하나에만 있습니다."); }
        if (top.patterned() && bottom.patterned()) { score -= 2; caution.add("상의와 하의에 모두 무늬가 있습니다."); }
        return new Score(score, List.copyOf(why), List.copyOf(caution));
    }

    /** 상의·하의 위에 아우터를 걸쳤을 때 더하거나 빼는 점수와 근거. */
    public static Score scoreOuter(Garment outer, Garment top, Garment bottom) {
        int score = 0;
        List<String> why = new ArrayList<>(), caution = new ArrayList<>();
        if (!Vocab.group(outer).equals(Vocab.group(top))) { score += 1; why.add("아우터와 상의의 색이 달라 겹쳐 입은 층이 보입니다."); }
        else { score -= 1; caution.add("아우터와 상의의 색이 비슷합니다."); }

        if (outer.light() + 12 < top.light()) { score += 1; why.add("밝은 상의 위에 어두운 아우터라 안쪽이 드러납니다."); }

        if (Vocab.group(outer).equals(Vocab.group(bottom)) && Math.abs(outer.light() - bottom.light()) < 12) { score -= 1; caution.add("아우터와 하의의 색이 겹칩니다."); }

        if (Math.abs(outer.formality() - top.formality()) <= 1) { score += 1; why.add("아우터와 상의의 격식 수준이 비슷합니다."); }
        else { score -= 1; caution.add("아우터와 상의의 격식 차이가 큽니다."); }

        if ("cardigan".equals(outer.kind())) {
            if ("shirt".equals(top.kind())) { score += 1; why.add("셔츠 위에 카디건은 무난한 겹쳐 입기입니다."); }
            else if ("sweat".equals(top.kind())) { score -= 2; caution.add("스웻셔츠 위에 카디건은 부피가 겹칩니다."); }
        }
        if (outer.patterned() && top.patterned()) { score -= 2; caution.add("아우터와 상의에 모두 무늬가 있습니다."); }
        return new Score(score, List.copyOf(why), List.copyOf(caution));
    }

    /** 원피스 한 벌의 점수와 근거. 위아래 밝기·무늬 규칙이 없으므로 기본 점수만 준다. */
    public static Score scoreDress(Garment dress) {
        return new Score(DRESS_BASE, List.of("원피스 한 벌로 위아래가 이어져 차림이 완성됩니다."), List.of());
    }

    /** 원피스 위에 아우터를 걸쳤을 때 더하거나 빼는 점수와 근거. scoreOuter 와 같은 생각을 원피스 한 벌에 맞춘 것이다. */
    public static Score scoreDressOuter(Garment outer, Garment dress) {
        int score = 0;
        List<String> why = new ArrayList<>(), caution = new ArrayList<>();
        if (!Vocab.group(outer).equals(Vocab.group(dress))) { score += 1; why.add("아우터와 원피스의 색이 달라 겹쳐 입은 층이 보입니다."); }
        else { score -= 1; caution.add("아우터와 원피스의 색이 비슷합니다."); }
        if (outer.light() + 12 < dress.light()) { score += 1; why.add("밝은 원피스 위에 어두운 아우터라 안쪽이 드러납니다."); }
        if (Math.abs(outer.formality() - dress.formality()) <= 1) { score += 1; why.add("아우터와 원피스의 격식 수준이 비슷합니다."); }
        else { score -= 1; caution.add("아우터와 원피스의 격식 차이가 큽니다."); }
        if (outer.patterned() && dress.patterned()) { score -= 2; caution.add("아우터와 원피스에 모두 무늬가 있습니다."); }
        return new Score(score, List.copyOf(why), List.copyOf(caution));
    }

    /** 가능한 모든 조합에 점수를 매긴다. 아우터 없는 조합도 포함한다. 원피스는 혼자서 조합 하나다. 점수가 같으면 키 순서로 정해 결과가 흔들리지 않는다. */
    public static List<Combo> allCombos(List<? extends Garment> items) {
        List<Garment> tops = new ArrayList<>(), bottoms = new ArrayList<>(), outers = new ArrayList<>(), dresses = new ArrayList<>();
        outers.add(null);
        for (Garment g : items) {
            switch (g.cat()) { case "top" -> tops.add(g); case "bottom" -> bottoms.add(g); case "outer" -> outers.add(g); case "dress" -> dresses.add(g); default -> { } }
        }
        List<Combo> out = new ArrayList<>();
        for (Garment top : tops) for (Garment bottom : bottoms) {
            Score pair = scorePair(top, bottom);
            for (Garment outer : outers) {
                Score o = outer == null ? Score.ZERO : scoreOuter(outer, top, bottom);
                List<String> why = new ArrayList<>(pair.why()); why.addAll(o.why());
                List<String> caution = new ArrayList<>(pair.caution()); caution.addAll(o.caution());
                out.add(new Combo(top.id(), bottom.id(), outer == null ? null : outer.id(), pair.score() + o.score(), List.copyOf(why), List.copyOf(caution)));
            }
        }
        for (Garment dress : dresses) {
            Score d = scoreDress(dress);
            for (Garment outer : outers) {
                Score o = outer == null ? Score.ZERO : scoreDressOuter(outer, dress);
                List<String> why = new ArrayList<>(d.why()); why.addAll(o.why());
                List<String> caution = new ArrayList<>(d.caution()); caution.addAll(o.caution());
                out.add(new Combo(dress.id(), null, outer == null ? null : outer.id(), d.score() + o.score(), List.copyOf(why), List.copyOf(caution), true));
            }
        }
        out.sort(Comparator.comparingInt(Combo::score).reversed().thenComparing(Combo::key));
        return out;
    }

    /**
     * 추천 n개. 같은 상의(원피스)를 두 번 쓰지 않고, 하의와 아우터는 가능한 한 겹치지 않게 한다(첫 바퀴는 새것만, 모자라면 둘째 바퀴에서 겹침 허용).
     * exclude: 빼고 싶은 조합 키("top|bottom|outer") 목록.
     */
    public static List<Combo> recommend(List<? extends Garment> items, int n, List<String> exclude) {
        if (n <= 0) n = 3;
        Set<String> skip = exclude == null ? Set.of() : new HashSet<>(exclude);
        List<Combo> combos = allCombos(items), picked = new ArrayList<>();
        Set<String> usedTop = new HashSet<>(), usedBottom = new HashSet<>(), usedOuter = new HashSet<>();
        for (int pass = 0; pass < 2 && picked.size() < n; pass++) {
            for (Combo c : combos) {
                if (picked.size() >= n) break;
                if (picked.contains(c)) continue;
                if (skip.contains(c.key())) continue;
                if (usedTop.contains(c.top())) continue;
                if (pass == 0 && ((c.bottom() != null && usedBottom.contains(c.bottom())) || (c.outer() != null && usedOuter.contains(c.outer())))) continue;
                picked.add(c);
                usedTop.add(c.top()); if (c.bottom() != null) usedBottom.add(c.bottom()); if (c.outer() != null) usedOuter.add(c.outer());
            }
        }
        return picked;
    }
}
