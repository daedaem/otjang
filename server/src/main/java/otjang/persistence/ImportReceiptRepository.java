package otjang.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ImportReceiptRepository extends JpaRepository<ImportReceiptEntity, Long> {
    Optional<ImportReceiptEntity> findByOwnerIdAndIdempotencyKey(Long ownerId, String key);
}
