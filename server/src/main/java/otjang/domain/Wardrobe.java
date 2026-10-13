package otjang.domain;

import java.util.List;

/** 옷장 파일(스키마 2) 전체. kind 는 wardrobe | template. */
public record Wardrobe(int schema, String kind, String name, boolean draft, String note, Owner owner, List<Item> items, List<Decision> decisions) {

    public record Owner(String nickname, Double height, String topSize, String bottomSize) {
        public static final Owner EMPTY = new Owner("", null, "", "");
    }

    /** 살까 말까 판정 기록. before 는 보기 전 마음, after 는 결정. */
    public record Decision(String id, String itemId, String name, Before before, Summary summary, After after, Followup followup, Follow follow) {
        public Decision(String id, String itemId, String name, Before before, Summary summary, After after) { this(id, itemId, name, before, summary, after, null, null); }
        public Decision(String id, String itemId, String name, Before before, Summary summary, After after, Followup followup) { this(id, itemId, name, before, summary, after, followup, null); }
        public record Follow(String at, String worn, String feel) {}
        public record Before(String lean, String reason, String at) {}
        public record Summary(Integer overlaps, Integer added, Integer blockers) {}
        public record After(String decision, String helpful, String note, String at, String shift, String insight, String comparedWith, String comparisonNote) {
            public After(String decision, String helpful, String note, String at, String shift) { this(decision, helpful, note, at, shift, "", "none", ""); }
        }
        public record Followup(String outcome, String worn, String regret, String sizeResult, String returnReason, String note, String at) {
            public Followup(String outcome, String worn, String regret, String note, String at) {
                this(outcome, worn, regret, "unknown", "unknown", note, at);
            }
        }
    }
}
