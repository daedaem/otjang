package otjang.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** owner 표. 지금은 로컬 한 사람(id 1). */
@Entity
@Table(name = "owner")
public class OwnerEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false)
    private String nickname = "";
    private BigDecimal height;
    @Column(name = "top_size", nullable = false)
    private String topSize = "";
    @Column(name = "bottom_size", nullable = false)
    private String bottomSize = "";
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public Long getId() { return id; }
    public String getNickname() { return nickname; }
    public void setNickname(String v) { nickname = v; }
    public BigDecimal getHeight() { return height; }
    public void setHeight(BigDecimal v) { height = v; }
    public String getTopSize() { return topSize; }
    public void setTopSize(String v) { topSize = v; }
    public String getBottomSize() { return bottomSize; }
    public void setBottomSize(String v) { bottomSize = v; }
    public void touch() { updatedAt = OffsetDateTime.now(); }
}
