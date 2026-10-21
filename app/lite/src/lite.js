// 설치형 앱 연결부: 링크 페이지의 sample 기능 자리에 우리 서버 함수(/api/rank)를 같은 모양으로 끼운다.
// 화면(d7)과 ai-rank.js는 그대로 두고, 이 파일만 설치형 앱에서 더한다. 서비스 워커도 여기서 등록한다.
(() => {
  const ERR = { 400: 'error', 429: 'rate_limited', 503: 'not_configured' };
  const sample = {
    async json(prompt) {
      let res;
      try {
        res = await fetch('/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) });
      } catch {
        throw Object.assign(new Error('offline'), { code: 'offline' });
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error(body?.message || `HTTP ${res.status}`), { code: body?.code || ERR[res.status] || 'error' });
      return body;
    },
  };
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };

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
    return res.ok && out ? out : { code: out?.code || 'error', message: out?.message };
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
