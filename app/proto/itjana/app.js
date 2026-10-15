// 있잖아 — "옷 사기 전에, 내 옷장을 아는 친구한테."
// One continuous conversation with a friend who remembers your closet.
(() => {
  const P = Proto;
  const esc = P.esc;
  const RM = P.reducedMotion();
  const LOG_KEY = `eoul-proto:${P.meta.id}:log`;
  const EX_KEY = `eoul-proto:${P.meta.id}:example`;
  const KEEP = 60;
  const DEC = { buy: '살래', hold: '좀 더 볼래', skip: '안 살래' };
  const DEC_SHORT = { buy: '살래', hold: '볼래', skip: '안 살래' };
  const CAT_ORDER = ['top', 'outer', 'bottom', 'dress', 'shoes', 'acc'];
  const PAIR = { top: 'bottom', bottom: 'top', outer: 'top', shoes: 'bottom', acc: 'top', dress: 'shoes' };
  const ARROW = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const HANGER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7.2a2.1 2.1 0 1 1 2.1-2.1c0 1.1-.9 1.5-1.6 2-.4.3-.5.6-.5 1v.6"/><path d="M12 8.7 3.4 15.2c-.9.7-.4 2.1.7 2.1h15.8c1.1 0 1.6-1.4.7-2.1L12 8.7Z"/></svg>';

  // ── storage (own keys; the core keeps the closet and decisions)
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const wait = (ms) => new Promise((r) => setTimeout(r, RM ? 0 : ms));

  let book = read(LOG_KEY, null);
  if (!book || book.v !== 1 || !Array.isArray(book.items)) book = { v: 1, at: 0, trimmed: false, items: [] };
  let log = book.items;
  let exIds = new Set(read(EX_KEY, []));
  let seq = Math.floor(Math.random() * 1e6);
  const nid = () => `m${Date.now().toString(36)}${(seq += 1).toString(36)}`;

  function saveLog() {
    if (log.length > KEEP) {
      // Trim at a turn boundary so the kept history starts with what someone said.
      let start = log.length - KEEP;
      const turn = log.findIndex((e, i) => i >= start && (e.t === 'u' || e.t === 'up' || e.t === 'div'));
      if (turn > 0) start = turn;
      log = log.slice(start);
      book.trimmed = true;
    }
    book.items = log;
    book.at = Date.now();
    write(LOG_KEY, book);
  }
  const saveEx = () => write(EX_KEY, [...exIds]);

  // ── small helpers
  const kc = (x) => `${P.colorName(x.color)} ${P.shortKind(x)}`.trim();
  const snap = (g) => ({ id: g.id, productId: g.productId, slot: g.slot, color: g.color, label: P.label(g), ex: exIds.has(g.id) });
  const garments = () => P.record.garments;
  const fmt = (s) => esc(s).replace(/\*(.+?)\*/g, '<em class="hi">$1</em>').replace(/~(.+?)~/g, '<em class="ul">$1</em>');
  const clean = (s) => String(s).replace(/[*~]/g, '');
  function tile(x, cls = '') {
    const src = x ? P.photo(x) : '';
    if (!src) return `<span class="tile is-blank ${cls}" style="--sw:${esc(P.colorHex(x?.color))}"></span>`;
    return `<span class="tile ${cls}"><img src="${esc(src)}" alt="" decoding="async"></span>`;
  }

  // ── shell
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="shell">
      <header class="top" id="top">
        <div class="top-in">
          <h1 class="mark"><span class="mark-w">있잖아</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></h1>
          <span class="sr-only" id="typing-sr" aria-live="polite"></span>
          <button class="closet-btn" type="button" data-act="closet" aria-haspopup="dialog">${HANGER}<span>옷장</span><b id="cnt">0</b></button>
        </div>
      </header>
      <button class="hist" id="hist" type="button" data-act="history" hidden></button>
      <main class="stream" id="stream" role="log" aria-live="polite" aria-relevant="additions" aria-label="있잖아와 나눈 대화"></main>
      <div class="dock" id="dock">
        <div class="tray-wrap" id="tray-wrap"><section class="tray" id="tray" aria-label="내가 골라 본 옷" inert></section></div>
        <form class="composer" id="composer" autocomplete="off">
          <label class="sr-only" for="q">상품 링크 붙여넣기</label>
          <input id="q" name="q" type="text" inputmode="url" enterkeyhint="send" placeholder="상품 링크 붙여넣기" spellcheck="false" autocapitalize="off">
          <button class="go" id="go" type="submit" aria-expanded="false" aria-controls="tray">골라 줘</button>
        </form>
      </div>
      <div class="layer" id="layer" hidden></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const shell = $('.shell');
  const top = $('#top');
  const stream = $('#stream');
  const dock = $('#dock');
  const trayWrap = $('#tray-wrap');
  const tray = $('#tray');
  const form = $('#composer');
  const input = $('#q');
  const go = $('#go');
  const layer = $('#layer');
  const hist = $('#hist');
  const cnt = $('#cnt');
  const typingSr = $('#typing-sr');

  const setVar = () => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
  try { new ResizeObserver(setVar).observe(dock); } catch { addEventListener('resize', setVar); }
  setVar();

  // ── entries → HTML
  function lookHtml(e, l) {
    return `<figure class="look">
      <div class="look-row">${l.items.map((it, i) => (it.c
        ? `<span class="pc is-cand" style="--i:${i}"><span class="ph">${tile(P.product(e.pid))}</span><span class="pc-l">이거</span></span>`
        : `<span class="pc" style="--i:${i}"><span class="ph">${tile(it.g)}</span><span class="pc-l">${esc(P.shortKind(it.g))}${it.g.ex ? '<span class="pc-ex">예시</span>' : ''}</span></span>`)).join('')}</div>
      <figcaption><span class="cap-t">${esc(l.title)}</span>${l.isNew ? '' : '<span class="cap-s">이미 되는 코디에 하나 더</span>'}</figcaption>
    </figure>`;
  }
  function productCard(p, cls = 'card') {
    return `<button class="${cls}" type="button" data-act="ask" data-pid="${esc(p.id)}">
      ${tile(p)}
      <span class="card-b">${esc(p.brand)}</span>
      <span class="card-n">${esc(p.name)}</span>
      <span class="card-p">${esc(P.price(p.price))}</span>
    </button>`;
  }
  function pickerGrid(e) {
    return P.ownables(e.cat, { limit: 9 }).map((p) => {
      const on = P.owns(p);
      return `<button class="pk${on ? ' on' : ''}" type="button" data-act="own" data-pid="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(kc(p))} · ${esc(p.name)}">
        <span class="ph">${tile(p)}<span class="ck">${CHECK}</span></span>
        <span class="pk-l">${esc(kc(p))}</span>
      </button>`;
    }).join('');
  }
  const pickerCats = () => CAT_ORDER.filter((c) => P.ownables(c, { limit: 1 }).length);
  function pickedCount(e) { return e.mode === 'more' ? Math.max(0, garments().length - (e.base || 0)) : garments().length; }
  function pickedLabel(e) {
    const n = pickedCount(e);
    if (e.mode === 'more') return n ? `${n}벌 더 골랐어` : '하나씩 톡톡';
    return n ? `${n}벌 골랐어` : '하나도 안 골랐어';
  }

  function html(e) {
    switch (e.t) {
      case 'f': return `<p class="m m-f" data-id="${e.id}">${fmt(e.text)}</p>`;
      case 's': return `<p class="m m-s" data-id="${e.id}">${esc(e.text)}</p>`;
      case 'note': {
        const p = P.product(e.pid);
        return `<p class="m m-note" data-id="${e.id}">종류랑 색으로만 맞춰 봤어. 크기·옷감·지금 가격은 나도 몰라. 사기 전에 파는 곳에서 꼭 봐 줘. ${p?.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">파는 곳 가 보기${ARROW}</a>` : ''}</p>`;
      }
      case 'u': return `<div class="m m-u" data-id="${e.id}"><span class="pill">${esc(e.text)}</span></div>`;
      case 'up': {
        const p = P.product(e.pid);
        if (!p) return `<div class="m m-u" data-id="${e.id}"><span class="pill">상품</span></div>`;
        return `<div class="m m-u m-up" data-id="${e.id}"><div class="pchip">${tile(p, 'sm')}<span class="pchip-t"><span class="pchip-b">${esc(p.brand)}</span><span class="pchip-n">${esc(p.name)}</span><span class="pchip-p">${esc(P.price(p.price))}</span></span></div></div>`;
      }
      case 'looks': {
        const shown = e.looks.slice(0, 2);
        const rest = e.looks.slice(2);
        return `<div class="m att att-looks" data-id="${e.id}">
          ${shown.map((l) => lookHtml(e, l)).join('')}
          ${rest.length ? `<div class="looks-more" id="more-${e.id}" hidden>${rest.map((l) => lookHtml(e, l)).join('')}</div>
          <button class="more" type="button" data-act="more" aria-expanded="false" aria-controls="more-${e.id}">+${rest.length}개 더</button>` : ''}
        </div>`;
      }
      case 'over': {
        const p = P.product(e.pid);
        return `<figure class="m att att-over" data-id="${e.id}">
          <div class="over-row">
            <span class="pc is-own"><span class="ph">${tile(e.g)}</span><span class="pc-l">네 옷장${e.g.ex ? '<span class="pc-ex">예시</span>' : ''}</span></span>
            <span class="eq" aria-hidden="true"><i></i><i></i></span>
            <span class="pc is-cand"><span class="ph">${tile(p)}</span><span class="pc-l">이거</span></span>
          </div>
          <figcaption><span class="cap-t">${e.same ? '같은 상품' : '같은 종류 · 같은 색'}</span><span class="cap-s">${esc(kc(e.g))}${e.more ? ` 외 ${e.more}벌` : ''}</span></figcaption>
        </figure>`;
      }
      case 'closet': return `<figure class="m att att-closet" data-id="${e.id}">
          <div class="closet-row">${e.gs.map((g, i) => `<span class="cl" style="--i:${i}">${tile(g)}</span>`).join('')}</div>
          <figcaption><span class="cap-t">${e.example ? '예시 옷장' : '네 옷장'}</span><span class="cap-s">${e.gs.length}벌${e.example ? ' · 언제든 네 옷으로 바꿔도 돼' : ''}</span></figcaption>
        </figure>`;
      case 'found': {
        const items = e.pids.map((id) => P.product(id)).filter(Boolean);
        return `<div class="m att att-found" data-id="${e.id}"><div class="found-row">${items.map((p) => productCard(p, 'card card-s')).join('')}</div></div>`;
      }
      case 'chips': {
        const btn = (o, i) => `<button class="chip${o.lead ? ' lead' : ''}" type="button" data-act="chip" data-i="${i}" style="--i:${i}">${esc(o.label)}</button>`;
        const lead = e.opts.map((o, i) => [o, i]).filter(([o]) => o.lead);
        const rest = e.opts.map((o, i) => [o, i]).filter(([o]) => !o.lead);
        return `<div class="m m-chips" data-id="${e.id}" role="group" aria-label="대답 고르기">${lead.map(([o, i]) => btn(o, i)).join('')}${rest.length ? `<div class="chip-row" style="--n:${rest.length}">${rest.map(([o, i]) => btn(o, i)).join('')}</div>` : ''}</div>`;
      }
      case 'picker': {
        const cats = pickerCats();
        if (!cats.includes(e.cat)) e.cat = cats[0];
        return `<div class="m att att-picker" data-id="${e.id}">
          <div class="pk-head"><div class="cats" role="group" aria-label="종류">${cats.map((c) => `<button class="cat${c === e.cat ? ' on' : ''}" type="button" data-act="cat" data-cat="${c}" aria-pressed="${c === e.cat}">${esc(P.cats[c])}</button>`).join('')}</div></div>
          <p class="pk-count" aria-live="polite">${esc(pickedLabel(e))}</p>
          <div class="pk-grid">${pickerGrid(e)}</div>
        </div>`;
      }
      case 'div': return `<div class="m m-div" data-id="${e.id}"><span>${esc(e.text)}</span></div>`;
      default: return '';
    }
  }

  // ── stream
  function el(markup) { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstElementChild; }
  function add(e, fresh = true) {
    e.id = e.id || nid();
    log.push(e);
    saveLog();
    const node = el(html(e));
    if (!node) return null;
    if (fresh && !RM) node.classList.add('is-new');
    stream.insertBefore(node, typingEl && typingEl.isConnected ? typingEl : null);
    follow();
    return node;
  }
  function removeEntry(id, { animate = true } = {}) {
    log = log.filter((e) => e.id !== id);
    saveLog();
    const node = stream.querySelector(`[data-id="${id}"]`);
    if (!node) return;
    if (!animate || RM) { node.remove(); return; }
    node.style.height = `${node.offsetHeight}px`;
    node.classList.add('is-leaving');
    requestAnimationFrame(() => { node.style.height = '0px'; });
    setTimeout(() => node.remove(), 260);
  }
  function clearPending() {
    log.filter((e) => e.t === 'chips' || e.t === 'picker').forEach((e) => removeEntry(e.id));
  }
  function renderAll() {
    const head = book.trimmed ? `<p class="m m-top">최근 대화 ${KEEP}개까지 기억해.</p>` : '';
    stream.innerHTML = head + log.map(html).join('');
  }

  // Keep the start of the current turn in view: scroll down to show what's new,
  // but never past the message that started the turn.
  let anchor = null;
  function follow(force = false) {
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    let target = max;
    if (!force && anchor && anchor.isConnected) {
      const t = anchor.getBoundingClientRect().top + scrollY - top.offsetHeight - 16;
      target = Math.min(max, t);
    }
    if (target > scrollY + 2) scrollTo({ top: target, behavior: RM ? 'auto' : 'smooth' });
  }

  // ── the friend speaks: lines one by one after a typing indicator
  let chain = Promise.resolve();
  let typingEl = null;
  const act = (fn) => { chain = chain.then(fn).catch((err) => console.error(err)); return chain; };
  function setTyping(on) {
    shell.classList.toggle('is-typing', on);
    typingSr.textContent = on ? '입력 중' : '';
    if (on && !typingEl) {
      typingEl = el('<div class="m m-typing" aria-hidden="true"><i></i><i></i><i></i></div>');
      stream.append(typingEl);
      follow();
    }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  async function run(steps) {
    for (const raw of steps) {
      const s = typeof raw === 'string' ? { t: 'f', text: raw } : raw;
      if (s.t === 'f') {
        setTyping(true);
        await wait(380 + Math.min(260, s.text.length * 9));
        setTyping(false);
        add(s);
        await wait(70);
      } else {
        await wait(s.t === 'chips' ? 180 : 240);
        add(s);
        if (s.t !== 'chips') await wait(s.t === 'looks' || s.t === 'over' ? 420 : 160);
      }
    }
  }
  const say = (steps) => run(steps);
  const userSays = (text) => { anchor = add({ t: 'u', text }); };

  // ── closet count in the top bar
  let lastCount = null;
  function updateCount() {
    const n = garments().length;
    cnt.textContent = n;
    $('.closet-btn').setAttribute('aria-label', `옷장 ${n}벌 열기`);
    if (lastCount !== null && n !== lastCount && !RM) {
      const b = $('.closet-btn');
      b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }
    lastCount = n;
    form.classList.toggle('is-off', !P.record.started);
    input.disabled = !P.record.started;
    go.disabled = !P.record.started;
  }

  // ── scripts
  function firstRun() {
    anchor = null;
    return act(() => say([
      '안녕.',
      '옷 사기 전에 나한테 먼저 물어봐.',
      '남자 옷 봐 줄까, 여자 옷 봐 줄까?',
      { t: 'chips', opts: [{ label: '남성 옷', a: 'gender', v: 'M' }, { label: '여성 옷', a: 'gender', v: 'F' }] },
    ]));
  }
  async function chooseGender(g) {
    P.start(g);
    exIds = new Set(); saveEx();
    updateCount();
    await say([
      '네 옷장부터 알려 줘.',
      '가진 거랑 비슷한 걸 톡톡 골라 줘.',
      { t: 'picker', mode: 'first', cat: 'top' },
      { t: 'chips', opts: [{ label: '다 골랐어', a: 'pickDone', lead: true }, { label: '예시 옷장으로 해 볼래', a: 'example' }] },
    ]);
  }
  const invite = '궁금한 옷 있으면 링크 붙여 줘. 아니면 내가 하나 골라 볼게.';
  async function pickDone() {
    const n = garments().length;
    if (!n) {
      await say(['아직 하나도 안 골랐어.', '한 벌만 골라도 돼. 아니면 예시 옷장으로 해 볼래?',
        { t: 'chips', opts: [{ label: '다 골랐어', a: 'pickDone', lead: true }, { label: '예시 옷장으로 해 볼래', a: 'example' }] }]);
      return;
    }
    log.filter((e) => e.t === 'picker').forEach((e) => removeEntry(e.id));
    await say([`좋아, ${n}벌 기억했어.`, { t: 'closet', gs: garments().map(snap), example: false }, invite]);
    openTray();
  }
  async function useExample() {
    log.filter((e) => e.t === 'picker').forEach((e) => removeEntry(e.id));
    P.startExample(P.record.gender || 'M');
    exIds = new Set(garments().map((g) => g.id)); saveEx();
    updateCount();
    await say([`좋아, 예시 옷장 ${garments().length}벌 기억했어.`, { t: 'closet', gs: garments().map(snap), example: true }, invite]);
    openTray();
  }

  const decisionChips = (p, extra = []) => ({ t: 'chips', opts: [...extra,
    { label: '살래', a: 'decide', v: 'buy', pid: p.id }, { label: '좀 더 볼래', a: 'decide', v: 'hold', pid: p.id }, { label: '안 살래', a: 'decide', v: 'skip', pid: p.id }] });

  async function judgeTurn(p) {
    let j;
    try { j = P.judge(p); } catch {
      await say(['이건 내가 비교를 못 하겠어.', { t: 's', text: '코디 비교에 쓰지 않는 상품이에요.' }, { t: 'note', pid: p.id }]);
      return;
    }
    const looks = j.looks.slice(0, 6).map((l) => ({
      title: l.title, isNew: l.isNew,
      items: l.items.map((it) => (it.candidate ? { c: 1 } : { g: snap(it.garment) })),
    }));
    const n = j.looks.length;
    const steps = [];
    if (j.verdict === 'yes') {
      steps.push('있잖아,', '이거 네 옷장이랑 *잘 맞아.*', n > 1 ? `가진 옷이랑 ${n}가지로 바로 입을 수 있어.` : '가진 옷이랑 바로 입을 수 있어.', { t: 'looks', pid: p.id, looks });
    } else if (j.verdict === 'overlap') {
      const o = j.overlaps[0];
      steps.push('있잖아,', '비슷한 거 이미 ~있잖아.~', { t: 'over', pid: p.id, g: snap(o), same: o.productId === p.id, more: j.overlaps.length - 1 });
      if (n) steps.push('입을 데는 있는데, 겹치긴 해.', { t: 'looks', pid: p.id, looks });
    } else if (j.empty) {
      steps.push('음…', '네 옷장이 아직 비어 있어.', '가진 옷을 알려 주면 바로 봐 줄게.');
    } else {
      steps.push('음…', '같이 입을 옷을 네 옷장에서 아직 못 찾았어.', '비슷한 걸 가지고 있으면 알려 줘. 다시 봐 줄게.');
    }
    const prev = P.decisionOf(p);
    if (prev) steps.push({ t: 's', text: `전에 '${DEC[prev]}'라고 했던 옷이야.` });
    steps.push({ t: 'note', pid: p.id });
    steps.push(decisionChips(p, j.verdict === 'unsure' ? [{ label: '옷장 더 알려 줄게', a: 'more', pid: p.id, lead: true }] : []));
    await say(steps);
  }
  function ask(p) {
    if (!p) return;
    closeTray();
    act(async () => {
      clearPending();
      anchor = add({ t: 'up', pid: p.id });
      P.buzz(8);
      await judgeTurn(p);
    });
  }
  async function decide(pid, v) {
    const p = P.product(pid);
    if (!p) return;
    const had = P.owns(p);
    P.decide(p, v);
    updateCount();
    if (layerOpen) renderSheet();
    const lines = v === 'buy' ? ['알았어, 기억해 둘게.', ...(P.meta.addOnBuy && !had ? ['옷장에 넣어 뒀어.'] : [])]
      : v === 'hold' ? ['그래, 천천히 봐.'] : ['잘 참았어.'];
    await say([...lines, { t: 'chips', opts: [{ label: '다른 것도 골라 줘', a: 'tray', lead: true }] }]);
  }
  async function tellMore(pid) {
    const p = P.product(pid);
    const cat = PAIR[P.category(p)] || 'top';
    await say(['좋아. 비슷한 거 톡톡 골라 줘.', { t: 'picker', mode: 'more', pid, base: garments().length, cat },
      { t: 'chips', opts: [{ label: '다 골랐어', a: 'moreDone', pid, lead: true }] }]);
  }
  async function moreDone(pid) {
    const picker = log.find((e) => e.t === 'picker');
    const added = picker ? pickedCount(picker) : 0;
    log.filter((e) => e.t === 'picker').forEach((e) => removeEntry(e.id));
    const p = P.product(pid);
    if (!added) { await say(['알았어, 그대로 둘게.', ...(p ? [decisionChips(p)] : [])]); return; }
    await say([`좋아, ${added}벌 더 기억했어.`, '다시 볼게.']);
    if (p) await judgeTurn(p);
  }

  function onChip(entryId, i) {
    const e = log.find((x) => x.id === entryId);
    const o = e?.opts?.[i];
    if (!o) return;
    P.buzz(8);
    act(async () => {
      if (!log.some((x) => x.id === entryId)) return;
      removeEntry(entryId, { animate: false });
      userSays(o.label);
      if (o.a === 'gender') await chooseGender(o.v);
      else if (o.a === 'pickDone') await pickDone();
      else if (o.a === 'example') await useExample();
      else if (o.a === 'decide') await decide(o.pid, o.v);
      else if (o.a === 'more') await tellMore(o.pid);
      else if (o.a === 'moreDone') await moreDone(o.pid);
      else if (o.a === 'tray') openTray();
    });
  }

  // ── links and search from the composer
  const looksLikeLink = (s) => /^(https?:\/\/|www\.)/i.test(s) || /\b[a-z0-9-]+\.(com|co\.kr|kr|net|shop|store)\b/i.test(s);
  function submitText(raw) {
    const text = raw.trim();
    if (!text) return;
    input.value = '';
    syncGo();
    closeTray();
    if (looksLikeLink(text)) {
      const r = P.fromLink(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      if (r.product) { ask(r.product); return; }
      act(async () => {
        clearPending();
        userSays(text);
        await say(['그 링크는 내가 못 읽어.', { t: 's', text: r.error || '상품 링크를 확인해 주세요.' }, '무신사 상품 링크면 돼. 아니면 내가 골라 줄게.',
          { t: 'chips', opts: [{ label: '골라 줘', a: 'tray', lead: true }] }]);
      });
      return;
    }
    const q = clean(text).slice(0, 40);
    const found = P.search(q, { limit: 8 }).filter((p) => !P.owns(p));
    act(async () => {
      clearPending();
      userSays(text);
      if (found.length) await say([`‘${q}’ 찾아봤어.`, '이 중에 있어?', { t: 'found', pids: found.map((p) => p.id) }]);
      else await say([`‘${q}’, 그건 못 찾았어.`, '상품 링크를 붙여 주면 바로 봐 줄게.', { t: 'chips', opts: [{ label: '골라 줘', a: 'tray' }] }]);
    });
  }
  function syncGo() {
    const has = !!input.value.trim();
    go.textContent = has ? '물어볼게' : '골라 줘';
    go.classList.toggle('is-send', has);
    if (has) go.removeAttribute('aria-expanded'); else go.setAttribute('aria-expanded', String(trayOpen));
  }
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (input.value.trim()) submitText(input.value);
    else if (trayOpen) closeTray(); else openTray();
  });
  input.addEventListener('input', syncGo);
  input.addEventListener('paste', () => setTimeout(() => { if (looksLikeLink(input.value.trim())) submitText(input.value); }, 0));

  // ── tray of candidates above the composer
  let trayOpen = false;
  function openTray() {
    if (!P.record.started) return;
    const items = P.candidates({ limit: 10 });
    tray.innerHTML = `
      <div class="tray-h"><p><b>내가 골라 봤어</b><span>네 옷장 기준으로 볼 만한 거</span></p>
        <button class="x" type="button" data-act="tray-close" aria-label="닫기">${CLOSE}</button></div>
      ${items.length ? `<div class="tray-row">${items.map((p, i) => productCard(p).replace('class="card"', `class="card" style="--i:${i}"`)).join('')}</div>`
        : '<p class="tray-empty">지금은 골라 줄 게 없어. 링크를 붙여 줘.</p>'}`;
    trayOpen = true;
    tray.inert = false;
    trayWrap.classList.add('open');
    syncGo();
    setTimeout(() => follow(true), RM ? 0 : 120);
  }
  function closeTray() {
    if (!trayOpen) return;
    trayOpen = false;
    tray.inert = true;
    trayWrap.classList.remove('open');
    syncGo();
  }

  // ── closet sheet: "네 옷장"
  let layerOpen = false;
  let sheet = { cat: null, records: false, confirm: false };
  let lastFocus = null;
  function sheetBody() {
    const gs = garments();
    const decs = [...P.record.decisions].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const count = (k) => decs.filter((d) => d.decision === k).length;
    const skipSum = decs.filter((d) => d.decision === 'skip' && Number.isFinite(d.price)).reduce((s, d) => s + d.price, 0);
    const cats = pickerCats();
    if (!cats.includes(sheet.cat)) sheet.cat = cats[0];
    const anyEx = gs.some((g) => exIds.has(g.id));
    return `
      <div class="sh-head">
        <h2 id="sh-title" tabindex="-1">네 옷장 <span>${gs.length}벌</span></h2>
        <button class="x" type="button" data-act="sheet-close" aria-label="닫기">${CLOSE}</button>
      </div>
      <button class="tally" type="button" data-act="records" aria-expanded="${sheet.records}" ${decs.length ? '' : 'disabled'}>
        <span>살래 <b>${count('buy')}</b> · 볼래 <b>${count('hold')}</b> · 안 살래 <b>${count('skip')}</b></span>
        ${decs.length ? `<span class="tally-more">${sheet.records ? '접기' : '기록 보기'}</span>` : ''}
      </button>
      ${sheet.records && decs.length ? `<div class="recs">
        <ul>${decs.map((d) => { const p = P.product(d.productId); if (!p) return ''; return `<li><button type="button" class="rec" data-act="ask-from-sheet" data-pid="${esc(p.id)}">
          ${tile(p, 'xs')}<span class="rec-t"><span class="rec-n">${esc(p.name)}</span><span class="rec-p">${esc(P.price(d.price))}</span></span><span class="rec-d d-${d.decision}">${DEC_SHORT[d.decision]}</span></button></li>`; }).join('')}</ul>
        ${count('skip') ? `<p class="recs-sum">안 살래 기록한 가격 합계 <b>${esc(P.price(skipSum))}</b></p>` : ''}
      </div>` : ''}
      ${anyEx ? '<p class="sh-ex">‘예시’는 예시 옷장 옷이야. 빼고 네 옷으로 바꿔도 돼.</p>' : ''}
      ${gs.length ? `<ul class="sh-grid">${gs.map((g) => `<li class="sh-g" data-gid="${esc(g.id)}">
          <span class="ph">${tile(g)}</span>
          <span class="sh-l">${esc(kc(g))}${exIds.has(g.id) ? '<span class="pc-ex">예시</span>' : ''}</span>
          <button class="rm" type="button" data-act="remove" data-gid="${esc(g.id)}" aria-label="${esc(kc(g))} 빼기">${CLOSE}</button>
        </li>`).join('')}</ul>` : '<p class="sh-empty">아직 비어 있어. 아래에서 가진 거랑 비슷한 걸 골라 줘.</p>'}
      <section class="sh-add" aria-labelledby="sh-add-t">
        <h3 id="sh-add-t">더 알려 줘 <span>가진 거랑 비슷한 걸 톡톡</span></h3>
        <div class="cats" role="group" aria-label="종류">${cats.map((c) => `<button class="cat${c === sheet.cat ? ' on' : ''}" type="button" data-act="sheet-cat" data-cat="${c}" aria-pressed="${c === sheet.cat}">${esc(P.cats[c])}</button>`).join('')}</div>
        <div class="pk-grid">${P.ownables(sheet.cat, { limit: 12 }).map((p) => { const on = P.owns(p); return `<button class="pk${on ? ' on' : ''}" type="button" data-act="sheet-own" data-pid="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(kc(p))} · ${esc(p.name)}">
          <span class="ph">${tile(p)}<span class="ck">${CHECK}</span></span><span class="pk-l">${esc(kc(p))}</span></button>`; }).join('')}</div>
      </section>
      <div class="sh-reset">${sheet.confirm
        ? `<p>옷장이랑 대화를 다 지울까?</p><div><button type="button" class="chip danger" data-act="reset-yes">지울래</button><button type="button" class="chip" data-act="reset-no">아니</button></div>`
        : '<button type="button" class="reset-link" data-act="reset">처음부터 다시</button>'}</div>`;
  }
  function renderSheet() {
    const box = layer.querySelector('.sheet-in');
    if (!box) return;
    const y = box.scrollTop;
    box.innerHTML = sheetBody();
    box.scrollTop = y;
  }
  function openSheet() {
    if (layerOpen) return;
    closeTray();
    lastFocus = document.activeElement;
    layerOpen = true;
    sheet = { cat: sheet.cat, records: false, confirm: false };
    layer.innerHTML = `<div class="scrim" data-act="sheet-close"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-title"><div class="grab" aria-hidden="true"></div><div class="sheet-in">${sheetBody()}</div></section>`;
    layer.hidden = false;
    for (const n of [top, stream, dock, hist]) n.inert = true;
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));
    setTimeout(() => layer.querySelector('#sh-title')?.focus({ preventScroll: true }), RM ? 0 : 60);
  }
  function closeSheet() {
    if (!layerOpen) return;
    layerOpen = false;
    layer.classList.remove('open');
    for (const n of [top, stream, dock, hist]) n.inert = false;
    setTimeout(() => { if (!layerOpen) { layer.hidden = true; layer.innerHTML = ''; } }, RM ? 0 : 320);
    (lastFocus && lastFocus.isConnected ? lastFocus : $('.closet-btn')).focus({ preventScroll: true });
  }

  function toggleOwn(p) {
    if (P.owns(p)) {
      const g = garments().find((x) => x.productId === p.id);
      P.removeOwned(p.id);
      if (g) { exIds.delete(g.id); saveEx(); }
    } else P.addOwned(p);
    P.buzz(6);
    updateCount();
  }
  function refreshPickers() {
    stream.querySelectorAll('.att-picker').forEach((node) => {
      const e = log.find((x) => x.id === node.dataset.id);
      if (!e) return;
      node.querySelectorAll('.pk').forEach((b) => {
        const on = P.owns(P.product(b.dataset.pid));
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      node.querySelector('.pk-count').textContent = pickedLabel(e);
    });
  }

  function reset() {
    P.reset();
    exIds = new Set(); saveEx();
    log = []; book = { v: 1, at: 0, trimmed: false, items: [] }; saveLog();
    chain = Promise.resolve();
    anchor = null;
    setTyping(false);
    closeSheet();
    closeTray();
    renderAll();
    updateCount();
    scrollTo({ top: 0 });
    firstRun();
  }

  // ── history chip: "지난 대화 n"
  function updateHist() {
    const limit = top.offsetHeight;
    const above = [...stream.querySelectorAll('.m-up, .m-u')].filter((n) => n.getBoundingClientRect().bottom < limit).length;
    const up = scrollY < lastY - 2;
    if (Math.abs(scrollY - lastY) > 2) goingUp = up;
    lastY = scrollY;
    const show = above > 0 && scrollY > 240 && goingUp;
    if (show) hist.innerHTML = `지난 대화 <b>${above}</b>`;
    hist.hidden = !show;
    top.classList.toggle('is-scrolled', scrollY > 4);
  }
  let histRaf = 0;
  let lastY = 0;
  let goingUp = false;
  addEventListener('scroll', () => { if (!histRaf) histRaf = requestAnimationFrame(() => { histRaf = 0; updateHist(); }); }, { passive: true });

  // ── events
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const a = t.dataset.act;
    if (a === 'chip') onChip(t.closest('[data-id]').dataset.id, Number(t.dataset.i));
    else if (a === 'ask') ask(P.product(t.dataset.pid));
    else if (a === 'ask-from-sheet') { closeSheet(); ask(P.product(t.dataset.pid)); }
    else if (a === 'more') {
      const box = t.parentElement.querySelector('.looks-more');
      const open = box.hidden;
      box.hidden = !open;
      if (open && !RM) box.classList.add('is-new');
      t.setAttribute('aria-expanded', String(open));
      t.textContent = open ? '접기' : `+${box.querySelectorAll('.look').length}개 더`;
    } else if (a === 'cat') {
      const node = t.closest('[data-id]');
      const e = log.find((x) => x.id === node.dataset.id);
      if (!e) return;
      e.cat = t.dataset.cat; saveLog();
      node.querySelectorAll('.cat').forEach((b) => { const on = b.dataset.cat === e.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      const grid = node.querySelector('.pk-grid');
      grid.innerHTML = pickerGrid(e);
      if (!RM) { grid.classList.remove('swap'); void grid.offsetWidth; grid.classList.add('swap'); }
    } else if (a === 'own') {
      const p = P.product(t.dataset.pid);
      if (!p) return;
      toggleOwn(p);
      refreshPickers();
    } else if (a === 'tray-close') closeTray();
    else if (a === 'closet') openSheet();
    else if (a === 'sheet-close') closeSheet();
    else if (a === 'records') { sheet.records = !sheet.records; renderSheet(); }
    else if (a === 'sheet-cat') { sheet.cat = t.dataset.cat; renderSheet(); }
    else if (a === 'sheet-own') {
      const p = P.product(t.dataset.pid);
      if (!p) return;
      toggleOwn(p); renderSheet(); refreshPickers();
    } else if (a === 'remove') {
      const id = t.dataset.gid;
      const li = t.closest('.sh-g');
      const done = () => { P.removeOwned(id); exIds.delete(id); saveEx(); updateCount(); renderSheet(); refreshPickers(); };
      P.buzz(10);
      if (RM || !li) done(); else { li.classList.add('is-leaving'); setTimeout(done, 200); }
    } else if (a === 'reset') { sheet.confirm = true; renderSheet(); layer.querySelector('[data-act="reset-no"]')?.focus(); }
    else if (a === 'reset-no') { sheet.confirm = false; renderSheet(); layer.querySelector('[data-act="reset"]')?.focus(); }
    else if (a === 'reset-yes') reset();
    else if (a === 'history') {
      scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
      stream.querySelector('.m')?.setAttribute('tabindex', '-1');
    }
  });
  addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (layerOpen) closeSheet(); else if (trayOpen) closeTray();
  });

  // ── boot
  function boot() {
    updateCount();
    if (!P.record.started) {
      log = []; book = { v: 1, at: 0, trimmed: false, items: [] }; saveLog();
      renderAll();
      firstRun();
      return;
    }
    // Restored conversation: no typing delays, land at the latest message.
    const lastAt = book.at || 0;
    renderAll();
    requestAnimationFrame(() => { scrollTo({ top: document.documentElement.scrollHeight }); updateHist(); });
    if (!log.length || Date.now() - lastAt > 30 * 60 * 1000) {
      const d = new Date();
      act(async () => {
        if (log.length) add({ t: 'div', text: `${d.getMonth() + 1}월 ${d.getDate()}일` }, false);
        anchor = null;
        await say(log.length > 1 ? ['또 왔네.', '궁금한 옷 있으면 링크 붙여 줘.'] : ['왔네.', invite]);
      });
    }
  }
  boot();
})();
