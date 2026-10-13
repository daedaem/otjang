package otjang.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;
import otjang.api.ApiException;
import otjang.service.RevisionService;

import java.io.IOException;
import java.util.Set;

/** Registered once inside Spring Security after BearerFilter; deliberately not a servlet bean.
 * Successful replies are buffered until commit, so the body and version header describe the same state.
 */
public final class AuthenticatedRevisionFilter extends OncePerRequestFilter {
    public static final String VERSION_HEADER = "X-Wardrobe-Version";
    private static final Set<String> GUARDED = Set.of("/api/wardrobe/import", "/api/catalog/import", "/api/backup/restore");
    private final RevisionService revisions;
    public AuthenticatedRevisionFilter(RevisionService revisions) { this.revisions = revisions; }
    private static Long expected(HttpServletRequest request, boolean required) {
        String match = request.getHeader("If-Match");
        if (match == null) {
            if (required) throw new ApiException(428, "서버 버전을 먼저 확인해 주세요");
            return null;
        }
        if (!match.matches("\"(?:0|[1-9][0-9]{0,18})\"")) throw new ApiException(400, "If-Match 버전 값이 올바르지 않습니다");
        try { return Long.parseLong(match.substring(1, match.length() - 1)); }
        catch (NumberFormatException invalid) { throw new ApiException(400, "If-Match 버전 값이 올바르지 않습니다"); }
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!path.startsWith("/api/") || authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof BetaUser user)
                || "OPTIONS".equals(request.getMethod()) || (path.startsWith("/api/auth/") && !"/api/auth/me".equals(path))) {
            chain.doFilter(request, response); return;
        }
        boolean mutation = !Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod());
        boolean deletingAccount = mutation && "DELETE".equals(request.getMethod()) && "/api/account".equals(path);
        ContentCachingResponseWrapper buffered = new ContentCachingResponseWrapper(response);
        try {
            Long expected = mutation ? expected(request, GUARDED.contains(path)) : null;
            Long committed = revisions.exchange(user.ownerId(), expected, mutation, deletingAccount, () -> chain.doFilter(request, buffered), buffered::getStatus);
            if (committed != null) buffered.setHeader(VERSION_HEADER, Long.toString(committed));
        } catch (ApiException rejected) {
            buffered.resetBuffer(); BearerFilter.problem(buffered, rejected.status(), rejected.getMessage());
        } catch (RevisionService.ChainFailure failure) {
            if (failure.getCause() instanceof IOException io) throw io;
            if (failure.getCause() instanceof ServletException servlet) throw servlet;
            throw failure;
        } catch (RuntimeException failure) {
            buffered.resetBuffer(); BearerFilter.problem(buffered, 500, "저장하지 못했습니다. 다시 받아 확인해 주세요");
        }
        buffered.copyBodyToResponse();
    }
}
