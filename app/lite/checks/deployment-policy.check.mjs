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
    env: { ...process.env, WORKERS_CI: '1', OTJANG_ALLOW_PUBLIC_DEPLOY: '', OTJANG_PRIVATE_DEPLOY: '' }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PUBLIC_DEPLOY_BLOCKED/);
  assert.doesNotMatch(result.stdout, /dist/);
});
test('private release requires explicit approval and a valid Access issuer/audience together', () => {
  const env = {
    WORKERS_CI: '1', OTJANG_PRIVATE_DEPLOY: 'owner-approved',
    ACCESS_TEAM_DOMAIN: 'wardrobe-owner.cloudflareaccess.com', ACCESS_AUD: 'private-app-audience',
  };
  assert.doesNotThrow(() => assertBuildAllowed(env));
  assert.doesNotThrow(() => assertBuildAllowed({ ...env, PRIVATE_AUTH_MODE: 'access' }));
  assert.doesNotThrow(() => assertBuildAllowed({ ...env, ACCESS_TEAM_DOMAIN: 'https://wardrobe-owner.cloudflareaccess.com/' }));
  for (const OTJANG_PRIVATE_DEPLOY of [undefined, '', 'true', 'owner-approve']) {
    assert.throws(() => assertBuildAllowed({ ...env, OTJANG_PRIVATE_DEPLOY }), /PUBLIC_DEPLOY_BLOCKED/);
  }
  for (const ACCESS_TEAM_DOMAIN of [undefined, '', 'example.com', 'https://user@wardrobe-owner.cloudflareaccess.com', 'wardrobe-owner.cloudflareaccess.com.evil.test', 'https://wardrobe-owner.cloudflareaccess.com/cdn-cgi/access', 'http://wardrobe-owner.cloudflareaccess.com', 'https://wardrobe-owner.cloudflareaccess.com:443']) {
    assert.throws(() => assertBuildAllowed({ ...env, ACCESS_TEAM_DOMAIN }), /PUBLIC_DEPLOY_BLOCKED/);
  }
  for (const ACCESS_AUD of [undefined, '', ' ', 'invalid audience', 'x'.repeat(513)]) {
    assert.throws(() => assertBuildAllowed({ ...env, ACCESS_AUD }), /PUBLIC_DEPLOY_BLOCKED/);
  }
});

test('explicit session private release does not require secrets in build variables', () => {
  const env = {
    WORKERS_CI: '1', OTJANG_PRIVATE_DEPLOY: 'owner-approved', PRIVATE_AUTH_MODE: 'session',
  };
  assert.doesNotThrow(() => assertBuildAllowed(env));
  for (const OTJANG_PRIVATE_DEPLOY of [undefined, '', 'true', 'owner-approve']) {
    assert.throws(() => assertBuildAllowed({ ...env, OTJANG_PRIVATE_DEPLOY }), /PUBLIC_DEPLOY_BLOCKED/);
  }
  for (const PRIVATE_AUTH_MODE of [undefined, '', 'Session', 'SESSION', 'session ', 'none', 'public', 'true']) {
    assert.throws(() => assertBuildAllowed({ ...env, PRIVATE_AUTH_MODE }), /PUBLIC_DEPLOY_BLOCKED/);
  }
  // A misspelled mode cannot be rescued by otherwise valid Access settings.
  assert.throws(() => assertBuildAllowed({ ...env, PRIVATE_AUTH_MODE: 'none',
    ACCESS_TEAM_DOMAIN: 'wardrobe-owner.cloudflareaccess.com', ACCESS_AUD: 'private-app-audience',
  }), /PUBLIC_DEPLOY_BLOCKED/);
});
