package otjang.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DecisionRepository extends JpaRepository<DecisionEntity, Long> {
    List<DecisionEntity> findByOwnerIdOrderByIdAsc(Long ownerId);

    Optional<DecisionEntity> findByOwnerIdAndClientId(Long ownerId, String clientId);
}
