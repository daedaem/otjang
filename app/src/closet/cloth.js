// 흔들림용 물리 천 — 축구 게임 유니폼과 같은 방식.
// 보이는 옷(고해상도)은 그대로 두고, 2.5cm 간격의 거친 천(점 약 2천 개)만 실시간으로 계산한다(위치 기반 역학, PBD).
// 보이는 옷의 각 점은 가장 가까운 거친 천 삼각형에 붙어 따라 움직인다.
// 가만히 있을 때는 반듯한(다림질한) 모양으로 돌아와 멈추고, 계산도 멈춘다.
import * as THREE from 'three';


export class Cloth {
  constructor(proxy, opts = {}) {
    const n = (this.n = proxy.n);
    this.rest = Float32Array.from(proxy.x);                 // 옷 기준 좌표 (옷걸이 원점, y 위, z 앞)
    this.tri = Uint32Array.from(proxy.tri);
    this.pin = new Uint8Array(n); for (const i of proxy.pin) this.pin[i] = 1;
    this.x = new Float32Array(n * 3); this.xp = new Float32Array(n * 3); this.tgt = new Float32Array(n * 3);
    this.local = Float32Array.from(this.rest);
    this.o = Object.assign({ iters: 8, damping: 0.975, stretch: 1.0, bend: 0.25, home: 0.02, homeTop: 0.08, sub: 2, vmax: 0.04, jump: 0.04 }, opts);
    // 당김 약속: 삼각형 변(늘어남) + 마주 보는 꼭짓점 쌍(굽힘)
    const edges = new Map(), opp = new Map(), key = (a, b) => (a < b ? a * n + b : b * n + a);
    const T = this.tri;
    for (let t = 0; t < T.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = T[t + k], b = T[t + ((k + 1) % 3)], c = T[t + ((k + 2) % 3)], kk = key(a, b);
        edges.set(kk, [a, b]);
        if (opp.has(kk)) opp.get(kk).push(c); else opp.set(kk, [c]);
      }
    }
    const E = [], Bd = [];
    for (const [kk, [a, b]] of edges) { E.push(a, b); const o = opp.get(kk); if (o.length === 2) Bd.push(o[0], o[1]); }
    const len = (arr) => { const L = new Float32Array(arr.length / 2); for (let i = 0; i < L.length; i++) L[i] = this.dist(this.rest, arr[2 * i], arr[2 * i + 1]); return L; };
    this.E = Uint32Array.from(E); this.EL = len(E); this.B = Uint32Array.from(Bd); this.BL = len(Bd);
    // 옷걸이에서 멀수록(아래로 갈수록) 제자리로 돌아오는 힘을 약하게: 밑단과 소매 끝이 더 흔들린다
    let ymax = -1e9, ymin = 1e9; for (let i = 0; i < n; i++) { const y = this.rest[3 * i + 1]; ymax = Math.max(ymax, y); ymin = Math.min(ymin, y); }
    this.home = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = (ymax - this.rest[3 * i + 1]) / (ymax - ymin); this.home[i] = this.o.homeTop + (this.o.home - this.o.homeTop) * Math.min(1, t * 1.4); }
    this.asleep = true; this.quiet = 0; this.started = false; this.m = new THREE.Matrix4(); this.mi = new THREE.Matrix4(); this.rel = new THREE.Matrix4(); this.Mp = null;
  }
  dist(P, a, b) { const dx = P[3 * a] - P[3 * b], dy = P[3 * a + 1] - P[3 * b + 1], dz = P[3 * a + 2] - P[3 * b + 2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  targets(M) {
    const e = M.elements, R = this.rest, T = this.tgt;
    for (let i = 0; i < this.n; i++) {
      const x = R[3 * i], y = R[3 * i + 1], z = R[3 * i + 2];
      T[3 * i] = e[0] * x + e[4] * y + e[8] * z + e[12]; T[3 * i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; T[3 * i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  wake(M) {
    if (!this.started || this.asleep) { this.targets(M); this.x.set(this.tgt); this.xp.set(this.tgt); this.started = true; this.Mp = null; }   // 잠들어 있던 천은 반듯한 모양에서 다시 시작
    this.asleep = false; this.quiet = 0;
  }
  poke(M, dir, amount = 1.2) {                              // 툭 치기: 아래쪽일수록 세게 밀어 준다
    this.wake(M); const dt = 1 / 120;
    for (let i = 0; i < this.n; i++) { if (this.pin[i]) continue; const w = (1 - this.home[i] / this.o.homeTop) * amount * dt; for (let k = 0; k < 3; k++) this.xp[3 * i + k] -= dir[k] * w; }
  }
  step(M, dt) {                                              // M: 옷 기준 → 세계 좌표
    if (!this.started) { this.targets(M); this.x.set(this.tgt); this.xp.set(this.tgt); this.started = true; }
    const S = this.o.sub, h = Math.min(dt, 1 / 30) / S, X = this.x, P = this.xp, T = this.tgt, pin = this.pin, n = this.n;
    this.targets(M);
    // 한 번에 크게 움직이면(느린 기기, 화면 전환) 천을 옷과 함께 통째로 옮긴다: 순간이동을 물리로 풀면 천이 터진다
    if (this.Mp) {
      let jump = 0; for (let i = 0; i < n; i += 97) { const j = 3 * i; jump = Math.max(jump, Math.abs(T[j] - this.Tp[j]) + Math.abs(T[j + 1] - this.Tp[j + 1]) + Math.abs(T[j + 2] - this.Tp[j + 2])); }
      if (jump > this.o.jump) {
        this.rel.copy(M).multiply(this.mi.copy(this.Mp).invert()); const r = this.rel.elements;
        for (const A of [X, P]) for (let i = 0; i < n; i++) {
          const j = 3 * i, x = A[j], y = A[j + 1], z = A[j + 2];
          A[j] = r[0] * x + r[4] * y + r[8] * z + r[12]; A[j + 1] = r[1] * x + r[5] * y + r[9] * z + r[13]; A[j + 2] = r[2] * x + r[6] * y + r[10] * z + r[14];
        }
      }
    }
    (this.Mp || (this.Mp = new THREE.Matrix4())).copy(M); (this.Tp || (this.Tp = new Float32Array(n * 3))).set(T);
    // 쉬는 모양은 이미 중력 아래에서 만들어졌다. 옷이 기울면(옷걸이가 흔들리면) 그 차이만큼만 중력을 준다
    const e = M.elements, gx = 9.8 * e[4] * h * h, gy = (-9.8 + 9.8 * e[5]) * h * h, gz = 9.8 * e[6] * h * h;
    let maxDev = 0, maxVel = 0;
    for (let s = 0; s < S; s++) {
      for (let i = 0; i < n; i++) {
        const j = 3 * i;
        if (pin[i]) { P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2]; X[j] = T[j]; X[j + 1] = T[j + 1]; X[j + 2] = T[j + 2]; continue; }
        const d = this.o.damping, vm = this.o.vmax;
        let vx = (X[j] - P[j]) * d, vy = (X[j + 1] - P[j + 1]) * d, vz = (X[j + 2] - P[j + 2]) * d;
        const sp = Math.abs(vx) + Math.abs(vy) + Math.abs(vz); if (sp > vm) { const f = vm / sp; vx *= f; vy *= f; vz *= f; }
        P[j] = X[j]; P[j + 1] = X[j + 1]; P[j + 2] = X[j + 2];
        X[j] += vx + gx; X[j + 1] += vy + gy; X[j + 2] += vz + gz;
      }
      for (let it = 0; it < this.o.iters; it++) {
        this.solve(this.E, this.EL, this.o.stretch);
        if (it % 2 === 0) this.solve(this.B, this.BL, this.o.bend);
      }
      for (let i = 0; i < n; i++) {                          // 제자리(반듯한 모양)로 돌아오는 힘
        if (pin[i]) continue; const j = 3 * i, k = this.home[i];
        X[j] += (T[j] - X[j]) * k; X[j + 1] += (T[j + 1] - X[j + 1]) * k; X[j + 2] += (T[j + 2] - X[j + 2]) * k;
      }
    }
    for (let i = 0; i < n; i++) {
      const j = 3 * i;
      maxDev = Math.max(maxDev, Math.abs(X[j] - T[j]) + Math.abs(X[j + 1] - T[j + 1]) + Math.abs(X[j + 2] - T[j + 2]));
      maxVel = Math.max(maxVel, Math.abs(X[j] - P[j]) + Math.abs(X[j + 1] - P[j + 1]) + Math.abs(X[j + 2] - P[j + 2]));
    }
    this.quiet = maxDev < 0.0012 && maxVel < 0.0002 ? this.quiet + 1 : 0;
    if (this.quiet > 20) this.asleep = true;
    // 옷 기준 좌표로 되돌린다 (보이는 옷은 옷 묶음 안에서 움직인다)
    this.mi.copy(M).invert(); const q = this.mi.elements, L = this.local;
    for (let i = 0; i < n; i++) {
      const x = X[3 * i], y = X[3 * i + 1], z = X[3 * i + 2];
      L[3 * i] = q[0] * x + q[4] * y + q[8] * z + q[12]; L[3 * i + 1] = q[1] * x + q[5] * y + q[9] * z + q[13]; L[3 * i + 2] = q[2] * x + q[6] * y + q[10] * z + q[14];
    }
    return this.asleep;
  }
  solve(C, L, k) {
    const X = this.x, pin = this.pin;
    for (let c = 0, m = L.length; c < m; c++) {
      const a = C[2 * c], b = C[2 * c + 1], ja = 3 * a, jb = 3 * b;
      const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1, ws = wa + wb; if (!ws) continue;
      const dx = X[jb] - X[ja], dy = X[jb + 1] - X[ja + 1], dz = X[jb + 2] - X[ja + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      const f = ((d - L[c]) / d) * k / ws;
      X[ja] += dx * f * wa; X[ja + 1] += dy * f * wa; X[ja + 2] += dz * f * wa;
      X[jb] -= dx * f * wb; X[jb + 1] -= dy * f * wb; X[jb + 2] -= dz * f * wb;
    }
  }
}

// 보이는 옷의 점을 거친 천 삼각형에 붙인다: 가장 가까운 삼각형 위의 점(무게중심 좌표) + 그 삼각형 기준 남는 거리
export class Skin {
  constructor(cloth, positions, bind) {
    this.c = cloth; this.orig = Float32Array.from(positions); this.out = positions; const n = positions.length / 3;
    if (bind) { this.t = bind.t; this.w = bind.w; this.r = bind.r; return; }                       // 같은 종류 옷은 붙이기 결과를 함께 쓴다 (불러오는 시간 절약)
    this.t = new Uint32Array(n); this.w = new Float32Array(n * 3); this.r = new Float32Array(n * 3);
    const R = cloth.rest, T = cloth.tri, nt = T.length / 3, cell = 0.05, grid = new Map();
    const ck = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let t = 0; t < nt; t++) {
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let k = 0; k < 3; k++) { const v = T[3 * t + k]; for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], R[3 * v + a]); mx[a] = Math.max(mx[a], R[3 * v + a]); } }
      for (let x = Math.floor(mn[0] / cell); x <= Math.floor(mx[0] / cell); x++) for (let y = Math.floor(mn[1] / cell); y <= Math.floor(mx[1] / cell); y++) for (let z = Math.floor(mn[2] / cell); z <= Math.floor(mx[2] / cell); z++) {
        const k = `${x},${y},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t);
      }
    }
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3(), tr = new THREE.Triangle(), bc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromArray(positions, 3 * i); let best = -1, bd = 1e9;
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), gz = Math.floor(p.z / cell);
      for (let r = 1; r <= 3 && best < 0; r++) {
        for (let x = gx - r; x <= gx + r; x++) for (let y = gy - r; y <= gy + r; y++) for (let z = gz - r; z <= gz + r; z++) {
          const list = grid.get(`${x},${y},${z}`); if (!list) continue;
          for (const t of list) {
            A.fromArray(R, 3 * T[3 * t]); Bv.fromArray(R, 3 * T[3 * t + 1]); C.fromArray(R, 3 * T[3 * t + 2]); tr.set(A, Bv, C); tr.closestPointToPoint(p, q);
            const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = t; }
          }
        }
      }
      if (best < 0) best = 0;
      A.fromArray(R, 3 * T[3 * best]); Bv.fromArray(R, 3 * T[3 * best + 1]); C.fromArray(R, 3 * T[3 * best + 2]); tr.set(A, Bv, C); tr.closestPointToPoint(p, q); tr.getBarycoord(q, bc);
      this.t[i] = best; this.w[3 * i] = bc.x; this.w[3 * i + 1] = bc.y; this.w[3 * i + 2] = bc.z;
      const [e1, e2, nn] = frame(A, Bv, C); const d = p.clone().sub(q);
      this.r[3 * i] = d.dot(e1); this.r[3 * i + 1] = d.dot(e2); this.r[3 * i + 2] = d.dot(nn);
    }
  }
  update(rest) {                                             // rest=true: 반듯한 원래 모양 그대로
    const out = this.out, n = out.length / 3;
    if (rest) { out.set(this.orig); return; }
    const L = this.c.local, T = this.c.tri, A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
    const cache = new Map();
    for (let i = 0; i < n; i++) {
      const t = this.t[i]; let f = cache.get(t);
      if (!f) { A.fromArray(L, 3 * T[3 * t]); Bv.fromArray(L, 3 * T[3 * t + 1]); C.fromArray(L, 3 * T[3 * t + 2]); f = [A.clone(), Bv.clone(), C.clone(), ...frame(A, Bv, C)]; cache.set(t, f); }
      const w0 = this.w[3 * i], w1 = this.w[3 * i + 1], w2 = this.w[3 * i + 2], r0 = this.r[3 * i], r1 = this.r[3 * i + 1], r2 = this.r[3 * i + 2];
      const [a, b, c, e1, e2, nn] = f;
      out[3 * i] = a.x * w0 + b.x * w1 + c.x * w2 + e1.x * r0 + e2.x * r1 + nn.x * r2;
      out[3 * i + 1] = a.y * w0 + b.y * w1 + c.y * w2 + e1.y * r0 + e2.y * r1 + nn.y * r2;
      out[3 * i + 2] = a.z * w0 + b.z * w1 + c.z * w2 + e1.z * r0 + e2.z * r1 + nn.z * r2;
    }
  }
}

function frame(a, b, c) {
  const e1 = b.clone().sub(a).normalize(), n = b.clone().sub(a).cross(c.clone().sub(a)).normalize(), e2 = n.clone().cross(e1);
  return [e1, e2, n];
}
