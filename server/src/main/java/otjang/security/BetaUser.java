package otjang.security;

/** No password or bearer token is carried in the authenticated principal. */
public record BetaUser(String username, long ownerId) {}
