package otjang.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** 옷 저장소. 모든 조회는 owner 단위다. */
public interface ItemRepository extends JpaRepository<ItemEntity, Long> {
    @Query("select distinct i from ItemEntity i left join fetch i.candidates where i.ownerId = :ownerId order by i.id")
    List<ItemEntity> findAllByOwner(@Param("ownerId") Long ownerId);

    Optional<ItemEntity> findByOwnerIdAndClientId(Long ownerId, String clientId);
}
