package otjang.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import otjang.api.Bodies;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;

class ContractGuardTest {
    @AfterEach void clearContext() { SecurityContextHolder.clearContext(); }
    @Test void oldClientsAreRejectedBeforeRevisionsOrControllersEvenForDelete() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new BetaUser("synthetic", 1L), null, List.of()));
        for (String path : List.of("/api/wardrobe/import", "/api/wardrobe/owner", "/api/items", "/api/items/x/photo/own", "/api/decisions/x", "/api/catalog/products/x/candidate", "/api/backup/restore")) {
            for (String method : List.of("POST", "PUT", "DELETE")) for (String header : List.of("", "1", "3", "2 ")) {
                var request = new MockHttpServletRequest(method, path);
                if (!header.isEmpty()) request.addHeader("X-Eoul-Contract", header);
                var response = new MockHttpServletResponse(); var passed = new AtomicBoolean();
                new AuthenticatedRevisionFilter(null).doFilter(request, response, (r, s) -> passed.set(true));
                assertEquals(409, response.getStatus(), path); assertFalse(passed.get());
                assertEquals("CLIENT_UPGRADE_REQUIRED", Bodies.map(response.getContentAsString()).get("code"));
            }
        }
    }
    @Test void capabilitiesAndReadOnlyRequestsAndCredentialOrAccountActionsAreOutsideGuard() {
        for (String path : List.of("/api/meta", "/api/wardrobe", "/api/items", "/api/decisions", "/api/catalog", "/api/backup"))
            for (String method : List.of("GET", "HEAD", "OPTIONS")) assertFalse(AuthenticatedRevisionFilter.contractWrite(path, method));
        for (String path : List.of("/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/account", "/api/judge", "/api/compare"))
            for (String method : List.of("POST", "PUT", "DELETE")) assertFalse(AuthenticatedRevisionFilter.contractWrite(path, method));
    }
}
