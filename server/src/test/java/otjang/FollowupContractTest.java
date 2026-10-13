package otjang;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import otjang.api.ApiException;
import otjang.api.Bodies;
import otjang.api.FollowupWriteValidator;
import otjang.domain.WardrobeCleaner;
import otjang.persistence.DecisionEntity;
import otjang.service.ItemMapper;
import tools.jackson.databind.json.JsonMapper;

import java.util.Map;
import java.util.stream.Stream;
import static org.junit.jupiter.api.Assertions.*;

class FollowupContractTest {
    final JsonMapper json = JsonMapper.builder().build();
    Object tree(Object value) { return value == null ? null : Bodies.map(json.writeValueAsString(Map.of("value", value))).get("value"); }

    @TestFactory Stream<DynamicTest> sharedCasesHaveLocalParityStrictWriteBoundaryAndMapperRoundtrip() {
        return FollowupFixtures.cases().stream().map(f -> DynamicTest.dynamicTest((String) f.get("id"), () -> {
            var raw = FollowupFixtures.decision(f);
            var d = WardrobeCleaner.cleanDecision(raw);
            assertEquals(f.get("expectedFollowup"), d == null ? null : tree(d.followup()), "Domain sanitizer parity");
            assertEquals(d, WardrobeCleaner.cleanDecision(tree(d)), "Cleaner must be idempotent");
            if ("reject".equals(f.get("classification"))) {
                ApiException error = assertThrows(ApiException.class, () -> FollowupWriteValidator.decision(raw, ""));
                assertEquals(422, error.status()); assertEquals(f.get("errorCode"), error.code()); assertEquals(f.get("errorPath"), error.path());
            } else {
                assertNotNull(d);
                assertDoesNotThrow(() -> FollowupWriteValidator.decision(raw, ""));
                // Decision mapping does not touch photos. Exercise actual production mapper in both directions.
                var mapper = new ItemMapper(null, null);
                var e = mapper.apply(d, new DecisionEntity(), 1L);
                assertEquals(f.get("expectedFollowup"), tree(mapper.toDomain(e).followup()));
                if (d.followup() != null) assertEquals(d.followup().at(), e.getFollowupAt() == null ? "" : e.getFollowupAt().toString(), "Date is not invented or changed");
                else { assertNull(e.getFollowupAt()); assertNull(e.getFollowupSizeResult()); assertNull(e.getFollowupReturnReason()); }
            }
        }));
    }
    @Test void allCanonicalCombinationsAndWornRegretPairsAreExplicitlyCovered() {
        var valid = FollowupFixtures.cases().stream().filter(f -> "valid".equals(f.get("classification")) && f.get("expectedFollowup") != null).toList();
        assertEquals(42, valid.stream().map(f -> f.get("expectedFollowup")).map(v -> (Map<?, ?>) v)
                .map(f -> java.util.List.of(f.get("outcome"), f.get("sizeResult"), f.get("returnReason"))).distinct().count());
        assertEquals(9, valid.stream().map(f -> (Map<?, ?>) f.get("expectedFollowup"))
                .map(f -> java.util.List.of(f.get("worn"), f.get("regret"))).distinct().count());
    }
    @Test void removingFollowupClearsAllNewEntityFields() {
        var raw = new java.util.LinkedHashMap<>(FollowupFixtures.decision(FollowupFixtures.cases().getFirst()));
        var mapper = new ItemMapper(null, null);
        var entity = mapper.apply(WardrobeCleaner.cleanDecision(raw), new DecisionEntity(), 1L);
        raw.put("followup", null); mapper.apply(WardrobeCleaner.cleanDecision(raw), entity, 1L);
        assertNull(entity.getFollowupOutcome()); assertNull(entity.getFollowupSizeResult()); assertNull(entity.getFollowupReturnReason());
        assertNull(mapper.toDomain(entity).followup());
    }
    @Test void calendarValidationMatchesClientLeapYearAndYearBounds() {
        for (String valid : java.util.List.of("0001-01-01", "2024-02-29", "2000-02-29", "9999-12-31")) assertEquals(valid, otjang.domain.Sanitize.safeDate(valid));
        for (String invalid : java.util.List.of("0000-01-01", "2023-02-29", "1900-02-29", "2026-04-31", "2026-99-99", "2026-01-01T12:00:00Z")) assertEquals("", otjang.domain.Sanitize.safeDate(invalid));
    }
}
