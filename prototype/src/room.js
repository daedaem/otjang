import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Blender authors the room and every garment. This module only presents that
// scene and binds the user's recorded items to compatible garment locations.
const DEFAULT_SLOTS = Object.freeze({
  slot_01: { category: 'top', kinds: ['shirt'], color: 'white' },
  slot_02: { category: 'top', kinds: ['shirt'], color: 'blue' },
  slot_03: { category: 'outer', kinds: ['blazer', 'jacket'], color: 'brown' },
  slot_04: { category: 'outer', kinds: ['fieldjacket', 'chore', 'jacket'], color: 'olive' },
  slot_05: { category: 'bottom', kinds: ['chino', 'trouser', 'slacks'], color: 'beige' },
  slot_06: { category: 'bottom', kinds: ['denim', 'jeans'], color: 'navy' },
  slot_07: { category: 'top', kinds: ['knit', 'sweater'], color: 'navy' },
  slot_08: { category: 'top', kinds: ['tshirt', 'tee'], color: 'white' },
  slot_09: { category: 'shoes', kinds: ['loafer'], color: 'brown' },
  slot_10: { category: 'shoes', kinds: ['sneaker'], color: 'white' },
});

const COLORS = Object.freeze({
  navy: '#253449', blue: '#92aec4', white: '#f3f1e9', cream: '#e6ddc9',
  ivory: '#e6ddc9', beige: '#bba481', brown: '#73503a', olive: '#697258',
  green: '#64816c', gray: '#92918c', black: '#282a2e', indigo: '#415871',
  red: '#ac5147', pink: '#d0a1ac', yellow: '#d7bc70', orange: '#c48b60',
  purple: '#9a85aa', burgundy: '#77464e', unknown: '#afa99d', other: '#afa99d',
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownString = (value, key) => isRecord(value) && Object.hasOwn(value, key)
  && typeof value[key] === 'string' ? value[key] : '';

function canonicalKind(value) {
  if (typeof value !== 'string') return '';
  const kind = value.trim().toLowerCase().replace(/[ _-]/g, '');
  const aliases = {
    tee: 'tshirt', tshirts: 'tshirt', shirts: 'shirt', sweater: 'knit', sweaters: 'knit',
    jeans: 'denim', trousers: 'trouser', pants: 'trouser', slacks: 'trouser',
    chinos: 'chino', sneakers: 'sneaker', loafers: 'loafer', chore: 'fieldjacket',
  };
  if (Object.hasOwn(aliases, kind)) return aliases[kind];
  return ['shirt', 'tshirt', 'knit', 'denim', 'trouser', 'chino', 'sneaker', 'loafer',
    'blazer', 'jacket', 'fieldjacket'].includes(kind) ? kind : '';
}

function itemKind(item) {
  const explicit = ownString(item, 'kind');
  if (explicit) return canonicalKind(explicit);
  const name = ownString(item, 'name').toLowerCase();
  if (/로퍼|loafer/.test(name)) return 'loafer';
  if (/스니커|운동화|sneaker/.test(name)) return 'sneaker';
  if (/데님|청바지|denim|jeans/.test(name)) return 'denim';
  if (/치노|chino/.test(name)) return 'chino';
  if (/슬랙스|trouser|slacks/.test(name)) return 'trouser';
  if (/필드|초어|field|chore/.test(name)) return 'fieldjacket';
  if (/블레이저|blazer/.test(name)) return 'blazer';
  if (/재킷|자켓|jacket/.test(name)) return 'jacket';
  if (/니트|스웨터|knit|sweater/.test(name)) return 'knit';
  if (/티셔츠|tshirt|t-shirt|tee/.test(name)) return 'tshirt';
  if (/셔츠|shirt/.test(name)) return 'shirt';
  return '';
}

function slotKeyFor(object) {
  const declared = ownString(object.userData, 'slot') || ownString(object.userData, 'slotKey');
  const value = declared || object.name;
  const match = typeof value === 'string' ? value.match(/^slot[_-]?(\d+)(?:\b|_)/i) : null;
  return match ? `slot_${match[1].padStart(2, '0')}` : '';
}

function metadataFor(object, key) {
  const base = Object.hasOwn(DEFAULT_SLOTS, key) ? DEFAULT_SLOTS[key] : {};
  const data = object.userData || {};
  const declared = data.supportedKinds || data.kinds || data.kind;
  const list = Array.isArray(declared) ? declared
    : typeof declared === 'string' ? declared.split(/[,|]/) : base.kinds || [];
  const declaredColor = ownString(data, 'color') || ownString(data, 'defaultColor');
  return {
    category: ownString(data, 'category') || base.category || 'unknown',
    kinds: [...new Set(list.map(canonicalKind).filter(Boolean))],
    color: Object.hasOwn(COLORS, declaredColor) ? declaredColor : base.color || '',
    expectedItemId: ownString(data, 'itemId') || ownString(data, 'expectedItemId'),
  };
}

function disposeTree(object, additionalMaterials = []) {
  if (!object) return;
  const geometries = new Set();
  const materials = new Set(additionalMaterials);
  const textures = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material])
      .forEach(material => materials.add(material));
    if (node.isLight && node.shadow) node.shadow.dispose();
  });
  materials.forEach(material => Object.values(material).forEach(value => {
    if (value?.isTexture) textures.add(value);
  }));
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

/**
 * Load a locally bundled Blender room into an existing canvas.
 * Keep the photographic fallback visible until onReady, and restore it onError.
 * Calls made before loading (including setItems([])) are applied when ready.
 */
export function createRoom({ canvas, modelURL, onSelect, onReady, onError } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRoom requires a canvas element.');
  }

  let disposed = false;
  let failed = false;
  let ready = false;
  let readyNotified = false;
  let frame = 0;
  let renderer;
  let controls;
  let environmentTarget;
  let model;
  let size = { width: 0, height: 0 };
  let items = [];
  let slots = [];
  let unmatchedItems = [];
  let transition = null;
  let selectedKey = '';
  let hoverKey = '';
  let pointerDown = null;
  let dragging = false;
  let inViewport = true;
  let currentView = 'room';
  let viewBeforeLoad = 'room';
  let pendingFocus = '';
  const garmentMotions = new Map();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e5dfd4');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);
  camera.position.set(0, 1.6, 6.4);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const originalMaterials = new Set();
  const observerCleanups = [];

  const controller = {
    dispose,
    setView,
    focusItem,
    setItems,
    reset: () => setView('room'),
    getScreenPosition,
    get isReady() { return ready && readyNotified && !disposed && !failed; },
    get isDisposed() { return disposed; },
    get view() { return currentView; },
    get slots() {
      return slots.map(slot => ({ slotKey: slot.key, itemId: slot.item?.id || null,
        item: slot.item, category: slot.category, supportedKinds: [...slot.kinds],
        visible: Boolean(slot.item && slot.object.visible) }));
    },
    get unplacedItems() { return [...unmatchedItems]; },
  };

  function fail(error, code = 'ROOM_LOAD_FAILED') {
    if (disposed || failed) return;
    failed = true;
    ready = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (controls) controls.enabled = false;
    const reported = error instanceof Error ? error : new Error('옷장방을 불러오지 못했습니다.');
    reported.code ||= code;
    if (typeof onError === 'function') onError(reported);
  }

  function requestRender() {
    if (!disposed && !failed && !frame && !document.hidden && inViewport) {
      frame = requestAnimationFrame(render);
    }
  }

  function render(time) {
    frame = 0;
    if (disposed || failed || !renderer || document.hidden || !inViewport) return;
    if (!size.width || !size.height) return;
    if (garmentMotions.size) {
      renderer.shadowMap.needsUpdate = true;
      for (const [key, motion] of garmentMotions) {
        const progress = Math.min(1, (time - motion.start) / motion.duration);
        const smooth = 1 - Math.pow(1 - progress, 3);
        motion.slot.object.position.lerpVectors(motion.from, motion.to, smooth);
        motion.slot.object.updateMatrixWorld(true);
        motion.slot.bounds.setFromObject(motion.slot.object);
        if (progress >= 1) garmentMotions.delete(key);
      }
    }
    if (transition) {
      const progress = Math.min(1, (time - transition.start) / transition.duration);
      const smooth = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(transition.fromPosition, transition.position, smooth);
      controls.target.lerpVectors(transition.fromTarget, transition.target, smooth);
      if (progress >= 1) transition = null;
    }
    const changed = controls.update();
    try {
      renderer.render(scene, camera);
    } catch (error) {
      fail(error, 'ROOM_RENDER_FAILED');
      return;
    }
    // A parsed GLB is not yet a displayed room. Reveal the canvas only after
    // its first successful model render, including on slower software GPUs.
    if (ready && !readyNotified) {
      readyNotified = true;
      if (typeof onReady === 'function') onReady(controller);
    }
    if (transition || garmentMotions.size || changed) requestRender();
  }

  function animateGarments(activeKey = '', instant = false) {
    for (const slot of slots) {
      const target = slot.key === activeKey && slot.item ? slot.pullPosition : slot.basePosition;
      if (instant || reducedMotion?.matches) {
        garmentMotions.delete(slot.key);
        slot.object.position.copy(target);
        slot.object.updateMatrixWorld(true);
        slot.bounds.setFromObject(slot.object);
      } else if (slot.object.position.distanceToSquared(target) > 0.000001) {
        garmentMotions.set(slot.key, { slot, from: slot.object.position.clone(), to: target.clone(),
          start: performance.now(), duration: 620 });
      } else garmentMotions.delete(slot.key);
    }
    if (renderer) renderer.shadowMap.needsUpdate = true;
    requestRender();
  }

  function resize() {
    if (disposed || failed || !renderer) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (width < 1 || height < 1) return;
    if (size.width === width && size.height === height) return;
    size = { width, height };
    camera.aspect = width / height;
    camera.fov = width < 560 ? 46 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (currentView === 'room' && ready && !transition) setView('room', true);
    requestRender();
  }

  function moveCamera(position, target, instant = false) {
    if (!controls || disposed || failed) return;
    transition = null;
    // Clear any remaining orbit inertia before moving to a defined view.
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    if (instant || reducedMotion?.matches) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
    } else {
      transition = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(),
        position, target, start: performance.now(), duration: 520 };
    }
    requestRender();
  }

  function setView(name = 'room', instant = false) {
    if (disposed || failed) return false;
    if (!['room', 'front', 'left', 'center', 'right'].includes(name)) return false;
    const view = name === 'front' ? 'room' : name;
    viewBeforeLoad = view;
    currentView = view;
    pendingFocus = '';
    selectedKey = '';
    animateGarments('', instant);
    updateHighlight();
    if (!controls) return true;
    controls.minDistance = 3.3;
    controls.maxDistance = 9.8;
    const framingDistance = THREE.MathUtils.clamp(
      5.3 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), 6.4, 9.6,
    );
    const x = view === 'left' ? -1.5 : view === 'right' ? 1.5 : 0;
    const distance = view === 'room' ? framingDistance : 4.15;
    moveCamera(new THREE.Vector3(x, 1.6, distance), new THREE.Vector3(x, 1.45, -0.1), instant);
    return true;
  }

  function focusItem(key) {
    if (disposed || failed || typeof key !== 'string') return false;
    if (!ready) { pendingFocus = key; return true; }
    const slot = slots.find(entry => entry.key === key || entry.item?.id === key);
    if (!slot?.item || !slot.object.visible) return false;
    const center = slot.restBounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.55));
    const extent = slot.restBounds.getSize(new THREE.Vector3());
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const portrait = size.width < 700 && camera.aspect < 1.1;
    const distance = portrait
      ? Math.max(1.8, extent.y / (2 * halfFov * 0.42), extent.x / (2 * halfFov * camera.aspect * 0.68))
      : Math.max(1.4, extent.y / (2 * halfFov) * 1.2, extent.x / (2 * halfFov * camera.aspect) * 1.2);
    const lookTarget = center.clone();
    // The portrait inspector occupies the bottom of the stage. Frame the
    // complete garment above it instead of enlarging it behind the sheet.
    if (portrait) lookTarget.y -= distance * halfFov * 0.22;
    selectedKey = slot.key;
    animateGarments(slot.key);
    currentView = 'detail';
    controls.minDistance = 0.95;
    controls.maxDistance = 9.8;
    updateHighlight();
    moveCamera(new THREE.Vector3(center.x, center.y + 0.06, center.z + distance), lookTarget);
    return true;
  }

  function getScreenPosition(key) {
    if (!ready || disposed || failed) return null;
    const slot = slots.find(entry => entry.key === key || entry.item?.id === key);
    if (!slot) return null;
    camera.updateMatrixWorld();
    const position = slot.bounds.getCenter(new THREE.Vector3()).project(camera);
    const normalizedX = (position.x + 1) / 2;
    const normalizedY = (1 - position.y) / 2;
    return { x: normalizedX * size.width, y: normalizedY * size.height,
      normalizedX, normalizedY, visible: Boolean(slot.item && slot.object.visible
        && position.z > -1 && position.z < 1 && Math.abs(position.x) <= 1 && Math.abs(position.y) <= 1) };
  }

  function setItems(nextItems = []) {
    if (disposed || failed) return [];
    const seen = new Set();
    items = (Array.isArray(nextItems) ? nextItems : []).filter(item => {
      const id = ownString(item, 'id');
      if (!id || seen.has(id) || item.available === false) return false;
      seen.add(id);
      return true;
    });
    if (model) bindItems();
    return controller.slots;
  }

  function bindItems() {
    const assignedItems = new Set();
    const assignedSlots = new Set();
    const candidates = [];
    for (const slot of slots) {
      slot.item = null;
      slot.object.visible = false;
      slot.materials.forEach(entry => entry.material.color.copy(entry.baseColor));
      for (const item of items) {
        const kind = itemKind(item);
        if (!kind || !slot.kinds.includes(kind)) continue;
        const explicitSlot = ownString(item, 'slotKey') || ownString(item, 'slot');
        let score = 100 + (slot.kinds[0] === kind ? 20 : 0);
        if (explicitSlot === slot.key) score += 200;
        if (slot.expectedItemId === item.id) score += 150;
        if (slot.color === ownString(item, 'color')) score += 10;
        candidates.push({ slot, item, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const { slot, item } of candidates) {
      if (assignedSlots.has(slot.key) || assignedItems.has(item.id)) continue;
      assignedSlots.add(slot.key);
      assignedItems.add(item.id);
      slot.item = item;
      slot.object.visible = true;
      const color = ownString(item, 'color');
      if (Object.hasOwn(COLORS, color) && color !== 'unknown' && color !== 'other') {
        slot.materials.forEach(entry => entry.material.color.set(COLORS[color]));
      }
    }
    unmatchedItems = items.filter(item => !assignedItems.has(item.id));
    if (!assignedSlots.has(selectedKey)) selectedKey = '';
    if (!assignedSlots.has(hoverKey)) hoverKey = '';
    animateGarments(selectedKey);
    updateHighlight();
    requestRender();
  }

  function updateHighlight() {
    for (const slot of slots) slot.materials.forEach(entry => {
      if (!entry.material.emissive) return;
      entry.material.emissive.copy(entry.baseEmissive);
      entry.material.emissiveIntensity = entry.baseEmissiveIntensity;
      if (slot.key === hoverKey || slot.key === selectedKey) {
        entry.material.emissive.set('#b7a074');
        entry.material.emissiveIntensity = slot.key === hoverKey ? 0.065 : 0.035;
      }
    });
    requestRender();
  }

  function hitSlot(event) {
    if (!ready || !model || disposed || failed) return null;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Scene geometry can occlude a garment; do not select through cabinet walls.
    const intersections = raycaster.intersectObject(model, true);
    for (const intersection of intersections) {
      let node = intersection.object;
      let slot = null;
      let visible = true;
      while (node) {
        if (!node.visible) visible = false;
        if (!slot) slot = slots.find(entry => entry.object === node) || null;
        node = node.parent;
      }
      if (!visible) continue;
      return slot?.item ? slot : null;
    }
    return null;
  }

  function pointerStart(event) {
    if (event.button !== 0 || !ready) return;
    if (pointerDown || event.isPrimary === false) {
      pointerDown = null;
      dragging = true;
      return;
    }
    pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    dragging = false;
    transition = null;
  }

  function pointerMove(event) {
    if (pointerDown && event.pointerId === pointerDown.id
      && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) dragging = true;
    if (pointerDown || event.pointerType === 'touch') return;
    const next = hitSlot(event)?.key || '';
    if (hoverKey !== next) {
      hoverKey = next;
      canvas.style.cursor = next ? 'pointer' : 'grab';
      updateHighlight();
    }
  }

  function pointerEnd(event) {
    if (!pointerDown || pointerDown.id !== event.pointerId) return;
    const wasClick = !dragging && performance.now() - pointerDown.time < 700
      && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 6;
    pointerDown = null;
    dragging = false;
    if (!wasClick) return;
    const slot = hitSlot(event);
    if (slot) {
      focusItem(slot.key);
      if (typeof onSelect === 'function') {
        onSelect(slot.item.id, { slotKey: slot.key, item: slot.item, object: slot.object });
      }
    }
  }

  function pointerCancel() { pointerDown = null; dragging = false; }
  function pointerLeave() {
    hoverKey = '';
    canvas.style.cursor = 'grab';
    updateHighlight();
  }
  function visibilityChange() {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else requestRender();
  }
  function contextLost(event) {
    event.preventDefault();
    fail(new Error('3D 그래픽 연결이 끊겼습니다. 옷장방 이미지로 돌아갑니다.'), 'ROOM_WEBGL_CONTEXT_LOST');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    readyNotified = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    transition = null;
    garmentMotions.clear();
    controls?.dispose();
    observerCleanups.forEach(cleanup => cleanup());
    canvas.removeEventListener('pointerdown', pointerStart);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerleave', pointerLeave);
    canvas.removeEventListener('pointercancel', pointerCancel);
    window.removeEventListener('pointerup', pointerEnd);
    document.removeEventListener('visibilitychange', visibilityChange);
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.style.cursor = '';
    disposeTree(scene, originalMaterials);
    environmentTarget?.dispose();
    renderer?.dispose();
    scene.clear();
    scene.environment = null;
    originalMaterials.clear();
    environmentTarget = null;
    renderer = null;
    controls = null;
    slots = [];
    items = [];
    unmatchedItems = [];
    model = null;
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false });
    const gl = renderer.getContext();
    const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info');
    const softwareGPU = debugRenderer
      && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, softwareGPU ? 1 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    const environment = new RoomEnvironment(renderer);
    const pmrem = new THREE.PMREMGenerator(renderer);
    environmentTarget = pmrem.fromScene(environment, 0.04);
    scene.environment = environmentTarget.texture;
    environment.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight('#e5edf5', '#ad9375', 0.65));
    const key = new THREE.DirectionalLight('#fff0d9', 3.0);
    key.position.set(-3.8, 5.2, 4.0);
    key.target.position.set(0, 1.2, -0.25);
    key.castShadow = true;
    key.shadow.mapSize.set(softwareGPU ? 1024 : 2048, softwareGPU ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 16 });
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#eaf0f5', 0.8);
    fill.position.set(3.2, 2.8, 3.5);
    scene.add(fill);

    controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 1.45, -0.1);
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion?.matches;
    controls.dampingFactor = 0.085;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.7;
    controls.minAzimuthAngle = THREE.MathUtils.degToRad(-25);
    controls.maxAzimuthAngle = THREE.MathUtils.degToRad(25);
    controls.minPolarAngle = THREE.MathUtils.degToRad(74);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(101);
    controls.minDistance = 3.3;
    controls.maxDistance = 9.8;
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => { transition = null; });
    controls.update();
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', pointerStart);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerleave', pointerLeave);
    canvas.addEventListener('pointercancel', pointerCancel);
    canvas.addEventListener('webglcontextlost', contextLost);
    window.addEventListener('pointerup', pointerEnd);
    document.addEventListener('visibilitychange', visibilityChange);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      observerCleanups.push(() => observer.disconnect());
    } else {
      window.addEventListener('resize', resize);
      observerCleanups.push(() => window.removeEventListener('resize', resize));
    }
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => {
        inViewport = entries[0]?.isIntersecting !== false;
        if (inViewport) requestRender();
        else { if (frame) cancelAnimationFrame(frame); frame = 0; }
      });
      observer.observe(canvas);
      observerCleanups.push(() => observer.disconnect());
    }
    if (reducedMotion?.addEventListener) {
      const updateMotion = () => { controls.enableDamping = !reducedMotion.matches; requestRender(); };
      reducedMotion.addEventListener('change', updateMotion);
      observerCleanups.push(() => reducedMotion.removeEventListener('change', updateMotion));
    }
    resize();
    if (typeof modelURL !== 'string' || !modelURL) throw new Error('옷장방 모델 주소가 없습니다.');
    new GLTFLoader().load(modelURL, gltf => {
      if (disposed || failed) { disposeTree(gltf.scene); return; }
      try {
        model = gltf.scene;
        scene.add(model);
        // Use one calibrated lighting rig rather than doubling Blender lights.
        model.traverse(object => {
          if (object.isLight) object.visible = false;
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => { if ('envMapIntensity' in material) material.envMapIntensity = 0.45; });
          }
        });
        model.updateMatrixWorld(true);
        const roots = [];
        model.traverse(object => {
          const key = slotKeyFor(object);
          if (!key || roots.some(entry => entry.key === key)) return;
          let ancestor = object.parent;
          while (ancestor && ancestor !== model) {
            if (slotKeyFor(ancestor)) return;
            ancestor = ancestor.parent;
          }
          roots.push({ key, object });
        });
        slots = roots.sort((a, b) => a.key.localeCompare(b.key)).map(({ key, object }) => {
          const metadata = metadataFor(object, key);
          const materials = [];
          object.traverse(mesh => {
            if (!mesh.isMesh) return;
            const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const copies = original.map(material => {
              originalMaterials.add(material);
              const copy = material.clone();
              const materialName = `${material.name} ${mesh.name}`.toLowerCase();
              const fixedColor = /button|hanger|wood|metal|sole|lace|zip|buckle|hardware/.test(materialName)
                || mesh.userData?.recolor === false || material.userData?.recolor === false;
              const cloth = mesh.userData?.recolor === true || material.userData?.recolor === true
                || /cloth|fabric|garment|denim|leather|shirt|knit|trouser|jacket|sweater|chino|tee|upper/.test(materialName);
              if (copy.color && cloth && !fixedColor) {
                // The exported weave is an albedo image, not a tangent-space
                // normal map. Keep it as subtle fabric relief so changing a
                // blue shirt to white actually changes the displayed color.
                if (copy.map && /cloth|fabric/.test(materialName)) {
                  copy.bumpMap = copy.map;
                  copy.bumpScale = 0.0008;
                  copy.map = null;
                  copy.normalMap = null;
                  copy.roughness = Math.max(copy.roughness || 0, 0.9);
                }
                materials.push({ material: copy, baseColor: copy.color.clone(),
                  baseEmissive: copy.emissive?.clone() || new THREE.Color(0),
                  baseEmissiveIntensity: copy.emissiveIntensity ?? 1 });
              }
              return copy;
            });
            mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
          });
          const bounds = new THREE.Box3().setFromObject(object);
          const pullWorld = object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 0.55));
          const pullPosition = object.parent ? object.parent.worldToLocal(pullWorld) : pullWorld;
          return { key, object, ...metadata, materials, item: null, bounds,
            restBounds: bounds.clone(), basePosition: object.position.clone(), pullPosition };
        });
        if (!slots.length) throw new Error('옷장방에 옷을 연결할 위치가 없습니다.');
        bindItems();
        ready = true;
        const requestedFocus = pendingFocus;
        setView(viewBeforeLoad, true);
        if (requestedFocus) focusItem(requestedFocus);
        requestRender();
      } catch (error) { fail(error); }
    }, undefined, error => fail(error));
  } catch (error) {
    // Report on the next microtask so callers can first retain the controller.
    queueMicrotask(() => fail(error, 'ROOM_WEBGL_UNAVAILABLE'));
  }

  return controller;
}
