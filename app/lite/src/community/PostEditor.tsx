import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Board, CommunityClient, CommunityHost, Garment, Piece, Post, PostInput } from "./types";
import { preparePhoto, type ReadyPhoto } from "./photo";
// @ts-ignore shared domain/model modules have Node contract checks
import { COMMUNITY_LIMITS, validateCommunityPost } from "../domain/community.js";
// @ts-ignore plain model
import { communityDraft, communityPostInput, communityDraftChanged } from "./editor-model.js";
// @ts-ignore plain routing helper
import { communityHref } from "./navigation.js";
// @ts-ignore plain data
import { COLORS } from "../domain/data/slots.js";
// @ts-ignore plain data
import { GARMENT_KINDS } from "../domain/wardrobe.js";

type Draft = { board: Board; title: string; text: string; pieces: Piece[]; merchant: string; price: string; discount: string; endDate: string; sourceUrl: string };
type Props = {
  host: CommunityHost; client: CommunityClient; board: Board; initial?: Piece[]; post?: Post;
  close(): void; saved(): void; guard(check: () => boolean): () => void;
};
const NAMES = Object.fromEntries(GARMENT_KINDS.map((k: { id: string; name: string }) => [k.id, k.name]));
const COLOR = COLORS as Record<string, { label: string; hex: string }>;
const pieceName = (p: Piece) => p.label || `${p.color ? COLOR[p.color]?.label + " " : ""}${NAMES[p.kind] || "옷"}`;
const LABELS: Record<Board, string> = { outfits: "코디 공유", sale: "세일 정보", free: "자유게시판" };

export function PostEditor({ host, client, board, initial, post, close, saved, guard }: Props) {
  const [draft, setDraft] = useState<Draft>(() => communityDraft(board, { post, share: initial }) as Draft);
  const original = useRef<Draft>(structuredClone(draft));
  const [photos, setPhotos] = useState<ReadyPhoto[]>([]);
  const latestPhotos = useRef(photos); latestPhotos.current = photos;
  const [consent, setConsent] = useState(false);
  const [picking, setPicking] = useState(false);
  const [extras, setExtras] = useState(board === "outfits");
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const closeRef = useRef(close); closeRef.current = close;
  const dirty = communityDraftChanged(original.current, draft, photos.length);
  const current = useRef({ dirty }); current.current = { dirty };
  const editing = !!post;
  const existingPhotos = post?.photos || [];
  const count = editing ? existingPhotos.length : photos.length;
  const input = communityPostInput(draft, editing ? count > 0 : consent) as PostInput;
  const checked = validateCommunityPost(input, { photos: count });
  const mine = board === "outfits" && !editing ? host.core.getState().closet.filter((g) => !g.trial) : [];
  const title = editing ? `${LABELS[board]} 글 수정` : board === "outfits" ? "코디 올리기" : board === "sale" ? "세일 제보하기" : "자유게시판 글쓰기";
  const checkExit = useCallback(() => {
    if (pending.current) { setError("처리 중이에요. 잠시만 기다려 주세요."); return false; }
    return !current.current.dirty || window.confirm("작성 중인 내용을 닫을까요? 저장하지 않은 내용은 사라져요.");
  }, []);
  useEffect(() => guard(checkExit), [guard, checkExit]);
  useEffect(() => {
    alive.current = true;
    (box.current?.querySelector<HTMLElement>("input:not([type=file]), textarea") || box.current?.querySelector<HTMLElement>("button"))?.focus();
    const unload = (event: BeforeUnloadEvent) => {
      if (pending.current || current.current.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (checkExit()) closeRef.current(); return; }
      if (event.key !== "Tab" || !box.current) return;
      const all = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]")].filter(el => el.getClientRects().length);
      if (!all.length) return;
      const index = all.indexOf(document.activeElement as HTMLElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index === all.length - 1 || index < 0))) {
        event.preventDefault(); all[event.shiftKey ? all.length - 1 : 0].focus();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key, true);
    return () => {
      alive.current = false;
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key, true);
      latestPhotos.current.forEach(photo => URL.revokeObjectURL(photo.url));
    };
  }, [checkExit]);

  const change = (field: Exclude<keyof Draft, "board" | "pieces">, value: string) => {
    if (pending.current) return;
    setDraft(d => ({ ...d, [field]: value })); setError(""); setConflict(false);
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || pending.current) return;
    const selected = [...files]; pending.current = true;
    setBusy("사진을 줄이는 중이에요…"); setError("");
    const next = [...latestPhotos.current];
    try {
      for (const file of selected.slice(0, COMMUNITY_LIMITS.photosMax - next.length)) next.push(await preparePhoto(file));
      if (selected.length > COMMUNITY_LIMITS.photosMax - photos.length) setError(`사진은 ${COMMUNITY_LIMITS.photosMax}장까지 올릴 수 있어요.`);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "사진을 읽지 못했어요."); }
    if (alive.current) { setPhotos(next); setBusy(""); }
    else next.filter(photo => !latestPhotos.current.includes(photo)).forEach(photo => URL.revokeObjectURL(photo.url));
    pending.current = false;
  };
  const removePhoto = (index: number) => {
    if (pending.current) return;
    URL.revokeObjectURL(photos[index].url);
    setPhotos(list => list.filter((_, i) => i !== index));
    setError("");
  };
  const toggle = (g: Garment) => {
    if (pending.current) return;
    const piece: Piece = { kind: g.kind, color: g.color, label: g.label.slice(0, COMMUNITY_LIMITS.pieceLabelMax) };
    setDraft(d => {
      const at = d.pieces.findIndex(p => p.kind === piece.kind && p.color === piece.color && p.label === piece.label);
      return { ...d, pieces: at >= 0 ? d.pieces.filter((_, i) => i !== at) : d.pieces.length < COMMUNITY_LIMITS.piecesMax ? [...d.pieces, piece] : d.pieces };
    });
  };
  const send = async () => {
    if (pending.current) return;
    if (!checked.ok) { setShowIssue(true); return; }
    pending.current = true; setBusy(editing ? "수정 중이에요…" : "올리는 중이에요…"); setError(""); setConflict(false);
    try {
      const result = editing
        ? await client.update(post!.id, input, post!.revision ?? 0)
        : await client.post({ post: input, photos: photos.map(photo => photo.base64) });
      if (!alive.current) return;
      if ("code" in result) {
        setConflict(result.code === "conflict");
        setError(result.code === "offline" ? "연결이 끊겼어요. 내 글에서 등록 여부를 확인한 뒤 다시 시도해 주세요. 입력한 내용은 그대로예요." : result.message || "저장하지 못했어요. 입력한 내용은 그대로예요.");
      } else { current.current.dirty = false; saved(); }
    } catch { if (alive.current) setError("저장하지 못했어요. 입력한 내용은 그대로예요."); }
    finally { pending.current = false; if (alive.current) setBusy(""); }
  };
  const cancel = () => { if (checkExit()) close(); };
  const field = (name: string, key: Exclude<keyof Draft, "board" | "pieces" | "text">, options: { type?: string; max?: number; numeric?: boolean; required?: boolean } = {}) => (
    <label className="cm-field">
      <span>{name}</span>
      <input aria-label={name} type={options.type || "text"} inputMode={options.numeric ? "numeric" : undefined} value={draft[key]} maxLength={options.max} required={options.required} disabled={!!busy} onChange={e => change(key, e.target.value)} onBlur={() => setShowIssue(true)} />
    </label>
  );

  return createPortal(<div className="cm-veil" onClick={e => e.target === e.currentTarget && cancel()}>
    <div className="cm-sheet cm-editor" role="dialog" aria-modal="true" aria-label={title} ref={box}>
      <div className="cm-sheet-head"><h2>{title}</h2><button type="button" className="quiet" disabled={!!busy} onClick={cancel} aria-label="닫기">닫기</button></div>
      {board !== "outfits" ? field("제목", "title", { max: COMMUNITY_LIMITS.titleMax, required: true }) : null}
      {board === "sale" ? <>
        <p className="cm-small">직접 찾은 세일 정보를 나눠요. 가격·재고는 확인된 값이 아니며, 상업 광고·무단 홍보는 규칙을 따라 주세요.</p>
        {field("판매처", "merchant", { max: COMMUNITY_LIMITS.merchantMax, required: true })}
        <fieldset className="cm-price-fields"><legend>가격과 할인율 중 하나만 있어도 돼요</legend><div>
          {field("가격(원)", "price", { max: 24, numeric: true })}
          {field("할인율(%)", "discount", { max: 8, numeric: true })}
        </div></fieldset>
        {field("출처 링크(선택)", "sourceUrl", { type: "url", max: COMMUNITY_LIMITS.sourceUrlMax })}
        <p className="cm-small">직접 입력한 공개 링크(https://…)를 회원에게 보여줘요.</p>
      </> : null}
      {board === "sale" ? <button type="button" className="quiet" aria-expanded={extras} disabled={!!busy} onClick={() => setExtras(!extras)}>설명·기간·사진 더 적기(선택)</button> : null}
      {board !== "sale" || extras ? <>
        <label className="cm-field"><span>{board === "outfits" ? "한마디" : "내용"}</span>
          <textarea aria-label={board === "outfits" ? "한마디" : "내용"} value={draft.text} maxLength={COMMUNITY_LIMITS.textMax} rows={board === "outfits" ? 2 : 4} required={board === "free"} disabled={!!busy} onChange={e => change("text", e.target.value)} onBlur={() => setShowIssue(true)} placeholder={board === "outfits" ? "예: 가을 출근룩, 셔츠 대신 니트" : board === "free" ? "옷과 쇼핑에 관해 이야기해요" : "조건이나 확인할 점을 알려 주세요"} />
        </label>
        <p className="cm-small cm-count">{draft.text.length}/{COMMUNITY_LIMITS.textMax}자</p>
        {board === "sale" ? field("종료일(선택)", "endDate", { type: "date" }) : null}
        <section><h3>사진 {count}/{COMMUNITY_LIMITS.photosMax}{editing ? " · 기존 사진 유지" : "(선택)"}</h3>
          <div className="cm-thumbs">
            {editing ? existingPhotos.map((id, i) => <span className="cm-thumb" key={id}><img src={client.photoUrl(id)} alt={`기존 사진 ${i + 1}`} /></span>) : photos.map((photo, i) => <span className="cm-thumb" key={photo.url} data-community-thumb><img src={photo.url} alt={`올릴 사진 ${i + 1}`} /><button type="button" disabled={!!busy} aria-label={`사진 ${i + 1} 빼기`} onClick={() => removePhoto(i)}>×</button></span>)}
            {!editing && photos.length < COMMUNITY_LIMITS.photosMax ? <label className="cm-pick"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy} onChange={e => { void addPhotos(e.target.files); e.target.value = ""; }} /><span>사진 고르기</span></label> : null}
          </div>
          <p className="cm-small">직접 찍었거나 올려도 되는 사진만 올려 주세요.</p>
        </section>
      </> : null}
      {board === "outfits" ? <section><h3>입은 옷 {draft.pieces.length ? `${draft.pieces.length}벌` : ""}</h3>
        {draft.pieces.length ? <ul className="cm-pieces edit">{draft.pieces.map((piece, i) => <li key={i} data-community-piece><i style={{ background: piece.color ? COLOR[piece.color]?.hex : "transparent" }} aria-hidden="true" />{pieceName(piece)}{!editing ? <button type="button" disabled={!!busy} aria-label={`${pieceName(piece)} 빼기`} onClick={() => setDraft(d => ({ ...d, pieces: d.pieces.filter((_, j) => j !== i) }))}>×</button> : null}</li>)}</ul> : null}
        {mine.length ? <button type="button" className="quiet" disabled={!!busy} aria-expanded={picking} onClick={() => setPicking(!picking)}>내 옷에서 고르기</button> : null}
        {picking ? <ul className="cm-closet">{mine.map(g => <li key={g.id}><label className="cm-check"><input type="checkbox" disabled={!!busy} checked={draft.pieces.some(p => p.kind === g.kind && p.color === g.color && p.label === g.label.slice(0, COMMUNITY_LIMITS.pieceLabelMax))} onChange={() => toggle(g)} /><span>{g.label}</span></label></li>)}</ul> : null}
      </section> : null}
      {editing ? <p className="cm-small">사진·옷·게시판은 그대로 두고 글자 정보만 수정해요.</p> : null}
      <div className="cm-send-info"><p><b>회원에게 보이는 것</b> {board === "outfits" ? `사진 ${count}장 · 한마디 · 옷 ${draft.pieces.length}벌(종류·색·이름) · 내 이름` : board === "sale" ? "제목 · 판매처 · 입력한 가격/할인·종료일·출처 · 내용 · 고른 사진 · 내 이름" : "제목 · 내용 · 고른 사진 · 내 이름"}</p><p><b>자동으로 보내지 않는 것</b> 기기 옷장 기록·메모·개인 구매 링크, 사진의 위치·기기 정보</p></div>
      {!editing && photos.length ? <label className="cm-check"><input type="checkbox" checked={consent} disabled={!!busy} onChange={e => setConsent(e.target.checked)} /><span>사진을 회원들에게 보여 주는 데 동의해요</span></label> : null}
      {busy ? <p role="status" className="cm-small">{busy}</p> : null}
      <div className="cm-editor-feedback">{error ? <p role="alert" className="cm-error">{error}</p> : !checked.ok && (showIssue || dirty || count > 0) ? <p className="cm-small">{checked.message}</p> : null}</div>
      {conflict ? <p className="cm-small">입력한 내용은 그대로예요. <a href={communityHref(board, true)} target="_blank" rel="noopener noreferrer">새 창에서 내 글 확인</a></p> : null}
      <div className="cm-sheet-actions"><button type="button" className="btn line" disabled={!!busy} onClick={cancel}>취소</button><button type="button" className="btn go" disabled={!checked.ok || !!busy || (editing && !dirty)} onClick={() => void send()}>{editing ? "수정 저장" : "올리기"}</button></div>
    </div>
  </div>, document.body);
}
