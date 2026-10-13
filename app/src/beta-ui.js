// Inserted inside the app closure by build.mjs; all data stays local until an explicit sync.
const FIELD_NAMES = { kind: '종류', family: '색 계열', light: '밝기', formality: '격식', pattern: '무늬', seasons: '계절', confirmation: '확인 필요' };
function optionSelect(id, map, value, label) {
  const s = h('select', { id });
  s.append(h('option', { value: '', text: label || '모름 · 확인 전' }));
  for (const k in map) s.append(h('option', { value: k, text: Array.isArray(map[k]) ? map[k][0] : map[k] }));
  s.value = value == null ? '' : String(value); return s;
}
function openQuickItem(item, status, options) {
  options = options || {};
  $('#quickItem')?.remove();
  const prev = item || null, st = item ? item.status : status || 'candidate';
  if (!item && options.initial) item = W.cleanItem({ ...options.initial, status: st }, 0);
  const dialog = h('dialog', { id: 'quickItem' });
  const name = h('input', { id: 'q-name', type: 'text', required: true, maxlength: '80', value: item ? item.name : '' });
  const brand = h('input', { id: 'q-brand', type: 'text', maxlength: '60', value: item?.brand || '', placeholder: '모르면 비워 두세요' });
  const price = h('input', { id: 'q-price', type: 'number', min: '0', max: '1000000000', step: '1', value: item?.price == null ? '' : String(item.price), placeholder: '직접 확인한 원화 가격' });
  const cat = optionSelect('q-cat', CATS, item?.cat, '분류를 골라 주세요'); cat.required = true;
  const kind = optionSelect('q-kind', KINDS[item?.cat] || {}, item?.kind);
  cat.addEventListener('change', () => { const next = optionSelect('q-kind', KINDS[cat.value] || {}, null); kind.replaceChildren(...next.childNodes); kind.value = ''; });
  const family = optionSelect('q-family', FAM, item?.family);
  const light = h('input', { id: 'q-light', type: 'number', min: '0', max: '100', value: item?.light == null ? '' : String(item.light), placeholder: '모르면 비워 두세요' });
  const formal = optionSelect('q-formality', FORMAL, item?.formality), pattern = optionSelect('q-pattern', PATTERNS, item?.pattern);
  const photo = h('input', { id: 'q-photo', type: 'file', accept: 'image/*' });
  const link = h('input', { id: 'q-link', type: 'url', maxlength: '400', value: item?.link || '' });
  const confirmed = h('input', { id: 'q-confirmed', type: 'checkbox', checked: item?.attrSource === 'owner-confirmed' });
  const seasons = h('div', { class: 'checks', id: 'q-seasons' });
  for (const s of SEASONS) seasons.append(h('label', null, h('input', { type: 'checkbox', value: s, checked: item?.seasons?.includes(s) }), ' ' + s));
  const err = h('p', { class: 'warnnote', id: 'quickError', hidden: true });
  const field = (label, el) => h('div', { class: 'field' }, h('label', { for: el.id, text: label }), el);
  const form = h('form', { id: 'quickItemForm', class: 'panel', onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true;
    if (!name.value.trim()) { err.textContent = '이름을 적어 주세요.'; err.hidden = false; return; }
    const u = link.value.trim(); if (u && !safeLink(u)) { err.textContent = '판매 링크를 확인해 주세요.'; err.hidden = false; return; }
    const currentPrice = price.value === '' ? null : Number(price.value);
    let next = W.cleanItem(Object.assign({}, prev || {}, { id: prev?.id || newId(st === 'candidate' ? 'c' : 'i'), status: st, name: name.value.trim(), brand: brand.value.trim(), price: currentPrice,
      checkedAt: currentPrice == null ? '' : prev?.price === currentPrice ? prev.checkedAt : today(), cat: cat.value, kind: kind.value || null, family: family.value || null,
      light: light.value === '' ? null : Number(light.value), formality: formal.value === '' ? null : Number(formal.value), pattern: pattern.value || null,
      seasons: Array.from(seasons.querySelectorAll('input:checked')).map(x => x.value), link: u,
      attrSource: confirmed.checked ? 'owner-confirmed' : prev?.attrSource === 'owner-confirmed' ? 'owner' : prev?.attrSource || 'owner' }), 0);
    if (!next) { err.textContent = '분류와 이름을 적어 주세요.'; err.hidden = false; return; }
    if (confirmed.checked && !W.assessment(next).ready) { err.textContent = '확인할 값을 모두 적거나 확인 체크를 해제해 주세요.'; err.hidden = false; return; }
    if (photo.files[0]) { const img = await readImage(photo.files[0]); if (!img) { err.textContent = '사진을 읽지 못했습니다.'; err.hidden = false; return; } next = W.setOwnPhoto(next, img); }
    if (prev && prev.cat !== next.cat) next.look3d = null;
    if (!prev && state.items.length >= 500) { err.textContent = '옷은 500벌까지 기록할 수 있습니다.'; err.hidden = false; return; }
    const before = state.items.slice();
    replaceItem(next);
    if (!await save()) { state.items = before; err.textContent = '저장하지 못해 변경을 되돌렸어요. 다시 저장하거나 취소해 주세요.'; err.hidden = false; return; }
    if (st === 'candidate') ui.judgeId = next.id;
    dialog.close(); ui.tab = options.returnTab || 'judge'; render();
  } }, h('h2', { text: prev ? '비교할 정보 확인' : st === 'candidate' ? '살까 고민 중인 한 벌' : '함께 입을 보유 옷' }),
    prev?.photo?.img ? h('div', { class: 'quick-review-photo' }, pic(prev)) : null,
    h('p', { class: 'sub', text: options.hint || (st === 'candidate' ? '커뮤니티·쇼핑 앱에서 본 상품명, 브랜드, 확인한 가격, 링크와 사진을 적어 두고 가진 옷과 비교하세요. 상품 정보를 링크에서 자동으로 읽지는 않습니다.' : '전체 옷장을 먼저 넣을 필요는 없습니다. 관련된 옷 몇 벌로 시작하세요. 모르는 값은 비워 두면 계산하지 않습니다.') }),
    h('div', { class: 'form' }, field('상품명', name), field('브랜드 (선택)', brand), field('직접 확인한 가격 (원, 선택)', price), field('분류', cat), field('종류', kind), field('색 계열', family), field('밝기 (0 어두움 · 100 밝음)', light), field('격식', formal), field('무늬', pattern), field('상품 사진 (선택 · 이 브라우저에 저장)', photo), field('판매 링크 (선택)', link),
      h('div', { class: 'field full' }, h('span', { class: 'l', text: '계절 (모르면 비워 두세요)' }), seasons),
      h('div', { class: 'field full' }, h('label', null, confirmed, ' 종류·색·밝기·격식·무늬를 직접 확인했습니다'))), err,
    h('div', { class: 'bar' }, h('button', { id: 'quickSave', class: 'btn primary', type: 'submit', text: options.returnTab === 'shop' ? '저장하고 추천 갱신' : options.returnTab === 'closet' ? '옷장에 저장하기' : '저장하고 비교하기' }), h('button', { id: 'quickCancel', class: 'btn', type: 'button', onclick: () => dialog.close(), text: '취소' })));
  dialog.append(form); document.body.append(dialog); dialog.showModal();
}
function renderWelcome(main) {
  main.append(h('section', { class: 'panel', id: 'firstComparePanel' }, h('h2', { text: '다음 한 벌, 가진 옷과 함께 볼까요?' }),
    h('p', { class: 'sub', text: '구매 후보와 함께 입을 상의·하의 몇 벌로 첫 비교를 시작합니다. 사진과 확인한 정보를 바탕으로 겹치는 옷과 조합을 살펴봅니다.' }),
    h('div', { class: 'bar' }, h('button', { class: 'btn primary', id: 'firstCompare', type: 'button', onclick: () => { if (!state.betaTrial?.startedAt) state.betaTrial = { startedAt: new Date().toISOString(), firstCompletedAt: '' }; ui.tab = 'judge'; save(); render(); if (!cands().length) openQuickItem(null, 'candidate'); }, text: '상품 정보 직접 입력' }),
      h('button', { class: 'btn', id: 'quickCand', type: 'button', onclick: () => openQuickCand(), text: '상품 링크·공유 내용 붙여넣기' }))));
}
function renderPending(root, c, v) {
  const pending = h('section', { class: 'panel', id: 'vPending' }, h('h2', { text: v.status === 'partial' ? '확인한 옷만 비교했습니다' : '정보를 확인하면 비교할 수 있습니다' }));
  if (v.missing?.length) pending.append(h('p', { class: 'warnnote', text: '구매 후보: ' + v.missing.map(k => FIELD_NAMES[k] || k).join(' · ') }), h('button', { class: 'btn primary', id: 'confirmCandidate', type: 'button', onclick: () => openQuickItem(c), text: '후보 정보 확인' }));
  if (v.excludedItems?.length) {
    pending.append(h('p', { class: 'sub', text: '확인 전 보유 옷 ' + v.excludedItems.length + '벌은 계산에서 제외했습니다. 비교에 쓸 몇 벌부터 확인해 주세요.' }));
    const photoDrafts = v.excludedItems.map((row) => row.item).filter(W.isDraft);
    if (photoDrafts.length) pending.append(draftReviewButton(photoDrafts, '사진 초안 한 번에 확인 · ' + photoDrafts.length + '벌', true));
    for (const row of v.excludedItems) pending.append(h('div', { class: 'bar', style: 'margin:8px 0' }, pic(row.item, 'mini'), h('span', { class: 'grow', text: row.item.name + ' · ' + row.missing.map(k => FIELD_NAMES[k] || k).join(' · ') }), h('button', { class: 'btn small', type: 'button', 'data-confirm-item': row.item.id, onclick: () => openQuickItem(row.item), text: '확인하기' })));
  }
  pending.append(h('button', { class: 'btn', id: v.status === 'partial' ? 'addRelatedOwnedPending' : 'addRelatedOwned', type: 'button', onclick: () => openQuickItem(null, 'owned'), text: '함께 입을 보유 옷 추가' })); root.append(pending);
}
const FOLLOWUP_OUTCOMES = { purchased: '구매했다', 'not-purchased': '사지 않았다', pending: '아직 결정 중', returned: '구매 후 반품했다' };
const FOLLOWUP_SIZES = { right: '잘 맞았다', small: '작았다', large: '컸다', unknown: '아직 확인 전' };
const FOLLOWUP_RETURN_REASONS = { size: '사이즈', fit: '핏', color: '색상', material: '소재', quality: '품질', changed: '마음이 바뀜', price: '가격', other: '기타', unknown: '아직 선택 전' };
function followupLabel(outcome) { return FOLLOWUP_OUTCOMES[outcome] || '기록 없음'; }
function moveOwnedAfterPurchaseButton(d, dialog) {
  const item = state.items.find((it) => it.id === d.itemId);
  if (d.followup?.outcome !== 'purchased' || item?.status !== 'candidate') return null;
  return h('button', { class: 'btn primary', type: 'button', id: dialog ? 'moveOwnedAfterPurchaseDialog' : 'moveOwnedAfterPurchase', onclick: async () => {
    const before = Object.assign({}, item);
    replaceItem(W.cleanItem(Object.assign({}, item, { status: 'owned', boughtYear: item.boughtYear || YEAR }), 0));
    if (!await save()) { replaceItem(W.cleanItem(before, 0)); toast('옷장에 저장하지 못했습니다. 다시 시도해 주세요.'); return; }
    if (dialog?.open) dialog.close();
    ui.tab = 'closet'; render();
  }, text: '구매한 옷을 내 옷장에 등록' });
}
function openFollowupDialog(d) {
  const dialog = h('dialog', { id: 'followupDialog' });
  dialog.append(h('div', { class: 'dhead' }, h('h2', { text: d.name + ' · 구매 결과' }), h('button', { class: 'btn small', type: 'button', onclick: () => dialog.close(), text: '닫기' })));
  renderFollowup(dialog, d, { dialog });
  document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
}
function renderFollowup(root, d, options) {
  options = options || {};
  const old = d.followup || {};
  if (!options.dialog) {
    root.append(h('section', { class: 'panel', id: 'purchaseFollowup' },
      h('h2', { text: '구매 뒤 결과도 이어서 기록하세요' }),
      h('p', { class: 'sub', text: '결제 직후에는 샀는지 남기고, 상품을 받아 입어 본 뒤에는 사이즈·핏과 반품 결과를 업데이트하세요. 결제·배송·반품은 판매처에서 진행합니다.' }),
      old.outcome ? h('p', { class: 'note', id: 'followupStatus', text: '마지막 기록: ' + followupLabel(old.outcome) + (old.at ? ' · ' + old.at : '') }) : null,
      h('div', { class: 'bar', style: 'margin:0' },
        h('button', { class: 'btn primary', type: 'button', id: 'openPurchaseFollowup', onclick: () => openFollowupDialog(d), text: old.outcome ? '구매·반품 결과 수정' : '구매·반품 결과 기록' }),
        moveOwnedAfterPurchaseButton(d, null))));
    return;
  }
  const outcome = optionSelect('followupOutcome', FOLLOWUP_OUTCOMES, old.outcome, '실제 결과를 골라 주세요'); outcome.required = true;
  const worn = optionSelect('followupWorn', { yes: '입었다', no: '아직 입지 않았다', unknown: '해당 없음 · 모름' }, old.worn || 'unknown');
  const regret = optionSelect('followupRegret', { yes: '후회한다', no: '후회하지 않는다', unknown: '아직 모르겠다' }, old.regret || 'unknown');
  const sizeResult = optionSelect('followupSizeResult', FOLLOWUP_SIZES, old.sizeResult || 'unknown');
  const returnReason = optionSelect('followupReturnReason', FOLLOWUP_RETURN_REASONS, old.returnReason || 'unknown');
  const sizeField = h('div', { class: 'field' }, h('label', { for: 'followupSizeResult', text: '받아 입어 본 결과' }), sizeResult);
  const returnField = h('div', { class: 'field' }, h('label', { for: 'followupReturnReason', text: '반품한 이유' }), returnReason);
  const updateOutcomeFields = () => {
    sizeField.hidden = !['purchased', 'returned'].includes(outcome.value);
    returnField.hidden = outcome.value !== 'returned';
  };
  outcome.addEventListener('change', updateOutcomeFields); updateOutcomeFields();
  const note = h('input', { id: 'followupNote', type: 'text', maxlength: '300', value: old.note || '', placeholder: '반품 이유, 실제 착용 조합, 구매를 미룬 이유' });
  const error = h('p', { class: 'warnnote', id: 'followupError', hidden: true, role: 'alert' });
  root.append(h('form', { id: 'followupForm', class: 'panel', onsubmit: async (e) => {
    e.preventDefault(); error.hidden = true;
    const previous = d.followup, item = state.items.find((it) => it.id === d.itemId), previousItem = item && Object.assign({}, item), previousRack = state.rack.slice();
    d.followup = { outcome: outcome.value, worn: worn.value || 'unknown', regret: regret.value || 'unknown', sizeResult: sizeResult.value || 'unknown', returnReason: returnReason.value || 'unknown', note: str(note.value, 300), at: today() };
    if (item && outcome.value === 'returned') {
      replaceItem(W.cleanItem(Object.assign({}, item, { status: 'gone' }), 0)); state.rack = state.rack.filter((row) => row.id !== item.id);
    } else if (item && old.outcome === 'returned' && outcome.value === 'purchased' && item.status === 'gone') {
      replaceItem(W.cleanItem(Object.assign({}, item, { status: 'owned', boughtYear: item.boughtYear || YEAR }), 0));
    }
    if (!await save()) {
      d.followup = previous;
      if (previousItem) replaceItem(W.cleanItem(previousItem, 0));
      state.rack = previousRack; error.textContent = '저장하지 못했습니다. 다시 시도해 주세요.'; error.hidden = false; return;
    }
    if (options.dialog?.open) options.dialog.close();
    render();
  } },
    h('h2', { text: '구매 이후의 결과' }), h('p', { class: 'sub', text: '결제 직후에는 산 옷과 결정을 미룬 이유를 남기고, 상품을 받아 입어 본 뒤에는 사이즈·핏과 반품 이유를 업데이트하세요. 반품을 선택하면 해당 옷은 옷장에서 빠지고 결정 기록에는 남습니다.' }),
    h('div', { class: 'form' }, h('div', { class: 'field' }, h('label', { for: 'followupOutcome', text: '실제 선택' }), outcome), h('div', { class: 'field' }, h('label', { for: 'followupWorn', text: '구매한 옷 착용' }), worn), h('div', { class: 'field' }, h('label', { for: 'followupRegret', text: '선택에 대한 후회' }), regret), sizeField, returnField, h('div', { class: 'field full' }, h('label', { for: 'followupNote', text: '후속 메모' }), note)), error, h('button', { class: 'btn primary', id: 'saveFollowup', type: 'submit', text: old.outcome ? '결과 수정' : '결과 저장' })));
  const moveButton = moveOwnedAfterPurchaseButton(d, options.dialog);
  if (moveButton) root.append(h('div', { class: 'bar', style: 'margin-top:10px' }, moveButton));
}
function renderFullBackup(main) {
  const input = h('input', { type: 'file', accept: '.json,application/json', id: 'backupFile', hidden: true, onchange: async () => {
    const f = input.files[0]; if (!f) return;
    if (f.size > 50 * 1024 * 1024) { ui.backupMessage = '백업 파일이 너무 큽니다 (최대 50MB).'; ui.backupArm = null; render(); return; }
    const raw = await readFileJson(input), clean = B.readBackup(raw, cleanState);
    ui.backupArm = clean; ui.backupMessage = clean ? '' : '완전한 백업 파일이 아닙니다. 현재 옷장은 바뀌지 않았습니다.'; render();
  } });
  const p = h('section', { class: 'panel', id: 'fullBackupPanel' }, h('h2', { text: '이 브라우저의 전체 백업' }),
    h('p', { class: 'sub', text: '보유·구매 후보·처분한 옷, 사진, 판정·후속 기록, 상품 목록, 비교 옷장과 3D 자리를 함께 보관합니다. 개인 정보가 들어 있는 파일이므로 본인 보관용으로 사용하세요.' }),
    h('div', { class: 'bar' }, h('button', { class: 'btn primary', id: 'fullBackupBtn', type: 'button', onclick: () => download('otjang-private-backup-' + today() + '.json', B.makeBackup(state)), text: '전체 백업 받기' }), h('button', { class: 'btn', id: 'backupOpen', type: 'button', onclick: () => input.click(), text: '백업으로 복원하기' }), input));
  if (ui.backupArm) p.append(h('p', { class: 'warnnote', text: '현재 브라우저 자료 전체를 백업의 옷 ' + ui.backupArm.items.length + '벌로 바꿉니다. 먼저 현재 자료를 백업해 주세요.' }), h('div', { class: 'bar' },
    h('button', { class: 'btn danger', id: 'backupRestoreConfirm', type: 'button', onclick: async () => {
      const old = state, oldVersion = ui.syncVersion; state = ui.backupArm;
      if (ui.syncScope) {
        const stamp = state.syncStamp;
        if (stamp && stamp.origin === ui.syncOrigin && stamp.ownerId === ui.syncUserInfo.ownerId) ui.syncVersion = stamp.version;
        else if (ui.syncVersion === 0 && ui.syncObservedVersion === 0) state.syncStamp = { origin: ui.syncOrigin, ownerId: ui.syncUserInfo.ownerId, version: 0 };
        else { state.syncStamp = null; ui.syncVersion = null; }
      }
      const ok = await save();
      if (!ok) { state = old; ui.syncVersion = oldVersion; ui.backupMessage = '저장하지 못해 복원을 취소했습니다. 기존 옷장은 유지됩니다.'; }
      else ui.backupMessage = '전체 백업을 복원했습니다.';
      ui.backupArm = null; ui.judgeId = ''; ui.stageSel = null; render();
    }, text: '전체 자료 복원' }),
    h('button', { class: 'btn', id: 'backupRestoreCancel', type: 'button', onclick: () => { ui.backupArm = null; ui.backupMessage = '복원을 취소했습니다.'; render(); }, text: '취소' })));
  p.append(h('p', { class: 'note', id: 'backupRestoreMessage', text: ui.backupMessage || '' })); main.append(p);
}
function accountScope() { return ui.syncScope || 'state'; }
function localStorageKey() { return ui.syncScope ? KEY2 + ':' + ui.syncScope : KEY2; }
async function enterAccount(reply, origin) {
  if (!reply || typeof reply.token !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(reply.token) || !Number.isSafeInteger(reply.user?.ownerId) || reply.user.ownerId < 1) throw new Error('로그인 응답을 확인할 수 없습니다.');
  await savePromise;
  if (!ui.syncScope) ui.localBeforeLogin = state;
  ui.syncToken = reply.token; ui.syncUserInfo = reply.user; ui.syncOrigin = origin;
  ui.syncScope = 'account:' + origin + ':' + reply.user.ownerId;
  let idb = null, ls = null;
  const read = (s) => { try { const raw = JSON.parse(s); return { state: cleanState(raw), revision: raw._storageRevision || 0 }; } catch (e) { return null; } };
  if (store.db) idb = read(await kvGet(accountScope())); ls = read(lsGet(localStorageKey()));
  const chosen = idb?.state && (!ls?.state || idb.revision >= ls.revision) ? idb : ls;
  state = chosen?.state || cleanState({ schema: 2, owner: { nickname: reply.user.username }, items: [], decisions: [] });
  ui.syncExpired = false;
  const stamp = state.syncStamp; ui.syncVersion = stamp && stamp.origin === origin && stamp.ownerId === reply.user.ownerId ? stamp.version : null;
  await syncFetch('/api/auth/me');
  if (ui.syncVersion == null && !state.items.length && !state.decisions.length && !state.catalog.products.length) { ui.syncVersion = ui.syncObservedVersion; if (ui.syncVersion != null) state.syncStamp = { origin, ownerId: reply.user.ownerId, version: ui.syncVersion }; }
  store.revision = Math.max(store.revision, chosen?.revision || 0); ui.pullArm = null; ui.judgeId = ''; ui.stageSel = null;
  ui.syncMsg = '계정 옷장을 열었습니다. 기존 개인 옷장은 로그아웃하면 돌아옵니다. 사진과 옷을 자동으로 전송하지 않습니다.';
  await save(); render();
}
async function leaveAccount(revoke) {
  await savePromise;
  if (revoke && ui.syncToken) { try { await syncFetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* expiry already invalidates the token */ } }
  const old = ui.localBeforeLogin;
  ui.syncToken = ''; ui.syncUserInfo = null; ui.syncOrigin = ''; ui.syncScope = ''; ui.syncVersion = null; ui.syncObservedVersion = null; ui.syncExpired = false; ui.serverBackupArm = null; ui.localBeforeLogin = null; ui.pullArm = null;
  if (old) state = old;
  ui.judgeId = ''; ui.stageSel = null; ui.syncMsg = '로그아웃했습니다. 원래 개인 옷장을 표시합니다.'; render();
}
async function authenticate(register) {
  const username = $('#syncUser').value.trim(), password = $('#syncPassword').value, inviteCode = $('#syncInvite').value;
  const base = SY.normalizeBase(ui.syncBase);
  if (!base || (!SY.isLocalAddress(base) && !base.startsWith('https:'))) { ui.syncMsg = '이 기기의 서버 또는 보안 연결 주소를 사용해 주세요.'; render(); return; }
  ui.syncBusy = true;
  try {
    const r = await syncFetch(register ? '/api/auth/register' : '/api/auth/login', { publicAuth: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(register ? { username, password, inviteCode } : { username, password }) });
    const reply = await r.json(); await enterAccount(reply, base);
  } catch (e) { ui.syncMsg = e.message; }
  ui.syncBusy = false; render();
}
function renderAccount(sec) {
  sec.append(h('p', { class: 'note', id: 'syncAuthNote', text: ui.syncExpired ? '접속이 만료됐습니다. 계정의 브라우저 사본은 유지합니다. 다시 로그인해 주세요.' : ui.syncUserInfo ? '로그인: ' + ui.syncUserInfo.username + ' · 계정별 옷장을 사용합니다. 접속 정보는 파일이나 브라우저 저장소에 넣지 않습니다.' : '서버 옷장은 초대 계정으로 로그인한 뒤 사용할 수 있습니다. 이 브라우저의 개인 옷장은 로그인 없이 사용할 수 있습니다.' }));
  if (ui.syncScope && !ui.syncToken) sec.append(h('button', { class: 'btn', id: 'syncLogout', type: 'button', onclick: () => leaveAccount(false), text: '원래 개인 옷장으로 돌아가기' }));
  if (ui.syncToken) {
    sec.append(h('button', { class: 'btn', id: 'syncLogout', type: 'button', onclick: () => leaveAccount(true), text: '로그아웃' }));
    renderServerData(sec); return;
  }
  sec.append(h('div', { class: 'form' },
    h('div', { class: 'field' }, h('label', { for: 'syncUser', text: '아이디' }), h('input', { id: 'syncUser', type: 'text', maxlength: '40', autocomplete: 'username' })),
    h('div', { class: 'field' }, h('label', { for: 'syncPassword', text: '비밀번호' }), h('input', { id: 'syncPassword', type: 'password', maxlength: '128', autocomplete: 'current-password' })),
    h('div', { class: 'field full' }, h('label', { for: 'syncInvite', text: '초대 코드 (처음 가입할 때만)' }), h('input', { id: 'syncInvite', type: 'password', maxlength: '200', autocomplete: 'off' }))),
    h('div', { class: 'bar' }, h('button', { class: 'btn primary', id: 'syncLogin', type: 'button', disabled: ui.syncBusy, onclick: () => authenticate(false), text: '로그인' }), h('button', { class: 'btn', id: 'syncRegister', type: 'button', disabled: ui.syncBusy, onclick: () => authenticate(true), text: '초대 계정 만들기' })));
}
function renderServerData(sec) {
  const read = h('input', { id: 'serverBackupFile', type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
    ui.serverBackupArm = null; const f = read.files[0]; if (!f) return;
    if (f.size > 50 * 1024 * 1024) { ui.syncMsg = '복원 파일은 50MB 이하여야 합니다.'; render(); return; }
    const b = await readFileJson(read);
    if (!b || b.schema !== 1 || b.kind !== 'otjang-server-backup' || !Array.isArray(b.wardrobe?.items) || !Array.isArray(b.catalog?.products)) { ui.syncMsg = '서버 전체 백업 파일이 아닙니다.'; render(); return; }
    ui.serverBackupArm = b; render();
  } });
  sec.append(h('div', { class: 'bar' }, h('button', { class: 'btn', id: 'serverBackupBtn', type: 'button', onclick: async () => {
    try { const data = await (await syncFetch('/api/backup')).json(); download('otjang-server-private-backup-' + today() + '.json', data); ui.syncMsg = '이 계정의 전체 서버 백업을 받았습니다. 사진이 포함된 개인 보관용 파일입니다.'; } catch (e) { ui.syncMsg = e.message; } render();
  }, text: '계정 전체 백업 받기' }), h('button', { class: 'btn', id: 'serverBackupOpen', type: 'button', onclick: () => read.click(), text: '계정 백업 복원' }), read));
  if (ui.serverBackupArm) sec.append(h('p', { class: 'warnnote', text: '서버의 현재 계정 자료 전체를 바꿉니다. 브라우저의 개인 옷장은 자동으로 바뀌지 않습니다. 사진 포함 여부는 위의 선택을 따릅니다.' }),
    h('div', { class: 'bar' }, h('button', { class: 'btn danger', id: 'serverRestoreConfirm', type: 'button', onclick: async () => {
      const b = JSON.parse(JSON.stringify(ui.serverBackupArm)), photos = ui.syncPhotos == null ? SY.isLocalAddress(ui.syncBase) : ui.syncPhotos;
      if (!photos) { b.wardrobe = SY.wardrobePayload(b.wardrobe, { photos: false }); b.catalog = SY.catalogPayload({ catalog: b.catalog }, { photos: false }); }
      try { await syncFetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup: b, confirmReplace: true }) }); ui.syncMsg = '서버 계정 백업을 복원했습니다. 브라우저로 가져오려면 서버에서 받기를 눌러 주세요.'; ui.serverBackupArm = null; } catch (e) { ui.syncMsg = e.message; } render();
    }, text: '이 계정 전체 복원' }), h('button', { class: 'btn', id: 'serverRestoreCancel', type: 'button', onclick: () => { ui.serverBackupArm = null; render(); }, text: '취소' })));
  const pass = h('input', { id: 'deleteAccountPassword', type: 'password', autocomplete: 'current-password', required: true }), confirm = h('input', { id: 'deleteAccountConfirm', type: 'checkbox', required: true });
  const details = h('details', { id: 'deleteAccountDetails' }, h('summary', { text: '이 계정과 사진 삭제' }), h('form', { id: 'deleteAccountForm', onsubmit: async (e) => {
    e.preventDefault(); if (!confirm.checked) return;
    try { await syncFetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass.value }) }); await savePromise; if (store.db) await kvDel(accountScope()); try { localStorage.removeItem(localStorageKey()); } catch (e) { /* unavailable */ } await leaveAccount(false); ui.syncMsg = '계정과 서버 자료, 이 브라우저의 계정 사본을 삭제했습니다. 원래 개인 옷장은 유지됩니다.'; } catch (e) { ui.syncMsg = e.message; } render();
  } }, h('p', { class: 'warnnote', text: '현재 계정의 옷·사진·기록과 브라우저 사본을 삭제합니다. 필요한 자료는 먼저 백업하세요.' }), h('div', { class: 'field' }, h('label', { for: pass.id, text: '비밀번호를 다시 입력해 주세요' }), pass), h('label', null, confirm, ' 계정과 사진을 삭제하겠습니다'), h('button', { class: 'btn danger', id: 'deleteAccountSubmit', type: 'submit', text: '계정 삭제' })));
  sec.append(details);
}
