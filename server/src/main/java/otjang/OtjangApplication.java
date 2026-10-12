package otjang;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** 옷장들이(가칭) 서버. 로컬 PC 에서 한 사람이 쓰는 것으로 시작한다(owner 1). 외부 서비스에 요청하지 않고, 사진은 비공개 로컬 폴더에만 둔다. */
@SpringBootApplication
public class OtjangApplication {
    public static void main(String[] args) {
        SpringApplication.run(OtjangApplication.class, args);
    }
}
