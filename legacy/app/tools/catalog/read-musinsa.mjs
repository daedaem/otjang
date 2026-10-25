// 개인 프로젝트용 소량 수집 도구. 요청 사이에 간격을 두고, 공개 상품 페이지의 구조화 데이터만 읽는다.
// 사용: node read-musinsa.mjs curation.json snapshot.json  (curation의 상품 번호마다 이름·브랜드·가격·평점·이미지를 읽는다)
import { chromium } from 'playwright';
import fs from 'node:fs';
const ids = Object.keys(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))); const out = process.argv[3];
const res = fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
const ctx = await b.newContext({locale:'ko-KR', userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'});
await ctx.route('**/*', r => ['image','media','font'].includes(r.request().resourceType()) ? r.abort() : r.continue());
for (const id of ids) {
  if (res[id]?.name) continue;
  for (let attempt=0; attempt<3; attempt++) {
    const p = await ctx.newPage();
    try {
      await p.goto(`https://www.musinsa.com/products/${id}`,{waitUntil:'domcontentloaded',timeout:40000});
      await p.waitForSelector('script[type="application/ld+json"]',{state:'attached',timeout:15000});
      const d = await p.evaluate(()=>{ const ld=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{return JSON.parse(s.textContent)}catch{return null}}).find(x=>x&&x['@type']==='Product');
        const og=document.querySelector('meta[property="og:title"]')?.content||''; const txt=document.body.innerText; const gender=(txt.match(/성별\n([^\n]+)/)||[])[1]||'';
        return ld ? {name:ld.name, brand:ld.brand?.name, image:ld.image, price:ld.offers?.price, availability:ld.offers?.availability, rating:ld.aggregateRating?.ratingValue, reviews:ld.aggregateRating?.reviewCount, ogTitle:og, gender} : null; });
      if (!d) throw new Error('no ld');
      res[id] = {...d, checkedAt: new Date().toISOString().slice(0,10)}; console.log(id, d.brand, d.name?.slice(0,40), d.price); await p.close(); break;
    } catch(e){ console.log(id,'ERR',attempt,e.message.slice(0,60)); await p.close().catch(()=>{}); await sleep(25000*(attempt+1)); }
  }
  fs.writeFileSync(out, JSON.stringify(res,null,1));
  await sleep(7000);
}
await b.close();
