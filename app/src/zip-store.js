// claude.ai 미리보기의 파일 저장은 정해진 확장자만 받는다(.eoul은 안 됨). 백업 파일을 바꾸지 않고
// 무압축 ZIP 한 겹으로 감싸 .zip으로 저장하고, 불러올 때 다시 꺼낸다. 압축·암호화는 하지 않는다.
import { MAX_GARMENT_PHOTO_BYTES } from './wardrobe-store.js';

// Normal backups support 200 photos plus a 1 MB manifest and its 12-byte header.
// Diagnostic exports can be larger; refuse ZIP wrapping explicitly without changing their source.
export const MAX_ZIP_BACKUP_BYTES = 200 * MAX_GARMENT_PHOTO_BYTES + 1000000 + 12;
const MAX_ZIP_ARCHIVE_BYTES = MAX_ZIP_BACKUP_BYTES + 98 + 2 * 65535;
const zipSizeError = () =>
  new Error(
    'ZIP 백업의 지원 용량을 넘었습니다. 원본은 변경하지 않았습니다. 일반 브라우저에서 원문 백업을 받아 주세요.',
  );

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
async function crc32Blob(blob) {
  let c = 0xffffffff;
  // Retain the Blob and read one photo-sized chunk at a time, including for a 200-photo archive.
  for (let offset = 0; offset < blob.size; offset += MAX_GARMENT_PHOTO_BYTES) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + MAX_GARMENT_PHOTO_BYTES).arrayBuffer());
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export async function zipStore(name, blob) {
  if (!(blob instanceof Blob)) throw new Error('백업 파일을 읽을 수 없습니다. 원본은 변경하지 않았습니다.');
  if (blob.size > MAX_ZIP_BACKUP_BYTES) throw zipSizeError();
  const fileName = new TextEncoder().encode(name);
  if (!fileName.length || fileName.length > 65535) throw new Error('백업 파일 이름의 길이를 확인해 주세요.');
  const crc = await crc32Blob(blob);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0x0800, true); // UTF-8 파일 이름
  local.setUint32(14, crc, true);
  local.setUint32(18, blob.size, true);
  local.setUint32(22, blob.size, true);
  local.setUint16(26, fileName.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, blob.size, true);
  central.setUint32(24, blob.size, true);
  central.setUint16(28, fileName.length, true);
  const centralOffset = 30 + fileName.length + blob.size;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + fileName.length, true);
  end.setUint32(16, centralOffset, true);
  return new Blob([local, fileName, blob, central, fileName, end], { type: 'application/zip' });
}
// 이 앱이 만든 무압축 ZIP(파일 하나)만 꺼낸다. 다른 ZIP이면 null.
export async function unzipSingle(blob) {
  if (!(blob instanceof Blob) || blob.size < 100) return null;
  if (blob.size > MAX_ZIP_ARCHIVE_BYTES) throw zipSizeError();
  const head = new DataView(await blob.slice(0, 30).arrayBuffer());
  if (head.getUint32(0, true) !== 0x04034b50) return null;
  const flags = head.getUint16(6, true);
  const method = head.getUint16(8, true);
  const size = head.getUint32(18, true);
  const nameLength = head.getUint16(26, true);
  const extra = head.getUint16(28, true);
  if (size > MAX_ZIP_BACKUP_BYTES) throw zipSizeError();
  if (
    head.getUint16(4, true) !== 20 ||
    ![0, 0x0800].includes(flags) ||
    method !== 0 ||
    !nameLength ||
    extra !== 0 ||
    head.getUint32(22, true) !== size
  )
    return null;
  const start = 30 + nameLength + extra;
  const centralOffset = start + size;
  const centralSize = 46 + nameLength;
  if (centralOffset + centralSize + 22 !== blob.size) return null;

  const end = new DataView(await blob.slice(blob.size - 22).arrayBuffer());
  if (
    end.getUint32(0, true) !== 0x06054b50 ||
    end.getUint16(4, true) !== 0 ||
    end.getUint16(6, true) !== 0 ||
    end.getUint16(8, true) !== 1 ||
    end.getUint16(10, true) !== 1 ||
    end.getUint32(12, true) !== centralSize ||
    end.getUint32(16, true) !== centralOffset ||
    end.getUint16(20, true) !== 0
  )
    return null;

  const central = new DataView(await blob.slice(centralOffset, centralOffset + 46).arrayBuffer());
  if (
    central.getUint32(0, true) !== 0x02014b50 ||
    central.getUint16(4, true) !== 20 ||
    central.getUint16(6, true) !== 20 ||
    central.getUint16(8, true) !== flags ||
    central.getUint16(10, true) !== method ||
    central.getUint32(12, true) !== head.getUint32(10, true) ||
    central.getUint32(16, true) !== head.getUint32(14, true) ||
    central.getUint32(20, true) !== size ||
    central.getUint32(24, true) !== size ||
    central.getUint16(28, true) !== nameLength ||
    central.getUint16(30, true) !== 0 ||
    central.getUint16(32, true) !== 0 ||
    central.getUint16(34, true) !== 0 ||
    central.getUint32(42, true) !== 0
  )
    return null;

  const fileName = new Uint8Array(await blob.slice(30, start).arrayBuffer());
  const centralName = new Uint8Array(await blob.slice(centralOffset + 46, centralOffset + centralSize).arrayBuffer());
  if (fileName.some((byte, index) => byte !== centralName[index])) return null;
  let name;
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(fileName);
  } catch {
    return null;
  }
  const body = blob.slice(start, start + size);
  if ((await crc32Blob(body)) !== head.getUint32(14, true)) return null;
  return { name, blob: body };
}
