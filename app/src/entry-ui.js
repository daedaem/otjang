// Photo-first registration. User-picked photos stay local; unknown attributes stay unknown.
const EASY_COMMON = [['top', 'tee'], ['top', 'shirt'], ['top', 'knit'], ['outer', 'jacket'], ['bottom', 'denim'], ['bottom', 'slacks'], ['dress', 'dress'], ['shoes', 'sneaker']];
// Route existing photo-entry buttons to the same compact flow.
$('#bulkFile').addEventListener('click', (event) => { event.preventDefault(); openEasyEntry(); });
const detailedQuickItem = openQuickItem;
openQuickItem = function (item, status, options) {
  if (!item && status === 'owned') return openEasyEntry(options);
  return detailedQuickItem(item, status, options);
};
function openEasyEntry(options) {
  options ||= {};
  if ($('#easyEntry')) { $('#easyEntry').focus(); return; }
  const target = state, scope = accountScope(), opener = document.activeElement;
  const entry = { phase: options.withoutPhoto ? 'kind' : 'photo', img: '', cat: '', kind: null, busy: false, closed: false, generation: 0, error: '', saved: null, id: '' };
  const sameActor = () => state === target && accountScope() === scope;
  const dlg = h('dialog', { id: 'easyEntry', class: 'easy-entry-dialog', 'aria-labelledby': 'easyEntryTitle' });
  const body = h('div', { class: 'dbody' }), footer = h('div', { class: 'dfoot' });
  const title = h('h2', { id: 'easyEntryTitle', text: '내 옷 한 벌 추가' });
  const back = h('button', { class: 'entry-back', type: 'button', text: '이전', onclick: () => { if (!entry.busy) { entry.phase = 'photo'; entry.error = ''; drawEntry(); } } });
  const close = () => { if (entry.busy) return; entry.closed = true; entry.generation++; dlg.close(); dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  const closeButton = h('button', { class: 'entry-back', type: 'button', text: '닫기', 'aria-label': '옷 추가 닫기', onclick: close });
  dlg.append(h('div', { class: 'dhead' }, back, title, closeButton), body, footer);
  dlg.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  const file = h('input', { id: 'easyPhotoInput', type: 'file', accept: 'image/*', hidden: true });
  const supportsFiles = typeof window.File !== 'undefined' && typeof URL.createObjectURL === 'function';
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; file.value = ''; if (!selected || entry.busy) return;
    entry.error = '';
    if (selected.size > 20 * 1024 * 1024) { entry.error = '사진이 20MB를 넘어요. 더 작은 사진을 골라 주세요.'; drawEntry(); return; }
    if (selected.type && !selected.type.startsWith('image/')) { entry.error = '이미지 파일을 골라 주세요.'; drawEntry(); return; }
    const generation = ++entry.generation; entry.busy = true; drawEntry(); let timer;
    try {
      const img = await Promise.race([readImage(selected, 480), new Promise((resolve) => { timer = setTimeout(() => resolve(null), 12000); })]);
      if (entry.closed || generation !== entry.generation) return;
      if (!sameActor()) throw new Error('옷장이 바뀌었어요. 화면을 닫고 다시 추가해 주세요.');
      if (!img || !W.safeImg(img)) throw new Error('사진을 읽지 못했어요. 다른 사진을 고르거나 사진 없이 시작해 주세요.');
      entry.img = img; entry.phase = 'kind';
    } catch (error) { if (!entry.closed) entry.error = error.message || '사진을 읽지 못했어요. 다른 사진을 골라 주세요.'; }
    finally { clearTimeout(timer); entry.busy = false; if (!entry.closed) drawEntry(); }
  });
  dlg.append(file);
  const choosePhoto = () => { if (!entry.busy && supportsFiles) file.click(); };
  const photoPreview = (compact) => h('div', { class: 'entry-photo' + (compact ? ' compact' : '') + (!entry.img ? ' empty' : '') }, entry.img ? h('img', { src: entry.img, alt: '등록할 옷 사진' }) : '사진은 나중에 넣어도 돼요');
  const chooseKind = (cat, kind) => { if (entry.busy) return; entry.cat = cat; entry.kind = kind; entry.error = ''; drawEntry(false); dlg.querySelector('[data-easy-kind="' + cat + ':' + (kind || '') + '"]')?.focus({ preventScroll: true }); };
  const kindButton = (cat, kind) => h('button', { type: 'button', class: 'entry-kind', 'data-easy-kind': cat + ':' + (kind || ''), 'aria-pressed': entry.cat === cat && entry.kind === kind ? 'true' : 'false', disabled: entry.busy, onclick: () => chooseKind(cat, kind), text: kind ? KINDS[cat][kind] : CATS[cat] + ' · 종류 모름' });
  async function storeEntry() {
    if (entry.busy || entry.saved || !entry.cat || !Object.hasOwn(CATS, entry.cat)) return;
    if (!sameActor()) { entry.error = '옷장이 바뀌었어요. 화면을 닫고 다시 추가해 주세요.'; drawEntry(); return; }
    if (target.meta.sample) { entry.error = '예시 옷장을 보고 있어요. 닫은 뒤 「내 옷장으로 시작」을 눌러 주세요.'; drawEntry(); return; }
    entry.busy = true; entry.error = ''; drawEntry();
    try {
      let item = W.cleanItem({ id: entry.id || (entry.id = newId('i')), status: 'owned', cat: entry.cat, kind: entry.kind, name: entry.kind ? KINDS[entry.cat][entry.kind] : CATS[entry.cat], family: null, light: null, formality: null, pattern: null, seasons: [], attrSource: 'owner', draftNote: '직접 고른 종류만 등록했습니다. 확인하지 않은 색과 느낌은 추천에 사용하지 않습니다.' }, 0);
      if (!item) throw new Error('옷 종류를 다시 골라 주세요.');
      if (entry.img) item = W.setOwnPhoto(item, entry.img);
      const result = await commitEasyChanges([{ id: item.id, before: null, after: item }], { target, scope });
      if (!sameActor()) { entry.busy = false; close(); return; }
      if (!result.ok) throw new Error(result.message);
      entry.saved = item; entry.phase = 'done'; ui.tab = 'closet'; ui.cat = 'all'; ui.season = ''; render();
    } catch (error) {
      if (!sameActor()) { entry.busy = false; close(); return; }
      entry.error = error.message || '저장하지 못했어요. 사진과 선택은 남겨 두었습니다.';
    } finally { entry.busy = false; if (!entry.closed) drawEntry(); }
  }

  function drawEntry(moveFocus = true) {
    const otherOpen = body.querySelector('.entry-other')?.open;
    body.replaceChildren(); footer.replaceChildren(); closeButton.disabled = entry.busy;
    back.hidden = entry.phase !== 'kind'; back.disabled = entry.busy;
    const message = h('p', { id: 'easyEntryStatus', class: 'entry-status' + (entry.error ? ' error' : ''), role: entry.error ? 'alert' : 'status', 'aria-live': 'polite', text: entry.error || (entry.busy ? (entry.phase === 'photo' ? '사진을 읽고 있어요…' : '옷장에 저장하고 있어요…') : '') });
    body.setAttribute('aria-busy', entry.busy ? 'true' : 'false');
    if (entry.phase === 'photo') {
      body.append(h('h3', { class: 'entry-question', tabindex: '-1', text: '자주 입는 옷 한 벌을 보여 주세요.' }), h('p', { class: 'entry-sub', text: '브랜드나 상품명은 몰라도 괜찮아요. 사진 한 장으로 시작해요.' }), photoPreview(false));
      footer.append(h('button', { class: 'btn primary entry-primary', type: 'button', disabled: entry.busy, onclick: entry.img ? () => { entry.phase = 'kind'; drawEntry(); } : supportsFiles ? choosePhoto : () => { entry.phase = 'kind'; drawEntry(); }, text: entry.busy ? '사진을 읽는 중…' : entry.img ? '이 사진으로 계속' : supportsFiles ? '사진 고르기' : '사진 없이 계속' }));
      body.append(h('div', { class: 'entry-options' }, entry.img ? h('button', { class: 'entry-option', type: 'button', disabled: entry.busy, onclick: choosePhoto, text: '사진 바꾸기' }) : null, h('button', { class: 'entry-option', type: 'button', disabled: entry.busy, onclick: () => { entry.phase = 'kind'; drawEntry(); }, text: '사진 없이 종류만 선택' })));
      body.append(h('p', { class: 'entry-kind-note', text: supportsFiles ? '촬영이 열리지 않으면 저장된 사진을 골라 주세요. 사진은 이 브라우저 안에서 처리해요.' : '이 브라우저에서는 사진 선택을 지원하지 않아요. 종류만 등록하고 나중에 사진을 더할 수 있어요.' }));
    } else if (entry.phase === 'kind') {
      body.append(h('h3', { class: 'entry-question', tabindex: '-1', text: '어떤 옷인가요?' }), h('div', { class: 'entry-context' }, photoPreview(true), h('p', { class: 'entry-sub', text: entry.img ? '사진에서 등록할 한 벌의 종류만 골라 주세요.' : '한 벌의 종류만 골라 주세요. 사진은 나중에 더할 수 있어요.' })));
      body.append(h('div', { class: 'entry-kinds', role: 'group', 'aria-label': '자주 입는 옷 종류' }, EASY_COMMON.map(([cat, kind]) => kindButton(cat, kind))));
      const other = h('details', { class: 'entry-other', open: !!otherOpen }, h('summary', { text: '다른 종류 · 잘 모르겠어요' }));
      for (const cat of ['top', 'bottom', 'outer', 'dress', 'shoes']) { const remaining = Object.keys(KINDS[cat]).filter((kind) => !EASY_COMMON.some(([c, k]) => cat === c && kind === k)); other.append(h('h4', { class: 'entry-kind-heading', text: CATS[cat] }), h('div', { class: 'entry-kinds entry-kind-more' }, remaining.map((kind) => kindButton(cat, kind)), kindButton(cat, null))); }
      body.append(other, h('p', { class: 'entry-selected', role: 'status', text: entry.cat ? '선택한 옷: ' + (entry.kind ? KINDS[entry.cat][entry.kind] : CATS[entry.cat]) : '위에서 하나만 고르면 돼요.' }));
      if (entry.img) body.append(h('button', { class: 'entry-option', type: 'button', disabled: entry.busy, onclick: () => openEasyCrop(entry, dlg, drawEntry), text: '사진에 여러 옷이 있다면 한 벌만 잘라내기' }));
      body.append(h('p', { class: 'entry-kind-note', text: '색·브랜드·가격·사이즈는 지금 적지 않아도 돼요. 확인하지 않은 정보는 추천에 쓰지 않아요.' }));
      footer.append(h('button', { id: 'easyEntrySave', class: 'btn primary entry-primary', type: 'button', disabled: entry.busy || !entry.cat, onclick: storeEntry, text: entry.busy ? '저장하고 있어요…' : entry.cat ? (entry.img ? '이 사진의 ' : '') + (entry.kind ? KINDS[entry.cat][entry.kind] : CATS[entry.cat]) + ' 등록하기' : '옷장에 등록하기' }));
    } else {
      const item = entry.saved, actual = target.items.filter((row) => row.status === 'owned'); title.textContent = '내 옷장에 저장했어요';
      body.append(h('h3', { class: 'entry-question', tabindex: '-1', text: josa(item.name, '이', '가') + ' 옷장에 들어왔어요.' }), photoPreview(false), h('p', { class: 'entry-total', text: '지금 내 옷장에 ' + actual.length + '벌이 있어요.' }), h('div', { class: 'entry-counts' }, Object.entries(CATS).map(([cat, label]) => h('div', { class: 'entry-count' }, label, h('strong', { text: String(actual.filter((row) => row.cat === cat).length) })))), h('p', { class: 'entry-sub', text: '등록한 종류를 보고 새 상품을 살펴볼 수 있어요. 어울리는 코디까지 보려면 색과 느낌만 더 확인해 주세요.' }), h('button', { class: 'entry-option', type: 'button', onclick: () => { close(); if (sameActor() && byId(item.id)) openAttributeCheck([byId(item.id)], { onComplete: openNeeds }); }, text: '색과 느낌 확인하고 맞춤 추천 보기' }));
      footer.append(h('button', { class: 'btn primary entry-primary', type: 'button', onclick: () => { close(); if (sameActor()) { ui.tab = 'closet'; render(); openNeeds(); $('#main')?.focus({ preventScroll: true }); } }, text: '필요한 새 옷 추천 보기' }));
    }
    body.append(message);
    if (moveFocus && !entry.busy && dlg.open) body.querySelector('.entry-question')?.focus({ preventScroll: true });
  }
  document.body.append(dlg); drawEntry(); dlg.showModal(); body.querySelector('.entry-question')?.focus({ preventScroll: true });
}
function openEasyCrop(entry, entryDialog, redraw) {
  if (entry.busy || !entry.img || entry.closed || $('#easyEntryCrop')) return;
  const dlg = h('dialog', { id: 'easyEntryCrop', class: 'easy-entry-dialog', 'aria-labelledby': 'easyCropTitle' });
  const canvas = h('canvas', { class: 'entry-crop-canvas', 'aria-label': '등록할 옷의 영역 선택. 아래 숫자로도 조정할 수 있어요.' }), fields = h('div', { class: 'entry-crop-fields' });
  const values = { x: 0, y: 0, width: 100, height: 100 }, controls = {}, ctx = canvas.getContext('2d'), im = new Image(), error = h('p', { class: 'entry-status error', role: 'alert' });
  const apply = h('button', { class: 'btn primary entry-primary', type: 'button', disabled: true, text: '이 한 벌로 사용' }); let start = null;
  const draw = () => { if (!im.naturalWidth || !ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(im, 0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#dc6c42'; ctx.lineWidth = 3; ctx.strokeRect(values.x / 100 * canvas.width, values.y / 100 * canvas.height, values.width / 100 * canvas.width, values.height / 100 * canvas.height); };
  for (const [key, label] of [['x', '왼쪽 (%)'], ['y', '위 (%)'], ['width', '폭 (%)'], ['height', '높이 (%)']]) { const input = h('input', { type: 'number', min: key === 'x' || key === 'y' ? '0' : '1', max: '100', value: String(values[key]), 'aria-label': label, oninput: () => { values[key] = Math.max(0, Math.min(100, Number(input.value) || 0)); draw(); } }); controls[key] = input; fields.append(h('label', null, label, input)); }
  const point = (event) => { const bounds = canvas.getBoundingClientRect(); return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height }; };
  canvas.onpointerdown = (event) => { start = point(event); canvas.setPointerCapture(event.pointerId); };
  canvas.onpointermove = (event) => { if (!start) return; const rect = PhotoIntake.rect(start, point(event), canvas.width, canvas.height); for (const key of Object.keys(values)) { values[key] = Math.round(rect[key] / (key === 'x' || key === 'width' ? canvas.width : canvas.height) * 100); controls[key].value = String(values[key]); } draw(); };
  canvas.onpointerup = () => { start = null; }; canvas.onpointercancel = () => { start = null; };
  const close = () => { dlg.close(); dlg.remove(); if (entryDialog.open) entryDialog.querySelector('#easyEntrySave')?.focus({ preventScroll: true }); };
  apply.onclick = () => {
    if (entry.closed || entry.busy) { close(); return; }
    const width = Math.min(values.width, 100 - values.x), height = Math.min(values.height, 100 - values.y);
    if (width < 4 || height < 4) { error.textContent = '영역이 너무 작아요. 옷 한 벌 전체가 들어오게 골라 주세요.'; return; }
    try {
      const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(im.naturalWidth * width / 100)); out.height = Math.max(1, Math.round(im.naturalHeight * height / 100)); const c = out.getContext('2d'); if (!c) throw new Error('사진을 자르지 못했어요. 원래 사진으로 계속할 수 있어요.');
      c.drawImage(im, im.naturalWidth * values.x / 100, im.naturalHeight * values.y / 100, im.naturalWidth * width / 100, im.naturalHeight * height / 100, 0, 0, out.width, out.height);
      let img = out.toDataURL('image/webp', .82); if (!img.startsWith('data:image/webp')) img = out.toDataURL('image/jpeg', .85);
      if (!W.safeImg(img)) throw new Error('사진을 자르지 못했어요. 원래 사진으로 계속할 수 있어요.'); entry.img = img; close(); redraw();
    } catch (e) { error.textContent = e.message; }
  };
  dlg.append(h('div', { class: 'dhead' }, h('h2', { id: 'easyCropTitle', text: '한 벌만 남기기' }), h('button', { class: 'entry-back', type: 'button', text: '취소', onclick: close })), h('div', { class: 'dbody' }, h('p', { class: 'entry-sub', text: '옷 전체가 들어오게 드래그하거나 아래 숫자로 조정해 주세요.' }), canvas, fields, error), h('div', { class: 'dfoot' }, apply));
  dlg.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  im.onload = () => { if (!ctx) { error.textContent = '사진을 자르는 기능을 열지 못했어요. 원래 사진으로 계속할 수 있어요.'; return; } const scale = Math.min(1, 480 / Math.max(im.naturalWidth, im.naturalHeight)); canvas.width = Math.max(1, Math.round(im.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(im.naturalHeight * scale)); draw(); apply.disabled = false; };
  im.onerror = () => { error.textContent = '사진을 열지 못했어요. 원래 사진으로 계속할 수 있어요.'; }; document.body.append(dlg); dlg.showModal(); im.src = entry.img;
}

// Persist only the intended garment changes. Queued failed saves are repaired
// against the last successful snapshot of the original actor, never a new account.
function sameEasyValue(a, b) { return samePullValue(a, b); }
function undoEasyChanges(target, changes) {
  let retained = false;
  for (const change of changes) {
    const index = target.items.findIndex((row) => row.id === change.id); if (index < 0) continue;
    const current = target.items[index];
    if (!change.before) {
      if (sameEasyValue(current, change.after)) target.items.splice(index, 1);
      else retained = true;
      continue;
    }
    const next = { ...current };
    for (const group of change.groups || [change.keys || []]) {
      if (group.every((key) => sameEasyValue(current[key], change.after[key]))) {
        for (const key of group) next[key] = change.before[key];
      }
    }
    target.items[index] = next;
  }
  return retained;
}
async function repairEasySnapshot(operation) {
  const repair = async () => {
    const written = store.writtenSnapshots?.get(operation.scope), expected = store.persistedSnapshots.get(operation.scope);
    if (!written || written.target !== operation.target || !expected) return true;
    const durable = JSON.parse(written.data), before = JSON.stringify(durable); undoEasyChanges(durable, operation.changes);
    if (JSON.stringify(durable) === before) return true;
    const revision = ++store.revision, data = JSON.stringify({ ...durable, _storageRevision: revision });
    let local; try { local = window.localStorage; } catch (_) { /* inaccessible */ }
    const result = await SC.commitSnapshot({ db: store.db, mode: store.mode, idbKey: operation.scope, lsKey: operation.lsKey, expectedIdb: expected.idbValue, expectedLs: expected.lsValue, data, locks: navigator.locks, localStorage: local });
    if (!result.ok) { if (result.conflict) store.conflicts.add(operation.scope); return false; }
    store.persistedSnapshots.set(operation.scope, { idbValue: result.idbValue === undefined ? expected.idbValue : result.idbValue, lsValue: result.lsValue === undefined ? expected.lsValue : result.lsValue });
    store.writtenSnapshots.set(operation.scope, { ...written, data }); store.conflicts.delete(operation.scope); return true;
  };
  const pending = savePromise.then(repair, repair); savePromise = pending;
  try { return await pending === true; } catch (_) { return false; }
}
async function commitEasyChanges(changes, actor) {
  // The inverse baseline must never alias a live garment edited while saving.
  changes = changes.map((change) => ({ ...change, before: change.before ? JSON.parse(JSON.stringify(change.before)) : null, after: JSON.parse(JSON.stringify(change.after)), groups: change.groups?.map((group) => group.slice()), keys: change.keys?.slice() }));
  const operation = { target: actor.target, scope: actor.scope, lsKey: localStorageKey(), changes };
  const active = () => state === operation.target && accountScope() === operation.scope;
  await requireFreshStorage();
  if (!active()) throw new Error('확인 중 옷장이 바뀌었어요. 화면을 닫고 다시 시작해 주세요.');
  if (ui.pullSaving || ui.syncBusy) throw new Error('다른 기기와 옷장을 맞추는 중이에요. 끝난 뒤 다시 저장해 주세요.');
  const additions = changes.filter((change) => !change.before).length;
  if (!canAdd('items', additions, operation.target, true)) throw new Error(store.recoveryByScope?.has(operation.scope) ? '저장 자료를 먼저 복구해야 해요. 기록 탭에서 저장 상태를 확인해 주세요.' : '새 옷을 추가할 수 있는 수에 도달했어요. 기록 탭에서 백업 후 정리해 주세요.');
  for (const change of changes) {
    const current = operation.target.items.find((item) => item.id === change.id);
    if (change.before ? !current || !sameEasyValue(current, change.before) : !!current) throw new Error(change.before ? '확인 중 이 옷의 정보가 바뀌었어요. 다시 열어 최신 정보로 확인해 주세요.' : '이미 이 옷의 기록이 남아 있어요. 옷장에서 확인한 뒤 이어서 편집해 주세요.');
  }
  for (const change of changes) replaceItem(JSON.parse(JSON.stringify(change.after)));
  let saved = false;
  try { operation.save = save(); saved = await operation.save === true; } catch (_) { /* failed persistence must also undo */ }
  if (saved) return { ok: true };
  const retained = undoEasyChanges(operation.target, changes), repaired = await repairEasySnapshot(operation);
  return { ok: false, message: !repaired ? '저장과 복구 저장을 마치지 못했어요. 기록 탭에서 전체 백업을 받아 저장 상태를 확인해 주세요.' : retained ? '저장하지 못했어요. 등록 중 수정한 기록은 남겨 두었습니다. 기록 탭에서 저장 상태를 확인해 주세요.' : '저장하지 못했어요. 사진과 선택은 남겨 두었으니 다시 저장해 주세요.' };
}

// One garment at a time, only the attributes needed for a wardrobe comparison.
// Known manual values and confirmed product/photo claims are never rewritten.
function attributeDraft(item, options) {
  const missing = new Set(W.assessment(item, options).missing), draft = W.isDraft(item);
  const fields = ['kind', 'family', 'light', 'pattern', 'formality', 'seasons'].filter((field) => missing.has(field) || (draft && ['kind', 'family', 'light', 'pattern', 'formality'].includes(field)));
  return { item: JSON.parse(JSON.stringify(item)), fields, values: { kind: item.kind, family: item.family, light: item.light, pattern: item.pattern, formality: item.formality, seasons: item.seasons.slice() }, touched: new Set(), suggestion: null, quality: null, photoRead: false };
}
function attributeNext(draft) {
  const raw = { ...draft.item };
  for (const field of draft.fields) if (draft.touched.has(field)) raw[field] = draft.values[field];
  raw.attrSource = 'owner';
  const result = W.cleanItem(raw, 0);
  if (W.assessment(result).ready) { result.attrSource = 'owner-confirmed'; result.draftNote = '직접 고른 종류·색·밝기·무늬·입을 느낌을 확인했습니다.'; }
  else { result.attrSource = W.isDraft(draft.item) ? 'photo-draft' : draft.item.attrSource === 'owner-confirmed' ? 'owner' : draft.item.attrSource; }
  return result;
}
async function attributePhotoHint(img) {
  if (!img) return null;
  try {
    const im = await imageElement(img), canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
    ctx.drawImage(im, 0, 0, 96, 96); const pixels = ctx.getImageData(0, 0, 96, 96).data;
    const quality = PhotoIntake.quality(pixels, 96, 96, im.naturalWidth, im.naturalHeight), suggestion = quality.canSuggestColor ? G.guess(pixels, 96, 96) : null;
    return { quality, suggestion };
  } catch (_) { return null; }
}
function openAttributeCheck(items, options) {
  options ||= {};
  if ($('#attributeCheck')) { $('#attributeCheck').focus(); return; }
  const target = state, scope = accountScope(), opener = document.activeElement, actor = () => state === target && accountScope() === scope;
  const ids = [...new Set((items || []).map((item) => typeof item === 'string' ? item : item?.id).filter(Boolean))];
  const rows = ids.map((id) => target.items.find((item) => item.id === id)).filter(Boolean).filter((item) => !W.assessment(item, options).ready).map((item) => attributeDraft(item, options));
  if (!rows.length) { options.onComplete?.({ confirmed: ids, remaining: [] }); return; }
  let index = 0, busy = false, closed = false, error = '';
  const dlg = h('dialog', { id: 'attributeCheck', class: 'easy-entry-dialog', 'aria-labelledby': 'attributeTitle' }), body = h('div', { class: 'dbody' }), footer = h('div', { class: 'dfoot' });
  const title = h('h2', { id: 'attributeTitle' }), back = h('button', { class: 'entry-back', type: 'button', text: '이전', onclick: () => { if (!busy && index > 0) { index--; error = ''; draw(); } } });
  const close = () => { if (busy) return; closed = true; dlg.close(); dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  const cancel = h('button', { class: 'entry-back', type: 'button', text: '나중에', onclick: close });
  dlg.append(h('div', { class: 'dhead' }, back, title, cancel), body, footer);
  dlg.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  const set = (draft, fields, values) => { if (busy) return; for (const field of fields) { draft.values[field] = values[field]; draft.touched.add(field); } error = ''; draw(false); };
  const group = (label, children) => h('section', { class: 'attribute-group' }, h('h4', { text: label }), h('div', { class: 'attribute-options', role: 'group', 'aria-label': label }, children));
  const chip = (label, pressed, action, data) => h('button', { type: 'button', class: 'entry-kind attribute-chip', 'aria-pressed': pressed ? 'true' : 'false', disabled: busy, onclick: action, 'data-attribute-choice': data, text: label });
  async function confirm() {
    if (busy || closed) return;
    const draft = rows[index];
    if (!draft.fields.every((field) => draft.touched.has(field))) { error = '아는 값이나 「잘 모르겠어요」를 골라 주세요.'; draw(); return; }
    if (index + 1 < rows.length) { index++; draw(); return; }
    busy = true; error = ''; draw();
    try {
      const changes = rows.map((row) => { const after = attributeNext(row), keys = row.fields.concat(['attrSource', 'draftNote']); return { id: row.item.id, before: row.item, after, keys, groups: [['family', 'light'], keys.filter((key) => key !== 'family' && key !== 'light')] }; });
      const result = await commitEasyChanges(changes, { target, scope });
      if (!actor()) { busy = false; close(); return; }
      if (!result.ok) throw new Error(result.message);
      busy = false; close(); render();
      options.onComplete?.({ confirmed: changes.filter((change) => W.assessment(change.after, options).ready).map((change) => change.id), remaining: changes.filter((change) => !W.assessment(change.after, options).ready).map((change) => change.id) });
    } catch (e) { if (!actor()) { busy = false; close(); return; } error = e.message || '확인한 정보를 저장하지 못했어요. 다시 시도해 주세요.'; }
    finally { busy = false; if (!closed) draw(); }
  }
  function draw(moveFocus = true) {
    const focused = document.activeElement?.getAttribute?.('data-attribute-choice'), colorsOpen = body.querySelector('.attribute-other-colors')?.open;
    const draft = rows[index], item = draft.item, values = draft.values, need = new Set(draft.fields);
    body.replaceChildren(); footer.replaceChildren(); cancel.disabled = busy; back.hidden = index === 0; back.disabled = busy;
    title.textContent = rows.length > 1 ? '추천에 필요한 정보 · ' + (index + 1) + '/' + rows.length + '벌' : '추천에 필요한 정보';
    body.append(h('h3', { class: 'entry-question', tabindex: '-1', text: item.name + ', 이것만 확인할게요.' }),
      h('div', { class: 'entry-context' }, h('div', { class: 'entry-photo compact' }, item.photo?.ownImg || item.photo?.img ? h('img', { src: item.photo.ownImg || item.photo.img, alt: item.name + ' 확인할 사진' }) : h('span', { text: CATS[item.cat] })), h('p', { class: 'entry-sub', text: '브랜드·상품명·가격·실측은 필요 없어요. 사진과 맞는 것만 골라 주세요.' })));
    if (need.has('kind')) body.append(group('옷 종류', Object.entries(KINDS[item.cat]).map(([kind, label]) => chip(label, values.kind === kind, () => set(draft, ['kind'], { kind }), 'kind:' + kind)).concat(chip('잘 모르겠어요', draft.touched.has('kind') && !values.kind, () => set(draft, ['kind'], { kind: null }), 'kind:unknown'))));
    if (need.has('family') || need.has('light')) {
      if (draft.suggestion && !draft.touched.has('family') && !draft.touched.has('light')) body.append(h('div', { class: 'attribute-suggestion' }, h('p', { class: 'note', text: need.has('family') ? '사진에서 보인 색 제안: ' + FAM[draft.suggestion.family][0] + ' · 배경색일 수도 있어요.' : '사진에서 보인 밝기 제안이에요. 조명 때문에 실제와 다를 수 있어요.' }), chip(need.has('family') ? '이 색이 맞아요' : '사진의 밝기가 맞아요', false, () => set(draft, draft.fields.filter((field) => field === 'family' || field === 'light'), { family: draft.suggestion.family, light: draft.suggestion.light }), 'color:suggestion')));
      if (need.has('family')) {
        const common = ['black', 'white', 'gray', 'navy', 'blue', 'beige', 'brown', 'olive'];
        const colorChip = (family) => { const data = FAM[family], button = chip(data[0], values.family === family && draft.touched.has('family'), () => set(draft, ['family'], { family }), 'family:' + family); button.prepend(h('span', { class: 'attribute-swatch', style: 'background:' + swatch({ family, light: data[3] }) })); return button; };
        body.append(group('실제 옷 색', common.map(colorChip).concat(chip('잘 모르겠어요', draft.touched.has('family') && !values.family, () => set(draft, ['family'], { family: null }), 'family:unknown'))));
        body.append(h('details', { class: 'attribute-other-colors', open: !!colorsOpen }, h('summary', { text: '다른 색 선택' }), group('다른 옷 색', Object.keys(FAM).filter((family) => !common.includes(family)).map(colorChip))));
      }
      if (need.has('light')) body.append(group('색의 밝기', [[20, '어두워요'], [55, '중간이에요'], [85, '밝아요']].map(([light, label]) => chip(label, draft.touched.has('light') && values.light === light, () => set(draft, ['light'], { light }), 'light:' + light)).concat(chip('잘 모르겠어요', draft.touched.has('light') && values.light == null, () => set(draft, ['light'], { light: null }), 'light:unknown'))));
    }
    if (need.has('pattern')) body.append(group('무늬', [['solid', '무지'], ['stripe', '줄무늬'], ['check', '체크'], ['graphic', '프린트·큰 무늬']].map(([pattern, label]) => chip(label, draft.touched.has('pattern') && values.pattern === pattern, () => set(draft, ['pattern'], { pattern }), 'pattern:' + pattern)).concat(chip('잘 모르겠어요', draft.touched.has('pattern') && !values.pattern, () => set(draft, ['pattern'], { pattern: null }), 'pattern:unknown'))));
    if (need.has('formality')) body.append(group('입을 때 느낌', [[1, '편하게'], [2, '단정하게'], [3, '격식 있게']].map(([formality, label]) => chip(label, draft.touched.has('formality') && values.formality === formality, () => set(draft, ['formality'], { formality }), 'formality:' + formality)).concat(chip('잘 모르겠어요', draft.touched.has('formality') && values.formality == null, () => set(draft, ['formality'], { formality: null }), 'formality:unknown'))));
    if (need.has('seasons')) body.append(group('언제 입는 옷인가요?', SEASONS.map((season) => chip(season, values.seasons.includes(season), () => set(draft, ['seasons'], { seasons: values.seasons.includes(season) ? values.seasons.filter((value) => value !== season) : values.seasons.concat(season) }), 'season:' + season)).concat(chip('잘 모르겠어요', draft.touched.has('seasons') && !values.seasons.length, () => set(draft, ['seasons'], { seasons: [] }), 'season:unknown'))));
    if (draft.quality?.issues.length) body.append(h('p', { class: 'entry-kind-note', text: draft.quality.issues.join(' ') }));
    if (W.isDraft(item)) body.append(h('p', { class: 'entry-kind-note', text: '기존 값은 사진에서 추측한 초안이에요. 직접 고른 값만 확인된 정보로 바뀝니다.' }));
    body.append(h('p', { class: 'entry-status' + (error ? ' error' : ''), role: error ? 'alert' : 'status', text: error || (busy ? '확인한 정보를 저장하고 있어요…' : '모르는 값은 비워 두고 해당 코디 계산을 보류해요.') }));
    footer.append(h('button', { id: 'attributeConfirm', type: 'button', class: 'btn primary entry-primary', disabled: busy, onclick: confirm, text: busy ? '저장하고 있어요…' : index + 1 < rows.length ? '다음 옷 확인' : '선택한 정보 반영하고 추천 보기' }));
    if (moveFocus && !busy && dlg.open) body.querySelector('.entry-question')?.focus({ preventScroll: true });
    else if (!busy && focused) dlg.querySelector('[data-attribute-choice="' + focused + '"]')?.focus({ preventScroll: true });
    if (!draft.photoRead) {
      draft.photoRead = true; const own = item.photo?.ownImg || (item.photo?.kind === 'own' ? item.photo.img : '');
      attributePhotoHint(own).then((hint) => { if (closed || !actor() || !hint) return; draft.suggestion = hint.suggestion; draft.quality = hint.quality; if (rows[index] === draft && !busy) draw(false); });
    }
  }
  document.body.append(dlg); draw(); dlg.showModal(); body.querySelector('.entry-question')?.focus({ preventScroll: true });
}
