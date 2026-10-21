import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertBuildAllowed } from '../deployment-policy.mjs';
test('local/GitHub checks are allowed; all Workers branch builds require explicit release authorization', () => {
  assert.doesNotThrow(() => assertBuildAllowed({}));
  assert.doesNotThrow(() => assertBuildAllowed({ CI: 'true', GITHUB_ACTIONS: 'true' }));
  for (const WORKERS_CI of ['1', 'true']) {
    for (const OTJANG_ALLOW_PUBLIC_DEPLOY of [undefined, '', 'false', 'true']) assert.throws(() => assertBuildAllowed({ WORKERS_CI, OTJANG_ALLOW_PUBLIC_DEPLOY }), /PUBLIC_DEPLOY_BLOCKED/);
    assert.doesNotThrow(() => assertBuildAllowed({ WORKERS_CI, OTJANG_ALLOW_PUBLIC_DEPLOY: 'owner-approved' }));
  }
});
test('real build entry exits before asset build in Workers CI', () => {
  const result = spawnSync(process.execPath, [new URL('../build.mjs', import.meta.url).pathname], {
    env: { ...process.env, WORKERS_CI: '1', OTJANG_ALLOW_PUBLIC_DEPLOY: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PUBLIC_DEPLOY_BLOCKED/);
  assert.doesNotMatch(result.stdout, /dist/);
});
