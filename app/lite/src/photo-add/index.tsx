// 사진으로 옷 넣기(대표 10-28 16:46: "사진으로 자동 분석, 피드백 받으면서 그때 Claude 쓰던지요").
// 동의하면 사진을 이 기기에서 긴 변 512px JPEG로 줄여 Claude에게 보내 종류·색·이름을 추천받는다(서버에 저장하지 않음).
// 추천은 사용자가 고쳐서 넣는다. 고친 횟수는 이 기기에만 세어 AI가 얼마나 맞히는지 본다(eoul-d12-hang:photo-ai:v1).
// 원본 사진은 이 기기의 사진 보관함에 옷과 함께 둔다(기존 '내 사진'과 같은 곳).
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./photo-add.css";

type Choice = { id: string; name?: string; label?: string; hex?: string };
type Suggestion = { clothing: boolean; kind: string | null; color: string | null; label: string; confidence: string };
type Fail = { code: string; message?: string };
type Core = {
  boot?: { preview?: boolean };
  kindChoices(): Choice[];
  colorChoices(): Choice[];
  slotChoices(kind: string): { id: string }[];
  addGarment(v: { kind: string; color: string | null; slot: string | null; label: string }): { id: string };
  assertPhotoReady(): void;
  updateGarmentPhoto(id: string, photoId: string): unknown;
};
export type PhotoAddHost = {
  element: HTMLElement;
  core: Core;
  namespace: string;
  storage: Storage;
  analyse?: ((image: string) => Promise<Suggestion | Fail>) | null;
  back(): void;
  closet(): void;
};
type Item = {
  key: string;
  file: File;
  url: string;
  state: "waiting" | "asking" | "ai" | "manual";
  note: string;
  kind: string;
  color: string;
  label: string;
  suggested: { kind: string | null; color: string | null } | null;
};
const CONSENT = "eoul-d12-hang:photo-ai-consent";
const STATS = "eoul-d12-hang:photo-ai:v1";
const failed = (x: unknown): x is Fail => !!x && typeof x === "object" && "code" in x;
const MESSAGES: Record<string, string> = {
  member_daily_limit: "오늘 쓸 수 있는 AI 10번을 다 썼어요. 직접 골라 주세요.",
  daily_limit: "오늘 AI 사용 한도에 닿았어요. 직접 골라 주세요.",
  monthly_limit: "이번 달 AI 사용 한도에 닿았어요. 직접 골라 주세요.",
  preview: "미리보기에서는 AI에게 사진을 보내지 않아요. 직접 골라 주세요.",
  offline: "연결이 끊겨 AI가 보지 못했어요. 직접 골라 주세요.",
};
function read(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function write(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {}
}
async function small(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const [side, q] of [[512, 0.8], [448, 0.7], [384, 0.6]] as const) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", q).split(",")[1];
      if (data.length * 0.75 < 190 * 1024) return data;
    }
    throw Error("사진을 줄이지 못했어요.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function PhotoAdd({ host }: { host: PhotoAddHost }) {
  const preview = !!host.core.boot?.preview;
  const [consent, setConsent] = useState(() => !preview && read(host.storage, CONSENT) === "yes");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const kinds = host.core.kindChoices();
  const colors = host.core.colorChoices();
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), []);
  const patch = (key: string, value: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...value } : i)));
  const ask = async (item: Item) => {
    if (!host.analyse) return patch(item.key, { state: "manual", note: "AI를 쓸 수 없어요. 직접 골라 주세요." });
    patch(item.key, { state: "asking", note: "AI가 보는 중이에요…" });
    let r: Suggestion | Fail;
    try {
      r = await host.analyse(await small(item.file));
    } catch (e) {
      r = { code: "error", message: (e as Error).message };
    }
    if (failed(r)) return patch(item.key, { state: "manual", note: MESSAGES[r.code] || "AI가 알아보지 못했어요. 직접 골라 주세요." });
    if (!r.clothing) return patch(item.key, { state: "manual", note: "옷이 아닌 것 같아요. 직접 골라 주세요." });
    patch(item.key, {
      state: r.kind || r.color ? "ai" : "manual",
      note: r.kind && r.color ? (r.confidence === "low" ? "· 확실하지 않아요. 확인해 주세요." : "· 틀리면 고쳐 주세요.") : "AI가 일부만 알아봤어요. 나머지를 골라 주세요.",
      kind: r.kind || "",
      color: r.color || "",
      label: r.label || "",
      suggested: { kind: r.kind, color: r.color },
    });
  };
  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setNotice("");
    const next: Item[] = [...files].slice(0, Math.max(0, 10 - items.length)).map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      url: URL.createObjectURL(file),
      state: consent ? "waiting" : "manual",
      note: consent ? "" : "직접 골라 주세요.",
      kind: "",
      color: "",
      label: "",
      suggested: null,
    }));
    setItems((list) => [...list, ...next]);
    if (consent) next.forEach((i) => void ask(i));
  };
  const ready = items.filter((i) => i.kind && i.state !== "asking");
  const save = async () => {
    setBusy(true);
    setNotice("");
    const stats = (() => {
      try {
        return { suggested: 0, saved: 0, kindChanged: 0, colorChanged: 0, ...JSON.parse(read(host.storage, STATS) || "{}") };
      } catch {
        return { suggested: 0, saved: 0, kindChanged: 0, colorChanged: 0 };
      }
    })();
    let done = 0,
      photoFailed = 0;
    const mod = await import("../photos/index.js");
    for (const item of ready) {
      const g = host.core.addGarment({ kind: item.kind, color: item.color || null, slot: host.core.slotChoices(item.kind)[0]?.id || null, label: item.label.trim().slice(0, 40) });
      done++;
      if (item.suggested?.kind || item.suggested?.color) {
        stats.suggested++;
        stats.saved++;
        if (item.suggested.kind !== item.kind) stats.kindChanged++;
        if ((item.suggested.color || "") !== item.color) stats.colorChanged++;
      }
      try {
        if (preview) throw Error("preview");
        const dims = await mod.imageDimensions(item.file);
        await mod.saveGarmentPhoto({ namespace: host.namespace, core: host.core, garmentId: g.id, file: item.file, ...dims });
      } catch {
        photoFailed++;
      }
    }
    if (!preview) write(host.storage, STATS, JSON.stringify(stats));
    ready.forEach((i) => URL.revokeObjectURL(i.url));
    setItems((list) => list.filter((i) => !ready.includes(i)));
    setBusy(false);
    setNotice(`옷장에 ${done}벌 넣었어요.${photoFailed ? ` 사진 ${photoFailed}장은 보관하지 못했어요(옷은 넣었어요).` : " 사진은 이 기기에만 보관해요."}`);
  };
  const stats = (() => {
    try {
      return JSON.parse(read(host.storage, STATS) || "null");
    } catch {
      return null;
    }
  })();
  return (
    <section className="pa" data-react-photo-add>
      <header className="pa-top">
        <button type="button" className="icon" aria-label="뒤로" onClick={host.back}>
          <i className="ph ph-caret-left" />
        </button>
      </header>
      <h1 tabIndex={-1} ref={heading}>
        사진으로 옷 넣기
      </h1>
      <p className="pa-lead">옷 사진을 고르면 AI(Claude)가 종류·색·이름을 알아봐요. 틀리면 고쳐서 넣어 주세요. 고친 내용은 AI가 얼마나 맞히는지 보는 데만 써요.</p>
      <label className="pa-check">
        <input
          type="checkbox"
          checked={consent}
          disabled={preview}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (!preview) write(host.storage, CONSENT, e.target.checked ? "yes" : "no");
          }}
        />
        <span>사진을 AI에게 보내 종류·색을 알아보는 데 동의해요</span>
      </label>
      <p className="pa-small">작게 줄인 사진만 보내고 서버에 저장하지 않아요. 분석은 Anthropic(Claude)이 정책에 따라 처리해요. 동의하지 않으면 종류·색을 직접 골라요. AI는 하루 사용 횟수에 들어가요.</p>
      <label className="btn line pa-pick">
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <i className="ph ph-camera" aria-hidden="true" /> 사진 고르기 (최대 10장)
      </label>
      {notice ? (
        <div className="pa-notice" role="status">
          <p>{notice}</p>
          <button type="button" className="quiet" onClick={host.closet}>
            옷장 보기
          </button>
        </div>
      ) : null}
      <ul className="pa-list">
        {items.map((i) => (
          <li key={i.key} data-photo-item className={`pa-item ${i.state}`}>
            <img src={i.url} alt="" />
            <div className="pa-fields">
              <p className="pa-state" role="status">
                {i.state === "ai" ? <b>AI 추천</b> : null} {i.note || (i.state === "waiting" ? "AI에게 보내는 중이에요…" : "")}
              </p>
              <label>
                <span>종류</span>
                <select value={i.kind} onChange={(e) => patch(i.key, { kind: e.target.value })}>
                  <option value="">골라 주세요</option>
                  {kinds.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>색</span>
                <select value={i.color} onChange={(e) => patch(i.key, { color: e.target.value })}>
                  <option value="">모르겠어요</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>이름</span>
                <input value={i.label} maxLength={40} placeholder="예: 네이비 울 블레이저" onChange={(e) => patch(i.key, { label: e.target.value })} />
              </label>
              <div className="pa-row">
                {consent && i.state === "manual" && host.analyse ? (
                  <button type="button" className="quiet" onClick={() => void ask(i)}>
                    AI에게 다시 묻기
                  </button>
                ) : null}
                <button type="button" className="quiet" onClick={() => { URL.revokeObjectURL(i.url); setItems((l) => l.filter((x) => x.key !== i.key)); }}>
                  빼기
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length ? (
        <button type="button" className="btn go pa-save" disabled={busy || !ready.length} onClick={() => void save()}>
          {`옷장에 ${ready.length}벌 넣기`}
        </button>
      ) : null}
      {stats?.saved ? (
        <p className="pa-small">
          지금까지 AI 추천 {stats.saved}벌 중 종류를 고친 것 {stats.kindChanged}벌, 색을 고친 것 {stats.colorChanged}벌.
        </p>
      ) : null}
    </section>
  );
}

export function mount(host: PhotoAddHost) {
  const root = createRoot(host.element);
  root.render(<PhotoAdd host={host} />);
  return () => root.unmount();
}
