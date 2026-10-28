import {
  ACCOUNT_ACTIVE_KEY,
  ACCOUNT_PREFIX,
  ACCOUNT_HEADER,
  validAccountScope,
  accountNamespace,
} from "../domain/account-scope.js";

const accountChangedError = () =>
  Object.assign(
    Error(
      "계정이 바뀌었어요. 현재 계정으로 앱을 다시 열어 주세요. 저장된 자료는 그대로예요.",
    ),
    { code: "account_changed" },
  );
export function accountStorage(raw, scope, onBlocked = () => {}) {
  if (!validAccountScope(scope)) throw accountChangedError();
  const prefix = scope === "owner" ? "" : ACCOUNT_PREFIX + scope + ":";
  const assertActive = () => {
    if (raw.getItem(ACCOUNT_ACTIVE_KEY) !== scope) {
      onBlocked();
      throw accountChangedError();
    }
  };
  const own = (key) =>
    prefix
      ? key.startsWith(prefix)
      : key !== ACCOUNT_ACTIVE_KEY && !key.startsWith(ACCOUNT_PREFIX);
  const keys = () => {
    assertActive();
    const result = [];
    for (let i = 0; i < raw.length; i++) {
      const key = raw.key(i);
      if (typeof key === "string" && own(key))
        result.push(prefix ? key.slice(prefix.length) : key);
    }
    return result;
  };
  const physical = (key) => {
    assertActive();
    const value = String(key);
    if (value === ACCOUNT_ACTIVE_KEY || value.startsWith(ACCOUNT_PREFIX))
      throw accountChangedError();
    return prefix + value;
  };
  return {
    assertActive,
    prefix,
    logicalEventKey: (key) =>
      typeof key === "string" && own(key)
        ? prefix
          ? key.slice(prefix.length)
          : key
        : null,
    get length() {
      return keys().length;
    },
    key: (index) => keys()[index] ?? null,
    getItem: (key) => raw.getItem(physical(key)),
    setItem: (key, value) => raw.setItem(physical(key), String(value)),
    removeItem: (key) => raw.removeItem(physical(key)),
  };
}

// The owner keeps the existing keys and photo database. Members never claim
// ambiguous legacy data: imports stay the explicit, portable backup workflow.
export function installAccountBoundary({
  preview = false,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  const role = doc?.querySelector('meta[name="hangit-role"]')?.content || "";
  const scope =
    doc?.querySelector('meta[name="hangit-storage-scope"]')?.content || "";
  const legacy = !role && !scope;
  const valid =
    validAccountScope(scope) &&
    (((role === "owner" || !role) && scope === "owner") ||
      (role === "member" && scope !== "owner"));
  let raw = null,
    storage,
    lockStyle = null,
    lockPanel = null;
  const showLock = (kind = "account") => {
    if (!doc?.head) return;
    if (!lockStyle) {
      lockStyle = doc.createElement("style");
      lockStyle.textContent =
        "body > *:not(#hangit-account-lock){display:none!important}";
      doc.head.append(lockStyle);
    }
    const draw = () => {
      if (lockPanel || !doc.body) return;
      lockPanel = doc.createElement("section");
      lockPanel.id = "hangit-account-lock";
      lockPanel.setAttribute("role", "alert");
      lockPanel.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;display:grid;align-content:center;justify-items:center;gap:16px;padding:24px;background:var(--bg,#f7f7f8);color:var(--ink,#202025);text-align:center;font:16px/1.6 system-ui,sans-serif";
      const title = doc.createElement("h1");
      title.textContent =
        kind === "storage"
          ? "기기 보관함을 열지 못했어요"
          : kind === "identity"
            ? "로그인 정보를 다시 확인해 주세요"
            : "다른 계정으로 전환됐어요";
      const text = doc.createElement("p");
      text.textContent =
        kind === "storage"
          ? "기존 자료는 지우지 않았어요. 브라우저의 저장 공간 허용을 확인하고 다시 열어 주세요."
          : kind === "identity"
            ? "현재 계정의 보관함을 구분하지 못해 자료를 열지 않았어요. 연결된 상태에서 앱을 다시 열어 주세요."
            : "기존 옷장과 사진은 기기에 보관돼 있어요. 현재 계정으로 앱을 다시 열어 주세요.";
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "현재 계정으로 다시 열기";
      button.style.cssText =
        "min-height:48px;padding:8px 20px;border:0;border-radius:8px;background:var(--btn-bg,#202025);color:var(--btn-fg,#fff);font:inherit";
      button.onclick = () => win.location.assign("/");
      lockPanel.append(title, text, button);
      doc.body.append(lockPanel);
      button.focus();
    };
    if (doc.body) draw();
    else doc.addEventListener("DOMContentLoaded", draw, { once: true });
  };
  const hideLock = () => {
    lockStyle?.remove();
    lockPanel?.remove();
    lockStyle = null;
    lockPanel = null;
  };
  const failStorage = {
    get length() {
      throw accountChangedError();
    },
    key() {
      throw accountChangedError();
    },
    getItem() {
      throw accountChangedError();
    },
    setItem() {
      throw accountChangedError();
    },
    removeItem() {
      throw accountChangedError();
    },
  };
  const assertActive = () => {
    if (legacy) return;
    if (!valid) {
      if (!preview) showLock();
      throw accountChangedError();
    }
    if (preview) return;
    if (!valid || !raw || raw.getItem(ACCOUNT_ACTIVE_KEY) !== scope) {
      showLock();
      throw accountChangedError();
    }
  };
  if (!legacy && !preview) {
    if (!valid) {
      storage = failStorage;
      showLock("identity");
    } else
      try {
        raw = win.localStorage;
        const offline =
          doc.querySelector('meta[name="hangit-offline"]')?.content === "1";
        if (!offline) raw.setItem(ACCOUNT_ACTIVE_KEY, scope);
        storage = accountStorage(raw, scope, showLock);
        assertActive();
      } catch {
        storage = failStorage;
        showLock("storage");
      }
    const check = () => {
      try {
        const wasLocked = !!lockStyle;
        assertActive();
        hideLock();
        if (wasLocked) {
          const event = new win.Event("storage");
          Object.assign(event, {
            key: win.EOUL_MOCK_KEY || "eoul-d12-hang:v1",
          });
          win.dispatchEvent(event);
        }
      } catch {}
    };
    win.addEventListener("pageshow", check);
    doc.addEventListener("visibilitychange", check);
    win.addEventListener("storage", (event) => {
      if (event.key === ACCOUNT_ACTIVE_KEY) {
        check();
        return;
      }
      if (
        role !== "member" ||
        !storage?.prefix ||
        typeof event.key !== "string" ||
        !event.key.startsWith(storage.prefix)
      )
        return;
      try {
        assertActive();
      } catch {
        return;
      }
      const key = storage.logicalEventKey(event.key);
      if (key === null) return;
      const translated = new win.Event("storage");
      Object.assign(translated, {
        key,
        oldValue: event.oldValue,
        newValue: event.newValue,
        url: event.url,
      });
      win.dispatchEvent(translated);
    });
  }
  const identity = {
    scope: valid ? scope : null,
    storage,
    assertActive,
    photoNamespace: (namespace) => {
      if (preview)
        throw Object.assign(
          Error("미리보기에서는 개인 사진 보관함을 열지 않아요."),
          { code: "preview" },
        );
      assertActive();
      return valid ? accountNamespace(scope, namespace) : namespace;
    },
  };
  win.EOUL_ACCOUNT = identity;
  if (!legacy) {
    const originalFetch = win.fetch.bind(win);
    win.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url,
        win.location.href,
      );
      const api =
        url.origin === win.location.origin && url.pathname.startsWith("/api/");
      if (api) assertActive();
      let response;
      if (api) {
        const headers = new win.Headers(
          init?.headers ||
            (typeof input === "object" && "headers" in input
              ? input.headers
              : undefined),
        );
        headers.set(ACCOUNT_HEADER, scope);
        response = await originalFetch(
          input instanceof win.Request
            ? new win.Request(input, { ...init, headers })
            : input,
          input instanceof win.Request ? undefined : { ...init, headers },
        );
      } else response = await originalFetch(input, init);
      if (
        !preview &&
        raw &&
        response.headers.get("x-hangit-scope-mismatch") === "1"
      ) {
        if (raw.getItem(ACCOUNT_ACTIVE_KEY) === scope)
          raw.setItem(ACCOUNT_ACTIVE_KEY, "signed-out");
        showLock();
      }
      return response;
    };
  }
  return identity;
}
