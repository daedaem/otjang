// 올릴 사진 준비: 내가 고른 사진을 이 기기에서 긴 변 1080px JPEG로 다시 그린다.
// 다시 그리면 위치·기기 정보(EXIF 등)가 따라가지 않는다. 600KB를 넘으면 품질·크기를 낮춰 다시 그린다.
export type ReadyPhoto = { base64: string; url: string; size: number };
const MAX_BYTES = 600 * 1024;
function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(Error("사진을 읽지 못했어요. JPEG·PNG·WebP 사진을 골라 주세요."));
    };
    img.src = url;
  });
}
function draw(img: HTMLImageElement, side: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#ffffff"; // 투명한 PNG의 바탕
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function preparePhoto(file: File): Promise<ReadyPhoto> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !file.size || file.size > 20 * 1024 * 1024)
    throw Error("20MB 이하의 JPEG·PNG·WebP 사진을 골라 주세요.");
  const img = await load(file);
  if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40_000_000)
    throw Error("사진이 너무 커요. 더 작은 사본을 골라 주세요.");
  for (const [side, quality] of [[1080, 0.82], [1080, 0.7], [860, 0.7], [720, 0.62]] as const) {
    const blob = await draw(img, side, quality);
    if (blob && blob.size <= MAX_BYTES) {
      img.src = "";
      return { base64: await base64(blob), url: URL.createObjectURL(blob), size: blob.size };
    }
  }
  throw Error("사진을 줄이지 못했어요. 다른 사진을 골라 주세요.");
}
