// Stable opaque account tags separate local data; they are never credentials.
export const ACCOUNT_ACTIVE_KEY = "hangit:active-account:v1";
export const ACCOUNT_PREFIX = "hangit-account:";
export const ACCOUNT_HEADER = "x-hangit-scope";
export const validAccountScope = (value) =>
  value === "owner" || /^m-[a-f0-9]{32}$/.test(value || "");
export async function memberStorageScope(member) {
  if (typeof member !== "string" || !member || member.length > 512)
    throw Error("invalid member");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(member),
  );
  return (
    "m-" +
    [...new Uint8Array(digest)]
      .slice(0, 16)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}
export function accountNamespace(scope, namespace) {
  if (!validAccountScope(scope)) throw Error("invalid account scope");
  return scope === "owner"
    ? String(namespace)
    : ACCOUNT_PREFIX + scope + ":" + String(namespace);
}
