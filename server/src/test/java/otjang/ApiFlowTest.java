package otjang;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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
 * 2026-10-12: 작업 환경에서 Maven Central 이 막혀 이 테스트는 아직 실행하지 못했다(미실행).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ApiFlowTest {
    @Container
    @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) throws Exception {
        r.add("otjang.photo-dir", () -> Files.createTempDirectory("otjang-photos").toString());
    }

    @Autowired
    MockMvc mvc;

    static String sample() throws Exception {
        return Files.readString(Path.of("../app/data/sample-wardrobe.json"), StandardCharsets.UTF_8);
    }

    @Test
    @Order(1)
    void 가져오기는_멱등이다() throws Exception {
        String body = sample();
        mvc.perform(post("/api/wardrobe/import").contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items", is(13))).andExpect(jsonPath("$.created", is(13))).andExpect(jsonPath("$.replayed", is(false)));
        mvc.perform(post("/api/wardrobe/import").contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body))
                .andExpect(status().isOk()).andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.created", is(13)));
        mvc.perform(post("/api/wardrobe/import").contentType(MediaType.APPLICATION_JSON).header("Idempotency-Key", "k1").content(body.replace("네이비 블레이저", "다른 이름")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/wardrobe/import").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created", is(0))).andExpect(jsonPath("$.updated", is(13)));
        mvc.perform(get("/api/items")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(13)));
    }

    @Test
    @Order(2)
    void 판정_코디_비교() throws Exception {
        mvc.perform(post("/api/judge").contentType(MediaType.APPLICATION_JSON).content("{\"candidate\":{\"cat\":\"top\",\"kind\":\"knit\",\"family\":\"burgundy\",\"light\":30,\"formality\":2,\"name\":\"버건디 니트\"}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.overlaps", hasSize(0))).andExpect(jsonPath("$.added", hasSize(1))).andExpect(jsonPath("$.after", is(11)))
                .andExpect(jsonPath("$.blockers[0].count", is(2))).andExpect(jsonPath("$.draftItems.length()", is(1)));
        mvc.perform(get("/api/outfits")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].top.id", is("s-ocbd-stripe"))).andExpect(jsonPath("$[0].score", is(8)));
        mvc.perform(post("/api/compare").contentType(MediaType.APPLICATION_JSON).content("{\"theirs\":\"template\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.both", hasSize(9))).andExpect(jsonPath("$.onlyTheirs", hasSize(6)));
    }

    @Test
    @Order(3)
    void 상품_목록과_순위와_후보() throws Exception {
        mvc.perform(get("/api/catalog/rank")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(post("/api/catalog/products").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"p1\",\"name\":\"네이비 크루넥 니트\",\"cat\":\"top\",\"kind\":\"knit\",\"family\":\"navy\",\"light\":18,\"formality\":2,\"price\":129000,\"checkedAt\":\"2026-01-05\",\"link\":\"https://shop.example/knit\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/catalog/rank")).andExpect(status().isOk()).andExpect(jsonPath("$[0].product.id", is("p1"))).andExpect(jsonPath("$[0].gap.id", is("t-knit-navy"))).andExpect(jsonPath("$[0].stale", is(true)));
        mvc.perform(post("/api/catalog/products/p1/candidate")).andExpect(status().isCreated()).andExpect(jsonPath("$.status", is("candidate"))).andExpect(jsonPath("$.photo.kind", is("confirmed")))
                .andExpect(jsonPath("$.product.name", is("네이비 크루넥 니트"))).andExpect(jsonPath("$.price", is(129000)));
    }

    @Test
    @Order(4)
    void 사진_상태는_사용자_동작으로만_바뀐다() throws Exception {
        String img = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
        mvc.perform(put("/api/items/s-blazer-navy/photo/own").contentType(MediaType.APPLICATION_JSON).content("{\"img\":\"" + img + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("own")));
        mvc.perform(put("/api/items/s-blazer-navy/photo/product").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"confirmed\",\"brand\":\"B\",\"name\":\"N\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/items/s-blazer-navy/photo/product").contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"candidate\",\"brand\":\"브랜드 A\",\"name\":\"모델 1\",\"sourceName\":\"쇼핑몰\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("candidate"))).andExpect(jsonPath("$.matchCandidates", hasSize(1))).andExpect(jsonPath("$.brand", is("")));
        mvc.perform(post("/api/items/s-blazer-navy/confirm").contentType(MediaType.APPLICATION_JSON).content("{\"brand\":\"브랜드 A\",\"name\":\"모델 1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("confirmed"))).andExpect(jsonPath("$.product.brand", is("브랜드 A"))).andExpect(jsonPath("$.brand", is("브랜드 A"))).andExpect(jsonPath("$.matchCandidates", hasSize(0)));
        mvc.perform(delete("/api/items/s-blazer-navy/confirm")).andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("candidate"))).andExpect(jsonPath("$.product").doesNotExist());
        mvc.perform(delete("/api/items/s-blazer-navy/photo/product")).andExpect(status().isOk()).andExpect(jsonPath("$.photo.kind", is("own"))).andExpect(jsonPath("$.photo.img", is(img)));
        mvc.perform(post("/api/items/s-blazer-navy/confirm").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
    }

    @Test
    @Order(5)
    void 내보내기는_보유_옷만_기본값으로() throws Exception {
        mvc.perform(get("/api/wardrobe/export")).andExpect(status().isOk()).andExpect(jsonPath("$.schema", is(2))).andExpect(jsonPath("$.items", hasSize(13)))
                .andExpect(jsonPath("$.items[0].photo.img").isNotEmpty()).andExpect(jsonPath("$.items[0].matchCandidates", hasSize(0))).andExpect(jsonPath("$.owner.height").doesNotExist());
        mvc.perform(get("/api/wardrobe")).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(14)));
    }
}
