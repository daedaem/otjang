import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import { RetailPanels } from "../retail/RetailPanels";
import { CatalogRows, CrowdRows, PublicFacts } from "./Rows";
import type { AddHost, CrowdRow, FactData } from "./types";
import "./add-search.css";
function AddSearch({ host }: { host: AddHost }) {
  const [legacyIssue, setLegacyIssue] = useState(host.legacyIssue());
  useEffect(() => {
    const update = () => setLegacyIssue(host.legacyIssue());
    addEventListener("eoul-registration-status", update);
    return () => removeEventListener("eoul-registration-status", update);
  }, [host]);
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const [q, setQ] = useState(host.query || ""),
    [submitted, setSubmitted] = useState(host.query?.trim() || ""),
    [request, setRequest] = useState(0),
    [providerVersion, setProviderVersion] = useState(0);
  const text = q.trim(),
    latest = useRef(text);
  latest.current = text;
  const [facts, setFacts] = useState<{
    q: string;
    data: FactData | null;
    loading: boolean;
    error: boolean;
  }>({ q: "", data: null, loading: false, error: false });
  const [crowd, setCrowd] = useState<{ q: string; rows: CrowdRow[] }>({
    q: "",
    rows: [],
  });
  const [addedIds, setAddedIds] = useState(new Map<string, string>()),
    [failed, setFailed] = useState(new Set(host.pending.keys())),
    [leave, setLeave] = useState(false),
    [discard, setDiscard] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    discardDialog = useRef<HTMLDialogElement>(null),
    resolveLeave = useRef<null | ((ok: boolean) => void)>(null),
    epoch = useRef(0);
  const items = useMemo(() => {
    try {
      return text ? host.core.findProducts(text, { limit: 20 }) : [];
    } catch {
      return [];
    }
  }, [host, text, version]);
  const closet = useMemo(() => host.core.getState(), [host, version]);
  const added = useMemo(() => {
    const owned = new Set(
      closet.closet.filter((g) => !g.trial).map((g) => g.id),
    );
    return new Set(
      [...addedIds].filter(([, id]) => owned.has(id)).map(([key]) => key),
    );
  }, [addedIds, closet]);
  useLayoutEffect(() => {
    const current = document.activeElement;
    if (!current || current === document.body || host.element.contains(current))
      input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    host.shelf();
  }, [host, version]);
  useEffect(() => {
    const ready = () => setProviderVersion((n) => n + 1);
    addEventListener("eoul-open-products-ready", ready);
    return () => removeEventListener("eoul-open-products-ready", ready);
  }, []);
  useEffect(() => {
    const generation = ++epoch.current;
    if (!text) {
      setFacts({ q: "", data: null, loading: false, error: false });
      setCrowd({ q: "", rows: [] });
      return;
    }
    setFacts({ q: text, data: null, loading: true, error: false });
    setCrowd({ q: text, rows: [] });
    const current = () =>
      generation === epoch.current && latest.current === text;
    const timer = setTimeout(() => {
      void host
        .facts(text, submitted === text)
        .then((data) => {
          if (!current()) return;
          if (
            !data ||
            !Array.isArray(data.items) ||
            typeof data.fetchedAt !== "string" ||
            !Number.isFinite(data.usableCount)
          )
            throw Error("facts");
          setFacts({
            q: text,
            data: {
              ...data,
              items: data.items.filter(
                (p) =>
                  p &&
                  /^\d{6,24}$/.test(p.code) &&
                  typeof p.brand === "string" &&
                  typeof p.name === "string" &&
                  Array.isArray(p.categories) &&
                  p.categories.includes("en:clothing"),
              ),
            },
            loading: false,
            error: false,
          });
        })
        .catch(() => {
          if (current())
            setFacts({ q: text, data: null, loading: false, error: true });
        });
      void host
        .crowd(text)
        .then((rows) => {
          if (current()) setCrowd({ q: text, rows });
        })
        .catch(() => {
          if (current()) setCrowd({ q: text, rows: [] });
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      epoch.current++;
    };
  }, [host, text, submitted, request, providerVersion]);
  function own(row: CrowdRow) {
    const key = host.crowdKey(row),
      target = host.pending.get(key) || row;
    try {
      const g = host.ownCrowd(target);
      host.pending.delete(key);
      setFailed(new Set(host.pending.keys()));
      delete target.savedGarment;
      delete target.pendingNotice;
      setAddedIds((x) => new Map(x).set(key, g.id));
      host.finishCrowd(g);
    } catch (e) {
      const err = e as Error & { partial?: boolean };
      if (err.partial || target.savedGarment) {
        target.pendingNotice = err.message;
        host.pending.set(key, target);
      }
      setFailed(new Set(host.pending.keys()));
      host.toast(err.message || "옷 정보를 보관하지 못했어요.");
    }
  }
  const ownRef = useRef(own);
  ownRef.current = own;
  useEffect(() => {
    const off = host.navigationGuard(() => {
      if (!host.pending.size) return true;
      return new Promise<boolean>((resolve) => {
        resolveLeave.current = resolve;
        setLeave(true);
      });
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (host.pending.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    addEventListener("beforeunload", unload);
    return () => {
      off();
      removeEventListener("beforeunload", unload);
      resolveLeave.current?.(false);
    };
  }, [host]);
  useEffect(() => {
    if (leave && !dialog.current?.open) dialog.current?.showModal();
  }, [leave]);
  useEffect(() => {
    if (discard && !discardDialog.current?.open)
      discardDialog.current?.showModal();
  }, [discard]);
  function discardInput() {
    if (!discard) return;
    const row = host.pending.get(discard),
      savedId = row?.savedGarment?.id,
      exists =
        row?.savedGarment &&
        host.core
          .getState()
          .closet.some((g) => !g.trial && g.id === row.savedGarment!.id);
    if (row) {
      delete row.pendingNotice;
      delete row.savedGarment;
    }
    host.pending.delete(discard);
    setFailed(new Set(host.pending.keys()));
    setAddedIds((values) => {
      const next = new Map(values);
      if (exists && savedId) next.set(discard, savedId);
      else next.delete(discard);
      return next;
    });
    discardDialog.current?.close();
    setDiscard(null);
  }
  function decision(ok: boolean) {
    dialog.current?.close();
    setLeave(false);
    resolveLeave.current?.(ok);
    resolveLeave.current = null;
  }
  function change(value: string) {
    setQ(value);
    if (value.trim() !== submitted) setSubmitted("");
  }
  function choose(value: string) {
    setQ(value);
    setSubmitted(value.trim());
    setRequest((n) => n + 1);
  }
  const publicState =
      facts.q === text
        ? facts
        : { q: text, data: null, loading: !!text, error: false },
    crowdRows = crowd.q === text ? crowd.rows : [];
  return (
    <section
      className="as"
      data-react-add-search
      aria-label="가진 옷 상품으로 찾기"
    >
      <header className="top as-top">
        <button
          className="icon"
          type="button"
          tabIndex={0}
          aria-label="뒤로"
          onClick={host.back}
        >
          <i className="ph ph-caret-left" aria-hidden="true" />
        </button>
        <form
          id="af"
          className="qform"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(text);
            setRequest((n) => n + 1);
            input.current?.blur();
          }}
        >
          <input
            id="aq"
            ref={input}
            value={q}
            onChange={(e) => change(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="브랜드나 상품명으로 찾기"
            aria-label="브랜드나 상품명"
          />
          <button
            type="submit"
            tabIndex={0}
            className="icon"
            aria-label="상품 검색"
          >
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
          </button>
        </form>
        <button
          type="button"
          tabIndex={0}
          className="icon quiet-i end"
          aria-label="가격·사진·판단 기준 보기"
          onClick={host.info}
        >
          <i className="ph ph-info" aria-hidden="true" />
        </button>
      </header>
      {legacyIssue && (
        <p className="as-blocked" role="alert">
          {legacyIssue}
        </p>
      )}
      {!!host.pending.size && (
        <section className="as-pending" role="status">
          <h2 className="h3">추가 정보를 보관하지 못했어요</h2>
          {[...host.pending].map(([key, row]) => (
            <div key={key}>
              <span>
                {row.brand} · {row.name}
                {row.pendingNotice && (
                  <small className="as-pending-notice">
                    {row.pendingNotice}
                  </small>
                )}
              </span>
              <button
                className="btn line sm"
                type="button"
                tabIndex={0}
                disabled={!!legacyIssue}
                onClick={() => ownRef.current(row)}
              >
                추가 정보 다시 저장
              </button>
              <button
                type="button"
                className="quiet"
                tabIndex={0}
                onClick={() => setDiscard(key)}
              >
                입력 내려두기
              </button>
            </div>
          ))}
        </section>
      )}
      <div id="ares">
        {text ? (
          <>
            <CatalogRows host={host} items={items} />
            {!items.length && (
              <p className="t6" style={{ marginTop: 12 }}>
                기존 상품 목록에는 없어요. 아래 공개 상품 정보도 확인해 보세요.
              </p>
            )}
            <div id="acrowd">
              <CrowdRows
                host={host}
                rows={crowdRows}
                blocked={!!legacyIssue}
                {...{ added, failed }}
                onOwn={own}
              />
            </div>
          </>
        ) : (
          <>
            <div className="chips" style={{ marginTop: 12 }}>
              {host.examples().map((value) => (
                <button
                  className="chip ex"
                  key={value}
                  type="button"
                  tabIndex={0}
                  onClick={() => choose(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {!!closet.closet.length && (
              <section className="section">
                <h2 className="h3">최근 넣은 옷</h2>
                {closet.closet
                  .slice(-3)
                  .reverse()
                  .map((g) => (
                    <div className="srow" key={g.id}>
                      <span className="as-owned">
                        <OwnedPhoto g={g} host={host} />
                      </span>
                      <span className="grow">
                        <span className="n">{g.label}</span>
                        <span className="m">
                          {g.detailMissing || g.sourceLabel || g.kindName}
                        </span>
                      </span>
                    </div>
                  ))}
              </section>
            )}
          </>
        )}
      </div>
      <div id="adom" aria-live="polite">
        {!!text && submitted === text && (
          <RetailPanels host={host.retail} query={text} />
        )}
      </div>
      <div id="aopen" aria-live="polite">
        <PublicFacts
          host={host}
          data={publicState.data}
          loading={publicState.loading}
          error={publicState.error}
          onExample={choose}
        />
      </div>
      {host.photoAdd ? (
        <button
          className="row as-manual"
          data-photo-add
          type="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            host.photoAdd?.();
          }}
        >
          <span className="grow">
            <span className="t5">사진으로 넣기</span>
            <span className="t6">옷 사진을 고르면 AI가 종류·색을 알아봐요</span>
          </span>
          <i className="ph ph-camera" aria-hidden="true" />
        </button>
      ) : null}
      <button
        className="row as-manual"
        data-reg-open
        type="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          host.manual("");
        }}
      >
        <span className="grow">
          <span className="t5">목록에 없어요 → 직접 등록</span>
          <span className="t6">브랜드·상품명·종류·색만 적어요</span>
        </span>
        <i className="ph ph-caret-right" aria-hidden="true" />
      </button>
      <dialog
        ref={discardDialog}
        onCancel={(e) => {
          e.preventDefault();
          discardDialog.current?.close();
          setDiscard(null);
        }}
      >
        <h2 className="h3">이 추가 정보 입력을 내려둘까요?</h2>
        <p>
          이 화면에만 남은 브랜드·상품명 등의 입력을 그만 보관해요. 옷장과
          사진은 바꾸지 않아요.
        </p>
        <button
          type="button"
          className="btn line"
          tabIndex={0}
          onClick={() => {
            discardDialog.current?.close();
            setDiscard(null);
          }}
        >
          계속 보관하기
        </button>
        <button
          type="button"
          className="btn go"
          tabIndex={0}
          onClick={discardInput}
        >
          내려두기
        </button>
      </dialog>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          e.preventDefault();
          decision(false);
        }}
      >
        <h2 className="h3">보관하지 못한 추가 정보가 있어요</h2>
        <p>
          새로고침하면 이 화면에만 남은 브랜드·상품명 등의 추가 정보를 잃을 수
          있어요.
        </p>
        <button
          className="btn line"
          type="button"
          tabIndex={0}
          onClick={() => decision(false)}
        >
          계속 보관하기
        </button>
        <button
          className="btn go"
          type="button"
          tabIndex={0}
          onClick={() => decision(true)}
        >
          입력 두고 나가기
        </button>
      </dialog>
    </section>
  );
}
export function mount(host: AddHost) {
  const root = createRoot(host.element);
  root.render(<AddSearch host={host} />);
  return () => root.unmount();
}
