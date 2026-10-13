package otjang.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.boot.json.JsonParserFactory;
import tools.jackson.databind.json.JsonMapper;
import otjang.api.ApiException;
import otjang.domain.WardrobeCleaner;
import otjang.persistence.OwnerRepository;
import otjang.security.AuthService;
import otjang.security.OwnerScope;
import otjang.store.PhotoLifecycle;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Complete server-owned tenant snapshot. Browser-only rack/other wardrobes are deliberately a separate backup. */
@Service
public class TenantDataService {
    private final WardrobeService wardrobe;
    private final CatalogService catalog;
    private final JdbcTemplate jdbc;
    private final OwnerRepository owners;
    private final AuthService auth;
    private final PhotoLifecycle photos;
    private final JsonMapper json=JsonMapper.builder().build();
    public TenantDataService(WardrobeService wardrobe, CatalogService catalog, JdbcTemplate jdbc, OwnerRepository owners, AuthService auth, PhotoLifecycle photos) {
        this.wardrobe=wardrobe;this.catalog=catalog;this.jdbc=jdbc;this.owners=owners;this.auth=auth;this.photos=photos;
    }
    @Transactional(readOnly=true)
    public Map<String,Object> backup() {
        return Map.of("schema",1,"kind","otjang-server-backup","exportedAt",Instant.now().toString(),
                "wardrobe",Map.of("schema",2,"kind","wardrobe","owner",wardrobe.owner(),"items",wardrobe.allItems(true),"decisions",wardrobe.allDecisions()),
                "catalog",catalog.export());
    }
    @SuppressWarnings("unchecked")
    private static Map<String,Object> map(Object value) { if(!(value instanceof Map<?,?> m)) throw new ApiException(400,"백업 모양이 맞지 않습니다"); return (Map<String,Object>)m; }
    private static List<?> array(Object value) { if(!(value instanceof List<?> a)||a.size()>500)throw new ApiException(400,"백업 항목은 최대 500개입니다");return a; }
    private Object tree(Object value) { return JsonParserFactory.getJsonParser().parseMap(json.writeValueAsString(Map.of("value",value))).get("value"); }
    private static boolean same(Object a,Object b) {
        if(a==null||b==null)return a==b;
        if(a instanceof Number x&&b instanceof Number y)return Double.compare(x.doubleValue(),y.doubleValue())==0;
        if(a instanceof Map<?,?> x&&b instanceof Map<?,?> y)return x.keySet().equals(y.keySet())&&x.keySet().stream().allMatch(k->same(x.get(k),y.get(k)));
        if(a instanceof List<?> x&&b instanceof List<?> y){if(x.size()!=y.size())return false;for(int i=0;i<x.size();i++)if(!same(x.get(i),y.get(i)))return false;return true;}
        return a.equals(b);
    }
    private static void keys(Map<String,Object> m,Set<String> expected){if(!m.keySet().equals(expected))throw new ApiException(400,"백업 필드가 빠졌거나 지원하지 않는 필드가 있습니다");}
    private static void validDates(Object value) {
        if(value instanceof Map<?,?> m) for(var entry:m.entrySet()) {
            if(java.util.Set.of("at","checkedAt","confirmedAt").contains(entry.getKey()) && entry.getValue() instanceof String date && !date.isEmpty()) {
                try { java.time.LocalDate.parse(date); }
                catch(java.time.format.DateTimeParseException invalid) { throw new ApiException(400,"백업 날짜가 올바르지 않습니다"); }
            }
            validDates(entry.getValue());
        }
        else if(value instanceof List<?> list) list.forEach(TenantDataService::validDates);
    }
    @Transactional
    public Map<String,Object> restore(Map<String,Object> backup,boolean confirmed) {
        if(!confirmed)throw new ApiException(400,"전체 교체를 확인해야 합니다");
        keys(backup,Set.of("schema","kind","exportedAt","wardrobe","catalog"));
        if(!(backup.get("schema") instanceof Number n)||n.doubleValue()!=1||!"otjang-server-backup".equals(backup.get("kind")))throw new ApiException(400,"서버 전체 백업 파일이 아닙니다");
        try { Instant.parse((String)backup.get("exportedAt")); } catch(RuntimeException e){throw new ApiException(400,"백업 날짜가 올바르지 않습니다");}
        Map<String,Object>w=map(backup.get("wardrobe")),c=map(backup.get("catalog"));
        keys(w,Set.of("schema","kind","owner","items","decisions"));
        keys(c,Set.of("schema","kind","name","note","products"));
        array(w.get("items"));array(w.get("decisions"));array(c.get("products"));validDates(w);validDates(c);
        var cleanW=WardrobeCleaner.cleanWardrobe(w);var cleanC=WardrobeCleaner.cleanCatalog(c);
        if(cleanW==null||cleanC==null||!same(w.get("items"),tree(cleanW.items()))||!same(w.get("decisions"),tree(cleanW.decisions()))||!same(w.get("owner"),tree(cleanW.owner()))||!same(c.get("products"),tree(cleanC.products())))
            throw new ApiException(400,"백업 데이터가 잘못됐습니다. 자동 보정하거나 일부만 복원하지 않습니다");
        if(!"wardrobe".equals(w.get("kind"))||((Number)w.get("schema")).intValue()!=2)throw new ApiException(400,"옷장 스키마가 맞지 않습니다");
        long owner=OwnerScope.ownerId();photos.lock();photos.afterCommit(photos.ownerRefs(owner));
        jdbc.update("delete from item where owner_id=?",owner);jdbc.update("delete from decision where owner_id=?",owner);
        jdbc.update("delete from catalog_product where owner_id=?",owner);jdbc.update("delete from import_receipt where owner_id=?",owner);
        wardrobe.updateOwner(map(w.get("owner")));
        var r=wardrobe.importWardrobe(w,null,null);var cr=catalog.importCatalog(c,null,null);
        return Map.of("items",r.items(),"decisions",r.decisions(),"products",cr.items());
    }
    @Transactional
    public void deleteAccount(String password) {
        auth.requirePassword(password);long owner=OwnerScope.ownerId();photos.lock();photos.afterCommit(photos.ownerRefs(owner));
        owners.deleteById(owner);owners.flush();
    }
}
