/* Original product illustrations for the prototype. No product photographs. */

const COLORS = Object.freeze({
  navy: '#27364b',
  blue: '#92afc3',
  white: '#f7f5ee',
  ivory: '#e8e2d5',
  beige: '#c4af90',
  brown: '#715441',
  olive: '#7c8066',
  gray: '#94958f',
  black: '#343638',
  indigo: '#526881',
  burgundy: '#755051',
  unknown: '#afa99e',
  cream: '#e8e2d5',
  green: '#64826b',
  red: '#b45851',
  pink: '#d3a5ac',
  yellow: '#dac178',
  orange: '#c58c60',
  purple: '#9b87aa',
  other: '#afa99e',
});

const COLOR_NAMES = Object.freeze({
  네이비: 'navy',
  남색: 'navy',
  블루: 'blue',
  파랑: 'blue',
  하늘색: 'blue',
  화이트: 'white',
  흰색: 'white',
  아이보리: 'ivory',
  크림: 'ivory',
  베이지: 'beige',
  브라운: 'brown',
  갈색: 'brown',
  올리브: 'olive',
  카키: 'olive',
  그레이: 'gray',
  회색: 'gray',
  블랙: 'black',
  검정: 'black',
  검정색: 'black',
  인디고: 'indigo',
  진청: 'indigo',
  버건디: 'burgundy',
  그린: 'green',
  초록: 'green',
  초록색: 'green',
  녹색: 'green',
  레드: 'red',
  빨강: 'red',
  빨간색: 'red',
  핑크: 'pink',
  분홍: 'pink',
  분홍색: 'pink',
  옐로: 'yellow',
  옐로우: 'yellow',
  노랑: 'yellow',
  노란색: 'yellow',
  오렌지: 'orange',
  주황: 'orange',
  주황색: 'orange',
  퍼플: 'purple',
  보라: 'purple',
  보라색: 'purple',
  기타: 'other',
});

let illustrationId = 0;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownString = (value, key) =>
  isRecord(value) && Object.hasOwn(value, key) && typeof value[key] === 'string' ? value[key] : '';
const escapeAttribute = (value) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

function tint(hex, amount) {
  const values = hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  return `#${values
    .map((value) =>
      Math.round(amount >= 0 ? value + (255 - value) * amount : value * (1 + amount))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function category(item = {}) {
  const value = ['kind', 'category', 'name', 'type', 'subcategory']
    .map((key) => ownString(item, key))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/loafer|로퍼|더비|옥스포드화|oxford shoe|구두/.test(value)) return 'loafer';
  if (/sneaker|스니커|운동화|신발|shoes|footwear/.test(value)) return 'sneaker';
  if (/denim|jean|데님|청바지/.test(value)) return 'denim';
  if (/chino|trouser|pants|bottom|치노|슬랙스|바지|팬츠|하의/.test(value)) return 'trouser';
  if (/blazer|블레이저|테일러드/.test(value)) return 'blazer';
  if (/jacket|coat|outer|재킷|자켓|아우터|코트|점퍼|블루종/.test(value)) return 'jacket';
  if (/knit|sweater|cardigan|니트|스웨터|가디건/.test(value)) return 'knit';
  if (/t-shirt|tshirt|tee|티셔츠|반팔/.test(value)) return 'tee';
  if (/shirt|셔츠/.test(value)) return 'shirt';
  return 'unknown';
}

function colorFor(item = {}, kind) {
  const requested = (ownString(item, 'color') || ownString(item, 'colorKey')).trim().toLowerCase();
  if (Object.hasOwn(COLORS, requested)) return COLORS[requested];
  if (Object.hasOwn(COLOR_NAMES, requested)) return COLORS[COLOR_NAMES[requested]];
  // Supplied but invalid colors must not become inherited object properties.
  if (
    requested ||
    (isRecord(item) &&
      ['color', 'colorKey'].some(
        (key) => Object.hasOwn(item, key) && typeof item[key] !== 'string',
      ))
  )
    return COLORS.unknown;
  const defaults = {
    denim: 'indigo',
    trouser: 'beige',
    loafer: 'brown',
    sneaker: 'white',
    shirt: 'blue',
    knit: 'ivory',
    tee: 'white',
    blazer: 'navy',
    jacket: 'olive',
  };
  return Object.hasOwn(defaults, kind) ? COLORS[defaults[kind]] : COLORS.unknown;
}

function definitions(id, color) {
  return `<defs>
    <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2=".22">
      <stop stop-color="${tint(color, -0.1)}"/>
      <stop offset=".2" stop-color="${tint(color, 0.11)}"/>
      <stop offset=".46" stop-color="${color}"/>
      <stop offset=".7" stop-color="${tint(color, 0.08)}"/>
      <stop offset="1" stop-color="${tint(color, -0.16)}"/>
    </linearGradient>
    <linearGradient id="${id}-fold" x1="0" y1="0" x2="1" y2="0">
      <stop stop-color="#fff" stop-opacity=".15"/>
      <stop offset=".47" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#20201a" stop-opacity=".1"/>
    </linearGradient>
    <linearGradient id="${id}-leather" x1="0" y1="0" x2=".25" y2="1">
      <stop stop-color="${tint(color, 0.23)}"/>
      <stop offset=".5" stop-color="${color}"/>
      <stop offset="1" stop-color="${tint(color, -0.38)}"/>
    </linearGradient>
    <linearGradient id="${id}-sole" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="#f1eee4"/><stop offset="1" stop-color="#c8c3b6"/>
    </linearGradient>
    <pattern id="${id}-weave" width="5" height="5" patternUnits="userSpaceOnUse">
      <path d="M0 1h5M1 0v5" stroke="#fff" stroke-width=".45" opacity=".2"/>
      <path d="M0 4h5" stroke="#24231d" stroke-width=".35" opacity=".13"/>
    </pattern>
    <pattern id="${id}-rib" width="7" height="5" patternUnits="userSpaceOnUse">
      <path d="M1 0v5" stroke="#24231d" stroke-width="1.2" opacity=".15"/>
      <path d="M3 0v5" stroke="#fff" stroke-width="1.2" opacity=".22"/>
    </pattern>
    <filter id="${id}-shadow" x="-.35" y="-.25" width="1.7" height="1.65">
      <feDropShadow dx="1" dy="14" stdDeviation="11" flood-color="#4b463c" flood-opacity=".13"/>
    </filter>
  </defs>`;
}

function shirt(id, color, detail) {
  const body =
    'M192 97 149 109 106 134 48 315 94 337 151 223 148 451Q192 473 250 463Q307 473 351 451L349 224 406 337 452 315 394 134 351 109 308 97Q250 115 192 97Z';
  const buttons = [194, 233, 272, 311, 350, 389, 428]
    .map(
      (y) =>
        `<circle cx="252" cy="${y}" r="3.1" fill="#f6f0e3" stroke="${tint(color, -0.23)}" stroke-width=".8"/><path d="M251 ${y - 0.5}h2" stroke="#77756d" stroke-width=".65"/>`,
    )
    .join('');
  return `<g filter="url(#${id}-shadow)">
    <path d="${body}" fill="url(#${id}-cloth)" stroke="${tint(color, -0.15)}" stroke-width="1.2"/>
    ${detail ? `<path d="${body}" fill="url(#${id}-weave)" opacity=".6"/>` : ''}
    <path d="M191 99Q251 76 309 99L295 145 250 164 207 146Z" fill="${tint(color, -0.22)}"/>
    <path d="m194 97 55 32-26 48-43-47Z" fill="${tint(color, 0.09)}" stroke="${tint(color, -0.2)}" stroke-width="1.2"/>
    <path d="m306 97-56 32 27 48 43-47Z" fill="${tint(color, 0.14)}" stroke="${tint(color, -0.2)}" stroke-width="1.2"/>
    <path d="M244 150v307h15V151" fill="${tint(color, 0.03)}" stroke="${tint(color, -0.15)}" stroke-width="1"/>
    <path d="m51 302 48 22-7 19-49-23Zm350 22 48-22 8 18-49 23Z" fill="${tint(color, -0.03)}" stroke="${tint(color, -0.19)}" stroke-width="1"/>
    ${
      detail
        ? `<path d="M283 194h47v56q-21 18-47 0Z" fill="${tint(color, 0.025)}" stroke="${tint(color, -0.17)}" stroke-width="1.1"/>
      <path d="M286 200h41M155 155q7 38-4 71m194-71q-7 38 4 71M157 444q45 17 83 12m25 0q45 5 78-12" fill="none" stroke="${tint(color, -0.22)}" stroke-width="1" opacity=".65"/>
      <path d="m177 226-12 171 23 33-6-187Zm151 10 8 155-24 37 10-174Z" fill="url(#${id}-fold)" opacity=".8"/>
      <path d="m117 218-31 83m300-83 29 82" stroke="#fff" stroke-width="2" opacity=".13"/>
      ${buttons}`
        : ''
    }
  </g>`;
}

function knit(id, color, detail, tee = false) {
  const body = tee
    ? 'M197 111 147 122 70 170 100 248 152 230 150 451Q249 468 350 451L347 230 400 248 430 170 353 122 303 111Q250 143 197 111Z'
    : 'M194 103 145 117 111 140 56 353 110 369 151 245 146 445Q249 461 354 445L349 245 390 369 444 353 389 140 355 117 306 103Q250 131 194 103Z';
  return `<g filter="url(#${id}-shadow)">
    <path d="${body}" fill="url(#${id}-cloth)" stroke="${tint(color, -0.18)}" stroke-width="1.1"/>
    ${detail ? `<path d="${body}" fill="url(#${id}-${tee ? 'weave' : 'rib'})" opacity="${tee ? '.3' : '.6'}"/>` : ''}
    <path d="${tee ? 'M198 111Q250 154 303 111L296 125Q250 166 205 126Z' : 'M195 104Q250 139 305 104L307 119Q250 162 193 119Z'}" fill="${tint(color, -0.06)}" stroke="${tint(color, -0.22)}" stroke-width="1"/>
    <path d="M198 109Q250 148 302 109" fill="none" stroke="${tint(color, -0.3)}" stroke-width="4" opacity=".7"/>
    ${
      tee
        ? `<path d="M152 441q100 15 196 0M80 181l22 57m316-57-22 57" fill="none" stroke="${tint(color, -0.2)}" stroke-width="1"/>`
        : `<path d="m56 352 54 16-7 24-54-16Zm334 16 54-16 7 24-54 16ZM147 434Q250 449 353 434L354 460Q250 475 146 460Z" fill="${tint(color, -0.05)}" stroke="${tint(color, -0.17)}" stroke-width="1"/>
        <path d="m56 352 54 16-7 24-54-16Zm334 16 54-16 7 24-54 16ZM147 434Q250 449 353 434L354 460Q250 475 146 460Z" fill="url(#${id}-rib)"/>`
    }
    ${
      detail
        ? `<path d="M149 145q16 48 4 91m199-91q-17 48-5 91" fill="none" stroke="${tint(color, -0.19)}" stroke-width="1.3"/>
      <path d="m175 264-9 128 23 35-2-151Zm141 12 14 113-18 35-11-135Z" fill="url(#${id}-fold)"/>
      <path d="M202 122q46 28 96 0" fill="none" stroke="#fff" stroke-width="2" opacity=".3"/>`
        : ''
    }
  </g>`;
}

function jacket(id, color, detail, blazer = false) {
  const body =
    'M195 94 151 108 113 136 60 359 111 375 151 244 143 461Q188 474 245 466L251 444 257 466Q310 474 358 461L350 244 390 375 441 359 387 136 350 108 305 94Q250 113 195 94Z';
  const buttons = [259, 314, 369, 424]
    .map(
      (y) =>
        `<circle cx="257" cy="${y}" r="4.8" fill="${tint(color, -0.43)}" stroke="${tint(color, 0.06)}" stroke-width=".8"/>`,
    )
    .join('');
  return `<g filter="url(#${id}-shadow)">
    <path d="${body}" fill="url(#${id}-cloth)" stroke="${tint(color, -0.25)}" stroke-width="1.3"/>
    ${detail ? `<path d="${body}" fill="url(#${id}-weave)" opacity=".65"/>` : ''}
    <path d="M195 94Q250 81 305 94L288 162 250 201 213 162Z" fill="${tint(color, -0.3)}"/>
    ${
      blazer
        ? `<path d="m195 95 53 115-36 51-16-47-27-59 23-8-16-20Zm110 0-53 115 37 51 15-47 28-59-24-8 16-20Z" fill="${tint(color, 0.08)}" stroke="${tint(color, -0.22)}" stroke-width="1.2"/>
        <path d="m249 209-3 224-22 34m28-258 5 256" fill="none" stroke="${tint(color, -0.25)}" stroke-width="1.5"/>
        <path d="m175 329 52 4-1 15-53-4Zm104 4 50-4 2 15-52 4ZM281 215l41-5 1 9-41 5Z" fill="${tint(color, -0.04)}" stroke="${tint(color, -0.3)}" stroke-width="1"/>
        <circle cx="250" cy="317" r="5" fill="${tint(color, -0.55)}"/><circle cx="250" cy="368" r="5" fill="${tint(color, -0.55)}"/>`
        : `<path d="m195 94 54 39-33 52-40-55Zm110 0-55 39 33 52 41-55Z" fill="${tint(color, 0.08)}" stroke="${tint(color, -0.3)}" stroke-width="1.2"/>
        <path d="M246 152v312h20V162" fill="${tint(color, -0.035)}" stroke="${tint(color, -0.23)}" stroke-width="1.1"/>
        <path d="M174 200h48v56q-24 16-48 0Zm109 0h46v56q-23 16-46 0ZM165 325h61v91q-30 12-61 0Zm112 0h61v91q-30 12-61 0Z" fill="${tint(color, 0.025)}" stroke="${tint(color, -0.24)}" stroke-width="1.3"/>
        <path d="M173 200h50v14l-25 10-25-10Zm109 0h48v14l-24 10-24-10Z" fill="${tint(color, -0.02)}" stroke="${tint(color, -0.26)}" stroke-width="1.1"/>
        <circle cx="198" cy="213" r="3.6" fill="${tint(color, -0.45)}"/><circle cx="306" cy="213" r="3.6" fill="${tint(color, -0.45)}"/>
        ${buttons}`
    }
    <path d="m61 349 52 16-7 25-53-16Zm328 16 51-16 8 25-52 16Z" fill="${tint(color, -0.08)}" stroke="${tint(color, -0.22)}" stroke-width="1.1"/>
    ${
      detail
        ? `<path d="M155 146q11 50-5 93m195-93q-12 50 5 93M151 453q38 12 87 6m24 1q49 5 87-7" fill="none" stroke="${tint(color, -0.28)}" stroke-width="1"/>
      <path d="m132 230-35 101m272-101 36 101" fill="none" stroke="#fff" stroke-width="3" opacity=".07"/>`
        : ''
    }
  </g>`;
}

function trousers(id, color, detail, denim = false) {
  const body =
    'M151 75Q251 60 350 75L368 212 349 512Q310 525 270 515L253 285 246 285 229 515Q187 525 147 512L132 213Z';
  const seam = denim ? '#c4ad85' : tint(color, -0.25);
  return `<g filter="url(#${id}-shadow)">
    <path d="${body}" fill="url(#${id}-cloth)" stroke="${tint(color, -0.24)}" stroke-width="1.2"/>
    ${detail ? `<path d="${body}" fill="url(#${id}-weave)" opacity=".7"/>` : ''}
    <path d="M152 75Q249 60 349 75L352 100Q248 85 148 100Z" fill="${tint(color, -0.07)}" stroke="${seam}" stroke-width="1"/>
    <path d="M249 95v130q26-4 26-23V96" fill="${tint(color, -0.025)}" stroke="${seam}" stroke-width="1.2"/>
    <circle cx="258" cy="84" r="4.6" fill="${denim ? '#b3a18b' : tint(color, -0.45)}" stroke="#55544b" stroke-width=".7"/>
    ${
      denim
        ? `<path d="M152 108h52q-2 64-61 68M346 108h-51q2 64 61 68" fill="none" stroke="${seam}" stroke-width="1.4"/>
        <path d="M164 108h30v30h-34" fill="none" stroke="${seam}" stroke-width="1.2"/>
        <circle cx="204" cy="110" r="2.4" fill="#b8a185"/><circle cx="296" cy="110" r="2.4" fill="#b8a185"/>
        <path d="M148 497q38 10 82 2l-1 17q-42 9-82-3Zm122 2q40 8 79-2v16q-40 11-79 3Z" fill="${tint(color, -0.13)}" stroke="${seam}" stroke-width="1.1"/>`
        : `<path d="M185 100q-14 53-44 78m173-78q16 52 43 78" fill="none" stroke="${seam}" stroke-width="1.4"/>
        <path d="m214 101-17 166-6 221m99-387 12 166 7 220" fill="none" stroke="${tint(color, -0.22)}" stroke-width="1.2" opacity=".8"/>
        <path d="m216 104-15 153-5 231m96-384 14 153 6 231" fill="none" stroke="#fff" stroke-width="2.2" opacity=".18"/>
        <path d="M148 504q38 10 81 1m42 0q39 9 78-1" fill="none" stroke="${seam}" stroke-width="1"/>`
    }
    ${
      detail
        ? `<path d="M177 71v31h9V70m134 1v31h9V72" fill="${tint(color, -0.035)}" stroke="${seam}" stroke-width="1"/>
      <path d="M249 225v52q-19 19-35 24m39-24q20 19 35 24M139 204l16 283m205-283-16 282" fill="none" stroke="${seam}" stroke-width="1" opacity=".7"/>
      <path d="m165 232 9 226 16 36 11-271Zm137-9 12 271 14-36 10-226Z" fill="url(#${id}-fold)" opacity=".6"/>
      ${denim ? `<path d="m157 214 57 13m-55 2 40 9m86-13 63-12m-57 24 53-9" fill="none" stroke="#d8d5c4" stroke-width="4" opacity=".07"/>` : ''}`
        : ''
    }
  </g>`;
}

function sneakerUnit(id, color, detail) {
  return `<path d="M67 342q4-39 19-89l56 13q22-12 36-38l47 11q36 20 65 42l83 37q34 10 47 35l-7 29q-166 17-346-3Z" fill="url(#${id}-cloth)" stroke="${tint(color, -0.3)}" stroke-width="1.3"/>
    <path d="M68 342q178 25 352 11l-1 30q-171 28-354-2Z" fill="url(#${id}-sole)" stroke="#bbb8aa" stroke-width="1.3"/>
    <path d="M69 369q171 28 346 4M80 380l-1-10m9 11-1-10m10 11-1-10m10 11-1-10m10 11-1-10m257 6 1-10m10 9 1-10m10 8 1-10m10 7 1-10" fill="none" stroke="#bcb8aa" stroke-width="1"/>
    <path d="m90 253 51 13 25-20q-3 20-14 37l-49-5Z" fill="${tint(color, -0.24)}"/>
    <path d="M91 257q-15 54-14 83l51 7q-1-43 22-67" fill="${tint(color, -0.07)}" stroke="${tint(color, -0.25)}" stroke-width="1.3"/>
    <path d="m166 254 21-24 47 12 55 40-31 23Z" fill="${tint(color, 0.12)}" stroke="${tint(color, -0.24)}" stroke-width="1"/>
    <path d="m151 282 40-19 70 46 54 7-14 28-161 2Z" fill="${tint(color, -0.025)}" stroke="${tint(color, -0.22)}" stroke-width="1.2"/>
    <path d="M307 311q72 5 96 39l-102 2q-2-25 6-41Z" fill="${tint(color, 0.08)}" stroke="${tint(color, -0.18)}" stroke-width="1.2"/>
    ${
      detail
        ? `<path d="m189 269 41-9m-29 18 43-9m-28 18 43-9m-27 19 43-9" stroke="#e9e7dd" stroke-width="5" stroke-linecap="round"/>
      <path d="m189 268 41-9m-29 18 43-9m-28 18 43-9m-27 19 43-9" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>
      <path d="m144 332 19-35 28-8m106 54q5-22 13-26M81 334l41 6" fill="none" stroke="${tint(color, -0.3)}" stroke-width=".8" stroke-dasharray="2 3"/>
      <path d="m187 308 14 1m-8 9 14 1m-8 9 14 1" stroke="${tint(color, -0.2)}" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>
      <path d="M327 326q27 1 45 17" fill="none" stroke="#fff" stroke-width="3" opacity=".3"/>`
        : ''
    }`;
}

function loaferUnit(id, color, detail) {
  return `<path d="M77 325q-2-36 18-79 35 15 65-12l44-31q27 12 46 37l66 53q64-3 87 35 19 32-16 46-121 25-276-3l-38-13Z" fill="${tint(color, -0.57)}" stroke="#37332c" stroke-width="1.3"/>
    <path d="M80 318q-2-36 18-76 32 15 61-13l43-32q27 13 46 39l63 50q66-2 88 35 21 33-18 43-128 21-267-3l-37-16Z" fill="url(#${id}-leather)" stroke="${tint(color, -0.4)}" stroke-width="1.4"/>
    <path d="M100 244q35 9 62-16l37-24 33 31-74 63-57-18Z" fill="${tint(color, -0.55)}"/>
    <path d="M111 251q28 2 51-18l34-22 26 24-67 54-47-15Z" fill="#9b7c59"/>
    <path d="m111 267 39 4 50-46 28 16-47 54-39 22-37-11Z" fill="${tint(color, -0.34)}"/>
    <path d="M178 296q30-39 67-51l64 42q61 0 78 33 19 25-20 32-77 14-147-2l-56-17Z" fill="url(#${id}-leather)" stroke="${tint(color, 0.2)}" stroke-width="1.8"/>
    <path d="m177 278 35-33 88 62-21 30Z" fill="${tint(color, -0.03)}" stroke="${tint(color, -0.38)}" stroke-width="1.3"/>
    <path d="m213 276 29 18 11 10-31-16Z" fill="${tint(color, -0.65)}"/>
    ${
      detail
        ? `<path d="M182 302q24-35 64-43l63 40q48-3 66 24 13 15-16 21-70 12-133-1l-49-14" fill="none" stroke="${tint(color, 0.37)}" stroke-width=".9" stroke-dasharray="2 3" opacity=".7"/>
      <path d="M82 342q157 43 303 14" fill="none" stroke="#ab9576" stroke-width="1.1" stroke-dasharray="2 3"/>
      <path d="M285 310q53-10 71 17M90 299l7-31" fill="none" stroke="#fff" stroke-width="5" opacity=".08" stroke-linecap="round"/>
      <path d="m104 363-1 11 53 9 1-10" fill="${tint(color, -0.65)}"/>`
        : ''
    }`;
}

function shoes(id, color, detail, loafer = false) {
  const unit = loafer ? loaferUnit(id, color, detail) : sneakerUnit(id, color, detail);
  return `<g filter="url(#${id}-shadow)">
    <g transform="translate(56 -71) rotate(-12 250 300) scale(.87)" opacity=".91">${unit}</g>
    <g transform="translate(-13 76) rotate(8 250 300)">${unit}</g>
  </g>`;
}

function unknownGarment(id) {
  return `<g filter="url(#${id}-shadow)">
    <ellipse cx="250" cy="385" rx="121" ry="7" fill="#7c7366" opacity=".05"/>
    <path d="M250 259v-31q-30-1-30-25c0-20 24-32 41-21 15 10 15 26 2 37" fill="none" stroke="#a19685" stroke-width="7" stroke-linecap="round"/>
    <path d="M249 251 107 332q-11 7-8 18t18 12h266q15-1 18-12t-8-18l-142-81-1 16 133 77H117l133-77Z" fill="#c5b296" stroke="#af9b7f" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="m113 334 136-77m3 0 136 77M116 349h266" fill="none" stroke="#e3d5bf" stroke-width="2" opacity=".8" stroke-linecap="round"/>
    <path d="M225 199q5-15 19-16" fill="none" stroke="#eee8dc" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;
}

function illustration(item, id, detail = true) {
  const kind = category(item);
  const color = colorFor(item, kind);
  const shape =
    kind === 'knit' || kind === 'tee'
      ? knit(id, color, detail, kind === 'tee')
      : kind === 'jacket' || kind === 'blazer'
        ? jacket(id, color, detail, kind === 'blazer')
        : kind === 'denim' || kind === 'trouser'
          ? trousers(id, color, detail, kind === 'denim')
          : kind === 'loafer' || kind === 'sneaker'
            ? shoes(id, color, detail, kind === 'loafer')
            : kind === 'shirt'
              ? shirt(id, color, detail)
              : unknownGarment(id);
  return definitions(id, color) + shape;
}

/** Item fields only choose predefined geometry and colors; they never enter markup. */
export function garmentSVG(item = {}, options = {}) {
  const className = ownString(options, 'className');
  const detail =
    isRecord(options) && Object.hasOwn(options, 'detail') && typeof options.detail === 'boolean'
      ? options.detail
      : true;
  const id = `wn-garment-${++illustrationId}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 600" class="${escapeAttribute(className)}" aria-hidden="true" focusable="false">
    ${illustration(item || {}, id, detail)}
  </svg>`;
}

/** A warm, editorial still life for the wardrobe introduction. */
export function wardrobeSceneSVG() {
  const id = `wn-wardrobe-${++illustrationId}`;
  const pieces = [
    { x: 11, y: 96, scale: 0.7, rotate: -5, item: { kind: 'jacket', color: 'olive' } },
    { x: 139, y: 102, scale: 0.7, rotate: -2, item: { kind: 'shirt', color: 'white' } },
    { x: 279, y: 104, scale: 0.7, rotate: 3, item: { kind: 'shirt', color: 'blue' } },
    { x: 427, y: 110, scale: 0.68, rotate: 5, item: { kind: 'knit', color: 'ivory' } },
  ];
  const garments = pieces
    .map(
      (
        piece,
        index,
      ) => `<g transform="translate(${piece.x} ${piece.y}) scale(${piece.scale}) rotate(${piece.rotate} 250 100)">
    <path d="M250 89V61q-25-2-17-20 8-15 22-9 12 6 3 19" fill="none" stroke="#847666" stroke-width="3.8" stroke-linecap="round"/>
    <path d="m250 75-93 56q92 16 185 0Z" fill="none" stroke="#b99870" stroke-width="10" stroke-linejoin="round"/>
    ${illustration(piece.item, `${id}-${index}`, true)}
  </g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 660" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}-wall" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0eae0"/><stop offset="1" stop-color="#ded7c9"/></linearGradient>
      <linearGradient id="${id}-wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cdb798"/><stop offset="1" stop-color="#aa8d6c"/></linearGradient>
      <radialGradient id="${id}-light" cx=".18" cy=".06" r=".95"><stop stop-color="#fff" stop-opacity=".65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <filter id="${id}-floor-shadow"><feGaussianBlur stdDeviation="13"/></filter>
    </defs>
    <path fill="url(#${id}-wall)" d="M0 0h1000v660H0Z"/>
    <path fill="url(#${id}-light)" d="M0 0h1000v660H0Z"/>
    <path d="M760 0h240v660H760Z" fill="#b9b2a6" opacity=".12"/>
    <path d="m787 0 8 660m63-660 8 660m63-660 8 660" stroke="#f9f5ec" stroke-width="2" opacity=".35"/>
    <path d="M0 581h1000v79H0Z" fill="#d6cdbd"/>
    <path d="M0 581h1000" stroke="#c0b6a4" stroke-width="2"/>
    <ellipse cx="481" cy="595" rx="403" ry="22" fill="#675d4c" opacity=".14" filter="url(#${id}-floor-shadow)"/>
    <path d="M87 587V103q0-27 28-27h637q28 0 28 27v484" fill="none" stroke="#7c7667" stroke-width="8"/>
    <path d="M94 580V105q0-20 21-20h637q20 0 20 20v475" fill="none" stroke="#f2ebdc" stroke-width="2" opacity=".7"/>
    <path d="M82 125h703" stroke="#928571" stroke-width="7"/>
    <path d="M85 123h695" stroke="#d7c8b2" stroke-width="2"/>
    ${garments}
    <path d="M102 499h665v16H102Z" fill="url(#${id}-wood)"/>
    <path d="M103 499h663" stroke="#dfcdb0" stroke-width="2"/>
    <path d="M130 514v72m610-72v72" stroke="#9f896a" stroke-width="8"/>
    ${definitions(`${id}-shoes`, COLORS.white)}
    <g filter="url(#${id}-shoes-shadow)">
      <g transform="translate(177 308) scale(.48) rotate(-6 250 300)">${sneakerUnit(`${id}-shoes`, COLORS.white, true)}</g>
      <g transform="translate(116 304) scale(.51)">${sneakerUnit(`${id}-shoes`, COLORS.white, true)}</g>
    </g>
    <g transform="translate(457 470)">
      <path d="M0 0q80-8 159-1l3 24H-2Z" fill="#55647a"/>
      <path d="M0 3q80 9 159 0m-7-2 2 20M6 3l-1 18" fill="none" stroke="#a1a5a9" stroke-width="1" opacity=".65"/>
      <path d="M9-21q64-8 144 0l2 21H6Z" fill="#d4c5aa"/>
      <path d="M10-17q67 5 142 1M17-19l-1 16" fill="none" stroke="#ab9677" stroke-width="1.3"/>
    </g>
    <g transform="translate(834 369)">
      <path d="M0 101h79l-9 109H11Z" fill="#e8dfcf" stroke="#c7bba6"/>
      <ellipse cx="39" cy="102" rx="39" ry="8" fill="#b3a187"/>
      <path d="M39 105 35-21m4 103 32-76M37 67 4 12m33 26 23-75" fill="none" stroke="#64715b" stroke-width="4"/>
      <path d="M34 17Q-5-20 13-48 42-44 34 17ZM41 53Q58-12 92-10 100 23 41 53ZM35 77Q-13 45-10 16 26 15 35 77ZM47-9Q36-48 58-65 79-41 47-9Z" fill="#7d896e"/>
      <path d="M34 17 15-41m26 94 43-55M35 77-5 23" fill="none" stroke="#a5ad92" stroke-width="1.3" opacity=".6"/>
    </g>
    <path d="M0 0h1000v660H0Z" fill="#e9e3d4" opacity=".035"/>
  </svg>`;
}

/** Compose a compact flat lay from the same illustrations used by product cards. */
export function outfitSVG(items = []) {
  const id = `wn-outfit-${++illustrationId}`;
  const selected = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, 4);
  const positions =
    selected.length <= 2
      ? [
          [-35, 10, 0.66],
          [192, 73, 0.63],
        ]
      : [
          [-45, -5, 0.65],
          [181, 38, 0.63],
          [76, 218, 0.55],
          [279, 273, 0.39],
        ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 620" aria-hidden="true" focusable="false">
    ${selected
      .map((item, index) => {
        const [x, y, scale] = positions[index];
        return `<g transform="translate(${x} ${y}) scale(${scale})">${illustration(item, `${id}-${index}`)}</g>`;
      })
      .join('')}
  </svg>`;
}
