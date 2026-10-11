/** Local image heuristics, not an AI clothing detector. No requests or model downloads. */
export const PHOTO_LIMITS = Object.freeze({
  files: 12,
  bytes: 12 * 1024 * 1024,
  pixels: 24_000_000,
  side: 12_000,
  outputSide: 900,
});
const WHOLE = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('사진 처리를 취소했습니다.', 'AbortError');
}

export function normalizeRegion(region = WHOLE) {
  const values = ['x', 'y', 'width', 'height'].map((key) => Number(region[key]));
  if (values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    throw new Error('잘라낼 영역의 좌표와 크기를 확인해 주세요.');
  }
  const [left, top, width, height] = values;
  const x = Math.max(0, Math.min(1, left));
  const y = Math.max(0, Math.min(1, top));
  const right = Math.max(0, Math.min(1, left + width));
  const bottom = Math.max(0, Math.min(1, top + height));
  if (right <= x || bottom <= y) throw new Error('사진 안의 영역을 선택해 주세요.');
  return { x, y, width: right - x, height: bottom - y };
}

function rgbAt(data, offset) {
  const alpha = data[offset + 3] / 255;
  return [0, 1, 2].map((channel) => Math.round(data[offset + channel] * alpha + 255 * (1 - alpha)));
}

function colorName([r, g, b]) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const saturation = max ? delta / max : 0;
  if (max < 55) return 'black';
  if (saturation < 0.13) return min > 220 ? 'white' : 'gray';
  let hue =
    delta === 0
      ? 0
      : max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue >= 20 && hue < 65 && saturation < 0.42 && max > 155) return 'beige';
  if (hue >= 10 && hue < 65 && max < 180) return 'brown';
  if ((hue < 20 || hue >= 330) && min > 100 && max > 190) return 'pink';
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 260) return 'blue';
  if (hue < 315) return 'purple';
  return 'pink';
}

function mostCommon(counts) {
  return (
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ||
    'unknown'
  );
}

/**
 * Pure pixel analysis. A region is a contrasting object, not necessarily clothing.
 * Uniform/uneven backgrounds and too many small objects return a whole-image draft.
 */
export function detectPhotoRegions(
  { data, width, height },
  { threshold = 45, minAreaRatio = 0.006, maxRegions = 8 } = {},
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 2_000_000 ||
    !data ||
    data.length !== width * height * 4
  ) {
    throw new Error('분석할 이미지 픽셀 형식 또는 크기가 올바르지 않습니다.');
  }
  if (
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    !Number.isFinite(minAreaRatio) ||
    minAreaRatio <= 0 ||
    minAreaRatio > 1 ||
    !Number.isInteger(maxRegions) ||
    maxRegions < 1
  ) {
    throw new Error('사진 분석 옵션이 올바르지 않습니다.');
  }
  const count = width * height;
  const colors = new Map();
  const edge = [];
  const stride = Math.max(1, Math.floor((width + height) / 256));
  for (let x = 0; x < width; x += stride) {
    edge.push(rgbAt(data, x * 4), rgbAt(data, ((height - 1) * width + x) * 4));
  }
  for (let y = 0; y < height; y += stride) {
    edge.push(rgbAt(data, y * width * 4), rgbAt(data, (y * width + width - 1) * 4));
  }
  const background = [0, 1, 2].map(
    (channel) => edge.map((rgb) => rgb[channel]).sort((a, b) => a - b)[Math.floor(edge.length / 2)],
  );
  const distance = (rgb) =>
    rgb.reduce((sum, value, channel) => sum + (value - background[channel]) ** 2, 0);
  const consistency = edge.filter((rgb) => distance(rgb) <= threshold ** 2).length / edge.length;
  const mask = new Uint8Array(count);
  let foregroundPixels = 0;
  for (let i = 0; i < count; i++) {
    const rgb = rgbAt(data, i * 4);
    const color = colorName(rgb);
    colors.set(color, (colors.get(color) || 0) + 1);
    if (distance(rgb) > threshold ** 2) {
      mask[i] = 1;
      foregroundPixels++;
    }
  }
  const fallback = (reason) => ({
    mode: 'whole-image',
    reason,
    regions: [{ ...WHOLE, color: mostCommon(colors), pixelCount: count }],
    backgroundReliable: consistency >= 0.82,
  });
  if (consistency < 0.82)
    return fallback(
      '배경이 고르지 않아 사진 전체를 검토 초안으로 만들었습니다. 직접 영역을 선택해 주세요.',
    );
  if (foregroundPixels / count > 0.88)
    return fallback('배경과 물체의 경계가 불확실해 사진 전체를 검토 초안으로 만들었습니다.');

  const queue = new Int32Array(count);
  const regions = [];
  const minimum = Math.max(12, Math.ceil(count * minAreaRatio));
  for (let start = 0; start < count; start++) {
    if (mask[start] !== 1) continue;
    let head = 0,
      tail = 1;
    queue[0] = start;
    mask[start] = 2;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    const componentColors = new Map();
    while (head < tail) {
      const pixel = queue[head++],
        x = pixel % width,
        y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const color = colorName(rgbAt(data, pixel * 4));
      componentColors.set(color, (componentColors.get(color) || 0) + 1);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (mask[neighbor] === 1) {
            mask[neighbor] = 2;
            queue[tail++] = neighbor;
          }
        }
    }
    const boxWidth = maxX - minX + 1,
      boxHeight = maxY - minY + 1;
    if (tail < minimum || boxWidth < 3 || boxHeight < 3 || tail / (boxWidth * boxHeight) < 0.12)
      continue;
    const padding = Math.max(1, Math.round(Math.min(width, height) * 0.012));
    const x = Math.max(0, minX - padding),
      y = Math.max(0, minY - padding);
    regions.push({
      x: x / width,
      y: y / height,
      width: (Math.min(width, maxX + 1 + padding) - x) / width,
      height: (Math.min(height, maxY + 1 + padding) - y) / height,
      color: mostCommon(componentColors),
      pixelCount: tail,
    });
  }
  if (!regions.length)
    return fallback(
      '분리할 영역을 찾지 못했습니다. 배경과 비슷한 색의 옷은 놓칠 수 있어 사진 전체를 확인해 주세요.',
    );
  if (regions.length > maxRegions)
    return fallback('서로 떨어진 영역이 너무 많아 사진 전체를 검토 초안으로 만들었습니다.');
  regions.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    mode: 'regions',
    reason:
      '단색 배경과 다른 색의 연결 영역을 분리했습니다. 옷이 아닌 물체도 포함될 수 있고, 겹치거나 닿은 옷은 합쳐질 수 있습니다.',
    regions,
    backgroundReliable: true,
  };
}

/** Read dimensions before decoding to bound browser memory; reject active SVG content. */
export function readImageDimensions(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, size) => String.fromCharCode(...bytes.subarray(offset, offset + size));
  let width, height, type;
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    width = view.getUint32(16);
    height = view.getUint32(20);
    type = 'image/png';
  } else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    width = view.getUint16(6, true);
    height = view.getUint16(8, true);
    type = 'image/gif';
  } else if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const chunk = ascii(offset, 4),
        size = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (start + size > bytes.length) break;
      if (chunk === 'VP8X' && size >= 10) {
        width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      } else if (
        chunk === 'VP8 ' &&
        size >= 10 &&
        bytes[start + 3] === 0x9d &&
        bytes[start + 4] === 1 &&
        bytes[start + 5] === 0x2a
      ) {
        width = view.getUint16(start + 6, true) & 0x3fff;
        height = view.getUint16(start + 8, true) & 0x3fff;
      } else if (chunk === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        const bits = view.getUint32(start + 1, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      if (width && height) {
        type = 'image/webp';
        break;
      }
      offset = start + size + (size % 2);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        type = 'image/jpeg';
        break;
      }
      offset += length;
    }
  }
  if (!width || !height || !type)
    throw new Error(
      '읽을 수 있는 JPEG, PNG, WebP 또는 GIF 사진을 선택해 주세요. HEIC·SVG는 지원하지 않습니다.',
    );
  if (
    width > PHOTO_LIMITS.side ||
    height > PHOTO_LIMITS.side ||
    width * height > PHOTO_LIMITS.pixels
  ) {
    throw new Error('사진 해상도가 너무 큽니다. 2,400만 화소 이하로 줄인 뒤 다시 선택해 주세요.');
  }
  return { width, height, type };
}

function canvasFor(width, height) {
  if (typeof document === 'undefined')
    throw new Error('사진 처리는 Canvas를 지원하는 브라우저에서 사용할 수 있습니다.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('브라우저에서 사진을 처리할 수 없습니다.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function decodeBlob(blob, signal) {
  abortIfNeeded(signal);
  if (typeof createImageBitmap === 'function') {
    const image = await createImageBitmap(blob);
    if (signal?.aborted) {
      image.close();
      abortIfNeeded(signal);
    }
    return { image, width: image.width, height: image.height, close: () => image.close() };
  }
  return new Promise((resolve, reject) => {
    const image = new Image(),
      url = URL.createObjectURL(blob);
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url);
      image.onload = null;
      image.onerror = null;
    };
    const onAbort = () => {
      cleanup();
      image.src = '';
      reject(new DOMException('사진 처리를 취소했습니다.', 'AbortError'));
    };
    image.onload = () => {
      cleanup();
      resolve({ image, width: image.naturalWidth, height: image.naturalHeight, close() {} });
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('손상되었거나 브라우저가 읽을 수 없는 사진입니다.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

function drawCrop(source, width, height, region) {
  const safe = normalizeRegion(region);
  const sx = safe.x * width,
    sy = safe.y * height,
    sw = safe.width * width,
    sh = safe.height * height;
  const scale = Math.min(1, PHOTO_LIMITS.outputSide / Math.max(sw, sh));
  const { canvas, context } = canvasFor(sw * scale, sh * scale);
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Generates unconfirmed drafts. Source images are metadata-free JPEGs, not the originals.
 * Cancellation stops after the current local decode and returns completed drafts/errors.
 * Progress: {completed,total,name,status:'processing'|'done'|'error'|'cancelled'}.
 */
export async function analyzePhotos(files, { onProgress = () => {}, signal } = {}) {
  const incoming = Array.from(files || []),
    accepted = incoming.slice(0, PHOTO_LIMITS.files);
  const drafts = [],
    errors = incoming
      .slice(PHOTO_LIMITS.files)
      .map((file) => ({
        name: file.name || '사진',
        message: '한 번에 최대 12장까지 처리합니다. 나머지는 다음에 추가해 주세요.',
      }));
  const seen = [];
  let completed = 0;
  const progress = (name, status) => {
    try {
      onProgress({ completed, total: accepted.length, name, status });
    } catch {
      /* UI callbacks cannot destroy photo results. */
    }
  };
  for (const file of accepted) {
    const name = file.name || '사진';
    if (signal?.aborted) {
      errors.push({ name, message: '처리를 취소했습니다. 완료된 초안은 유지됩니다.' });
      progress(name, 'cancelled');
      break;
    }
    progress(name, 'processing');
    let decoded;
    try {
      abortIfNeeded(signal);
      if (!file.size || file.size > PHOTO_LIMITS.bytes)
        throw new Error('사진 한 장은 0바이트보다 크고 12MB 이하여야 합니다.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      abortIfNeeded(signal);
      const { type } = readImageDimensions(bytes);
      decoded = await decodeBlob(new Blob([bytes], { type }), signal);
      if (
        !decoded.width ||
        !decoded.height ||
        decoded.width > PHOTO_LIMITS.side ||
        decoded.height > PHOTO_LIMITS.side ||
        decoded.width * decoded.height > PHOTO_LIMITS.pixels
      )
        throw new Error('사진 해상도가 너무 큽니다. 크기를 줄인 뒤 다시 선택해 주세요.');
      abortIfNeeded(signal);
      const sourceCanvas = drawCrop(decoded.image, decoded.width, decoded.height, WHOLE);
      const sourceImage = sourceCanvas.toDataURL('image/jpeg', 0.84);
      const analysisScale = Math.min(1, 256 / Math.max(sourceCanvas.width, sourceCanvas.height));
      const { canvas: small, context } = canvasFor(
        sourceCanvas.width * analysisScale,
        sourceCanvas.height * analysisScale,
      );
      context.drawImage(sourceCanvas, 0, 0, small.width, small.height);
      const analysis = detectPhotoRegions(context.getImageData(0, 0, small.width, small.height));
      const duplicate = seen.find((previous) => sameBytes(previous.bytes, bytes));
      const perFile = analysis.regions.map((detected, index) => {
        const { x, y, width, height } = detected;
        const region = { x, y, width, height };
        const draft = {
          id: newId(),
          name: `${name.replace(/\.[^.]+$/, '')}${analysis.mode === 'regions' ? ` · 영역 ${index + 1}` : ' · 전체 사진'}`,
          category: 'unknown',
          kind: 'unknown',
          color: detected.color,
          pattern: 'unknown',
          image: drawCrop(sourceCanvas, sourceCanvas.width, sourceCanvas.height, region).toDataURL(
            'image/jpeg',
            0.84,
          ),
          sourceImage,
          region,
          source: 'photo',
          confirmed: false,
          selected: true,
          analysisNote: `사진 영역 분리 베타 · ${analysis.reason} 종류·무늬는 미확인이고 대표색도 조명·배경의 영향을 받는 추정입니다.`,
        };
        if (duplicate?.ids[index]) draft.duplicateOf = duplicate.ids[index];
        return draft;
      });
      abortIfNeeded(signal);
      drafts.push(...perFile);
      seen.push({ bytes, ids: perFile.map((draft) => draft.id) });
      completed++;
      progress(name, 'done');
    } catch (error) {
      const cancelled = error?.name === 'AbortError';
      errors.push({
        name,
        message: cancelled
          ? '처리를 취소했습니다. 완료된 초안은 유지됩니다.'
          : error.message || '사진을 처리하지 못했습니다.',
      });
      if (!cancelled) completed++;
      progress(name, cancelled ? 'cancelled' : 'error');
      if (cancelled) break;
    } finally {
      decoded?.close();
    }
    // Let the browser render progress/cancellation between photos without any network use.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { drafts, errors };
}

/** Manual crop accepts inline raster images only; remote URLs are never loaded. */
export async function cropImage(dataURL, region) {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataURL || '',
  );
  if (!match || match[2].length > Math.ceil((PHOTO_LIMITS.bytes * 4) / 3) + 4)
    throw new Error('로컬 사진 데이터만 잘라낼 수 있습니다.');
  const safe = normalizeRegion(region);
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const { type } = readImageDimensions(bytes);
  const decoded = await decodeBlob(new Blob([bytes], { type }));
  try {
    return drawCrop(decoded.image, decoded.width, decoded.height, safe).toDataURL(
      'image/jpeg',
      0.84,
    );
  } finally {
    decoded.close();
  }
}
