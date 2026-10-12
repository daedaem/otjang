package otjang.persistence;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * item 표. 열 이름은 V1__init.sql 과 같다(ddl-auto=validate). 사진 바이트는 여기 없고 PhotoStore 의 키(ref)만 있다.
 * 도메인 객체(otjang.domain.Item)와의 변환은 service.ItemMapper 가 한다. 불변식(확인됨 ↔ 확인 기록)은 DB 제약이 다시 지킨다.
 */
@Entity
@Table(name = "item")
public class ItemEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false)
    private Long ownerId;
    @Column(name = "client_id", nullable = false)
    private String clientId;
    @Column(nullable = false)
    private String status;
    @Column(nullable = false)
    private String cat;
    @Column(nullable = false)
    private String kind;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String detail = "";
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
    @Column(name = "attr_source", nullable = false)
    private String attrSource;
    @Column(name = "draft_note", nullable = false)
    private String draftNote = "";
    @Column(name = "photo_kind", nullable = false)
    private String photoKind;
    @Column(name = "photo_img_ref", nullable = false)
    private String photoImgRef = "";
    @Column(name = "photo_own_img_ref", nullable = false)
    private String photoOwnImgRef = "";
    @Column(name = "photo_source_name", nullable = false)
    private String photoSourceName = "";
    @Column(name = "photo_source_url", nullable = false)
    private String photoSourceUrl = "";
    @Column(name = "photo_checked_at")
    private LocalDate photoCheckedAt;
    @Column(name = "product_brand")
    private String productBrand;
    @Column(name = "product_name")
    private String productName;
    @Column(name = "product_code")
    private String productCode;
    @Column(name = "product_confirmed_at")
    private LocalDate productConfirmedAt;
    @Column(name = "look3d_kind")
    private String look3dKind;
    @Column(name = "look3d_fabric")
    private String look3dFabric;
    @Column(nullable = false)
    private String brand = "";
    @Column(nullable = false)
    private String model = "";
    @Column(nullable = false)
    private String size = "";
    @Column(name = "bought_year")
    private Short boughtYear;
    @Column(nullable = false)
    private String review = "";
    @Column(nullable = false)
    private String rebuy = "unknown";
    @Column(nullable = false)
    private String fabric = "";
    @Column(nullable = false)
    private String neck = "";
    /** jsonb. {"length": 70, ...} 평평한 수 맵. 변환은 ItemMapper(Json 유틸)가 한다 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private String measures = "{}";
    @Column(nullable = false)
    private String link = "";
    private Long price;
    @Column(name = "checked_at")
    private LocalDate checkedAt;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position asc")
    private List<MatchCandidateEntity> candidates = new ArrayList<>();

    public Long getId() { return id; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long v) { ownerId = v; }
    public String getClientId() { return clientId; }
    public void setClientId(String v) { clientId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { status = v; }
    public String getCat() { return cat; }
    public void setCat(String v) { cat = v; }
    public String getKind() { return kind; }
    public void setKind(String v) { kind = v; }
    public String getName() { return name; }
    public void setName(String v) { name = v; }
    public String getDetail() { return detail; }
    public void setDetail(String v) { detail = v; }
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
    public String getAttrSource() { return attrSource; }
    public void setAttrSource(String v) { attrSource = v; }
    public String getDraftNote() { return draftNote; }
    public void setDraftNote(String v) { draftNote = v; }
    public String getPhotoKind() { return photoKind; }
    public void setPhotoKind(String v) { photoKind = v; }
    public String getPhotoImgRef() { return photoImgRef; }
    public void setPhotoImgRef(String v) { photoImgRef = v; }
    public String getPhotoOwnImgRef() { return photoOwnImgRef; }
    public void setPhotoOwnImgRef(String v) { photoOwnImgRef = v; }
    public String getPhotoSourceName() { return photoSourceName; }
    public void setPhotoSourceName(String v) { photoSourceName = v; }
    public String getPhotoSourceUrl() { return photoSourceUrl; }
    public void setPhotoSourceUrl(String v) { photoSourceUrl = v; }
    public LocalDate getPhotoCheckedAt() { return photoCheckedAt; }
    public void setPhotoCheckedAt(LocalDate v) { photoCheckedAt = v; }
    public String getProductBrand() { return productBrand; }
    public void setProductBrand(String v) { productBrand = v; }
    public String getProductName() { return productName; }
    public void setProductName(String v) { productName = v; }
    public String getProductCode() { return productCode; }
    public void setProductCode(String v) { productCode = v; }
    public LocalDate getProductConfirmedAt() { return productConfirmedAt; }
    public void setProductConfirmedAt(LocalDate v) { productConfirmedAt = v; }
    public String getLook3dKind() { return look3dKind; }
    public void setLook3dKind(String v) { look3dKind = v; }
    public String getLook3dFabric() { return look3dFabric; }
    public void setLook3dFabric(String v) { look3dFabric = v; }
    public String getBrand() { return brand; }
    public void setBrand(String v) { brand = v; }
    public String getModel() { return model; }
    public void setModel(String v) { model = v; }
    public String getSize() { return size; }
    public void setSize(String v) { size = v; }
    public Short getBoughtYear() { return boughtYear; }
    public void setBoughtYear(Short v) { boughtYear = v; }
    public String getReview() { return review; }
    public void setReview(String v) { review = v; }
    public String getRebuy() { return rebuy; }
    public void setRebuy(String v) { rebuy = v; }
    public String getFabric() { return fabric; }
    public void setFabric(String v) { fabric = v; }
    public String getNeck() { return neck; }
    public void setNeck(String v) { neck = v; }
    public String getMeasures() { return measures; }
    public void setMeasures(String v) { measures = v; }
    public String getLink() { return link; }
    public void setLink(String v) { link = v; }
    public Long getPrice() { return price; }
    public void setPrice(Long v) { price = v; }
    public LocalDate getCheckedAt() { return checkedAt; }
    public void setCheckedAt(LocalDate v) { checkedAt = v; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void touch() { updatedAt = OffsetDateTime.now(); }
    public List<MatchCandidateEntity> getCandidates() { return candidates; }
}
