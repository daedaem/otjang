package otjang.api;

import org.springframework.boot.json.JsonParseException;
import org.springframework.boot.json.JsonParserFactory;

import java.util.Map;

/** 요청 본문(문자열)을 Map 으로. 가져오기는 본문 그대로의 해시가 필요해 String 으로 받고 여기서 푼다. */
public final class Bodies {
    private Bodies() {}

    public static Map<String, Object> map(String body) {
        if (body == null || body.isBlank()) throw new ApiException(400, "본문이 비어 있다");
        try {
            return JsonParserFactory.getJsonParser().parseMap(body);
        } catch (JsonParseException e) {
            throw new ApiException(400, "JSON 이 아니다");
        }
    }
}
