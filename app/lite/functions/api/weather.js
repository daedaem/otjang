// 오늘·내일 날씨(대표 요구 R17). GET /api/weather?lat=37.6&lon=127.0 → {place, today:{min,max,rain,date}, tomorrow:{...}}
// Open-Meteo 예보(키 없음, 비상업 무료)를 서버가 대신 묻는다: 사용자 IP가 날씨 서비스로 가지 않고, 좌표는 0.1°(약 10km)로 줄여 보낸다.
// 좌표는 저장하지 않는다. 같은 칸·같은 시간대 요청은 Cloudflare 캐시로 30분 재사용한다.
const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});
export const RAIN_PERCENT = 50;
export const SEOUL = { lat: 37.6, lon: 127.0 };

export function readCoords(url) {
  const [rawLat, rawLon] = [url.searchParams.get('lat'), url.searchParams.get('lon')];
  if (!rawLat || !rawLon) return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10 };
}

export function toDays(data) {
  const d = data?.daily;
  if (!d?.time?.length) return null;
  const day = (i) => (d.time[i] == null ? null : {
    date: d.time[i],
    min: Math.round(d.temperature_2m_min[i]),
    max: Math.round(d.temperature_2m_max[i]),
    rain: Number(d.precipitation_probability_max?.[i]) >= RAIN_PERCENT,
    rainChance: d.precipitation_probability_max?.[i] ?? null,
  });
  return { today: day(0), tomorrow: day(1) };
}

// options.fetcher: 시험에서 가짜 응답을 넣을 때만 쓴다.
export async function handleWeather(request, env, { fetcher = fetch } = {}) {
  const url = new URL(request.url);
  const coords = readCoords(url);
  if (!coords) return reply(400, { code: 'bad_request', message: '위치 값이 올바르지 않아요.' });
  const api = new URL('https://api.open-meteo.com/v1/forecast');
  api.search = new URLSearchParams({
    latitude: String(coords.lat), longitude: String(coords.lon),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Asia/Seoul', forecast_days: '2',
  }).toString();
  let data;
  try {
    const res = await fetcher(api.toString(), { cf: { cacheTtl: 1800, cacheEverything: true } });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    return reply(502, { code: 'error', message: '날씨를 받지 못했어요.' });
  }
  const days = toDays(data);
  if (!days?.today) return reply(502, { code: 'parse', message: '날씨를 읽지 못했어요.' });
  return reply(200, { source: 'Open-Meteo', coords, ...days }, { 'cache-control': 'private, max-age=900' });
}

export const onRequestGet = ({ request, env }) => handleWeather(request, env);
