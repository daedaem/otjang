import test from 'node:test';
import assert from 'node:assert/strict';
import { valueAxes, similarOwned, colorMatch, detailDiff, wearExpectation, costPerWear, seriesShelves } from '../src/domain/collection-value.js';
import { outfitFacts, validateReactions, tasteSummary, outfitFactLines, attributeClaimCheck } from '../src/domain/outfit-facts.js';
import { railLayout } from '../src/domain/rail-layout.js';
import { bodyScale, placeGarment } from '../src/domain/collage.js';

const p = (extra) => ({ v: 1, ...extra });
const owned = [
  { id: 'a', kind: 'jeans', color: 'indigo', profile: p({ fabric: { value: '데님', source: 'chosen' }, thickness: { value: 'mid', source: 'chosen' }, details: [{ text: '셀비지', source: 'chosen' }], series: 'LVC 501' }) },
  { id: 'b', kind: 'jeans', color: 'navy', profile: p({ series: 'LVC 501', details: [{ text: '지퍼 플라이', source: 'chosen' }] }) },
  { id: 'c', kind: 'jeans', color: 'black' },
  { id: 'd', kind: 'shirt', color: 'indigo' },
];
const candidate = { kind: 'jeans', color: 'indigo', profile: p({ fabric: { value: '데님', source: 'seller' }, thickness: { value: 'thick', source: 'seller' }, details: [{ text: '셀비지', source: 'seller' }, { text: '버튼 플라이', source: 'seller' }], series: 'lvc501' }) };

test('similar owned garments: same shape, same or near color; unknown color is kept and marked', () => {
  assert.equal(colorMatch('navy', 'indigo'), 'near');
  assert.equal(colorMatch(null, 'indigo'), 'unknown');
  assert.deepEqual(similarOwned(candidate, owned).map((s) => [s.garment.id, s.color]), [['a', 'same'], ['b', 'near']]);
  assert.deepEqual(similarOwned({ kind: 'jeans', color: null }, owned).map((s) => s.color), ['unknown', 'unknown', 'unknown']);
});

test('details compare as sets; one side without details is unknown, not different', () => {
  const d = detailDiff(candidate.profile, owned[0].profile);
  assert.deepEqual(d.attrs.find((a) => a.key === 'thickness').state, 'different');
  assert.deepEqual(d.attrs.find((a) => a.key === 'fabric').state, 'same');
  assert.deepEqual(d.onlyCandidate, ['버튼 플라이']);
  assert.equal(detailDiff(candidate.profile, {}).detailsUnknown, true);
  assert.deepEqual(detailDiff(candidate.profile, {}).onlyCandidate, []);
});

test('value axes stay separate; purpose orders them; collecting never flags a duplicate', () => {
  const collect = valueAxes({ candidate, owned, purpose: 'collect', newOutfits: 1 });
  assert.equal(collect.summary, "비슷한 옷 2벌: 옷별로 기록된 차이는 두께·버튼 플라이·셀비지·내 옷에만 지퍼 플라이. 소장용이면 'lvc501' 3번째, 착용용이면 새 조합 +1.");
  assert.equal(collect.duplicateWarning, false);
  const wear = valueAxes({ candidate: { kind: 'jeans', color: 'black' }, owned, purpose: 'wear' });
  assert.equal(wear.duplicateWarning, false, 'missing attributes do not establish a duplicate');
  assert.match(wear.summary, /^비슷한 옷 1벌: 모르는 속성이 있어 다른 점은 아직 확인 전이에요\. 착용용이면 새로 생기는 조합은 아직 계산 전이에요/);
  assert.throws(() => valueAxes({ candidate, owned, purpose: 'resell' }), /목적/);
  assert.equal(wearExpectation('collect'), 'not-expected');
  assert.equal(costPerWear(100000, 4), 25000);
  assert.equal(costPerWear(100000, 0), null);
});

test('series shelves count real items; empty slots only come from the user\'s own target', () => {
  const shelves = seriesShelves(owned, [{ series: 'LVC 501', target: 5 }, { series: '포터리', target: 2 }]);
  assert.deepEqual(shelves.map((s) => [s.name, s.count, s.empty]), [['LVC 501', 2, 3], ['포터리', 0, 2]]);
  assert.deepEqual(seriesShelves(owned).map((s) => s.empty), [0]);
});

test('outfit facts give a verdict and a basis per dimension; silhouette is unknown without profiles', () => {
  const facts = outfitFacts({
    items: [
      { slot: 'm-oxford', color: 'white', profile: p({ silhouette: { value: 'over', source: 'chosen' } }) },
      { slot: 'm-chino', color: 'beige', profile: p({ silhouette: { value: 'wide', source: 'chosen' } }) },
    ],
    occasion: 'work', season: 'fall', styles: ['classic'],
  });
  const by = Object.fromEntries(facts.map((f) => [f.dim, f]));
  assert.equal(by.silhouette.verdict, 'volume-heavy');
  assert.match(by.formality.basis, /출근 기준 3~4/);
  assert.ok(facts.every((f) => f.editorial && f.basis));
  assert.equal(outfitFacts({ items: [{ slot: 'm-oxford', color: 'white' }] }).find((f) => f.dim === 'silhouette').verdict, 'unknown');
  assert.ok(outfitFactLines(facts).every((l) => /\(편집 규칙\)$/.test(l)));
});

test('reactions are validated and summarized as real counts', () => {
  const at = '2026-10-25T09:00:00.000Z';
  const list = validateReactions([
    { id: 'r_1', garmentIds: ['a', 'd'], verdict: 'like', reasons: ['good_color'], occasion: 'work', at },
    { id: 'r_2', garmentIds: ['c'], verdict: 'dislike', reasons: ['dull_color', 'too_casual'], occasion: null, at },
  ]);
  const t = tasteSummary(list);
  assert.deepEqual([t.likes, t.dislikes], [1, 1]);
  assert.equal(tasteSummary(list, { garmentIds: ['a'] }).likes, 1);
  assert.throws(() => validateReactions([{ ...list[0], reasons: ['cute'] }]), /이유/);
  assert.throws(() => validateReactions([list[0], list[0]]), /두 번/);
  assert.match(outfitFactLines([], t)[0], /좋아요 1 · 별로 1/);
});

test('attribute claim check flags unrecorded or contradicted claims only in sentences naming a candidate', () => {
  const candidates = [
    { name: '옥스퍼드 셔츠', profile: p({ silhouette: { value: 'regular', source: 'seller' } }) },
    { name: '치노 팬츠', profile: p({ fabric: { value: '코튼 트윌', source: 'seller' } }) },
  ];
  const lines = attributeClaimCheck('옥스퍼드 셔츠는 오버핏이라 여유 있어요. 치노 팬츠는 울 소재라 따뜻해요. 둘 다 잘 어울려요.', candidates);
  assert.deepEqual(lines, [
    "확인: 옥스퍼드 셔츠의 실루엣은 '레귤러'로 기록돼 있어요.",
    "확인: 치노 팬츠의 소재는 '코튼 트윌'로 기록돼 있어요.",
  ]);
  assert.deepEqual(attributeClaimCheck('옥스퍼드 셔츠는 체크 무늬예요.', candidates), ['확인: 옥스퍼드 셔츠의 무늬는 기록되지 않았어요.']);
  assert.deepEqual(attributeClaimCheck('치노 팬츠는 울이에요.', [{ name: '치노 팬츠', profile: p({ fabric: { value: '면', source: 'seller' } }) }]).length, 1);
  assert.deepEqual(attributeClaimCheck('치노 팬츠는 울산에서 샀어요.', [{ name: '치노 팬츠', profile: p({}) }]), []);
  assert.deepEqual(attributeClaimCheck('치노 팬츠는 울 소재예요.', [{ name: '치노 팬츠', profile: p({ fabric: { value: '면', source: 'seller' } }) }]),
    ["확인: 치노 팬츠의 소재는 '면'으로 기록돼 있어요."]);
  assert.deepEqual(attributeClaimCheck('치노 팬츠가 셔츠와 잘 어울려요. 사이즈를 체크해 보세요.', candidates), []);
  const shirt = (fabric) => [{ name: '셔츠', profile: p({ fabric: { value: fabric, source: 'seller' } }) }];
  assert.deepEqual(attributeClaimCheck('셔츠는 울 소재가 아니라 면 소재예요.', shirt('면')), []);
  assert.deepEqual(attributeClaimCheck('셔츠는 울 소재가 아니에요.', shirt('울')), ["확인: 셔츠의 소재는 '울'로 기록돼 있어요."]);
  const pair = [
    { name: '셔츠', profile: p({ silhouette: { value: 'regular', source: 'seller' } }) },
    { name: '팬츠', profile: p({ silhouette: { value: 'wide', source: 'seller' } }) },
  ];
  assert.deepEqual(attributeClaimCheck('셔츠는 레귤러이고 팬츠는 와이드예요.', pair), []);
  assert.deepEqual(attributeClaimCheck('셔츠는 와이드 팬츠와 잘 어울려요.', [pair[0]]), []);
  assert.deepEqual(attributeClaimCheck('셔츠와 와이드 팬츠를 입어요.', [pair[0]]), []);
  assert.deepEqual(attributeClaimCheck('와이드 셔츠가 좋아요.', [pair[0]]), ["확인: 셔츠의 실루엣은 '레귤러'로 기록돼 있어요."]);
  assert.deepEqual(attributeClaimCheck('와이드 바지가 좋아요.', candidates), []);
});

test('rail layout: three rails, shared scale by measured length, placeholders marked, shelf for the rest', () => {
  const garments = [
    { id: 's', kind: 'shirt', color: 'white', addedAt: '2026-10-01T00:00:00.000Z', profile: p({ measures: { length: { cm: 72, source: 'measured' } } }) },
    { id: 'j', kind: 'jeans', color: 'indigo', addedAt: '2026-10-03T00:00:00.000Z', profile: p({ measures: { length: { cm: 104, source: 'measured' } } }) },
    { id: 'k', kind: 'jacket', color: 'navy', addedAt: '2026-10-02T00:00:00.000Z' },
    { id: 'o', kind: 'dress', color: 'black', addedAt: '2026-10-04T00:00:00.000Z' },
    { id: 'n', kind: 'sneaker', color: 'white' },
  ];
  const r = railLayout(garments);
  assert.deepEqual(r.rails.map((x) => [x.id, x.items.map((i) => i.id)]), [['outer', ['k']], ['top', ['o', 's']], ['bottom', ['j']]]);
  assert.equal(r.rails[2].items[0].heightPx, 220);
  assert.equal(r.rails[1].items[1].heightPx, Math.round(72 * (220 / 104)));
  assert.equal(r.rails[0].items[0].measured, false);
  assert.deepEqual(r.shelf.map((x) => x.id), ['n']);
  assert.deepEqual(railLayout(garments, { sort: 'worn', wearCounts: { s: 3 } }).rails[1].items.map((i) => i.id), ['s', 'o']);
  assert.throws(() => railLayout(garments, { sort: 'price' }), /정렬/);
});

test('collage scale comes from the user\'s height and photo; lengths scale the cutouts', () => {
  const scale = bodyScale({ heightCm: 175, headTopY: 100, feetY: 1850 });
  assert.equal(scale.pxPerCm, 10);
  const shirt = placeGarment({ item: { kind: 'shirt' }, lengthCm: 72, image: { width: 600, height: 800 }, scale, centerX: 500 });
  assert.deepEqual([shirt.height, shirt.width, shirt.y, shirt.layer, shirt.assumedLength], [720, 540, 415, 2, false]);
  const pants = placeGarment({ item: { kind: 'jeans' }, image: { width: 400, height: 1000 }, scale, centerX: 500 });
  assert.equal(pants.assumedLength, true);
  assert.equal(pants.y, 100 + Math.round(175 * 0.42 * 10));
  assert.equal(placeGarment({ item: { kind: 'sneaker' }, image: { width: 1, height: 1 }, scale, centerX: 0 }), null);
  assert.throws(() => bodyScale({ heightCm: 90, headTopY: 0, feetY: 900 }), /키/);
});

test('unconfirmed AI attributes stay labelled and cannot establish an outfit verdict or corrective fact', () => {
  const facts = outfitFacts({ items: [
    { slot: 'm-oxford', color: 'white', profile: p({ silhouette: { value: 'over', source: 'ai' } }) },
    { slot: 'm-chino', color: 'beige', profile: p({ silhouette: { value: 'wide', source: 'chosen' } }) },
  ] });
  const silhouette = facts.find((f) => f.dim === 'silhouette');
  assert.equal(silhouette.verdict, 'unknown');
  assert.ok(outfitFactLines(facts).some((line) => /AI 추정 · 확인 전/.test(line)));
  const check = attributeClaimCheck('셔츠는 코튼 소재예요.', [
    { name: '셔츠', profile: p({ fabric: { value: '울', source: 'ai' } }) },
  ]);
  assert.ok(check.some((line) => /AI 추정 · 확인 전/.test(line)));
  assert.ok(check.every((line) => !/'울'.*기록돼/.test(line)), 'an estimate cannot correct a claim as a verified record');
});

test('attribute differences retain provenance and estimates stay unknown until confirmed', () => {
  const estimated = p({ fabric: { value: '울', source: 'ai' }, details: [{ text: '셀비지', source: 'ai' }] });
  const recorded = p({ fabric: { value: '코튼', source: 'seller' }, details: [{ text: '체인스티치', source: 'chosen' }] });
  const diff = detailDiff(estimated, recorded);
  const fabric = diff.attrs.find((a) => a.key === 'fabric');
  assert.equal(fabric.state, 'unknown');
  assert.equal(fabric.candidateSource, 'ai');
  assert.equal(fabric.ownedSource, 'seller');
  assert.match(fabric.candidate, /AI 추정 · 확인 전/);
  assert.deepEqual(diff.onlyCandidate, []);
  assert.deepEqual(diff.unconfirmed.candidate, [{ text: '셀비지', source: 'ai' }]);
  assert.equal(diff.detailsUnknown, true);
  const chosen = { ...estimated, fabric: { value: '울', source: 'chosen' }, details: [{ text: '셀비지', source: 'chosen' }] };
  const confirmed = detailDiff(chosen, recorded);
  assert.equal(confirmed.attrs.find((a) => a.key === 'fabric').state, 'different');
  assert.deepEqual(confirmed.detailFacts.onlyCandidate, [{ text: '셀비지', source: 'chosen' }]);
  assert.equal(estimated.fabric.source, 'ai', 'comparison must not confirm or mutate the original');
});

test('value summary examines every similar garment and never treats unknown attributes as a duplicate', () => {
  const candidate = { kind: 'jeans', color: 'indigo', profile: p({ fabric: { value: '데님', source: 'seller' } }) };
  const list = [
    { id: 'unknown', kind: 'jeans', color: 'indigo' },
    { id: 'known', kind: 'jeans', color: 'indigo', profile: p({ fabric: { value: '코듀로이', source: 'chosen' } }) },
  ];
  for (const garments of [list, [...list].reverse()]) {
    const result = valueAxes({ candidate, owned: garments, purpose: 'wear' });
    assert.ok(result.differences.includes('소재'));
    assert.match(result.summary, /소재/);
    assert.equal(result.duplicateWarning, false);
  }
  const unknown = valueAxes({ candidate: { kind: 'jeans', color: 'indigo' }, owned: [list[0]], purpose: 'wear' });
  assert.equal(unknown.duplicateWarning, false);
  assert.match(unknown.summary, /모르는|확인 전/);
});

test('duplicate warning needs a fully recorded same-color match and still respects collecting', () => {
  const profile = p({
    silhouette: { value: 'regular', source: 'chosen' }, fabric: { value: '데님', source: 'seller' },
    thickness: { value: 'mid', source: 'chosen' }, surface: { value: 'textured', source: 'chosen' },
    pattern: { value: 'solid', source: 'chosen' }, details: [{ text: '셀비지', source: 'chosen' }],
  });
  const candidate = { kind: 'jeans', color: 'indigo', profile };
  const owned = [{ ...candidate, id: 'matching' }];
  assert.equal(valueAxes({ candidate, owned, purpose: 'wear' }).duplicateWarning, true);
  assert.equal(valueAxes({ candidate, owned, purpose: 'collect' }).duplicateWarning, false);
  const unconfirmed = { ...candidate, profile: { ...profile, surface: { value: 'textured', source: 'ai' } } };
  assert.equal(valueAxes({ candidate: unconfirmed, owned, purpose: 'wear' }).duplicateWarning, false);
});
