package otjang.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** item_match_candidate 표. 미확인 브랜드·상품 후보. 내 옷 정보가 아니다. */
@Entity
@Table(name = "item_match_candidate")
public class MatchCandidateEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private ItemEntity item;
    @Column(nullable = false)
    private short position;
    @Column(nullable = false)
    private String brand = "";
    @Column(nullable = false)
    private String name = "";
    @Column(nullable = false)
    private String evidence = "owner";
    @Column(nullable = false)
    private String note = "";
    @Column(nullable = false)
    private String url = "";

    public static MatchCandidateEntity of(ItemEntity item, int position, String brand, String name, String evidence, String note, String url) {
        MatchCandidateEntity e = new MatchCandidateEntity();
        e.item = item; e.position = (short) position; e.brand = brand; e.name = name; e.evidence = evidence; e.note = note; e.url = url;
        return e;
    }

    public Long getId() { return id; }
    public ItemEntity getItem() { return item; }
    public short getPosition() { return position; }
    public String getBrand() { return brand; }
    public String getName() { return name; }
    public String getEvidence() { return evidence; }
    public String getNote() { return note; }
    public String getUrl() { return url; }
}
