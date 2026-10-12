package otjang.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 옷장 어휘. app/src/wardrobe.js 와 app/src/recommend.js 의 상수를 그대로 옮긴 것이다(순서 포함: 종류의 첫 값이 기본값이다).
 * 둘이 달라지면 앱과 서버의 정리 결과가 달라지므로, 바꿀 때는 양쪽을 함께 바꾸고 골든 회귀(test/golden)를 다시 만든다.
 */
public final class Vocab {
    private Vocab() {}

    public static final int SCHEMA = 2;
    public static final List<String> SEASONS = List.of("봄", "여름", "가을", "겨울");
    public static final Map<String, String> CATS = ordered("outer", "아우터", "top", "상의", "bottom", "하의", "shoes", "신발");
    public static final Map<String, Map<String, String>> KINDS = Map.of(
            "outer", ordered("jacket", "재킷", "blazer", "블레이저", "cardigan", "카디건", "coat", "코트", "padding", "패딩", "vest", "조끼"),
            "top", ordered("shirt", "셔츠", "tee", "티셔츠", "knit", "니트", "sweat", "스웻셔츠", "polo", "폴로", "hoodie", "후디"),
            "bottom", ordered("denim", "데님", "chino", "치노", "slacks", "슬랙스", "fatigue", "퍼티그 팬츠", "cord", "코듀로이 팬츠", "shorts", "반바지"),
            "shoes", ordered("derby", "더비", "loafer", "로퍼", "sneaker", "스니커즈", "boots", "부츠"));
    /** 색 계열 → 이름. 기본 밝기는 FAM_LIGHT. */
    public static final Map<String, String> FAM = ordered("white", "흰색", "ivory", "아이보리", "beige", "베이지", "khaki", "카키", "brown", "브라운", "olive", "올리브",
            "green", "그린", "blue", "블루", "navy", "네이비", "indigo", "인디고", "gray", "그레이", "black", "블랙", "red", "레드", "burgundy", "버건디");
    public static final Map<String, Integer> FAM_LIGHT = Map.ofEntries(Map.entry("white", 95), Map.entry("ivory", 90), Map.entry("beige", 76), Map.entry("khaki", 62),
            Map.entry("brown", 25), Map.entry("olive", 45), Map.entry("green", 30), Map.entry("blue", 78), Map.entry("navy", 18), Map.entry("indigo", 16),
            Map.entry("gray", 55), Map.entry("black", 12), Map.entry("red", 42), Map.entry("burgundy", 25));
    public static final Map<String, String> PATTERNS = ordered("solid", "무지", "stripe", "줄무늬", "check", "체크", "graphic", "프린트");
    public static final Map<String, String> REBUY = ordered("unknown", "모르겠다", "yes", "다시 산다", "no", "다시 안 산다");
    public static final Map<String, String> FABRIC = ordered("", "적지 않음", "thin", "얇다", "mid", "보통", "thick", "두껍다");
    public static final Map<String, String> NECK = ordered("", "적지 않음", "low", "낮다", "mid", "보통", "high", "높다");
    public static final Map<String, List<String>> MEASURES = Map.of(
            "top", List.of("length", "shoulder", "chest", "sleeve"), "outer", List.of("length", "shoulder", "chest", "sleeve"),
            "bottom", List.of("waist", "rise", "thigh", "hem"), "shoes", List.of());
    public static final Map<String, String> LEAN = ordered("buy", "살 쪽", "skip", "말 쪽", "unsure", "모르겠다");
    public static final Map<String, String> DECIDE = ordered("buy", "산다", "skip", "안 산다", "hold", "보류");
    public static final Map<String, String> HELP = ordered("yes", "도움이 됐다", "some", "조금", "no", "안 됐다");
    public static final Map<String, String> SHIFT = ordered("same", "그대로", "changed", "바뀜", "settled", "정해짐", "held", "보류로 바뀜");
    public static final Map<String, String> ATTR_SOURCE = ordered("photo-draft", "사진에서 뽑은 초안", "owner", "주인이 입력", "owner-confirmed", "주인이 확인함");
    public static final Map<String, String> PHOTO_KIND = ordered("own", "내 사진", "confirmed", "확인된 동일 제품", "candidate", "미확인 후보", "substitute", "대체 이미지 · 내 옷 아님", "none", "사진 없음");
    public static final Map<String, String> EVIDENCE = ordered("logo", "사진 속 로고", "text", "사진 속 글자", "owner", "주인이 말함");
    public static final Map<String, String> LOOK_KINDS = ordered("shirt", "셔츠(버튼다운)", "blazer", "블레이저", "field", "필드 재킷", "trucker", "트러커 재킷", "sweat", "스웻셔츠(크루넥)", "cardigan", "카디건(V넥)");
    public static final int MAX_CANDS = 5;
    public static final Set<String> STATUSES = Set.of("owned", "candidate", "gone");

    /** 멀리서 보면 한 색으로 읽히는 계열 묶음 (recommend.js GROUP). 없는 계열은 자기 이름이 묶음이다. */
    public static final Map<String, String> GROUP = Map.ofEntries(Map.entry("navy", "deep-blue"), Map.entry("indigo", "deep-blue"), Map.entry("black", "black"),
            Map.entry("gray", "gray"), Map.entry("olive", "olive"), Map.entry("brown", "brown"), Map.entry("khaki", "khaki"), Map.entry("beige", "khaki"),
            Map.entry("blue", "light-blue"), Map.entry("green", "green"), Map.entry("white", "white"), Map.entry("ivory", "white"), Map.entry("red", "red"), Map.entry("burgundy", "red"));

    public static String group(Garment g) {
        return GROUP.getOrDefault(g.family(), g.family());
    }

    public static String firstKind(String cat) {
        return KINDS.get(cat).keySet().iterator().next();
    }

    private static Map<String, String> ordered(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return java.util.Collections.unmodifiableMap(m);
    }
}
