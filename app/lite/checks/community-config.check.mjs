// 코디 공유 배포 설정 점검. 대표 10-28 15:02 "커뮤니티는 계속 열어 줘요" → 본인 전용(private)으로 켠다.
// 누구나 가입하는 public은 키·전용 DB·운영자 정보를 대표가 넣은 뒤 따로 정한다. 설정 파일로 public을 켜지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

test('배포 설정은 코디 공유를 본인 전용(private)으로 켜고 public은 켜지 않는다', () => {
  assert.equal(config.vars.COMMUNITY_MODE, 'private');
  assert.notEqual(config.vars.PRIVATE_AUTH_MODE, undefined);
  for (const key of ['COMMUNITY_OPERATOR', 'COMMUNITY_CONTACT', 'MEMBER_SESSION_SECRET', 'KAKAO_REST_KEY', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY'])
    assert.equal(Object.hasOwn(config.vars, key), false, `${key}는 저장소에 넣지 않는다`);
});

test('배포 설정은 일반 계정 로그인(accounts)을 쓰고 초대 회원 한도·전용 DB를 유지한다(대표 10-29)', () => {
  assert.equal(config.vars.MEMBER_APP_MODE, 'accounts');
  assert.equal(config.vars.MEMBER_AI_DAILY, '10');
  const community=config.d1_databases.find(x=>x.binding==='COMMUNITY_DB');
  assert.ok(community?.database_id);
  for(const binding of ['RANK_DB','CROWD_DB']) assert.notEqual(community.database_id,config.d1_databases.find(x=>x.binding===binding)?.database_id);
});
