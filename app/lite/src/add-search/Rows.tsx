import { ProductPhoto } from "../photos/ProductPhoto";
export { ProductPhoto } from "../photos/ProductPhoto";
import type { AddHost, Product, FactData, CrowdRow } from "./types";
export function CatalogRows({
  host,
  items,
}: {
  host: AddHost;
  items: Product[];
}) {
  const state = host.core.getState(),
    byId = new Set(state.closet.map((g) => g.productId));
  return (
    <>
      {items.length > 0 && (
        <p className="t6" style={{ marginTop: 12 }}>
          {items.length}개{items.length >= 20 ? " 이상" : ""}
        </p>
      )}
      {items.map((p) => (
        <div
          className={`srow${byId.has(p.id) ? " done" : ""}`}
          data-srow={p.id}
          key={p.id}
        >
          <ProductPhoto host={host} p={p} />
          <span className="grow">
            <span className="b">{p.brand}</span>
            <span className="n">{p.name}</span>
            <span className="m">
              {p.colorFromPhoto ? p.kindName : `${p.colorLabel} ${p.kindName}`}
              {p.gender !== state.gender
                ? ` · ${p.gender === "F" ? "여성" : "남성"}`
                : ""}
            </span>
          </span>
          {byId.has(p.id) ? (
            <span className="ok">옷장에 있어요</span>
          ) : (
            <button
              type="button"
              tabIndex={0}
              className="btn line sm"
              data-own-add={p.id}
              onClick={(e) => {
                e.stopPropagation();
                host.own(p.id);
              }}
            >
              가지고 있어요
            </button>
          )}
        </div>
      ))}
    </>
  );
}
export function PublicFacts({
  host,
  data,
  loading,
  error,
  onExample,
}: {
  host: AddHost;
  data: FactData | null;
  loading: boolean;
  error: boolean;
  onExample: (q: string) => void;
}) {
  if (loading)
    return (
      <p className="t6" role="status">
        공개 상품 정보를 찾고 있어요…
      </p>
    );
  if (error)
    return (
      <p className="t6" role="status">
        공개 상품 정보를 불러오지 못했어요. 검색어를 다시 입력하거나 직접 등록해
        주세요.
      </p>
    );
  if (!data)
    return (
      <section className="section">
        <h2 className="h3">공개 상품 정보로 찾아 넣기</h2>
        <p className="t6">
          브랜드·이름을 찾아 등록할 수 있어요. 가격·재고 정보는 없어요.
        </p>
        <div className="chips">
          {["유니클로", "리바이스", "Brandit", "Guess"].map((q) => (
            <button
              key={q}
              type="button"
              className="chip ex"
              onClick={() => onExample(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </section>
    );
  return (
    <section className="section">
      <h2 className="h3">
        공개 상품 정보{" "}
        <span className="t6">
          {data.items.length}개{data.items.length === 12 ? " 이상" : ""}
        </span>
      </h2>
      <p className="t6">
        Open Products Facts · {data.fetchedAt.slice(0, 10)} 기준{" "}
        {data.usableCount}건 안에서 검색 · 가격·재고 없음
        <br />
        커뮤니티가 등록한 정보예요. 원본과 내 옷을 확인해 주세요.
      </p>
      {data.items.length ? (
        data.items.map((p, i) => (
          <div className="srow" key={p.code}>
            <i className="ph ph-tag" aria-hidden="true" />
            <span className="grow">
              <span className="b">{p.brand}</span>
              <span className="n">{p.name}</span>
              <span className="m">
                상품 코드 {p.code} ·{" "}
                <a
                  href={`https://world.openproductsfacts.org/product/${p.code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  원본
                </a>
              </span>
            </span>
            <button
              type="button"
              tabIndex={0}
              className="btn line sm"
              data-opf-add={i}
              onClick={() => host.fact(p)}
            >
              이 정보로 등록
            </button>
          </div>
        ))
      ) : (
        <p className="t5">이 공개 목록에는 일치하는 상품이 없어요.</p>
      )}
      <p className="t6">
        <a
          href="https://world.openproductsfacts.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Products Facts 및 기여자
        </a>{" "}
        ·{" "}
        <a
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ODbL
        </a>{" "}
        ·{" "}
        <a href="/data/open-products/clothing.json" download>
          사용한 공개 데이터 받기
        </a>{" "}
        ·{" "}
        <a
          href="/data/open-products/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          출처·변경 내역
        </a>
      </p>
    </section>
  );
}
export function CrowdRows({
  host,
  rows,
  added,
  failed,
  onOwn,
  blocked,
}: {
  host: AddHost;
  rows: CrowdRow[];
  added: Set<string>;
  failed: Set<string>;
  onOwn: (row: CrowdRow) => void;
  blocked: boolean;
}) {
  if (!rows.length) return null;
  return (
    <section className="section">
      <h2 className="h3">사용자 등록</h2>
      {rows.map((row, i) => {
        const key = host.crowdKey(row);
        return (
          <div className="srow" key={key}>
            <i className="ph ph-tag" aria-hidden="true" />
            <span className="grow">
              <span className="b">{row.brand}</span>
              <span className="n">{row.name}</span>
              <span className="m">
                {[
                  host.core.colorChoices().find((c) => c.id === row.color)
                    ?.label,
                  host.core.kindChoices().find((k) => k.id === row.kind)?.name,
                ]
                  .filter(Boolean)
                  .join(" ")}
                <span className="pill">
                  {Number.isInteger(row.count) && row.count >= 0
                    ? row.server
                      ? `${row.count}명 확인`
                      : `이 기기 · ${row.count}/${host.requiredCount}`
                    : "확인 수 모름"}
                </span>
              </span>
            </span>
            {added.has(key) ? (
              <span className="ok">옷장에 넣었어요</span>
            ) : (
              <button
                type="button"
                tabIndex={0}
                className="btn line sm"
                data-crowd-add={i}
                disabled={blocked}
                onClick={(e) => {
                  e.stopPropagation();
                  onOwn(row);
                }}
              >
                {failed.has(key) ? "추가 정보 다시 저장" : "가지고 있어요"}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
