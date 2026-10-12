package otjang.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CatalogProductRepository extends JpaRepository<CatalogProductEntity, Long> {
    List<CatalogProductEntity> findByOwnerIdOrderByIdAsc(Long ownerId);

    Optional<CatalogProductEntity> findByOwnerIdAndClientId(Long ownerId, String clientId);
}
