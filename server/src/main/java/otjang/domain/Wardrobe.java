package otjang.domain;

import java.util.List;

/** 옷장 파일(스키마 2) 전체. kind 는 wardrobe | template. */
public record Wardrobe(int schema, String kind, String name, boolean draft, String note, Owner owner, List<Item> items, List<Decision> decisions) {

    public record Owner(String nickname, Double height, String topSize, String bottomSize) {
        public static final Owner EMPTY = new Owner("", null, "", "");
    }

    /** 살까 말까 판정 기록. before 는 보기 전 마음, after 는 결정, follow 는 결정 2주 뒤 물음의 답(없으면 null). */
    public record Decision(String id, String itemId, String name, Before before, Summary summary, After after, Follow follow) {
        public record Before(String lean, String reason, String at) {}
        public record Summary(int overlaps, int added, int blockers) {}
        public record After(String decision, String helpful, String note, String at, String shift) {}
        /** worn: 산다일 때 none·few·many·notbought, 안 산다일 때 "". feel: good·ok·regret, 결국 안 샀으면 "". */
        public record Follow(String at, String worn, String feel) {}
    }
}
