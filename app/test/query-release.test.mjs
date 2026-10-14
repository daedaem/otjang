import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/query.js';
import { SLOTS } from '../src/data/slots.js';

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
  assert.equal(parseQuery('셔츠 높은 가격순').priceSort, null);
  assert.equal(parseQuery('저렴한 셔츠').maxPrice, 60000);
});
