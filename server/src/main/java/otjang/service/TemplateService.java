package otjang.service;

import org.springframework.boot.json.JsonParserFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import otjang.domain.Garment;
import otjang.domain.Item;
import otjang.domain.Judge;
import otjang.domain.Wardrobe;
import otjang.domain.WardrobeCleaner;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 기본 옷장 초안(아이비 15벌). app/data/template-ivy.json 의 복사본을 classpath 에 둔다(두 파일이 같아야 한다 — 바꿀 때 함께).
 * 옷장 비교와 상품 순위의 "빈틈" 기준으로 쓴다. 작성자가 만든 초안이며 사용자가 고쳐 쓸 수 있다.
 */
@Service
public class TemplateService {
    private final Wardrobe template;

    public TemplateService() {
        try {
            String json = new ClassPathResource("data/template-ivy.json").getContentAsString(StandardCharsets.UTF_8);
            Map<String, Object> raw = JsonParserFactory.getJsonParser().parseMap(json);
            Wardrobe w = WardrobeCleaner.cleanWardrobe(raw);
            if (w == null) throw new IllegalStateException("data/template-ivy.json 을 옷장으로 읽지 못했다");
            this.template = w;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public Wardrobe template() {
        return template;
    }

    /** 기본 옷장에는 있고 내게 없는 옷. */
    public List<? extends Garment> gaps(List<Item> mine, String season) {
        return Judge.compareWardrobes(mine, template.items(), season == null ? "" : season).onlyTheirs();
    }
}
