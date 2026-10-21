// Product photo rights are unverified. Git review/merge must not silently publish a preview.
// Workers Builds executes the build before the deploy/preview command; fail before any output is made.
// This is a release interlock, not a security boundary against an account administrator.
export function assertBuildAllowed(env = process.env) {
  if (env.WORKERS_CI && env.OTJANG_ALLOW_PUBLIC_DEPLOY !== 'owner-approved') {
    throw new Error('PUBLIC_DEPLOY_BLOCKED: 상품 사진 권리 미확인. 공개·미리보기 배포는 별도 대표 승인 전까지 중단합니다. 로컬/GitHub 검사는 허용합니다.');
  }
}
