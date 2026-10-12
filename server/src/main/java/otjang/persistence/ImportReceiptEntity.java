package otjang.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** import_receipt 표. 가져오기 멱등 영수증: 같은 키 + 같은 내용이면 저장된 응답을 그대로 돌려준다. 같은 키 + 다른 내용은 409. */
@Entity
@Table(name = "import_receipt")
public class ImportReceiptEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false)
    private Long ownerId;
    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;
    @Column(name = "request_hash", nullable = false)
    private String requestHash;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String response;

    public static ImportReceiptEntity of(Long ownerId, String key, String hash, String responseJson) {
        ImportReceiptEntity e = new ImportReceiptEntity();
        e.ownerId = ownerId; e.idempotencyKey = key; e.requestHash = hash; e.response = responseJson;
        return e;
    }

    public Long getId() { return id; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getRequestHash() { return requestHash; }
    public String getResponse() { return response; }
}
