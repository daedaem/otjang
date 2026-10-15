import { photoAsset, MAX_GARMENT_PHOTO_BYTES } from './wardrobe-store.js';

// The saved photo is always a JPEG of at most 1024px on the long side. The
// original file stays only in the draft (memory) so the user can re-adjust a
// crop before saving; it is never written to storage.
const MAX_SAVED_EDGE = 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HEIF_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIF_NAME = /\.(heic|heif)$/i;
const OTHER_PHOTO_NAME = /\.(jpe?g|png|webp)$/i;

export const HEIC_HELP =
  '이 브라우저는 HEIC 사진을 열지 못했어요. 사진 앱 앨범에서 다시 골라 보세요(iPhone Safari는 이때 보통 JPG로 바꿔 넘겨요). ' +
  '계속 안 되면 iPhone 설정 > 카메라 > 포맷에서 ‘높은 호환성’으로 찍은 사진을 쓰거나, 다른 사진을 골라 주세요.';

function isHeif(file) {
  return HEIF_TYPES.includes(file.type) || (!file.type && HEIF_NAME.test(file.name || ''));
}

// HEIC/HEIF is attempted with the browser's own decoder (Safari 17+ has one);
// no third-party HEVC decoder is bundled. Other types must be JPEG/PNG/WebP.
async function decodePhoto(file) {
  if (!file || typeof file.size !== 'number') throw new Error('사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
  const heif = isHeif(file);
  if (!heif && !PHOTO_TYPES.includes(file.type) && !(!file.type && OTHER_PHOTO_NAME.test(file.name || '')))
    throw new Error('JPG·PNG·WebP 사진을 골라 주세요. HEIC 사진은 아래 안내를 따라 주세요.');
  if (file.size > 25000000) throw new Error('25MB 이하 사진을 골라 주세요.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(heif ? HEIC_HELP : '사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(url);
    throw new Error(heif ? HEIC_HELP : '사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
  }
  return { image, url, width: image.naturalWidth, height: image.naturalHeight };
}

/**
 * Normalize a crop given as fractions of the source (0–1). Returns null for
 * "the whole photo" so callers can tell a real crop from no crop.
 */
export function normalizeCrop(crop) {
  if (!crop || typeof crop !== 'object') return null;
  const n = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : NaN);
  let x = n(crop.x), y = n(crop.y), w = n(crop.w), h = n(crop.h);
  if ([x, y, w, h].some(Number.isNaN)) return null;
  w = Math.max(0.05, Math.min(w, 1 - x));
  h = Math.max(0.05, Math.min(h, 1 - y));
  x = Math.min(x, 1 - w);
  y = Math.min(y, 1 - h);
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

async function encode(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function renderAsset(decoded, crop) {
  const area = normalizeCrop(crop);
  const sx = area ? Math.round(area.x * decoded.width) : 0;
  const sy = area ? Math.round(area.y * decoded.height) : 0;
  const sw = area ? Math.max(1, Math.round(area.w * decoded.width)) : decoded.width;
  const sh = area ? Math.max(1, Math.round(area.h * decoded.height)) : decoded.height;
  const scale = Math.min(1, MAX_SAVED_EDGE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 준비하지 못했습니다.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded.image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  // Busy patterns can exceed the storage limit at the default quality; step
  // down before giving up instead of rejecting a normal phone photo.
  for (const quality of [0.82, 0.7, 0.6]) {
    const blob = await encode(canvas, quality);
    if (blob && blob.size <= MAX_GARMENT_PHOTO_BYTES) return photoAsset(blob);
  }
  throw new Error('사진 용량을 줄여 다시 골라 주세요.');
}

/**
 * Decode a picked file once: the whole-photo asset to show and save now, and
 * the in-memory source a later crop (or re-crop) is cut from.
 */
export async function prepareGarmentPhotoWithSource(file) {
  const decoded = await decodePhoto(file);
  try {
    const asset = await renderAsset(decoded, null);
    return { asset, source: { blob: file, width: decoded.width, height: decoded.height } };
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

/** Make the stored JPEG asset from a source, optionally cropped (fractions). */
export async function photoAssetFromSource(source, crop = null) {
  const decoded = await decodePhoto(source.blob);
  try {
    return await renderAsset(decoded, crop);
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

export async function prepareGarmentPhoto(file) {
  const decoded = await decodePhoto(file);
  try {
    return await renderAsset(decoded, null);
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Move the crop box ("move") or one corner ("nw"/"ne"/"sw"/"se") by a pointer
 * delta given as fractions of the photo. The box never leaves the photo and
 * never shrinks below `min` of either side.
 */
export function dragCrop(from, handle, dx, dy, min = 0.08) {
  let { x, y, w, h } = from;
  if (handle === 'move') {
    x = clamp(x + dx, 0, 1 - w);
    y = clamp(y + dy, 0, 1 - h);
    return { x, y, w, h };
  }
  let left = x, top = y, right = x + w, bottom = y + h;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - min);
  if (handle.includes('e')) right = clamp(right + dx, left + min, 1);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - min);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + min, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Put the garment on a plain white background using a square foreground mask
 * (0–255, `size`×`size`, stretched over the photo) and crop to the garment
 * with a small margin. Returns a stored-photo asset (JPEG).
 */
/** The photo squeezed to size×size RGB bytes, the input the mask models expect (as the device worker draws it). */
export async function photoPixels(blob, size) {
  const decoded = await decodePhoto(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('사진을 준비하지 못했습니다.');
    ctx.drawImage(decoded.image, 0, 0, size, size);
    const rgba = ctx.getImageData(0, 0, size, size).data;
    const rgb = new Uint8Array(size * size * 3);
    for (let p = 0; p < size * size; p++) {
      rgb[p * 3] = rgba[p * 4];
      rgb[p * 3 + 1] = rgba[p * 4 + 1];
      rgb[p * 3 + 2] = rgba[p * 4 + 2];
    }
    return rgb;
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}

export async function photoAssetWithoutBackground(blob, mask, size, { margin = 0.06 } = {}) {
  const decoded = await decodePhoto(blob);
  try {
    const W = decoded.width, H = decoded.height;
    let minX = size, minY = size, maxX = -1, maxY = -1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (mask[y * size + x] < 128) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (maxX < 0) throw new Error('옷을 배경과 구분하지 못했어요. 원래 사진을 그대로 쓸게요.');
    const pad = margin * Math.max(maxX - minX + 1, maxY - minY + 1);
    const left = Math.max(0, Math.floor(((minX - pad) / size) * W));
    const top = Math.max(0, Math.floor(((minY - pad) / size) * H));
    const right = Math.min(W, Math.ceil(((maxX + 1 + pad) / size) * W));
    const bottom = Math.min(H, Math.ceil(((maxY + 1 + pad) / size) * H));
    const sw = Math.max(1, right - left), sh = Math.max(1, bottom - top);
    const scale = Math.min(1, MAX_SAVED_EDGE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    // The mask becomes the alpha channel of a small canvas, stretched with
    // smoothing over the photo so the garment edge stays soft.
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const mctx = maskCanvas.getContext('2d');
    if (!mctx) throw new Error('사진을 준비하지 못했습니다.');
    const alpha = mctx.createImageData(size, size);
    for (let p = 0; p < mask.length; p++) { alpha.data[p * 4 + 3] = mask[p]; }
    mctx.putImageData(alpha, 0, 0);
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const lctx = layer.getContext('2d');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!lctx || !ctx) throw new Error('사진을 준비하지 못했습니다.');
    lctx.drawImage(decoded.image, left, top, sw, sh, 0, 0, w, h);
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(maskCanvas, (left / W) * size, (top / H) * size, (sw / W) * size, (sh / H) * size, 0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(layer, 0, 0);
    for (const quality of [0.82, 0.7, 0.6]) {
      const out = await encode(canvas, quality);
      if (out && out.size <= MAX_GARMENT_PHOTO_BYTES) return photoAsset(out);
    }
    throw new Error('사진 용량을 줄여 다시 골라 주세요.');
  } finally {
    URL.revokeObjectURL(decoded.url);
  }
}
