package otjang.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 개인판 앱(파일로 연 HTML, origin "null")이 로컬 서버를 부를 수 있게 CORS 를 연다. 공개 배포 시 otjang.cors-origins 를 좁힌다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String origins;

    public WebConfig(@Value("${otjang.cors-origins:null,http://localhost:3000,http://127.0.0.1:3000,http://localhost:18085,http://127.0.0.1:18085}") String origins, @Value("${otjang.auth.require-https:false}") boolean requireHttps) {
        if (origins.isBlank() || origins.contains("*")) throw new IllegalArgumentException("Explicit CORS origins are required; wildcards are forbidden");
        if (requireHttps && java.util.Arrays.stream(origins.split("\\s*,\\s*")).anyMatch(o -> !o.startsWith("https://"))) throw new IllegalArgumentException("HTTPS origins are required in deployment mode");
        this.origins = origins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(origins.split("\\s*,\\s*")).allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS").allowedHeaders("*").exposedHeaders("Idempotent-Replayed", "X-Wardrobe-Version");
    }
}
