import { authorizePrivateRequest } from '../lib/private-access.js';
import { findOpenProducts, readOpenProducts } from '../lib/open-products-store.js';

export async function handleOpenProducts(request, env, { authorize = authorizePrivateRequest } = {}) {
  const reply = (status, body, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
  if (request.method !== 'GET') return reply(405, { message: 'GET만 받아요.' });
  let access;
  try { access = await authorize(request, env); } catch { return reply(503, { message: '접속 설정을 확인해 주세요.' }); }
  if (!access?.ok) return reply(access?.status || 401, { message: '본인 로그인이 필요해요.', login: '/_private/login' });
  const url = new URL(request.url), exporting = url.pathname === '/api/open-products/export';
  if (!exporting && url.pathname !== '/api/open-products') return reply(404, { message: '없는 경로예요.' });
  const query = url.searchParams.get('q')?.trim() || '';
  if (!exporting && (!query || query.length > 120 || /[\x00-\x1f\x7f]/.test(query))) return reply(400, { message: '검색어를 120자 이내로 입력해 주세요.' });
  try {
    const data = exporting ? await readOpenProducts(env) : await findOpenProducts(env, query);
    return reply(200, data, exporting ? { 'Content-Disposition': 'attachment; filename="open-products-ODbL.json"' } : {});
  } catch { return reply(503, { message: '공개 상품 DB를 확인하지 못했어요. 잠시 뒤 다시 검색해 주세요.' }); }
}
export const onRequest = ({ request, env }) => handleOpenProducts(request, env);
