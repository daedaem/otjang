package otjang.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/** decision 표. 살까 말까 판정 기록(보기 전 마음 → 규칙 결과 요약 → 결정 → 2주 뒤 물음의 답). */
@Entity
@Table(name = "decision")
public class DecisionEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "owner_id", nullable = false)
    private Long ownerId;
    @Column(name = "client_id", nullable = false)
    private String clientId;
    @Column(name = "item_client_id", nullable = false)
    private String itemClientId = "";
    @Column(name = "item_name", nullable = false)
    private String itemName = "";
    @Column(name = "before_lean", nullable = false)
    private String beforeLean;
    @Column(name = "before_reason", nullable = false)
    private String beforeReason = "";
    @Column(name = "before_at")
    private LocalDate beforeAt;
    @Column(name = "summary_overlaps", nullable = false)
    private short summaryOverlaps;
    @Column(name = "summary_added", nullable = false)
    private short summaryAdded;
    @Column(name = "summary_blockers", nullable = false)
    private short summaryBlockers;
    @Column(name = "after_decision")
    private String afterDecision;
    @Column(name = "after_helpful")
    private String afterHelpful;
    @Column(name = "after_note", nullable = false)
    private String afterNote = "";
    @Column(name = "after_at")
    private LocalDate afterAt;
    @Column(name = "after_shift")
    private String afterShift;
    @Column(name = "follow_at")
    private LocalDate followAt;
    @Column(name = "follow_worn")
    private String followWorn;
    @Column(name = "follow_feel")
    private String followFeel;

    public Long getId() { return id; }
    public Long getOwnerId() { return ownerId; }
    public void setOwnerId(Long v) { ownerId = v; }
    public String getClientId() { return clientId; }
    public void setClientId(String v) { clientId = v; }
    public String getItemClientId() { return itemClientId; }
    public void setItemClientId(String v) { itemClientId = v; }
    public String getItemName() { return itemName; }
    public void setItemName(String v) { itemName = v; }
    public String getBeforeLean() { return beforeLean; }
    public void setBeforeLean(String v) { beforeLean = v; }
    public String getBeforeReason() { return beforeReason; }
    public void setBeforeReason(String v) { beforeReason = v; }
    public LocalDate getBeforeAt() { return beforeAt; }
    public void setBeforeAt(LocalDate v) { beforeAt = v; }
    public short getSummaryOverlaps() { return summaryOverlaps; }
    public void setSummaryOverlaps(short v) { summaryOverlaps = v; }
    public short getSummaryAdded() { return summaryAdded; }
    public void setSummaryAdded(short v) { summaryAdded = v; }
    public short getSummaryBlockers() { return summaryBlockers; }
    public void setSummaryBlockers(short v) { summaryBlockers = v; }
    public String getAfterDecision() { return afterDecision; }
    public void setAfterDecision(String v) { afterDecision = v; }
    public String getAfterHelpful() { return afterHelpful; }
    public void setAfterHelpful(String v) { afterHelpful = v; }
    public String getAfterNote() { return afterNote; }
    public void setAfterNote(String v) { afterNote = v; }
    public LocalDate getAfterAt() { return afterAt; }
    public void setAfterAt(LocalDate v) { afterAt = v; }
    public String getAfterShift() { return afterShift; }
    public void setAfterShift(String v) { afterShift = v; }
    public LocalDate getFollowAt() { return followAt; }
    public void setFollowAt(LocalDate v) { followAt = v; }
    public String getFollowWorn() { return followWorn; }
    public void setFollowWorn(String v) { followWorn = v; }
    public String getFollowFeel() { return followFeel; }
    public void setFollowFeel(String v) { followFeel = v; }
}
