// 날씨 서버 함수 점검(가짜 Open-Meteo 응답, 네트워크 없음). 실행: npm test (app/lite)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWeather, readCoords, toDays } from '../functions/api/weather.js';

const get = (q) => new Request(`https://x.test/api/weather?${q}`);
const sample = { daily: { time: ['2026-10-21', '2026-10-22'], temperature_2m_max: [14.2, 13.5], temperature_2m_min: [6.5, 2.7], precipitation_probability_max: [92, 0] } };

test('좌표는 0.1°로 줄이고, 잘못된 값은 거절한다', () => {
  assert.deepEqual(readCoords(new URL('https://x/?lat=37.5665&lon=126.978')), { lat: 37.6, lon: 127 });
  for (const q of ['', 'lat=abc&lon=1', 'lat=95&lon=1', 'lat=1&lon=200']) assert.equal(readCoords(new URL(`https://x/?${q}`)), null);
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
