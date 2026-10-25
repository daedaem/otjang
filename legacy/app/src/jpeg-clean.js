// Removes metadata from a JPEG without decoding the picture.
//
// A photo shared with other members must not carry where or when it was taken
// or the device: EXIF (GPS, time, camera), XMP, IPTC/Photoshop, comments and
// vendor segments are dropped. Kept: the JFIF header, an ICC colour profile and
// the Adobe colour transform, which only affect how colours are shown. The
// image data after the first scan header is copied unchanged. A file that does
// not parse as a JPEG is refused rather than sent as it is.
//
// Photos registered in this app are already re-encoded by a canvas and carry no
// EXIF; this guards photos from older versions, imports and restored backups.
// An EXIF orientation is dropped with the rest; such a photo may then show
// unrotated (canvas-made photos have the rotation applied already).
function jpegStartsWith(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

export function stripJpegMetadata(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bad = () => Object.assign(new Error('JPEG 사진을 읽지 못했어요.'), { code: 'bad-jpeg' });
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw bad();
  const parts = [b.subarray(0, 2)];
  let removed = 0;
  let i = 2;
  for (;;) {
    if (i + 1 >= b.length || b[i] !== 0xff) throw bad();
    while (b[i + 1] === 0xff) i++; // fill bytes
    const marker = b[i + 1];
    if (marker === 0xda) { // start of scan: the rest is picture data
      parts.push(b.subarray(i));
      break;
    }
    if (marker === 0xd9) { // end of image without a scan
      parts.push(b.subarray(i, i + 2));
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) throw bad();
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2 || i + 2 + length > b.length) throw bad();
    const body = i + 4;
    const keep =
      (marker === 0xe0 && jpegStartsWith(b, body, 'JFIF\0')) ||
      (marker === 0xe2 && jpegStartsWith(b, body, 'ICC_PROFILE\0')) ||
      (marker === 0xee && jpegStartsWith(b, body, 'Adobe')) ||
      !((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe);
    if (keep) parts.push(b.subarray(i, i + 2 + length));
    else removed++;
    i += 2 + length;
  }
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return { bytes: out, removed };
}
