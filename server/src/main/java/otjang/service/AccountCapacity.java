package otjang.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import otjang.api.ApiException;
import otjang.domain.RecordLimits;

import java.util.Collection;
import java.util.HashSet;

/** Capacity checks share the revision owner-row lock, including direct/local service calls.
 * Check every list before any mapper writes photos, rows or idempotency receipts.
 */
@Service
public final class AccountCapacity {
    public enum Records {
        ITEMS("item", "items"), DECISIONS("decision", "decisions"), PRODUCTS("catalog_product", "products");
        private final String table, path;
        Records(String table, String path) { this.table = table; this.path = path; }
    }
    private final JdbcTemplate jdbc;
    public AccountCapacity(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void lock(long owner) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Capacity requires a transaction");
        if (jdbc.queryForList("select id from owner where id=? for update", Long.class, owner).isEmpty())
            throw new ApiException(401, "이 계정은 더 이상 사용할 수 없습니다");
    }
    public void requireUpsert(long owner, Records kind, Collection<String> incomingIds) {
        var existing = new HashSet<>(jdbc.queryForList("select client_id from " + kind.table + " where owner_id=?", String.class, owner));
        var additions = new HashSet<>(incomingIds);
        additions.removeAll(existing);
        // Legacy accounts may update all existing records; only new distinct IDs consume capacity.
        if (!additions.isEmpty() && (long) existing.size() + additions.size() > RecordLimits.CREATE_LIMIT)
            throw new ApiException(422, "새 기록은 종류별 최대 " + RecordLimits.CREATE_LIMIT + "개입니다. 기존 기록 수정과 전체 백업 복원은 가능합니다", "ACCOUNT_LIMIT", kind.path);
    }
    public static void requireReadable(int count, String path) {
        if (count > RecordLimits.READ_CEILING)
            throw new ApiException(422, "기록이 읽기 상한 " + RecordLimits.READ_CEILING + "개를 넘었습니다. 일부만 반환하지 않습니다", "READ_CEILING", path);
    }
}
