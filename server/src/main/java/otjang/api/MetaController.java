package otjang.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.FollowupContract;
import otjang.domain.Vocab;

import java.util.Map;

/** Public capabilities contain no owner, wardrobe, credentials or deployment details. */
@RestController
public final class MetaController {
    @GetMapping("/api/meta")
    public Map<String, Object> capabilities() {
        return Map.of("contract", FollowupContract.VERSION, "wardrobeSchema", Vocab.SCHEMA,
                "followup", Map.of("outcomes", FollowupContract.OUTCOMES,
                        "sizeResults", FollowupContract.SIZE_RESULTS, "returnReasons", FollowupContract.RETURN_REASONS));
    }
}
