import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import type { ClosetHost, Garment, LayoutItem } from "./types";
import "./closet.css";
import { Wordmark } from "../brand/Wordmark";
const roleOf = (g: Garment, host: ClosetHost) => {
  const role = host.core.railCategory(g);
  return role === "dress" ? "top" : role || "accessory";
};
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "사진을 연결하지 못했어요. 원본과 옷 정보는 그대로예요.";
const Picture = ({ g, host }: { g: Garment; host: ClosetHost }) => (
  <OwnedPhoto g={g} host={host} />
);
function GarmentCard({
  g,
  item,
  host,
  picked,
  pick,
  onFile,
  busy,
}: {
  g: Garment;
  item: LayoutItem;
  host: ClosetHost;
  picked: boolean;
  pick(): void;
  onFile(g: Garment, f: File): void;
  busy: boolean;
}) {
  return (
    <article
      className={`wr-card ${picked ? "wr-picked" : ""}`}
      data-rail-item={g.id}
    >
      <button
        type="button"
        className="wr-pick"
        data-pick
        aria-pressed={picked}
        aria-label={`${g.label} ${picked ? "넣어두기" : "꺼내기"}`}
        onClick={pick}
      >
        <svg className="wr-hanger" viewBox="0 0 80 25" aria-hidden="true">
          <path d="M35 8C35-1 47-1 47 6C47 11 40 10 40 13L6 23H74L40 13" />
        </svg>
        <span
          className="wr-picture"
          style={{ height: item.heightPx ?? 110 }}
          data-garment-height={item.heightPx ?? 110}
        >
          <Picture g={g} host={host} />
          {g.trial ? <span className="wr-trial-chip">체험용</span> : null}
        </span>
        <span className="wr-card-name">{g.label}</span>
        {g.brand && <span className="wr-card-brand">{g.brand}</span>}
        <span className="wr-meta">
          {item.measured
            ? `총장 ${g.profile?.measures?.length?.cm}cm`
            : "실측 없음"}
          {g.trial ? " · 체험용" : ""}
        </span>
      </button>
      <div className="wr-card-actions">
        <button
          type="button"
          data-g={g.id}
          onClick={() => host.detail(g.id)}
          aria-label={`${g.label} 옷 정보`}
        >
          <i className="ph ph-info wr-act-icon" aria-hidden="true" />
          <span className="wr-act-text">옷 정보</span>
        </button>
        {!g.trial && !host.core.boot?.preview && (
          <label className={`wr-upload ${busy ? "wr-disabled" : ""}`}>
            <i className="ph ph-camera wr-act-icon" aria-hidden="true" />
            <span className="wr-act-text">
              {g.photoId ? "사진 바꾸기" : "내 사진"}
            </span>
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
      </div>
    </article>
  );
}
// Cards outside the horizontal viewport are not mounted. Their photos never
// start decoding. Only the small visible set obtains thumbnail object URLs.
function Rail({
  id,
  label,
  items,
  byId,
  host,
  selected,
  pick,
  onFile,
  busy,
}: {
  id: string;
  label: string;
  items: LayoutItem[];
  byId: Map<string, Garment>;
  host: ClosetHost;
  selected: string[];
  pick(g: Garment): void;
  onFile(g: Garment, f: File): void;
  busy: boolean;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 6 });
  useEffect(() => {
    const el = rail.current!;
    const update = () => {
      const cell =
        parseFloat(getComputedStyle(el).getPropertyValue("--wr-cell")) || 136;
      const start = Math.max(0, Math.floor(el.scrollLeft / cell) - 1);
      setRange({
        start,
        end: Math.min(
          items.length,
          start + Math.ceil(el.clientWidth / cell) + 3,
        ),
      });
      host.session.scroll[id] = el.scrollLeft;
    };
    el.scrollLeft = host.session.scroll[id] || 0;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [items.length, id, host.session]);
  const visible = items.slice(range.start, range.end);
  return (
    <section className="wr-rail" data-rail={id} aria-label={`${label} 레일`}>
      <div className="wr-rail-title">
        <h2>{label}</h2>
        <span>{items.length}벌</span>
      </div>
      <div
        className="wr-rail-scroll"
        data-rail-scroll
        ref={rail}
        tabIndex={0}
        role="region"
        aria-label={`${label} 옷 목록, 가로로 이동`}
      >
        {items.length ? (
          <div
            className="wr-track"
            style={{ "--wr-count": items.length } as CSSProperties}
          >
            <span
              className="wr-spacer"
              style={{ width: `calc(var(--wr-cell) * ${range.start})` }}
            />
            {visible.map((item) => {
              const g = byId.get(item.id)!;
              return (
                <GarmentCard
                  key={g.id}
                  g={g}
                  item={item}
                  host={host}
                  picked={selected.includes(g.id)}
                  pick={() => pick(g)}
                  onFile={onFile}
                  busy={busy}
                />
              );
            })}
            <span
              className="wr-spacer"
              style={{
                width: `calc(var(--wr-cell) * ${Math.max(0, items.length - range.end)})`,
              }}
            />
          </div>
        ) : (
          <p className="wr-empty-rail">아직 걸린 옷이 없어요</p>
        )}
      </div>
    </section>
  );
}
function Closet({ host }: { host: ClosetHost }) {
  useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const state = host.core.getState();
  const [sort, setSort] = useState(host.session.sort);
  const [brand, setBrand] = useState(host.session.brand);
  const [toolsOpen, setToolsOpen] = useState(!!host.session.toolsOpen);
  const [selected, setSelected] = useState(host.session.selected);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true),
    operation = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const assembly = useRef<HTMLElement>(null);
  const [assemblyVisible, setAssemblyVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        setAssemblyVisible(
          entries.some((entry) => entry.intersectionRatio >= 0.2),
        ),
      { threshold: 0.2 },
    );
    if (assembly.current) observer.observe(assembly.current);
    return () => observer.disconnect();
  }, []);
  // WO-11 new look (panel D+ step 2): the clothes are about 1.5x taller;
  // lengths keep their ratio because only the tallest size changes.
  const tallestFor = (wide: boolean) =>
    document.documentElement.dataset.look === "v2"
      ? wide
        ? 280
        : 220
      : wide
        ? 196
        : 144;
  const [tallestPx, setTallestPx] = useState(() =>
    tallestFor(matchMedia("(min-width:760px)").matches),
  );
  useEffect(() => {
    const query = matchMedia("(min-width:760px)");
    const update = () => setTallestPx(tallestFor(query.matches));
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
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
    tallestPx,
  });
  const chosen = selected
    .map((id) => byId.get(id))
    .filter((g): g is Garment => !!g);
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
  return (
    <section className="wr shelf" data-react-closet aria-label="내 옷장">
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
        <div>
          <h1 ref={heading} tabIndex={-1}>
            내 옷장
          </h1>
          <p>
            {state.mineCount}벌의 내 옷
            {state.trialCount ? ` · 체험용 ${state.trialCount}벌` : ""}
          </p>
        </div>
        <div className="wr-title-actions">
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
          <button className="btn go" type="button" onClick={host.add}>
            옷 넣기
          </button>
        </div>
      </div>
      {!!state.trialCount && (
        <div className="notice">
          <span>체험용 옷 · 가진 옷이 아니에요</span>
          <button
            type="button"
            onClick={() => {
              try {
                host.core.clearTrialCloset();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            체험용 내리기
          </button>
        </div>
      )}
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
      <div className="wr-workspace">
        <div className="wr-rails">
          {layout.rails.map((r) => (
            <Rail
              key={r.id}
              {...r}
              byId={byId}
              host={host}
              selected={selected}
              pick={pick}
              onFile={upload}
              busy={busy}
            />
          ))}
          {!!layout.shelf.length && (
            <Rail
              id="shelf"
              label="신발·소품"
              items={layout.shelf}
              byId={byId}
              host={host}
              selected={selected}
              pick={pick}
              onFile={upload}
              busy={busy}
            />
          )}
        </div>
        <aside
          ref={assembly}
          id="wr-assembly"
          tabIndex={-1}
          className={`wr-assembly ${chosen.length ? "wr-assembly-used" : ""}`}
          aria-label="내 옷 조합대"
        >
          <h2>
            꺼내서 함께 보기 <span>{chosen.length}벌</span>
          </h2>
          {chosen.length ? (
            <>
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
              <div className="wr-chosen">
                {chosen.map((g) => (
                  <button type="button" key={g.id} onClick={() => pick(g)}>
                    {g.label}
                    <span aria-hidden="true"> ×</span>
                  </button>
                ))}
              </div>
              <button
                className="quiet"
                type="button"
                onClick={() => {
                  host.session.selected = [];
                  setSelected([]);
                }}
              >
                모두 넣어두기
              </button>
            </>
          ) : (
            <div className="wr-stage wr-stage-empty">
              <i className="ph ph-coat-hanger" aria-hidden="true" />
              <p>옷을 누르면 여기에 꺼내요</p>
            </div>
          )}
          <p className="wr-meta">
            내 사진을 나란히 배치한 예시예요.
            <br />
            체형이나 착용감을 반영하지 않아요.
          </p>
          <button type="button" className="btn line wide" onClick={host.looks}>
            내 옷 코디 보기
          </button>
          <button type="button" className="quiet" onClick={host.mirror}>
            내 사진 거울 보기
          </button>
        </aside>
      </div>
      {!!chosen.length &&
        !assemblyVisible &&
        createPortal(
          <button
            type="button"
            className="wr-mobile-assembly"
            aria-controls="wr-assembly"
            onClick={() => {
              assembly.current?.scrollIntoView({
                block: "center",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
              assembly.current?.focus({ preventScroll: true });
            }}
          >
            꺼낸 {chosen.length}벌 · 함께 보기{" "}
            <i className="ph ph-caret-down" aria-hidden="true" />
          </button>,
          document.body,
        )}
      <details className="wr-help">
        <summary>사진·표시 기준</summary>
        <p>
          내가 찍은 내 옷 사진만 골라 주세요. iPhone 사진 앱에서 피사체를 들어
          올려 저장한 투명 PNG도 그대로 쓸 수 있어요. PNG·JPEG·WebP, 한 장
          8MB·1,200만 화소까지 보관해요. 자동으로 배경을 지우거나 상품을
          식별하지 않아요.
        </p>
        <p>
          실측 총장은 같은 축척으로 표시해요. 길이가 없는 옷은 예시 크기이며
          실제 핏을 뜻하지 않아요. 사진 원본은 가공하지 않고 이 기기에 보관하며
          파일 백업에 포함돼요.
        </p>
      </details>
    </section>
  );
}
export function mount(host: ClosetHost) {
  const root = createRoot(host.element);
  root.render(<Closet host={host} />);
  return () => root.unmount();
}
