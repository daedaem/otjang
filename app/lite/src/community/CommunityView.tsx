import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, CommunityHost, Fail, Piece, Post, Status } from "./types";
import { Top, Closed, SignIn, Join, PostCard, Review, failed } from "./Parts";
import { PostEditor } from "./PostEditor";
// @ts-ignore shared domain module has Node contract checks
import { COMMUNITY_BOARDS, communityBoard } from "../domain/community.js";
// @ts-ignore plain routing model
import { communityHref, readCommunityRoute, communityRouteKey, rememberCommunityEntry, resumeCommunityEntry } from "./navigation.js";

type Route = { board: Board | null; mine: boolean };
type Composer = { board: Board; post?: Post; pieces?: Piece[] };
const LABELS: Record<Board, { label: string; action: string; empty: string }> = {
  outfits: { label: "코디 공유", action: "코디 올리기", empty: "아직 올라온 코디가 없어요" },
  sale: { label: "세일 정보", action: "세일 제보하기", empty: "아직 올라온 세일 제보가 없어요" },
  free: { label: "자유게시판", action: "글쓰기", empty: "아직 올라온 글이 없어요" },
};
function initialRoute(host: CommunityHost): Route {
  if (!host.standalone) return { board: communityBoard(host.board === undefined ? undefined : host.board) as Board | null, mine: host.mine === true };
  let storage: Storage | null = null;
  try { storage = sessionStorage; } catch {}
  const result = resumeCommunityEntry(storage, location.hash);
  if (result.href) history.replaceState(history.state, "", result.href);
  return result.route as Route;
}
const safeScroll = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 10_000_000 ? value : null;

export function CommunityView({ host }: { host: CommunityHost }) {
  const client = host.client || null;
  const [route, setRoute] = useState<Route>(() => initialRoute(host));
  const activeRoute = useRef(route); activeRoute.current = route;
  const lastHref = useRef(location.href);
  const pendingScroll = useRef<number | null>(safeScroll(host.restoreScroll));
  const [status, setStatus] = useState<Status | null>(null);
  const [fail, setFail] = useState<Fail | null>(client ? null : { code: "not_configured" });
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [composer, setComposer] = useState<Composer | null>(null);
  const [notice, setNotice] = useState("");
  const [blockList, setBlockList] = useState<{ key: string; name: string }[]>([]);
  const [showBlocks, setShowBlocks] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const memberPending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const exitGuard = useRef<() => boolean>(() => true);
  const registerGuard = useCallback((check: () => boolean) => {
    exitGuard.current = check;
    return () => { if (exitGuard.current === check) exitGuard.current = () => true; };
  }, []);
  const shareConsumed = useRef(false);
  const sequence = useRef(0);
  const config = route.board ? LABELS[route.board] : null;

  useEffect(() => host.navigationGuard?.(() => exitGuard.current()), [host]);
  useEffect(() => {
    if (host.navigate) return;
    const change = () => {
      const incoming = readCommunityRoute(location.hash) as Route;
      if (communityRouteKey(incoming) === communityRouteKey(activeRoute.current)) { lastHref.current = location.href; return; }
      if (!exitGuard.current()) { history.pushState(history.state, "", lastHref.current); return; }
      pendingScroll.current = safeScroll(history.state?.communityScroll);
      activeRoute.current = incoming; lastHref.current = location.href;
      setComposer(null); setRoute(incoming);
    };
    window.addEventListener("popstate", change); window.addEventListener("hashchange", change);
    return () => { window.removeEventListener("popstate", change); window.removeEventListener("hashchange", change); };
  }, [host]);
  const navigate = useCallback((board: Board, mine: boolean) => {
    if (communityRouteKey({ board, mine }) === communityRouteKey(activeRoute.current)) return;
    if (host.navigate) { host.navigate(board, mine); return; }
    if (!exitGuard.current()) return;
    history.replaceState({ ...history.state, communityScroll: scrollY }, "");
    history.pushState({ communityScroll: 0 }, "", communityHref(board, mine));
    pendingScroll.current = 0;
    activeRoute.current = { board, mine }; lastHref.current = location.href;
    setComposer(null); setRoute({ board, mine });
  }, [host]);
  const rememberEntry = useCallback(() => {
    try { rememberCommunityEntry(sessionStorage, activeRoute.current); } catch {}
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [route.board, route.mine]);
  useEffect(() => {
    let active = true;
    if (client) client.status().then(result => {
      if (!active) return;
      if (failed(result)) setFail(result); else setStatus(result);
    }).catch(() => { if (active) setFail({ code: "offline", message: "연결을 확인하고 다시 열어 주세요." }); });
    return () => { active = false; };
  }, [client]);
  useEffect(() => {
    if (route.board === "outfits" && status?.member && host.share?.length && !shareConsumed.current) {
      shareConsumed.current = true; setComposer({ board: "outfits", pieces: host.share });
    }
  }, [host, route.board, status?.member?.name]);
  const load = useCallback(async (cursor?: string) => {
    const current = activeRoute.current;
    if (!client || !current.board) return;
    const board = current.board, key = communityRouteKey(current), request = ++sequence.current;
    setLoading(true); setListError("");
    try {
      const result = await client.feed({ board, mine: current.mine, ...(cursor ? { cursor } : {}) });
      if (request !== sequence.current || key !== communityRouteKey(activeRoute.current)) return;
      if (failed(result)) {
        setListError(result.message || "목록을 불러오지 못했어요.");
        if (result.code === "join_required") setStatus(s => s ? { ...s, member: null } : s);
        return;
      }
      if (!Array.isArray(result.items) || result.items.some(post => communityBoard(post.board) !== board)) {
        setListError("게시판 정보가 맞지 않아요. 다시 불러와 주세요."); return;
      }
      setPosts(previous => cursor ? [...previous, ...result.items.filter(post => !previous.some(old => old.id === post.id))] : result.items);
      setNext(result.next); setLoaded(true);
    } catch {
      if (request === sequence.current) setListError("연결을 확인하고 다시 불러와 주세요.");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [client]);
  const loadBlocks = useCallback(async () => {
    if (!client) return;
    const result = await client.blocks();
    if (!failed(result)) setBlockList(result.items);
  }, [client]);
  useEffect(() => {
    sequence.current++; setPosts([]); setNext(null); setLoaded(false); setLoading(false); setListError("");
    if (status?.member && route.board) { void load(); void loadBlocks(); }
    return () => { sequence.current++; };
  }, [status?.member?.name, route.board, route.mine, load, loadBlocks]);
  useEffect(() => { setNotice(""); }, [route.board, route.mine]);
  useEffect(() => {
    if (!loaded || pendingScroll.current === null) return;
    const y = pendingScroll.current; pendingScroll.current = null;
    const id = requestAnimationFrame(() => scrollTo(0, y));
    return () => cancelAnimationFrame(id);
  }, [loaded, posts.length]);
  const closeEditor = useCallback(() => {
    host.consumeShare?.(); setComposer(null);
    requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : heading.current)?.focus({ preventScroll: true }));
  }, [host]);
  const saved = useCallback(() => {
    closeEditor(); setNotice("저장했어요."); void load();
  }, [closeEditor, load]);
  const leave = async () => {
    if (!client || memberPending.current) return;
    if (!leaving) { setLeaving(true); return; }
    memberPending.current = true; setMemberBusy(true);
    try {
      const result = await client.leave();
      if (failed(result)) { setNotice(result.message || "나가지 못했어요."); return; }
      setLeaving(false); setPosts([]); setStatus(s => s ? { ...s, member: null } : s);
      setNotice("커뮤니티에서 나갔어요. 내 글과 사진을 모두 지웠어요.");
    } catch { setNotice("나가지 못했어요. 다시 시도해 주세요."); }
    finally { memberPending.current = false; setMemberBusy(false); }
  };

  return <section className="cm" data-react-community>
    <Top host={host} status={status} />
    <nav className="cm-boards" aria-label="게시판">{COMMUNITY_BOARDS.map((item: { id: Board; label: string }) => <a key={item.id} href={communityHref(item.id, route.mine)} aria-current={route.board === item.id ? "page" : undefined} onClick={event => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(item.id, route.mine);
    }}>{item.label}</a>)}</nav>
    <h1 tabIndex={-1} ref={heading}>{config?.label || "게시판을 찾지 못했어요"}</h1>
    {route.board === "sale" ? <p className="cm-small cm-board-intro">회원이 직접 찾은 세일 정보예요. 가격·재고·기간은 작성자 제보를 확인해 주세요.</p> : route.board === "free" ? <p className="cm-small cm-board-intro">옷과 쇼핑에 관해 편하게 이야기해요.</p> : null}
    {notice ? <p className="cm-notice" role="status">{notice}</p> : null}
    {!config ? <p className="cm-empty">위에서 게시판을 골라 주세요.</p> : fail ? <Closed fail={fail} /> : !status || !client ? <p role="status" className="cm-small">불러오는 중이에요…</p> : !status.signedIn ? <SignIn status={status} client={client} signedIn={() => {
      setNotice("로그인했어요. 이제 이름을 정해 가입해 주세요.");
      client.status().then(result => failed(result) ? setFail(result) : setStatus(result));
    }} beforeSignIn={rememberEntry} /> : !status.member ? <Join status={status} client={client} done={setStatus} /> : <>
      <div className="cm-bar"><button type="button" className="btn go" onClick={event => { opener.current = event.currentTarget; setComposer({ board: route.board! }); }}>{config.action}</button>
        <div className="cm-seg" role="group" aria-label="보기"><button type="button" aria-pressed={!route.mine} onClick={() => navigate(route.board!, false)}>전체</button><button type="button" aria-pressed={route.mine} onClick={() => navigate(route.board!, true)}>내 글</button></div>
      </div>
      {loading ? <p role="status" className="cm-small">목록을 불러오는 중이에요…</p> : null}
      {listError ? <div className="cm-list-error"><p role="alert">{listError}</p><button type="button" className="btn line" disabled={loading} onClick={() => void load()}>다시 불러오기</button></div> : null}
      {loaded && !posts.length && !listError && !loading ? <p className="cm-empty">{route.mine ? route.board === "outfits" ? "아직 올린 코디가 없어요" : "아직 작성한 글이 없어요" : config.empty}</p> : null}
      <div className="cm-feed" data-board={route.board}>{posts.map(post => <PostCard key={post.id} post={post} status={status} client={client} notify={setNotice}
        edit={value => { opener.current = document.activeElement as HTMLElement; setComposer({ board: route.board!, post: value }); }}
        onGone={id => setPosts(list => list.filter(old => old.id !== id))} blocked={() => { void load(); void loadBlocks(); }} />)}</div>
      {next ? <button type="button" className="btn line cm-more" disabled={loading} onClick={() => void load(next)}>더 보기</button> : null}
      <footer className="cm-foot"><p className="cm-small">{status.member.name}님으로 쓰고 있어요.</p>
        {blockList.length ? <button type="button" className="quiet" aria-expanded={showBlocks} onClick={() => setShowBlocks(!showBlocks)}>차단한 회원 {blockList.length}명</button> : null}
        {showBlocks ? <ul className="cm-blocks">{blockList.map(block => <li key={block.key}>{block.name}<button type="button" className="quiet" disabled={memberBusy} onClick={async () => {
          if (memberPending.current) return; memberPending.current = true; setMemberBusy(true);
          try { const result = await client.unblock(block.key); if (failed(result)) setNotice(result.message || "차단을 풀지 못했어요."); else { await loadBlocks(); await load(); } }
          catch { setNotice("차단을 풀지 못했어요. 다시 시도해 주세요."); }
          finally { memberPending.current = false; setMemberBusy(false); }
        }}>풀기</button></li>)}</ul> : null}
        <button type="button" className="quiet" disabled={memberBusy} onClick={() => void leave()}>{leaving ? "한 번 더 누르면 내 글·사진을 모두 지우고 나가요" : "커뮤니티 나가기"}</button>
      </footer>
      {status.isOperator ? <Review client={client} /> : null}
      {composer ? <PostEditor key={`${composer.board}:${composer.post?.id || "new"}`} host={host} client={client} board={composer.board} post={composer.post} initial={composer.pieces} guard={registerGuard} close={closeEditor} saved={saved} /> : null}
    </>}
  </section>;
}
