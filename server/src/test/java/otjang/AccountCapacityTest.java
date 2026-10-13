package otjang;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import otjang.api.ApiException;
import otjang.api.Bodies;
import otjang.domain.RecordLimits;
import otjang.domain.WardrobeCleaner;
import otjang.security.BetaUser;
import otjang.service.WardrobeService;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Capacity is a creation rule, never a truncation rule. Actual PostgreSQL, synthetic records only. */
@SpringBootTest @AutoConfigureMockMvc(print = MockMvcPrint.NONE) @Testcontainers
class AccountCapacityTest {
    @Container @ServiceConnection static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");
    static final Path photos;
    static { try { photos = Files.createTempDirectory("otjang-capacity-photos-"); } catch (Exception failure) { throw new RuntimeException(failure); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("otjang.photo-dir", photos::toString); r.add("otjang.auth.invite-code", () -> "synthetic-capacity-invite");
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired WardrobeService wardrobe;
    final JsonMapper json = JsonMapper.builder().build();
    String token; long owner;
    @BeforeEach void account() throws Exception {
        var session = Bodies.map(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body(Map.of(
                "username", "capacity-" + UUID.randomUUID().toString().substring(0, 8), "password", "synthetic-password-only", "inviteCode", "synthetic-capacity-invite"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        token = (String) session.get("token"); owner = ((Number) map(session.get("user")).get("ownerId")).longValue();
    }
    String body(Object value) { return json.writeValueAsString(value); }
    @SuppressWarnings("unchecked") Map<String, Object> map(Object value) { return (Map<String, Object>) value; }
    @SuppressWarnings("unchecked") List<Map<String, Object>> rows(Object value) { return (List<Map<String, Object>>) value; }
    String version() throws Exception { return mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getHeader("X-Wardrobe-Version"); }
    MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder r) { return r.header("Authorization", "Bearer " + token).header("X-Eoul-Contract", "2").contentType(MediaType.APPLICATION_JSON); }
    MockHttpServletRequestBuilder bulk(String path, Object value) throws Exception { return write(post(path)).header("If-Match", "\"" + version() + "\"").content(body(value)); }
    Map<String, Object> getMap(String path) throws Exception { return Bodies.map(mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()); }
    Map<String, Object> item(String id) { return Map.of("id", id, "cat", "top", "name", "Synthetic " + id); }
    Map<String, Object> decision(String id) { return Map.of("id", id, "name", "Synthetic " + id, "before", Map.of("lean", "buy")); }
    Map<String, Object> snapshot(List<?> items, List<?> decisions) { return Map.of("schema", 2, "kind", "wardrobe", "items", items, "decisions", decisions); }
    Map<String, Object> catalog(List<?> products) { return Map.of("schema", 1, "kind", "catalog", "products", products); }
    List<Map<String, Object>> items(int count, String prefix) { return IntStream.range(1, count + 1).mapToObj(i -> item(prefix + i)).toList(); }
    List<Map<String, Object>> decisions(int count, String prefix) { return IntStream.range(1, count + 1).mapToObj(i -> decision(prefix + i)).toList(); }
    int count(String table) { return jdbc.queryForObject("select count(*) from " + table + " where owner_id=?", Integer.class, owner); }
    Map<String, List<String>> rawRows() {
        var out = new LinkedHashMap<String, List<String>>();
        for (String table : List.of("item", "decision", "catalog_product", "import_receipt"))
            out.put(table, jdbc.queryForList("select to_jsonb(t)::text from " + table + " t where owner_id=? order by id", String.class, owner));
        out.put("owner", jdbc.queryForList("select to_jsonb(t)::text from owner t where id=?", String.class, owner));
        return out;
    }
    void seed(int count) {
        jdbc.update("insert into item(owner_id,client_id,status,cat,name,attr_source,photo_kind) select ?, 'i-'||g, 'owned', 'top', 'Synthetic item '||g, 'owner', 'none' from generate_series(1,?) g", owner, count);
        jdbc.update("insert into decision(owner_id,client_id,item_client_id,item_name,before_lean) select ?, 'd-'||g, 'i-'||g, 'Synthetic decision '||g, 'buy' from generate_series(1,?) g", owner, count);
        jdbc.update("insert into catalog_product(owner_id,client_id,cat,name) select ?, 'p-'||g, 'top', 'Synthetic product '||g from generate_series(1,?) g", owner, count);
    }
    void unchanged(Map<String, Object> before, String revision) throws Exception {
        var after = getMap("/api/backup"); assertEquals(before.get("wardrobe"), after.get("wardrobe")); assertEquals(before.get("catalog"), after.get("catalog"));
        assertEquals(revision, version()); assertEquals(0, count("import_receipt"));
    }

    @Test void sharedPackagedContractMatchesRepositoryAndCleanersPreserveTheTail() throws Exception {
        var contract = Bodies.map(Files.readString(Path.of("../contracts/record-limits.json")));
        assertEquals(((Number) contract.get("createLimit")).intValue(), RecordLimits.CREATE_LIMIT);
        assertEquals(((Number) contract.get("readCeiling")).intValue(), RecordLimits.READ_CEILING);
        for (int size : List.of(501, 600, 2000)) {
            var w = WardrobeCleaner.cleanWardrobe(snapshot(items(size, "clean-i-"), decisions(size, "clean-d-")));
            assertEquals(size, w.items().size()); assertEquals(size, w.decisions().size());
            assertEquals("clean-i-" + size, w.items().getLast().id()); assertEquals("clean-d-" + size, w.decisions().getLast().id());
            var c = WardrobeCleaner.cleanCatalog(catalog(items(size, "clean-p-")));
            assertEquals(size, c.products().size()); assertEquals("clean-p-" + size, c.products().getLast().id());
        }
        for (String field : List.of("items", "decisions")) {
            var w = new LinkedHashMap<>(snapshot(List.of(), List.of()));
            w.put(field, items(2001, "too-many-"));
            assertThrows(RecordLimits.TooManyRecords.class, () -> WardrobeCleaner.cleanWardrobe(w));
        }
        assertThrows(RecordLimits.TooManyRecords.class, () -> WardrobeCleaner.cleanCatalog(catalog(items(2001, "too-many-"))));
    }

    @Test void newItemOrDecisionRejectsWholeBulkBeforeUpdatesPhotosOrReceipts() throws Exception {
        seed(500);
        var before = getMap("/api/backup"); var rawBefore = rawRows(); String revision = version();
        for (String type : List.of("items", "decisions")) {
            var raw = snapshot(type.equals("items") ? List.of(item("i-1"), item("new-item")) : List.of(item("i-1")),
                    type.equals("decisions") ? List.of(decision("d-1"), decision("new-decision")) : List.of(decision("d-1")));
            mvc.perform(bulk("/api/wardrobe/import", raw).header("Idempotency-Key", "capacity-" + type)).andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT")).andExpect(jsonPath("$.path").value(type));
            unchanged(before, revision);
            assertEquals(rawBefore, rawRows(), "Rejected writes preserve original row IDs, timestamps and receipt/revision data");
        }
        mvc.perform(bulk("/api/wardrobe/import", snapshot(items(500, "i-"), decisions(500, "d-")))).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(0)).andExpect(jsonPath("$.updated").value(500)).andExpect(jsonPath("$.decisions").value(500));
        assertEquals(500, count("item")); assertEquals(500, count("decision"));
    }

    @Test void duplicateNewIdsConsumeOneSlotAndRejectedPhotoPayloadCreatesNoFiles() throws Exception {
        seed(499);
        var repeated = decision("one-new-id");
        mvc.perform(bulk("/api/wardrobe/import", snapshot(List.of(), List.of(repeated, repeated)))).andExpect(status().isOk());
        assertEquals(500, count("decision"));
        var before = getMap("/api/backup"); var rawBefore = rawRows(); String revision = version();
        List<String> filesBefore;
        try (var entries = Files.list(photos)) { filesBefore = entries.map(p -> p.getFileName().toString()).sorted().toList(); }
        var photoItem = new LinkedHashMap<>(item("i-1"));
        photoItem.put("photo", Map.of("kind", "own", "img", "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA"));
        mvc.perform(bulk("/api/wardrobe/import", snapshot(List.of(photoItem), List.of(decision("another-new-id")))).header("Idempotency-Key", "reject-photo"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
        unchanged(before, revision); assertEquals(rawBefore, rawRows());
        try (var entries = Files.list(photos)) { assertEquals(filesBefore, entries.map(p -> p.getFileName().toString()).sorted().toList(), "The failing collection is checked before photo storage"); }
    }

    @Test void catalogBulkAtCapacityRejectsWithoutClampingAndLegacyUpdatesAreAllowed() throws Exception {
        seed(501);
        var before = getMap("/api/backup"); String revision = version();
        mvc.perform(bulk("/api/catalog/import", catalog(List.of(item("p-1"), item("new-product")))).header("Idempotency-Key", "catalog-capacity"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
        unchanged(before, revision);
        mvc.perform(bulk("/api/catalog/import", catalog(items(501, "p-")))).andExpect(status().isOk()).andExpect(jsonPath("$.updated").value(501));
        mvc.perform(bulk("/api/wardrobe/import", snapshot(items(501, "i-"), decisions(501, "d-")))).andExpect(status().isOk()).andExpect(jsonPath("$.updated").value(501));
        assertEquals(501, count("item")); assertEquals(501, count("decision")); assertEquals(501, count("catalog_product"));
    }

    @Test void eachSingleUpsertAndCatalogCandidateChecksAccountTotalsButAllowsUpdates() throws Exception {
        seed(500);
        var before = getMap("/api/backup"); String revision = version();
        for (var route : List.of(Map.entry("/api/items", item("new-i")), Map.entry("/api/decisions", decision("new-d")), Map.entry("/api/catalog/products", item("new-p")))) {
            mvc.perform(write(post(route.getKey())).content(body(route.getValue()))).andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
            unchanged(before, revision);
        }
        mvc.perform(write(post("/api/catalog/products/p-1/candidate"))).andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
        unchanged(before, revision);
        mvc.perform(write(post("/api/items")).content(body(item("i-1")))).andExpect(status().isCreated());
        mvc.perform(write(post("/api/decisions")).content(body(decision("d-1")))).andExpect(status().isCreated());
        mvc.perform(write(post("/api/catalog/products")).content(body(item("p-1")))).andExpect(status().isCreated());
        assertEquals(500, count("item")); assertEquals(500, count("decision")); assertEquals(500, count("catalog_product"));
    }

    @Test void independentBulkRequestsCannotGrowTheAccountPastFiveHundred() throws Exception {
        mvc.perform(bulk("/api/wardrobe/import", snapshot(items(300, "device-a-"), List.of())).header("Idempotency-Key", "device-a"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(300));
        var before = getMap("/api/backup"); String revision = version();
        mvc.perform(bulk("/api/wardrobe/import", snapshot(items(300, "device-b-"), List.of())).header("Idempotency-Key", "device-b"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
        assertEquals(300, count("item")); assertEquals(1, count("import_receipt")); assertEquals(revision, version());
        assertEquals(before.get("wardrobe"), getMap("/api/backup").get("wardrobe"));
    }

    @Test void simultaneousSingleRequestsShareTheRevisionLockAndOnlyOneNewIdCommits() throws Exception {
        seed(499);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var requests = IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS));
                return mvc.perform(write(post("/api/items")).content(body(item("parallel-" + i)))).andReturn().getResponse();
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var replies = new ArrayList<MockHttpServletResponse>(); for (var result : requests) replies.add(result.get(30, TimeUnit.SECONDS));
            assertEquals(List.of(201, 422), replies.stream().map(MockHttpServletResponse::getStatus).sorted().toList());
            assertEquals("ACCOUNT_LIMIT", Bodies.map(replies.stream().filter(r -> r.getStatus() == 422).findFirst().orElseThrow().getContentAsString()).get("code"));
            assertEquals(500, count("item")); assertEquals("1", version());
        }
    }

    @Test void directServiceCallsWithoutTheHttpRevisionFilterStillSerializeCapacity() throws Exception {
        seed(499);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var requests = IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new BetaUser("synthetic", owner), null, List.of()));
                try {
                    ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS));
                    wardrobe.save(item("direct-" + i)); return "saved";
                } catch (ApiException rejected) { return rejected.code(); }
                finally { SecurityContextHolder.clearContext(); }
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var outcomes = new ArrayList<String>(); for (var result : requests) outcomes.add(result.get(30, TimeUnit.SECONDS));
            assertEquals(List.of("ACCOUNT_LIMIT", "saved"), outcomes.stream().sorted().toList()); assertEquals(500, count("item"));
        }
    }

    @Test void legacySixHundredSurviveGetExportBackupAndStrictFullRestoreIncludingPhotoReferences() throws Exception {
        seed(600);
        String photo = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
        mvc.perform(write(put("/api/items/i-600/photo/own")).content(body(Map.of("img", photo)))).andExpect(status().isOk());
        var before = getMap("/api/backup");
        assertEquals(600, rows(map(before.get("wardrobe")).get("items")).size()); assertEquals(600, rows(map(before.get("wardrobe")).get("decisions")).size());
        assertEquals(600, rows(map(before.get("catalog")).get("products")).size());
        assertEquals(600, rows(getMap("/api/wardrobe").get("items")).size());
        assertEquals(600, rows(getMap("/api/wardrobe/export?img=true&log=true").get("items")).size());
        assertEquals(600, rows(getMap("/api/catalog").get("products")).size());
        String ref = jdbc.queryForObject("select photo_img_ref from item where owner_id=? and client_id='i-600'", String.class, owner);
        assertTrue(Files.exists(photos.resolve(ref)));
        mvc.perform(write(delete("/api/items/i-1"))).andExpect(status().isNoContent());
        mvc.perform(write(delete("/api/decisions/d-1"))).andExpect(status().isNoContent());
        mvc.perform(write(delete("/api/catalog/products/p-1"))).andExpect(status().isNoContent());
        mvc.perform(bulk("/api/backup/restore", Map.of("backup", before, "confirmReplace", true))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").value(600)).andExpect(jsonPath("$.decisions").value(600)).andExpect(jsonPath("$.products").value(600));
        var after = getMap("/api/backup"); assertEquals(before.get("wardrobe"), after.get("wardrobe")); assertEquals(before.get("catalog"), after.get("catalog"));
        assertEquals(ref, jdbc.queryForObject("select photo_img_ref from item where owner_id=? and client_id='i-600'", String.class, owner)); assertTrue(Files.exists(photos.resolve(ref)));
        mvc.perform(write(post("/api/items")).content(body(item("new-after-restore")))).andExpect(status().is(422)).andExpect(jsonPath("$.code").value("ACCOUNT_LIMIT"));
    }

    @Test void payloadsAboveReadCeilingAndRestoreAreRejectedBeforeAnyWrites() throws Exception {
        seed(1); var before = getMap("/api/backup"); String revision = version();
        for (String field : List.of("items", "decisions")) {
            var raw = new LinkedHashMap<>(snapshot(List.of(item("i-1")), List.of(decision("d-1"))));
            raw.put(field, field.equals("items") ? items(2001, "ceil-i-") : decisions(2001, "ceil-d-"));
            mvc.perform(bulk("/api/wardrobe/import", raw).header("Idempotency-Key", "ceil-" + field)).andExpect(status().is(422)).andExpect(jsonPath("$.code").value("WARDROBE_LIMIT"));
            unchanged(before, revision);
        }
        mvc.perform(bulk("/api/catalog/import", catalog(items(2001, "ceil-p-"))).header("Idempotency-Key", "ceil-products"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.code").value("CATALOG_LIMIT")); unchanged(before, revision);
        for (String field : List.of("items", "decisions", "products")) {
            var backup = Bodies.map(body(before));
            map(backup.get(field.equals("products") ? "catalog" : "wardrobe")).put(field,
                    java.util.Collections.nCopies(2001, rows(map(before.get(field.equals("products") ? "catalog" : "wardrobe")).get(field)).getFirst()));
            mvc.perform(bulk("/api/backup/restore", Map.of("backup", backup, "confirmReplace", true))).andExpect(status().isBadRequest());
            unchanged(before, revision);
        }
    }

    @Test void serverReadsAboveCeilingFailExplicitlyAndPreserveRawRows() throws Exception {
        seed(2001);
        for (String path : List.of("/api/items", "/api/decisions", "/api/catalog", "/api/wardrobe", "/api/wardrobe/export?log=true", "/api/backup"))
            mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().is(422)).andExpect(jsonPath("$.code").value("READ_CEILING"));
        assertEquals(2001, count("item")); assertEquals(2001, count("decision")); assertEquals(2001, count("catalog_product")); assertEquals("0", version());
    }
}
