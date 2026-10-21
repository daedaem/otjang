// Cloudflare Workers로 올릴 때의 입구(Workers Builds: `npx wrangler deploy`). Pages로 올리면 이 파일은 쓰지 않고 functions/를 쓴다.
// /api/rank·/api/catalog/*·/api/weather만 이 코드가 받고(wrangler.jsonc의 run_worker_first), 나머지 주소는 dist/의 앱 파일을 그대로 보낸다.
import { handle } from './functions/api/rank.js';
import { handleCatalog } from './functions/api/catalog.js';
import { handleWeather } from './functions/api/weather.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rank') {
      if (request.method !== 'POST') return new Response('POST만 받아요.', { status: 405 });
      return handle(request, env);
    }
    if (url.pathname.startsWith('/api/catalog/')) return handleCatalog(request, env);
    if (url.pathname === '/api/weather' && request.method === 'GET') return handleWeather(request, env);
    return env.ASSETS.fetch(request);
  },
};
