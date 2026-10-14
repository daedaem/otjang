// claude.ai 미리보기의 파일 저장은 정해진 확장자만 받는다(.eoul은 안 됨). 백업 파일을 바꾸지 않고
// 무압축 ZIP 한 겹으로 감싸 .zip으로 저장하고, 불러올 때 다시 꺼낸다. 압축·암호화는 하지 않는다.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export async function zipStore(name, blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const fileName = new TextEncoder().encode(name);
  const crc = crc32(data);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0x0800, true); // UTF-8 파일 이름
  local.setUint32(14, crc, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, data.length, true);
  local.setUint16(26, fileName.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, data.length, true);
  central.setUint16(28, fileName.length, true);
  const centralOffset = 30 + fileName.length + data.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + fileName.length, true);
  end.setUint32(16, centralOffset, true);
  return new Blob([local, fileName, data, central, fileName, end], { type: 'application/zip' });
}
// 이 앱이 만든 무압축 ZIP(파일 하나)만 꺼낸다. 다른 ZIP이면 null.
export async function unzipSingle(blob) {
  if (blob.size < 52) return null;
  const head = new DataView(await blob.slice(0, 30).arrayBuffer());
  if (head.getUint32(0, true) !== 0x04034b50) return null;
  const method = head.getUint16(8, true);
  const size = head.getUint32(18, true);
  const nameLength = head.getUint16(26, true);
  const extra = head.getUint16(28, true);
  if (method !== 0 || head.getUint16(6, true) & 0x08 || 30 + nameLength + extra + size > blob.size) return null;
  const name = new TextDecoder().decode(await blob.slice(30, 30 + nameLength).arrayBuffer());
  const start = 30 + nameLength + extra;
  const body = blob.slice(start, start + size);
  if (crc32(new Uint8Array(await body.arrayBuffer())) !== head.getUint32(14, true)) return null;
  return { name, blob: body };
}
