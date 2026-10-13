// 로컬 비공개 베타: 빈 앱 + Java + 별도 PostgreSQL. 비밀값을 stdout/인자로 출력하지 않는다.
// start/status/stop/prepare. stop은 데이터 볼륨·설정·사진을 삭제하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const project = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const server = path.join(project, 'server'), app = path.join(project, 'app');
const runtime = path.resolve(process.env.OTJANG_BETA_RUNTIME_DIR || path.join(server, 'data/beta-runtime'));
const configFile = path.join(runtime, 'runtime.json'), pidFile = path.join(runtime, 'process.json');
const action = process.argv[2] || 'status';
const executable = (env, candidates) => process.env[env] || candidates.find((value) => fs.existsSync(value));
const docker = executable('OTJANG_DOCKER_BIN', ['/Applications/Docker.app/Contents/Resources/bin/docker', '/usr/local/bin/docker', '/usr/bin/docker']);
const maven = executable('OTJANG_MAVEN_BIN', ['/private/tmp/otjang-build-tools/apache-maven-3.9.11/bin/mvn', '/opt/homebrew/bin/mvn', '/usr/local/bin/mvn']);
const javaHome = process.env.OTJANG_JAVA_HOME || process.env.JAVA_HOME || path.join(homedir(), 'Library/Java/JavaVirtualMachines/openjdk-21.0.1/Contents/Home');
const mavenRepo = process.env.OTJANG_MAVEN_REPO || (fs.existsSync('/private/tmp/otjang-beta-m2-20261013') ? '/private/tmp/otjang-beta-m2-20261013' : '');
const port = (input, fallback) => { const n = Number(input || fallback); if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('포트는 1024~65535의 정수여야 합니다.'); return n; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(binary, args, options = {}) {
  if (!binary) throw new Error('필요한 실행 파일이 없습니다. 도구 경로 환경 변수를 확인하세요.');
  const result = spawnSync(binary, args, { cwd: project, encoding: 'utf8', timeout: 120000, ...options });
  if (result.error || result.status !== 0) throw new Error('로컬 실행 명령이 실패했습니다. 실행 파일·Docker 상태·로그를 확인하세요.');
  return result.stdout.trim();
}
function protectedWrite(file, value) { fs.writeFileSync(file, value, { mode: 0o600 }); fs.chmodSync(file, 0o600); }
function config(create = false) {
  if (!fs.existsSync(configFile)) {
    if (!create) return null;
    fs.mkdirSync(runtime, { recursive: true, mode: 0o700 }); fs.chmodSync(runtime, 0o700);
    const id = crypto.randomUUID(), short = id.replaceAll('-', '').slice(0, 12);
    const value = { version: 1, projectDir: project, projectId: id, createdAt: new Date().toISOString(),
      appPort: port(process.env.OTJANG_BETA_APP_PORT, 18085), dbPort: port(process.env.OTJANG_BETA_DB_PORT, 5844),
      dbName: 'otjang_beta', dbUser: 'otjang_beta', dbPassword: crypto.randomBytes(32).toString('hex'),
      inviteCode: crypto.randomBytes(24).toString('base64url'), container: 'otjang-beta-' + short, volume: 'otjang-beta-pg-' + short,
      photoDir: path.join(runtime, 'photos'), image: 'postgres:16.15' };
    fs.writeFileSync(configFile, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const value = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (value.version !== 1 || value.projectDir !== project || !/^[0-9a-f-]{36}$/.test(value.projectId) || !/^otjang-beta-[0-9a-f]{12}$/.test(value.container) || !/^otjang-beta-pg-[0-9a-f]{12}$/.test(value.volume)) {
    throw new Error('설정이 다른 프로젝트에 속하거나 형식이 맞지 않습니다. 기존 자료를 지우거나 덮어쓰지 않았습니다.');
  }
  port(value.appPort); port(value.dbPort);
  if (!/^[a-f0-9]{64}$/.test(value.dbPassword) || !/^[A-Za-z0-9_-]{32}$/.test(value.inviteCode)) throw new Error('로컬 비밀값 설정을 읽지 못했습니다.');
  fs.chmodSync(configFile, 0o600);
  return value;
}
function dockerInspect(kind, name, format) {
  if (!docker) return null;
  const result = spawnSync(docker, [kind, 'inspect', '--format', format, name], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}
function verifyOwnership(value, kind, name) {
  const actual = dockerInspect(kind, name, kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}');
  if (actual === null) return false;
  const labels = JSON.parse(actual || '{}');
  if (!labels || labels['com.otjang.beta.project'] !== value.projectId) throw new Error('같은 이름의 Docker 자료가 다른 작업에 속합니다. 자동 삭제하지 않았습니다.');
  return true;
}
function processStart(pid) {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 1000 });
  return result.status === 0 ? result.stdout.trim() : '';
}
function running(value) {
  if (!fs.existsSync(pidFile)) return null;
  const saved = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  return saved.projectId === value.projectId && Number.isInteger(saved.pid) && saved.startTime && processStart(saved.pid) === saved.startTime ? saved : null;
}
async function prepare(value) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 이상이 필요합니다.');
  const empty = JSON.parse(fs.readFileSync(path.join(app, 'data/empty.json'), 'utf8'));
  if (!Array.isArray(empty.items) || empty.items.length || (empty.decisions || []).length) throw new Error('빈 옷장 자료가 아닙니다. 개인 자료를 서버 앱으로 만들지 않았습니다.');
  run(process.execPath, ['build.mjs'], { cwd: app, env: { ...process.env, WARDROBE: 'data/empty.json', OUT: 'dist/otjang-beta.html' } });
  const staticDir = path.join(server, 'src/main/resources/static'); fs.mkdirSync(staticDir, { recursive: true });
  fs.copyFileSync(path.join(app, 'dist/otjang-beta.html'), path.join(staticDir, 'index.html'));
  fs.mkdirSync(value.photoDir, { recursive: true, mode: 0o700 });
  console.log('빈 베타 앱을 준비했습니다. 실제 사용자 옷·구매 기록을 넣지 않았습니다.');
  console.log('초대 코드가 있는 로컬 설정: ' + configFile);
}
async function start(value) {
  if (running(value)) { console.log('기존 Java 프로세스의 준비 상태를 확인합니다.'); await waitForHealth(value); return; }
  if (!docker || !maven || !fs.existsSync(path.join(javaHome, 'bin/java'))) throw new Error('Java 21·Maven·Docker 실행 경로가 필요합니다. OTJANG_JAVA_HOME / OTJANG_MAVEN_BIN / OTJANG_DOCKER_BIN을 확인하세요.');
  run(docker, ['info', '--format', '{{.ServerVersion}}']);
  await prepare(value);
  const label = 'com.otjang.beta.project=' + value.projectId;
  if (!verifyOwnership(value, 'volume', value.volume)) run(docker, ['volume', 'create', '--label', label, value.volume]);
  if (!verifyOwnership(value, 'container', value.container)) {
    protectedWrite(path.join(runtime, 'postgres.env'), 'POSTGRES_DB=' + value.dbName + '\nPOSTGRES_USER=' + value.dbUser + '\nPOSTGRES_PASSWORD=' + value.dbPassword + '\n');
    run(docker, ['run', '--detach', '--name', value.container, '--label', label, '--env-file', path.join(runtime, 'postgres.env'),
      '--publish', '127.0.0.1:' + value.dbPort + ':5432', '--mount', 'type=volume,source=' + value.volume + ',target=/var/lib/postgresql/data', value.image]);
  } else run(docker, ['start', value.container]);
  let dbReady = false;
  for (let n = 0; n < 60; n++) {
    const response = spawnSync(docker, ['exec', value.container, 'pg_isready', '-U', value.dbUser, '-d', value.dbName], { encoding: 'utf8', timeout: 2000 });
    if (response.status === 0) { dbReady = true; break; } await delay(500);
  }
  if (!dbReady) throw new Error('PostgreSQL이 준비되지 않았습니다. 데이터는 삭제하지 않았습니다.');
  const logFile = path.join(runtime, 'server.log'), log = fs.openSync(logFile, 'a', 0o600); fs.chmodSync(logFile, 0o600);
  const mavenArgs = ['-B', '-ntp', 'spring-boot:run', '-Dspring-boot.run.arguments=--server.address=127.0.0.1'];
  if (mavenRepo) mavenArgs.unshift('-Dmaven.repo.local=' + mavenRepo);
  const child = spawn(maven, mavenArgs, {
    cwd: server, detached: true, stdio: ['ignore', log, log], env: { ...process.env, JAVA_HOME: javaHome,
      PATH: path.join(javaHome, 'bin') + ':' + process.env.PATH,
      OTJANG_DB_URL: 'jdbc:postgresql://127.0.0.1:' + value.dbPort + '/' + value.dbName,
      OTJANG_DB_USER: value.dbUser, OTJANG_DB_PASSWORD: value.dbPassword, OTJANG_PORT: String(value.appPort),
      OTJANG_PHOTO_DIR: value.photoDir, OTJANG_INVITE_CODE: value.inviteCode, OTJANG_REQUIRE_HTTPS: 'false',
      OTJANG_CORS_ORIGINS: 'null,http://127.0.0.1:' + value.appPort + ',http://localhost:' + value.appPort } });
  fs.closeSync(log); child.unref();
  let launchError = false; child.once('error', () => { launchError = true; });
  await delay(300);
  const startTime = processStart(child.pid);
  if (launchError || !startTime) throw new Error('Java 서버를 시작하지 못했습니다. 로컬 로그를 확인하세요.');
  protectedWrite(pidFile, JSON.stringify({ projectId: value.projectId, pid: child.pid, startTime, startedAt: new Date().toISOString() }, null, 2) + '\n');
  await waitForHealth(value);
}
async function waitForHealth(value) {
  const base = 'http://127.0.0.1:' + value.appPort;
  const logFile = path.join(runtime, 'server.log'), started = Date.now();
  const timeout = Number(process.env.OTJANG_BETA_START_TIMEOUT_MS || 600000);
  if (!Number.isFinite(timeout) || timeout < 60000 || timeout > 600000) throw new Error('기동 대기 시간은 60~600초여야 합니다.');
  for (let n = 0; Date.now() - started < timeout; n++) {
    if (!running(value)) throw new Error('Java 서버가 종료되었습니다. 로컬 로그를 확인하세요: ' + logFile);
    try { const response = await fetch(base + '/actuator/health', { signal: AbortSignal.timeout(1500) }); if (response.ok && (await response.json()).status === 'UP') {
      console.log('로컬 비공개 베타: ' + base); console.log('초대 코드가 있는 로컬 설정: ' + configFile); console.log('종료: node release-tools/local-beta.mjs stop (데이터 보존)'); return;
    } } catch { /* 기동 중 */ }
    if (n && n % 30 === 0) console.log('Java 서버 기동을 기다리는 중입니다. 로컬 로그: ' + logFile);
    await delay(500);
  }
  throw new Error('Java 서버의 준비 상태를 확인하지 못했습니다. 로컬 로그를 확인하세요: ' + logFile);
}
async function stop(value) {
  const saved = running(value);
  if (saved) {
    process.kill(-saved.pid, 'SIGTERM'); console.log('이 프로젝트의 Java 서버에 종료를 요청했습니다.');
    for (let n = 0; n < 100 && running(value); n++) await delay(100);
    if (running(value)) throw new Error('Java 서버가 아직 종료 중입니다. 잠시 뒤 stop을 다시 실행하세요. 데이터는 보존했습니다.');
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  }
  if (verifyOwnership(value, 'container', value.container)) run(docker, ['stop', value.container]);
  console.log('옷장 DB 볼륨·사진·로컬 설정을 보존했습니다.');
}
try {
  if (!['prepare', 'start', 'status', 'stop'].includes(action)) throw new Error('사용법: node release-tools/local-beta.mjs prepare|start|status|stop');
  const value = config(action === 'prepare' || action === 'start');
  if (!value) { console.log('아직 로컬 베타 설정이 없습니다. start 또는 prepare로 준비하세요.'); }
  else if (action === 'prepare') await prepare(value);
  else if (action === 'start') await start(value);
  else if (action === 'stop') await stop(value);
  else {
    console.log('로컬 설정: ' + configFile);
    console.log('Java 서버: ' + (running(value) ? '실행 중' : '이 런처가 확인한 실행 없음'));
    const state = dockerInspect('container', value.container, '{{json .State}}');
    console.log('이 프로젝트 PostgreSQL: ' + (state ? (JSON.parse(state).Running ? '실행 중' : '정지') : '미확인'));
    console.log('앱 주소: http://127.0.0.1:' + value.appPort);
  }
} catch (error) { console.error(error instanceof SyntaxError ? '로컬 설정 파일의 형식을 확인해 주세요. 내용과 비밀값은 출력하지 않았습니다.' : error.message); process.exitCode = 1; }
