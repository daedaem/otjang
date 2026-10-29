import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import type {
  ClosetHost,
  Garment,
  LayoutItem,
  TrialGain,
  TrialVerdict,
} from "./types";
import "./closet.css";
import { Wordmark } from "../brand/Wordmark";

// Closet redesign (owner 10-29, AI role designers' v5/v6): category tabs over a
// photo grid. My clothes first, then the trial group. Tapping the photo opens
// the garment; the circle at the top right takes it out. Picked clothes gather
// in a bottom sheet that counts new outfits with my own clothes (a trial piece
// that duplicates mine is not counted, owner choice "세지 않기").
const roleOf = (g: Garment, host: ClosetHost) => {
  const role = host.core.railCategory(g);
  return role === "dress" ? "top" : role || "accessory";
};
const TABS = [
  ["all", "전체"],
  ["outer", "아우터"],
  ["top", "상의"],
  ["bottom", "하의"],
  ["shoes", "신발"],
] as const;
const TAB_JOSA: Record<string, string> = {
  outer: "아우터는",
  top: "상의는",
  bottom: "하의는",
  shoes: "신발은",
};
const PAGE = 60;
// Measured garments share one scale: the longest measured piece fills the
// tallest box. Others fit their category box (not true to size).
const SCALE = 1000;
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "사진을 연결하지 못했어요. 원본과 옷 정보는 그대로예요.";
const Picture = ({ g, host }: { g: Garment; host: ClosetHost }) => (
  <OwnedPhoto g={g} host={host} cut />
);
const josaGwa = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "과" : "와";
};
const josaNeun = (word: string) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "은" : "는";
};

function Tile({
  g,
  item,
  host,
  order,
  status,
  pick,
  onFile,
  busy,
}: {
  g: Garment;
  item: LayoutItem;
  host: ClosetHost;
  order: number;
  status: TrialVerdict | null;
  pick(): void;
  onFile(g: Garment, f: File): void;
  busy: boolean;
}) {
  const role = roleOf(g, host);
  const picked = order > 0;
  const measured = !!item.measured && !!item.heightPx;
  const style = measured
    ? ({ "--wr-scale": (item.heightPx || SCALE) / SCALE } as CSSProperties)
    : undefined;
  const cm = g.profile?.measures?.length?.cm;
  const said = [
    g.label,
    g.trial ? "체험용" : "내 옷",
    status?.text || "",
    "옷 정보",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <article
      className={`wr-card wr-tile ${picked ? "wr-picked" : ""}`}
      data-rail-item={g.id}
      data-role={role}
    >
      <button
        type="button"
        className="wr-open"
        data-g={g.id}
        aria-label={said}
        onClick={() => host.detail(g.id)}
      >
        <span className="wr-picture-tile">
          <span
            className={`wr-picture wr-box-${role} ${measured ? "wr-measured" : ""}`}
            style={style}
            data-garment-height={measured ? item.heightPx : 0}
          >
            <Picture g={g} host={host} />
          </span>
        </span>
        <span className="wr-card-name">{g.label}</span>
        {g.brand && <span className="wr-card-brand">{g.brand}</span>}
        <span className="wr-tags">
          <span className={`wr-chip ${g.trial ? "wr-chip-trial" : "wr-chip-mine"}`}>
            {g.trial ? "체험용" : "내 옷"}
          </span>
          {status?.text ? (
            <span className={`wr-st wr-st-${status.tone}`}>
              {status.similarTo ? (
                <>
                  <b>{status.similarTo.label}</b>
                  {status.text.slice(status.similarTo.label.length)}
                </>
              ) : (
                status.text
              )}
            </span>
          ) : null}
          {measured && Number.isFinite(cm) ? (
            <span className="wr-meta">총장 {cm}cm</span>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className="wr-pick"
        data-pick
        aria-pressed={picked}
        aria-label={`${g.label} ${picked ? `넣어두기, ${order}번째로 꺼냄` : "꺼내기"}`}
        onClick={pick}
      >
        <i aria-hidden="true">{picked ? order : ""}</i>
      </button>
      {!g.trial && !host.core.boot?.preview && (
        <label
          className={`wr-upload ${busy ? "wr-disabled" : ""}`}
          title={g.photoId ? "사진 바꾸기" : "내 사진"}
        >
          <i className="ph ph-camera" aria-hidden="true" />
          <input
            data-photo-input
            aria-label={`${g.label} 내 사진`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(g, f);
            }}
          />
        </label>
      )}
    </article>
  );
}

function Grid({
  items,
  byId,
  host,
  selected,
  statuses,
  pick,
  onFile,
  busy,
}: {
  items: LayoutItem[];
  byId: Map<string, Garment>;
  host: ClosetHost;
  selected: string[];
  statuses: Map<string, TrialVerdict>;
  pick(g: Garment): void;
  onFile(g: Garment, f: File): void;
  busy: boolean;
}) {
  // Large closets mount one page at a time; photos load lazily as they scroll in.
  const [shown, setShown] = useState(PAGE);
  const visible = items.slice(0, shown);
  return (
    <>
      <div className="wr-grid">
        {visible.map((item) => {
          const g = byId.get(item.id)!;
          return (
            <Tile
              key={g.id}
              g={g}
              item={item}
              host={host}
              order={selected.indexOf(g.id) + 1}
              status={statuses.get(g.id) || null}
              pick={() => pick(g)}
              onFile={onFile}
              busy={busy}
            />
          );
        })}
      </div>
      {items.length > shown && (
        <button
          type="button"
          className="btn line wr-more"
          onClick={() => setShown(shown + PAGE)}
        >
          {Math.min(PAGE, items.length - shown)}벌 더 보기
          <span> · 남은 {items.length - shown}벌</span>
        </button>
      )}
    </>
  );
}

// "흰 옥스퍼드 셔츠" → "옥스퍼드 셔츠": the sheet line names pieces without the colour word.
const shortName = (label: string) => {
  const words = label.split(" ");
  return words.length >= 3 ? words.slice(1).join(" ") : label;
};
// Each piece on its own, then what buying them together adds (v6 critic: +1 and +1 make +3).
function eachLine(gain: TrialGain) {
  const parts: string[] = [];
  let sum = 0;
  for (const x of gain.items) {
    if (x.verdict === "similar") parts.push(`${shortName(x.label)} 0(비슷)`);
    else if (x.verdict === "outer") parts.push(`${shortName(x.label)} 겉옷`);
    else if (x.verdict !== "no_closet") {
      parts.push(`${shortName(x.label)} +${x.gain}`);
      sum += x.gain;
    }
  }
  const together = gain.newOutfits - sum;
  return `${parts.join(" · ")}${together > 0 ? ` · 같이 사면 서로 맞춰 +${together}` : ""}`;
}
function Sheet({
  chosen,
  host,
  gain,
  clear,
}: {
  chosen: Garment[];
  host: ClosetHost;
  gain: TrialGain | null;
  clear(): void;
}) {
  const [explain, setExplain] = useState(false);
  const [stage, setStage] = useState(false);
  const box = useRef<HTMLElement>(null);
  // The closet leaves room for the sheet so its last row ends above it.
  useEffect(() => {
    const el = box.current!;
    const root = document.documentElement.style;
    const update = () => root.setProperty("--wr-sheet-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--wr-sheet-h");
    };
  }, []);
  const trials = chosen.filter((g) => g.trial);
  const similar = gain?.items.filter((x) => x.verdict === "similar") || [];
  const counted = trials.length - similar.length;
  const buy =
    trials.length === 1
      ? "사면"
      : trials.length === 2
        ? "둘 다 사면"
        : `${trials.length}벌 다 사면`;
  const showGain = !!gain && trials.length > 0 && (gain.ownedCount > 0 || gain.newOutfits > 0);
  return (
    <section className="wr-sheet" aria-label="고른 옷" ref={box}>
      <div className="wr-picked-row">
        <span className="wr-stack" aria-hidden="true">
          {chosen.slice(0, 4).map((g) => (
            <span key={g.id} className={`wr-mini ${g.trial ? "wr-mini-trial" : ""}`}>
              <Picture g={g} host={host} />
            </span>
          ))}
        </span>
        <span className="wr-picked-text">
          <b role="status" aria-live="polite">
            고른 옷 {chosen.length}벌
            {trials.length ? ` · 체험용 ${trials.length}` : ""}
          </b>
          <small>{chosen.map((g) => g.label).join(" · ")}</small>
        </span>
        <button
          type="button"
          className="wr-x"
          aria-label="모두 넣어두기"
          onClick={clear}
        >
          <i className="ph ph-x" aria-hidden="true" />
        </button>
      </div>
      {similar.map((x) => (
        <p className="wr-judge" key={x.id}>
          {x.label}
          {josaNeun(x.label)}{" "}
          {/^내 /.test(x.similarTo!.label) ? "" : "내 "}
          <b>{x.similarTo!.label}</b>
          {josaGwa(x.similarTo!.label)} 비슷해요
        </p>
      ))}
      <div className="wr-sheet-foot">
        <div className="wr-gain-box">
          {showGain ? (
            <>
              <p className="wr-gain">
                {buy} 새 코디 <strong>+{gain!.newOutfits}</strong>
                <button
                  type="button"
                  className="wr-def"
                  aria-expanded={explain}
                  aria-controls="wr-def"
                  aria-label="새 코디 세는 법"
                  onClick={() => setExplain(!explain)}
                >
                  <i className="ph ph-info" aria-hidden="true" />
                </button>
              </p>
              {trials.length > 1 && (
                <p className="wr-gain-sub wr-gain-each">{eachLine(gain!)}</p>
              )}
              <p className="wr-gain-sub">
                {gain!.layerable ? `걸칠 수 있는 코디 ${gain!.layerable}개 · ` : ""}
                지금 내 옷으로 {gain!.before}개
              </p>
            </>
          ) : (
            <p className="wr-gain-sub">
              {trials.length
                ? "내 옷을 넣으면 새 코디가 몇 개 생기는지 알려 드려요"
                : "꺼낸 옷을 겹쳐 볼 수 있어요"}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`btn ${stage ? "line" : "go"} wr-stage-toggle`}
          aria-expanded={stage}
          aria-controls="wr-assembly"
          onClick={() => setStage(!stage)}
        >
          겹쳐 보기
          <i
            className={`ph ${stage ? "ph-caret-up" : "ph-caret-down"}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {explain && (
        <div className="wr-def-text" id="wr-def" role="note">
          <p>코디 = 상의+하의+신발, 겉옷은 따로 셌어요.</p>
          <p>비슷한 옷이 이미 있는 조합은 새 코디로 세지 않아요.</p>
          <p>종류와 색만 봤어요. 핏·소재는 따지지 않았어요.</p>
        </div>
      )}
      {stage && (
        <div id="wr-assembly" className="wr-assembly" tabIndex={-1}>
          <div className="wr-stage">
            {chosen.map((g) => (
              <div
                key={g.id}
                data-assembly-layer={roleOf(g, host)}
                className={`wr-layer wr-layer-${roleOf(g, host)}`}
              >
                <Picture g={g} host={host} />
              </div>
            ))}
          </div>
          <p className="wr-meta">
            사진을 나란히 겹친 예시예요. 체형이나 착용감을 반영하지 않아요.
          </p>
        </div>
      )}
    </section>
  );
}

function Closet({ host }: { host: ClosetHost }) {
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const state = host.core.getState();
  const [sort, setSort] = useState(host.session.sort);
  const [brand, setBrand] = useState(host.session.brand);
  const [cat, setCat] = useState(host.session.cat || "all");
  const [toolsOpen, setToolsOpen] = useState(!!host.session.toolsOpen);
  const [selected, setSelected] = useState(host.session.selected);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true),
    operation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
    };
  }, []);
  const garments: Garment[] = state.closet.map((g) => ({
    ...g,
    brand: g.brand || host.registration(g.id)?.brand || null,
  }));
  const byId = new Map(garments.map((g) => [g.id, g]));
  const brands = [
    ...new Set(garments.map((g) => g.brand).filter((b): b is string => !!b)),
  ].sort((a, b) => a.localeCompare(b, "ko"));
  const worn = Object.fromEntries(
    garments.map((g) => [
      g.id,
      g.productId
        ? state.records.find((r) => r.productId === g.productId)?.wearCount || 0
        : 0,
    ]),
  );
  const effectiveBrand = brands.includes(brand) ? brand : "";
  const modern = document.documentElement.dataset.look === "v2";
  const filtered = garments.filter(
    (g) => !effectiveBrand || g.brand === effectiveBrand,
  );
  const layout = host.core.railLayout(filtered, {
    sort,
    wearCounts: worn,
    tallestPx: SCALE,
  });
  const ordered: LayoutItem[] = [
    ...layout.rails.flatMap((r) => r.items),
    ...layout.shelf,
  ];
  const inTab = (item: LayoutItem) => {
    if (cat === "all") return true;
    const role = roleOf(byId.get(item.id)!, host);
    return role === cat;
  };
  const mineItems = ordered.filter((i) => !byId.get(i.id)!.trial && inTab(i));
  const trialItems = ordered.filter((i) => byId.get(i.id)!.trial && inTab(i));
  const trialIds = garments.filter((g) => g.trial).map((g) => g.id);
  const statuses = useMemo(() => {
    const map = new Map<string, TrialVerdict>();
    if (!trialIds.length) return map;
    try {
      for (const v of host.core.trialGain(trialIds).items) map.set(v.id, v);
    } catch {
      /* a count is optional; the closet still shows */
    }
    return map;
    // The core version covers every closet change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, trialIds.join("|")]);
  const chosen = selected
    .map((id) => byId.get(id))
    .filter((g): g is Garment => !!g);
  const chosenTrials = chosen.filter((g) => g.trial).map((g) => g.id);
  const gain = useMemo(() => {
    if (!chosenTrials.length) return null;
    try {
      return host.core.trialGain(chosenTrials);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, chosenTrials.join("|")]);
  const pick = (g: Garment) => {
    const next = selected.includes(g.id)
      ? selected.filter((id) => id !== g.id)
      : [
          ...selected.filter((id) => {
            const old = byId.get(id);
            return old && roleOf(old, host) !== roleOf(g, host);
          }),
          g.id,
        ];
    host.session.selected = next;
    setSelected(next);
  };
  const clear = () => {
    host.session.selected = [];
    setSelected([]);
  };
  const chooseTab = (id: string, focus = false) => {
    host.session.cat = id;
    setCat(id);
    if (focus)
      tabRefs.current[TABS.findIndex(([t]) => t === id)]?.focus();
  };
  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex(([t]) => t === cat);
    const to =
      e.key === "ArrowRight"
        ? (at + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (at - 1 + TABS.length) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    chooseTab(TABS[to][0], true);
  };
  const upload = async (g: Garment, file: File) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    setNotice("내 사진을 보관하는 중이에요…");
    try {
      host.core.assertPhotoReady();
      if (host.core.boot?.preview || g.trial)
        throw Error("실제 보유한 옷을 골라 주세요.");
      const mod = await import("../photos/index.js");
      const dimensions = await mod.imageDimensions(file);
      await mod.saveGarmentPhoto({
        namespace: host.namespace,
        core: host.core,
        garmentId: g.id,
        file,
        ...dimensions,
      });
      if (alive.current)
        setNotice("내 사진을 연결했어요. 이 기기에만 보관해요.");
    } catch (e) {
      if (alive.current) {
        setNotice("");
        setError(errorText(e));
      }
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const tabLabel = TABS.find(([t]) => t === cat)![1];
  const ownedCount = state.mineCount;
  const gridProps = { byId, host, selected, statuses, pick, onFile: upload, busy };
  return (
    <section
      className={`wr shelf ${chosen.length ? "wr-has-sheet" : ""}`}
      data-react-closet
      aria-label="내 옷장"
    >
      <header className="wr-top">
        <span className="mark">
          <Wordmark />
        </span>
        <span className="sp" />
        <button
          type="button"
          className="icon"
          onClick={host.info}
          aria-label="가격·사진·판단 기준 보기"
        >
          <i className="ph ph-info" />
        </button>
        <button
          type="button"
          className="icon"
          onClick={host.menu}
          aria-label="더보기"
        >
          <i className="ph ph-dots-three" />
        </button>
      </header>
      <div className="wr-title">
        <div className="wr-title-text">
          <h1 ref={heading} tabIndex={-1}>
            내 옷장
          </h1>
          {!!garments.length && (
            <p className="wr-sub">
              <b>내 옷 {ownedCount}벌</b>
              {state.trialCount ? ` · 체험용 ${state.trialCount}` : ""}
            </p>
          )}
          {!!garments.length && !chosen.length && (
            <p className="wr-hint">동그라미를 눌러 옷을 꺼내 코디해 보세요</p>
          )}
        </div>
        <div className="wr-title-actions">
          <button
            className={`btn ${chosen.length ? "line" : "go"} wr-add`}
            type="button"
            onClick={host.add}
          >
            <i className="ph ph-plus" aria-hidden="true" />
            옷 넣기
          </button>
          <button
            className="quiet wr-tools-toggle"
            type="button"
            aria-expanded={toolsOpen}
            aria-controls="wr-controls"
            onClick={() => {
              const next = !toolsOpen;
              host.session.toolsOpen = next;
              setToolsOpen(next);
            }}
          >
            <i className="ph ph-sliders-horizontal" aria-hidden="true" />
            옷장 관리
          </button>
        </div>
      </div>
      {!garments.length && (
        <div className="wr-invite">
          <h2>한 벌부터 걸어 볼까요?</h2>
          <p>브랜드·상품명을 모르셔도 종류와 색으로 넣을 수 있어요.</p>
          <div>
            <button className="btn line" type="button" onClick={host.quickAdd}>
              종류·색으로 넣기
            </button>
            <button
              className="btn soft"
              type="button"
              onClick={() => {
                try {
                  host.core.loadTrialCloset();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              체험용 옷장
            </button>
          </div>
        </div>
      )}
      {modern && !toolsOpen && effectiveBrand && (
        <div className="wr-filter-status" role="status">
          <span>
            {effectiveBrand} · {filtered.length}벌
          </span>
          <button
            className="quiet"
            type="button"
            onClick={() => {
              host.session.brand = "";
              setBrand("");
            }}
          >
            모든 브랜드 보기
          </button>
        </div>
      )}
      <div
        id="wr-controls"
        className="wr-controls"
        hidden={modern && !toolsOpen}
      >
        <button type="button" className="quiet" onClick={host.collection}>
          내 진열장
        </button>
        <label>
          정렬
          <select
            aria-label="옷 정렬"
            value={sort}
            onChange={(e) => {
              host.session.sort = e.target.value;
              setSort(e.target.value);
            }}
          >
            {host.core.railSortChoices().map(([id, label]) => (
              <option key={id} value={id}>
                {label}
                {id === "worn" ? " · 기록 기준" : ""}
              </option>
            ))}
          </select>
        </label>
        {brands.length > 0 && (
          <label>
            브랜드
            <select
              aria-label="브랜드 필터"
              value={brands.includes(brand) ? brand : ""}
              onChange={(e) => {
                host.session.brand = e.target.value;
                setBrand(e.target.value);
              }}
            >
              <option value="">모든 브랜드</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b} · {garments.filter((g) => g.brand === b).length}벌
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="quiet" onClick={host.quickAdd}>
          종류로 넣기
        </button>
      </div>
      {(notice || error) && (
        <div className="wr-feedback">
          <p role={error ? "alert" : "status"} aria-live="polite">
            {error || notice}
          </p>
          <button
            type="button"
            aria-label="사진 안내 닫기"
            onClick={() => {
              setNotice("");
              setError("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {!!garments.length && (
        <div className="wr-tabs-wrap">
          <div
            className="wr-tabs"
            role="tablist"
            aria-label="옷 종류"
            onKeyDown={tabKeys}
          >
            {TABS.map(([id, label], n) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[n] = el;
                }}
                type="button"
                role="tab"
                id={`wr-tab-${id}`}
                aria-selected={cat === id}
                aria-controls="wr-panel"
                tabIndex={cat === id ? 0 : -1}
                onClick={() => chooseTab(id, true)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!!garments.length && (
        <div
          id="wr-panel"
          className="wr-panel"
          role="tabpanel"
          aria-labelledby={`wr-tab-${cat}`}
        >
          {(ownedCount > 0 || !state.trialCount) && (
            <section className="wr-section" data-closet-section="mine">
              <h2 className="wr-mine-h">
                내 옷 {mineItems.length}
              </h2>
              {mineItems.length ? (
                <Grid key={`mine-${cat}`} items={mineItems} {...gridProps} />
              ) : (
                <p className="wr-empty-tab">
                  {cat === "all"
                    ? "아직 넣은 옷이 없어요"
                    : `${TAB_JOSA[cat]} 아직 없어요`}
                  <button type="button" className="quiet" onClick={host.add}>
                    옷 넣기
                  </button>
                </p>
              )}
            </section>
          )}
          {!!state.trialCount && (
            <section className="wr-section" data-closet-section="trial">
              <div className="wr-trial-h">
                <span className="wr-trial-ic" aria-hidden="true">
                  <i className="ph ph-tag" />
                </span>
                <div className="wr-trial-tx">
                  <h2>
                    <span className="wr-nw">체험용 {trialItems.length}</span>
                    <span className="wr-sep"> · </span>
                    <span className="wr-u">사기 전에 걸어 보기</span>
                  </h2>
                  <p>
                    {ownedCount
                      ? "가진 옷이 아니에요 · 점선 표시"
                      : "가진 옷이 아니에요 · 내 옷을 넣으면 겹치는 옷과 새 코디 수를 알려 드려요"}
                  </p>
                </div>
                <button
                  type="button"
                  className="wr-tbtn"
                  onClick={() => {
                    try {
                      clear();
                      host.core.clearTrialCloset();
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  <span>체험용 내리기</span>
                </button>
              </div>
              {trialItems.length ? (
                <Grid key={`trial-${cat}`} items={trialItems} {...gridProps} />
              ) : (
                <p className="wr-empty-tab">체험용 {TAB_JOSA[cat] || `${tabLabel}는`} 없어요</p>
              )}
            </section>
          )}
        </div>
      )}
      <div className="wr-links">
        <button type="button" className="btn line" onClick={host.looks}>
          내 옷 코디 보기
        </button>
        <button type="button" className="quiet" onClick={host.mirror}>
          내 사진 거울 보기
        </button>
      </div>
      <details className="wr-help">
        <summary>사진·표시 기준</summary>
        <p>
          내가 찍은 내 옷 사진만 골라 주세요. 옷걸이에 걸어 정면으로 찍으면
          가장 잘 보여요(신발은 바닥에 두고 비스듬히 위에서). iPhone 사진 앱에서
          피사체를 들어 올려 저장한 투명 PNG도 그대로 쓸 수 있어요.
          PNG·JPEG·WebP, 한 장 8MB·1,200만 화소까지 보관해요. 아직 자동으로
          배경을 지우거나 상품을 식별하지 않아요.
        </p>
        <p>
          실측 총장이 있는 옷은 같은 축척으로 그려요. 길이가 없는 옷은 종류별
          칸에 맞춘 크기이며 실제 핏을 뜻하지 않아요. 사진 원본은 가공하지 않고
          이 기기에 보관하며 파일 백업에 포함돼요.
        </p>
        <p>
          체험용의 '새 코디'는 그 옷을 샀다고 치고 내 옷으로 새로 생기는
          상의+하의+신발 조합 수예요. 내 옷과 같은 종류·색이면 '비슷'으로
          표시하고 세지 않아요. 겉옷은 따로 '걸칠 수 있는 코디'로 세요.
        </p>
      </details>
      {!!chosen.length &&
        createPortal(
          <div className="wr-sheet-host">
            <Sheet chosen={chosen} host={host} gain={gain} clear={clear} />
          </div>,
          document.body,
        )}
    </section>
  );
}
export function mount(host: ClosetHost) {
  const root = createRoot(host.element);
  root.render(<Closet host={host} />);
  return () => root.unmount();
}
