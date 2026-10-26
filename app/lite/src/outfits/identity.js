export async function reactionIdentity(garmentIds, occasion) {
  const text = JSON.stringify([occasion ?? null, [...garmentIds].sort()]);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return (
    "r_" +
    [...new Uint8Array(bytes)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}
