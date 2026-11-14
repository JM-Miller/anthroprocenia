// Names and population figures for the unit icons on the map. A unit is named for the city it most likely came from
// and the formation it belongs to ("The Second Roma Slingers", "The First Roma Centuria"), using each civilization's
// own formation words where known. Population figures divide the estimated population of the world at the viewed
// year among everything on the map, with a very slight deterministic variation per icon.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth',
  'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'];

// Unit sub-categories; the recorded category code is 0 military, 1 naval, 2 civilian/other, 3 air.
export function unitSubcategory(typeKey, category) {
  const key = String(typeKey || '').toUpperCase().replace(/^UNIT_/, '');
  if (category === 1) return 'naval';
  if (category === 3) return 'air';
  if (/COMMANDER|GENERAL|ADMIRAL|MARSHAL/.test(key)) return 'commander';
  if (/SETTLER|COLONIST/.test(key)) return 'settler';
  if (/BUILDER|WORKER|ENGINEER/.test(key) && category !== 0) return 'builder';
  if (/MERCHANT|TRADER|CARAVAN|TREASURE/.test(key)) return 'merchant';
  if (/MISSIONARY|PRIEST|MONK|PILGRIM|APOSTLE/.test(key)) return 'religious';
  if (/SCOUT|EXPLORER|RANGER/.test(key)) return 'scout';
  if (category === 2) return /ALIM|ANTIQUARIAN|HUMBOLDT|GREAT/.test(key) ? 'great' : 'civilian';
  if (/CATAPULT|TREBUCHET|BALLISTA|CANNON|ARTILLERY|MORTAR|SIEGE|^RAM|BOMBARD|ROCKET|MLRS|HOWITZER/.test(key)) return 'siege';
  if (/TANK|ARMOR|MECH|PANZER/.test(key)) return 'armor';
  if (/HORSE|CHARIOT|KNIGHT|CAVALRY|LANCER|HUSSAR|CAMEL|ELEPHANT|CATAPHRACT|DRAGOON|MAMLUK|SIPAHI|COSSACK|RIDER|KESHIK/.test(key)) return 'cavalry';
  if (/ARCHER|BOW|SLING|CROSSBOW|ARQUEBUS|SKIRMISH|MARKSMAN|SHARPSHOOTER|JAVELIN|PELTAST|CHAKRAM/.test(key)) return 'ranged';
  return 'infantry';
}

const FORMATIONS = {
  infantry: ['Company', 'Regiment', 'Battalion', 'Warband', 'Spears', 'Levy', 'Line Infantry'],
  ranged: ['Skirmishers', 'Marksmen', 'Bowmen', 'Shooters', 'Company of Shot'],
  cavalry: ['Horse', 'Riders', 'Troop', 'Squadron', 'Cavalry'],
  siege: ['Battery', 'Siege Train', 'Engineers', 'Artillery Park'],
  armor: ['Armored Brigade', 'Tank Corps', 'Armored Column'],
  naval: ['Squadron', 'Fleet', 'Flotilla', 'Naval Division'],
  air: ['Wing', 'Squadron', 'Flight', 'Air Group'],
  commander: ['Staff', 'Retinue', 'High Command', 'Standard'],
  scout: ['Scouts', 'Pathfinders', 'Vanguard'],
  settler: ['Colonists', 'Settlers', 'Founders', 'Pioneers'],
  builder: ['Work Gang', 'Builders', 'Labor Levy', 'Laborers'],
  merchant: ['Caravan', 'Trading Company', 'Merchants'],
  religious: ['Missionaries', 'Pilgrims', 'Brethren', 'Clergy'],
  great: ['Circle', 'Entourage', 'Followers'],
  civilian: ['Company', 'Party', 'Band'],
};

// Native formation words by civilization: infantry | ranged | cavalry | naval. Blank entries use the English lists.
const LEXICON_ROWS = {
  ROME: 'Centuria|Sagittarii|Ala|Classis',
  GREECE: 'Lochos|Psiloi|Hippeis|Stolos',
  EGYPT: 'Mesha|Pedjtyu|Wereret|',
  PERSIA: 'Hazarabam|Kamanvar|Asabari|',
  HAN: 'Bu|Nu|Qi|Lou Chuan',
  MAURYA: 'Patti|Dhanurdhara|Ashvaroha|Nau',
  MONGOLIA: 'Arban|Zuun|Mingghan|',
  CHOLA: 'Padai|Villalar|Kudirai|Kappal',
  ABBASID: 'Jund|Rumat|Fursan|Ustul',
  MING: 'Wei|Gongshou|Qi|',
  QING: 'Niru|Niru|Morin|',
  NORMAN: 'Conroi|Arbalestiers|Chevaliers|Flotte',
  SPAIN: 'Tercio|Arcabuceros|Caballeria|Armada',
  FRENCHEMPIRE: 'Regiment|Tirailleurs|Cavalerie|Escadre',
  ENGLAND: 'Retinue|Longbowmen|Lances|Fleet',
  GREATBRITAIN: 'Regiment|Rifles|Dragoons|Squadron',
  PRUSSIA: 'Regiment|Jaeger|Husaren|Geschwader',
  RUSSIA: 'Polk|Strelsy|Sotnia|Flotilia',
  OTTOMANS: 'Orta|Azab|Sipahi|Donanma',
  MEIJI: 'Rentai|Tai|Kiheitai|Kantai',
  HEIAN: 'Tsuwamono|Yumi|Kiba|Fune',
  SENGOKU: 'Ashigaru|Teppo|Kiba|Suigun',
  JOSEON: 'Yeongo|Gungsu|Gibyeong|Sugun',
  GORYEO: 'Yeongo|Gungsu|Gibyeong|Sugun',
  SILLA: 'Yeongo|Gungsu|Gibyeong|Sugun',
  INCA: 'Waranqa|Pachaka||',
  DAIVIET: 'Quan|Cung Thu|Ky Binh|Thuy Quan',
  MEXICO: 'Batallon|Rifles|Dragones|Flotilla',
  AMERICA: 'Regiment|Rangers|Dragoons|Fleet',
  MUGHAL: 'Jamaat|Tirandaz|Sawar|Bahri',
  QAJAR: 'Fowj|Tofangchi|Savar|',
  ICELAND: 'Lid|Bogmenn|Riddarar|Floti',
};
LEXICON_ROWS.FRENCH = LEXICON_ROWS.FRANCE = LEXICON_ROWS.FRENCHEMPIRE;
const LEXICON_KEYS = ['infantry', 'ranged', 'cavalry', 'naval'];
const LEXICON = {};
for (const [civ, row] of Object.entries(LEXICON_ROWS)) {
  LEXICON[civ] = {};
  row.split('|').forEach((word, i) => { if (word) LEXICON[civ][LEXICON_KEYS[i]] = word; });
}
export const UNIT_LEXICON_CIVS = Object.keys(LEXICON);

export function pluralize(name) {
  const word = String(name || '').trim();
  if (!word) return word;
  if (/man$/i.test(word)) return word.replace(/man$/i, 'men');
  if (/(s|x|z|ch|sh)$/i.test(word)) return /s$/i.test(word) ? word : `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

const PATTERNS = ['The {o} {c} {f}', 'The {o} {c} {f}', 'The {c} {f}', '{c}\'s {o} {f}'];

function tidy(text) { return text.replace(/\s{2,}/g, ' ').trim(); }

function buildUnitName(civKey, unit, origin, seed) {
  const sub = unit.subcategory || unitSubcategory(unit.typeKey, unit.category);
  const lexicon = LEXICON[civKey] || {};
  const formations = (FORMATIONS[sub] || FORMATIONS.civilian).slice();
  const native = lexicon[sub];
  const plural = pluralize(unit.base || 'Unit');
  const pool = [plural, plural, ...formations];
  if (native) pool.push(native, native, native);
  const formation = pool[hash(`${seed}|f`) % pool.length];
  const ordinal = ORDINALS[hash(`${seed}|o`) % ORDINALS.length];
  const pattern = PATTERNS[hash(`${seed}|p`) % PATTERNS.length];
  const city = origin || '';
  const name = pattern.replace('{o}', ordinal).replace('{c}', city).replace('{f}', formation);
  return tidy(name.replace(/^(The )?'s\s+/, '$1').replace(/^The\s+The\s+/i, 'The '));
}

function roman(n) {
  let out = '';
  for (const [value, symbol] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= value) { out += symbol; n -= value; }
  return out;
}

// units: [{ typeKey, base, category }]; origin: name of the owner's nearest settlement ('' when none).
// Returns one unique name per unit.
export function unitNamesForTile(civKey, tileIndex, units, origin) {
  const used = new Set(), names = [];
  units.forEach((unit, slot) => {
    const seedBase = `${civKey}|${tileIndex}|${unit.typeKey}|${slot}`;
    let name = '';
    for (let attempt = 0; attempt < 48 && !name; attempt++) {
      const candidate = buildUnitName(civKey, unit, origin, `${seedBase}|${attempt}`);
      if (!used.has(candidate)) name = candidate;
    }
    if (!name) {
      const first = buildUnitName(civKey, unit, origin, `${seedBase}|0`);
      for (let n = 2; !name; n++) if (!used.has(`${first} ${roman(n)}`)) name = `${first} ${roman(n)}`;
    }
    used.add(name);
    names.push(name);
  });
  return names;
}

// Estimated world population by year (negative = BCE), after common historical estimates (HYDE / McEvedy-Jones).
const WORLD_POPULATION = [
  [-10000, 4e6], [-5000, 5e6], [-3000, 14e6], [-2000, 27e6], [-1000, 50e6], [-500, 100e6], [1, 200e6], [500, 210e6],
  [1000, 310e6], [1500, 500e6], [1700, 600e6], [1800, 990e6], [1900, 1.65e9], [1950, 2.5e9], [1975, 4.1e9], [2000, 6.1e9],
  [2025, 8.2e9], [2100, 10.2e9],
];

export function estimatedWorldPopulation(year) {
  const table = WORLD_POPULATION, y = Number.isFinite(year) ? year : 1;
  if (y <= table[0][0]) return table[0][1];
  if (y >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    if (y > table[i][0]) continue;
    const [y0, p0] = table[i - 1], [y1, p1] = table[i], t = (y - y0) / (y1 - y0);
    return Math.exp(Math.log(p0) + (Math.log(p1) - Math.log(p0)) * t);
  }
  return table[table.length - 1][1];
}

// "4000 BCE", "1200 AD", "AD 1200", "Spring 500 BC", "1,200" -> signed year, or null when no year can be read.
export function parseGameYear(text) {
  const s = String(text || '');
  const match = s.match(/(\d[\d,]*)/);
  if (!match) return null;
  const year = parseInt(match[1].replace(/,/g, ''), 10);
  if (!Number.isFinite(year)) return null;
  return /\bB\.?\s?C\.?(?:E\.?)?\b/i.test(s) ? -year : year;
}

export function iconPopulation(worldPopulation, entityCount, seed, scale = 1) {
  const share = worldPopulation / Math.max(1, entityCount) * scale;
  const wobble = ((hash(`${seed}|pop`) % 2001) - 1000) / 1000 * 0.015;
  return Math.max(1, Math.round(share * (1 + wobble)));
}

// How many shares of the world's people each kind of icon gets: most people live in towns and cities (above all on a settlement's
// centre tile, and as its specialists), few out on the improvements, and armies and wonders sit between.
export const POPULATION_WEIGHTS = { center: 4, urban: 2.2, specialist: 2.5, wonder: 1.5, unit: 0.5, improvement: 0.2 };
export function populationWeight(kind) {
  return POPULATION_WEIGHTS[kind] ?? 1;
}
// A steady per-icon spread (about 0.6x to 1.7x), so neighbouring homes of the same kind differ visibly in size.
export function populationVariation(seed) {
  const u = (hash(`${seed}|spread`) % 10000) / 10000;
  return Math.exp((u - 0.5) * 1.05);
}

// A pillaged constructible keeps only a quarter of its people.
export const PILLAGED_FACTOR = 0.25;
// A unit's population follows its health directly, and grows with any strength bonus (promotions, commanders...) it has.
export function unitPopulationFactor(healthPercent, bonusPercent) {
  const health = Math.max(0, Math.min(100, Number.isFinite(healthPercent) ? healthPercent : 100)) / 100;
  return Math.max(0.02, health) * (1 + Math.max(0, Number(bonusPercent) || 0) / 100);
}
// A settlement whose constructibles are pillaged loses up to half of its people (and its constructibles' share of them).
export function settlementDamageFactor(damaged, total) {
  return total > 0 ? 1 - 0.5 * Math.min(1, Math.max(0, damaged) / total) : 1;
}

export function formatCount(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
