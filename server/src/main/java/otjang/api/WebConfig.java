package otjang.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 개인판 앱(파일로 연 HTML, origin "null")이 로컬 서버를 부를 수 있게 CORS 를 연다. 공개 배포 시 otjang.cors-origins 를 좁힌다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String origins;

    public WebConfig(@Value("${otjang.cors-origins:*}") String origins) {
        this.origins = origins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOriginPatterns(origins.split("\\s*,\\s*")).allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS").allowedHeaders("*").exposedHeaders("Idempotent-Replayed");
    }
}
