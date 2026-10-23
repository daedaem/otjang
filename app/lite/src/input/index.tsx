import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { registrationRepository, type InputHost, type Registration } from './types';
import './input.css';
import { readDraft, writeDraft, clearDraft } from './draft';

let draft: Registration | null = null;
let initialKey = '';
const empty = (initial: Partial<Registration> = {}): Registration => ({ brand: '', name: '', kind: '', color: '', url: '', ...initial, draftId: crypto.randomUUID() });
const message = (error: unknown) => error instanceof Error ? error.message : '저장하지 못했어요. 입력은 그대로 두었으니 다시 시도해 주세요.';
function RegistrationScreen({ host }: { host: InputHost }) {
  const [pending, setPending] = useState(() => draft ? null : readDraft());
  const [values, setValues] = useState<Registration>(() => draft ?? empty(host.initial));
  const [draftNotice, setDraftNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const availableStep = !values.brand.trim() || values.name.trim().length < 2 ? 0 : !values.kind || !values.color ? 1 : 2;
  const step = Math.min(availableStep, Math.max(0, host.step || 0));
  const coreVersion = useSyncExternalStore(host.core.subscribe, host.core.version, host.core.version);
  void coreVersion;
  const count = host.core.getState().closetCount;
  useEffect(() => { heading.current?.focus(); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (pending) return;
    draft = values;
    try { writeDraft(values, step); setDraftNotice(''); }
    catch { setDraftNotice('초안을 이 기기에 보관하지 못했어요. 이 화면을 닫으면 입력을 잃을 수 있어요.'); }
  }, [values, step, pending]);
  const restore = () => {
    if (pending?.type !== 'ready') return;
    draft = pending.value.values; setValues(draft);
    const savedStep = pending.value.step;
    setPending(null); host.next(savedStep);
  };
  const restart = () => {
    try { clearDraft(); }
    catch { setDraftNotice('초안을 지우지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.'); return; }
    draft = empty(host.initial); setValues(draft); setPending(null); host.next(0);
  };
  const change = (key: keyof Registration, value: string) => {
    const next = { ...values, [key]: value };
    draft = next; setValues(next); setError('');
  };
  const valid = () => {
    if (!values.brand.trim() || values.name.trim().length < 2) return '브랜드와 두 글자 이상의 상품명을 적어 주세요.';
    if (step > 0 && (!values.kind || !values.color)) return '옷 종류와 색을 골라 주세요.';
    if (step === 2 && values.url.trim()) {
      try { if (!['https:', 'http:'].includes(new URL(values.url.trim()).protocol)) throw new Error(); }
      catch { return '링크는 https:// 또는 http://로 시작해야 해요.'; }
    }
    return '';
  };
  const save = async (productId?: string) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      host.assertWritable();
      const garment = productId ? host.core.addOwnedProduct(productId) : await registrationRepository(host.core, host.assertWritable).execute(values);
      draft = null;
      let warning: string | undefined;
      try { clearDraft(); } catch { warning = '옷은 저장했지만 초안을 정리하지 못했어요. 다시 열면 새로 입력을 선택해 주세요.'; }
      if (alive.current) host.saved(garment, productId ? undefined : values, warning);
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { busy.current = false; if (alive.current) setSaving(false); }
  };
  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = valid(); if (problem) { setError(problem); return; }
    if (step < 2) host.next(step + 1); else void save();
  };
  const suggestions = !values.source && step === 0 && values.name.trim().length >= 2
    ? host.core.findProducts(values.name.trim(), { limit: 3 }) : [];
  const kinds = host.core.kindChoices(), colors = host.core.colorChoices();
  if (pending) return <section className="ri" aria-label="입력 초안 복원">
    <h1 ref={heading} tabIndex={-1}>쓰던 입력이 있어요</h1>
    <p>{pending.type === 'ready' ? `${pending.value.values.brand} ${pending.value.values.name} · ${pending.value.step + 1}/3단계` : pending.message}</p>
    {pending.type === 'ready' && <button type="button" className="ri-primary" onClick={restore}>이어서 입력</button>}
    <button type="button" onClick={restart}>초안 지우고 새로 입력</button>
    <button type="button" onClick={host.back}>돌아가기</button>
    {draftNotice && <p role="alert">{draftNotice}</p>}
  </section>;
  return <section className="ri" aria-label="직접 등록" aria-busy={saving}>
    <header className="ri-top"><button type="button" aria-label="뒤로" disabled={saving} onClick={host.back}>←</button><span>옷 등록 · {step + 1}/3</span><span>옷장 {count}벌</span></header>
    <h1 ref={heading} tabIndex={-1}>{['어떤 옷을 가지고 있나요?', '종류와 색을 알려 주세요', '이대로 옷장에 넣을까요?'][step]}</h1>
    {draftNotice && <p role="alert">{draftNotice}</p>}
    <form onSubmit={next} noValidate>
      {step === 0 && <><label htmlFor="ri-brand">브랜드</label><input id="ri-brand" maxLength={80} value={values.brand} onChange={e => change('brand', e.target.value)} autoComplete="off" enterKeyHint="next" />
        <label htmlFor="ri-name">상품명</label><input id="ri-name" maxLength={80} value={values.name} onChange={e => change('name', e.target.value)} autoComplete="off" enterKeyHint="next" />
        {suggestions.length > 0 && <aside aria-label="비슷한 상품"><h2>혹시 이 상품인가요?</h2>{suggestions.map(p => <button className="ri-suggestion" key={p.id} type="button" disabled={saving} onClick={() => void save(p.id)}>{p.brand} · {p.name}<span>이 상품으로 등록</span></button>)}</aside>}</>}
      {step === 1 && <><fieldset><legend>옷 종류</legend><div className="ri-options">{kinds.map(k => <button key={k.id} type="button" aria-pressed={values.kind === k.id} onClick={() => change('kind', k.id)}>{k.name}</button>)}</div></fieldset>
        <fieldset><legend>색</legend><div className="ri-options">{colors.map(c => <button key={c.id} type="button" aria-pressed={values.color === c.id} onClick={() => change('color', c.id)}><span className="ri-swatch" style={{ background: c.hex }} />{c.label}</button>)}</div></fieldset></>}
      {step === 2 && <><dl><dt>브랜드</dt><dd>{values.brand}</dd><dt>상품명</dt><dd>{values.name}</dd><dt>종류 · 색</dt><dd>{kinds.find(k => k.id === values.kind)?.name} · {colors.find(c => c.id === values.color)?.label}</dd></dl>
        <label htmlFor="ri-url">상품 링크 (선택)</label><input id="ri-url" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" maxLength={2000} value={values.url} onChange={e => change('url', e.target.value)} placeholder="https://" />
        <p>브랜드·종류·색으로 등록해요. 실제 옷 사진을 분석하지 않아요.</p></>}
      {values.source && <p>Open Products Facts에서 가져온 정보예요. 종류·색과 실제 가진 상품인지 확인해 주세요. <a href={`https://world.openproductsfacts.org/product/${values.source.code}`} target="_blank" rel="noopener noreferrer">원본</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL</a></p>}
      {error && <p role="alert" className="ri-error">{error}</p>}
      <footer><button type="button" disabled={saving} onClick={restart}>초안 지우고 새로 입력</button><button className="ri-primary" type="submit" disabled={saving}>{saving ? '저장하는 중…' : step === 2 ? '옷장에 넣기' : '다음'}</button></footer>
    </form>
  </section>;
}
export function mount(host: InputHost) {
  const key = JSON.stringify(host.initial || {});
  if (key !== initialKey) { draft = null; initialKey = key; }
  const root = createRoot(host.element);
  root.render(<RegistrationScreen host={host} />);
  return () => root.unmount();
}
