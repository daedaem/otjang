package otjang.domain;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** 파일·요청에서 온 값을 아는 모양으로만 남긴다. app/src/wardrobe.js 의 str, num, safeImg, safeLink, safeDate, today 와 같다. */
public final class Sanitize {
    private Sanitize() {}

    private static final Pattern IMG_RE = Pattern.compile("^data:image/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$");
    private static final Pattern LINK_RE = Pattern.compile("^https?://[^\\s<>\"']+$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern DATE_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    public static final int MAX_IMG_CHARS = 600_000;
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    /** 문자열이면 앞 n자(UTF-16 단위)만, 아니면 빈 문자열. */
    public static String str(Object v, int n) {
        if (!(v instanceof String s)) return "";
        return s.length() > n ? s.substring(0, n) : s;
    }

    /** 유한한 수이고 lo..hi 안이면 그 값, 아니면 null. (불리언·문자열은 수가 아니다) */
    public static Double num(Object v, double lo, double hi) {
        if (!(v instanceof Number nv) || v instanceof Boolean) return null;
        double d = nv.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d) || d < lo || d > hi) return null;
        return d;
    }

    /** 정수로 쓰는 수(가격·연도). JS 쪽은 소수도 그대로 두지만 서버는 반올림해 저장한다 [서버 쪽 차이]. */
    public static Long whole(Object v, double lo, double hi) {
        Double d = num(v, lo, hi);
        return d == null ? null : Math.round(d);
    }

    /** 1·2·3 가운데 하나(2.0 처럼 정수값인 소수도 같은 수로 본다). */
    public static Integer formality(Object v) {
        Double d = num(v, 1, 3);
        if (d == null || d != Math.rint(d)) return null;
        return d.intValue();
    }

    public static String safeImg(Object v) {
        return v instanceof String s && s.length() < MAX_IMG_CHARS && IMG_RE.matcher(s).matches() ? s : "";
    }

    public static String safeLink(Object v) {
        if (!(v instanceof String s) || !LINK_RE.matcher(s).matches()) return "";
        return s.length() > 400 ? s.substring(0, 400) : s;
    }

    public static String safeDate(Object v) {
        if (!(v instanceof String s) || !DATE_RE.matcher(s).matches()) return "";
        try {
            LocalDate date = LocalDate.parse(s);
            return date.getYear() >= 1 && date.getYear() <= 9999 ? s : "";
        } catch (java.time.format.DateTimeParseException invalid) { return ""; }
    }

    /** 오늘 날짜 YYYY-MM-DD (서울 시간). */
    public static String today() {
        return LocalDate.now(ZONE).toString();
    }

    public static boolean isBlank(String s) {
        return s == null || s.isEmpty();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(Object v) {
        return v instanceof Map<?, ?> m ? (Map<String, Object>) m : null;
    }

    @SuppressWarnings("unchecked")
    public static List<Object> arr(Object v) {
        return v instanceof List<?> l ? (List<Object>) l : null;
    }
}
