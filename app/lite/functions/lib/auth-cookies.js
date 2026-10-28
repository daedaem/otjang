// Cookie names are not credentials. Successful account switches clear the other role.
export const OWNER_SESSION_COOKIE = "__Host-otjang-session";
export const MEMBER_SESSION_COOKIE = "__Host-hangit-member";
export const clearOwnerCookie = () =>
  OWNER_SESSION_COOKIE +
  "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
export const clearMemberCookie = () =>
  MEMBER_SESSION_COOKIE +
  "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
