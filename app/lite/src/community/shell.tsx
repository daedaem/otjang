// /c: 앱 없이 코디 공유만 여는 공개 화면(COMMUNITY_MODE=public이고 준비가 끝났을 때 Worker가 연다).
// 옷장·상품 자료·AI는 들어 있지 않다. 옷장이 없으므로 '내 옷에서 고르기'는 보이지 않는다.
import "./shell.css";
import { mount } from "./index";
import { communityClient } from "./client";
import { installAccountBoundary } from "../browser/account-storage.js";
import { ACCOUNT_ACTIVE_KEY } from "../domain/account-scope.js";
installAccountBoundary();
const element = document.getElementById("community");
if (element)
  mount({
    element,
    core: { getState: () => ({ closet: [] }) },
    client: communityClient(),
    share: null,
    info() {},
    menu() {},
    standalone: true,
    async logout() {
      try {
        const response = await fetch("/_member/logout", { method: "POST", credentials: "same-origin" });
        if (!response.ok) return;
        try { localStorage.setItem(ACCOUNT_ACTIVE_KEY, "signed-out"); } catch {}
      } catch {}
      location.reload();
    },
  });
