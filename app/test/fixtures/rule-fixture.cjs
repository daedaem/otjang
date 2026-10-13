// Synthetic rule fixture ONLY: explicit assumed confirmation and year-round seasons.
// Never writes source JSON or upgrades a real owner's draft. This separates scoring regression from readiness tests.
const SEASONS = ['봄', '여름', '가을', '겨울'];
module.exports = (items) => items.map((it) => Object.assign({}, it, { attrSource: 'owner-confirmed', seasons: it.seasons && it.seasons.length ? it.seasons.slice() : SEASONS.slice() }));
