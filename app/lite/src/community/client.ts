// /c 공개 화면의 코디 공유 요청(앱 안에서는 lite.js의 window.EOUL_COMMUNITY가 같은 일을 한다).
import type { CommunityClient } from "./index";
export function communityClient(): CommunityClient {
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const method = init.method || "GET";
    let res: Response;
    try {
      res = await fetch(`/api/community/${path}`, method === "GET" || method === "DELETE" ? { method, credentials: "same-origin" } : { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(init.body ?? {}) });
    } catch {
      return { code: "offline", message: "연결을 확인하고 다시 해 주세요." };
    }
    const out = await res.json().catch(() => null);
    return res.ok && out ? out : { code: out?.code || "error", message: out?.message || "잠시 뒤에 다시 해 주세요." };
  };
  const seg = (s: string) => encodeURIComponent(s);
  return {
    status: () => call("status"),
    join: (name, rules, age14) => call("join", { method: "POST", body: { name, rules, age14 } }),
    feed: ({ cursor, mine } = {}) => call(`feed?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(mine ? { mine: "1" } : {}) })}`),
    post: (body) => call("posts", { method: "POST", body }),
    remove: (id) => call(`posts/${seg(id)}`, { method: "DELETE" }),
    report: (post, reason) => call("reports", { method: "POST", body: { post, reason } }),
    block: (post) => call("blocks", { method: "POST", body: { post } }),
    blocks: () => call("blocks"),
    unblock: (key) => call(`blocks/${seg(key)}`, { method: "DELETE" }),
    leave: () => call("leave", { method: "POST", body: { confirm: true } }),
    review: () => call("review"),
    act: (id, action) => call(`review/${seg(id)}`, { method: "POST", body: { action } }),
    photoUrl: (id) => `/api/community/photos/${seg(id)}`,
  } as CommunityClient;
}
