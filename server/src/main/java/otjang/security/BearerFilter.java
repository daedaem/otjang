package otjang.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Authentication comes exclusively from an explicit bearer header, never a cookie or Basic auth. */
public final class BearerFilter extends OncePerRequestFilter {
    private final AuthService auth;
    private final boolean requireHttps;
    public BearerFilter(AuthService auth, boolean requireHttps) { this.auth = auth; this.requireHttps = requireHttps; }
    public static void problem(HttpServletResponse response, int status, String detail) throws IOException {
        response.setStatus(status); response.setContentType("application/problem+json"); response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"status\":" + status + ",\"detail\":\"" + detail + "\"}");
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (requireHttps && !request.isSecure() && request.getRequestURI().startsWith("/api/")) { problem(response, 403, "HTTPS 연결이 필요합니다"); return; }
        if (request.getContentLengthLong() > (request.getRequestURI().startsWith("/api/auth/") ? 8192 : 64L * 1024 * 1024)) { problem(response, 413, "요청이 너무 큽니다"); return; }
        String header = request.getHeader("Authorization");
        if (header != null) {
            if (!header.startsWith("Bearer ")) { problem(response, 401, "유효한 로그인이 필요합니다"); return; }
            var user = auth.authenticate(header.substring(7));
            if (user.isEmpty()) { problem(response, 401, "로그인이 만료됐거나 유효하지 않습니다"); return; }
            SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.get(), null, List.of()));
        }
        chain.doFilter(request, response);
    }
}
