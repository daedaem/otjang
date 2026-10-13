package otjang;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import otjang.api.Bodies;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Two actual request threads share a PostgreSQL owner lock; only one stale snapshot may commit. Synthetic data only. */
@SpringBootTest @AutoConfigureMockMvc(print = MockMvcPrint.NONE) @Testcontainers
class RevisionConcurrencyTest {
    @Container @ServiceConnection static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");
    static final Path photos;
    static { try { photos = Files.createTempDirectory("otjang-revision-photos-"); } catch (Exception failure) { throw new RuntimeException(failure); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("otjang.photo-dir", photos::toString); r.add("otjang.auth.invite-code", () -> "synthetic-revision-invite");
    }
    @Autowired MockMvc mvc;
    final JsonMapper json = JsonMapper.builder().build();
    String token;
    @BeforeEach void account() throws Exception {
        token = register();
    }
    String register() throws Exception {
        String username = "revision-" + UUID.randomUUID().toString().substring(0, 8);
        String reply = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("username", username, "password", "synthetic-password-only", "inviteCode", "synthetic-revision-invite"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return (String) Bodies.map(reply).get("token");
    }
    String version(String auth) throws Exception {
        return mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + auth)).andExpect(status().isOk()).andReturn().getResponse().getHeader("X-Wardrobe-Version");
    }
    String snapshot(String id) {
        return json.writeValueAsString(Map.of("schema", 2, "kind", "wardrobe", "items", List.of(Map.of("id", id, "cat", "top", "name", "Synthetic " + id))));
    }
    MockHttpServletResponse importAt(String version, String id) throws Exception {
        return mvc.perform(post("/api/wardrobe/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).header("If-Match", "\"" + version + "\"").contentType(MediaType.APPLICATION_JSON).content(snapshot(id))).andReturn().getResponse();
    }

    @Test void missingOrMalformedOrStaleVersionDoesNotChangeData() throws Exception {
        assertEquals("0", version(token));
        mvc.perform(post("/api/wardrobe/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(snapshot("missing"))).andExpect(status().is(428));
        mvc.perform(post("/api/wardrobe/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).header("If-Match", "0").contentType(MediaType.APPLICATION_JSON).content(snapshot("invalid"))).andExpect(status().isBadRequest());
        assertEquals(409, importAt("99", "stale").getStatus());
        assertEquals("0", version(token));
        mvc.perform(get("/api/items").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test void twoClientsAtTheSameVersionHaveOneWinnerAndOneConflict() throws Exception {
        String common = version(token);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS)); return importAt(common, "device-a"); });
            var second = executor.submit(() -> { ready.countDown(); assertTrue(start.await(10, TimeUnit.SECONDS)); return importAt(common, "device-b"); });
            assertTrue(ready.await(10, TimeUnit.SECONDS)); start.countDown();
            var a = first.get(30, TimeUnit.SECONDS); var b = second.get(30, TimeUnit.SECONDS);
            assertEquals(List.of(200, 409), java.util.stream.Stream.of(a.getStatus(), b.getStatus()).sorted().toList());
            String winner = a.getStatus() == 200 ? "device-a" : "device-b";
            assertEquals("1", (a.getStatus() == 200 ? a : b).getHeader("X-Wardrobe-Version"));
            mvc.perform(get("/api/items").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(winner)).andExpect(header().string("X-Wardrobe-Version", "1"));
            assertEquals(409, importAt(common, "stale-retry").getStatus());
        }
    }

    @Test void otherMutationsAdvanceRevisionButFailedMutationDoesNotAndOtherOwnersStayIndependent() throws Exception {
        String another = register();
        assertEquals(200, importAt("0", "first").getStatus());
        mvc.perform(post("/api/items").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"second\",\"cat\":\"top\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("X-Wardrobe-Version", "2"));
        assertEquals(409, importAt("1", "stale-import").getStatus());
        mvc.perform(delete("/api/items/not-present").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());
        assertEquals("2", version(token)); assertEquals("0", version(another));
        mvc.perform(get("/api/wardrobe").header("Authorization", "Bearer " + token)).andExpect(header().string("X-Wardrobe-Version", "2"));
    }

    @Test void catalogAndFullRestoreRequireVersionAndIdempotentStaleRetryIsAConflict() throws Exception {
        String catalog = "{\"schema\":1,\"kind\":\"catalog\",\"products\":[]}";
        mvc.perform(post("/api/catalog/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(catalog)).andExpect(status().is(428));
        mvc.perform(post("/api/catalog/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).header("If-Match", "\"0\"").header("Idempotency-Key", "revision-replay").contentType(MediaType.APPLICATION_JSON).content(catalog)).andExpect(status().isOk()).andExpect(header().string("X-Wardrobe-Version", "1"));
        mvc.perform(post("/api/catalog/import").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).header("If-Match", "\"0\"").header("Idempotency-Key", "revision-replay").contentType(MediaType.APPLICATION_JSON).content(catalog)).andExpect(status().isConflict());
        String backup = mvc.perform(get("/api/backup").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String restore = json.writeValueAsString(Map.of("backup", Bodies.map(backup), "confirmReplace", true));
        mvc.perform(post("/api/backup/restore").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(restore)).andExpect(status().is(428));
        mvc.perform(post("/api/backup/restore").header("X-Eoul-Contract", "2").header("Authorization", "Bearer " + token).header("If-Match", "\"1\"").contentType(MediaType.APPLICATION_JSON).content(restore)).andExpect(status().isOk()).andExpect(header().string("X-Wardrobe-Version", "2"));
        mvc.perform(delete("/api/account").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"synthetic-password-only\"}"))
                .andExpect(status().isNoContent()).andExpect(header().doesNotExist("X-Wardrobe-Version"));
        mvc.perform(get("/api/wardrobe").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }
}
