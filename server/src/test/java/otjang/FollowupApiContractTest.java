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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import otjang.api.Bodies;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real PostgreSQL/Flyway + authenticated requests. Synthetic shared cases prove actual storage, not only DTO shapes. */
@SpringBootTest @AutoConfigureMockMvc(print = MockMvcPrint.NONE) @Testcontainers
class FollowupApiContractTest {
    @Container @ServiceConnection static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");
    static final Path photos;
    static { try { photos = Files.createTempDirectory("otjang-followup-photos-"); } catch (Exception failure) { throw new RuntimeException(failure); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("otjang.photo-dir", photos::toString); r.add("otjang.auth.invite-code", () -> "synthetic-followup-invite");
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    final JsonMapper json = JsonMapper.builder().build();
    String token; long owner;
    @BeforeEach void account() throws Exception {
        var session = register(); token = (String) session.get("token"); owner = ((Number) ((Map<?, ?>) session.get("user")).get("ownerId")).longValue();
    }
    Map<String, Object> register() throws Exception {
        return Bodies.map(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("username", "follow-" + UUID.randomUUID().toString().substring(0, 8), "password", "synthetic-password-only", "inviteCode", "synthetic-followup-invite"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    String body(Object value) { return json.writeValueAsString(value); }
    String version() throws Exception { return mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getHeader("X-Wardrobe-Version"); }
    MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder request) { return request.header("Authorization", "Bearer " + token).header("X-Eoul-Contract", "2").contentType(MediaType.APPLICATION_JSON); }
    MockHttpServletRequestBuilder importRequest(Object snapshot) throws Exception { return write(post("/api/wardrobe/import")).header("If-Match", "\"" + version() + "\"").content(body(snapshot)); }
    MockHttpServletRequestBuilder restoreRequest(Object snapshot) throws Exception { return write(post("/api/backup/restore")).header("If-Match", "\"" + version() + "\"").content(body(Map.of("backup", snapshot, "confirmReplace", true))); }
    Map<String, Object> getMap(String path) throws Exception { return Bodies.map(mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()); }
    @SuppressWarnings("unchecked") List<Map<String, Object>> rows(Object value) { return (List<Map<String, Object>>) value; }
    @SuppressWarnings("unchecked") Map<String, Object> map(Object value) { return (Map<String, Object>) value; }
    Object copy(Object value) { return Bodies.map(body(Map.of("value", value))).get("value"); }
    Map<String, Object> returned() {
        var f = FollowupFixtures.cases().stream().filter(v -> "returned-small-size".equals(v.get("id"))).findFirst().orElseThrow();
        Map<String, Object> d = map(copy(FollowupFixtures.decision(f))); d.put("id", "persistent-decision"); return d;
    }
    Map<String, Object> snapshot(List<?> decisions) { return Map.of("schema", 2, "kind", "wardrobe", "items", List.of(Map.of("id", "fixture-garment", "cat", "top", "status", "gone", "name", "합성 반품 옷")), "decisions", decisions); }
    void assertFollowups(List<Map<String, Object>> actual, List<Map<String, Object>> fixtures) {
        assertEquals(fixtures.size(), actual.size());
        Map<String, Object> byId = new LinkedHashMap<>(); actual.forEach(d -> byId.put((String) d.get("id"), d.get("followup")));
        for (var f : fixtures) assertEquals(f.get("expectedFollowup"), byId.get(FollowupFixtures.decision(f).get("id")), (String) f.get("id"));
    }

    @Test void publicCapabilitiesAdvertiseExactVocabularyWithoutTenantDataAndPrivateReadsStillRequireAuth() throws Exception {
        String meta = mvc.perform(get("/api/meta")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(Map.of("contract", 2, "wardrobeSchema", 2, "followup", Map.of("outcomes", List.of("purchased", "not-purchased", "pending", "returned"),
                "sizeResults", List.of("right", "small", "large", "unknown"), "returnReasons", List.of("size", "fit", "color", "material", "quality", "changed", "price", "other", "unknown"))), Bodies.map(meta));
        for (String path : List.of("/api/wardrobe", "/api/decisions", "/api/backup")) mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(write(post("/api/decisions")).content(body(returned()))).andExpect(status().isCreated());
        String other = (String) register().get("token");
        mvc.perform(get("/api/decisions").header("Authorization", "Bearer " + other)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test void everyValidAndNormalizeFixtureSurvivesImportGetExportBackupAndRestore() throws Exception {
        var accepted = FollowupFixtures.cases().stream().filter(f -> !"reject".equals(f.get("classification"))).toList();
        mvc.perform(importRequest(snapshot(accepted.stream().map(FollowupFixtures::decision).toList()))).andExpect(status().isOk()).andExpect(jsonPath("$.decisions").value(accepted.size()));
        assertFollowups(rows(getMap("/api/wardrobe").get("decisions")), accepted);
        assertFollowups(rows(getMap("/api/wardrobe/export?log=true").get("decisions")), accepted);
        var backup = getMap("/api/backup"); assertFollowups(rows(map(backup.get("wardrobe")).get("decisions")), accepted);
        assertEquals("gone", rows(map(backup.get("wardrobe")).get("items")).getFirst().get("status"));
        // Mutate server state first so restore must actually replace it, then verify the full persisted snapshot.
        mvc.perform(write(delete("/api/decisions/" + FollowupFixtures.decision(accepted.getFirst()).get("id")))).andExpect(status().isNoContent());
        mvc.perform(restoreRequest(backup)).andExpect(status().isOk()).andExpect(jsonPath("$.decisions").value(accepted.size()));
        var restored = getMap("/api/backup"); assertEquals(backup.get("wardrobe"), restored.get("wardrobe")); assertEquals(backup.get("catalog"), restored.get("catalog"));
        assertFollowups(rows(map(restored.get("wardrobe")).get("decisions")), accepted);
    }

    @Test void decisionEndpointCorrectsReturnedToPurchasedWithoutLosingSizeAndNormalizesLegacyBackupDefaults() throws Exception {
        var decision = returned();
        mvc.perform(write(post("/api/decisions")).content(body(decision))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.followup.sizeResult").value("small")).andExpect(jsonPath("$.followup.returnReason").value("size"));
        map(decision.get("followup")).put("outcome", "purchased");
        mvc.perform(write(post("/api/decisions")).content(body(decision))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.followup.sizeResult").value("small")).andExpect(jsonPath("$.followup.returnReason").value("unknown"));
        var backup = getMap("/api/backup"); var f = map(rows(map(backup.get("wardrobe")).get("decisions")).getFirst().get("followup"));
        f.remove("sizeResult"); f.remove("returnReason"); f.remove("worn"); f.remove("regret");
        mvc.perform(restoreRequest(backup)).andExpect(status().isOk());
        var actual = map(rows(getMap("/api/wardrobe").get("decisions")).getFirst().get("followup"));
        assertEquals("purchased", actual.get("outcome")); for (String field : List.of("sizeResult", "returnReason", "worn", "regret")) assertEquals("unknown", actual.get(field));
        assertEquals("2026-10-13", actual.get("at"));
    }

    @Test void rejectedFixturesNeverChangeDecisionsItemsOwnerRevisionOrReceiptsAcrossAnyWriteBoundary() throws Exception {
        mvc.perform(importRequest(snapshot(List.of(returned())))).andExpect(status().isOk());
        var before = getMap("/api/backup"); String revision = version();
        for (var fixture : FollowupFixtures.cases().stream().filter(f -> "reject".equals(f.get("classification"))).toList()) {
            var rejected = map(copy(FollowupFixtures.decision(fixture)));
            if (!"id".equals(fixture.get("errorPath"))) rejected.put("id", "persistent-decision");
            mvc.perform(write(post("/api/decisions")).content(body(rejected))).andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value(fixture.get("errorCode"))).andExpect(jsonPath("$.path").value(fixture.get("errorPath")));
            var rawBatch = Map.of("schema", 2, "owner", Map.of("nickname", "should-not-mutate"), "items", List.of(Map.of("id", "should-not-mutate", "cat", "top")), "decisions", List.of(returned(), rejected));
            mvc.perform(importRequest(rawBatch).header("Idempotency-Key", "rejected-" + fixture.get("id"))).andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value(fixture.get("errorCode"))).andExpect(jsonPath("$.path").value("decisions[1]." + fixture.get("errorPath")));
            var badBackup = map(copy(before)); var wardrobe = map(badBackup.get("wardrobe"));
            var ds = new ArrayList<>(rows(wardrobe.get("decisions"))); ds.add(rejected); wardrobe.put("decisions", ds);
            mvc.perform(restoreRequest(badBackup)).andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value(fixture.get("errorCode"))).andExpect(jsonPath("$.path").value("wardrobe.decisions[1]." + fixture.get("errorPath")));
            var after = getMap("/api/backup"); assertEquals(before.get("wardrobe"), after.get("wardrobe")); assertEquals(before.get("catalog"), after.get("catalog"));
            assertEquals(revision, version()); assertEquals(0, jdbc.queryForObject("select count(*) from import_receipt where owner_id=?", Integer.class, owner));
        }
        // A rejected key was not consumed: corrected retry creates one receipt and succeeds.
        mvc.perform(importRequest(snapshot(List.of(returned()))).header("Idempotency-Key", "rejected-unknown-outcome")).andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("select count(*) from import_receipt where owner_id=?", Integer.class, owner));
    }

    @Test void absentOrWrongContractCannotWriteOrReplayReceiptsButCredentialsAndAccountDeletionRemainUsable() throws Exception {
        var raw = snapshot(List.of(returned())); String original = body(raw);
        mvc.perform(importRequest(raw).header("Idempotency-Key", "prior-success")).andExpect(status().isOk());
        var before = getMap("/api/backup"); String revision = version();
        for (String contract : List.of("", "1", "3")) {
            for (String path : List.of("/api/wardrobe/import", "/api/items", "/api/decisions", "/api/catalog/import", "/api/backup/restore")) {
                var request = post(path).header("Authorization", "Bearer " + token).header("If-Match", "\"" + revision + "\"")
                        .header("Idempotency-Key", "prior-success").contentType(MediaType.APPLICATION_JSON).content(original);
                if (!contract.isEmpty()) request.header("X-Eoul-Contract", contract);
                mvc.perform(request).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_UPGRADE_REQUIRED"));
            }
        }
        mvc.perform(delete("/api/decisions/persistent-decision").header("Authorization", "Bearer " + token)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CLIENT_UPGRADE_REQUIRED"));
        var after = getMap("/api/backup"); assertEquals(before.get("wardrobe"), after.get("wardrobe")); assertEquals(before.get("catalog"), after.get("catalog")); assertEquals(revision, version());
        assertEquals(1, jdbc.queryForObject("select count(*) from import_receipt where owner_id=?", Integer.class, owner));
        var fresh = Bodies.map(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username", jdbc.queryForObject("select username from beta_account where owner_id=?", String.class, owner), "password", "synthetic-password-only"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + fresh.get("token"))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"synthetic-password-only\"}"))
                .andExpect(status().isNoContent());
    }

    @Test void additiveMigrationPreservesHistoricalOutcomeAndDateAndBackfillsOnlyNewUnknownFields() throws Exception {
        String schema = "contract_migration_" + UUID.randomUUID().toString().replace("-", "");
        var baseline = org.flywaydb.core.Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .schemas(schema).defaultSchema(schema).target("7").load();
        baseline.migrate();
        try (var connection = java.sql.DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            connection.setSchema(schema);
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("insert into decision(owner_id,client_id,before_lean,before_at,after_decision,after_helpful,after_shift,after_at,followup_outcome,followup_worn,followup_regret,followup_note,followup_at) values (1,'legacy','buy','2020-06-01','buy','yes','same','2020-06-02','purchased','yes','no','Keep historical note','2020-06-17')");
                statement.executeUpdate("insert into decision(owner_id,client_id,before_lean,before_at) values (1,'undecided','unsure','2020-06-01')");
            }
        }
        org.flywaydb.core.Flyway.configure().dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()).schemas(schema).defaultSchema(schema).load().migrate();
        try (var connection = java.sql.DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            connection.setSchema(schema);
            try (var statement = connection.createStatement(); var rows = statement.executeQuery("select * from decision order by id")) {
                assertTrue(rows.next()); assertEquals("purchased", rows.getString("followup_outcome"));
                assertEquals("yes", rows.getString("followup_worn")); assertEquals("no", rows.getString("followup_regret"));
                assertEquals("Keep historical note", rows.getString("followup_note")); assertEquals("2020-06-17", rows.getDate("followup_at").toString());
                assertEquals("2020-06-01", rows.getDate("before_at").toString()); assertEquals("2020-06-02", rows.getDate("after_at").toString());
                assertEquals("unknown", rows.getString("followup_size_result")); assertEquals("unknown", rows.getString("followup_return_reason"));
                assertTrue(rows.next()); assertNull(rows.getString("followup_outcome")); assertNull(rows.getString("followup_size_result")); assertNull(rows.getString("followup_return_reason"));
                assertFalse(rows.next());
            }
        }
    }

    @Test void oversizedImportsRejectTheWholeSnapshotRatherThanLosingTailRecords() throws Exception {
        mvc.perform(importRequest(snapshot(List.of(returned())))).andExpect(status().isOk());
        var before = getMap("/api/backup"); String revision = version();
        for (String field : List.of("items", "decisions")) {
            Map<String, Object> raw = new LinkedHashMap<>(snapshot(List.of(returned())));
            // Payload ceiling is distinct from the account's new-ID creation cap.
            raw.put(field, java.util.stream.IntStream.range(0, otjang.domain.RecordLimits.READ_CEILING + 1).mapToObj(i -> field.equals("items") ? Map.of("id", "item-" + i, "cat", "top") : returned()).toList());
            mvc.perform(importRequest(raw).header("Idempotency-Key", "oversized-" + field)).andExpect(status().is(422))
                    .andExpect(jsonPath("$.code").value("WARDROBE_LIMIT")).andExpect(jsonPath("$.path").value(field));
            var after = getMap("/api/backup"); assertEquals(before.get("wardrobe"), after.get("wardrobe")); assertEquals(revision, version());
            assertEquals(0, jdbc.queryForObject("select count(*) from import_receipt where owner_id=?", Integer.class, owner));
        }
    }

    @Test void databaseConstraintsRejectUnsupportedEnumsPartialGroupsAndInapplicableRecordedValues() throws Exception {
        mvc.perform(write(post("/api/decisions")).content(body(returned()))).andExpect(status().isCreated());
        var before = getMap("/api/backup");
        // A caller bypassing the API must still fail each contract 2 invariant at the database boundary.
        for (String assignment : List.of(
                "followup_outcome='kept'", "followup_size_result='medium'", "followup_return_reason='damaged'",
                "followup_size_result=null", "followup_return_reason=null", "followup_worn=null", "followup_regret=null",
                "followup_outcome='purchased',followup_return_reason='size'",
                "followup_outcome='pending',followup_return_reason='unknown',followup_size_result='small'",
                "followup_outcome='not-purchased',followup_return_reason='unknown',followup_size_result='large'",
                "followup_outcome=null,followup_worn=null,followup_regret=null")) {
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                    () -> jdbc.update("update decision set " + assignment + " where owner_id=? and client_id='persistent-decision'", owner), assignment);
            assertEquals(before.get("wardrobe"), getMap("/api/backup").get("wardrobe"), assignment);
        }
        // The allowable correction uses unknown reason and retains size; the DB accepts it directly as well.
        assertEquals(1, jdbc.update("update decision set followup_outcome='purchased',followup_return_reason='unknown' where owner_id=? and client_id='persistent-decision'", owner));
        var followup = map(rows(getMap("/api/wardrobe").get("decisions")).getFirst().get("followup"));
        assertEquals("purchased", followup.get("outcome")); assertEquals("small", followup.get("sizeResult")); assertEquals("unknown", followup.get("returnReason"));
    }
}
