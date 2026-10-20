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

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
