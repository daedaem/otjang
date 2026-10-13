package otjang;

import otjang.api.Bodies;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** The same checked-in fixture is consumed by the browser domain suite; never generate expected values here. */
final class FollowupFixtures {
    private FollowupFixtures() {}
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> cases() {
        try {
            var raw = Bodies.map(Files.readString(Path.of("../contracts/followup-contract.json")));
            if (((Number) raw.get("version")).intValue() != 2) throw new AssertionError("Unsupported fixture version");
            return (List<Map<String, Object>>) raw.get("cases");
        } catch (java.io.IOException failure) { throw new AssertionError("Shared fixture must be present", failure); }
    }
    @SuppressWarnings("unchecked")
    static Map<String, Object> decision(Map<String, Object> fixture) { return (Map<String, Object>) fixture.get("decision"); }
}
