package otjang.service;

import java.util.LinkedHashMap;
import java.util.Map;

/** jsonb 열(measures, 영수증 응답)에 넣는 아주 작은 JSON 도구. 평평한 {"키": 수} 맵만 다룬다. Jackson 버전 차이에 묶이지 않기 위해 따로 둔다. */
public final class Json {
    private Json() {}

    public static String numberMap(Map<String, Double> m) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Double> e : m.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(escape(e.getKey())).append("\":").append(e.getValue() == Math.rint(e.getValue()) ? String.valueOf(e.getValue().longValue()) : e.getValue().toString());
        }
        return sb.append('}').toString();
    }

    /** {"키": 수, ...} 만 읽는다. 다른 모양이면 빈 맵. */
    public static Map<String, Double> parseNumberMap(String json) {
        Map<String, Double> out = new LinkedHashMap<>();
        if (json == null) return out;
        String s = json.trim();
        if (s.length() < 2 || s.charAt(0) != '{' || s.charAt(s.length() - 1) != '}') return out;
        s = s.substring(1, s.length() - 1).trim();
        if (s.isEmpty()) return out;
        for (String part : s.split(",")) {
            int c = part.indexOf(':');
            if (c < 0) continue;
            String k = part.substring(0, c).trim(), v = part.substring(c + 1).trim();
            if (k.length() < 2 || k.charAt(0) != '"') continue;
            try { out.put(unescape(k.substring(1, k.length() - 1)), Double.parseDouble(v)); } catch (NumberFormatException ignored) { /* 수가 아니면 버린다 */ }
        }
        return out;
    }

    public static String escape(String s) {
        StringBuilder sb = new StringBuilder();
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> { if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch)); else sb.append(ch); }
            }
        }
        return sb.toString();
    }

    private static String unescape(String s) {
        return s.replace("\\\"", "\"").replace("\\\\", "\\");
    }
}
