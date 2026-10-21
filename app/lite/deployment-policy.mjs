// Product photo rights are unverified. Git review/merge must not silently publish a preview.
// Workers Builds executes the build before the deploy/preview command; fail before any output is made.
// This is a release interlock, not a security boundary against an account administrator.
// Build variables do not prove runtime authentication/Secret setup. The Worker verifies
// every request independently and must be configured with assets.run_worker_first: true.
function privateConfiguration(env) {
  // Secret values live only in Worker runtime bindings. The build interlock verifies
  // explicit intent; it cannot prove that runtime credentials are configured.
  if (env.PRIVATE_AUTH_MODE === 'session') return true;
  if (env.PRIVATE_AUTH_MODE !== undefined && env.PRIVATE_AUTH_MODE !== 'access') return false;
  const domain = typeof env.ACCESS_TEAM_DOMAIN === 'string' ? env.ACCESS_TEAM_DOMAIN.trim() : '';
  const aud = typeof env.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : '';
  return /^(?:https:\/\/)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com\/?$/i.test(domain) &&
    aud.length > 0 && aud.length <= 512 && !/[\s\x00-\x1f\x7f]/.test(aud);
}

export function assertBuildAllowed(env = process.env) {
  const publicApproved = env.OTJANG_ALLOW_PUBLIC_DEPLOY === 'owner-approved';
  const privateApproved = env.OTJANG_PRIVATE_DEPLOY === 'owner-approved' && privateConfiguration(env);
  if (env.WORKERS_CI && !publicApproved && !privateApproved) {
    throw new Error('PUBLIC_DEPLOY_BLOCKED: 상품 사진 권리 미확인. 공개·미리보기 배포는 별도 대표 승인 전까지 중단합니다. 로컬/GitHub 검사는 허용합니다.');
  }
}
