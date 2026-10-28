# 운영 점검·외부 설정 인계

2026-10-28. 대표의 나머지 전체 마감 지시에 따른 WO-10 후속이며 Codex 어울 개발이 담당한다. 계정 분리 #125의 CI15개·미해결0 확인 뒤 병합된 master754102f를 반영해 준비한다. 새 공개·유료 플랜·Secret 입력·외부 계정/권한은 추가하지 않는다.

## 무엇을 구현했나

본인 메뉴의 **운영 점검**(`/_private/readiness`)을 추가했다. 기존 본인 인증 뒤에만 실행하고 회원/비로그인은 먼저 거절한다. GET만 받고 응답 no-store·nonce CSP·외부 리소스 없음이다. 키/운영자/연락처 값·D1 개인 행·에러 원문을 주지 않는다. 메타데이터는 source commit의 형식만 검증해 표시한다.

- Claude·애드픽·라쿠텐·초대·카카오·Google·메일의 **설정 있음 / 설정 필요**. 실제 제공자 성공은 언제나 별도 미확인으로 표시한다. 현재 `claude-haiku-5-5`를 보여 준다. 이 페이지에서 유료 AI/메일/상품 API를 자동 호출하지 않는다.
- 버튼을 눌러 기존 D1에서 SELECT1 읽기만 검사한다. 같은 바인딩 객체는 한 번만 읽고 실패는 원문 없이 표시한다. 스키마/예산/회원 변경 없음.
- 폰의 설치 창·캐시·사진 DB API/파일 공유 지원·지속 보관 허용만 읽는다. 기능 유무는 복원 성공이 아니다. 실물 설치/업데이트/사진 포함 백업·복원을 사용자가 확인한 경우만 체크하며, 다운로드 파일에서 `owner_reported`로 남긴다. UA/개인 원문/사진은 받지 않는다.
- Google/Kakao 공식 로그인 버튼 원본을 추가했다([리소스·원본 해시](../../../app/lite/public/login/README.md)). 색·심볼·문구·비율을 변경하지 않고, 같은46px 높이/48px 누르기 영역으로 표시한다. 공식 영어 Google 버튼을 그대로 쓴다. 본인 공개 스위치·OAuth 조건은 유지한다.

## 실행·확인 경계

- 전체 Node449/449·skip0, TypeScript/Vite 빌드99파일 통과.
- 운영 점검/커뮤니티/역할 Chromium·WebKit36개(53.3초) 통과. 점검 페이지의 실제 CSP 아래 JS·DB 버튼·기기 기능·결과 다운로드 내용, 정상 로그인 링크와 실제 공식 이미지 로드를 확인했다. 외부 API는 mock만 사용했다.
- 기존 검사 삭제0. 신규 운영 점검 Node8개, 브라우저 각1개 추가. 기존 소셜 로그인 검사는 공식 버튼의 문구와 이미지 로드 대조로 강화했다.
- 실제 Cloudflare UI에서 #124 master `9b36da1`의 Worker `ff25cecc`가100% 활성이고 빌드48초 성공임을 확인했다. #121 첫 fetch 실패→동일 커밋 재빌드 성공·실제 생성 예시8장 로드와 구분한다. 현재 후속 PR의 배포는 이후 기록한다.
- 기존 Worker runtime에는 기존 공급자/본인 Secret5개와 예산100/300/5·회원10·invite·community private가 있었다. 값은 펼치거나 바꾸지 않았다. 관찰한 목록에는 카카오·Google·메일·회원 세션 Secret·별도 커뮤니티 DB/운영자 연락처가 없었다. 이는 외부 계정/앱이 아예 없다는 증거가 아니라 현재 Worker 설정에서 확인되지 않았다는 뜻이다.

## 실제 마감에서 사용자 단계가 필요한 것

| 항목 | 준비된 코드 | 사용자가 완료해야 하는 범위 |
|---|---|---|
| AI 실제3회 | 기존 추천/상담/동의형 사진 분석·한도 유지 | 기존 유료 금지 지침으로 실제 추천 버튼이 자동 승인 거절됨. 일반 질문2회+생성 셔츠1장 분석1회 최대3회 직접 승인 요청 대기. 개인 사진/옷장은 제외 |
| 초대 회원 실제 가입 | 기존 이메일/비밀번호·원장/한도 + 계정 분리 | 본인이 초대/시험 계정의 인증정보 최종 입력·제출. 실제 사용자 모집/임의 계정 생성 안 함 |
| 카카오/Google | 기존 OAuth 상태/쿠키 + 공식 버튼 | 소유자 개발자 앱/도메인·Redirect URI와 아래 Secret 직접 입력. 연결/심사 후 본인 테스트 |
| 이메일 | 기존 코드 발송·회수/시도 제한 | 인증된 발신 도메인/주소와 이메일 서비스. 발신 설정·새 요금 약정·실제 발송은 직접 확인 |
| 공개 커뮤니티 | 준비 조건 fail-closed + 점검 | 개인 앱과 다른 COMMUNITY_DB·운영자/지원 연락처·개인정보 처리 주체·공개 승인. 현재 private 유지 |
| 실물 폰 | 갱신 대기·지연 화면 오프라인·무손실 백업 + 점검 기록 | 실제 iPhone/Galaxy에서 설치·모든 탭 닫은 뒤 새 앱·Files/공유·사진 포함 백업·별도 시험 복원 |
| 상업용 상품/날씨 | 원본 출처·국내/해외 공식 API·권리 경계 유지 | 표시·DB 보관·외부 AI·사진 권한 확인, 아래 날씨 조건 해결. 기존937개를 공개용 권리 확보로 바꾸지 않음 |

### Secret 설정표 (값은 채팅/Git에 보내지 않음)

- 카카오: `MEMBER_SESSION_SECRET`(최초32자 이상, 기존 회원 id와 연결돼 이후 함부로 변경 금지), `KAKAO_REST_KEY`, 선택 `KAKAO_CLIENT_SECRET`(앱에서 켠 경우 필수). Redirect `<운영 origin>/_member/callback/kakao`.
- Google: 같은 회원 Secret, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Redirect `<운영 origin>/_member/callback/google`.
- 이메일: 같은 회원 Secret + `EMAIL_FROM` + `RESEND_API_KEY` 또는 `EMAIL` 바인딩의 send 지원. 기존 domain/서비스 여부를 확인하고 새 비용/약정은 별도 승인한다.
- 공개: `COMMUNITY_DB`는 기존 RANK/CROWD와 다른 DB, `COMMUNITY_OPERATOR`, `COMMUNITY_CONTACT`. 기술 준비 조건 충족이 공개 승인이나 약관 검토 완료가 아니다.

## 공급자 공식 조건 재확인

- [Google 로그인 공식 지침](https://developers.google.com/identity/branding-guidelines): 공식 완성형 자산을 사용하며 다른 공급자와 비슷한 높이/중요도로 표시한다. [Kakao 로그인 공식 디자인](https://developers.kakao.com/docs/ko/kakaologin/design-guide): 지정 색/말풍선/레이블을 유지한다. 이 반영은 OAuth 실제 성공을 뜻하지 않는다.
- [애드픽 API 안내](https://biz.adpick.co.kr/?ac=api&sub=guide): API 별도 이용료 없음과 데이터 저장·가공·재사용 권한은 다르다. 상품/이미지는 판매자 권리라 API 자체가 권한을 주지 않는다. 전 상품 DB/외부 AI 처리 허용을 추정하지 않는다.
- [Open-Meteo 약관](https://open-meteo.com/en/terms): 현재 무료 API는 비상업용이다. 개인 비공개 시험과 상업 출시를 구분한다.
- 무료 상업 날씨 대안의 후보로 [MET Norway FAQ](https://docs.api.met.no/doc/FAQ.html)·[조건](https://api.met.no/doc/TermsOfService)·[라이선스](https://docs.api.met.no/doc/License.html)를 확인했다. 출처/변경 고지·식별 가능한 서비스 연락처/User-Agent·캐시 조건 등이 필요하고 법적 조건 수락과 새 전송 대상이 생긴다. 검토 후보이며 연결/수락하지 않았다. 기상청도 사용자 키 발급이 필요하므로 자동으로 계정을 만들지 않는다.

남은 외부 단계는 코드 미구현과 구분한다. 사용자의 입력/약정/실물 시험을 자동검사로 꾸며 완료 처리하거나, 승인받지 않은 공개·유료 호출로 통과시키지 않는다.

## 리뷰 보완

#126의 독립 AI 코드 리뷰가 회원 DB 선택과 점검의 불일치를 지적했다. 기존 회원 처리기는 COMMUNITY_DB→CROWD_DB 순으로 쓰지만 점검은 CROWD_DB만 검사했다. COMMUNITY_DB만 있는 반례를 먼저 실행해7통과/1실패(false !== true)를 확인하고 실제 처리기와 같은 선택으로 수정했다. 관련8개와 전체 Node449개가 모두 통과했다. 기존 검사를 줄이지 않았다.
