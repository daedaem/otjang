package otjang.api;

import otjang.domain.FollowupContract;
import otjang.domain.Sanitize;
import otjang.domain.Vocab;
import otjang.domain.WardrobeCleaner;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reject unsupported relevant values before domain sanitizing can silently erase a recorded outcome. */
public final class FollowupWriteValidator {
    private FollowupWriteValidator() {}
    public static void decision(Object value, String prefix) {
        Map<String, Object> d = Sanitize.obj(value);
        if (d == null || d.get("followup") == null) return;
        Map<String, Object> before = Sanitize.obj(d.get("before"));
        if (before == null || !(before.get("lean") instanceof String lean) || !Vocab.LEAN.containsKey(lean))
            throw new ApiException(422, "후속 기록에 유효한 판정 이전 상태가 필요합니다", "FOLLOWUP_INVALID_DECISION", prefix + "before.lean");
        if (Sanitize.str(d.get("id"), 40).isBlank())
            throw new ApiException(422, "후속 기록에 유효한 판정 id가 필요합니다", "FOLLOWUP_INVALID_DECISION", prefix + "id");
        String path = prefix + "followup";
        Map<String, Object> after = Sanitize.obj(d.get("after"));
        if (after == null || !(after.get("decision") instanceof String s) || !Vocab.DECIDE.containsKey(s))
            throw new ApiException(422, "결정이 없는 후속 기록은 저장할 수 없습니다", "FOLLOWUP_WITHOUT_DECISION", path);
        dateField(before.get("at"), prefix + "before.at");
        dateField(after.get("at"), prefix + "after.at");
        Map<String, Object> f = Sanitize.obj(d.get("followup"));
        if (f == null) throw vocabulary(path);
        if (!(f.get("outcome") instanceof String outcome) || !FollowupContract.OUTCOMES.contains(outcome)) throw vocabulary(path + ".outcome");
        enumField(f, "worn", FollowupContract.YES_NO, path);
        enumField(f, "regret", FollowupContract.YES_NO, path);
        if (FollowupContract.sizeRelevant(outcome)) enumField(f, "sizeResult", FollowupContract.SIZE_RESULTS, path);
        if (outcome.equals("returned")) enumField(f, "returnReason", FollowupContract.RETURN_REASONS, path);
        dateField(f.get("at"), path + ".at");
    }
    private static ApiException vocabulary(String path) {
        return new ApiException(422, "지원하지 않는 구매 후속 기록 값입니다", "FOLLOWUP_VOCAB", path);
    }
    private static void enumField(Map<String, Object> f, String key, List<String> vocabulary, String path) {
        if (f.containsKey(key) && (!(f.get(key) instanceof String s) || !vocabulary.contains(s))) throw vocabulary(path + "." + key);
    }
    private static void dateField(Object value, String path) {
        if (value == null || "".equals(value)) return;
        if (Sanitize.safeDate(value).isEmpty())
            throw new ApiException(422, "후속 기록의 날짜가 올바르지 않습니다", "FOLLOWUP_DATE", path);
    }
    public static void wardrobe(Map<String, Object> raw, String prefix) {
        List<Object> items = Sanitize.arr(raw.get("items"));
        if (items != null && items.size() > WardrobeCleaner.MAX_ITEMS)
            throw new ApiException(422, "옷장 항목은 최대 500개입니다. 일부만 저장하지 않습니다", "WARDROBE_LIMIT", prefix + "items");
        List<Object> decisions = Sanitize.arr(raw.get("decisions"));
        if (decisions != null && decisions.size() > WardrobeCleaner.MAX_ITEMS)
            throw new ApiException(422, "판정 항목은 최대 500개입니다. 일부만 저장하지 않습니다", "WARDROBE_LIMIT", prefix + "decisions");
        if (decisions != null) for (int i = 0; i < decisions.size(); i++) decision(decisions.get(i), prefix + "decisions[" + i + "].");
    }
    /** Preserve backup strictness for all other data while allowing canonical missing/irrelevant enum defaults. */
    public static Object normalizedBackupDecisions(Object value) {
        List<Object> decisions = Sanitize.arr(value);
        if (decisions == null) return value;
        List<Object> out = new ArrayList<>();
        for (Object raw : decisions) {
            Map<String, Object> d = Sanitize.obj(raw);
            if (d == null) { out.add(raw); continue; }
            Map<String, Object> copy = new LinkedHashMap<>(d);
            Map<String, Object> f = Sanitize.obj(d.get("followup"));
            if (f != null) copy.put("followup", FollowupContract.normalizeEnumFields(f));
            out.add(copy);
        }
        return out;
    }
}
