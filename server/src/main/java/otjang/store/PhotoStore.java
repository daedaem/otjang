package otjang.store;

/**
 * 사진 바이트 저장소. DB 에는 키(ref)만 두고 바이트는 여기 둔다. 지금 구현은 비공개 로컬 폴더(LocalDirPhotoStore)이고,
 * 클라우드 저장은 필요해진 뒤 같은 인터페이스 뒤에 붙인다(10-10 설계 결정). 외부로 보내지 않는다.
 */
public interface PhotoStore {
    /** data:image/...;base64,... 를 저장하고 키를 돌려준다. 빈 문자열이나 모르는 형식이면 빈 키. 같은 내용은 같은 키(내용 해시). */
    String put(String dataUrl);

    /** 키로 data URL 을 돌려준다. 없으면 빈 문자열. */
    String get(String ref);
}
