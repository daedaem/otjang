import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../../app/lite/src/domain/query.js';
import { SLOTS } from '../../../app/lite/src/domain/data/slots.js';

const matchingIds = (query, field = 'targetMatch') => SLOTS.filter(query[field]).map((slot) => slot.id);

test('패딩 조끼의 복합 이름은 니트 베스트나 패딩 재킷으로 넓히지 않는다', () => {
  for (const request of ['패딩 베스트', '패딩 조끼', '다운 베스트', '다운 조끼', '패딩조끼', '푸퍼 베스트']) {
    const query = parseQuery(request);
    assert.deepEqual(matchingIds(query), ['m-downvest'], request);
    assert.deepEqual(query.terms, ['패딩 베스트'], request);
  }
  assert.ok(matchingIds(parseQuery('베스트')).includes('m-vest'));
  assert.deepEqual(matchingIds(parseQuery('패딩')), ['m-down', 'f-padding']);
});

test('패딩 베스트를 기준으로 한 요청도 기준 종류를 보존한다', () => {
  const query = parseQuery('다운 조끼에 어울리는 셔츠');
  assert.deepEqual(matchingIds(query, 'anchorMatch'), ['m-downvest']);
  assert.ok(matchingIds(query).every((id) => SLOTS.find((slot) => slot.id === id).shape === 'shirt'));
});

test('낮은 가격순 요청은 가격 정렬이며 임의 예산을 만들지 않는다', () => {
  for (const request of ['셔츠 최저가', '최저가 로퍼', '셔츠 낮은가격순', '셔츠 낮은 가격 순', '셔츠 가격순']) {
    const query = parseQuery(request);
    assert.equal(query.priceSort, 'asc', request);
    assert.equal(query.maxPrice, null, request);
    assert.ok(query.terms.includes('낮은 가격순'), request);
    assert.ok(!query.terms.includes('6만원 이하'), request);
    assert.match(query.summary, /낮은 가격순으로/);
  }
});

test('가격 정렬과 함께 명시한 예산은 유지한다', () => {
  for (const [request, budget] of [
    ['셔츠 최저가 10만원 이하', 100000],
    ['가격순 로퍼 70000원 이하', 70000],
    ['셔츠 최저가 50,000원 이하', 50000],
  ]) {
    const query = parseQuery(request);
    assert.equal(query.priceSort, 'asc', request);
    assert.equal(query.maxPrice, budget, request);
  }
  assert.equal(parseQuery('출근용 셔츠 10만원 이하').priceSort, null);
  assert.equal(parseQuery('셔츠 높은 가격순').priceSort, 'desc');
  assert.equal(parseQuery('저렴한 셔츠').maxPrice, 60000);
});

test('가격과 브랜드와 계절은 관련 없는 단어 일부에서 추측하지 않는다', () => {
  const brands = ['폴로 랄프 로렌', '아크테릭스'];
  for (const request of ['비싼 셔츠', '싼티 안 나는 셔츠', '1만보 걷기 운동화', '1만 보 걷기 운동화']) {
    assert.equal(parseQuery(request).maxPrice, null, request);
  }
  assert.equal(parseQuery('비싼 셔츠').priceSort, 'desc');
  assert.equal(parseQuery('싼 셔츠').maxPrice, 60000);
  for (const request of ['폴로셔츠', '폴로 셔츠', '폴로티', '폴로 티', 'polo shirt']) {
    const query = parseQuery(request, { brands });
    assert.equal(query.brand, null, request);
    assert.deepEqual(matchingIds(query), ['m-polo'], request);
  }
  for (const request of ['폴로 니트', '폴로랄프로렌 니트', '폴로 랄프로렌 니트', 'polo ralph lauren knit'])
    assert.equal(parseQuery(request, { brands }).brand, '폴로 랄프 로렌', request);
  assert.equal(parseQuery('폴로 랄프 로렌 폴로셔츠', { brands }).brand, '폴로 랄프 로렌');
  assert.equal(parseQuery('아크릴 니트', { brands }).brand, null);
  assert.ok(matchingIds(parseQuery('진')).every((id) => SLOTS.find((slot) => slot.id === id).shape === 'jeans'));
  assert.ok(matchingIds(parseQuery('백')).every((id) => SLOTS.find((slot) => slot.id === id).shape === 'bag'));
  assert.deepEqual(matchingIds(parseQuery('마진 백업')), []);
  for (const request of ['봄버', '봄버 자켓', '봄버자켓']) assert.equal(parseQuery(request).season, null, request);
  for (const request of ['봄 셔츠', '봄용 셔츠', '봄코트']) assert.equal(parseQuery(request).season, 'spring', request);
});

test('금액의 이상과 이하와 엄격한 경계를 따로 보존한다', () => {
  for (const [request, min, max, minExclusive, maxExclusive] of [
    ['셔츠 10만원이상', 100000, null, false, false],
    ['셔츠 10만 원 이상', 100000, null, false, false],
    ['셔츠 최소 10만원', 100000, null, false, false],
    ['셔츠 100,000원 이하', null, 100000, false, false],
    ['셔츠 10만원 초과', 100000, null, true, false],
    ['10만원 넘는 셔츠', 100000, null, true, false],
    ['10만원 넘어 셔츠', 100000, null, true, false],
    ['10만원 넘 셔츠', 100000, null, true, false],
    ['10만원 넘지 않는 셔츠', null, 100000, false, false],
    ['10만원 안 넘는 셔츠', null, 100000, false, false],
    ['10만원 넘지 않게 셔츠', null, 100000, false, false],
    ['10만원 넘지 않도록 셔츠', null, 100000, false, false],
    ['10만원 넘지 말고 셔츠', null, 100000, false, false],
    ['10만원 안 넘게 셔츠', null, 100000, false, false],
    ['셔츠 10만원 미만', null, 100000, false, true],
    ['셔츠 5~10만원', 50000, 100000, false, false],
    ['셔츠 5만원~10만원', 50000, 100000, false, false],
    ['셔츠 5만원부터 10만원까지', 50000, 100000, false, false],
    ['셔츠 5만원대', 50000, 59999, false, false],
  ]) {
    const query = parseQuery(request);
    assert.equal(query.minPrice, min, request);
    assert.equal(query.maxPrice, max, request);
    assert.equal(query.minPriceExclusive, minExclusive, request);
    assert.equal(query.maxPriceExclusive, maxExclusive, request);
  }
  const exact = parseQuery('셔츠 50,001원 이하');
  assert.ok(exact.terms.includes('50,001원 이하'));
});
