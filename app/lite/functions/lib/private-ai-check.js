// A stateless owner tool. Rendering never calls a provider; each explicit action
// uses the existing authenticated gateway and its unchanged shared budget.
import { PRODUCTS } from "../../src/domain/data/products.js";
import { MODEL } from "../api/rank.js";

export const CHECK_CANDIDATES = PRODUCTS.filter(
  (p) =>
    p.slot === "m-oxford" &&
    Number.isFinite(p.price) &&
    p.price > 0 &&
    p.price <= 100000,
)
  .slice(0, 3)
  .map((p) => ({ id: p.id, brand: p.brand, name: p.name, price: p.price }));
const items = CHECK_CANDIDATES.map((p) => ({
  id: p.id,
  closet: "옷장 정보 없음",
}));
export const CHECK_REQUESTS = {
  rank: {
    task: "rank",
    query: "출근용 옥스퍼드 셔츠 10만원 이하",
    items,
    closet: [],
    conditions: ["출근용", "10만원 이하"],
  },
  consult: {
    task: "consult",
    query:
      "옷장 정보 없이 출근용 셔츠를 고르려고 해요. 10만원 이하 후보 하나를 고르고 이유와 구매 전 확인할 점을 알려 주세요.",
    items,
    closet: [],
    conditions: ["출근용", "10만원 이하"],
    history: [],
  },
};
const HEADERS = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

export async function handlePrivateAiCheck(request) {
  if (request.method !== "GET")
    return new Response("GET만 받아요.", {
      status: 405,
      headers: { ...HEADERS, Allow: "GET" },
    });
  const nonce = crypto.randomUUID();
  const seed = JSON.stringify({
    requests: CHECK_REQUESTS,
    candidates: CHECK_CANDIDATES,
  }).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>실제 AI 연결 시험 · 행잇</title>
  <style nonce="${nonce}">:root{color-scheme:light dark;--bg:#fbfbfa;--fg:#1b1b19;--muted:#55554f;--line:#deded9;--brand:#5b3a24}@media(prefers-color-scheme:dark){:root{--bg:#17171c;--fg:#efefec;--muted:#bbb;--line:#474749;--brand:#d2b69d}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:24px 20px 60px}h1{font-size:28px;line-height:1.3;margin:24px 0 12px}h2{font-size:20px;margin:0 0 12px}p,small{color:var(--muted)}a{color:var(--brand)}section{margin:24px 0;padding-top:20px;border-top:1px solid var(--line)}button,input{font:inherit}button{min-height:48px;padding:12px 18px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--fg);cursor:pointer}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--brand);outline-offset:3px}button:disabled{opacity:.55;cursor:default}label{display:flex;gap:12px;align-items:center;margin:14px 0}input[type=checkbox]{width:24px;height:24px;flex:none}input[type=file]{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui}#sample{max-width:180px;max-height:225px;object-fit:contain;display:block;margin:12px 0}</style></head><body><main>
  <a href="/_private/readiness">← 운영 점검</a><h1>실제 AI 연결 시험</h1><p>이 화면은 개인 옷장·대화·사진 보관함을 읽지 않아요. 아래 고정 질문과 직접 고른 시험 사진만 보냅니다. 키는 서버에만 있어요.</p>
  <p>모델: ${MODEL}. 기존 API 크레딧과 앱 한도를 사용해요. 버튼을 누를 때 실제 비용이 생길 수 있어요. 이 페이지에서는 추천·상담·사진을 각1회, 총3회까지 시도하고 자동 재시도하지 않아요.</p><p id="count" role="status">요청 시도 0 / 3</p>
  <section><h2>1. 상품 추천</h2><p>출근용 옥스퍼드 셔츠 10만원 이하. 개인 옷장은 비어 있는 조건으로 보내요. 후보의 가격은 수집 당시 참고값이며 현재 가격·재고를 보장하지 않아요.</p><button type="button" data-test="rank">추천 1회 시험</button><pre id="rank-result" role="status"></pre></section>
  <section><h2>2. 코디 상담</h2><p>같은 후보에서 출근용 셔츠 하나와 구매 전 확인할 점을 물어요. 이전 대화는 보내지 않아요.</p><button type="button" data-test="consult">상담 1회 시험</button><pre id="consult-result" role="status"></pre></section>
  <section><h2>3. 생성 셔츠 사진 분석</h2><p>직접 만든 시험용 옷 사진 한 장만 골라 주세요. 긴 변512px JPEG로 바꿔 Anthropic(Claude)에 보내요. 이 앱의 옷장/사진 보관함이나 서버에 사진을 저장하지 않아요.</p>
  <label><input id="consent" type="checkbox">선택한 시험 사진 한 장을 Anthropic에 보내 분석하는 데 동의해요</label><input id="file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="생성 셔츠 시험 사진"><img id="sample" alt="선택한 시험 사진" hidden><p id="photo-note" role="status">사진과 동의를 확인한 뒤 분석 버튼을 눌러 주세요.</p><button type="button" data-test="photo" disabled>사진 분석 1회 시험</button><pre id="photo-result" role="status"></pre></section>
  <p>결과는 이 페이지의 메모리에만 남아요. 연결 성공이 추천 품질·실제 옷 인식 정확도·실물 폰 검증 완료를 뜻하지 않아요.</p></main>
  <script nonce="${nonce}">
  const seed=${seed},used=new Set(),results={};let busy=false,file=null,objectUrl=null;
  const buttons=[...document.querySelectorAll('[data-test]')],consent=document.querySelector('#consent'),picker=document.querySelector('#file');
  const update=()=>{document.querySelector('#count').textContent='요청 시도 '+used.size+' / 3';for(const b of buttons)b.disabled=busy||used.has(b.dataset.test)||used.size>=3||(b.dataset.test==='photo'&&(!consent.checked||!file));picker.disabled=busy||used.has('photo');consent.disabled=busy||used.has('photo');};
  picker.onchange=()=>{file=picker.files?.[0]||null;const img=document.querySelector('#sample');if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;if(file&&(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)){file=null;picker.value='';document.querySelector('#photo-note').textContent='5MB 이하 PNG/JPEG/WebP 한 장을 골라 주세요.';}else document.querySelector('#photo-note').textContent=file?'사진을 선택했어요. 분석 버튼을 눌러야 전송해요.':'사진과 동의를 확인한 뒤 분석 버튼을 눌러 주세요.';img.hidden=!file;if(file){objectUrl=URL.createObjectURL(file);img.src=objectUrl;}else img.removeAttribute('src');update();};consent.onchange=update;
  async function jpeg(value){const url=URL.createObjectURL(value),img=new Image();try{await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('사진을 읽지 못했어요.'));img.src=url;});if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('시험 사진 크기를 확인해 주세요.');const ratio=Math.min(1,512/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.82).split(',')[1];if(data.length>260000)throw Error('사진을 더 작게 골라 주세요.');return data;}finally{URL.revokeObjectURL(url);}}
  const metadata=value=>{if(!value||typeof value!=='object')return null;const out={};for(const key of ['model','inputTokens','outputTokens','cacheCreationInputTokens','cacheReadInputTokens'])if(typeof value[key]==='string'||typeof value[key]==='number')out[key]=value[key];out.responseIdReturned=typeof value.requestId==='string';out.providerRequestIdReturned=typeof value.providerRequestId==='string';return out;};
  async function run(kind){if(busy||used.has(kind)||used.size>=3||!(kind in seed.requests)&&kind!=='photo'||kind==='photo'&&(!file||!consent.checked))return;used.add(kind);busy=true;update();const out=document.querySelector('#'+kind+'-result');out.textContent='실제 AI 응답을 기다리고 있어요…';try{const body=kind==='photo'?{image:await jpeg(file)}:seed.requests[kind],response=await fetch(kind==='photo'?'/api/garment-photo':'/api/rank',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-hangit-scope':'owner'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)}),value=await response.json().catch(()=>null);const record={http:response.status};if(!response.ok){record.code=value?.code||value?.error||'error';record.message=value?.message||'응답을 받지 못했어요.';}else if(kind==='rank'){record.summary=value.summary;record.ranking=(value.ranking||[]).map(r=>{const p=seed.candidates.find(p=>p.id===r.id);return{id:r.id,brand:p?.brand,name:p?.name,collectedPrice:p?.price,reason:r.reason,fit:r.fit};});record.ai=metadata(value.ai);}else if(kind==='consult'){record.on_topic=value.on_topic;record.answer=value.answer;record.product_ids=value.product_ids;record.price_check=value.price_check;record.ai=metadata(value.ai);}else{record.clothing=value.clothing;record.kind=value.kind;record.color=value.color;record.label=value.label;record.confidence=value.confidence;record.ai=metadata(value.ai);}results[kind]=record;out.textContent=JSON.stringify(record,null,2);}catch(error){out.textContent='요청을 마치지 못했어요. 자동으로 다시 보내지 않아요. '+(error?.name==='TimeoutError'?'응답 시간 초과':error?.message||'연결 확인 필요');}finally{busy=false;update();}}
  for(const button of buttons)button.onclick=()=>run(button.dataset.test);window.addEventListener('pagehide',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);});update();
  </script></body></html>`;
  return new Response(html, {
    headers: {
      ...HEADERS,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
    },
  });
}
