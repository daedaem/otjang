import type { CardModel, GridEntry, ResultsHost } from "./types";
// Result cards and the rows placed under a card's grid row (a one-time
// "do you own one?" question or a short note). Same classes and wording as
// the vanilla cardHtml/gridHtml; buttons call the host instead of using the
// data-* attributes the vanilla global click handler listens for.
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
function CardPhoto({ c }: { c: CardModel }) {
  if (!c.photo)
    // Trusted core tile template (same markup as the vanilla productPic);
    // the tag text is escaped here.
    return (
      <span
        className="ph-box"
        dangerouslySetInnerHTML={{
          __html:
            (c.tile || "") +
            (c.tag
              ? `<span class="tag ${escape(c.tagCls)}">${escape(c.tag)}</span>`
              : ""),
        }}
      />
    );
  return (
    <span className="ph-box">
      <img
        className={c.photo.flat ? "flat" : "cover"}
        src={c.photo.src}
        alt={c.photo.alt}
        decoding="async"
      />
      {c.tag ? <span className={`tag ${c.tagCls}`}>{c.tag}</span> : null}
    </span>
  );
}
function Card({
  host,
  c,
  pop,
  onHang,
}: {
  host: ResultsHost;
  c: CardModel;
  pop: boolean;
  onHang(id: string): void;
}) {
  const open = () => host.product(c.id);
  return (
    <div className={`card${c.dl ? " has-d" : ""}`} data-card={c.id}>
      <button
        type="button"
        className="open-p"
        aria-label={`${c.brand} ${c.name}`}
        onClick={open}
      >
        <CardPhoto c={c} />
      </button>
      <span className="hslot">
        {c.rank ? (
          <span className="rank num" aria-label={`AI 순위 ${c.rank}위`}>
            <i className="ph-fill ph-sparkle" />
            {c.rank}
          </span>
        ) : null}
        <button
          type="button"
          className={`hangt${pop ? " pop" : ""}`}
          aria-pressed={c.hung}
          aria-label={c.hung ? "걸어 보는 중 · 내리기" : "걸어 보기"}
          onClick={() => onHang(c.id)}
        >
          <span>
            <i className={`${c.hung ? "ph-fill" : "ph"} ph-coat-hanger`} />
          </span>
        </button>
      </span>
      <button type="button" className="open-p" onClick={open}>
        <div className="b">{c.brand}</div>
        <div className="n">{c.name}</div>
        {c.dl ? <div className={`d ${c.stop ? "stop" : ""}`}>{c.dl}</div> : null}
        <div className="p num">
          {c.priceText}
          <small>{c.priceShort}</small>
        </div>
      </button>
    </div>
  );
}
export function Grid({
  host,
  id,
  entries,
  pop,
  onHang,
}: {
  host: ResultsHost;
  id: "grid" | "offgrid";
  entries: GridEntry[];
  pop: string | null;
  onHang(id: string): void;
}) {
  return (
    <div className="grid" id={id}>
      {entries.map((e) =>
        e.type === "card" ? (
          <Card
            key={`card:${e.id}`}
            host={host}
            c={e.card}
            pop={pop === e.id}
            onHang={onHang}
          />
        ) : e.type === "note" ? (
          <div
            key={`note:${e.id}`}
            className="qrow note"
            role="alert"
            data-for={e.id}
          >
            <i className="ph ph-info" />
            <span className="qq" style={{ fontWeight: 600 }}>
              {e.text}
            </span>
          </div>
        ) : (
          <div
            key={`ask:${e.id}`}
            className="qrow"
            role="group"
            aria-label={e.text}
            data-for={e.id}
          >
            <span className="qq">
              {e.text}
              <small>{e.sub}</small>
            </span>
            <button type="button" onClick={() => host.own(e.id, true)}>
              있어요
            </button>
            <button
              type="button"
              className="no"
              onClick={() => host.own(e.id, false)}
            >
              없어요
            </button>
          </div>
        ),
      )}
    </div>
  );
}
