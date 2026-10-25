// 개인 프로젝트용 소량 수집 도구: 브랜드(또는 "브랜드|아이템")로 무신사를 검색해 목록 화면의 상품 정보를 읽는다. 요청 사이에 간격을 둔다.
// 사용: node scan-brands.mjs brand-queries.json raw.json   (brand-queries: [[M|F, "브랜드" 또는 "브랜드|아이템"], ...])
import { chromium } from 'playwright';
import fs from 'node:fs';
const brands = JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const out = process.argv[3];
const res = fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await b.newContext({locale:'ko-KR', userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'});
await ctx.route('**/*', r => ['media','font'].includes(r.request().resourceType()) || /doubleclick|google-analytics|googletagmanager|amplitude|maze\.co|madup/.test(r.request().url()) ? r.abort() : r.continue());
for (const [gf, kw] of brands) {
  const key = gf+':'+kw; if (res[key]?.length) continue;
  for (let attempt=0; attempt<3; attempt++) {
    const p = await ctx.newPage();
    try {
      await p.goto(`https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(kw.replace('|', ' '))}&gf=${gf}`,{waitUntil:'domcontentloaded',timeout:40000});
      await p.waitForSelector('a[data-item-id] img',{timeout:20000});
      for (let i=0;i<7;i++){ await p.mouse.wheel(0,2600); await p.waitForTimeout(700); }
      const items = await p.evaluate(()=>{ const out=[]; const seen=new Set();
        for (const a of document.querySelectorAll('a[data-item-id]')) { const id=a.dataset.itemId; if(seen.has(id)) continue; const img=a.querySelector('img'); if(!img) continue; seen.add(id);
          let c=a; while(c.parentElement && !/\d원/.test(c.parentElement.innerText||'')) c=c.parentElement; c=c.parentElement||c;
          out.push({id, price:+a.dataset.price, orig:+a.dataset.originalPrice, slug:a.dataset.itemBrand, name:img.alt, img:img.src, text:c.innerText.replace(/\s+/g,' ').slice(0,200)}); }
        return out; });
      res[key] = items; console.log(key, items.length); await p.close(); break;
    } catch(e){ console.log(key,'ERR',attempt,e.message.slice(0,60)); await p.close().catch(()=>{}); await sleep(30000*(attempt+1)); }
  }
  fs.writeFileSync(out, JSON.stringify(res));
  await sleep(8000);
}
await b.close();
console.log('BRANDSCAN_DONE');
