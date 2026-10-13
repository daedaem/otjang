package otjang.domain;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Shared readiness cases are asserted by JS too; assumed-confirmed scoring fixtures remain separate. */
class UnknownAssessmentTest {
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();
    private static Map<String, Object> raw(Object... kv) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) out.put((String) kv[i], kv[i + 1]);
        return out;
    }
    private static Item checked(String id, String cat, String kind, String family, Integer light) {
        return WardrobeCleaner.cleanItem(raw("id", id, "cat", cat, "kind", kind, "family", family, "light", light, "formality", 2, "pattern", "solid", "seasons", Vocab.SEASONS, "attrSource", "owner-confirmed"), 0);
    }
    private static Item candidate() { return checked("candidate", "top", "shirt", "white", 95).withStatus("candidate"); }
    private static Item bottom() { return checked("bottom", "bottom", "denim", "indigo", 16); }

    @Test void sharedJavaScriptReadinessCasesAndNullRoundTrip() throws Exception {
        List<Map<String, Object>> cases = JSON.fromJson(Files.readString(Path.of("../app/test/fixtures/readiness-cases.json")), new TypeToken<List<Map<String, Object>>>() {}.getType());
        for (Map<String, Object> c : cases) {
            Item item = WardrobeCleaner.cleanItem(c.get("raw"), 0);
            Assessment.Readiness a = Assessment.assess(item, (String) c.get("season"));
            assertEquals(c.get("missing"), a.missing(), (String) c.get("name"));
            assertEquals(c.get("ready"), a.ready(), (String) c.get("name"));
            Object back = JSON.fromJson(JSON.toJson(item), Object.class);
            assertEquals(item, WardrobeCleaner.cleanItem(back, 0), c.get("name") + ": null round trip");
        }
    }
    @Test void draftCandidateNeverProducesCountsBeforeOwnerReview() {
        Item draft = candidate().withAttrSource("photo-draft");
        Judge.Verdict pending = Judge.judgeCandidate(List.of(bottom()), draft, "");
        assertEquals("needs-confirmation", pending.status()); assertEquals(List.of("confirmation"), pending.missing());
        assertNull(pending.before()); assertNull(pending.after()); assertTrue(pending.added().isEmpty()); assertTrue(pending.overlaps().isEmpty());
        Judge.Verdict reviewed = Judge.judgeCandidate(List.of(bottom()), draft.withAttrSource("owner-confirmed"), "");
        assertEquals("ready", reviewed.status()); assertEquals(1, reviewed.added().size()); assertTrue(draft.isDraft());
    }
    @Test void verifiedFlagDoesNotFillMissingFields() {
        Item missing = checked("unknown", "top", "shirt", "white", null).withStatus("candidate");
        assertNull(missing.light()); assertFalse(Assessment.assess(missing).ready());
        assertNull(Judge.judgeCandidate(List.of(bottom()), missing, "").after());
        assertNull(Recommend.scorePair(missing, bottom()).score());
        assertTrue(Recommend.recommend(List.of(missing, bottom()), 3, null).isEmpty());
    }
    @Test void ownedDraftsDoNotInfluenceCountsAndRemainOnReviewList() {
        Item draft = bottom().withId("draft-bottom").withAttrSource("photo-draft");
        Judge.Verdict partial = Judge.judgeCandidate(List.of(bottom(), draft), candidate(), "");
        assertEquals("partial", partial.status()); assertEquals(1, partial.assessedCount()); assertEquals(1, partial.added().size());
        assertEquals("draft-bottom", partial.excludedItems().get(0).item().id()); assertEquals(List.of("confirmation"), partial.excludedItems().get(0).missing());
        assertNull(Judge.judgeCandidate(List.of(draft), candidate(), "").after());
        assertEquals(1, Judge.compareWardrobes(List.of(draft), List.of(bottom()), "").unassessedMine().size());
    }
    @Test void emptySeasonsAreUnknownAndAllSeasonsRequireExplicitSelection() {
        Map<String, Object> emptySeasonRaw = raw("cat", "top", "kind", "shirt", "family", "white", "light", 95, "formality", 2, "pattern", "solid", "seasons", List.of());
        Item item = WardrobeCleaner.cleanItem(emptySeasonRaw, 0);
        assertFalse(item.inSeason("겨울")); assertTrue(item.inSeason(""));
        assertEquals(List.of("seasons"), Assessment.assess(item, "겨울").missing());
        assertTrue(candidate().inSeason("겨울"));
    }
    @Test void originalThirteenDraftFixtureCannotMakeAnOutfitVerdict() throws Exception {
        Path path = Path.of("../app/test/fixtures/wardrobe-v1.json"); String original = Files.readString(path);
        Wardrobe wardrobe = WardrobeCleaner.cleanWardrobe(JSON.fromJson(original, Object.class));
        assertEquals(13, wardrobe.items().size()); assertTrue(wardrobe.items().stream().noneMatch(i -> Assessment.assess(i).ready()));
        Judge.Verdict v = Judge.judgeCandidate(wardrobe.items(), candidate(), "");
        assertNull(v.after()); assertEquals(13, v.excludedItems().size()); assertEquals(original, Files.readString(path));
    }
    @Test void unknownCatalogProductsHaveNoNumericRank() {
        CatalogProduct unknown = WardrobeCleaner.cleanProduct(raw("id", "a-unknown", "name", "Unknown product", "cat", "top"), 0);
        CatalogProduct good = WardrobeCleaner.cleanProduct(raw("id", "z-ready", "name", "Known product", "cat", "top", "kind", "shirt", "family", "white", "light", 95, "formality", 2, "pattern", "solid", "seasons", Vocab.SEASONS), 0);
        List<CatalogRank.Ranked> ranked = CatalogRank.rank(List.of(bottom()), List.of(unknown, good), "", null, "2026-10-13", null);
        assertEquals("z-ready", ranked.get(0).product().id()); assertNull(ranked.get(1).score()); assertNull(ranked.get(1).added());
        assertNull(CatalogRank.toCandidate(unknown, "2026-10-13").light());
    }
    @Test void insightAndActualOutcomeAreSanitizedAndSurviveJsonRoundTrip() {
        Map<String, Object> record = raw("id", "d", "itemId", "c", "before", raw("lean", "unsure"), "after", raw("decision", "hold", "helpful", "some", "insight", "Existing denim works.", "comparedWith", "photos", "comparisonNote", "Silhouette was clearer."), "followup", raw("outcome", "not-purchased", "worn", "no", "regret", "no", "note", "Budget mattered.", "at", "2026-10-13"));
        Wardrobe.Decision d = WardrobeCleaner.cleanDecision(record);
        assertEquals("Existing denim works.", d.after().insight()); assertEquals("photos", d.after().comparedWith());
        assertEquals("not-purchased", d.followup().outcome()); assertNull(d.summary().added());
        assertEquals(d, WardrobeCleaner.cleanDecision(JSON.fromJson(JSON.toJson(d), Object.class)));
        record.put("followup", raw("outcome", "purchased", "worn", "hack", "regret", "hack", "note", "x".repeat(900), "at", "invalid"));
        Wardrobe.Decision bad = WardrobeCleaner.cleanDecision(record); assertEquals("unknown", bad.followup().worn()); assertEquals(300, bad.followup().note().length()); assertEquals("", bad.followup().at());
    }
}
