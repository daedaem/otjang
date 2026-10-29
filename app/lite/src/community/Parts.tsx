import { Wordmark } from "../brand/Wordmark";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommunityHost, CommunityClient, Status, Fail, Piece, Post, ReviewItem } from "./types";
// @ts-ignore shared domain data is covered by Node checks
import { COMMUNITY_LIMITS, COMMUNITY_BOARDS, communityBoard, communitySourceUrl } from "../domain/community.js";
// @ts-ignore plain domain data
import { GARMENT_KINDS } from "../domain/wardrobe.js";
// @ts-ignore plain domain data
import { COLORS } from "../domain/data/slots.js";
export const failed = (x: unknown): x is Fail => !!x && typeof x === "object" && "code" in x;
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

export function Top({ host, status }: { host: CommunityHost; status: Status | null }) {
  if (host.standalone)
    return (
      <header className="cm-top">
        <span className="mark">
          <Wordmark />
        </span>
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
      <span className="mark">
        <Wordmark />
      </span>
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

export function Closed({ fail }: { fail: Fail }) {
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
        <p>직접 찍었거나 올릴 권리가 있는 사진만 올려요. 게시물의 권리는 올린 사람에게 있고, 커뮤니티 게시판에 보여 주는 데 써요. 운영자는 신고·숨김 확인에 필요한 글과 사진을 검토해요. 언제든 지울 수 있고, 지우면 서버에서 바로 지워요.</p>
        <h3>신고·숨김·차단</h3>
        <p>
          신고하면 그 글은 나에게 바로 안 보여요. 서로 다른 3명이 신고하면 운영자가 확인할 때까지 숨기고, {status.reviewDays}일 안에 확인해요. 차단하면 서로의 글이 안 보이고 상대에게 알리지 않아요.
        </p>
        <h3>모으는 개인정보</h3>
        <p>
          회원 확인값(카카오·구글 회원번호나 이메일을 알아볼 수 없게 바꾼 값), 활동 이름, 직접 올린 사진·한마디·옷 종류·색·이름, 게시판·제목·내용, 직접 제보한 판매처·가격·할인·종료일·출처와 게시·수정·신고·차단 시각. 이메일·비밀번호 계정은 로그인 ID를 알아볼 수 없게 바꾼 값과 비밀번호 해시·소금을 보관하며 이메일·비밀번호 원문은 저장하지 않아요. 이메일 인증 코드를 쓰는 경우에만 이메일이 발송 서비스를 거쳐요. 전화번호·프로필은 받지 않아요. 옷장 기록·메모·구매 링크는 기기에서 자동 전송하지 않고, 세일 출처는 작성자가 직접 입력한 것만 공유해요. 사진의 위치·기기 정보도 보내지 않아요.
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

export function SignIn({ status, client, signedIn, beforeSignIn }: { status: Status; client: CommunityClient; signedIn(): void; beforeSignIn?(): void }) {
  return (
    <div className="cm-join">
      <p className="cm-lead">코디와 세일 정보, 옷 이야기를 나눠요. 카카오·구글이나 이메일 인증으로 시작해 주세요. 프로필은 받지 않아요.</p>
      <div className="cm-login">
        {status.login?.kakao ? (
          <a className="cm-provider cm-kakao" href="/_member/login/kakao" onClick={beforeSignIn}>
            <img src="/login/kakao-login.svg" alt="카카오 로그인" width="224" height="46" />
          </a>
        ) : null}
        {status.login?.google ? (
          <a className="cm-provider cm-google" href="/_member/login/google" onClick={beforeSignIn}>
            <img src="/login/google-signin.png" alt="Sign in with Google" width="207" height="46" />
          </a>
        ) : null}
      </div>
      {status.login?.email ? <EmailSignIn client={client} done={signedIn} /> : null}
    </div>
  );
}

export function Join({ status, client, done }: { status: Status; client: CommunityClient; done(s: Status): void }) {
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
      <p className="cm-lead">코디와 세일 정보, 옷 이야기를 나눠요. 먼저 규칙을 읽어 주세요.</p>
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

export function PostCard({ post, status, client, onGone, notify, blocked, edit }: { post: Post; status: Status; client: CommunityClient; onGone(id: string): void; notify(t: string): void; blocked(): void; edit(post: Post): void }) {
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
    <article className={`cm-post cm-post-${communityBoard(post.board) || 'outfits'}`} data-community-post={post.id}>
      {post.photos.length ? (
        <div className={`cm-photos n${Math.min(post.photos.length, 4)}`}>
          {post.photos.map((id, i) => (
            <img key={id} src={client.photoUrl(id)} alt={`${post.author.name}님의 ${!post.board || post.board === 'outfits' ? '코디 ' : ''}사진 ${i + 1}`} loading="lazy" decoding="async" />
          ))}
        </div>
      ) : null}
      <div className="cm-post-body">
        <p className="cm-meta">
          <b>{post.author.name}</b> · {when(post.createdAt)}
          {post.mine ? " · 내 글" : ""}
        </p>
        {post.hidden ? <p className="cm-hidden">{HIDDEN_NOTE[post.hidden] || "운영자가 숨겼어요. 지금은 나만 볼 수 있어요."}</p> : null}
        {post.title ? <h2 className="cm-post-title">{post.title}</h2> : null}
        {post.board === 'sale' && post.sale ? <SaleFacts post={post} /> : null}
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
            <>
            <button type="button" className="quiet" onClick={() => edit(post)}>수정</button>
            <button type="button" className="quiet" onClick={del}>
              {confirm === "delete" ? "한 번 더 누르면 지워져요" : "지우기"}
            </button>
            </>
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

export function SaleFacts({ post }: { post: Pick<Post, 'sale' | 'createdAt' | 'updatedAt'> }) {
  const sale = post.sale;
  if (!sale) return null;
  const source = communitySourceUrl(sale.sourceUrl);
  return <div className="cm-sale-facts">
    <p className="cm-small"><span className="cm-tip-label">작성자 제보</span> · 가격·재고 미확인</p>
    <p className="cm-sale-merchant">{sale.merchant}</p>
    <p className="cm-sale-price">{sale.price !== null ? <strong>{sale.price.toLocaleString('ko-KR')}원</strong> : null}{sale.discount !== null ? <span>{sale.discount}% 할인 제보</span> : null}</p>
    {sale.endDate ? <p className="cm-small">기재한 종료일 {sale.endDate}</p> : null}
    {post.updatedAt && post.updatedAt > post.createdAt ? <p className="cm-small">제보 수정 {when(post.updatedAt)}</p> : null}
    {source ? <div className="cm-source"><a className="cm-source-link" href={source} target="_blank" rel="noopener noreferrer">출처 보기</a><span className="cm-source-host">{new URL(source).hostname}</span></div> : null}
  </div>;
}

export function Review({ client, status, changed }: { client: CommunityClient; status: Status; changed?(): void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [openPhotos, setOpenPhotos] = useState<Record<string, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<string, boolean>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const boardNames = Object.fromEntries(COMMUNITY_BOARDS.map((b: { id: string; label: string }) => [b.id, b.label]));
  const load = useCallback(async () => {
    try {
      const r = await client.review();
      if (failed(r)) { if (r.code === 'operator_only' || r.code === 'unauthorized') setItems([]); return setError(r.message || "불러오지 못했어요."); }
      setItems(r.items);
    } catch { setError("신고 목록을 불러오지 못했어요. 다시 시도해 주세요."); }
  }, [client]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (id: string, action: "restore" | "hide" | "delete") => {
    if (pending.current) return;
    if (action === 'delete' && confirm !== id) { setConfirm(id); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const r = await client.act(id, action);
      if (failed(r)) return setError(r.message || "처리하지 못했어요.");
      setConfirm(null); setOpenPhotos({}); setPhotoErrors({});
      await load(); changed?.();
      setNotice(action === 'delete' ? '글과 사진을 지웠어요.' : action === 'hide' ? '글을 숨겼어요.' : '글을 다시 보이게 했어요.');
      if (action === 'delete') requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch { setError("처리하지 못했어요. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <section className="cm-review" aria-label="신고·숨김 확인">
      <h2 ref={heading} tabIndex={-1}>신고·숨김 확인 (운영자)</h2>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status" className="cm-small">{notice}</p> : null}
      <button type="button" className="quiet" disabled={busy} onClick={() => void load()}>신고 목록 새로고침</button>
      {items && !items.length ? <p className="cm-small">확인할 글이 없어요.</p> : null}
      {items?.map((p) => (
        <div key={p.id} className="cm-review-item" data-community-review={p.id}>
          <p className="cm-small">{boardNames[communityBoard(p.board)] || '게시판 확인 필요'}</p>
          <p>
            <b>{p.author.name}</b> · 신고 {p.reports}건{p.hidden ? " · 숨김" : ""}
            {p.firstReportAt ? ` · 첫 신고 ${when(p.firstReportAt)}` : ""}
          </p>
          {p.title ? <h3 className="cm-post-title">{p.title}</h3> : null}
          {p.board === 'sale' && p.sale ? <SaleFacts post={p} /> : null}
          {p.text ? <p className="cm-text">{p.text}</p> : null}
          {Object.keys(p.reasons).length ? <ul className="cm-review-reasons" aria-label="신고 이유">{Object.entries(p.reasons).map(([reason, count]) => <li key={reason}>{status.reasons.find(item => item.id === reason)?.label || reason} · {count}건</li>)}</ul> : null}
          {p.pieces.length ? <ul className="cm-pieces" aria-label="검토할 옷">{p.pieces.map((piece, i) => <li key={i}>{pieceName(piece)}</li>)}</ul> : null}
          {p.photos.length ? <>
            <button type="button" className="quiet" aria-expanded={!!openPhotos[p.id]} onClick={() => { setOpenPhotos(old => ({ ...old, [p.id]: !old[p.id] })); setPhotoErrors({}); }}>{openPhotos[p.id] ? '사진 접기' : `사진 확인 ${p.photos.length}장`}</button>
            {openPhotos[p.id] ? <div className="cm-review-photos">{p.photos.map((id, i) => <div key={id}>
              {client.reviewPhotoUrl ? <img src={client.reviewPhotoUrl(id)} alt={`검토할 사진 ${i + 1}`} loading="lazy" decoding="async" onError={() => setPhotoErrors(old => ({ ...old, [id]: true }))} /> : null}
              {!client.reviewPhotoUrl || photoErrors[id] ? <p className="cm-small" role="status">사진을 불러오지 못했어요. 현재 계정을 확인하고 다시 열어 주세요.</p> : null}
            </div>)}</div> : null}
          </> : null}
          <div className="cm-actions">
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(p.id, "restore")}>
              다시 보이기
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(p.id, "hide")}>
              숨기기
            </button>
            <button type="button" className="quiet" disabled={busy} onClick={() => void act(p.id, "delete")}>
              {confirm === p.id ? '한 번 더 누르면 글과 사진을 지워요' : '지우기'}
            </button>
            {confirm === p.id ? <button type="button" className="quiet" disabled={busy} onClick={() => setConfirm(null)}>삭제 취소</button> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
