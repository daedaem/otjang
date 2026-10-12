package otjang.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import otjang.domain.Garment;
import otjang.domain.Item;
import otjang.domain.Judge;
import otjang.domain.Recommend;
import otjang.domain.Wardrobe;
import otjang.domain.WardrobeCleaner;
import otjang.service.TemplateService;
import otjang.service.WardrobeService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 규칙 결과. AI 없음, 확률 없음, 같은 입력이면 같은 결과. 옷은 id·이름만 돌려주고 사진은 넣지 않는다.
 * POST /api/judge   { candidate: {옷 한 벌 모양} 또는 itemId: "저장된 후보 id", season? }
 * GET  /api/outfits ?season=&exclude=top|bottom|outer,...
 * POST /api/compare { theirs: 옷장 파일 또는 "template", season? }
 */
@RestController
@RequestMapping("/api")
public class RulesController {
    private final WardrobeService wardrobe;
    private final TemplateService templates;

    public RulesController(WardrobeService wardrobe, TemplateService templates) {
        this.wardrobe = wardrobe; this.templates = templates;
    }

    public record Ref(String id, String name, boolean draft) {
        static Ref of(Garment g) {
            return g == null ? null : new Ref(g.id(), g.name(), g instanceof Item it && it.isDraft());
        }
    }
    public record OverlapDto(Ref item, String level, List<String> same, List<String> diff) {}
    public record ComboDto(Ref top, Ref bottom, Ref outer, int score, List<String> why) {}
    public record VerdictDto(boolean supported, List<OverlapDto> overlaps, int before, int after, List<ComboDto> added, List<ComboDto> top3, List<Judge.Blocker> blockers, List<String> needs, String note, List<Ref> draftItems) {}
    public record MatchDto(Ref mine, Ref theirs, String how) {}
    public record ComparisonDto(List<MatchDto> both, List<Ref> onlyTheirs, List<Ref> onlyMine) {}

    @PostMapping("/judge")
    public VerdictDto judge(@RequestBody Map<String, Object> body) {
        List<Item> items = wardrobe.allItems(false);
        Item cand;
        if (body.get("itemId") instanceof String id) {
            cand = items.stream().filter((i) -> i.id().equals(id)).findFirst().orElseThrow(() -> new ApiException(404, "그런 옷이 없다: " + id));
        } else {
            Map<String, Object> raw = otjang.domain.Sanitize.obj(body.get("candidate"));
            if (raw == null) throw new ApiException(400, "candidate(옷 한 벌) 또는 itemId 가 있어야 한다");
            if (!raw.containsKey("status")) raw.put("status", "candidate");
            if (!raw.containsKey("id")) raw.put("id", "cand");
            cand = WardrobeCleaner.cleanItem(raw, 0);
            if (cand == null) throw new ApiException(400, "후보로 읽을 수 없다(cat 이 있어야 한다)");
        }
        String season = body.get("season") instanceof String s ? s : "";
        Judge.Verdict v = Judge.judgeCandidate(items, cand, season);
        List<OverlapDto> overlaps = new ArrayList<>();
        for (Judge.Overlap o : v.overlaps()) overlaps.add(new OverlapDto(Ref.of(o.item()), o.level(), o.same(), o.diff()));
        List<ComboDto> added = new ArrayList<>(), top3 = new ArrayList<>();
        for (Judge.Added a : v.added()) added.add(new ComboDto(Ref.of(a.top()), Ref.of(a.bottom()), null, a.score(), a.why()));
        for (Judge.Pick p : v.top3()) top3.add(new ComboDto(Ref.of(p.top()), Ref.of(p.bottom()), Ref.of(p.outer()), p.score(), p.why()));
        List<Ref> drafts = new ArrayList<>();
        for (Judge.Overlap o : v.overlaps()) if (o.item() instanceof Item it && it.isDraft()) drafts.add(Ref.of(it));
        for (Judge.Added a : v.added()) for (Garment g : List.of(a.top(), a.bottom())) if (g instanceof Item it && it.isDraft() && drafts.stream().noneMatch((d) -> d.id().equals(it.id()))) drafts.add(Ref.of(it));
        return new VerdictDto(v.supported(), overlaps, v.before(), v.after(), added, top3, v.blockers(), v.needs(), v.note(), drafts);
    }

    @GetMapping("/outfits")
    public List<ComboDto> outfits(@RequestParam(defaultValue = "") String season, @RequestParam(defaultValue = "") String exclude, @RequestParam(defaultValue = "3") int n) {
        List<Item> pool = new ArrayList<>();
        for (Item i : wardrobe.allItems(false)) if (i.isOwned() && i.inSeason(season)) pool.add(i);
        List<String> skip = exclude.isEmpty() ? List.of() : List.of(exclude.split(","));
        List<ComboDto> out = new ArrayList<>();
        for (Recommend.Combo c : Recommend.recommend(pool, Math.min(Math.max(n, 1), 10), skip)) out.add(new ComboDto(ref(pool, c.top()), ref(pool, c.bottom()), c.outer() == null ? null : ref(pool, c.outer()), c.score(), c.why()));
        return out;
    }

    private static Ref ref(List<Item> pool, String id) {
        for (Item i : pool) if (i.id().equals(id)) return Ref.of(i);
        return new Ref(id, "", false);
    }

    @PostMapping("/compare")
    public ComparisonDto compare(@RequestBody Map<String, Object> body) {
        List<? extends Garment> theirs;
        Object t = body.get("theirs");
        if (t == null || "template".equals(t)) theirs = templates.template().items();
        else {
            Wardrobe w = WardrobeCleaner.cleanWardrobe(t);
            if (w == null) throw new ApiException(400, "theirs 는 옷장 파일(schema 1·2) 또는 \"template\" 이어야 한다");
            theirs = w.items();
        }
        String season = body.get("season") instanceof String s ? s : "";
        Judge.Comparison c = Judge.compareWardrobes(wardrobe.allItems(false), theirs, season);
        List<MatchDto> both = new ArrayList<>();
        for (Judge.Match m : c.both()) both.add(new MatchDto(Ref.of(m.mine()), Ref.of(m.theirs()), m.how()));
        List<Ref> onlyTheirs = new ArrayList<>(), onlyMine = new ArrayList<>();
        for (Garment g : c.onlyTheirs()) onlyTheirs.add(Ref.of(g));
        for (Garment g : c.onlyMine()) onlyMine.add(Ref.of(g));
        return new ComparisonDto(both, onlyTheirs, onlyMine);
    }
}
