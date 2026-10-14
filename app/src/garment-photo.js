import { photoAsset, MAX_GARMENT_PHOTO_BYTES } from './wardrobe-store.js';

export async function prepareGarmentPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG·PNG·WebP 사진을 골라 주세요. HEIC 사진은 JPG로 변환해 주세요.');
  if (file.size > 25000000) throw new Error('25MB 이하 사진을 골라 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('사진을 읽지 못했습니다. 다른 사진을 골라 주세요.');
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진을 준비하지 못했습니다.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82));
    if (!blob || blob.size > MAX_GARMENT_PHOTO_BYTES) throw new Error('사진 용량을 줄여 다시 골라 주세요.');
    return photoAsset(blob);
  } finally { URL.revokeObjectURL(url); }
}
