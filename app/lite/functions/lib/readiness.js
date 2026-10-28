// Owner-only route: the Worker gate authorizes before entering this handler.
// Never return environment values, database rows, credentials or error text.
import { memberLoginOptions } from "./member-session.js";
import { publicMissing } from "../api/community.js";
import { MODEL } from "../api/rank.js";

const HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};
const dbReady = (db) => !!db && typeof db.prepare === "function";
const present = (value) => typeof value === "string" && value.trim().length > 0;
async function readDb(db) {
  if (!dbReady(db)) return "missing";
  let timer;
  try {
    const row = await Promise.race([
      db.prepare("SELECT 1 AS ok").first(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("timeout")), 2000);
      }),
    ]);
    return row?.ok === 1 ? "ok" : "failed";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
async function buildInfo(request, env) {
  try {
    const result = await env.ASSETS.fetch(
      new Request(new URL("/build-info.json", request.url)),
    );
    const text = await result.text();
    if (!result.ok || text.length > 2000) return null;
    const info = JSON.parse(text);
    return typeof info.commit === "string" && /^[a-f0-9]{40}$/.test(info.commit)
      ? info.commit
      : null;
  } catch {
    return null;
  }
}
export async function readinessSnapshot(request, env) {
  const probe = new URL(request.url).searchParams.get("probe") === "1";
  const dbs = {
    budget: env.RANK_DB || env.CROWD_DB,
    members: env.COMMUNITY_DB || env.CROWD_DB,
    community: env.COMMUNITY_DB || env.CROWD_DB,
  };
  const reads = new Map();
  const databases = Object.fromEntries(
    await Promise.all(
      Object.entries(dbs).map(async ([name, db]) => {
        if (probe && !reads.has(db)) reads.set(db, readDb(db));
        return [
          name,
          {
            configured: dbReady(db),
            read: probe ? await reads.get(db) : "not_checked",
          },
        ];
      }),
    ),
  );
  const login = memberLoginOptions(env);
  return {
    commit: await buildInfo(request, env),
    checkedAt: new Date().toISOString(),
    probe,
    ai: {
      configured: present(env.ANTHROPIC_API_KEY) && dbReady(dbs.budget),
      model: MODEL,
      provider: "not_checked",
    },
    catalog: {
      adpick: present(env.ADPICK_API_KEY),
      rakuten:
        present(env.RAKUTEN_APPLICATION_ID) && present(env.RAKUTEN_ACCESS_KEY),
      provider: "not_checked",
      rights: "not_confirmed",
    },
    invite: {
      enabled: env.MEMBER_APP_MODE === "invite",
      configured: env.MEMBER_APP_MODE === "invite" && dbReady(env.CROWD_DB),
      realSignup: "not_checked",
    },
    login: { ...login, provider: "not_checked" },
    community: {
      mode: ["off", "private", "public"].includes(env.COMMUNITY_MODE)
        ? env.COMMUNITY_MODE
        : "off",
      publicMissing: publicMissing(env),
    },
    databases,
  };
}

export async function handleReadiness(request, env) {
  if (request.method !== "GET")
    return new Response("GET만 받아요.", {
      status: 405,
      headers: { ...HEADERS, Allow: "GET" },
    });
  const snapshot = await readinessSnapshot(request, env);
  if (new URL(request.url).searchParams.get("format") === "json")
    return Response.json(snapshot, { headers: HEADERS });
  const nonce = crypto.randomUUID();
  const initial = JSON.stringify(snapshot).replaceAll("<", "\\u003c");
  const yes = (value) => (value ? "설정 있음 · 실제 응답 미확인" : "설정 필요");
  const rows = [
    ["Claude 추천·상담·사진", yes(snapshot.ai.configured)],
    ["애드픽 상품 검색", yes(snapshot.catalog.adpick)],
    ["라쿠텐 상품 검색", yes(snapshot.catalog.rakuten)],
    ["초대 회원", yes(snapshot.invite.configured)],
    ["카카오 로그인", yes(snapshot.login.kakao)],
    ["Google 로그인", yes(snapshot.login.google)],
    ["이메일 코드 발송", yes(snapshot.login.email)],
  ];
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>운영 점검 · 행잇</title>
  <style nonce="${nonce}">:root{color-scheme:light dark;--bg:#fbfbfa;--fg:#1b1b19;--muted:#55554f;--line:#deded9;--brand:#5b3a24}@media(prefers-color-scheme:dark){:root{--bg:#17171c;--fg:#efefec;--muted:#bbb;--line:#474749;--brand:#d2b69d}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:24px 20px 60px}h1{font-size:28px;line-height:1.3;margin:24px 0 12px}h2{font-size:20px;margin:32px 0 12px}p{color:var(--muted)}a{color:var(--brand)}button,a.button{min-height:48px;padding:12px 18px;display:inline-flex;align-items:center;justify-content:center;font:inherit;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--fg);text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--brand);outline-offset:3px}button:disabled{opacity:.6}dl{margin:0}dl>div{padding:14px 0;border-bottom:1px solid var(--line)}dt{font-weight:600}dd{margin:4px 0;color:var(--muted);overflow-wrap:anywhere}.actions{display:flex;gap:10px;flex-wrap:wrap}label{display:flex;gap:12px;align-items:start;padding:12px 0}input{min-width:24px;min-height:24px}small{display:block;color:var(--muted)}code{overflow-wrap:anywhere}li{margin:10px 0}</style></head><body><main>
  <a href="/">← 앱으로 돌아가기</a><h1>운영 점검</h1><p>본인만 볼 수 있어요. 키·연락처·개인 옷장은 표시하지 않아요. 설정이 있다는 것과 실제 서비스 성공은 따로 확인해요.</p>
  <p>배포 코드 <code>${snapshot.commit || "확인하지 못함"}</code><small>현재 커뮤니티: ${snapshot.community.mode}. 이 화면에서 공개 설정은 바꾸지 않아요.</small></p>
  <h2>서비스 설정</h2><dl>${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl><p>Claude 모델: ${MODEL}. 이 점검은 AI·메일·상품 API를 호출하지 않아요. 토큰·잔액·실제 응답은 확인하지 않았어요.</p>
  <h2>데이터베이스</h2><p>버튼을 누르면 기존 DB에서 SELECT 1만 읽어요. 테이블 생성·변경이나 실제 사용자 자료 조회는 하지 않아요.</p><button id="probe" type="button">DB 연결 확인</button><p id="database" role="status" aria-live="polite">아직 연결 검사를 하지 않았어요.</p>
  <h2>공개 전에 남은 것</h2><ul><li>전용 커뮤니티 DB·운영자/연락처·회원 로그인: <span id="public-missing"></span></li><li>상품의 표시·DB 보관·외부 AI 처리·사진 권리는 각각 확인해야 해요. API 키가 있어도 권한 확인 완료로 표시하지 않아요.</li><li>현재 Open-Meteo 무료 경로는 비상업 시험용이에요. 상업용 조건을 확인하기 전에는 출시 완료가 아니에요.</li><li>실제 가입·메일·소셜 로그인과 실제 폰의 복원은 자동검사로 대신하지 않아요.</li></ul>
  <h2>이 기기의 확인</h2><p>아래 자동 정보는 브라우저 기능 유무예요. 실제 휴대폰 검증 여부는 직접 확인한 항목만 체크해 주세요. 이 화면에서는 기록을 서버나 기기에 저장하지 않아요.</p><button id="device" type="button">기기 기능 확인</button><p id="device-result" role="status" aria-live="polite">아직 확인하지 않았어요.</p>
  <label><input type="checkbox" data-manual="install">실물 폰 홈 화면에서 설치 앱을 다시 열었어요</label><label><input type="checkbox" data-manual="update">옛 화면을 연 채 갱신 후, 모든 탭을 닫고 새 앱에서 백업·거울 화면까지 열었어요</label><label><input type="checkbox" data-manual="restore">시험 계정/브라우저에서 Files·공유로 사진 포함 백업을 받아 복원하고 내용·사진을 대조했어요</label>
  <div class="actions"><button id="report" type="button">점검 결과 파일 받기</button><a class="button" href="/?preview=1#/closet">개인 자료 없는 미리보기</a></div><p>실제 개인 자료로 복원을 시험하지 마세요. 먼저 백업하고 별도 시험 계정/브라우저를 사용하세요. 앱 삭제·사이트 자료 초기화는 필요하지 않아요.</p>
  </main><script nonce="${nonce}">
  let report=${initial};let device=null;
  const names={database:'전용 DB',operator:'운영자 정보',contact:'연락처',login:'회원 로그인'};
  document.querySelector('#public-missing').textContent=report.community.publicMissing.length?report.community.publicMissing.map(k=>names[k]).join(', '):'설정 조건 있음 · 실제 동작/공개 승인 별도';
  document.querySelector('#probe').onclick=async()=>{const b=document.querySelector('#probe'),out=document.querySelector('#database');b.disabled=true;out.textContent='연결을 확인하고 있어요.';try{const r=await fetch('/_private/readiness?format=json&probe=1',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error();report=await r.json();const label={budget:'AI 한도',members:'회원',community:'커뮤니티'},states={ok:'읽기 성공',failed:'연결 확인 실패',missing:'설정 필요',not_checked:'미검사'};out.textContent=Object.entries(report.databases).map(([k,v])=>label[k]+': '+states[v.read]).join(' · ');}catch{out.textContent='확인하지 못했어요. 로그인과 연결을 확인해 주세요.';}finally{b.disabled=false;}};
  document.querySelector('#device').onclick=async()=>{device={secure:window.isSecureContext,installed:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,indexedDB:!!window.indexedDB,serviceWorker:!!navigator.serviceWorker?.controller,fileShare:typeof navigator.share==='function',persistent:null};try{device.persistent=await navigator.storage?.persisted?.()??null;}catch{}document.querySelector('#device-result').textContent='설치 창: '+(device.installed?'예':'아니요')+' · 사진 보관 기능: '+(device.indexedDB?'있음':'없음')+' · 앱 캐시 연결: '+(device.serviceWorker?'있음':'없음')+' · 파일 공유 기능: '+(device.fileShare?'있음':'없음')+' · 지속 보관 허용: '+(device.persistent===null?'미확인':device.persistent?'예':'아니요')+'. 실제 저장·공유·복원 성공은 직접 확인해 주세요.';};
  document.querySelector('#report').onclick=()=>{const manual={};document.querySelectorAll('[data-manual]').forEach(el=>manual[el.dataset.manual]=el.checked?'owner_reported':'not_checked');const data={version:1,generatedAt:new Date().toISOString(),server:report,device,manual,notes:'설정/기능 유무와 실물·외부 서비스 성공은 별개. 개인 자료/키 제외.'};const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='hangit-readiness.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  </script></body></html>`;
  return new Response(html, {
    headers: {
      ...HEADERS,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    },
  });
}
