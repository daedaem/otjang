// 검증 카탈로그(data/picks.json)의 가격·재고를 다시 확인하는 운영자 도구. 운영자가 직접 실행할 때만 돈다(자동 실행·예약 없음).
//
//   node tools/recheck.mjs plan [--days 7]          다시 볼 상품 목록(확인한 지 N일 넘은 것)과 볼 곳을 보여 준다. 아무것도 받지 않는다
//   node tools/recheck.mjs fetch [--days 7]         판매처를 열어 가격·재고만 읽고 관측 기록(data/observations/날짜.jsonl)을 덧붙인 뒤 차이를 보여 준다
//                                                   robots.txt 를 먼저 읽고 막힌 주소는 열지 않는다. 이름을 밝힌 UA, 판매처당 10초에 1건, 한 번에 30쪽까지
//   node tools/recheck.mjs apply <관측.jsonl>       관측 기록을 picks.json 에 반영한다(가격·재고·확인일만). 반영 뒤 검사기를 돌린다
//
// 읽는 것: 가격, 사이즈별 재고(또는 상품 재고 여부). 소재·치수·설명은 바꾸지 않는다(사람이 상세를 다시 볼 때만).
// 브라우저로 직접 확인한 값도 같은 관측 형식으로 적어 apply 할 수 있다: {"id","seen","price","currency","inStock","sizes":["S","M"],"via":"browser|fetch","url"}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAT = path.join(root, 'data/picks.json');
const UA = 'EOUL-recheck/0.1 (+https://github.com/daedaem/otjang)';
const today = () => process.env.TODAY || new Date().toISOString().slice(0, 10);
const days = (d, t) => Math.round((Date.parse((t || today()) + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000);

// ---------- 읽기(판매처별). 모두 순수 함수라 시험할 수 있다 ----------
/** robots.txt 에서 User-agent: * 와 우리 UA 묶음의 Disallow/Allow 를 읽어, 경로가 허용되는지 본다(가장 긴 규칙이 이긴다). */
export function robotsAllows(txt, pathname, ua) {
  const groups = []; let cur = null;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
    else if ((k === 'disallow' || k === 'allow') && cur) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const name = String(ua || '').split('/')[0].toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && name.indexOf(a) === 0));
  const use = mine.length ? mine : groups.filter((g) => g.agents.indexOf('*') >= 0);
  let best = null;
  for (const g of use) for (const r of g.rules) {
    if (!r.path) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}
/** HTML 의 JSON-LD 에서 가격·재고(코오롱몰·랄프로렌 등). 사이즈별 재고는 hasVariant 가 있을 때만. */
export function parseJsonLd(html, colorHint) {
  const out = { price: null, inStock: null, sizes: null };
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean);
  const flat = blocks.flatMap((b) => (Array.isArray(b) ? b : b['@graph'] ? b['@graph'] : [b]));
  const prod = flat.find((b) => /Product/.test(b['@type']));
  if (!prod) return out;
  const avail = (o) => (o && o.availability ? /InStock|LimitedAvailability/.test(o.availability) : null);
  if (Array.isArray(prod.hasVariant)) {
    const vs = prod.hasVariant.filter((v) => !colorHint || !v.color || String(v.color).toLowerCase() === String(colorHint).toLowerCase());
    const ins = vs.filter((v) => avail(v.offers)).map((v) => String(v.size || '').trim()).filter(Boolean);
    const prices = vs.map((v) => v.offers && Number(v.offers.price)).filter((x) => x > 0);
    out.sizes = Array.from(new Set(ins)); out.inStock = ins.length > 0; out.price = prices.length ? Math.min(...prices) : null;
  } else {
    const offers = Array.isArray(prod.offers) ? prod.offers : prod.offers ? [prod.offers] : [];
    const prices = offers.map((o) => Number(o.price || o.lowPrice)).filter((x) => x > 0);
    out.price = prices.length ? Math.min(...prices) : null; out.inStock = offers.length ? offers.some(avail) : null;
  }
  return out;
}
/** Shopify 상품 JSON(/products/<handle>.js): 흰색 변형의 가격(센트)·재고. */
export function parseShopify(js, colorHint) {
  const p = typeof js === 'string' ? JSON.parse(js) : js;
  const vs = (p.variants || []).filter((v) => !colorHint || [v.option1, v.option2, v.option3].some((o) => o && String(o).toLowerCase() === String(colorHint).toLowerCase()));
  const sizeOf = (v) => [v.option1, v.option2, v.option3].find((o) => o && !(colorHint && String(o).toLowerCase() === String(colorHint).toLowerCase())) || v.title;
  const ins = vs.filter((v) => v.available).map(sizeOf);
  const prices = vs.map((v) => Number(v.price) / 100).filter((x) => x > 0);
  return { price: prices.length ? Math.min(...prices) : null, inStock: vs.length ? ins.length > 0 : null, sizes: vs.length ? Array.from(new Set(ins)) : null };
}
/** 유니클로 가격·재고 자료(price-groups/00/l2s): 한 색의 사이즈별 재고와 가격. */
export function parseUniqlo(json, colorCode) {
  const res = (typeof json === 'string' ? JSON.parse(json) : json).result || {};
  const map = { '001': 'XXS', '002': 'XS', '003': 'S', '004': 'M', '005': 'L', '006': 'XL', '007': 'XXL', '008': '3XL', '009': '4XL' };
  const l2 = (res.l2s || []).filter((x) => x.color && x.color.displayCode === (colorCode || '00'));
  const ins = l2.filter((x) => res.stocks && res.stocks[x.l2Id] && /IN_STOCK|LOW_STOCK/.test(res.stocks[x.l2Id].statusCode)).map((x) => map[x.size.displayCode] || x.size.displayCode);
  const prices = l2.map((x) => res.prices && res.prices[x.l2Id] && res.prices[x.l2Id].base && Number(res.prices[x.l2Id].base.value)).filter((x) => x > 0);
  return { price: prices.length ? Math.min(...prices) : null, inStock: l2.length ? ins.length > 0 : null, sizes: l2.length ? ins : null };
}
/** 판매처 종류와 읽을 주소. */
export function sourceFor(p) {
  const u = new URL(p.store.url);
  if (/uniqlo\.com$/.test(u.hostname)) { const m = /products\/(E\d+-\d+)/.exec(u.pathname); const c = u.searchParams.get('colorDisplayCode') || '00'; return m ? { kind: 'uniqlo', host: u.origin, url: u.origin + '/kr/api/commerce/v5/ko/products/' + m[1] + '/price-groups/00/l2s?withPrices=true&withStocks=true&includePreviousPrice=false&httpFailure=true', color: c } : null; }
  if (/bronsonshop\.com$|levi\.co\.kr$/.test(u.hostname)) { const m = /\/products\/([^/?#]+)/.exec(u.pathname); return m ? { kind: 'shopify', host: u.origin, url: u.origin + '/products/' + m[1] + '.js', color: /levi/.test(u.hostname) ? null : 'White' } : null; }
  return { kind: 'jsonld', host: u.origin, url: p.store.url, color: u.searchParams.get(Array.from(u.searchParams.keys()).find((k) => /colorname/.test(k)) || '') || null };
}
/** 관측 하나와 카탈로그 상품의 차이(사람이 읽는 줄). */
export function diffOf(p, o) {
  const d = [];
  if (o.price != null && o.price !== p.price) d.push('가격 ' + p.price + ' → ' + o.price + ' ' + (o.currency || p.currency));
  if (o.inStock != null && p.stock && o.inStock !== p.stock.inStock) d.push('재고 ' + p.stock.inStock + ' → ' + o.inStock);
  if (Array.isArray(o.sizes) && p.stock && Array.isArray(p.stock.sizes)) { const a = p.stock.sizes.join(','), b = o.sizes.join(','); if (a !== b) d.push('사이즈별 재고 ' + (a || '없음') + ' → ' + (b || '없음')); }
  return d;
}
/** 관측을 카탈로그에 반영한다(가격·재고·확인일·근거 확인일만). 반환: { catalog, changes: [{id, diff}] } */
export function applyObservations(cat, obs) {
  const c = JSON.parse(JSON.stringify(cat)), changes = [];
  for (const o of obs) {
    const p = c.products.find((x) => x.id === o.id); if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(o.seen || '')) continue;
    if (o.currency && o.currency !== p.currency) { changes.push({ id: p.id, diff: ['통화가 달라 반영하지 않음(' + o.currency + ')'] }); continue; }
    const diff = diffOf(p, o);
    if (o.price != null) { if (p.listPrice != null && o.price >= p.listPrice) delete p.listPrice; p.price = o.price; }
    if (!p.stock) p.stock = {};
    if (o.inStock != null) p.stock.inStock = o.inStock;
    if (Array.isArray(o.sizes)) p.stock.sizes = p.offered ? o.sizes.filter((s) => p.offered.indexOf(s) >= 0) : o.sizes;
    p.stock.checkedAt = o.seen; p.checkedAt = o.seen;
    if (p.evidence && p.evidence[0]) p.evidence[0].seen = o.seen;
    changes.push({ id: p.id, diff });
  }
  return { catalog: c, changes };
}

// ---------- 실행 ----------
async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const cat = JSON.parse(fs.readFileSync(CAT, 'utf8'));
  const due = cat.products.filter((p) => days(p.checkedAt) > opt('days', 7));
  if (cmd === 'plan' || !cmd) {
    console.log('확인한 지 ' + opt('days', 7) + '일 넘은 상품 ' + due.length + '개 / 전체 ' + cat.products.length + '개');
    for (const p of due) { const s = sourceFor(p); console.log('  ' + p.id + ' (' + days(p.checkedAt) + '일) ' + (s ? s.kind + ' ' + s.url : '읽는 법 없음 — 브라우저로 확인') ); }
    console.log('브라우저로 확인했다면 관측 형식으로 적어 `node tools/recheck.mjs apply 파일` 로 반영하세요.');
    return;
  }
  if (cmd === 'apply') {
    if (!arg) throw new Error('관측 파일을 주세요');
    const obs = fs.readFileSync(arg, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const { catalog, changes } = applyObservations(cat, obs);
    for (const c of changes) console.log('  ' + c.id + ': ' + (c.diff.length ? c.diff.join(', ') : '바뀐 것 없음(확인일만 갱신)'));
    const { validate } = await import('./validate-catalog.mjs');
    const v = validate(catalog, today());
    if (v.errors.length) { console.log('반영하지 않음 — 검사기 오류:\n  ' + v.errors.join('\n  ')); process.exit(1); }
    catalog.updatedAt = today(); fs.writeFileSync(CAT, JSON.stringify(catalog, null, 1) + '\n'); console.log('반영함: ' + changes.length + '개');
    return;
  }
  if (cmd === 'fetch') {
    const outDir = path.join(root, 'data/observations'); fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, today() + '.jsonl'), robots = new Map(), last = new Map(), obs = [];
    for (const p of due.slice(0, 30)) {
      const s = sourceFor(p); if (!s) { console.log('  ' + p.id + ': 읽는 법 없음'); continue; }
      if (!robots.has(s.host)) robots.set(s.host, await fetch(s.host + '/robots.txt', { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.text() : ''), () => null));
      const rb = robots.get(s.host); const u = new URL(s.url);
      if (rb === null) { console.log('  ' + p.id + ': robots.txt 를 못 읽어 건너뜀'); continue; }
      if (!robotsAllows(rb, u.pathname + u.search, UA)) { console.log('  ' + p.id + ': robots.txt 가 막는 주소라 건너뜀 — 브라우저로 확인'); continue; }
      const wait = 10000 - (Date.now() - (last.get(s.host) || 0)); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last.set(s.host, Date.now());
      try {
        const body = await fetch(s.url, { headers: { 'User-Agent': UA, Accept: s.kind === 'jsonld' ? 'text/html' : 'application/json' } }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
        const r = s.kind === 'uniqlo' ? parseUniqlo(body, s.color) : s.kind === 'shopify' ? parseShopify(body, s.color) : parseJsonLd(body, s.color);
        if (r.price == null && r.inStock == null) { console.log('  ' + p.id + ': 값을 못 읽음 — 브라우저로 확인'); continue; }
        const o = { id: p.id, seen: today(), price: r.price, currency: p.currency, inStock: r.inStock, sizes: r.sizes, via: 'fetch', url: s.url };
        obs.push(o); fs.appendFileSync(out, JSON.stringify(o) + '\n');
        const d = diffOf(p, o); console.log('  ' + p.id + ': ' + (d.length ? d.join(', ') : '같음'));
      } catch (e) { console.log('  ' + p.id + ': 못 읽음(' + e.message + ') — 브라우저로 확인'); }
    }
    console.log(obs.length ? '관측 ' + obs.length + '개를 ' + path.relative(root, out) + ' 에 적음. 확인 뒤 `node tools/recheck.mjs apply ' + path.relative(root, out) + '`' : '읽은 것이 없음');
    return;
  }
  throw new Error('plan | fetch | apply <파일>');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e.message); process.exit(1); });
