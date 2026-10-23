// Self-contained so Chrome can serialize this function into an isolated world.
// Reads rendered order cards only. No requests, cookies, storage, hidden app
// state, page-wide text exports, or image downloads.
export async function readMusinsaOrderPage({ doc = document, href = location.href } = {}) {
  const page = new URL(href);
  if (page.protocol !== 'https:' || !['www.musinsa.com', 'musinsa.com', 'store.musinsa.com'].includes(page.hostname) ||
      !/(?:order|claim|exchange|return)/i.test(page.pathname) || /(?:cart|payment|checkout)/i.test(page.pathname))
    throw new Error('무신사 마이페이지의 주문 내역 또는 취소·반품·교환 내역을 열어 주세요.');
  const visible = (el) => !!el?.getClientRects().length && !el.closest('[hidden],[aria-hidden="true"]');
  const text = (el) => (el?.innerText || '').replace(/\r/g, '').trim();
  const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const product = (anchor) => {
    try {
      const url = new URL(anchor.getAttribute('href'), page);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !['www.musinsa.com', 'musinsa.com', 'store.musinsa.com'].includes(url.hostname)) return null;
      return url.pathname.match(/^\/(?:products|app\/goods|goods)\/(\d{1,15})\/?$/)?.[1] || null;
    } catch { return null; }
  };
  const statusPatterns = [
    ['cancelled', /취소\s*완료|주문\s*취소\s*완료/], ['returned', /반품\s*완료|환불\s*완료/],
    ['returning', /반품\s*(?:신청|요청|접수|수거|진행)|환불\s*(?:접수|진행)/],
    ['exchanging', /교환\s*(?:신청|접수|수거|진행|완료)/],
    ['confirmed', /구매\s*확정/], ['delivered', /배송\s*완료/],
    ['shipping', /배송\s*중|출고\s*완료|배송\s*시작/], ['ordered', /결제\s*완료|주문\s*완료|상품\s*준비|배송\s*준비/],
  ];
  const statusOf = (value) => statusPatterns.find(([, pattern]) => pattern.test(value))?.[0] || 'unknown';
  const anchors = [...doc.querySelectorAll('a[href]')].filter((el) => visible(el) && product(el));
  const seen = new Set(), rows = [], occurrences = new Map();
  for (const anchor of anchors) {
    const productId = product(anchor);
    let card = null;
    for (let node = anchor.parentElement, depth = 0; node && depth < 8 && node !== doc.body; node = node.parentElement, depth++) {
      const links = [...node.querySelectorAll('a[href]')].filter(visible).map(product).filter(Boolean);
      if (new Set(links).size > 1 || text(node).length > 2000) break;
      if (statusOf(text(node)) !== 'unknown') { card = node; break; }
    }
    // A product link or recommendation by itself is not evidence of an order.
    if (!card || seen.has(card)) continue;
    seen.add(card);
    const lines = text(card).split('\n').map((s) => s.trim()).filter(Boolean);
    // Never interpret a return/cancel button as an already-completed status.
    const actions = new Set([...card.querySelectorAll('button,[role="button"]')].filter(visible).map(text));
    const statusLines = lines.filter((line) => !actions.has(line) && !/신청하기|신청 가능|배송조회|배송 조회|구매확정 하기|구매 확정하기|취소\/반품|반품\/교환/.test(line));
    const statuses = new Set(statusLines.map(statusOf).filter((s) => s !== 'unknown'));
    const status = statuses.size === 1 ? [...statuses][0] : 'unknown';
    let orderNumber = '', orderDate = null;
    for (let node = card, depth = 0; node && depth < 4 && node !== doc.body; node = node.parentElement, depth++) {
      // Only explicitly labelled header fields are read from an order group;
      // item prices/options/statuses never come from a neighbouring order.
      const header = text(node);
      if ((header.match(/주문\s*번호/g) || []).length > 1) break;
      if (!orderNumber) orderNumber = header.match(/주문\s*번호\s*[:：]?\s*([A-Za-z0-9-]{6,40})/)?.[1] || '';
      if (!orderDate) {
        const date = header.match(/(?:^|\n)(?:주문\s*일(?:자)?\s*[:：]?\s*)?(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\.|\b)/);
        if (date) orderDate = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
      }
      if (orderNumber && orderDate) break;
      // Looking higher across separate order groups would borrow another order.
    }
    const itemLinks = [...card.querySelectorAll('a[href]')].filter((el) => visible(el) && product(el) === productId);
    const name = clean(itemLinks.map(text).filter((s) => s && !/^\d[\d,]*\s*원$/.test(s)).sort((a, b) => b.length - a.length)[0] ||
      itemLinks.flatMap((el) => [...el.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt'))).find(Boolean), 160);
    if (!name) continue;
    const brandLink = [...card.querySelectorAll('a[href]')].find((el) => visible(el) && /\/(?:brand|brands)\//.test(el.getAttribute('href')));
    const brand = clean(text(brandLink), 120);
    const option = clean(lines.find((line) => /^(?:옵션|선택\s*옵션|색상|사이즈)\s*[:：]/.test(line))?.replace(/^(?:선택\s*)?옵션\s*[:：]\s*/, ''), 160);
    const quantityMatch = lines.map((line) => line.match(/^(?:수량\s*[:：]?\s*)?(\d{1,2})\s*개$/)).find(Boolean);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : null;
    const explicitAmounts = lines.map((line) => line.match(/^(?:상품\s*금액|구매\s*금액|결제\s*금액)\s*[:：]?\s*([\d,]+)\s*원$/)).filter(Boolean);
    const amounts = explicitAmounts.length ? explicitAmounts : lines.map((line) => line.match(/^([\d,]+)\s*원$/)).filter(Boolean);
    const amount = amounts.length === 1 ? Number(amounts[0][1].replaceAll(',', '')) : null;
    const base = JSON.stringify([orderNumber, orderDate, productId, option]);
    const index = occurrences.get(base) || 0; occurrences.set(base, index + 1);
    const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${base}:${index}`));
    rows.push({ key: [...new Uint8Array(keyBytes)].map((v) => v.toString(16).padStart(2, '0')).join(''),
      identity: orderNumber && index === 0 ? 'order' : 'page', productId: `ms-${productId}`,
      url: `https://www.musinsa.com/products/${productId}`, name, brand, option, orderDate, status, quantity, amount });
    if (rows.length > 100) throw new Error('한 번에 100개까지 가져올 수 있어요. 조회 기간을 줄여 주세요.');
  }
  return { format: 'eoul-orders', version: 1, retailer: 'musinsa', extractedAt: new Date().toISOString(), items: rows };
}
