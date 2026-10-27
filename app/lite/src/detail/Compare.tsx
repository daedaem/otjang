import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ProductPic, Top } from "./parts";
import type { CompareHost } from "./types";
// Side-by-side comparison of hung products (WO-04): same table as the vanilla
// V.compare, equal rows folded at the bottom until shown.
export function Compare({ host }: { host: CompareHost }) {
  const coreVersion = useSyncExternalStore(
      host.core.subscribe,
      host.core.version,
      host.core.version,
    ),
    version = useSyncExternalStore(
      host.ctl.subscribe,
      host.ctl.getVersion,
      host.ctl.getVersion,
    ),
    [showSame, setShowSame] = useState(false),
    restored = useRef(false);
  const m = useMemo(
    () => host.model(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, coreVersion, version],
  );
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (host.restoreY !== null) window.scrollTo(0, host.restoreY);
  }, [host]);
  if (m.few)
    return (
      <section data-react-compare>
        <Top back={host.back} info={host.info} />
        <h1 className="h2" style={{ marginTop: 8 }}>
          두 벌 이상 걸면 나란히 봐요
        </h1>
        <p className="t5 sub" style={{ marginTop: 6 }}>
          {`결과 사진 모서리의 옷걸이를 눌러 후보를 걸어 주세요. 지금 ${m.count}벌 걸려 있어요.`}
        </p>
      </section>
    );
  return (
    <section data-react-compare>
      <Top back={host.back} info={host.info} />
      <h1 className="h2" style={{ marginTop: 8 }}>
        {`걸어 본 ${m.count}벌`}
      </h1>
      <p className="t6" style={{ marginTop: 4 }}>
        {m.note}
      </p>
      <div className={`cmp${showSame ? " showsame" : ""}`} id="cmp">
        <table>
          <colgroup>
            <col style={{ width: 68 }} />
            {m.items.map((it) => (
              <col key={it.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="t6">항목</span>
              </th>
              {m.items.map((it) => (
                <th key={it.id} scope="col">
                  <button
                    type="button"
                    style={{ display: "block", width: "100%", textAlign: "left" }}
                    onClick={() => host.product(it.id)}
                  >
                    <ProductPic pic={it} />
                    <div className="n">{`${it.brand} ${it.name}`}</div>
                  </button>
                  <button
                    type="button"
                    className="rm"
                    onClick={() => host.unhang(it.id)}
                  >
                    내리기
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.label} className={r.same ? "same" : ""}>
                <th scope="row">{r.label}</th>
                {r.values.map((v, i) => (
                  <td key={i} className="num">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {m.nSame ? (
        <button
          type="button"
          className="quiet sametog"
          aria-expanded={showSame}
          onClick={() => setShowSame((on) => !on)}
        >
          <i className={`ph ph-caret-${showSame ? "up" : "down"}`} />
          {`같은 항목 ${m.nSame}개 ${showSame ? "접기" : "보기"}`}
        </button>
      ) : null}
    </section>
  );
}
