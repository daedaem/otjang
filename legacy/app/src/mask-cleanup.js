// Keep only the main subject of a foreground mask.
//
// Salient-object models sometimes also mark other things in the photo (a box,
// a bag, a patch of pattern). Measured 2026-10-15 on 20 synthetic home scenes
// (docs/server-photo-mask-20261015.md): keeping the largest connected region,
// plus any region at least 30% of its size, raised the worst IoU from 0.655 to
// 0.741 (U-2-Netp) and from 0.851 to 0.938 (U-2-Net). The app and the server
// both use this, so the same photo is cleaned the same way.

/**
 * mask: Uint8Array of size*size values 0–255. Returns a new mask where regions
 * apart from the main subject are 0. Soft edges near kept regions stay.
 */
export function keepMainSubject(mask, size, { ratio = 0.3, grow = 3 } = {}) {
  const n = size * size;
  if (!(mask instanceof Uint8Array) || mask.length !== n) throw new Error('마스크 크기가 맞지 않아요.');
  const label = new Int32Array(n);
  const sizes = [0];
  const stack = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (mask[start] < 128 || label[start]) continue;
    const id = sizes.length;
    let top = 0, count = 0;
    stack[top++] = start;
    label[start] = id;
    while (top) {
      const p = stack[--top];
      count++;
      const x = p % size;
      const next = [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size];
      for (const q of next)
        if (q >= 0 && q < n && !label[q] && mask[q] >= 128) {
          label[q] = id;
          stack[top++] = q;
        }
    }
    sizes.push(count);
  }
  if (sizes.length <= 2) return Uint8Array.from(mask);
  const largest = Math.max(...sizes.slice(1));
  const keep = sizes.map((count, id) => id > 0 && count >= ratio * largest);
  // Grow the kept regions a few pixels so their soft edges are not cut.
  let area = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (keep[label[p]]) area[p] = 1;
  for (let step = 0; step < grow; step++) {
    const next = Uint8Array.from(area);
    for (let p = 0; p < n; p++) {
      if (!area[p]) continue;
      const x = p % size;
      if (x > 0) next[p - 1] = 1;
      if (x < size - 1) next[p + 1] = 1;
      if (p >= size) next[p - size] = 1;
      if (p + size < n) next[p + size] = 1;
    }
    area = next;
  }
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (area[p]) out[p] = mask[p];
  return out;
}
