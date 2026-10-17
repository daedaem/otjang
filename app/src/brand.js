// The service's name and voice. The default build is 어울. A theme build
// (node tools/build.mjs --theme <id>) swaps this object for the "brand" of
// app/themes/<id>.json, so several designs of the same working app can be
// compared side by side before the name and look are chosen.
export const BRAND = {
  id: 'base',
  name: '어울',
  tagline: '내 옷에서 시작하는 스타일',
  // Trusted markup from this file or a theme file, never user input.
  heroTitle: '내 옷과 어울리는<br>다음 한 벌.',
  // Closet tab shows the closet as a room (hung, folded, floor, drawer) with doors that open on entry.
  wardrobe: false,
  // The three decision words, e.g. { buy: '딱!', hold: '잠깐', skip: '패스' }: a stamp on
  // the purchase judgment, the decision buttons and the 도장 수첩. null shows none.
  stamps: null,
  // Home leads with one candidate and its stamp at a time (needs stamps).
  deck: false,
  // The root element carries data-daypart (dawn | day | dusk | night) for a palette that follows the sky.
  daypart: false,
  // A short vibration when a decision is stamped, where the browser supports it.
  haptic: false,
};
