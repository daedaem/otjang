// 코디 공유(커뮤니티) 화면. 대표 10-28 08:08(누구나 가입·직접 찍은 사진·코디 공유 먼저), 09:39 "끝까지".
// 서버 스위치가 꺼져 있으면(기본) 열지 않았다고만 말하고 아무것도 보내지 않는다.
// 보내는 것: 내가 고른 사진(이 기기에서 JPEG로 다시 그림), 한마디, 옷 종류·색·이름. 옷장 id·메모·링크는 보내지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
// @ts-ignore plain domain module is covered by Node checks
import { validateCommunityPost, COMMUNITY_LIMITS } from "../domain/community.js";
// @ts-ignore plain domain data
import { GARMENT_KINDS } from "../domain/wardrobe.js";
// @ts-ignore plain domain data
import { COLORS } from "../domain/data/slots.js";
import { preparePhoto, type ReadyPhoto } from "./photo";
import "./community.css";

export type Piece = { kind: string; color: string | null; label: string };
type Post = {
  id: string;
  author: { name: string };
  mine: boolean;
  text: string;
  pieces: Piece[];
  photos: string[];
  createdAt: number;
  hidden: string | null;
};
type Status = {
  mode: string;
  member: { name: string } | null;
  rules: { version: number; items: string[] };
  reasons: { id: string; label: string }[];
  contact: string | null;
  reviewDays: number;
  isOperator: boolean;
  signedIn: boolean;
  login: { kakao: boolean; google: boolean; email?: boolean } | null;
  operator: { name: string | null; contact: string | null; privacyOfficer: string | null } | null;
  minAge: number;
};
type Fail = { code: string; message?: string };
type ReviewItem = Post & { reports: number; firstReportAt: number | null; reasons: Record<string, number> };
export type CommunityClient = {
  status(): Promise<Status | Fail>;
  join(name: string, rules: number, age14: boolean): Promise<{ member: { name: string } } | Fail>;
  feed(options: { cursor?: string; mine?: boolean }): Promise<{ items: Post[]; next: string | null } | Fail>;
  post(body: { post: { text: string; pieces: Piece[]; consent: boolean }; photos: string[] }): Promise<{ id: string } | Fail>;
  remove(id: string): Promise<{ ok: true } | Fail>;
  report(post: string, reason: string): Promise<{ ok: true; reviewDays: number } | Fail>;
  block(post: string): Promise<{ ok: true } | Fail>;
  blocks(): Promise<{ items: { key: string; name: string }[] } | Fail>;
  unblock(key: string): Promise<{ ok: true } | Fail>;
  leave(): Promise<{ ok: true } | Fail>;
  review(): Promise<{ items: ReviewItem[] } | Fail>;
  act(id: string, action: "restore" | "hide" | "delete"): Promise<{ ok: true } | Fail>;
  photoUrl(id: string): string;
  emailStart?(email: string): Promise<{ ok: true } | Fail>;
  emailVerify?(email: string, code: string): Promise<{ ok: true } | Fail>;
};
type Garment = { id: string; label: string; kind: string; color: string | null; trial: boolean };
export type CommunityHost = {
  element: HTMLElement;
  core: { getState(): { closet: Garment[] } };
  client?: CommunityClient | null;
  share?: Piece[] | null;
  info(): void;
  menu(): void;
  // /c 공개 화면: 앱의 탭·메뉴 없이 코디 공유만 띄운다.
  standalone?: boolean;
  logout?(): void;
};

const failed = (x: unknown): x is Fail => !!x && typeof x === "object" && "code" in x;
const KIND_NAME = new Map<string, string>((GARMENT_KINDS as { id: string; name: string }[]).map((k) => [k.id, k.name]));
const COLOR = COLORS as Record<string, { label: string; hex: string }>;
const pieceName = (p: Piece) => p.label || `${p.color ? COLOR[p.color]?.label + " " : ""}${KIND_NAME.get(p.kind) || "옷"}`;
const when = (ms: number) => {
  const d = Date.now() - ms;
  if (d < 60_000) return "방금";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}분 전`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}시간 전`;
  const t = new Date(ms);
  return `${t.getMonth() + 1}월 ${t.getDate()}일`;
};
const HIDDEN_NOTE: Record<string, string> = {
  reports: "신고가 쌓여 운영자 확인을 기다려요. 지금은 나만 볼 수 있어요.",
};

function Top({ host, status }: { host: CommunityHost; status: Status | null }) {
  if (host.standalone)
    return (
      <header className="cm-top">
        <span className="mark">행잇</span>
        <span className="sp" />
        {status?.signedIn && host.logout ? (
          <button type="button" className="quiet" onClick={host.logout}>
            로그아웃
          </button>
        ) : null}
      </header>
    );
  return (
    <header className="cm-top">
      <span className="mark">커뮤니티</span>
      <span className="sp" />
      <button type="button" className="icon" onClick={host.info} aria-label="가격·사진·판단 기준 보기">
        ⓘ
      </button>
      <button type="button" className="icon" onClick={host.menu} aria-label="더보기">
        ···
      </button>
    </header>
  );
}

function Closed({ fail }: { fail: Fail }) {
  const text =
    fail.code === "community_off"
      ? "코디 공유는 아직 열지 않았어요"
      : fail.code === "public_not_ready"
        ? "코디 공유는 공개 준비가 끝나면 열어요"
        : fail.code === "preview"
          ? "미리보기에서는 코디 공유를 쓰지 않아요"
          : fail.code === "offline"
            ? "연결이 끊겨 코디 공유를 불러오지 못했어요"
            : "코디 공유를 불러오지 못했어요";
  const sub =
    fail.code === "community_off"
      ? "운영자가 켜면 여기서 다른 사람의 코디를 보고 내 코디 사진을 올릴 수 있어요. 지금은 아무것도 보내지 않아요."
      : fail.code === "public_not_ready"
        ? "운영자 정보·연락처와 회원 로그인이 준비되면 열려요. 지금은 아무것도 보내지 않아요."
        : fail.message || "잠시 뒤에 다시 열어 주세요.";
  return (
    <div className="cm-closed" role="status">
      <p className="cm-closed-title">{text}</p>
      <p>{sub}</p>
    </div>
  );
}

// 이용약관·개인정보처리방침 요약(공개 전 초안: docs/log/2026-10/community-legal-draft-20261028.md). 운영자 정보는 서버 설정에서 온다.
function Terms({ status, close }: { status: Status; close(): void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  const op = status.operator;
  const who = op?.name || "운영자(정보 준비 중)";
  const contact = op?.contact || status.contact || "준비 중";
  return createPortal(
    <div className="cm-veil" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="cm-sheet cm-terms" role="dialog" aria-modal="true" aria-label="이용약관·개인정보처리방침" ref={box}>
        <div className="cm-sheet-head">
          <h2>이용약관·개인정보처리방침</h2>
          <button type="button" className="quiet" onClick={close}>
            닫기
          </button>
        </div>
        <h3>운영자</h3>
        <p>
          {who} · 문의·신고·권리 침해: {contact}
        </p>
        <h3>가입</h3>
        <p>규칙에 동의하고 이름을 정해 가입해요. 만 {status.minAge}세 미만은 가입할 수 없어요.</p>
        <h3>게시물</h3>
        <p>직접 찍었거나 올릴 권리가 있는 사진만 올려요. 게시물의 권리는 올린 사람에게 있고, 운영자는 코디 공유 화면에 보여 주는 데만 써요. 언제든 지울 수 있고, 지우면 서버에서 바로 지워요.</p>
        <h3>신고·숨김·차단</h3>
        <p>
          신고하면 그 글은 나에게 바로 안 보여요. 서로 다른 3명이 신고하면 운영자가 확인할 때까지 숨기고, {status.reviewDays}일 안에 확인해요. 차단하면 서로의 글이 안 보이고 상대에게 알리지 않아요.
        </p>
        <h3>모으는 개인정보</h3>
        <p>
          회원 확인값(카카오·구글 회원번호나 이메일을 알아볼 수 없게 바꾼 값), 활동 이름, 올린 사진·한마디·옷 종류·색·이름, 게시·신고·차단 시각. 이메일로 가입하면 이메일은 인증 코드를 보낼 때만 쓰고 원문은 저장하지 않아요(메일은 발송 서비스를 거쳐요). 전화번호·프로필은 받지 않아요. 옷장 기록·메모·구매 링크와 사진의 위치·기기 정보는 받지 않아요.
        </p>
        <h3>보관과 삭제</h3>
        <p>지우거나 커뮤니티를 나갈 때까지 보관하고, 나가면 이름·글·사진·신고·차단을 바로 지워요. 제3자에게 주지 않아요. 서버와 저장소는 Cloudflare를 써요.</p>
        <h3>개인정보 보호책임자</h3>
        <p>
          {op?.privacyOfficer || who} · {contact}
        </p>
        <p className="cm-small">이 내용은 공개 전 초안이며 법률 검토 전이에요.</p>
      </div>
    </div>,
    document.body,
  );
}

function EmailSignIn({ client, done }: { client: CommunityClient; done(): void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ask = async () => {
    if (!client.emailStart) return;
    setBusy(true);
    setMessage("");
    const r = await client.emailStart(email);
    setBusy(false);
    if (failed(r)) return setMessage(r.message || "코드를 보내지 못했어요.");
    setSent(true);
    setMessage("메일로 6자리 코드를 보냈어요. 10분 안에 넣어 주세요.");
  };
  const check = async () => {
    if (!client.emailVerify) return;
    setBusy(true);
    setMessage("");
    const r = await client.emailVerify(email, code);
    setBusy(false);
    if (failed(r)) return setMessage(r.message || "코드가 맞지 않아요.");
    done();
  };
  return (
    <div className="cm-email">
      <label className="cm-field">
        <span>이메일</span>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
        <small>코드를 보낼 때만 쓰고 저장하지 않아요.</small>
      </label>
      {!sent ? (
        <button type="button" className="btn line" disabled={busy || !/@/.test(email)} onClick={ask}>
          인증 코드 받기
        </button>
      ) : (
        <>
          <label className="cm-field">
            <span>인증 코드</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <div className="cm-email-actions">
            <button type="button" className="btn go" disabled={busy || code.length !== 6} onClick={check}>
              확인
            </button>
            <button type="button" className="quiet" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>
              다른 이메일
            </button>
          </div>
        </>
      )}
      {message ? <p className="cm-small" role="status">{message}</p> : null}
    </div>
  );
}

function SignIn({ status, client, signedIn }: { status: Status; client: CommunityClient; signedIn(): void }) {
  return (
    <div className="cm-join">
      <p className="cm-lead">다른 사람의 코디를 보고, 내 코디 사진을 올려요. 카카오·구글이나 이메일 인증으로 시작해 주세요. 프로필은 받지 않아요.</p>
      <div className="cm-login">
        {status.login?.kakao ? (
          <a className="cm-provider cm-kakao" href="/_member/login/kakao">
            <img src="/login/kakao-login.svg" alt="카카오 로그인" width="224" height="46" />
          </a>
        ) : null}
        {status.login?.google ? (
          <a className="cm-provider cm-google" href="/_member/login/google">
            <img src="/login/google-signin.png" alt="Sign in with Google" width="207" height="46" />
          </a>
        ) : null}
      </div>
      {status.login?.email ? <EmailSignIn client={client} done={signedIn} /> : null}
    </div>
  );
}

function Join({ status, client, done }: { status: Status; client: CommunityClient; done(s: Status): void }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    const r = await client.join(name, status.rules.version, age);
    setBusy(false);
    if (failed(r)) return setError(r.message || "가입하지 못했어요.");
    done({ ...status, member: r.member });
  };
  return (
    <div className="cm-join">
      <p className="cm-lead">다른 사람의 코디를 보고, 내 코디 사진을 올려요. 먼저 규칙을 읽어 주세요.</p>
      <ol className="cm-rules">
        {status.rules.items.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ol>
      {status.operator?.contact || status.contact ? (
        <p className="cm-small">
          권리 침해·신고 연락처: {status.operator?.contact || status.contact} · 신고는 {status.reviewDays}일 안에 확인해요.
        </p>
      ) : null}
      <button type="button" className="quiet" onClick={() => setTerms(true)}>
        이용약관·개인정보처리방침
      </button>
      {terms ? <Terms status={status} close={() => setTerms(false)} /> : null}
      <label className="cm-field">
        <span>이름</span>
        <input value={name} maxLength={COMMUNITY_LIMITS.nicknameMax} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        <small>다른 회원에게 보이는 이름이에요. 이메일·전화번호는 쓰지 말아 주세요.</small>
      </label>
      <label className="cm-check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>규칙을 읽었고 따를게요</span>
      </label>
      <label className="cm-check">
        <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
        <span>만 {status.minAge}세 이상이에요</span>
      </label>
      {error ? <p role="alert" className="cm-error">{error}</p> : null}
      <button type="button" className="btn go" disabled={!agree || !age || name.trim().length < 2 || busy} onClick={submit}>
        가입하기
      </button>
    </div>
  );
}

function PostCard({ post, status, client, onGone, notify, blocked }: { post: Post; status: Status; client: CommunityClient; onGone(id: string): void; notify(t: string): void; blocked(): void }) {
  const [confirm, setConfirm] = useState<"" | "delete" | "block">("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(status.reasons[0]?.id || "");
  const [error, setError] = useState("");
  const del = async () => {
    if (confirm !== "delete") return setConfirm("delete");
    const r = await client.remove(post.id);
    if (failed(r)) return setError(r.message || "지우지 못했어요.");
    onGone(post.id);
  };
  const block = async () => {
    if (confirm !== "block") return setConfirm("block");
    const r = await client.block(post.id);
    if (failed(r)) return setError(r.message || "차단하지 못했어요.");
    notify(`${post.author.name}님을 차단했어요. 서로의 글이 보이지 않아요.`);
    blocked();
  };
  const report = async () => {
    const r = await client.report(post.id, reason);
    if (failed(r)) return setError(r.message || "신고하지 못했어요.");
    notify(`신고했어요. 운영자가 ${r.reviewDays}일 안에 확인해요.`);
    onGone(post.id);
  };
  return (
    <article className="cm-post" data-community-post={post.id}>
      {post.photos.length ? (
        <div className={`cm-photos n${Math.min(post.photos.length, 4)}`}>
          {post.photos.map((id, i) => (
            <img key={id} src={client.photoUrl(id)} alt={`${post.author.name}님의 코디 사진 ${i + 1}`} loading="lazy" decoding="async" />
          ))}
        </div>
      ) : null}
      <div className="cm-post-body">
        <p className="cm-meta">
          <b>{post.author.name}</b> · {when(post.createdAt)}
          {post.mine ? " · 내 글" : ""}
        </p>
        {post.hidden ? <p className="cm-hidden">{HIDDEN_NOTE[post.hidden] || "운영자가 숨겼어요. 지금은 나만 볼 수 있어요."}</p> : null}
        {post.text ? <p className="cm-text">{post.text}</p> : null}
        {post.pieces.length ? (
          <ul className="cm-pieces" aria-label="입은 옷">
            {post.pieces.map((p, i) => (
              <li key={i}>
                <i style={{ background: p.color ? COLOR[p.color]?.hex : "transparent" }} aria-hidden="true" />
                {pieceName(p)}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p role="alert" className="cm-error">{error}</p> : null}
        <div className="cm-actions">
          {post.mine ? (
            <button type="button" className="quiet" onClick={del}>
              {confirm === "delete" ? "한 번 더 누르면 지워져요" : "지우기"}
            </button>
          ) : reporting ? (
            <div className="cm-report">
              <label>
                <span>신고 이유</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {status.reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn line" onClick={report}>
                신고하기
              </button>
              <button type="button" className="quiet" onClick={() => setReporting(false)}>
                취소
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="quiet" onClick={() => setReporting(true)}>
                신고
              </button>
              <button type="button" className="quiet" onClick={block}>
                {confirm === "block" ? "한 번 더 누르면 차단해요" : "이 회원 차단"}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function Compose({ host, client, initial, close, posted }: { host: CommunityHost; client: CommunityClient; initial: Piece[]; close(): void; posted(): void }) {
  const [photos, setPhotos] = useState<ReadyPhoto[]>([]);
  const [text, setText] = useState("");
  const [pieces, setPieces] = useState<Piece[]>(initial.slice(0, COMMUNITY_LIMITS.piecesMax));
  const [consent, setConsent] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => host.core.getState().closet.filter((g) => !g.trial), [host]);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button, input, textarea")?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy("사진을 줄이는 중이에요…");
    const next = [...photos];
    try {
      for (const f of [...files].slice(0, COMMUNITY_LIMITS.photosMax - next.length)) next.push(await preparePhoto(f));
    } catch (e) {
      setError((e as Error).message);
    }
    setPhotos(next);
    setBusy("");
  };
  const checked = validateCommunityPost({ text, pieces, consent }, { photos: photos.length });
  const send = async () => {
    setBusy("올리는 중이에요…");
    setError("");
    const r = await client.post({ post: { text, pieces, consent: photos.length > 0 && consent }, photos: photos.map((p) => p.base64) });
    setBusy("");
    if (failed(r)) return setError(r.message || "올리지 못했어요.");
    posted();
  };
  const toggle = (g: Garment) => {
    const has = pieces.findIndex((p) => p.label === g.label && p.kind === g.kind);
    if (has >= 0) setPieces(pieces.filter((_, i) => i !== has));
    else if (pieces.length < COMMUNITY_LIMITS.piecesMax) setPieces([...pieces, { kind: g.kind, color: g.color, label: g.label.slice(0, COMMUNITY_LIMITS.pieceLabelMax) }]);
  };
  // 화면 전환 애니메이션 안에 있으면 아래 탭 막대 밑에 깔리므로 body에 띄운다.
  return createPortal(
    <div className="cm-veil" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="cm-sheet" role="dialog" aria-modal="true" aria-label="코디 올리기" ref={box}>
        <h2>코디 올리기</h2>
        <section>
          <h3>사진 {photos.length}/{COMMUNITY_LIMITS.photosMax}</h3>
          <div className="cm-thumbs">
            {photos.map((p, i) => (
              <span key={p.url} className="cm-thumb" data-community-thumb>
                <img src={p.url} alt={`올릴 사진 ${i + 1}`} />
                <button type="button" aria-label={`사진 ${i + 1} 빼기`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                  ×
                </button>
              </span>
            ))}
            {photos.length < COMMUNITY_LIMITS.photosMax ? (
              <label className="cm-pick">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
                <span>사진 고르기</span>
              </label>
            ) : null}
          </div>
          <p className="cm-small">직접 찍었거나 올려도 되는 사진만 올려 주세요.</p>
        </section>
        <label className="cm-field">
          <span>한마디</span>
          <textarea value={text} maxLength={COMMUNITY_LIMITS.textMax} rows={2} onChange={(e) => setText(e.target.value)} placeholder="예: 가을 출근룩, 셔츠 대신 니트" />
        </label>
        <section>
          <h3>입은 옷 {pieces.length ? `${pieces.length}벌` : ""}</h3>
          {pieces.length ? (
            <ul className="cm-pieces edit">
              {pieces.map((p, i) => (
                <li key={i} data-community-piece>
                  <i style={{ background: p.color ? COLOR[p.color]?.hex : "transparent" }} aria-hidden="true" />
                  {pieceName(p)}
                  <button type="button" aria-label={`${pieceName(p)} 빼기`} onClick={() => setPieces(pieces.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {mine.length ? (
            <button type="button" className="quiet" aria-expanded={picking} onClick={() => setPicking(!picking)}>
              내 옷에서 고르기
            </button>
          ) : null}
          {picking ? (
            <ul className="cm-closet">
              {mine.map((g) => (
                <li key={g.id}>
                  <label className="cm-check">
                    <input type="checkbox" checked={pieces.some((p) => p.label === g.label && p.kind === g.kind)} onChange={() => toggle(g)} />
                    <span>{g.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <div className="cm-send-info">
          <p>
            <b>회원에게 보이는 것</b> 사진 {photos.length}장 · 한마디 · 옷 {pieces.length}벌(종류·색·이름) · 내 이름
          </p>
          <p>
            <b>보내지 않는 것</b> 옷장 기록·메모·구매 링크, 사진의 위치·기기 정보
          </p>
        </div>
        {photos.length ? (
          <label className="cm-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>사진을 회원들에게 보여 주는 데 동의해요</span>
          </label>
        ) : null}
        {busy ? <p role="status" className="cm-small">{busy}</p> : null}
        {error ? <p role="alert" className="cm-error">{error}</p> : !checked.ok && (photos.length || pieces.length || text) ? <p className="cm-small">{checked.message}</p> : null}
        <div className="cm-sheet-actions">
          <button type="button" className="btn line" onClick={close}>
            취소
          </button>
          <button type="button" className="btn go" disabled={!checked.ok || !!busy} onClick={send}>
            올리기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Review({ client }: { client: CommunityClient }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await client.review();
    if (failed(r)) return setError(r.message || "불러오지 못했어요.");
    setItems(r.items);
  }, [client]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (id: string, action: "restore" | "hide" | "delete") => {
    const r = await client.act(id, action);
    if (failed(r)) return setError(r.message || "처리하지 못했어요.");
    load();
  };
  return (
    <section className="cm-review" aria-label="신고·숨김 확인">
      <h2>신고·숨김 확인 (운영자)</h2>
      {error ? <p role="alert">{error}</p> : null}
      {items && !items.length ? <p className="cm-small">확인할 글이 없어요.</p> : null}
      {items?.map((p) => (
        <div key={p.id} className="cm-review-item">
          <p>
            <b>{p.author.name}</b> · 신고 {p.reports}건{p.hidden ? " · 숨김" : ""}
            {p.firstReportAt ? ` · 첫 신고 ${when(p.firstReportAt)}` : ""}
          </p>
          {p.text ? <p className="cm-text">{p.text}</p> : null}
          <div className="cm-actions">
            <button type="button" className="quiet" onClick={() => act(p.id, "restore")}>
              다시 보이기
            </button>
            <button type="button" className="quiet" onClick={() => act(p.id, "hide")}>
              숨기기
            </button>
            <button type="button" className="quiet" onClick={() => act(p.id, "delete")}>
              지우기
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function Community({ host }: { host: CommunityHost }) {
  const client = host.client || null;
  const [status, setStatus] = useState<Status | null>(null);
  const [fail, setFail] = useState<Fail | null>(client ? null : { code: "not_configured" });
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [compose, setCompose] = useState<Piece[] | null>(null);
  const [notice, setNotice] = useState("");
  const [blockList, setBlockList] = useState<{ key: string; name: string }[]>([]);
  const [showBlocks, setShowBlocks] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (!client) return;
    client.status().then((s) => {
      if (failed(s)) setFail(s);
      else {
        setStatus(s);
        if (s.member && host.share?.length) setCompose(host.share);
      }
    });
  }, []);
  const load = useCallback(
    async (more = false) => {
      if (!client) return;
      const r = await client.feed({ cursor: more ? next || undefined : undefined, mine });
      if (failed(r)) return setNotice(r.message || "목록을 불러오지 못했어요.");
      setPosts(more ? [...posts, ...r.items] : r.items);
      setNext(r.next);
      setLoaded(true);
    },
    [client, next, mine, posts],
  );
  const loadBlocks = useCallback(async () => {
    if (!client) return;
    const r = await client.blocks();
    if (!failed(r)) setBlockList(r.items);
  }, [client]);
  useEffect(() => {
    if (status?.member) {
      load(false);
      loadBlocks();
    }
  }, [status?.member?.name, mine]);
  const leave = async () => {
    if (!client) return;
    if (!leaving) return setLeaving(true);
    const r = await client.leave();
    if (failed(r)) return setNotice(r.message || "나가지 못했어요.");
    setLeaving(false);
    setPosts([]);
    setStatus(status ? { ...status, member: null } : status);
    setNotice("커뮤니티에서 나갔어요. 내 글과 사진을 모두 지웠어요.");
  };
  return (
    <section className="cm" data-react-community>
      <Top host={host} status={status} />
      <h1 tabIndex={-1} ref={heading}>
        코디 공유
      </h1>
      {notice ? (
        <p className="cm-notice" role="status">
          {notice}
        </p>
      ) : null}
      {fail ? (
        <Closed fail={fail} />
      ) : !status || !client ? (
        <p role="status" className="cm-small">
          불러오는 중이에요…
        </p>
      ) : !status.signedIn ? (
        <SignIn
          status={status}
          client={client}
          signedIn={() => {
            setNotice("로그인했어요. 이제 이름을 정해 가입해 주세요.");
            client.status().then((s) => (failed(s) ? setFail(s) : setStatus(s)));
          }}
        />
      ) : !status.member ? (
        <Join status={status} client={client} done={setStatus} />
      ) : (
        <>
          <div className="cm-bar">
            <button type="button" className="btn go" onClick={() => setCompose([])}>
              코디 올리기
            </button>
            <div className="cm-seg" role="group" aria-label="보기">
              <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>
                전체
              </button>
              <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>
                내 글
              </button>
            </div>
          </div>
          {loaded && !posts.length ? <p className="cm-empty">{mine ? "아직 올린 코디가 없어요" : "아직 올라온 코디가 없어요"}</p> : null}
          <div className="cm-feed">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                status={status}
                client={client}
                notify={setNotice}
                onGone={(id) => setPosts((list) => list.filter((x) => x.id !== id))}
                blocked={() => {
                  load(false);
                  loadBlocks();
                }}
              />
            ))}
          </div>
          {next ? (
            <button type="button" className="btn line cm-more" onClick={() => load(true)}>
              더 보기
            </button>
          ) : null}
          <footer className="cm-foot">
            <p className="cm-small">{status.member.name}님으로 쓰고 있어요.</p>
            {blockList.length ? (
              <button type="button" className="quiet" aria-expanded={showBlocks} onClick={() => setShowBlocks(!showBlocks)}>
                차단한 회원 {blockList.length}명
              </button>
            ) : null}
            {showBlocks ? (
              <ul className="cm-blocks">
                {blockList.map((b) => (
                  <li key={b.key}>
                    {b.name}
                    <button
                      type="button"
                      className="quiet"
                      onClick={async () => {
                        await client.unblock(b.key);
                        loadBlocks();
                        load(false);
                      }}
                    >
                      풀기
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <button type="button" className="quiet" onClick={leave}>
              {leaving ? "한 번 더 누르면 내 글·사진을 모두 지우고 나가요" : "커뮤니티 나가기"}
            </button>
          </footer>
          {status.isOperator ? <Review client={client} /> : null}
          {compose ? (
            <Compose
              host={host}
              client={client}
              initial={compose}
              close={() => setCompose(null)}
              posted={() => {
                setCompose(null);
                setNotice("올렸어요.");
                if (mine) load(false);
                else load(false);
              }}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

export function mount(host: CommunityHost) {
  const root = createRoot(host.element);
  root.render(<Community host={host} />);
  return () => root.unmount();
}
