package otjang.domain;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** 규칙 회귀: 앱(JS)의 골든 스냅샷과 서버(Java)의 결과가 같아야 한다. Maven 은 server/ 폴더에서 돌므로 저장소 루트는 한 단계 위다. */
class GoldenParityTest {
    private static final Path ROOT = Path.of("..");

    @Test
    void 판정_코디_비교가_앱과_같다() throws Exception {
        assertNull(GoldenParity.check(ROOT));
    }

    @Test
    void 상품_순위와_상품_후보가_앱과_같다() throws Exception {
        assertNull(GoldenParity.checkCatalog(ROOT));
    }

    @Test
    void 사진_상태_전이와_내보내기_규칙() {
        assertEquals(0, DomainChecks.run());
    }
}
