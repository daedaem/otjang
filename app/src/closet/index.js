// 옷장 3D 화면 모듈: Blender에서 빛을 미리 구운 옷장·방에, 종류별 형태(셔츠·블레이저·필드 재킷·트러커 재킷)의 옷을 건다.
// 앱이 create()로 만들고 setItems()로 걸 옷을 준다. 옷을 누르면 옷걸이째 앞으로 꺼내 크게 보고(끌면 돌아감), 끌어서 놓으면 자리를 바꾼다.
// 옷의 빛은 한 벌씩 옷장 안(위 칸/아래 칸)에 걸어 놓고 구웠다. 자리를 바꾸면 그 칸의 빛과 그림자로 갈아 끼운다.
// 자료는 모두 파일 안에 바이트로 들어 있다(fetch, data:, blob: 주소를 쓰지 않음). 종류로 그린 모습이지 특정 상품의 재현이 아니다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from './decoder.js';
import { closet as AC, garments as AG, weaves as AW, meta as M } from './assets.gen.js';
import { Cloth, Skin } from './cloth.js';
import { makeFabric, familyColor } from './fabric.js';

export const KIND = {
  shirt: { type: '버튼다운 셔츠', parts: '버튼다운 깃 · 가슴 주머니 · 통 커프스', weave: 'oxford' },
  blazer: { type: '싱글 블레이저', parts: '노치 라펠 · 금장 단추 · 뚜껑 주머니', weave: 'hopsack' },
  field: { type: '필드 재킷', parts: '세운 깃 · 뚜껑 주머니 4개 · 견장', weave: 'twill' },
  trucker: { type: '트러커 재킷', parts: '뾰족 깃 · 가슴 뚜껑 주머니 · 앞 요크 · 허리 밴드', weave: 'twill' },
  cardigan: { type: 'V넥 카디건', parts: 'V 목둘레 · 앞여밈 단추 5개 · 리브 밑단·커프스 (케이블 무늬 없이)', weave: 'hopsack' },
  sweat: { type: '크루넥 스웻셔츠', parts: '리브 넥밴드 · 리브 밑단 · 리브 커프스 (그래픽 없이)', weave: 'twill' },
};
// 미리 만든 원단(Blender 쪽에서 실 한 올 단위로 그린 것). 이름, 칩 색, 광택 색
export const TILES = {
  'mine-stripe': { kind: 'shirt', name: '블루 스트라이프 옥스퍼드', sw: 'repeating-linear-gradient(90deg,#5277c6 0 3px,#eef1f8 3px 6px)', tone: '#b9c8ea' },
  'mine-tartan': { kind: 'shirt', name: '그린·네이비 타탄 (블랙워치 계열)', sw: 'linear-gradient(90deg,#365c4c 0 40%,#141918 40% 50%,#25324a 50%)', tone: '#2e4440' },
  'mine-field': { kind: 'field', name: '세이지 올리브 면 능직', sw: '#7c785e', tone: '#7c785e' },
  'mine-cord': { kind: 'trucker', name: '다크 브라운 코듀로이', sw: '#33211d', tone: '#33211d' },
  'blazer-navy': { kind: 'blazer', name: '네이비 울 홉색', sw: '#1c2741', tone: '#1c2741' },
  'cardigan-gray': { kind: 'cardigan', name: '미들 그레이 울 니트', sw: '#7d7f83', tone: '#7d7f83' },
  'sweat-gray': { kind: 'sweat', name: '헤더 그레이 기모 저지', sw: '#8b8d90', tone: '#8b8d90' },
};
export const SLOT_COUNT = M.closet.SLOTS.length;
export { familyColor };
export const available = () => !!(AC && AC.glb);

// 종류별 원단 느낌: 면 셔츠(잔잔한 광택), 면 능직(결이 또렷), 울 홉색(털 때문에 가장자리가 은은하게 밝다)
const LOOK = { shirt: { n: 0.9, sr: 0.5, sk: 0.3, spec: 0.2, thread: 0.22 }, field: { n: 1.0, sr: 0.55, sk: 0.35, spec: 0.15, thread: 0.28 }, blazer: { n: 0.7, sr: 0.75, sk: 0.7, spec: 0.12, thread: 0.08 }, trucker: { n: 1.2, sr: 0.55, sk: 0.9, spec: 0.1, thread: 0.18 }, sweat: { n: 0.6, sr: 0.7, sk: 0.6, spec: 0.06, thread: 0.12 }, cardigan: { n: 0.8, sr: 0.8, sk: 0.75, spec: 0.05, thread: 0.1 } };
const EXPO = 0.86, EXPO_G = 0.88;
const I = (k) => Math.PI * k * EXPO, IG = (k) => Math.PI * k * EXPO_G;
const CL = M.closet;

/**
 * opts: { canvas, host, onSelect(id), onDeselect(), onError(msg), onReady() }
 * 돌려주는 것: { ready, setItems(list), select(id), deselect(), poke(id), home(), resize(), setActive(on), dispose(), things }
 *   list: [{ id, kind, name, slot(0~5), fabric: { tile } | { color: '#rrggbb', pattern: 'solid'|'stripe'|'check', accent } }]
 */
export function create(opts) {
  const { canvas, host } = opts;
  const onError = opts.onError || (() => {}), onSelect = opts.onSelect || (() => {}), onDeselect = opts.onDeselect || (() => {});
  let disposed = false, active = true;
  let last = performance.now(), dirty = 3, frameNo = 0, raf = 0;                                   // 그리기 상태 (invalidate가 일찍 불리므로 먼저 둔다)
  const fail = (msg) => { onError(msg); };
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (e) { fail('이 브라우저(또는 미리보기 창)에서는 3D를 그릴 수 없습니다. Chrome이나 Safari에서 열어 보세요.'); return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;                                   // 구운 빛을 그대로 쓴다 (Blender의 Standard와 같은 색)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd9d1c4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;    // 금속(봉, 단추)의 반사용
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);

  // ───────── 그림 (바이트 → 텍스처) ─────────
  const bitmaps = [];
  function texture(bytes, { flipY = false, color = true, channel = 0, repeat = null } = {}) {
    const t = new THREE.Texture(); t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.channel = channel; t.anisotropy = 8;
    if (channel === 1) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }        // 라이트맵: 작은 조각 가장자리에 검은 바탕이 번지지 않게 밉맵을 쓰지 않는다
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / repeat[0], 1 / repeat[1]); }
    createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { imageOrientation: flipY ? 'flipY' : 'none', colorSpaceConversion: 'none' })
      .then((img) => { if (disposed) return; t.image = img; t.needsUpdate = true; bitmaps.push(t); invalidate(3); })
      .catch((e) => fail('그림을 읽지 못했습니다: ' + e.message));
    return t;
  }
  const lm = { closet: texture(AC.light.closet, { channel: 1 }), floor: texture(AC.light.floor, { channel: 1 }), wall: texture(AC.light.wall, { channel: 1 }) };
  const tile = { oak: texture(AC.tiles.oak, { repeat: M.tiles.oak }), floor: texture(AC.tiles.floor, { repeat: M.tiles.floor }), wall: texture(AC.tiles.wall, { repeat: M.tiles.wall }) };
  const roomMat = {
    oak: new THREE.MeshBasicMaterial({ map: tile.oak, lightMap: lm.closet, lightMapIntensity: I(M.light.closet) }),
    floor: new THREE.MeshBasicMaterial({ map: tile.floor, lightMap: lm.floor, lightMapIntensity: I(M.light.floor) }),
    wall: new THREE.MeshBasicMaterial({ map: tile.wall, lightMap: lm.wall, lightMapIntensity: I(M.light.wall) }),
    skirt: new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.82, 0.8, 0.76), lightMap: lm.wall, lightMapIntensity: I(M.light.wall) }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd4d6d9, metalness: 0.55, roughness: 0.3, envMapIntensity: 0.7, lightMap: lm.closet, lightMapIntensity: I(M.light.closet) }),
    handle: new THREE.MeshStandardMaterial({ color: 0x1b1815, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.45 }),
    led: new THREE.MeshBasicMaterial({ color: 0xfff1dc }),
  };
  const HW = {
    pearl: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.3, envMapIntensity: 0.55 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd2a95c, roughness: 0.3, metalness: 1, envMapIntensity: 0.8 }),
    snap: new THREE.MeshStandardMaterial({ color: 0x5a5444, roughness: 0.4, metalness: 0.85, envMapIntensity: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6e4422, roughness: 0.45, envMapIntensity: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8babd, roughness: 0.24, metalness: 1, envMapIntensity: 0.8 }),
  };
  const hwFor = (n) => { for (const k of Object.keys(HW)) if (n.startsWith(k)) return HW[k]; return HW.pearl; };
  const LM = {}, SH = {}, NM = {};
  for (const k of Object.keys(AG)) {
    LM[k] = { hi: texture(AG[k].light.hi, { channel: 1 }), lo: texture(AG[k].light.lo, { channel: 1 }) };
    SH[k] = { back: { hi: texture(AG[k].shadow.back.hi, { flipY: true, color: false }), lo: texture(AG[k].shadow.back.lo, { flipY: true, color: false }) },
              floor: { hi: texture(AG[k].shadow.floor.hi, { color: false }), lo: texture(AG[k].shadow.floor.lo, { color: false }) } };
  }
  const normalMap = (kind, tileId) => {                                                             // 노멀맵은 같은 결끼리 한 장을 나눠 쓴다
    const key = kind + ':' + tileId; if (NM[key]) return NM[key];
    const src = AG[kind] && AG[kind].normals && AG[kind].normals[tileId]; if (!src) return null;
    return (NM[key] = texture(src, { flipY: true, color: false, repeat: M.garments[kind].tiles[tileId] || [0.1024, 0.1024] }));
  };

  // ───────── 형태 읽기 ─────────
  const loader = new GLTFLoader(); if (MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);   // 형태 파일은 EXT_meshopt_compression으로 줄여 두었다 (tools/compress-glb.mjs). 해독기가 없는 빌드(NO_MESHOPT=1)는 압축하지 않은 파일을 쓴다
  const toFloat = (g, name) => {                                                                     // 압축이 8비트로 바꾼 법선 등을 float로 되돌린다 (흔들림 계산이 float 배열을 그대로 쓴다)
    const a = g.attributes[name]; if (!a || a.array instanceof Float32Array) return;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) { f[a.itemSize * i] = a.getX(i); if (a.itemSize > 1) f[a.itemSize * i + 1] = a.getY(i); if (a.itemSize > 2) f[a.itemSize * i + 2] = a.getZ(i); if (a.itemSize > 3) f[a.itemSize * i + 3] = a.getW(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  };
  const parse = (bytes) => new Promise((res, rej) => loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', (g) => { g.scene.traverse((o) => { if (o.isMesh) { toFloat(o.geometry, 'position'); toFloat(o.geometry, 'normal'); toFloat(o.geometry, 'uv'); toFloat(o.geometry, 'uv1'); } }); res(g); }, rej));
  const tpl = {}, things = {};
  const slotsArr = CL.SLOTS.map((s, i) => ({ i, x: s.x, rail: s.rail, thing: null }));
  const slotPos = (s) => new THREE.Vector3(s.x, CL.RAIL[s.rail] - CL.HOOK, CL.RAIL_Z);
  const decalGeo = {};
  for (const r of ['hi', 'lo']) {
    const d = CL.decal[r];
    const f = new THREE.PlaneGeometry(d.w, -d.zb); f.rotateX(-Math.PI / 2);
    decalGeo[r] = { back: new THREE.PlaneGeometry(d.w, d.y1 - d.y0), floor: f };
  }
  const decalMat = () => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false });
  let isReady = false, pending = null;
  const ready = Promise.all([parse(AC.glb), ...Object.keys(AG).map((k) => parse(AG[k].glb).then((g) => { tpl[k] = g.scene; }))]).then(([room]) => {
    if (disposed) return;
    room.scene.traverse((o) => { if (o.isMesh) { const n = (o.material && o.material.name) || ''; o.material = roomMat[n.split('.')[0]] || roomMat.oak; } });
    scene.add(room.scene);
    isReady = true; frame(); setView(HOME.az, HOME.el, homeDist); invalidate(4);
    if (pending) { const p = pending; pending = null; setItems(p); }
    if (opts.onReady) opts.onReady();
  }).catch((e) => fail('형태 파일을 읽지 못했습니다: ' + ((e && e.message) || e)));

  // ───────── 옷 만들기·지우기 ─────────
  const BIND = {};
  async function fabricFor(it) {
    const gm = M.garments[it.kind], f = it.fabric || {};
    if (f.tile && AG[it.kind].tiles[f.tile]) return { map: texture(AG[it.kind].tiles[f.tile], { flipY: true, repeat: gm.tiles[f.tile] }), nmap: normalMap(it.kind, f.tile), tone: (TILES[f.tile] && TILES[f.tile].tone) || '#9a9a9a', made: false };
    const wv = AW[KIND[it.kind].weave];                                                              // 브라우저에서 색을 입힌 원단(근사)
    const map = await makeFabric({ color: f.color || '#9a9a9a', pattern: f.pattern || 'solid', accent: f.accent }, { name: KIND[it.kind].weave, bytes: wv.albedo }, wv.repeat);
    return { map, nmap: normalMap(wv.normal[0], wv.normal[1]), tone: f.color || '#9a9a9a', made: true };
  }
  async function addThing(it) {
    const gm = M.garments[it.kind]; if (!gm || !tpl[it.kind]) return;
    const fab = await fabricFor(it); if (disposed || things[it.id] || !isReady) return;
    const L = LOOK[it.kind] || LOOK.shirt, base = new THREE.Color(fab.tone);
    const cloth = new THREE.MeshPhysicalMaterial({ map: fab.map, normalMap: fab.nmap || null, normalScale: new THREE.Vector2(L.n, L.n), roughness: 0.92, metalness: 0,
      sheen: 1, sheenRoughness: L.sr, sheenColor: base.clone().multiplyScalar(L.sk).addScalar(0.03), specularIntensity: L.spec,
      lightMap: LM[it.kind].hi, lightMapIntensity: IG(gm.light.hi), envMapIntensity: 0.3, vertexColors: true, side: gm.lining ? THREE.FrontSide : THREE.DoubleSide });
    backFloor(cloth);
    const lining = gm.lining ? new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.033, 0.06), side: THREE.BackSide }) : null;   // 안감: 옷 안쪽은 그늘이라 어두운 단색
    const root = new THREE.Group(), body = tpl[it.kind].clone(true); root.add(body);
    let hook = null, liningFront = null; const extra = [], lit = [], owned = [cloth];
    if (lining) owned.push(lining);
    body.traverse((o) => {
      if (o.name && o.name.startsWith('hook')) hook = o;
      if (!o.isMesh) return;
      const n = (o.material && o.material.name) || '';
      if (n.startsWith('cloth')) { o.material = cloth; if (lining) extra.push(o); }
      else if (n.startsWith('lining')) o.material = liningFront || (liningFront = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.033, 0.06) }));
      else if (o.geometry.attributes.uv1 && (n.startsWith('stitch') || n.startsWith('pearl') || n.startsWith('hole') || n.startsWith('horn'))) { o.material = detailMat(n, it, gm, fab.tone); lit.push(o.material); owned.push(o.material); }
      else o.material = hwFor(n);
    });
    if (liningFront) owned.push(liningFront);
    for (const o of extra) o.add(new THREE.Mesh(o.geometry, lining));
    root.traverse((o) => { o.userData.thing = it.id; });
    const box = new THREE.Box3().setFromObject(body);
    scene.add(root);
    const dBack = new THREE.Mesh(decalGeo.hi.back, decalMat()), dFloor = new THREE.Mesh(decalGeo.hi.floor, decalMat());
    scene.add(dBack, dFloor);
    const th = (things[it.id] = { id: it.id, it, root, body, hook, cloth, lining, dBack, dFloor, height: box.max.y - box.min.y, bottom: box.min.y, rail: null, slot: null, face: 0, made: fab.made,
      lit, owned, textures: [fab.map], base: { pos: new THREE.Vector3(), yaw: 0 }, swing: { a: 0, b: 0, va: 0, vb: 0, prev: null, vel: new THREE.Vector3() }, sim: null, skins: [], geos: [] });
    if (gm.proxy) {                                                                                  // 흔들림: 거친 물리 천 + 보이는 옷을 그 천에 붙이기
      th.sim = new Cloth(gm.proxy); body.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
      let mi = 0;
      body.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.parent.isMesh) return; const n = (o.material && o.material.name) || '';
        if (o === hook || n === 'wood' || n === 'steel' || (o.name || '').startsWith('hanger')) return;
        o.geometry = o.geometry.clone(); th.geos.push(o.geometry); for (const c of o.children) if (c.isMesh) c.geometry = o.geometry;   // 옷마다 자기 형태 (같은 종류끼리 함께 흔들리지 않게)
        const key = it.kind + ':' + mi++;
        const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), pos = o.geometry.attributes.position;
        const ident = rel.equals(new THREE.Matrix4());
        const P = new Float32Array(pos.array.length); P.set(pos.array);
        if (!ident) { const v = new THREE.Vector3(); for (let i = 0; i < pos.count; i++) { v.fromArray(P, 3 * i).applyMatrix4(rel); v.toArray(P, 3 * i); } }
        const sk = new Skin(th.sim, P, BIND[key]); BIND[key] = { t: sk.t, w: sk.w, r: sk.r }; th.skins.push({ o, pos, sk, rel, relInv: ident ? null : rel.clone().invert() }); o.frustumCulled = false;
      });
    }
    assign(th, slotsArr[Math.max(0, Math.min(SLOT_COUNT - 1, it.slot | 0))]); setPose(th, th.home.pos, th.home.rotY); setRail(th, th.slot.rail); placeDecals(th, th.slot, 0);
    invalidate(3);
  }
  function removeThing(id) {
    const th = things[id]; if (!th) return;
    if (selected === th) deselect(true);
    if (th.slot && th.slot.thing === th) th.slot.thing = null;
    scene.remove(th.root, th.dBack, th.dFloor);
    for (const g of th.geos) g.dispose();
    for (const m of th.owned) m.dispose();
    for (const t of th.textures) if (t && t.dispose) t.dispose();                                  // 원단 그림은 옷마다 하나씩. 노멀맵은 같은 결끼리 나눠 쓰므로 두지 않는다
    th.dBack.material.dispose(); th.dFloor.material.dispose();
    delete things[id]; invalidate(3);
  }
  const specKey = (it) => JSON.stringify([it.kind, it.fabric || null]);
  const queue = [];
  let adding = false;
  async function drain() { if (adding) return; adding = true; while (queue.length) { const it = queue.shift(); try { await addThing(it); } catch (e) { fail('옷을 그리지 못했습니다: ' + (e && e.message)); } } adding = false; }
  /** 걸 옷 목록을 통째로 준다. 없어진 옷은 내리고, 새 옷은 걸고, 자리가 바뀐 옷은 옮긴다. */
  function setItems(list) {
    if (!isReady) { pending = list; return; }
    const want = new Map(list.map((it) => [it.id, it]));
    for (const id of Object.keys(things)) { const it = want.get(id); if (!it || specKey(it) !== specKey(things[id].it)) removeThing(id); }
    for (const it of list) {
      const th = things[it.id];
      if (th) { th.it = it; const sl = slotsArr[Math.max(0, Math.min(SLOT_COUNT - 1, it.slot | 0))]; if (th.slot !== sl) { assign(th, sl); setPose(th, th.home.pos, th.home.rotY); setRail(th, sl.rail); placeDecals(th, sl, 0); } }
      else if (!queue.some((q) => q.id === it.id)) queue.push(it);
    }
    drain();
  }
  // 천은 두께 없이 한 장으로 그리기 때문에, 안쪽 면이 보이는 곳(겨드랑이 접힘 등)에 바깥 면의 그늘이 그대로 찍혀 검게 뚫려 보인다. 안쪽 면은 최소 밝기를 준다.
  function backFloor(m) {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps)   // 조명 조각을 펼쳐서 아래 바꾸기가 먹게 한다
        .replace('vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );',
        'vec4 lightMapTexel = texture2D( lightMap, vLightMapUv ); lightMapTexel.rgb = pow( lightMapTexel.rgb, vec3( CLOTH_GAMMA ) ) * CLOTH_GAIN; if ( !gl_FrontFacing ) lightMapTexel.rgb = max( lightMapTexel.rgb, vec3( 0.32, 0.3, 0.28 ) );')
        .replace('void main() {', '#define CLOTH_GAMMA ' + (m.isMeshPhysicalMaterial ? '1.18' : '1.0') + '\n#define CLOTH_GAIN ' + (m.isMeshPhysicalMaterial ? '1.07' : '1.0') + '\nvoid main() {')   // 주름 골의 그늘을 조금 더 깊게
        .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', '');                          // 확산광은 구운 빛(라이트맵)만: 주변 환경 빛은 광택에만 쓴다
    };
    m.customProgramCacheKey = () => 'backfloor-' + m.type;
  }
  // 박음질 실(점선), 단추, 단추 구멍: 옷의 구운 빛을 같이 받는다 (그늘진 곳의 단추가 혼자 밝게 뜨지 않게)
  let DASH = null;
  function dashTexture() {
    if (DASH) return DASH;
    const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 16); g.fillStyle = '#fff';
    const r = 5; g.beginPath(); g.moveTo(6 + r, 3); g.lineTo(54 - r, 3); g.arc(54 - r, 8, r, -Math.PI / 2, Math.PI / 2); g.lineTo(6 + r, 13); g.arc(6 + r, 8, r, Math.PI / 2, -Math.PI / 2); g.fill();   // 한 땀 2.3mm + 틈 0.7mm
    DASH = new THREE.CanvasTexture(c); DASH.wrapS = THREE.RepeatWrapping; DASH.repeat.set(1 / 0.003, 1); DASH.anisotropy = 8; return DASH;
  }
  function noAmbient(m) { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps).replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''); }; m.customProgramCacheKey = () => 'noamb-' + m.type; return m; }
  function detailMat(n, it, gm, tone) {
    const lmap = LM[it.kind].hi, li = IG(gm.light.hi), fab = new THREE.Color(tone);
    if (n.startsWith('stitch')) {
      const thread = fab.clone().lerp(new THREE.Color('#ffffff'), (LOOK[it.kind] || LOOK.shirt).thread);
      return new THREE.MeshBasicMaterial({ map: dashTexture(), color: thread, alphaTest: 0.4, side: THREE.DoubleSide, lightMap: lmap, lightMapIntensity: li, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    }
    if (n.startsWith('hole')) return new THREE.MeshBasicMaterial({ color: 0x1a1a1c, lightMap: lmap, lightMapIntensity: li });
    if (n.startsWith('horn')) return noAmbient(new THREE.MeshPhysicalMaterial({ color: 0x2b1f19, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, lightMap: lmap, lightMapIntensity: li, envMapIntensity: 0.6 }));   // 뿔·짙은 수지 단추
    const m = noAmbient(new THREE.MeshPhysicalMaterial({ color: it.kind === 'shirt' && fab.getHSL({}).l > 0.6 ? 0xfaf8f3 : 0xece8df, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 0.3, sheenColor: new THREE.Color(0.9, 0.88, 0.85),
      lightMap: lmap, lightMapIntensity: li * 1.05, envMapIntensity: 0.55 })); m.userData.k = 1.05; return m;   // 단추: 약간 투명한 조개·플라스틱 느낌의 윤기
  }
  function setPose(th, pos, yaw) { th.base.pos.copy(pos); th.base.yaw = yaw; applyPose(th); wakeSim(th); }
  const _v = new THREE.Vector3();
  function applyPose(th) {                                                                          // 옷걸이 고리(봉에 걸린 점)를 축으로 흔들린 자세
    const r = th.root; r.rotation.order = 'YXZ'; r.rotation.set(th.swing.b, th.base.yaw, th.swing.a);
    _v.set(0, -CL.HOOK, 0).applyEuler(r.rotation); r.position.copy(th.base.pos); r.position.y += CL.HOOK; r.position.add(_v);
    if (th.hook) th.hook.rotation.y = Math.PI / 2 - th.base.yaw;                                     // 고리는 늘 봉을 감싸는 방향
  }
  function wakeSim(th) { if (th.sim) { th.root.updateMatrixWorld(true); th.sim.wake(th.root.matrixWorld); } invalidate(); }
  // 옷걸이째 흔들림(진자): 고리를 봉에 건 점이 가속하면 옷이 뒤처졌다가 되돌아온다
  const PEND = { L: 0.34, c: 3.4, g: 9.8, max: 0.4, gain: 0.45 };
  function swingStep(th, dt) {
    const s = th.swing, pv = th.base.pos;
    if (!s.prev) { s.prev = pv.clone(); s.vel.set(0, 0, 0); return false; }
    const vx = (pv.x - s.prev.x) / dt, vy = (pv.y - s.prev.y) / dt, vz = (pv.z - s.prev.z) / dt;
    const ax = (vx - s.vel.x) / dt, az = (vz - s.vel.z) / dt; s.vel.set(vx, vy, vz); s.prev.copy(pv);
    const y = th.base.yaw, cy = Math.cos(y), sy = Math.sin(y);
    const gain = th.carry ? 0.12 : PEND.gain;
    const alat = gain * Math.max(-30, Math.min(30, ax * cy - az * sy)), afwd = gain * Math.max(-30, Math.min(30, ax * sy + az * cy));
    s.va += (-(PEND.g / PEND.L) * Math.sin(s.a) - PEND.c * s.va - (alat / PEND.L) * Math.cos(s.a)) * dt;
    s.vb += (-(PEND.g / PEND.L) * Math.sin(s.b) - PEND.c * s.vb + (afwd / PEND.L) * Math.cos(s.b)) * dt;
    s.a = Math.max(-PEND.max, Math.min(PEND.max, s.a + s.va * dt)); s.b = Math.max(-PEND.max, Math.min(PEND.max, s.b + s.vb * dt));
    const moving = Math.abs(s.a) + Math.abs(s.b) + Math.abs(s.va) * 0.2 + Math.abs(s.vb) * 0.2 > 0.0015 || Math.abs(vx) + Math.abs(vz) > 0.001;
    if (!moving && (s.a || s.b)) { s.a = s.b = s.va = s.vb = 0; }
    return moving;
  }
  function poke(th, k = 1) {                                                                        // 툭 치기: 옷걸이를 살짝 밀고 밑단을 앞뒤로 흔든다
    if (!th) return; th.swing.va += 1.6 * k; th.swing.vb -= 0.6 * k; wakeSim(th);
    if (th.sim) th.sim.poke(th.root.matrixWorld, [Math.cos(th.base.yaw) * 0.4, 0, -Math.sin(th.base.yaw) * 0.4 + 0.9], 1.4 * k);
  }
  function assign(th, slot) { if (th.slot && th.slot.thing === th) th.slot.thing = null; th.slot = slot; slot.thing = th; th.home = { pos: slotPos(slot), rotY: CL.HANG + (th.it.jit || 0) }; }
  function setRail(th, rail) {
    if (th.rail === rail) return; th.rail = rail; const gm = M.garments[th.it.kind];
    th.cloth.lightMap = LM[th.it.kind][rail]; th.cloth.lightMapIntensity = IG(gm.light[rail]);
    for (const m of th.lit) { m.lightMap = LM[th.it.kind][rail]; m.lightMapIntensity = IG(gm.light[rail]) * (m.userData.k || 1); }
  }
  function placeDecals(th, slot, fade) {
    const r = slot.rail, d = CL.decal[r], k = th.it.kind;
    th.dBack.geometry = decalGeo[r].back; th.dFloor.geometry = decalGeo[r].floor;
    th.dBack.material.map = SH[k].back[r]; th.dFloor.material.map = SH[k].floor[r];
    th.dBack.position.set(slot.x, (d.y0 + d.y1) / 2, d.zb + 0.0005); th.dFloor.position.set(slot.x, d.y0 + 0.0012, d.zb / 2);
    fadeDecals(th, fade);
  }
  function fadeDecals(th, f) { const s = 1 + 7 * f; th.dBack.material.color.setScalar(s); th.dFloor.material.color.setScalar(s); th.dBack.visible = th.dFloor.visible = f < 0.999; }

  // ───────── 카메라 ─────────
  const TARGET = new THREE.Vector3(0, 1.1, -0.25), HOME = { az: 0.16, el: 0.03 };
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET); controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.7;
  controls.minAzimuthAngle = -0.45; controls.maxAzimuthAngle = 0.6; controls.minPolarAngle = 1.3; controls.maxPolarAngle = 1.62;
  let homeDist = 5;
  const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  const tans = () => { const tv = Math.tan((camera.fov * Math.PI) / 360); return [tv * camera.aspect, tv]; };
  const viewPos = (az, el, dist, t = TARGET) => new THREE.Vector3(t.x + dist * Math.sin(az) * Math.cos(el), t.y + dist * Math.sin(el), t.z + dist * Math.cos(az) * Math.cos(el));
  function setView(az, el, dist, t = TARGET) { camera.position.copy(viewPos(az, el, dist, t)); controls.target.copy(t); camera.lookAt(t); controls.update(); }
  function frame() {
    const { w, h } = size(); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = camera.aspect < 0.8 ? 42 : 32; camera.updateProjectionMatrix();
    const [th, tv] = tans(), portrait = camera.aspect < 0.8;
    TARGET.y = portrait ? 1.0 : 1.08;
    homeDist = Math.max(1.12 / th, (portrait ? 1.45 : 1.34) / tv);
    controls.minDistance = homeDist * 0.4; controls.maxDistance = homeDist * 1.1; invalidate(2);
  }
  function resize() {
    frame(); const d = camera.position.distanceTo(controls.target);
    if (!selected) setView(Math.atan2(camera.position.x - TARGET.x, camera.position.z - TARGET.z), Math.asin(Math.max(-1, Math.min(1, (camera.position.y - TARGET.y) / Math.max(d, 1e-6)))), Math.min(Math.max(d, controls.minDistance), controls.maxDistance));
    if (selected) { const cu = closeUp(selected); selected.face = cu.rotY; setPose(selected, cu.pos, cu.rotY + turn); placeScrim(cu.dist); }
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!disposed) resize(); }) : null;
  if (ro) ro.observe(host);
  frame(); setView(HOME.az, HOME.el, homeDist);

  // ───────── 움직임 ─────────
  const tweens = [];
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tween(dur, step, done) { tweens.push({ t: 0, dur: reduce ? 1 : dur, step, done }); invalidate(); }
  function moveTo(th, pos, rotY, dur, done, fade0, fade1) {
    const p0 = th.base.pos.clone(), y0 = th.base.yaw; const p = new THREE.Vector3();
    th.carry = (th.carry || 0) + 1;                                                                    // 화면이 옮겨 주는 동안은 손으로 들 때보다 덜 흔들린다
    tween(dur, (k) => { p.lerpVectors(p0, pos, k); setPose(th, p, lerp(y0, rotY, k)); if (fade0 !== undefined) fadeDecals(th, lerp(fade0, fade1, k)); }, () => { th.carry--; if (done) done(); });
  }
  function flyCamera(pos, target, dur) {
    const p0 = camera.position.clone(), t0 = controls.target.clone(), t = new THREE.Vector3();
    tween(dur, (k) => { camera.position.lerpVectors(p0, pos, k); t.lerpVectors(t0, target, k); controls.target.copy(t); camera.lookAt(t); });
  }
  let selected = null, turn = 0;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  // 크게 볼 때 옷 뒤를 가리는 막 (옷장이 흐릿하게 비친다)
  const scrim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xe9e2d6, transparent: true, opacity: 0, depthWrite: false }));
  scrim.visible = false; scene.add(scrim);
  function closeUp(th) {
    // 옷걸이째 봉에서 꺼내 카메라 앞, 화면의 정해진 칸(넓은 화면: 설명 카드 왼쪽 / 좁은 화면: 가운데 위)에 꽉 차게 둔다
    const { w } = size(), wide = w > 700, box = wide ? { x0: 0.08, x1: 0.62, y0: 0.06, y1: 0.92 } : { x0: 0.06, x1: 0.94, y0: 0.06, y1: 0.78 };
    camera.getWorldDirection(fwd); right.crossVectors(fwd, camera.up).normalize(); up.crossVectors(right, fwd).normalize();
    const [tanH, tanV] = tans(), top = 0.15, hgt = top - th.bottom, wid = wide ? 0.72 : 0.84;
    const dist = Math.max(hgt / (2 * tanV * (box.y1 - box.y0)), wid / (2 * tanH * (box.x1 - box.x0)));
    const c = camera.position.clone().addScaledVector(fwd, dist).addScaledVector(right, (box.x0 + box.x1 - 1) * dist * tanH).addScaledVector(up, (1 - box.y0 - box.y1) * dist * tanV);
    const pos = c.clone().addScaledVector(up, hgt / 2 - top);                                // 옷 원점(어깨선) = 가운데 + (높이/2 − 고리 높이)
    return { pos, rotY: Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z) + 0.12, dist };
  }
  function placeScrim(dist) {
    const [tanH, tanV] = tans(), d = dist + 0.45; scrim.position.copy(camera.position).addScaledVector(fwd, d); scrim.quaternion.copy(camera.quaternion); scrim.scale.set(d * tanH * 2.4, d * tanV * 2.4, 1);
  }
  function select(id) {
    const th = things[id]; if (!th || selected === th) return; if (selected) deselect(true);
    selected = th; turn = 0; controls.enabled = false;
    const cu = closeUp(th); th.face = cu.rotY; moveTo(th, cu.pos, cu.rotY, 650, null, 0, 1);
    placeScrim(cu.dist); scrim.visible = true; const o0 = scrim.material.opacity; tween(450, (k) => { scrim.material.opacity = lerp(o0, 0.9, k); });
    onSelect(id);
  }
  function deselect(quick) {
    if (!selected) return; const th = selected; selected = null; controls.enabled = true;
    moveTo(th, th.home.pos, th.home.rotY, quick ? 380 : 560, null, 1, 0);
    const o0 = scrim.material.opacity; tween(380, (k) => { scrim.material.opacity = lerp(o0, 0, k); }, () => { if (!selected) scrim.visible = false; });
    onDeselect();
  }
  function home() { if (selected) deselect(true); flyCamera(viewPos(HOME.az, HOME.el, homeDist), TARGET.clone(), 520); }

  // ───────── 입력: 누르면 크게, 끌면 자리 바꾸기 ─────────
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null, drag = null;
  const DRAG_Z = 0.16, DROP = 0.42;
  const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 20), new THREE.MeshBasicMaterial({ color: 0x16233b, transparent: true, opacity: 0.55 }));
  spot.rotation.z = Math.PI / 2; spot.visible = false; scene.add(spot);
  function aim(ev) { const r = canvas.getBoundingClientRect(); ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); }
  function pick(ev) { aim(ev); const hits = ray.intersectObjects(Object.values(things).map((t) => t.root), true); return hits.length ? hits[0].object.userData.thing : null; }
  const onPlane = (z) => { const t = (z - ray.ray.origin.z) / ray.ray.direction.z; return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t); };
  const onDown = (ev) => {
    down = { x: ev.clientX, y: ev.clientY, lx: ev.clientX };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 무시 */ }
    if (selected) return;
    const id = pick(ev); if (id) { controls.enabled = false; drag = { th: things[id], started: false, target: null }; }
  };
  const onMove = (ev) => {
    if (selected) { if (down) { turn = clamp(turn + (ev.clientX - down.lx) * 0.01, -1.1, 1.1); down.lx = ev.clientX; setPose(selected, selected.base.pos, selected.face + turn); invalidate(); } return; }
    if (!drag) { if (ev.pointerType === 'mouse' && !down) canvas.style.cursor = pick(ev) ? 'pointer' : 'grab'; return; }
    if (!drag.started) { if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 7) return; drag.started = true; canvas.style.cursor = 'grabbing'; fadeDecals(drag.th, 1); }
    aim(ev); const th = drag.th, p = onPlane(DRAG_Z);
    let best = null, bd = 1e9;
    for (const sl of slotsArr) { const sp = slotPos(sl), d = Math.hypot(sp.x - p.x, (sp.y - DROP - p.y) * 0.8); if (d < bd) { bd = d; best = sl; } }
    drag.target = best; setPose(th, new THREE.Vector3(clamp(p.x, -0.9, 0.9), clamp(p.y + DROP, 0.95, 2.0), DRAG_Z), CL.HANG * 0.45);
    spot.position.set(best.x, CL.RAIL[best.rail], CL.RAIL_Z); spot.visible = true; invalidate();
  };
  function endDrag() {
    const d = drag; drag = null; if (!selected) controls.enabled = true; spot.visible = false; canvas.style.cursor = 'grab'; invalidate();
    if (!d || !d.started) return false;
    const th = d.th, to = d.target || th.slot, from = th.slot;
    if (to !== from) {
      const other = to.thing; assign(th, to);
      if (other && other !== th) { assign(other, from); fadeDecals(other, 1); moveTo(other, other.home.pos, other.home.rotY, 440, () => { setRail(other, from.rail); placeDecals(other, from, 1); tween(260, (k) => fadeDecals(other, 1 - k)); }); }
      if (opts.onMove) opts.onMove(Object.values(things).map((t) => ({ id: t.id, slot: t.slot.i })));
    }
    setRail(th, to.rail); placeDecals(th, to, 1);
    moveTo(th, th.home.pos, th.home.rotY, 340, () => tween(260, (k) => fadeDecals(th, 1 - k)));
    return true;
  }
  const onUp = (ev) => {
    if (!down) return; const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
    if (selected) { if (moved < 6 && pick(ev) !== selected.id) deselect(); return; }
    if (endDrag()) return; if (moved > 6) return;
    const id = pick(ev); if (id) select(id);
  };
  const onCancel = () => { down = null; endDrag(); };
  canvas.addEventListener('pointerdown', onDown, { capture: true }); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);

  // ───────── 그리기 (가만히 있을 때는 그리지 않는다) ─────────
  function invalidate(n = 2) { dirty = Math.max(dirty, n); if (active && !raf && !disposed) raf = requestAnimationFrame(loop); }
  controls.addEventListener('change', () => invalidate());
  function loop(now) {
    raf = 0; if (disposed || !active) return;
    raf = requestAnimationFrame(loop);                                                              // 켜져 있는 동안은 계속 돈다 (가만히 있으면 그리지만 않는다)
    now = now || performance.now();
    const dt = Math.min(250, now - last); last = now;
    if (tweens.length) invalidate();
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; tw.t = Math.min(1, tw.t + dt / tw.dur); tw.step(ease(tw.t)); if (tw.t >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); } }
    if (controls.enabled) controls.update();
    const ds = Math.min(dt, 50) / 1000; frameNo++;
    for (const th of Object.values(things)) {                                                       // 흔들림: 진자 + 물리 천
      const swinging = swingStep(th, Math.max(ds, 1 / 240));
      if (swinging) { applyPose(th); wakeSim(th); }
      if (th.sim && !th.sim.asleep) {
        th.root.updateMatrixWorld(true); const asleep = th.sim.step(th.root.matrixWorld, ds || 1 / 60);
        for (const s of th.skins) {
          s.sk.update(asleep && !swinging);
          const nrm = s.o.geometry.attributes.normal;
          if (nrm && s.o.material && s.o.material.normalMap) { if (!s.n0) s.n0 = Float32Array.from(nrm.array); s.dirtyN = true; }
          if (s.relInv) { const v = new THREE.Vector3(), A = s.sk.out; for (let i = 0; i < A.length / 3; i++) { v.fromArray(A, 3 * i).applyMatrix4(s.relInv); v.toArray(s.pos.array, 3 * i); } }
          else s.pos.array.set(s.sk.out);
          s.pos.needsUpdate = true;
          if (s.dirtyN && (asleep && !swinging || (frameNo & 1) === 0)) { if (asleep && !swinging) s.o.geometry.attributes.normal.array.set(s.n0); else s.o.geometry.computeVertexNormals(); s.o.geometry.attributes.normal.needsUpdate = true; s.dirtyN = false; }
        }
        invalidate();
      }
    }
    if (dirty > 0) { dirty--; renderer.render(scene, camera); }
  }
  invalidate(3);

  function setActive(on) { active = !!on; if (active) { last = performance.now(); invalidate(3); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function dispose() {
    disposed = true; active = false; if (raf) cancelAnimationFrame(raf);
    if (ro) ro.disconnect();
    canvas.removeEventListener('pointerdown', onDown, { capture: true }); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
    for (const id of Object.keys(things)) removeThing(id);
    controls.dispose(); pmrem.dispose(); renderer.dispose();
  }
  const api = { ready, setItems, select, deselect: () => deselect(false), poke: (id) => poke(id ? things[id] : selected || Object.values(things)[0]),
    pokeAll: () => { if (selected) return poke(selected); Object.values(things).forEach((th, i) => setTimeout(() => poke(th, 0.55 + 0.25 * Math.random()), i * 140)); },
    home, resize, setActive, dispose, things, get selected() { return selected ? selected.id : null; }, get busy() { return adding || queue.length > 0; },
    rest: () => { for (const th of Object.values(things)) { th.swing.a = th.swing.b = th.swing.va = th.swing.vb = 0; applyPose(th); if (th.sim) { th.sim.asleep = true; for (const s of th.skins) { s.sk.update(true); s.pos.array.set(s.sk.out); s.pos.needsUpdate = true; if (s.n0) { s.o.geometry.attributes.normal.array.set(s.n0); s.o.geometry.attributes.normal.needsUpdate = true; } } } } invalidate(3); } };
  return api;
}
