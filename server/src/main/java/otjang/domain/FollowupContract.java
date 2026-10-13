package otjang.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Contract 2 vocabulary. Local file cleaning stays permissive; API writes validate before cleaning. */
public final class FollowupContract {
    private FollowupContract() {}
    public static final int VERSION = 2;
    public static final List<String> OUTCOMES = List.of("purchased", "not-purchased", "pending", "returned");
    public static final List<String> YES_NO = List.of("yes", "no", "unknown");
    public static final List<String> SIZE_RESULTS = List.of("right", "small", "large", "unknown");
    public static final List<String> RETURN_REASONS = List.of("size", "fit", "color", "material", "quality", "changed", "price", "other", "unknown");
    public static boolean sizeRelevant(Object outcome) { return "purchased".equals(outcome) || "returned".equals(outcome); }
    public static String value(Object value, List<String> vocabulary) {
        return value instanceof String s && vocabulary.contains(s) ? s : "unknown";
    }
    /** Only the four conditional enum fields are defaulted; other backup fields remain losslessly checked. */
    public static Map<String, Object> normalizeEnumFields(Map<String, Object> raw) {
        Map<String, Object> out = new LinkedHashMap<>(raw);
        out.put("worn", value(raw.get("worn"), YES_NO));
        out.put("regret", value(raw.get("regret"), YES_NO));
        out.put("sizeResult", sizeRelevant(raw.get("outcome")) ? value(raw.get("sizeResult"), SIZE_RESULTS) : "unknown");
        out.put("returnReason", "returned".equals(raw.get("outcome")) ? value(raw.get("returnReason"), RETURN_REASONS) : "unknown");
        return out;
    }
}
