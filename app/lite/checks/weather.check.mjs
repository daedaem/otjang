// 날씨 서버 함수 점검(가짜 Open-Meteo 응답, 네트워크 없음). 실행: npm test (app/lite)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWeather, readCoords, toDays } from '../functions/api/weather.js';

const get = (q) => new Request(`https://x.test/api/weather?${q}`);
const sample = { daily: { time: ['2026-10-21', '2026-10-22'], temperature_2m_max: [14.2, 13.5], temperature_2m_min: [6.5, 2.7], precipitation_probability_max: [92, 0] } };

test('좌표는 0.1°로 줄이고, 잘못된 값은 거절한다', () => {
  assert.deepEqual(readCoords(new URL('https://x/?lat=37.5665&lon=126.978')), { lat: 37.6, lon: 127 });
  assert.deepEqual(readCoords(new URL('https://x/?lat=0&lon=0')), { lat: 0, lon: 0 });
  for (const q of ['', 'lat=abc&lon=1', 'lat=95&lon=1', 'lat=1&lon=200', 'lat=&lon=1', 'lat=+&lon=1', 'lat=1&lon=+', 'lat=0x10&lon=1', 'lat=Infinity&lon=1']) {
    assert.equal(readCoords(new URL(`https://x/?${q}`)), null, q);
  }
});

test('오늘·내일 최저·최고(반올림)와 비(강수 확률 50% 이상)', () => {
  const d = toDays(sample);
  assert.deepEqual(d.today, { date: '2026-10-21', min: 7, max: 14, rain: true, rainChance: 92 });
  assert.equal(d.tomorrow.rain, false);
});

test('줄인 좌표로만 묻고, 실패하면 502', async () => {
  const asked = [];
  const ok = await handleWeather(get('lat=37.5665&lon=126.978'), {}, { fetcher: async (u) => { asked.push(u); return new Response(JSON.stringify(sample)); } });
  const body = await ok.json();
  assert.equal(ok.status, 200);
  assert.equal(body.today.max, 14);
  assert.match(asked[0], /latitude=37\.6&longitude=127&/);
  assert.ok(!asked[0].includes('37.5665'));
  const bad = await handleWeather(get('lat=37&lon=127'), {}, { fetcher: async () => new Response('x', { status: 500 }) });
  assert.equal(bad.status, 502);
  assert.equal((await handleWeather(get('lat=x'), {})).status, 400);
});

test('2일 예보·실제 달력 날짜·유한한 숫자·최저/최고·강수 범위를 확인한다', () => {
  const invalid = [
    {}, { daily: { time: ['2026-10-21', '2026-10-22'] } },
    ...['time', 'temperature_2m_min', 'temperature_2m_max', 'precipitation_probability_max'].flatMap((field) => [
      { daily: { ...sample.daily, [field]: [sample.daily[field][0]] } },
      { daily: { ...sample.daily, [field]: {} } },
    ]),
    ...[null, '7', NaN, Infinity].flatMap((value) => [
      { daily: { ...sample.daily, temperature_2m_min: [value, 2.7] } },
      { daily: { ...sample.daily, temperature_2m_max: [14.2, value] } },
      { daily: { ...sample.daily, precipitation_probability_max: [value, 0] } },
    ]),
    { daily: { ...sample.daily, temperature_2m_min: [20, 2.7] } },
    ...[-1, 101].map((value) => ({ daily: { ...sample.daily, precipitation_probability_max: [value, 0] } })),
    ...[['not-a-date', '2026-10-22'], ['2026-02-30', '2026-03-03'], ['2026-10-21', '2026-10-21'], ['2026-10-22', '2026-10-21'], ['2026-10-21', '2026-10-23']]
      .map((time) => ({ daily: { ...sample.daily, time } })),
  ];
  for (const data of invalid) assert.equal(toDays(data), null, JSON.stringify(data));
  const freezing = toDays({ daily: { ...sample.daily, temperature_2m_min: [-1, 0], temperature_2m_max: [0, 0], precipitation_probability_max: [50, 100] } });
  assert.equal(freezing.today.max, 0);
  assert.equal(freezing.tomorrow.rain, true);
});

test('결측·잘못된 상류 예보는 0도나 비 없음으로 꾸미지 않고 502 JSON으로 돌려준다', async () => {
  for (const data of [
    { daily: { time: ['2026-10-21', '2026-10-22'] } },
    { daily: { ...sample.daily, temperature_2m_min: [null, null], temperature_2m_max: [null, null] } },
    { daily: { ...sample.daily, precipitation_probability_max: [null, null] } },
    { daily: { ...sample.daily, time: ['2026-10-21'] } },
  ]) {
    const res = await handleWeather(get('lat=37&lon=127'), {}, { fetcher: async () => new Response(JSON.stringify(data)) });
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { code: 'parse', message: '날씨를 읽지 못했어요.' });
  }
});

test('상류 접속·JSON 오류와 시간 초과는 502로 끝내고 내부 오류는 노출하지 않는다', async () => {
  const fetchers = [
    async () => { throw new Error('private upstream diagnostic'); },
    async () => new Response('not json'),
    async () => new Response('upstream error', { status: 503 }),
  ];
  for (const fetcher of fetchers) {
    const res = await handleWeather(get('lat=37&lon=127'), {}, { fetcher });
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { code: 'error', message: '날씨를 받지 못했어요.' });
  }
  let signal;
  const res = await handleWeather(get('lat=37&lon=127'), {}, {
    timeoutMs: 5,
    fetcher: async (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
    },
  });
  assert.equal(signal.aborted, true);
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { code: 'error', message: '날씨를 받지 못했어요.' });
});
