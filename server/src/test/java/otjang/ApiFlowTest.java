package otjang;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.BeforeEach;
import otjang.api.Bodies;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 끝까지 흐름: 예시 옷장 가져오기(멱등) → 판정 → 코디 → 비교 → 상품 넣고 순위 → 후보로 → 사진 상태 전이 → 내보내기.
 * 진짜 PostgreSQL(Testcontainers, Docker 필요)에서 돈다. 숫자 기대값은 app/test/golden 과 같은 예시 옷장 기준이다.
 * 초대 계정의 bearer 토큰으로 실제 PostgreSQL에서 검사한다.
 */
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ApiFlowTest {
    @Container
    @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) throws Exception {
        Path photoDir = Files.createTempDirectory("otjang-photos");
        r.add("otjang.photo-dir", photoDir::toString);
        r.add("otjang.auth.invite-code", () -> "test-local-invite-only");
    }

    @Autowired
    MockMvc mvc;

    static String token;
    @BeforeEach
    void login() throws Exception {
        if (token == null) {
            String json = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"flowtest\",\"password\":\"local-test-password-only\",\"inviteCode\":\"test-local-invite-only\"}"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            token = (String) Bodies.map(json).get("token");
        }
    }

    String version(String credential) throws Exception {
        String value = mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + credential)).andExpect(status().isOk()).andReturn().getResponse().getHeader("X-Wardrobe-Version");
        if (value == null) throw new AssertionError("revision response header missing");
        return "\"" + value + "\"";
    }

    static String sample() throws Exception {
        return Files.readString(Path.of("../app/data/sample-wardrobe.json"), StandardCharsets.UTF_8);
    }

    @Test
    @Order(1)
    void 가져오기는_멱등이다() throws Exception {
        String body = sample();
        mvc.perform(post("/api/wardrobe/import").header("Authorization", "Bearer " + token).header("If-Match",version(token)).contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items", is(13))).andExpect(jsonPath("$.created", is(13))).andExpect(jsonPath("$.replayed", is(false)));
        mvc.perform(post("/api/wardrobe/import").header("Authorization", "Bearer " + token).header("If-Match",version(token)).contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body))
                .andExpect(status().isOk()).andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.created", is(13)));
        mvc.perform(post("/api/wardrobe/import").header("Authorization", "Bearer " + token).header("If-Match",version(token)).contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body.replace("네이비 블레이저", "다른 이름")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/wardrobe/import").header("Authorization", "Bearer " + token).header("If-Match",version(token)).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created", is(0))).andExpect(jsonPath("$.updated", is(13)));
        mvc.perform(get("/api/items").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(13)));
    }

    @Test
    @Order(2)
    void 판정_코디_비교() throws Exception {
        // Imported photo drafts must be held before any rule counts are shown.
        mvc.perform(post("/api/judge").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"candidate\":{\"cat\":\"top\",\"kind\":\"knit\",\"family\":\"burgundy\",\"light\":30,\"formality\":2,\"name\":\"버건디 니트\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status", is("needs-confirmation"))).andExpect(jsonPath("$.before").doesNotExist()).andExpect(jsonPath("$.excludedItems", hasSize(13)));
        // Synthetic explicit owner confirmation restores the historical known-input regression.
        for (Object row : (java.util.List<?>) Bodies.map(sample()).get("items")) {
            String id = (String) ((java.util.Map<?,?>) row).get("id");
            mvc.perform(put("/api/items/" + id + "/attr-source").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"attrSource\":\"owner-confirmed\"}"))
                    .andExpect(status().isOk());
        }
        mvc.perform(post("/api/judge").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"candidate\":{\"cat\":\"top\",\"kind\":\"knit\",\"family\":\"burgundy\",\"light\":30,\"formality\":2,\"pattern\":\"solid\",\"name\":\"버건디 니트\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.overlaps", hasSize(0))).andExpect(jsonPath("$.added", hasSize(1))).andExpect(jsonPath("$.after", is(11)))
                .andExpect(jsonPath("$.blockers[0].count", is(2))).andExpect(jsonPath("$.draftItems.length()", is(0)));
        mvc.perform(get("/api/outfits").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].top.id", is("s-ocbd-stripe"))).andExpect(jsonPath("$[0].score", is(8)));
        mvc.perform(post("/api/compare").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"theirs\":\"template\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.both", hasSize(9))).andExpect(jsonPath("$.onlyTheirs", hasSize(6)));
    }

    @Test
    @Order(3)
    void 상품_목록과_순위와_후보() throws Exception {
        mvc.perform(get("/api/catalog/rank").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/api/catalog/products").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"p1\",\"name\":\"네이비 크루넥 니트\",\"cat\":\"top\",\"kind\":\"knit\",\"family\":\"navy\",\"light\":18,\"formality\":2,\"pattern\":\"solid\",\"price\":129000,\"checkedAt\":\"2026-01-05\",\"link\":\"https://shop.example/knit\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/catalog/rank").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$[0].product.id", is("p1"))).andExpect(jsonPath("$[0].gap.id", is("t-knit-navy"))).andExpect(jsonPath("$[0].stale", is(true)));
        mvc.perform(post("/api/catalog/products/p1/candidate").header("Authorization", "Bearer " + token)).andExpect(status().isCreated()).andExpect(jsonPath("$.status", is("candidate"))).andExpect(jsonPath("$.photo.kind", is("confirmed")))
                .andExpect(jsonPath("$.product.name", is("네이비 크루넥 니트"))).andExpect(jsonPath("$.price", is(129000)));
    }

    @Test
    @Order(4)
    void 사진_상태는_사용자_동작으로만_바뀐다() throws Exception {
        String img = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
        mvc.perform(put("/api/items/s-blazer-navy/photo/own").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"img\":\"" + img + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("own")));
        mvc.perform(put("/api/items/s-blazer-navy/photo/product").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"confirmed\",\"brand\":\"B\",\"name\":\"N\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/items/s-blazer-navy/photo/product").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"candidate\",\"brand\":\"브랜드 A\",\"name\":\"모델 1\",\"sourceName\":\"쇼핑몰\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("candidate"))).andExpect(jsonPath("$.matchCandidates", hasSize(1))).andExpect(jsonPath("$.brand", is("")));
        mvc.perform(post("/api/items/s-blazer-navy/confirm").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{\"brand\":\"브랜드 A\",\"name\":\"모델 1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("confirmed"))).andExpect(jsonPath("$.product.brand", is("브랜드 A"))).andExpect(jsonPath("$.brand", is("브랜드 A"))).andExpect(jsonPath("$.matchCandidates", hasSize(0)));
        mvc.perform(delete("/api/items/s-blazer-navy/confirm").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("candidate"))).andExpect(jsonPath("$.product").doesNotExist());
        mvc.perform(delete("/api/items/s-blazer-navy/photo/product").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("own"))).andExpect(jsonPath("$.photo.img", is(img)));
        mvc.perform(post("/api/items/s-blazer-navy/confirm").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    @Order(5)
    void 내보내기는_보유_옷만_기본값으로() throws Exception {
        mvc.perform(get("/api/wardrobe/export").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$.schema", is(2))).andExpect(jsonPath("$.items", hasSize(13)))
                .andExpect(jsonPath("$.items[0].photo.img").isNotEmpty()).andExpect(jsonPath("$.items[0].matchCandidates", hasSize(0))).andExpect(jsonPath("$.owner.height").doesNotExist());
        mvc.perform(get("/api/wardrobe").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(14)));
    }

    @Test
    @Order(6)
    void 통합_후속기록과_미확인원피스_왕복() throws Exception {
        String body = """
          {"schema":2,"owner":{},"items":[{"id":"integration-dress","cat":"dress","kind":null,"name":"사진 속 옷","status":"owned","brand":"","model":""}],
           "decisions":[{"id":"integration-decision","itemId":"integration-dress","name":"합성 검증","before":{"lean":"buy","at":"2026-10-13"},"summary":{},
             "after":{"decision":"buy","helpful":"yes","at":"2026-10-13","insight":"합성 기록"},
             "follow":{"at":"2026-10-13","worn":"few","feel":"good"},
             "followup":{"at":"2026-10-13","outcome":"purchased","worn":"yes","regret":"no","note":"합성 후속"}}]}
          """;
        mvc.perform(post("/api/wardrobe/import").header("Authorization", "Bearer " + token).header("If-Match", version(token)).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isOk());
        mvc.perform(get("/api/wardrobe").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
          .andExpect(jsonPath("$.decisions[?(@.id == 'integration-decision')].follow.worn", org.hamcrest.Matchers.contains("few")))
          .andExpect(jsonPath("$.decisions[?(@.id == 'integration-decision')].followup.outcome", org.hamcrest.Matchers.contains("purchased")))
          .andExpect(jsonPath("$.decisions[?(@.id == 'integration-decision')].after.insight", org.hamcrest.Matchers.contains("합성 기록")));
        mvc.perform(get("/api/items/integration-dress").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
          .andExpect(jsonPath("$.cat", is("dress"))).andExpect(jsonPath("$.kind").doesNotExist()).andExpect(jsonPath("$.family").doesNotExist());
    }
}
