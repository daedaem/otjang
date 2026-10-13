package otjang.service;

import jakarta.servlet.ServletException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import otjang.api.ApiException;

import java.io.IOException;
import java.util.function.IntSupplier;

/** The owner lock covers the version check, controller/service work and commit.
 * All services join this outer transaction. Failed HTTP responses roll it back, including photo cleanup hooks.
 */
@Service
public class RevisionService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public RevisionService(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.transaction = new TransactionTemplate(manager);
    }
    @FunctionalInterface public interface Work { void run() throws IOException, ServletException; }
    public static final class ChainFailure extends RuntimeException {
        public ChainFailure(Exception cause) { super(cause); }
    }
    /** Returns the committed revision, or null for failed responses / successful account deletion. */
    public Long exchange(long owner, Long expected, boolean mutation, boolean deletingAccount, Work work, IntSupplier status) {
        return transaction.execute(tx -> {
            var versions = jdbc.queryForList("select revision from owner where id=? for update", Long.class, owner);
            if (versions.isEmpty()) throw new ApiException(401, "이 계정은 더 이상 사용할 수 없습니다");
            long current = versions.getFirst();
            if (expected != null && expected != current) throw new ApiException(409, "서버 옷장이 바뀌었습니다. 먼저 다시 받아 확인해 주세요");
            try { work.run(); } catch (IOException | ServletException failure) { throw new ChainFailure(failure); }
            if (status.getAsInt() >= 400) { tx.setRollbackOnly(); return null; }
            if (deletingAccount) return null;
            if (mutation) {
                long next = Math.incrementExact(current);
                if (jdbc.update("update owner set revision=? where id=?", next, owner) != 1) throw new ApiException(409, "서버 옷장을 저장하지 못했습니다");
                return next;
            }
            return current;
        });
    }
}
