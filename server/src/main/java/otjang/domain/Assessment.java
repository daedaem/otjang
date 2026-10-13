package otjang.domain;

import java.util.ArrayList;
import java.util.List;

/** A missing attribute remains unknown. Photo-derived drafts require a user's explicit review. */
public final class Assessment {
    private Assessment() {}
    public record Readiness(boolean ready, String status, List<String> missing, boolean draft) {}
    public static Readiness assess(Garment it) { return assess(it, null); }
    public static Readiness assess(Garment it, String season) {
        List<String> missing = new ArrayList<>();
        if (it == null) return new Readiness(false, "needs-confirmation", List.of("cat", "kind", "family", "light", "formality", "pattern"), false);
        if (it.cat() == null || !Vocab.CATS.containsKey(it.cat())) missing.add("cat");
        if (it.kind() == null || it.cat() == null || !Vocab.KINDS.containsKey(it.cat()) || !Vocab.KINDS.get(it.cat()).containsKey(it.kind())) missing.add("kind");
        if (it.family() == null || !Vocab.FAM.containsKey(it.family())) missing.add("family");
        if (it.light() == null || it.light() < 0 || it.light() > 100) missing.add("light");
        if (it.formality() == null || it.formality() < 1 || it.formality() > 3) missing.add("formality");
        if (it.pattern() == null || !Vocab.PATTERNS.containsKey(it.pattern())) missing.add("pattern");
        if (season != null && !season.isEmpty() && (it.seasons() == null || it.seasons().stream().noneMatch(Vocab.SEASONS::contains))) missing.add("seasons");
        boolean draft = it instanceof Item item && item.isDraft();
        if (draft) missing.add("confirmation");
        return new Readiness(missing.isEmpty(), missing.isEmpty() ? "ready" : "needs-confirmation", List.copyOf(missing), draft);
    }
}
