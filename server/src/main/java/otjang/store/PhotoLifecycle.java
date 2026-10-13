package otjang.store;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.beans.factory.annotation.Value;
import otjang.api.ApiException;
import otjang.security.OwnerScope;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Set;

/** All photo-reference writers and collectors use the same PostgreSQL transaction lock.
 * Collection runs only after a successful commit and checks references across every tenant.
 */
@Component
public class PhotoLifecycle {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate isolated;
    private final Path dir;
    public PhotoLifecycle(JdbcTemplate jdbc, PlatformTransactionManager manager, @Value("${otjang.photo-dir:./data/photos}") String dir) {
        this.jdbc=jdbc; this.dir=Path.of(dir); isolated=new TransactionTemplate(manager);
        isolated.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public void lock() { jdbc.execute("select pg_advisory_xact_lock(716241013)"); }
    public List<String> ownerRefs(long owner) {
        return jdbc.queryForList("select photo_img_ref from item where owner_id=? union select photo_own_img_ref from item where owner_id=? union select img_ref from catalog_product where owner_id=?", String.class, owner, owner, owner);
    }
    private static final Object QUOTA_KEY = new Object();
    private static final class Quota {
        final java.util.Set<String> refs = new java.util.HashSet<>(); long total;
    }
    public void ensureQuota(String ref, int additionalBytes) {
        if(!TransactionSynchronizationManager.isSynchronizationActive())throw new IllegalStateException("Photos require a transaction");
        Quota quota=(Quota)TransactionSynchronizationManager.getResource(QUOTA_KEY);
        if(quota==null) {
            quota=new Quota();
            for(String old:ownerRefs(OwnerScope.ownerId())) if(valid(old)) {
                quota.refs.add(old);
                try { if(Files.exists(dir.resolve(old))) quota.total+=Files.size(dir.resolve(old)); }
                catch(IOException e) { throw new ApiException(500,"사진 용량을 확인하지 못했습니다"); }
            }
            TransactionSynchronizationManager.bindResource(QUOTA_KEY,quota);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
                @Override public void afterCompletion(int status){TransactionSynchronizationManager.unbindResourceIfPossible(QUOTA_KEY);}
            });
        }
        if(quota.refs.contains(ref))return;
        if(quota.total+additionalBytes>64L*1024*1024)throw new ApiException(413,"사진 저장 한도(64MB)를 넘었습니다");
        quota.refs.add(ref);quota.total+=additionalBytes;
    }
    private static boolean valid(String ref) { return ref!=null&&ref.matches("[0-9a-f]{64}\\.(webp|png|jpeg)"); }
    public void afterCommit(Collection<String> refs) {
        Set<String> candidates=refs.stream().filter(PhotoLifecycle::valid).collect(java.util.stream.Collectors.toSet());
        if(candidates.isEmpty())return;
        if(!TransactionSynchronizationManager.isSynchronizationActive())throw new IllegalStateException("Photo cleanup requires a transaction");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCommit(){
                try { collect(candidates); }
                catch(RuntimeException failure) { org.slf4j.LoggerFactory.getLogger(PhotoLifecycle.class).error("Photo cleanup could not complete; retry maintenance is required"); }
            }
        });
    }
    /** A new file belongs to the transaction until its DB references are committed. */
    public void onRollback(String ref) {
        if(!valid(ref))return;
        if(!TransactionSynchronizationManager.isSynchronizationActive())throw new IllegalStateException("Photo rollback cleanup requires a transaction");
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCompletion(int status){
                if(status!=TransactionSynchronization.STATUS_COMMITTED) {
                    try { collect(java.util.List.of(ref)); }
                    catch(RuntimeException failure) { org.slf4j.LoggerFactory.getLogger(PhotoLifecycle.class).error("Rolled-back photo cleanup could not complete; retry maintenance is required"); }
                }
            }
        });
    }
    public void collect(Collection<String> refs) {
        isolated.executeWithoutResult(s->{
            lock();
            for(String ref:refs) if(valid(ref)) {
                Long count=jdbc.queryForObject("select (select count(*) from item where photo_img_ref=? or photo_own_img_ref=?) + (select count(*) from catalog_product where img_ref=?)",Long.class,ref,ref,ref);
                if(count!=null&&count==0) try { Files.deleteIfExists(dir.resolve(ref)); } catch(IOException e) { throw new IllegalStateException("Photo cleanup failed"); }
            }
        });
    }
}
