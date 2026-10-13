// 개인 프로젝트용 소량 수집 도구. 요청 사이에 간격을 두고, 공개 상품 페이지의 구조화 데이터만 읽는다.
// 사용: node search-musinsa.mjs queries.json candidates.json  (queries: [[성별 M|F, 자리 id, 검색어], ...])
import { chromium } from 'playwright';
import fs from 'node:fs';
const qs = JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const out = process.argv[3];
const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await b.newContext({locale:'ko-KR', userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'});
const res = fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):{}; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for (const [gf,slot,kw] of qs) {
  if (res[slot] && res[slot].length) continue;
  for (let attempt=0; attempt<3; attempt++) {
  const p = await ctx.newPage();
  try {
    await p.goto(`https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(kw)}&gf=${gf}`,{waitUntil:'domcontentloaded',timeout:40000});
    await p.waitForTimeout(4500);
    res[slot] = await p.evaluate(()=>{ const seen=new Set(), r=[];
      for (const a of document.querySelectorAll('a[href*="/products/"]')) { const id=(a.href.match(/products\/(\d+)/)||[])[1]; const t=a.innerText.replace(/\s+/g,' ').trim(); if(!id||!t||seen.has(id)) continue; seen.add(id);
        const card=a.closest('div[class*="Item"], li, article')||a.parentElement; r.push({id, text:(card?.innerText||t).replace(/\s+/g,' ').slice(0,140)}); if(r.length>=8) break; }
      return r; });
    console.log(slot, res[slot].length); await p.close(); break;
  } catch(e){ console.log(slot,'ERR',attempt,e.message.slice(0,60)); await p.close().catch(()=>{}); await sleep(30000*(attempt+1)); }
  }
  await sleep(9000);
  fs.writeFileSync(out, JSON.stringify(res,null,1));
}
await b.close();
