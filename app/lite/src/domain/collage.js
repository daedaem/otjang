// L0 "거울 콜라주": the user's own full-length photo with their own garment
// cutouts laid over it, sized by the garments' measured lengths.
//
// No image is generated or sent anywhere; the screen only scales and stacks
// pictures already on the device. The shoulder and waist lines are average
// body proportions (editorial), so every placement starts there and the user
// drags it into place. A garment without a measured length gets a typical
// length for its category and is marked `assumedLength`.
import { garmentCategory, garmentShape } from './garment-profile.js';

// Fraction of standing height measured down from the top of the head. Editorial averages.
export const BODY_LINES = { shoulder: 0.18, waist: 0.42 };
// Typical garment length as a fraction of height when no length is recorded.
const TYPICAL_LENGTH = { top: 0.41, outer: 0.45, dress: 0.6, bottom: 0.58, skirt: 0.34 };
const LAYER = { bottom: 1, skirt: 1, dress: 2, top: 2, outer: 3 };

export function bodyScale({ heightCm, headTopY, feetY }) {
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230)
    throw new Error('키는 100~230cm 사이로 적어 주세요.');
  if (!Number.isFinite(headTopY) || !Number.isFinite(feetY) || feetY - headTopY < 50)
    throw new Error('사진에서 머리 끝과 발끝을 다시 찍어 주세요.');
  return { pxPerCm: (feetY - headTopY) / heightCm, heightCm, headTopY, feetY };
}

// image: { width, height } of the cutout in pixels (its bounding box is the garment).
export function placeGarment({ item, lengthCm = null, image, scale, centerX }) {
  const cat = garmentCategory(item);
  const kind = garmentShape(item) === 'skirt' ? 'skirt' : cat;
  if (!Object.hasOwn(LAYER, kind)) return null;
  if (!image?.width || !image?.height) throw new Error('옷 사진 크기를 읽지 못했어요.');
  const assumedLength = !(Number.isFinite(lengthCm) && lengthCm > 0);
  const cm = assumedLength ? scale.heightCm * TYPICAL_LENGTH[kind] : lengthCm;
  const height = cm * scale.pxPerCm;
  const width = height * (image.width / image.height);
  const line = kind === 'bottom' || kind === 'skirt' ? BODY_LINES.waist : BODY_LINES.shoulder;
  const top = scale.headTopY + scale.heightCm * line * scale.pxPerCm;
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
    layer: LAYER[kind],
    assumedLength,
  };
}
