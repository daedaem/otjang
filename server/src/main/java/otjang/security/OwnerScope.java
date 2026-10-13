package otjang.security;

import org.springframework.security.core.context.SecurityContextHolder;
import otjang.api.ApiException;

public final class OwnerScope {
    private OwnerScope() {}
    public static BetaUser user() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof BetaUser user))
            throw new ApiException(401, "로그인이 필요합니다");
        return user;
    }
    public static long ownerId() { return user().ownerId(); }
}
