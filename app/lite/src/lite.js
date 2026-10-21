// 설치형 앱 연결부: 후보 id·옷장 비교만 서버에 보내고, 상품 사실·AI 지시는 서버가 채운다.
// 링크 페이지의 Claude sample 기능은 덮어쓰지 않는다. 서비스 워커도 여기서 등록한다.
(() => {
  const ERR = { 400: 'bad_request', 401: 'unauthorized', 403: 'unauthorized', 413: 'bad_request', 429: 'rate_limited', 503: 'not_configured' };
  const resumeLogin = (res, body) => {
    if (res.status === 401 && body?.login === '/_private/login' && typeof window.location?.replace === 'function') {
      window.location.replace('/_private/login');
    }
  };
  window.EOUL_SERVER_AI = async (request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
      const body = await res.json().catch(() => null);
      resumeLogin(res, body);
      if (!res.ok) throw Object.assign(new Error(body?.message || `HTTP ${res.status}`), { code: body?.code || ERR[res.status] || 'error' });
      if (!body || typeof body !== 'object') throw Object.assign(new Error('parse'), { code: 'parse' });
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw Object.assign(new Error('timeout'), { code: 'timeout' });
      if (error?.code) throw error;
      throw Object.assign(new Error('offline'), { code: 'offline' });
    } finally {
      clearTimeout(timer);
    }
  };

  // Button-triggered official retailer search. No wardrobe/history/photos or API secret in the browser request.
  window.EOUL_RAKUTEN = async (query) => {
    const res = await fetch(`/api/rakuten?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(12000) });
    const body = await res.json().catch(() => null);
    resumeLogin(res, body);
    if (!res.ok || !Array.isArray(body?.items)) throw new Error(body?.message || '라쿠텐 검색을 불러오지 못했어요.');
    return body;
  };

  // 사용자 등록 카탈로그(/api/catalog/*). 화면은 window.EOUL_CROWD가 있을 때만 공유 등록을 쓰고, 없으면(링크 시안) 이 기기에만 둔다.
  // 실패는 {code}로 돌려준다: not_configured(DB 미연결)·offline·invalid·daily_limit·error. 기기 id는 이 브라우저에만 있는 무작위 값.
  const deviceId = () => {
    try {
      let id = localStorage.getItem('eoul-crowd:device');
      if (!id) { id = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem('eoul-crowd:device', id); }
      return id;
    } catch { return null; }
  };
  const api = async (path, body) => {
    let res;
    try {
      res = await fetch(`/api/catalog/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    } catch { return { code: 'offline' }; }
    const out = await res.json().catch(() => null);
    resumeLogin(res, out);
    return res.ok && out ? out : { code: out?.code || 'error', message: out?.message };
  };
  // 오늘·내일 날씨(/api/weather). 날씨 지역은 이 기기에만 저장한다: '현재 위치'(열 때마다 위치를 묻고, 거절하면 서울)
  // 또는 '내 지역'(목록에서 고르거나, 지금 있는 곳을 0.1°로 줄여 저장). 서버에는 0.1°로 줄인 좌표만 보낸다.
  // 화면은 window.EOUL_WEATHER가 있을 때만 실제 날씨를 쓰고, 없으면(링크 시안) 예시 날씨라고 밝힌다.
  const SEOUL = { lat: 37.6, lon: 127.0 };
  const PLACE_KEY = 'eoul-weather:place';
  const CACHE_KEY = 'eoul-weather:last';
  const round = (n) => Math.round(n * 10) / 10;
  const PRESETS = [
    ['서울', 37.6, 127.0], ['인천', 37.5, 126.7], ['수원', 37.3, 127.0], ['성남', 37.4, 127.1], ['고양', 37.7, 126.8],
    ['용인', 37.2, 127.2], ['춘천', 37.9, 127.7], ['강릉', 37.8, 128.9], ['대전', 36.4, 127.4], ['세종', 36.5, 127.3],
    ['청주', 36.6, 127.5], ['전주', 35.8, 127.1], ['광주', 35.2, 126.9], ['대구', 35.9, 128.6], ['포항', 36.0, 129.4],
    ['울산', 35.5, 129.3], ['부산', 35.2, 129.1], ['창원', 35.2, 128.7], ['제주', 33.5, 126.5],
  ].map(([name, lat, lon]) => ({ name, lat, lon }));
  const where = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lon: round(p.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 60 * 1000 },
    );
  });
  const readPlace = () => {
    try {
      const p = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null');
      if (p?.mode === 'fixed' && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return { mode: 'fixed', name: String(p.name || '내 지역').slice(0, 20), lat: round(p.lat), lon: round(p.lon) };
    } catch {}
    return { mode: 'here' };
  };
  window.EOUL_WEATHER_PLACE = {
    presets: PRESETS,
    get: readPlace,
    // place: {mode:'here'} 또는 {mode:'fixed', name, lat, lon}
    set(place) {
      const p = place?.mode === 'fixed' ? { mode: 'fixed', name: String(place.name || '내 지역').slice(0, 20), lat: round(+place.lat), lon: round(+place.lon) } : { mode: 'here' };
      try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); localStorage.removeItem(CACHE_KEY); } catch {}
      return p;
    },
    // 지금 있는 곳(0.1°)을 돌려준다. 위치를 거절하면 null.
    here: where,
  };
  window.EOUL_WEATHER = async () => {
    const place = readPlace();
    const sig = place.mode === 'fixed' ? `${place.lat},${place.lon}` : 'here';
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (saved && saved.sig === sig && Date.now() - saved.at < 30 * 60 * 1000) return saved.value;
    } catch {}
    const here = place.mode === 'here' ? await where() : null;
    const c = place.mode === 'fixed' ? place : here || SEOUL;
    let res;
    try { res = await fetch(`/api/weather?lat=${c.lat}&lon=${c.lon}`); } catch { return null; }
    const body = await res.json().catch(() => null);
    resumeLogin(res, body);
    if (!res.ok) return null;
    if (!body?.today) return null;
    const label = place.mode === 'fixed' ? place.name : here ? '현재 위치' : '서울(위치 허용 전)';
    const value = { place: label, placeMode: place.mode, source: body.source, today: body.today, tomorrow: body.tomorrow };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), sig, value })); } catch {}
    return value;
  };

  window.EOUL_CROWD = {
    submit: (item) => api('submit', { ...item, device: deviceId() }),
    withdraw: (key) => api('withdraw', { key, device: deviceId() }),
    search: (q) => api(`search?q=${encodeURIComponent(q)}`),
    status: (keys) => api(`status?keys=${keys.map(encodeURIComponent).join(',')}`),
  };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
