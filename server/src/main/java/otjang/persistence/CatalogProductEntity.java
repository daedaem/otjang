package otjang.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** catalog_product 표. 사람이 직접 넣은 상품. 가격·확인일은 사람이 확인한 시점의 값이다. */
@Entity
@Table(name = "catalog_product")
public class CatalogProductEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false)
    private Long ownerId;
    @Column(name = "client_id", nullable = false)
    private String clientId;
    @Column(nullable = false)
    private String brand = "";
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String code = "";
    @Column(nullable = false)
    private String cat;
    @Column(nullable = false)
    private String kind;
    @Column(nullable = false)
    private String family;
    @Column(nullable = false)
    private short light;
    @Column(nullable = false)
    private short formality;
    @Column(nullable = false)
    private String pattern;
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    private List<String> seasons = new ArrayList<>();
    @Column(nullable = false)
    private String link = "";
    private Long price;
    @Column(name = "checked_at")
    private LocalDate checkedAt;
    @Column(name = "img_ref", nullable = false)
    private String imgRef = "";
    @Column(nullable = false)
    private String note = "";
    @Column(name = "added_at")
    private LocalDate addedAt;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public Long getId() { return id; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long v) { ownerId = v; }
    public String getClientId() { return clientId; }
    public void setClientId(String v) { clientId = v; }
    public String getBrand() { return brand; }
    public void setBrand(String v) { brand = v; }
    public String getName() { return name; }
    public void setName(String v) { name = v; }
    public String getCode() { return code; }
    public void setCode(String v) { code = v; }
    public String getCat() { return cat; }
    public void setCat(String v) { cat = v; }
    public String getKind() { return kind; }
    public void setKind(String v) { kind = v; }
    public String getFamily() { return family; }
    public void setFamily(String v) { family = v; }
    public short getLight() { return light; }
    public void setLight(short v) { light = v; }
    public short getFormality() { return formality; }
    public void setFormality(short v) { formality = v; }
    public String getPattern() { return pattern; }
    public void setPattern(String v) { pattern = v; }
    public List<String> getSeasons() { return seasons; }
    public void setSeasons(List<String> v) { seasons = new ArrayList<>(v); }
    public String getLink() { return link; }
    public void setLink(String v) { link = v; }
    public Long getPrice() { return price; }
    public void setPrice(Long v) { price = v; }
    public LocalDate getCheckedAt() { return checkedAt; }
    public void setCheckedAt(LocalDate v) { checkedAt = v; }
    public String getImgRef() { return imgRef; }
    public void setImgRef(String v) { imgRef = v; }
    public String getNote() { return note; }
    public void setNote(String v) { note = v; }
    public LocalDate getAddedAt() { return addedAt; }
    public void setAddedAt(LocalDate v) { addedAt = v; }
    public void touch() { updatedAt = OffsetDateTime.now(); }
}
