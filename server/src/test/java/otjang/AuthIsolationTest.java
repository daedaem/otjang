package otjang;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import otjang.api.Bodies;
import otjang.persistence.OwnerRepository;
import otjang.security.AuthService;
import otjang.store.LocalDirPhotoStore;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real PostgreSQL tenant boundaries, credential lifecycle and full backup restore. Only synthetic data. */
@SpringBootTest @AutoConfigureMockMvc(print = MockMvcPrint.NONE) @Testcontainers @TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class AuthIsolationTest {
    @Container @ServiceConnection static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16");
    static final Path photos;
    static { try { photos=Files.createTempDirectory("otjang-beta-photos-"); } catch(Exception e){throw new RuntimeException(e);} }
    @DynamicPropertySource static void props(DynamicPropertyRegistry r){r.add("otjang.photo-dir",photos::toString);r.add("otjang.auth.invite-code",()->"synthetic-invite");}
    @Autowired MockMvc mvc; @Autowired JdbcTemplate jdbc; @Autowired OwnerRepository owners; @Autowired PasswordEncoder encoder; @Autowired AuthService auth;
    static String a,b; static long ownerA,ownerB; static String image;
    final JsonMapper json=JsonMapper.builder().build();
    String getJson(String url,String token) throws Exception{return mvc.perform(get(url).header("Authorization","Bearer "+token)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();}
    String body(Object o){return json.writeValueAsString(o);}
    String version(String credential) throws Exception {
        String value = mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + credential)).andExpect(status().isOk()).andReturn().getResponse().getHeader("X-Wardrobe-Version");
        if (value == null) throw new AssertionError("revision response header missing");
        return "\"" + value + "\"";
    }

    Map<String,Object> register(String user)throws Exception{return Bodies.map(mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username",user,"password","synthetic-password-only","inviteCode","synthetic-invite")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());}
    @Test @Order(1) void authentication_preserves_legacy_owner_and_hashes_credentials() throws Exception {
        mvc.perform(get("/api/wardrobe")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/items").contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"forbidden\",\"cat\":\"top\"}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username","denied","password","synthetic-password-only","inviteCode","wrong")))).andExpect(status().isForbidden());
        var aa=register("alpha");var bb=register("beta");a=(String)aa.get("token");b=(String)bb.get("token");
        ownerA=((Number)((Map<?,?>)aa.get("user")).get("ownerId")).longValue();ownerB=((Number)((Map<?,?>)bb.get("user")).get("ownerId")).longValue();
        assertTrue(ownerA>1);assertTrue(ownerB>1);assertNotEquals(ownerA,ownerB);assertTrue(owners.existsById(1L));
        assertEquals(43,a.length());assertEquals(64,jdbc.queryForObject("select length(token_hash) from beta_session where owner_id=?",Integer.class,ownerA));
        assertEquals(0,jdbc.queryForObject("select count(*) from beta_session where token_hash=?",Integer.class,a));
        String hash=jdbc.queryForObject("select password_hash from beta_account where owner_id=?",String.class,ownerA);assertTrue(encoder.matches("synthetic-password-only",hash));assertNotEquals("synthetic-password-only",hash);
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer wrong")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization","Basic YTpi")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username","alpha","password","wrong")))).andExpect(status().isUnauthorized());
    }
    @Test @Order(2) void every_item_operation_is_scoped_to_the_authenticated_owner() throws Exception {
        String item="{\"id\":\"only-a\",\"name\":\"A private shirt\",\"cat\":\"top\",\"kind\":\"shirt\",\"family\":\"blue\",\"light\":50,\"formality\":2,\"pattern\":\"solid\",\"seasons\":[\"봄\",\"여름\",\"가을\",\"겨울\"]}";
        mvc.perform(post("/api/items").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content(item)).andExpect(status().isCreated());
        mvc.perform(get("/api/items").header("Authorization","Bearer "+b)).andExpect(status().isOk()).andExpect(jsonPath("$",hasSize(0)));
        mvc.perform(get("/api/items/only-a").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        mvc.perform(put("/api/items/only-a").header("Authorization","Bearer "+b).contentType(MediaType.APPLICATION_JSON).content(item)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/items/only-a").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        mvc.perform(put("/api/items/only-a/photo/own").header("Authorization","Bearer "+b).contentType(MediaType.APPLICATION_JSON).content("{\"img\":\"\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/judge").header("Authorization","Bearer "+b).contentType(MediaType.APPLICATION_JSON).content("{\"itemId\":\"only-a\"}")).andExpect(status().isNotFound());
        mvc.perform(put("/api/wardrobe/owner").header("Authorization","Bearer "+b).contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"Beta own\"}")).andExpect(status().isOk());
        assertEquals("alpha",Bodies.map(getJson("/api/wardrobe/owner",a)).get("nickname"));
    }
    @Test @Order(3) void catalog_decisions_and_import_receipts_are_isolated() throws Exception {
        String product="{\"id\":\"private-product\",\"cat\":\"top\",\"name\":\"Private knit\"}";
        mvc.perform(post("/api/catalog/products").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content(product)).andExpect(status().isCreated());
        mvc.perform(delete("/api/catalog/products/private-product").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        mvc.perform(post("/api/catalog/products/private-product/candidate").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/catalog").header("Authorization","Bearer "+b)).andExpect(status().isOk()).andExpect(jsonPath("$.products",hasSize(0)));
        String decision="{\"id\":\"private-decision\",\"itemId\":\"only-a\",\"before\":{\"lean\":\"unsure\",\"reason\":\"synthetic\",\"at\":\"2026-10-13\"},\"summary\":{\"overlaps\":null,\"added\":null,\"blockers\":null},\"after\":{\"decision\":\"hold\",\"helpful\":\"no\",\"note\":\"test\",\"at\":\"2026-10-13\",\"shift\":\"same\",\"insight\":\"test insight\",\"comparedWith\":\"chatbot\",\"comparisonNote\":\"test comparison\"},\"followup\":{\"outcome\":\"pending\",\"worn\":\"unknown\",\"regret\":\"unknown\",\"note\":\"test followup\",\"at\":\"2026-10-13\"}}";
        mvc.perform(post("/api/decisions").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content(decision)).andExpect(status().isCreated());
        mvc.perform(delete("/api/decisions/private-decision").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/decisions").header("Authorization","Bearer "+a)).andExpect(jsonPath("$[0].after.insight").value("test insight")).andExpect(jsonPath("$[0].followup.note").value("test followup"));
        mvc.perform(get("/api/decisions").header("Authorization","Bearer "+b)).andExpect(jsonPath("$",hasSize(0)));
        String wbA="{\"schema\":2,\"items\":[{\"id\":\"import-a\",\"cat\":\"top\",\"name\":\"alpha\"}]}";
        String wbB=wbA.replace("import-a","import-b");
        mvc.perform(post("/api/wardrobe/import").header("Authorization","Bearer "+a).header("If-Match",version(a)).header("Idempotency-Key","shared-key").contentType(MediaType.APPLICATION_JSON).content(wbA)).andExpect(status().isOk()).andExpect(jsonPath("$.created").value(1));
        mvc.perform(post("/api/wardrobe/import").header("Authorization","Bearer "+b).header("If-Match",version(b)).header("Idempotency-Key","shared-key").contentType(MediaType.APPLICATION_JSON).content(wbB)).andExpect(status().isOk()).andExpect(jsonPath("$.created").value(1)).andExpect(jsonPath("$.replayed").value(false));
        mvc.perform(post("/api/wardrobe/import").header("Authorization","Bearer "+a).header("If-Match",version(a)).header("Idempotency-Key","shared-key").contentType(MediaType.APPLICATION_JSON).content(wbA)).andExpect(jsonPath("$.replayed").value(true));
    }
    @Test @Order(4) void photo_validation_and_shared_reference_deletion() throws Exception {
        var bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"png",bytes);image="data:image/png;base64,"+Base64.getEncoder().encodeToString(bytes.toByteArray());
        for(String token:List.of(a,b)) {
            mvc.perform(post("/api/items").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"shared-photo\",\"cat\":\"top\"}")).andExpect(status().isCreated());
            mvc.perform(put("/api/items/shared-photo/photo/own").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("img",image)))).andExpect(status().isOk());
        }
        long count;try(var paths=Files.list(photos)){count=paths.count();}assertEquals(1,count);
        mvc.perform(put("/api/items/shared-photo/photo/own").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content("{\"img\":\"data:image/png;base64,SGVsbG8=\"}")).andExpect(status().isBadRequest());
        assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/shared-photo",a)).get("photo")).get("img"));
        mvc.perform(delete("/api/items/shared-photo").header("Authorization","Bearer "+a)).andExpect(status().isNoContent());
        assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/shared-photo",b)).get("photo")).get("img"));
        mvc.perform(delete("/api/items/shared-photo").header("Authorization","Bearer "+b)).andExpect(status().isNoContent());
        try(var paths=Files.list(photos)){assertEquals(0,paths.count());}
    }
    @Test @Order(5) void backup_restores_all_statuses_and_rejects_lossy_input_atomically() throws Exception {
        mvc.perform(put("/api/items/only-a/photo/own").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("img",image)))).andExpect(status().isOk());
        mvc.perform(post("/api/items").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"gone-a\",\"cat\":\"top\",\"status\":\"gone\"}")).andExpect(status().isCreated());
        var snapshot=Bodies.map(getJson("/api/backup",a));
        mvc.perform(delete("/api/items/only-a").header("Authorization","Bearer "+a)).andExpect(status().isNoContent());
        mvc.perform(post("/api/backup/restore").header("Authorization","Bearer "+a).header("If-Match",version(a)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("backup",snapshot,"confirmReplace",false)))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/backup/restore").header("Authorization","Bearer "+a).header("If-Match",version(a)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("backup",snapshot,"confirmReplace",true)))).andExpect(status().isOk());
        var restored=Bodies.map(getJson("/api/backup",a));assertEquals(snapshot.get("wardrobe"),restored.get("wardrobe"));assertEquals(snapshot.get("catalog"),restored.get("catalog"));
        assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/only-a",a)).get("photo")).get("img"));
        mvc.perform(get("/api/items/only-a").header("Authorization","Bearer "+b)).andExpect(status().isNotFound());
        var bad=Bodies.map(body(snapshot));((Map<String,Object>)((List<?>)((Map<?,?>)bad.get("wardrobe")).get("items")).getFirst()).put("cat","invalid");
        mvc.perform(post("/api/backup/restore").header("Authorization","Bearer "+a).header("If-Match",version(a)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("backup",bad,"confirmReplace",true)))).andExpect(status().isBadRequest());
        assertEquals(restored.get("wardrobe"),Bodies.map(getJson("/api/backup",a)).get("wardrobe"));
        var invalidDate=Bodies.map(body(snapshot));
        ((Map<String,Object>)((List<?>)((Map<?,?>)invalidDate.get("wardrobe")).get("items")).getFirst()).put("checkedAt","2026-99-99");
        mvc.perform(post("/api/backup/restore").header("Authorization","Bearer "+a).header("If-Match",version(a)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("backup",invalidDate,"confirmReplace",true)))).andExpect(status().isBadRequest());
        assertEquals(restored.get("wardrobe"),Bodies.map(getJson("/api/backup",a)).get("wardrobe"));
    }
    @Test @Order(6) void logout_expiry_closed_signup_and_account_erasure() throws Exception {
        var session=Bodies.map(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username","alpha","password","synthetic-password-only")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String second=(String)session.get("token");
        mvc.perform(post("/api/auth/logout").header("Authorization","Bearer "+second)).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+second)).andExpect(status().isUnauthorized());
        jdbc.update("update beta_session set expires_at=now()-interval '1 second' where token_hash=?",LocalDirPhotoStore.sha256(a));
        mvc.perform(get("/api/wardrobe").header("Authorization","Bearer "+a)).andExpect(status().isUnauthorized());
        var fresh=Bodies.map(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("username","alpha","password","synthetic-password-only")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());a=(String)fresh.get("token");
        var closed=new AuthService(jdbc,owners,encoder,"",43200);var failure=assertThrows(otjang.api.ApiException.class,()->closed.register("closed","synthetic-password-only","synthetic-invite"));assertEquals(403,failure.status());
        mvc.perform(delete("/api/account").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"wrong\"}")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/account").header("Authorization","Bearer "+a).contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"synthetic-password-only\"}")).andExpect(status().isNoContent());
        assertFalse(owners.existsById(ownerA));assertTrue(owners.existsById(ownerB));assertTrue(owners.existsById(1L));
        mvc.perform(get("/api/wardrobe").header("Authorization","Bearer "+a)).andExpect(status().isUnauthorized());
        try(var paths=Files.list(photos)){assertEquals(0,paths.count());}
    }
    @Test @Order(7) void deployment_transport_cors_and_auth_rate_boundaries() throws Exception {
        assertThrows(IllegalArgumentException.class,()->new otjang.api.WebConfig("*",false));
        assertThrows(IllegalArgumentException.class,()->new otjang.api.WebConfig("null",true));
        assertDoesNotThrow(()->new otjang.api.WebConfig("https://beta.example",true));
        assertThrows(IllegalArgumentException.class,()->new otjang.security.DeploymentSafety("0.0.0.0",false,false));
        assertThrows(IllegalArgumentException.class,()->new otjang.security.DeploymentSafety("0.0.0.0",true,false));
        assertDoesNotThrow(()->new otjang.security.DeploymentSafety("127.0.0.1",false,false));
        assertDoesNotThrow(()->new otjang.security.DeploymentSafety("0.0.0.0",true,true));
        var request=new org.springframework.mock.web.MockHttpServletRequest("GET","/api/wardrobe");
        var response=new org.springframework.mock.web.MockHttpServletResponse();
        var passed=new java.util.concurrent.atomic.AtomicBoolean();
        new otjang.security.BearerFilter(auth,true).doFilter(request,response,(req,res)->passed.set(true));
        assertEquals(403,response.getStatus());assertFalse(passed.get());
        mvc.perform(options("/api/wardrobe").header("Origin","https://untrusted.example").header("Access-Control-Request-Method","GET")).andExpect(status().isForbidden());
        mvc.perform(options("/api/wardrobe").header("Origin","null").header("Access-Control-Request-Method","GET").header("Access-Control-Request-Headers","authorization")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","null"));
        for(int i=0;i<20;i++) mvc.perform(post("/api/auth/register").with(r->{r.setRemoteAddr("198.51.100.99");return r;}).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"rate-test\",\"password\":\"synthetic-password-only\",\"inviteCode\":\"wrong\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/register").with(r->{r.setRemoteAddr("198.51.100.99");return r;}).contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"rate-test\",\"password\":\"synthetic-password-only\",\"inviteCode\":\"wrong\"}")).andExpect(status().isTooManyRequests());
    }

    @Test @Order(8) void failed_batch_and_restore_collect_new_files_and_preserve_shared_photos() throws Exception {
        String c=(String)register("gamma").get("token");
        for(String token:List.of(b,c)) {
            mvc.perform(post("/api/items").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\"existing-shared\",\"cat\":\"top\"}")).andExpect(status().isCreated());
            mvc.perform(put("/api/items/existing-shared/photo/own").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("img",image)))).andExpect(status().isOk());
        }
        var pixels=new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB);pixels.setRGB(0,0,0xff0000);var bytes=new ByteArrayOutputStream();ImageIO.write(pixels,"png",bytes);
        String fresh="data:image/png;base64,"+Base64.getEncoder().encodeToString(bytes.toByteArray());
        String freshRef=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()))+".png";
        var newItem=Map.of("id","rollback-new","cat","top","photo",Map.of("kind","own","img",fresh));
        var badItem=Map.of("id","rollback-bad","cat","top","photo",Map.of("kind","own","img","data:image/png;base64,SGVsbG8="));
        String before=getJson("/api/wardrobe",b);
        for(int retry=0;retry<2;retry++) {
            var batch=Map.of("schema",2,"items",List.of(newItem,badItem));
            mvc.perform(post("/api/wardrobe/import").header("Authorization","Bearer "+b).header("If-Match",version(b)).contentType(MediaType.APPLICATION_JSON).content(body(batch))).andExpect(status().isBadRequest());
            assertEquals(before,getJson("/api/wardrobe",b));assertFalse(Files.exists(photos.resolve(freshRef)));
            try(var paths=Files.list(photos)){assertEquals(1,paths.count());}
            assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/existing-shared",c)).get("photo")).get("img"));
        }
        var snapshot=Bodies.map(getJson("/api/backup",b));
        var changed=Bodies.map(body(snapshot));
        var items=(List<Map<String,Object>>)((Map<?,?>)changed.get("wardrobe")).get("items");
        var first=Bodies.map(body(items.getFirst()));first.put("id","restore-new");first.put("photo",Map.of("kind","own","img",fresh,"ownImg",fresh,"sourceName","","sourceUrl","","checkedAt",""));
        var second=Bodies.map(body(items.getFirst()));second.put("id","restore-bad");second.put("photo",Map.of("kind","own","img","data:image/png;base64,SGVsbG8=","ownImg","data:image/png;base64,SGVsbG8=","sourceName","","sourceUrl","","checkedAt",""));
        ((Map<String,Object>)changed.get("wardrobe")).put("items",List.of(first,second));
        mvc.perform(post("/api/backup/restore").header("Authorization","Bearer "+b).header("If-Match",version(b)).contentType(MediaType.APPLICATION_JSON).content(body(Map.of("backup",changed,"confirmReplace",true)))).andExpect(status().isBadRequest());
        assertEquals(snapshot.get("wardrobe"),Bodies.map(getJson("/api/backup",b)).get("wardrobe"));assertFalse(Files.exists(photos.resolve(freshRef)));
        assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/existing-shared",c)).get("photo")).get("img"));
        try(var paths=Files.list(photos)){assertEquals(1,paths.count());}
        // A failing replacement that references the shared image must never remove the other owner's image.
        mvc.perform(delete("/api/items/existing-shared").header("Authorization","Bearer "+b)).andExpect(status().isNoContent());
        assertEquals(image,((Map<?,?>)Bodies.map(getJson("/api/items/existing-shared",c)).get("photo")).get("img"));
    }

}
