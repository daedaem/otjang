// 갤러리(index.html)가 읽는 gallery-data.js를 만든다. 입력은 data/*.json(숫자·글만, 스크린샷 없음).
// 사용: node app/mockups/ux10v2/tools/make-gallery-data.mjs [--flow <흐름 검사 결과 폴더>]
//   --flow를 주면 그 폴더의 NN/report.json에서 숫자를 뽑아 data/flow.json을 새로 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = (name) => path.join(root, 'data', name);
const read = (name, fallback) => (fs.existsSync(data(name)) ? JSON.parse(fs.readFileSync(data(name), 'utf8')) : fallback);
const args = process.argv.slice(2);
const flowDir = args.includes('--flow') ? path.resolve(args[args.indexOf('--flow') + 1]) : null;

const teams = read('teams.json', []);
if (flowDir) {
  const flow = {};
  for (const t of teams) {
    const nn = String(t.n).padStart(2, '0');
    const file = path.join(flowDir, nn, 'report.json');
    if (!fs.existsSync(file)) continue;
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = r.mobile || {}, p = r.pc || {};
    flow[nn] = {
      cards: m.results?.resultsInView ?? null, cardsFull: m.results?.resultsFullyInView ?? null, columns: m.results?.resultColumns ?? null,
      photoRatio: m.results?.firstPhotoRatio ?? null, resultNotices: m.results?.noticeLines ?? null,
      pdpPhoto: m.pdp?.photoWidthShare ?? null, pdpType: m.pdp ? [m.pdp.brandPx, m.pdp.namePx, m.pdp.pricePx] : null, decideInFirstScreen: m.pdp?.decideInFirstScreen ?? null,
      actionsToPdp: m.actionsToPdp ?? null, actionsToAdd: m.actionsToAddGarment ?? null, actionsToCompare: m.actionsToCompare ?? null, actions: m.actionsTotal ?? null,
      returnedToSameProduct: !!m.returnedToSameProduct, holdRecorded: !!m.holdRecorded, scrollRestored: !!m.scrollRestored,
      verdictNoCloset: m.verdictNoCloset ?? null, verdictAfterAdd: m.verdictAfterAdd ?? null,
      firstProduct: (m.pdpHash || '').replace(/^#\/p\//, '').split('?')[0] || null,
      pcCards: p.results?.resultsInView ?? null,
      a11y: r.a11y ? { under24: r.a11y.under24, under40: r.a11y.under40, tinyText: r.a11y.tinyText, unnamed: r.a11y.unnamed } : null,
      problems: r.problems.length, problemList: r.problems,
    };
  }
  fs.writeFileSync(data('flow.json'), `${JSON.stringify(flow, null, 2)}\n`);
}
const flow = read('flow.json', {});
const bench = read('bench.json', { columns: [], rows: [] });
const notes = read('notes.json', {});
const yesNo = (v) => (v == null ? '-' : v ? '예' : '아니요');
const benchRows = [
  ...bench.rows.map((r) => ({ ref: true, cells: r.cells })),
  ...teams.map((t) => {
    const f = flow[String(t.n).padStart(2, '0')] || {};
    return { cells: [`시안 ${String(t.n).padStart(2, '0')} ${t.name}`, f.cards, f.columns, f.photoRatio, f.pdpPhoto != null ? `${Math.round(f.pdpPhoto * 100)}%` : null, f.actionsToPdp, yesNo(f.scrollRestored), yesNo(f.returnedToSameProduct), f.actions, f.problems] };
  }),
];
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  teams: teams.map((t) => {
    const f = flow[String(t.n).padStart(2, '0')] || {};
    return { ...t, firstProduct: f.firstProduct || null, metrics: { cards: f.cards, pdpPhoto: f.pdpPhoto, actions: f.actions, problems: f.problems } };
  }),
  bench: { columns: bench.columns, rows: benchRows, sub: bench.sub || '', note: bench.note || '' },
  refs: read('refs.json', []),
  ranking: notes.ranking || [], rankingNote: notes.rankingNote || '', limits: notes.limits || [], photos: notes.photos || [],
};
fs.writeFileSync(path.join(root, 'gallery-data.js'), `/* 자동 생성 파일: tools/make-gallery-data.mjs 로 다시 만든다. */\nwindow.GALLERY = ${JSON.stringify(out, null, 1)};\n`);
console.log(`gallery-data.js · 시안 ${out.teams.length} · 흐름 ${Object.keys(flow).length} · 참고 서비스 ${bench.rows.length} · 근거 ${out.refs.length}`);
