#!/usr/bin/env node
/**
 * bench.mjs — "같은 과제" UX 벤치마크 측정 스크립트 (어울 목업 재측정용으로 재사용)
 *
 * 과제: T1 검색 → T2 결과 첫 화면 → T3 첫 상품(PDP) + 뒤로가기 스크롤 복원 → T4 빈 결과 → T5 결정 보조 요소
 *
 * 사용법
 *   node bench.mjs                                  # 내장 4개 사이트 × mobile,pc
 *   node bench.mjs --sites 29cm,ssense --viewports mobile
 *   node bench.mjs --config ./oul.config.mjs        # 외부 사이트 설정(목업 등) 실행
 *   node bench.mjs --contact                        # shots/ 썸네일로 contact.png 생성만
 *   옵션: --out <dir> (기본: 이 파일 폴더)  --skip back,empty  --headful
 *
 * 외부 설정 파일(--config) 형식: export default [ siteConfig, ... ]  (siteConfig 필드는 아래 SITES 주석 참고)
 *   목업 예시 (file:// + 해시 라우팅):
 *   export default [{
 *     id:'oul-draft-a', name:'어울 시안 A', locale:'ko-KR',
 *     home:'file:///abs/path/index.html#/',
 *     query:'셔츠', emptyQueries:['zxqvbn','반바지셔츠코트'],
 *     searchUrl:q=>`file:///abs/path/index.html#/search?q=${encodeURIComponent(q)}`,
 *     productHref:/#\/product\/[\w-]+/,                        // 상품 링크 판별(RegExp, a.href 기준)
 *     uiSearch: async ({page,q,tap,submit})=>{ await tap('[data-bench=search-open]','검색 열기');
 *                 await page.fill('[data-bench=search-input]',q); await submit(); },
 *     selectors:{ card:'[data-bench=card]', cardBrand:'[data-bench=brand]', cardName:'[data-bench=name]',
 *                 cardPrice:'[data-bench=price]', pdpCta:'[data-bench=cta]', pdpPrice:'[data-bench=pdp-price]',
 *                 pdpBrand:'[data-bench=pdp-brand]', pdpGallery:'[data-bench=gallery] img', filter:'[data-bench=filter]' },
 *   }];
 *   selectors를 주면 휴리스틱 대신 그 셀렉터로 측정한다(권장: 목업에 data-bench 속성 달기).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PW = process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs';
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = await import(PW);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const OUT = path.resolve(args.out || HERE);
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  pc: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
};

/* ------------------------------------------------------------------ *
 * 사이트 설정
 *  id, name, locale, home            시작 페이지
 *  start(vp)                         (선택) 홈 대신 시작할 URL과 사유 {url, note}
 *  query, emptyQueries               검색어 / 빈 결과용 검색어
 *  searchUrl(q, vp)                  결과 URL (UI 검색 실패 시 대체 경로, 빈 결과 측정에 사용)
 *  uiSearch({page,q,vp,tap,submit})  사이트 검색 UI 조작. tap(selector|locator,label)·submit()이 탭 수를 센다
 *  productHref                       상품 링크 RegExp (a.href에 test)
 *  consent / dismiss                 쿠키 배너(보기 위해 꼭 필요할 때만) / 화면을 가리는 모달 닫기 셀렉터
 *  selectors                         휴리스틱 대신 쓸 셀렉터(card, cardImage, cardBrand, cardName, cardPrice,
 *                                    filter, pdpGallery, pdpBrand, pdpName, pdpPrice, pdpCta, pdpSize)
 *  isBlocked({status,url})           봇 차단 등으로 결과가 막혔는지 판정
 * ------------------------------------------------------------------ */
export const SITES = [
  {
    id: 'musinsa', name: '무신사', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    home: 'https://www.musinsa.com/',
    // 해외 IP(측정 환경)에서 홈(/)은 global.musinsa.com/choose-location 으로 리다이렉트된다 → 결과는 전체 검색 URL로 직접 진입.
    // 한국 IP에서 다시 잴 때는 searchMode를 지우면 uiSearch(헤더 검색 버튼)로 측정한다.
    searchMode: 'url',
    refNotes: [
      '홈(https://www.musinsa.com/)은 측정 환경(해외 IP)에서 global.musinsa.com/choose-location 으로 리다이렉트됨 → 홈에서 시작하는 검색 탭 수는 확인 못 함',
      '참고 측정(2026-10-19 탐색): 카테고리 페이지(상의) 헤더 검색 버튼(28×28) → 입력 → 엔터 = 2탭이지만, 이 경로는 "상의 안 검색"(/category/001/goods?keyword=셔츠)이 되어 전체 검색과 다름. 그래서 결과·상세는 전체 검색 URL(/search/goods?keyword=셔츠)로 직접 진입해 측정',
      '모바일 웹 상품 링크는 target=_blank(새 탭) — 결과 탭은 그대로 남는다',
    ],
    query: '셔츠', emptyQueries: ['zxqvbn', '반바지셔츠코트'],
    searchUrl: q => `https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(q)}`,
    productHref: /musinsa\.com\/products\/\d+/,
    uiSearch: async ({ page, q, vp, tap, submit }) => {
      const btn = page.locator('button[aria-label="검색창"], button[aria-label*="검색"]').first();
      await tap(btn, '헤더 검색 버튼');
      await page.waitForTimeout(1500);
      const inp = page.locator('input[type="search"]:visible, input[type="text"]:visible').first();
      await inp.fill(q);
      await submit();
    },
    dismiss: [],
  },
  {
    id: '29cm', name: '29CM', locale: 'ko-KR', timezoneId: 'Asia/Seoul',
    home: 'https://www.29cm.co.kr/',
    query: '셔츠', emptyQueries: ['zxqvbn', '반바지셔츠코트'],
    searchUrl: q => `https://www.29cm.co.kr/store/search?keyword=${encodeURIComponent(q)}`,
    productHref: /product\.29cm\.co\.kr\/catalog\/\d+/,
    uiSearch: async ({ page, q, vp, tap, submit }) => {
      // 모바일: 상단 돋보기(헤더) / PC: 상단 검색 버튼 또는 입력창
      const icon = page.locator('header a[href="/"]:has(svg), header button:has-text("검색"), a[href*="/store/search/start"], header a:has-text("SEARCH"), header button[aria-label*="검색"]');
      const n = await icon.count();
      let clicked = false;
      for (let i = 0; i < n && !clicked; i++) { const l = icon.nth(i); if (await l.isVisible()) { await tap(l, '검색 아이콘'); clicked = true; } }
      if (!clicked) throw new Error('29CM 검색 아이콘 못 찾음');
      await page.waitForTimeout(1500);
      const inp = page.locator('input:visible').first();
      await inp.click(); await inp.fill(q);
      await submit();
    },
  },
  {
    id: 'zalando', name: 'Zalando UK', locale: 'en-GB', timezoneId: 'Europe/London',
    home: 'https://www.zalando.co.uk/',
    query: 'shirt', emptyQueries: ['zxqvbn'],
    searchUrl: q => `https://www.zalando.co.uk/catalog/?q=${encodeURIComponent(q)}`,
    productHref: /zalando\.co\.uk\/[a-z0-9-]+-[a-z0-9]{9}-[a-z0-9]{3}\.html/i,
    consent: [{ role: 'button', name: /only essential/i }],
    uiSearch: async ({ page, q, tap, submit }) => {
      const inp = page.locator('#header-search-input');
      await tap(inp, '검색 입력창');
      await inp.fill(q);
      await submit();
    },
    isBlocked: ({ status, url }) => status >= 400 || /supported-browsers/.test(url),
  },
  {
    id: 'ssense', name: 'SSENSE', locale: 'en-US', timezoneId: 'America/New_York',
    home: 'https://www.ssense.com/en-us',
    query: 'shirt', emptyQueries: ['zxqvbn'],
    // SSENSE 검색은 성별 범위(기본 MENSWEAR)에 묶인다 → /en-us/men?q=
    searchUrl: q => `https://www.ssense.com/en-us/men?q=${encodeURIComponent(q)}`,
    productHref: /ssense\.com\/en-us\/[a-z-]+\/product\/[^/]+\/[^/]+\/\d+/,
    uiSearch: async ({ page, q, vp, tap, submit }) => {
      const icon = vp === 'mobile' ? page.locator('a.mobile-header-search') : page.locator('header a:has-text("Search"), header button:has-text("Search"), [data-test*=search] a, a[href="#"]:has-text("Search")');
      let clicked = false; const n = await icon.count();
      for (let i = 0; i < n && !clicked; i++) { const l = icon.nth(i); if (await l.isVisible()) { await tap(l, '검색 아이콘'); clicked = true; } }
      if (!clicked) throw new Error('SSENSE 검색 아이콘 못 찾음');
      await page.waitForTimeout(1200);
      const inp = page.locator('input[type="search"]:visible').first();
      await inp.fill(q);
      await submit();
    },
  },
];

/* ------------------------------------------------------------------ *
 * 페이지 안에서 실행되는 측정 라이브러리
 * ------------------------------------------------------------------ */
function PAGE_LIB() {
  if (window.__bench) return;
  const B = {};
  const PRICE = /^(?:[₩£$€]|US\$|CA\$)\s?\d[\d,.]*|^\d{1,3}(?:,\d{3})+(?:\s*원)?$|^\d[\d,]*\s*원$|^\d+(?:[.,]\d{2})?\s?[£€]$/;
  const DISCOUNT = /^-?\d{1,2}\s?%/;
  B.PRICE = PRICE; B.DISCOUNT = DISCOUNT;
  B.vis = el => {
    if (!el || !el.getBoundingClientRect) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  B.r = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), pageY: Math.round(r.top + B.scrollY()) }; };
  B.scroller = () => {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > innerHeight + 50) return se;
    // 내부 스크롤 컨테이너(바디 대신 div가 스크롤하는 앱형 레이아웃)
    let best = null, bh = 0;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > innerHeight * 0.5 && el.scrollHeight > bh) { best = el; bh = el.scrollHeight; }
    }
    return best || se;
  };
  B.scrollY = () => { const s = B.scroller(); return s === document.scrollingElement || s === document.documentElement ? window.scrollY : s.scrollTop; };
  B.scrollTo = y => { const s = B.scroller(); if (s === document.scrollingElement || s === document.documentElement) window.scrollTo(0, y); else s.scrollTop = y; return B.scrollY(); };
  B.pageHeight = () => { const s = B.scroller(); return Math.round(s.scrollHeight); };
  B.fixedAnc = el => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === 'fixed' || p === 'sticky') return p;
    }
    return null;
  };
  B.ownText = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  B.leaves = (root, opt = {}) => {
    const out = []; const seen = new Set();
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode; if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
      if (!B.vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.clip && cs.clip !== 'auto' && /rect\(0/.test(cs.clip)) continue;
      out.push({ el, text: B.ownText(el).slice(0, 90), fs: parseFloat(cs.fontSize), fw: +cs.fontWeight || cs.fontWeight, color: cs.color,
        strike: /line-through/.test(cs.textDecorationLine) || !!el.closest('del,s,strike'),
        x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), pageY: Math.round(r.top + B.scrollY()) });
    }
    return out;
  };
  B.minFont = (onlyViewport) => {
    let min = null;
    for (const l of B.leaves(document.body)) {
      if (onlyViewport && (l.y + l.h <= 0 || l.y >= innerHeight || l.x >= innerWidth || l.x + l.w <= 0)) continue;
      if (!l.fs) continue;
      if (!min || l.fs < min.fs) min = { fs: l.fs, text: l.text.slice(0, 30) };
    }
    return min;
  };
  B.overflowX = () => Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - innerWidth;
  B.fixedBars = () => {
    let top = 0, bottom = 0; const items = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!B.vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.85 || r.height > innerHeight * 0.4) continue;
      if (r.top <= 2 && r.bottom > 0) { top = Math.max(top, r.bottom); items.push({ at: 'top', h: Math.round(r.height), pos: cs.position }); }
      else if (r.bottom >= innerHeight - 2 && r.top < innerHeight) { bottom = Math.max(bottom, innerHeight - r.top); items.push({ at: 'bottom', h: Math.round(r.height), pos: cs.position }); }
    }
    return { top: Math.round(top), bottom: Math.round(bottom), items: items.slice(0, 6) };
  };
  // onScreenX=true: 화면 밖(오프캔버스 메뉴 등)에 숨은 요소는 뺀다
  B.clickables = (onScreenX = true) => [...document.querySelectorAll('a,button,[role=button],[role=tab],select,label,summary,input[type=button],input[type=submit],[tabindex]')].filter(e => { if (!B.vis(e)) return false; if (!onScreenX) return true; const r = e.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; });
  B.label = el => {
    if (el.tagName === 'SELECT') return ((el.getAttribute('aria-label') || '') + ' ' + ((el.selectedOptions && el.selectedOptions[0] && el.selectedOptions[0].text) || '')).replace(/\s+/g, ' ').trim();
    return ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.value || '')).replace(/\s+/g, ' ').trim();
  };

  /* ---------- 결과 화면 ---------- */
  B.cards = (hrefSrc, sel) => {
    let cards;
    const re = new RegExp(hrefSrc, 'i');
    const keyOf = a => { const m = a.href.match(re); return m ? m[0] : a.href; };
    if (sel && sel.card) cards = [...document.querySelectorAll(sel.card)].filter(B.vis);
    else {
      const anchors = [...document.querySelectorAll('a[href]')].filter(a => re.test(a.href));
      const map = new Map();
      for (const a of anchors) {
        const k = keyOf(a); if (map.has(k)) continue;
        let el = a;
        while (el.parentElement && el.parentElement !== document.body) {
          const p = el.parentElement;
          const ks = new Set([...p.querySelectorAll('a[href]')].filter(x => re.test(x.href)).map(keyOf));
          if (ks.size > 1) break;
          el = p;
        }
        if (B.vis(el)) map.set(k, el);
      }
      cards = [...map.values()];
    }
    cards = cards.filter(c => c.querySelector('img,picture,video,[style*="background-image"]') && c.getBoundingClientRect().width > 60);
    // 주 그리드 = 같은 폭 카드가 가장 많은 그룹
    const groups = new Map();
    for (const c of cards) { const w = Math.round(c.getBoundingClientRect().width / 6) * 6; if (!groups.has(w)) groups.set(w, []); groups.get(w).push(c); }
    let main = [];
    for (const g of groups.values()) if (g.length > main.length) main = g;
    main.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); });
    return { all: cards.length, main };
  };
  B.cardImage = (card, sel) => {
    if (sel && sel.cardImage) { const e = card.querySelector(sel.cardImage); if (e) return e; }
    let best = null, ba = 0;
    for (const e of card.querySelectorAll('img,video,picture,[style*="background-image"]')) {
      const r = e.getBoundingClientRect(); const a = r.width * r.height;
      if (a > ba) { ba = a; best = e; }
    }
    return best;
  };
  B.pick = (card, s) => { if (!s) return null; const e = card.querySelector(s); return e ? { text: (e.innerText || '').trim().slice(0, 60), fs: parseFloat(getComputedStyle(e).fontSize), fw: getComputedStyle(e).fontWeight } : null; };
  B.measureResults = (cfg) => {
    const sel = cfg.selectors || {};
    const vh = innerHeight, vw = innerWidth;
    const { all, main } = B.cards(cfg.productHref, sel);
    window.__benchCards = main;
    const bars = B.fixedBars();
    const res = { url: location.href, vw, vh, cardsDetected: all, mainGridCards: main.length, fixedBars: bars };
    if (!main.length) return res;
    const R = main.map(c => c.getBoundingClientRect());
    const firstTop = R[0].top;
    const row1 = R.filter(r => Math.abs(r.top - firstTop) < 8);
    res.columns = row1.length;
    res.cardWidth = Math.round(R[0].width);
    res.sideMargin = Math.round(R[0].left);
    res.gutterX = row1.length > 1 ? Math.round(row1[1].left - row1[0].right) : null;
    res.firstCardTop = Math.round(firstTop + B.scrollY());
    res.firstScreen = {
      fullyVisible: R.filter(r => r.top >= 0 && r.bottom <= vh).length,
      partlyOrFully: R.filter(r => r.bottom > 0 && r.top < vh).length,
      fullyVisibleUnobstructed: R.filter(r => r.top >= bars.top && r.bottom <= vh - bars.bottom).length,
    };
    // 이미지가 50% 이상 보이는 카드(가림 바 제외)
    let imgHalf = 0;
    const imgs = main.map(c => B.cardImage(c, sel));
    imgs.forEach(im => { if (!im) return; const r = im.getBoundingClientRect(); const v = Math.min(r.bottom, vh - bars.bottom) - Math.max(r.top, bars.top); if (r.height && v / r.height >= 0.5) imgHalf++; });
    res.firstScreen.imagesHalfVisible = imgHalf;
    const im0 = imgs[0];
    if (im0) { const r = im0.getBoundingClientRect(); res.image = { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3), fit: getComputedStyle(im0).objectFit, tag: im0.tagName }; }
    const ratios = imgs.slice(0, 12).filter(Boolean).map(im => { const r = im.getBoundingClientRect(); return +(r.width / r.height).toFixed(2); });
    res.imageRatiosFirst12 = ratios;
    // 첫 카드 텍스트
    const card = main[0]; const cr = card.getBoundingClientRect(); const ir = im0 ? im0.getBoundingClientRect() : cr;
    const leaves = B.leaves(card).map(l => {
      const bgEl = (() => { for (let e = l.el; e && e !== card.parentElement; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg) && !/rgb\(255, 255, 255\)/.test(bg)) return bg; if (e === card) break; } return null; })();
      return { text: l.text, fs: l.fs, fw: l.fw, color: l.color, strike: l.strike, relY: Math.round(l.y - cr.top), onImage: l.y >= ir.top && l.y + l.h <= ir.bottom + 1, bg: bgEl,
        kind: B.PRICE.test(l.text) ? 'price' : B.DISCOUNT.test(l.text) ? 'discount' : null };
    });
    res.firstCardTexts = leaves;
    // 휴리스틱 분류(이미지 아래, 배경 없는 텍스트 순서 = 브랜드 → 상품명)
    const below = leaves.filter(l => !l.onImage && !l.kind && !l.bg && l.text.length > 0);
    res.cardText = {
      brand: B.pick(card, sel.cardBrand) || (below[0] ? { text: below[0].text, fs: below[0].fs, fw: below[0].fw } : null),
      name: B.pick(card, sel.cardName) || (below[1] ? { text: below[1].text, fs: below[1].fs, fw: below[1].fw } : null),
      price: B.pick(card, sel.cardPrice) || (() => { const p = leaves.find(l => l.kind === 'price' && !l.strike); return p ? { text: p.text, fs: p.fs, fw: p.fw } : null; })(),
      discount: (() => { const d = leaves.find(l => l.kind === 'discount'); return d ? { text: d.text, fs: d.fs, color: d.color } : null; })(),
      strikePrice: (() => { const d = leaves.find(l => l.kind === 'price' && l.strike); return d ? { text: d.text, fs: d.fs } : null; })(),
      badges: leaves.filter(l => l.bg || l.onImage).map(l => l.text).slice(0, 8),
    };
    // 첫 화면 카드들 전체에서 할인/취소선/배지 빈도
    const vis = main.filter(c => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; });
    let disc = 0, strike = 0;
    vis.forEach(c => { const ls = B.leaves(c); if (ls.some(l => B.DISCOUNT.test(l.text))) disc++; if (ls.some(l => l.strike && B.PRICE.test(l.text))) strike++; });
    res.firstScreenDiscountCards = disc; res.firstScreenStrikeCards = strike;
    // 찜(하트)
    const HEART = /like|wish|heart|좋아요|찜|save|favou?rite|bookmark/i;
    let heart = [...card.querySelectorAll('button,[role=button]')].find(e => B.vis(e) && HEART.test(e.outerHTML.slice(0, 800)))
      || [...card.querySelectorAll('a,svg,span,div')].find(e => HEART.test((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('class') || '') + ' ' + (e.getAttribute('data-testid') || '') + ' ' + (e.getAttribute('title') || '')) && B.vis(e));
    if (!heart && im0) { const ir0 = im0.getBoundingClientRect(); heart = [...card.querySelectorAll('button,[role=button]')].find(e => { const r = e.getBoundingClientRect(); return B.vis(e) && r.width < 64 && r.top >= ir0.top - 2 && r.bottom <= ir0.bottom + 2; }); }
    res.wishlistOnCard = heart ? { size: [Math.round(heart.getBoundingClientRect().width), Math.round(heart.getBoundingClientRect().height)], label: (heart.getAttribute('aria-label') || heart.getAttribute('class') || '').slice(0, 40) } : null;
    // 필터 / 정렬 (따로 찾는다)
    const above = e => e.getBoundingClientRect().top + B.scrollY() < res.firstCardTop + 10;
    const SORT = /(^|\s)(정렬|추천순|인기순|신상품순|낮은\s?가격순|판매순|무신사\s?추천순|Sort|Sort by|Relevance|Popular(ity)?|Recommended|Our recommendations?|Newest)(\s|$|:)/i;
    const FILT = /(^|\s)(필터|상세\s?필터|Filters?|Refine|All filters)(\s|$|\()/i;
    const meta = e => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('class') || '') + ' ' + (e.getAttribute('data-testid') || '');
    const sortEls = (sel.sort ? [...document.querySelectorAll(sel.sort)] : B.clickables().filter(e => (SORT.test(B.label(e)) || /\bsort/i.test(meta(e))) && B.label(e).length < 40)).filter(above);
    const filtEls = (sel.filter ? [...document.querySelectorAll(sel.filter)] : B.clickables().filter(e => ((/(필터|Filters?\b|Refine)/i.test(B.label(e)) && B.label(e).length < 30) || /(^|[\s_-])(filter|refine)(button|btn|icon|toggle)?($|[\s_-])/i.test(e.getAttribute('class') || '') && B.label(e).length < 20)).filter(e => !sortEls.includes(e))).filter(above);
    // 정렬: 클릭 가능한 요소가 아니면(div onClick) 정렬 글자 자체를 쓴다
    if (!sortEls.length && !sel.sort) { const l = B.leaves(document.body).find(x => SORT.test(x.text) && x.text.length < 20 && x.pageY < res.firstCardTop + 10); if (l) sortEls.push(l.el.parentElement || l.el); }
    const prio = e => /^(필터|상세\s?필터(열기)?|Filters?|All filters|Refine( \(\d+\))?|REFINE.*|필터 열기)$/i.test(B.label(e)) ? 0 : 1;
    const pick1 = arr => arr.slice().sort((x, y) => (prio(x) - prio(y)) || (x.getBoundingClientRect().top - y.getBoundingClientRect().top))[0];
    const sortEl = pick1(sortEls), filtEl = pick1(filtEls);
    window.__benchFS = { sort: sortEl || null, filter: filtEl || null };
    const desc = e => e ? { label: B.label(e).slice(0, 30), ...B.r(e), fixed: B.fixedAnc(e) } : null;
    res.sortControl = desc(sortEl);
    res.filterControl = desc(filtEl);
    // 칩 줄(카드 위, 짧은 텍스트 버튼 3개 이상이 한 줄) — 헤더 아이콘 버튼은 제외
    const HDR = /^(뒤로|장바구니|검색|홈|메뉴|cart|bag|basket|menu|account|search|back|wish)/i;
    const chipCands = B.clickables(false).filter(e => { const t = B.label(e); const r = e.getBoundingClientRect(); return t.length > 0 && t.length <= 18 && !HDR.test(t) && r.height >= 14 && r.height <= 56 && r.top + B.scrollY() < res.firstCardTop - 4 && r.top + B.scrollY() > 30; });
    const rows = [];
    for (const e of chipCands) { const r = e.getBoundingClientRect(); const y = Math.round(r.top + B.scrollY()); let row = rows.find(x => Math.abs(x.y - y) < 8); if (!row) { row = { y, items: [], h: Math.round(r.height), scroller: false, fixed: B.fixedAnc(e) }; rows.push(row); } const t = B.label(e).split(' ').filter((w, i, arr) => arr.indexOf(w) === i).join(' '); if (!row.items.includes(t)) row.items.push(t); if (r.right > innerWidth + 2) row.scroller = true; }
    res.chipRows = rows.filter(r => r.items.length >= 3).sort((a, b) => a.y - b.y).map(r => ({ y: r.y, h: r.h, count: r.items.length, overflowsRight: r.scroller, sticky: r.fixed, items: r.items.slice(0, 8) }));
    // 결과 수
    const CRE = /(총\s*)?[\d,]{2,}\s*(개|건)|[\d,.]+\s*(items?|results?|products?|styles?)\b|showing results for/i;
    const cnt = B.leaves(document.body).find(l => CRE.test(l.text) && l.pageY < res.firstCardTop + 10);
    res.resultCountText = cnt ? cnt.text.slice(0, 60) : null;
    res.pageHeight = B.pageHeight();
    res.minFontFirstScreen = B.minFont(true);
    res.minFontPage = B.minFont(false);
    res.overflowX = B.overflowX();
    res.firstCardLinkSize = [Math.round(cr.width), Math.round(cr.height)];
    return res;
  };
  B.stickyCheck = () => {
    const vh = innerHeight;
    const st = e => { if (!e || !e.isConnected) return null; const r = e.getBoundingClientRect(); return { inView: B.vis(e) && r.top >= -1 && r.bottom <= vh + 1, top: Math.round(r.top), fixed: B.fixedAnc(e) }; };
    const fs = window.__benchFS || {};
    // 다시 그려지는 SPA를 위해: 화면 상단 220px 안에 보이는 필터/정렬 글자도 찾아 본다
    const SORTF = /(필터|정렬|순$|Filter|Refine|Sort|Relevance|Popular)/i;
    const topCtl = B.clickables().filter(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= 260 && SORTF.test(B.label(e)) && B.label(e).length < 30; }).slice(0, 4).map(e => ({ label: B.label(e).slice(0, 20), top: Math.round(e.getBoundingClientRect().top), fixed: B.fixedAnc(e) }));
    return { scrollY: Math.round(B.scrollY()), sort: st(fs.sort), filter: st(fs.filter), controlsNearTop: topCtl, bars: B.fixedBars() };
  };
  B.cardAtViewport = (hrefSrc) => {
    const re = new RegExp(hrefSrc, 'i');
    const cards = window.__benchCards && window.__benchCards.length ? window.__benchCards : [];
    const vh = innerHeight; const bars = B.fixedBars();
    let best = null, bd = 1e9;
    for (const c of cards) {
      const img = B.cardImage(c) || c; const ir = img.getBoundingClientRect();
      const cy = ir.top + ir.height / 2;
      if (ir.width <= 0 || cy < bars.top + 20 || cy > vh - bars.bottom - 20) continue;
      const d = Math.abs(cy - vh / 2);
      if (d < bd) { bd = d; const a = c.matches('a[href]') ? c : c.querySelector('a[href]'); const href = a ? a.href : null; const m = href && href.match(re); best = { key: m ? m[0] : href, x: Math.round(ir.left + ir.width / 2), y: Math.round(cy) }; }
    }
    return best;
  };
  B.keyVisible = (hrefSrc, key) => {
    const re = new RegExp(hrefSrc, 'i');
    return [...document.querySelectorAll('a[href]')].some(a => { const m = a.href.match(re); if (!m || m[0] !== key) return false; const r = a.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; });
  };

  /* ---------- 상품 상세(PDP) ---------- */
  const CTA = /(구매하기|바로\s?구매|장바구니|쇼핑백 담기|Add to (bag|cart|basket)|Buy now|Add to Bag|Select size to add|Sold out|품절)/i;
  const SIZE = /^(사이즈|SIZE|Size|Select (a )?size|Select Size|Choose (your )?size|옵션 선택|사이즈 선택)/i;
  const REVIEW = /(리뷰|후기|Reviews?\b|평점|별점|\bratings?\b)/i;
  const SHIP = /(배송|반품|교환|도착|출고|Free (standard )?delivery|delivery|returns?\b|Shipping|Duties|관부가세|Taxes)/i;
  const SIZEADV = /(사이즈\s?(추천|가이드|정보|표)|실측|Size (guide|chart|& fit|advice|and fit)|Fit:|fits? (small|large|true)|true to size|Model (is|wears)|모델\s?(착용|신장|키))/i;
  const SECT = /(비슷한|유사|함께\s?(보|구매|본|코디)|추천|코디|다른 상품|브랜드의|같이|연관|스타일링|You may also like|Similar|Complete the look|Wear it with|More from|Recommended|Customers also|Style it|Pairs well|Shop the look|Others also|Related|People also|Get the look|Matching)/i;
  B.pdp = (cfg) => {
    const sel = cfg.selectors || {};
    const vh = innerHeight, vw = innerWidth;
    const res = { url: location.href, vw, vh, title: document.title.slice(0, 80) };
    // 메인 이미지
    const media = (sel.pdpGallery ? [...document.querySelectorAll(sel.pdpGallery)] : [...document.querySelectorAll('img,video')]).filter(e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
    let main = null, ma = 0;
    for (const e of media) { const r = e.getBoundingClientRect(); const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)); if (r.width >= Math.min(200, vw * 0.4) && vis > ma) { ma = vis; main = e; } }
    if (main) {
      const r = main.getBoundingClientRect();
      res.mainImage = { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + B.scrollY()), visibleHeightShare: +((Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh).toFixed(3), ratio: +(r.width / r.height).toFixed(3) };
      const srcKey = e => (e.currentSrc || e.src || e.poster || '').split('?')[0];
      const sim = media.filter(e => { const q = e.getBoundingClientRect(); return q.width > r.width * 0.7 && q.width < r.width * 1.3 && q.height > r.height * 0.7 && q.height < r.height * 1.3; });
      const uniq = [...new Set(sim.map(srcKey).filter(Boolean))];
      res.gallery = { similarSizeImages: sim.length, uniqueSrc: uniq.length,
        layout: sim.some(e => Math.abs(e.getBoundingClientRect().top - r.top) < 5 && Math.abs(e.getBoundingClientRect().left - r.left) > r.width * 0.5) ? 'horizontal(carousel/grid)' : (sim.some(e => e.getBoundingClientRect().top - r.top > r.height * 0.5) ? 'vertical-stack' : 'single') };
      const pager = B.leaves(document.body).find(l => /^\d+\s*\/\s*\d+$/.test(l.text) && l.pageY < res.mainImage.top + r.height + 60);
      res.gallery.pagerText = pager ? pager.text : null;
    }
    const leaves = B.leaves(document.body);
    // 이름(h1)
    const h1 = sel.pdpName ? document.querySelector(sel.pdpName) : [...document.querySelectorAll('h1')].find(B.vis);
    if (h1) res.name = { text: (h1.innerText || '').trim().slice(0, 80), fs: parseFloat(getComputedStyle(h1).fontSize), fw: getComputedStyle(h1).fontWeight, pageY: B.r(h1).pageY, via: sel.pdpName ? 'selector' : 'h1' };
    else {
      // h1이 없으면 문서 제목(title) 안에 들어 있는 가장 큰 텍스트를 상품명으로 본다
      const t = document.title.toLowerCase();
      const nl = leaves.filter(l => l.pageY < 1800 && l.fs >= 12 && l.text.length >= 4 && !PRICE.test(l.text) && t.includes(l.text.toLowerCase())).sort((a, b) => (b.fs * 100 + b.text.length) - (a.fs * 100 + a.text.length))[0];
      if (nl) res.name = { text: nl.text, fs: nl.fs, fw: nl.fw, pageY: nl.pageY, via: 'title-match' };
    }
    // 브랜드
    let brandEl = sel.pdpBrand ? document.querySelector(sel.pdpBrand) : null;
    if (!brandEl && h1) {
      const hy = B.r(h1).pageY;
      brandEl = [...document.querySelectorAll('a[href]')].filter(a => B.vis(a) && /brand|designer|\/brands?\//i.test(a.getAttribute('href')) && Math.abs(B.r(a).pageY - hy) < 260 && (a.innerText || '').trim().length > 1 && (a.innerText || '').trim().length < 50)
        .sort((a, b) => Math.abs(B.r(a).pageY - hy) - Math.abs(B.r(b).pageY - hy))[0] || null;
    }
    if (!brandEl && res.name) {
      const t = document.title.toLowerCase();
      const near = leaves.filter(l => l.pageY < res.name.pageY - 4 && l.pageY > res.name.pageY - 200 && l.text.length > 1 && l.text.length < 30 && !PRICE.test(l.text) && l.text !== res.name.text);
      const above = near.filter(l => t.includes(l.text.toLowerCase())).sort((a, b) => b.pageY - a.pageY)[0] || near.filter(l => l.pageY > res.name.pageY - 90).sort((a, b) => b.pageY - a.pageY)[0];
      if (above) res.brand = { text: above.text, fs: above.fs, pageY: above.pageY, via: 'leaf-above-name' };
    }
    if (brandEl) res.brand = { text: (brandEl.innerText || '').trim().slice(0, 40), fs: parseFloat(getComputedStyle(brandEl).fontSize), pageY: B.r(brandEl).pageY };
    // 가격
    let priceEl = sel.pdpPrice ? document.querySelector(sel.pdpPrice) : null;
    let price;
    if (priceEl) price = { text: (priceEl.innerText || '').trim().slice(0, 40), fs: parseFloat(getComputedStyle(priceEl).fontSize), pageY: B.r(priceEl).pageY };
    else {
      const ps = leaves.filter(l => PRICE.test(l.text) && l.pageY < 2600 && l.fs >= 11 && !l.strike);
      const top = ps.slice(0, 6).sort((a, b) => (b.fs - a.fs) || (a.pageY - b.pageY))[0];
      if (top) price = { text: top.text, fs: top.fs, fw: top.fw, pageY: top.pageY };
      res.priceCandidates = ps.slice(0, 6).map(p => `${p.text}@${p.pageY}/${p.fs}px`);
    }
    if (price) { price.inFirstScreen = price.pageY < vh; res.price = price;
      const near = leaves.filter(l => Math.abs(l.pageY - price.pageY) < 140);
      res.priceDiscount = (near.find(l => DISCOUNT.test(l.text)) || {}).text || null;
      res.priceStrike = (near.find(l => l.strike && PRICE.test(l.text)) || {}).text || null;
    }
    // CTA
    const ctas = (sel.pdpCta ? [...document.querySelectorAll(sel.pdpCta)] : B.clickables().filter(e => CTA.test(B.label(e)) && B.label(e).length < 40)).filter(B.vis);
    ctas.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; });
    res.ctas = ctas.slice(0, 4).map(e => ({ label: B.label(e).slice(0, 30), ...B.r(e), fixed: B.fixedAnc(e), inFirstScreen: e.getBoundingClientRect().top < vh && e.getBoundingClientRect().bottom > 0 }));
    // 사이즈 선택
    const sizeEl = (sel.pdpSize ? [...document.querySelectorAll(sel.pdpSize)] : [...B.clickables(), ...document.querySelectorAll('select')].filter(e => SIZE.test(B.label(e)) && B.label(e).length < 60)).filter(B.vis)[0];
    res.sizeSelector = sizeEl ? { label: B.label(sizeEl).slice(0, 30), ...B.r(sizeEl), fixed: B.fixedAnc(sizeEl) } : null;
    const rv = leaves.find(l => REVIEW.test(l.text) && l.text.length < 60);
    res.reviews = rv ? { text: rv.text, pageY: rv.pageY } : null;
    res.trust = leaves.filter(l => SHIP.test(l.text) && l.text.length < 120).slice(0, 6).map(l => ({ text: l.text, pageY: l.pageY, fs: l.fs }));
    res.sizeAdvice = leaves.filter(l => SIZEADV.test(l.text) && l.text.length < 120).slice(0, 4).map(l => ({ text: l.text, pageY: l.pageY }));
    const heart = B.clickables().find(e => /like|wish|heart|좋아요|찜|save|favou?rite|bookmark/i.test((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('class') || '') + ' ' + (e.getAttribute('data-testid') || '') + ' ' + (e.innerText || '').slice(0, 20)));
    res.wishlist = heart ? { label: B.label(heart).slice(0, 30) || (heart.getAttribute('class') || '').slice(0, 30), ...B.r(heart) } : null;
    res.pageHeight = B.pageHeight();
    res.minFontFirstScreen = B.minFont(true);
    res.overflowX = B.overflowX();
    res.fixedBars = B.fixedBars();
    return res;
  };
  B.pdpSections = () => {
    const hs = B.leaves(document.body).filter(l => SECT.test(l.text) && l.text.length < 50 && l.fs >= 13 && (+l.fw >= 500 || /^H[1-6]$/.test(l.el.tagName) || l.fs >= 16));
    const seen = new Set(); const out = [];
    for (const h of hs.sort((a, b) => a.pageY - b.pageY)) { if (seen.has(h.text)) continue; seen.add(h.text); out.push({ text: h.text, pageY: h.pageY, fs: h.fs }); }
    return out.slice(0, 12);
  };
  B.pdpHeadings = () => {
    const hs = B.leaves(document.body).filter(l => l.text.length > 1 && l.text.length < 40 && !PRICE.test(l.text) && !DISCOUNT.test(l.text) && (/^H[1-4]$/.test(l.el.tagName) || (l.fs >= 16 && +l.fw >= 500)));
    const seen = new Set(); const out = [];
    for (const h of hs.sort((a, b) => a.pageY - b.pageY)) { if (seen.has(h.text)) continue; seen.add(h.text); out.push(`${h.text}@${h.pageY}`); }
    return out.slice(0, 25);
  };
  B.ctaAfterScroll = (cfg) => {
    const sel = cfg.selectors || {};
    const vh = innerHeight;
    const ctas = (sel.pdpCta ? [...document.querySelectorAll(sel.pdpCta)] : B.clickables().filter(e => CTA.test(B.label(e)) && B.label(e).length < 40)).filter(B.vis);
    const inView = ctas.filter(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh; });
    return { scrollY: Math.round(B.scrollY()), visible: inView.map(e => ({ label: B.label(e).slice(0, 30), ...B.r(e), fixed: B.fixedAnc(e) })).slice(0, 3) };
  };

  /* ---------- 빈 결과 ---------- */
  B.empty = (cfg, q) => {
    const re = new RegExp(cfg.productHref, 'i');
    const vh = innerHeight;
    const leaves = B.leaves(document.body);
    const EMP = /(없|찾을 수|검색결과가|0개|0건|no results|couldn.?t find|could not find|sorry|did not match|didn.?t match|no matching|0 results|0 items|nothing|we found no|\bno\b.{0,40}\b(products?|results?|items?|match)|try)/i;
    const msgs = leaves.filter(l => EMP.test(l.text) && l.text.length < 160).slice(0, 5).map(l => ({ text: l.text, fs: l.fs, pageY: l.pageY }));
    const products = new Set([...document.querySelectorAll('a[href]')].filter(a => re.test(a.href) && B.vis(a)).map(a => a.href.match(re)[0]));
    const inputs = [...document.querySelectorAll('input')].filter(i => B.vis(i) && i.value && i.value.trim().toLowerCase() === q.toLowerCase());
    const sugg = leaves.filter(l => /(추천|인기|연관|다른 검색어|이런|대신|Popular|Trending|Recommended|You may|Try|Did you mean|Search for|Suggest|Bestsell|New in)/i.test(l.text) && l.text.length < 60).slice(0, 6).map(l => ({ text: l.text, pageY: l.pageY }));
    return { url: location.href, messages: msgs, alternativeProducts: products.size, queryEditableInput: inputs.length > 0, queryShownAnywhere: leaves.some(l => l.text.toLowerCase().includes(q.toLowerCase())), suggestionHeads: sugg, pageHeight: B.pageHeight(), minFontFirstScreen: B.minFont(true), overflowX: B.overflowX() };
  };
  window.__bench = B;
}

/* ------------------------------------------------------------------ *
 * 이미지 배경 판정 (스크린샷 픽셀 — 별도 about:blank 페이지 캔버스에서 계산, 네트워크 없음)
 * ------------------------------------------------------------------ */
async function classifyImage(browser, pngBuf) {
  const p = await browser.newPage();
  try {
    return await p.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; const W = c.width, H = c.height;
      const band = Math.max(2, Math.round(Math.min(W, H) * 0.05));
      let n = 0, s = 0, s2 = 0, white = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        if (!(x < band || y < band || x >= W - band || y >= H - band)) continue;
        const i = (y * W + x) * 4; const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        n++; s += l; s2 += l * l; if (l > 246) white++;
      }
      // 네 모서리(각 10% 정사각형) — 모델 다리 등이 가장자리에 닿아도 배경을 읽기 위해
      const cs = Math.max(4, Math.round(Math.min(W, H) * 0.10));
      const corner = (x0, y0) => { let m = 0, q = 0, k = 0; for (let y = y0; y < y0 + cs; y++) for (let x = x0; x < x0 + cs; x++) { const i = (y * W + x) * 4; const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; m += l; q += l * l; k++; } m /= k; return { m, sd: Math.sqrt(Math.max(0, q / k - m * m)) }; };
      const cors = [corner(0, 0), corner(W - cs, 0), corner(0, H - cs), corner(W - cs, H - cs)];
      const whiteC = cors.filter(c => c.m > 246 && c.sd < 6).length;
      const greyC = cors.filter(c => c.m > 200 && c.m <= 246 && c.sd < 9).length;
      const flatC = cors.filter(c => c.sd < 6).length;
      let kind = 'photo/scene';
      if (whiteC >= 3) kind = 'white';
      else if (greyC + whiteC >= 3 && greyC >= 2) kind = 'light-grey';
      else if (flatC >= 3) kind = 'solid-color';
      const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
      return { kind, cornerMeans: cors.map(c => Math.round(c.m)), cornerSd: cors.map(c => +c.sd.toFixed(1)), edgeMean: Math.round(m), edgeSd: +sd.toFixed(1), edgeWhiteShare: +(white / n).toFixed(2) };
    }, pngBuf.toString('base64'));
  } finally { await p.close(); }
}

/* ------------------------------------------------------------------ *
 * 실행
 * ------------------------------------------------------------------ */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function inject(page) { await page.evaluate(PAGE_LIB); }
const cfgForPage = site => ({ productHref: site.productHref.source, selectors: site.selectors || {} });

async function settle(page, ms = 3500) {
  try { await page.waitForLoadState('load', { timeout: 15000 }); } catch {}
  try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
  await page.waitForTimeout(ms);
}

async function handleOverlays(page, site, log) {
  for (const c of site.consent || []) {
    try {
      const loc = c.role ? page.getByRole(c.role, { name: c.name }) : page.locator(c);
      if (await loc.count() && await loc.first().isVisible()) { await loc.first().click({ timeout: 4000 }); log.push(`쿠키 배너: "${c.name || c}" 클릭(화면을 가려서)`); await page.waitForTimeout(800); }
    } catch {}
  }
  for (const d of site.dismiss || []) {
    try { const loc = page.locator(d); if (await loc.count() && await loc.first().isVisible()) { await loc.first().click({ timeout: 3000 }); log.push(`모달 닫기: ${d}`); await page.waitForTimeout(500); } } catch {}
  }
}

async function waitForCards(page, site, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      await inject(page);
      const n = await page.evaluate(c => window.__bench.cards(c.productHref, c.selectors).main.length, cfgForPage(site));
      if (n >= 2) return n;
    } catch {}
    await page.waitForTimeout(1000);
  }
  return 0;
}

async function runSite(browser, site, vpName, opts = {}) {
  const vp = VIEWPORTS[vpName];
  let ctx, page, lastNav = null;
  const freshPage = async () => {
    if (ctx) await ctx.close();
    ctx = await browser.newContext({ ...vp, locale: site.locale || 'ko-KR', timezoneId: site.timezoneId });
    page = await ctx.newPage();
    const pg = page;
    pg.on('response', r => { try { if (r.request().isNavigationRequest() && r.frame() === pg.mainFrame()) lastNav = { status: r.status(), url: r.url() }; } catch {} });
  };
  await freshPage();
  const res = { site: site.id, name: site.name, viewport: vpName, size: `${vp.viewport.width}x${vp.viewport.height}`, measuredAt: new Date().toISOString(), notes: [], errors: [] };
  const cfg = cfgForPage(site);
  const shot = async (name, full = false, pg = page) => { const f = path.join(SHOTS, `${site.id}-${vpName}-${name}.png`); try { await pg.screenshot({ path: f, fullPage: full }); return path.relative(OUT, f); } catch (e) { res.errors.push(`screenshot ${name}: ${e.message}`); return null; } };

  /* T1 검색 */
  let taps = 0; const tapLog = [];
  const tap = async (target, label) => {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    let bb = null; try { await loc.scrollIntoViewIfNeeded({ timeout: 4000 }); bb = await loc.boundingBox(); } catch {}
    await loc.click({ timeout: 8000 });
    taps++; tapLog.push({ label, w: bb ? Math.round(bb.width) : null, h: bb ? Math.round(bb.height) : null });
  };
  const submit = async () => { await page.keyboard.press('Enter'); taps++; tapLog.push({ label: '키보드 검색(Enter)' }); };

  const start = site.start ? site.start(vpName) : { url: site.home };
  if (start.note) res.notes.push(start.note);
  res.t1 = { startUrl: start.url, method: null };
  try {
    await page.goto(start.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page, 2500);
    res.t1.startFinalUrl = page.url(); res.t1.startStatus = lastNav && lastNav.status;
    await handleOverlays(page, site, res.notes);
  } catch (e) { res.errors.push('start: ' + e.message); }

  let viaUi = false;
  for (const n of site.refNotes || []) res.notes.push(n);
  if (site.uiSearch && !opts.urlOnly && site.searchMode !== 'url') {
    try {
      const before = page.url();
      await site.uiSearch({ page, q: site.query, vp: vpName, tap, submit });
      try { await page.waitForURL(u => u.toString() !== before, { timeout: 15000 }); } catch {}
      await settle(page, 2500);
      const blocked = site.isBlocked ? site.isBlocked({ status: lastNav ? lastNav.status : 200, url: page.url() }) : false;
      const n = blocked ? 0 : await waitForCards(page, site, 12000);
      if (!blocked && n >= 2) { viaUi = true; res.t1.method = 'site-search-ui'; }
      else res.t1.uiFailure = blocked ? `차단됨 (HTTP ${lastNav && lastNav.status}, ${page.url()})` : '결과 카드 감지 실패';
    } catch (e) { res.t1.uiFailure = e.message.split('\n')[0]; }
  }
  res.t1.searchTaps = viaUi ? taps : null;
  res.t1.tapLog = tapLog.slice();
  if (!viaUi) {
    res.t1.method = 'direct-results-url';
    taps = 0;
    if (res.t1.uiFailure && /차단/.test(res.t1.uiFailure)) { await freshPage(); res.notes.push('UI 검색이 봇 차단(403)되어 새 브라우저 컨텍스트에서 결과 URL로 직접 진입'); }
    try {
      await page.goto(site.searchUrl(site.query, vpName), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await settle(page, 3000);
      await handleOverlays(page, site, res.notes);
      await waitForCards(page, site, 12000);
    } catch (e) { res.errors.push('searchUrl: ' + e.message); }
  }
  res.t1.resultsUrl = page.url(); res.t1.resultsStatus = lastNav && lastNav.status;
  await handleOverlays(page, site, res.notes);

  /* T2 결과 첫 화면 */
  try {
    await inject(page);
    await page.evaluate(() => window.__bench.scrollTo(0));
    await page.waitForTimeout(1200);
    res.t2 = await page.evaluate(c => window.__bench.measureResults(c), cfg);
    res.shots = { results: await shot('results') };
    // 이미지 배경: 첫 화면 카드 이미지 최대 4장
    const boxes = await page.evaluate(c => (window.__benchCards || []).slice(0, 4).map(card => { const im = window.__bench.cardImage(card, c.selectors); if (!im) return null; const r = im.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }).filter(Boolean), cfg);
    res.t2.imageBackground = [];
    for (const b of boxes) {
      if (b.y < 0 || b.y + b.height > vp.viewport.height || b.width < 20) continue;
      const buf = await page.screenshot({ clip: { x: b.x, y: b.y, width: b.width, height: b.height } });
      res.t2.imageBackground.push(await classifyImage(browser, buf));
    }
    // 필터/정렬 sticky: 1500px 아래로 → 위로 300px
    await page.evaluate(() => window.__bench.scrollTo(1500)); await page.waitForTimeout(1500);
    const down = await page.evaluate(() => window.__bench.stickyCheck());
    await page.mouse.wheel(0, -300).catch(() => {});
    await page.evaluate(() => { const B = window.__bench; B.scrollTo(Math.max(0, B.scrollY() - 300)); }); await page.waitForTimeout(1200);
    const up = await page.evaluate(() => window.__bench.stickyCheck());
    res.t2.filterSticky = { afterScrollDown: down, afterScrollUp: up };
    res.t2.pageHeightAfterScroll = await page.evaluate(() => window.__bench.pageHeight());
  } catch (e) { res.errors.push('t2: ' + e.message.split('\n')[0]); }

  /* T3 첫 상품 열기 — 같은 탭 이동 / 새 탭(target=_blank) 모두 처리 */
  const openProduct = async (x, y, href) => {
    const before = page.url(); const nPages = ctx.pages().length;
    await page.mouse.click(x, y);
    const t0 = Date.now(); let mode = null, pdpPage = page;
    while (Date.now() - t0 < 15000) {
      if (ctx.pages().length > nPages) { pdpPage = ctx.pages()[ctx.pages().length - 1]; mode = 'new-tab'; break; }
      if (page.url() !== before) { mode = 'same-tab'; break; }
      await page.waitForTimeout(250);
    }
    if (!mode && href) { mode = 'href-fallback'; await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    try { await pdpPage.waitForLoadState('domcontentloaded', { timeout: 30000 }); } catch {}
    return { pdpPage, mode, before };
  };
  let pdpOpenMode = null;
  try {
    await page.evaluate(() => window.__bench.scrollTo(0)); await page.waitForTimeout(1000);
    await inject(page);
    await page.evaluate(c => { window.__benchCards = window.__bench.cards(c.productHref, c.selectors).main; }, cfg);
    const first = await page.evaluate(c => { const cards = window.__benchCards || []; if (!cards.length) return null; const card = cards[0]; const im = window.__bench.cardImage(card, c.selectors) || card; im.scrollIntoView({ block: 'center' }); const a = card.matches('a[href]') ? card : card.querySelector('a[href]'); return { href: a && a.href, target: a && a.target }; }, cfg);
    if (!first) throw new Error('첫 상품 카드 없음');
    await page.waitForTimeout(600);
    const pos = await page.evaluate(c => { const card = (window.__benchCards || [])[0]; const im = window.__bench.cardImage(card, c.selectors) || card; const r = im.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, cfg);
    const { pdpPage, mode } = await openProduct(pos.x, pos.y, first.href);
    pdpOpenMode = mode;
    taps++;
    if (mode === 'href-fallback') res.notes.push('첫 상품: 이미지 클릭으로 이동하지 않아 링크 href로 직접 이동(탭 수는 1로 계산)');
    if (mode === 'new-tab') res.notes.push('상품 링크가 새 탭(target=_blank)으로 열림 → "뒤로가기" 대신 탭을 닫아야 결과로 돌아감');
    await settle(pdpPage, 3000);
    await handleOverlays(pdpPage, site, res.notes);
    res.t3 = { tapsHomeToPdp: viaUi ? taps : null, tapsResultsToPdp: 1, openMode: mode, linkTarget: first.target || null, pdpStatus: mode === 'new-tab' ? null : (lastNav && lastNav.status), firstProductHref: first.href };
    await inject(pdpPage);
    await pdpPage.evaluate(() => window.__bench.scrollTo(0)); await pdpPage.waitForTimeout(800);
    res.t3.pdp = await pdpPage.evaluate(c => window.__bench.pdp(c), cfg);
    res.shots.pdp = await shot('pdp', false, pdpPage);
    // CTA sticky 확인 + 섹션 지연 로딩을 위해 단계적으로 스크롤
    await pdpPage.evaluate(() => window.__bench.scrollTo(Math.min(1600, window.__bench.pageHeight() - innerHeight - 10))); await pdpPage.waitForTimeout(1200);
    res.t3.ctaAfterScroll = await pdpPage.evaluate(c => window.__bench.ctaAfterScroll(c), cfg);
    for (let y = 1600, i = 0; i < 16; y += 1200, i++) { const H = await pdpPage.evaluate(() => window.__bench.pageHeight()); if (y > H) break; await pdpPage.evaluate(yy => window.__bench.scrollTo(yy), y); await pdpPage.waitForTimeout(900); }
    await pdpPage.waitForTimeout(1200);
    res.t3.sections = await pdpPage.evaluate(() => window.__bench.pdpSections());
    res.t3.headings = await pdpPage.evaluate(() => window.__bench.pdpHeadings());
    res.t3.pageHeightAfterScroll = await pdpPage.evaluate(() => window.__bench.pageHeight());
    // 정보 순서
    const p = res.t3.pdp; const items = [];
    if (p.brand) items.push(['brand', p.brand.pageY]);
    if (p.name) items.push(['name', p.name.pageY]);
    if (p.price) items.push(['price', p.price.pageY]);
    if (p.sizeSelector) items.push(['size', p.sizeSelector.pageY]);
    const inflowCta = (p.ctas || []).find(c => !c.fixed); const fixedCta = (p.ctas || []).find(c => c.fixed);
    if (inflowCta) items.push(['cta', inflowCta.pageY]);
    if (p.reviews) items.push(['reviews', p.reviews.pageY]);
    if (p.trust && p.trust[0]) items.push(['shipping/returns', p.trust[0].pageY]);
    if (res.t3.sections[0]) items.push(['recommend:' + res.t3.sections[0].text, res.t3.sections[0].pageY]);
    res.t3.infoOrder = items.sort((a, b) => a[1] - b[1]).map(([k, y]) => `${k}@${y}`);
    if (fixedCta) res.t3.infoOrder.push(`cta(fixed:${fixedCta.fixed})`);
    // 결과 화면으로 복귀
    if (mode === 'new-tab') { await pdpPage.close(); }
    else { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }); }
  } catch (e) { res.errors.push('t3: ' + e.message.split('\n')[0]); }

  /* T3b 뒤로가기 스크롤 복원: 결과를 ~1500px 내린 뒤 그 위치의 상품을 열고 → 뒤로(또는 탭 닫기) → scrollY */
  if (!(opts.skip || []).includes('back')) {
    try {
      await settle(page, 2500);
      await inject(page);
      const blocked = site.isBlocked ? site.isBlocked({ status: lastNav ? lastNav.status : 200, url: page.url() }) : false;
      await waitForCards(page, site, 10000);
      await page.evaluate(() => window.__bench.scrollTo(1500)); await page.waitForTimeout(2000);
      await page.evaluate(c => { window.__benchCards = window.__bench.cards(c.productHref, c.selectors).main; }, cfg);
      const at = await page.evaluate(c => window.__bench.cardAtViewport(c.productHref), cfg);
      const yBefore = await page.evaluate(() => Math.round(window.__bench.scrollY()));
      const back = { backToResultsBlocked: blocked, scrollBefore: yBefore, productKey: at && at.key };
      if (!at) throw new Error('스크롤 위치에서 상품 카드를 못 찾음');
      const { pdpPage, mode } = await openProduct(at.x, at.y, null);
      back.openMode = mode;
      await settle(pdpPage, 2000);
      back.openedUrl = pdpPage.url();
      if (mode === 'new-tab') { await pdpPage.close(); back.returnAction = 'close-tab'; }
      else if (mode === 'same-tab') { await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }); back.returnAction = 'history-back'; }
      else throw new Error('상품이 열리지 않음');
      await page.waitForTimeout(3500);
      await inject(page);
      back.urlAfterBack = page.url();
      back.scrollAfterBack = await page.evaluate(() => Math.round(window.__bench.scrollY()));
      back.sameProductInView = await page.evaluate(([c, k]) => window.__bench.keyVisible(c.productHref, k), [cfg, at.key]);
      back.backStatus = lastNav && lastNav.status;
      back.restored = Math.abs(back.scrollAfterBack - back.scrollBefore) < 200 || back.sameProductInView;
      res.t3back = back;
    } catch (e) { res.errors.push('back: ' + e.message.split('\n')[0]); }
  }

  /* T4 빈 결과 */
  if (!(opts.skip || []).includes('empty')) {
    res.t4 = [];
    const qs = vpName === 'pc' ? site.emptyQueries.slice(0, 1) : site.emptyQueries;
    for (const [i, q] of qs.entries()) {
      try {
        await page.goto(site.searchUrl(q, vpName), { waitUntil: 'domcontentloaded', timeout: 45000 });
        await settle(page, 3000);
        await handleOverlays(page, site, res.notes);
        await inject(page);
        const e = await page.evaluate(([c, qq]) => window.__bench.empty(c, qq), [cfg, q]);
        e.query = q; e.status = lastNav && lastNav.status;
        if (i === 0) e.shot = await shot('empty');
        res.t4.push(e);
      } catch (e) { res.errors.push(`t4 ${q}: ` + e.message.split('\n')[0]); }
    }
  }
  await ctx.close();
  return res;
}

/* ------------------------------------------------------------------ *
 * contact sheet
 * ------------------------------------------------------------------ */
async function contactSheet(browser) {
  const files = fs.readdirSync(SHOTS).filter(f => f.endsWith('.png')).sort();
  const order = ['mobile-results', 'mobile-pdp', 'mobile-empty', 'pc-results', 'pc-pdp', 'pc-empty'];
  const sites = [...new Set(files.map(f => f.split('-')[0]))];
  const siteOrder = ['musinsa', '29cm', 'zalando', 'ssense'].filter(s => sites.includes(s)).concat(sites.filter(s => !['musinsa', '29cm', 'zalando', 'ssense'].includes(s)));
  const cell = (f) => fs.existsSync(path.join(SHOTS, f)) ? `<img src="data:image/png;base64,${fs.readFileSync(path.join(SHOTS, f)).toString('base64')}">` : '<div class="na">확인 못 함</div>';
  const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:#f4f4f2;font:14px/1.4 -apple-system,'Noto Sans KR',sans-serif;color:#111}
  h1{font-size:20px;margin:0 0 4px} p{margin:0 0 16px;color:#555}
  table{border-collapse:separate;border-spacing:12px 10px} th{font-size:13px;text-align:left;color:#444}
  td{vertical-align:top} td img{display:block;background:#fff;border:1px solid #ccc}
  td.m img{width:180px} td.d img{width:330px}
  .na{width:180px;height:120px;display:flex;align-items:center;justify-content:center;background:#e6e6e6;color:#777}
  .site{font-weight:700;font-size:15px;writing-mode:vertical-rl;transform:rotate(180deg)}
  </style><h1>같은 과제 벤치마크 — 화면 모음 (내부 참고용, 외부 공유·커밋 금지)</h1><p>${new Date().toISOString().slice(0, 10)} · 모바일 390×844(iPhone UA) · PC 1280×800 · 헤드리스 Chromium</p>
  <table><tr><th></th>${order.map(o => `<th>${o.replace('mobile', '모바일').replace('pc', 'PC').replace('results', '결과').replace('pdp', '상세').replace('empty', '빈 결과')}</th>`).join('')}</tr>
  ${siteOrder.map(s => `<tr><td class="site">${s}</td>${order.map(o => `<td class="${o.startsWith('mobile') ? 'm' : 'd'}">${cell(`${s}-${o}.png`)}</td>`).join('')}</tr>`).join('')}
  </table>`;
  const tmp = path.join(OUT, '.contact.html'); fs.writeFileSync(tmp, html);
  const p = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await p.goto(pathToFileURL(tmp).href); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'contact.png'), fullPage: true });
  await p.close(); fs.unlinkSync(tmp);
  return path.join(OUT, 'contact.png');
}

/* ------------------------------------------------------------------ */
async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: !args.headful });
  try {
    if (args.contact) { console.log(await contactSheet(browser)); return; }
    let sites = SITES;
    if (args.config) { const ext = (await import(pathToFileURL(path.resolve(args.config)).href)).default; sites = Array.isArray(ext) ? ext : [ext]; }
    if (args.sites) { const want = String(args.sites).split(','); sites = sites.filter(s => want.includes(s.id)); }
    const vps = String(args.viewports || 'mobile,pc').split(',');
    const skip = args.skip ? String(args.skip).split(',') : [];
    const metricsPath = path.join(OUT, args.metrics || 'metrics.json');
    const all = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : {};
    for (const s of sites) for (const v of vps) {
      console.error(`▶ ${s.id} / ${v}`);
      const r = await runSite(browser, s, v, { skip, urlOnly: !!args['url-only'] });
      all[s.id] = all[s.id] || {}; all[s.id][v] = r;
      fs.writeFileSync(metricsPath, JSON.stringify(all, null, 1));
      console.error(`  done: method=${r.t1 && r.t1.method} cards=${r.t2 && r.t2.mainGridCards} cols=${r.t2 && r.t2.columns} errors=${r.errors.length}`);
      await sleep(1500);
    }
    if (!args['no-contact']) console.error('contact:', await contactSheet(browser));
  } finally { await browser.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
