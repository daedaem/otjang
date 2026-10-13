package otjang.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean SecurityFilterChain security(HttpSecurity http, AuthService auth, otjang.service.RevisionService revisions, @Value("${otjang.auth.require-https:false}") boolean https) throws Exception {
        return http.csrf(c -> c.disable()).cors(c -> {}).httpBasic(c -> c.disable()).formLogin(c -> c.disable()).logout(c -> c.disable())
                .sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(c -> c.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/meta").permitAll()
                        .requestMatchers("/api/auth/register", "/api/auth/login", "/actuator/health", "/", "/index.html", "/favicon.ico").permitAll()
                        .requestMatchers("/api/**").authenticated().anyRequest().denyAll())
                .exceptionHandling(c -> c.authenticationEntryPoint((r, s, e) -> BearerFilter.problem(s, 401, "로그인이 필요합니다"))
                        .accessDeniedHandler((r, s, e) -> BearerFilter.problem(s, 403, "접근할 수 없습니다")))
                .addFilterBefore(new BearerFilter(auth, https), UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(new AuthenticatedRevisionFilter(revisions), BearerFilter.class).build();
    }
}
