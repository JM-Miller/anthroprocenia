// Compact, pure encoders for what Map View saves alongside the save game (the Population Panel's people and the
// townscape layouts and placements), plus a write queue that spreads the writes out so they never stall a frame.
// Nothing here touches the game or the DOM.

export const COORD_SCALE = 2000;          // layout coordinates are in units of a town's radius; 1/2000 is far below a pixel
export const MAX_RECORD_CHARS = 600000;   // a single saved record larger than this is skipped (it is rebuilt on demand instead)
export const MAX_STORED_FRAMES = 64;      // how many turns of panel / placement records are kept; older ones are rebuilt on demand
export const MAX_LIBRARY_ENTRIES = 8;
export const MAX_PLACEMENTS_PER_FRAME = 300;

const q = value => Math.round(value * COORD_SCALE);
const uq = value => value / COORD_SCALE;

// ---- polylines as delta-coded integers -----------------------------------------------------------------------------
export function packPoints(points) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of points) { const ix = q(x), iy = q(y); out.push(ix - px, iy - py); px = ix; py = iy; }
  return out;
}
export function unpackPoints(flat) {
  const out = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([uq(x), uq(y)]); }
  return out;
}

const SHAPE_KEYS = ['streets', 'mainStreets', 'walls', 'fires', 'accents', 'water', 'pools', 'fields', 'parks', 'plazas', 'tents'];

// A generated townscape layout (see generateTownscape) as a small JSON-able object.
export function encodeShapes(shapes) {
  const forms = [], formIndex = new Map(), classes = [], classIndex = new Map();
  const intern = (list, map, value) => { if (!map.has(value)) { map.set(value, list.length); list.push(value); } return map.get(value); };
  const lines = {};
  for (const key of SHAPE_KEYS) lines[key] = (shapes[key] || []).map(packPoints);
  return {
    v: 1, l: lines, f: forms, c: classes,
    b: shapes.buildings.map(b => [intern(classes, classIndex, b.cls), intern(forms, formIndex, b.form), packPoints(b.poly), (b.parts || []).map(packPoints), (b.detail || []).map(packPoints)]),
    n: packPoints(shapes.nodes || []), e: (shapes.edges || []).flat(), p: shapes.people || 0,
  };
}
export function decodeShapes(data) {
  if (!data || data.v !== 1 || !data.l || !Array.isArray(data.b)) return null;
  const shapes = { buildings: [], nodes: unpackPoints(data.n || []), edges: [], people: data.p || 0 };
  for (const key of SHAPE_KEYS) shapes[key] = (data.l[key] || []).map(unpackPoints);
  for (const [c, f, poly, parts, detail] of data.b) {
    shapes.buildings.push({ cls: data.c[c], form: data.f[f], poly: unpackPoints(poly), parts: (parts || []).map(unpackPoints), detail: (detail || []).map(unpackPoints) });
  }
  for (let i = 0; i + 1 < (data.e || []).length; i += 2) shapes.edges.push([data.e[i], data.e[i + 1]]);
  return shapes;
}

// ---- which buildings, tents and fields of a layout survived the map's obstacles ---------------------------------------
export function encodeMask(flags) {
  let out = '';
  for (let i = 0; i < flags.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4 && i + b < flags.length; b++) if (flags[i + b]) nibble |= 1 << b;
    out += nibble.toString(16);
  }
  return out;
}
export function decodeMask(text, count) {
  const out = new Array(count).fill(false);
  if (typeof text !== 'string' || text.length < Math.ceil(count / 4)) return null;
  for (let i = 0; i < count; i++) out[i] = (parseInt(text[i >> 2], 16) >> (i & 3) & 1) === 1;
  return out;
}

// One townscape's placement for one turn: its layout key, size, the map layout it was worked out against, and masks of
// what was kept. `counts` guards against a layout that has since been regenerated with a different size.
export function encodePlacement(placement) {
  return {
    g: placement.geoKey, r: Math.round(placement.radiusHex * 10000), s: placement.signature,
    n: [placement.buildings.length, placement.tents.length, placement.fields.length, placement.parks.length],
    m: [encodeMask(placement.buildings), encodeMask(placement.tents), encodeMask(placement.fields), encodeMask(placement.parks)],
  };
}
// Returns { buildings, tents, fields, parks } boolean arrays when the record still fits this layout, else null.
export function decodePlacement(record, geoKey, radiusHex, signature, counts) {
  if (!record || record.g !== geoKey || record.s !== signature || !Array.isArray(record.n) || !Array.isArray(record.m)) return null;
  if (Math.abs(record.r / 10000 - radiusHex) > 0.0005) return null;
  for (let i = 0; i < 4; i++) if (record.n[i] !== counts[i]) return null;
  const buildings = decodeMask(record.m[0], counts[0]), tents = decodeMask(record.m[1], counts[1]);
  const fields = decodeMask(record.m[2], counts[2]), parks = decodeMask(record.m[3], counts[3]);
  return buildings && tents && fields && parks ? { buildings, tents, fields, parks } : null;
}

// ---- the Population Panel's people --------------------------------------------------------------------------------------
const ICON_KINDS = ['building', 'unit', 'wonder', 'specialist'];

// entries: [{ civ: { id, name }, continent: { id, name }, tile: { index, name }, icon: { id, name, kind, population, owner, category, unit, group: { id, name } } }]
// meta: { signature, owners: [[owner, civKey, religion]], era: [age, lvl] }
export function encodePanelFrame(entries, meta) {
  const civs = [], civIndex = new Map(), continents = [], contIndex = new Map(), tiles = [], tileIndex = new Map(), strings = [], stringIndex = new Map();
  const intern = (list, map, key, value) => { if (!map.has(key)) { map.set(key, list.length); list.push(value); } return map.get(key); };
  const text = value => intern(strings, stringIndex, value, value);
  const rows = entries.map(entry => {
    const icon = entry.icon;
    return [
      intern(civs, civIndex, entry.civ.id, [entry.civ.id, entry.civ.name]),
      intern(continents, contIndex, entry.continent.id, [entry.continent.id, entry.continent.name]),
      intern(tiles, tileIndex, entry.tile.index, [entry.tile.index, entry.tile.name]),
      icon.id, icon.name, Math.max(0, ICON_KINDS.indexOf(icon.kind)), Math.floor(icon.population) || 0, icon.owner,
      text(icon.category || ''), icon.unit ? text(icon.unit.sub || '') : -1, icon.unit ? text(icon.unit.base || '') : -1,
      icon.group ? text(icon.group.id || '') : -1, icon.group ? text(icon.group.name || '') : -1,
    ];
  });
  return { v: 2, sig: meta.signature, o: meta.owners, e: meta.era, s: strings, c: civs, k: continents, t: tiles, r: rows };
}
export function decodePanelFrame(data) {
  if (!data || (data.v !== 1 && data.v !== 2) || !Array.isArray(data.r) || !Array.isArray(data.s)) return null;
  const entries = [];
  for (const row of data.r) {
    const [civ, continent, tile, id, name, kind, population, owner, category, unitSub, unitBase, groupId = -1, groupName = -1] = row;
    const c = data.c[civ], k = data.k[continent], t = data.t[tile];
    if (!c || !k || !t) return null;
    const icon = { id, name, kind: ICON_KINDS[kind] || 'building', population, owner, category: data.s[category] || '', unit: unitSub >= 0 ? { sub: data.s[unitSub] || '', base: data.s[unitBase] || '' } : null };
    if (groupId >= 0) icon.group = { id: data.s[groupId] || '', name: data.s[groupName] || '' };
    entries.push({ civ: { id: c[0], name: c[1] }, continent: { id: k[0], name: k[1] }, tile: { index: t[0], name: t[1] }, icon });
  }
  return { signature: data.sig, owners: data.o || [], era: data.e || [0, 1], entries };
}

// ---- people as ids -----------------------------------------------------------------------------------------------------------
// A person ({ first, last, traits: [a, b] }, see personRecord) packs into one integer below 2^36, written in base 36 (at most
// seven characters). Their home is not repeated per person: people are stored in lists under their home's tile and icon.
export const NAME_ID_LIMIT = 4096;
export const TRAIT_ID_LIMIT = 64;
const clampId = (value, limit) => Math.max(0, Math.min(limit - 1, Math.floor(Number(value) || 0)));
export function packPerson(record) {
  const traits = record.traits || [];
  return ((clampId(record.first, NAME_ID_LIMIT) * NAME_ID_LIMIT + clampId(record.last, NAME_ID_LIMIT)) * TRAIT_ID_LIMIT
    + clampId(traits[0], TRAIT_ID_LIMIT)) * TRAIT_ID_LIMIT + clampId(traits[1], TRAIT_ID_LIMIT);
}
export function unpackPerson(value) {
  let n = Math.max(0, Math.floor(Number(value) || 0));
  const b = n % TRAIT_ID_LIMIT; n = Math.floor(n / TRAIT_ID_LIMIT);
  const a = n % TRAIT_ID_LIMIT; n = Math.floor(n / TRAIT_ID_LIMIT);
  const last = n % NAME_ID_LIMIT, first = Math.floor(n / NAME_ID_LIMIT) % NAME_ID_LIMIT;
  return { first, last, traits: [a, b] };
}
// homes: [{ tile, home, people: [record] }] where `home` is the Home Location's icon id on that tile. `version` is the name
// lists' version (NAME_LISTS_VERSION); a record written against other lists is not decoded.
export function encodePeople(homes, version) {
  return { v: 1, n: version, h: homes.map(h => [h.tile, h.home, h.people.map(p => packPerson(p).toString(36)).join('.')]) };
}
export function decodePeople(data, version) {
  if (!data || data.v !== 1 || data.n !== version || !Array.isArray(data.h)) return null;
  const homes = [];
  for (const row of data.h) {
    if (!Array.isArray(row) || typeof row[2] !== 'string') return null;
    const people = row[2] ? row[2].split('.').map(token => unpackPerson(parseInt(token, 36))) : [];
    homes.push({ tile: row[0], home: row[1], people });
  }
  return homes;
}

// ---- keeping the number of saved records bounded -----------------------------------------------------------------------
// `index` is a list of record keys in the order they were saved. Returns the keys that should be blanked.
export function trackRecord(index, key, limit = MAX_STORED_FRAMES) {
  const at = index.indexOf(key);
  if (at >= 0) index.splice(at, 1);
  index.push(key);
  return index.length > limit ? index.splice(0, index.length - limit) : [];
}

// ---- spreading the writes out ---------------------------------------------------------------------------------------------
// enqueue(key, produce) schedules `write(key, produce())` after `delay` ms (coalescing repeats of the same key, and producing the
// value only when it is due); due writes run one per tick so no single frame pays for several large JSON stringifies.
export function createWriteQueue(write, { delay = 3000, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) } = {}) {
  const pending = new Map();
  let timer = 0;
  const arm = ms => { if (!timer) timer = schedule(tick, ms); };
  function tick() {
    timer = 0;
    const t = now();
    let nextDue = Infinity;
    for (const [key, job] of pending) {
      if (job.due <= t) { pending.delete(key); run(key, job); break; }
      nextDue = Math.min(nextDue, job.due);
    }
    if (pending.size) {
      nextDue = Infinity;
      for (const job of pending.values()) nextDue = Math.min(nextDue, job.due);
      arm(Math.max(0, nextDue - now()) + 1);
    }
  }
  function run(key, job) {
    try { const value = job.produce(); if (value != null) write(key, value); }
    catch (e) { if (queue.onError) queue.onError(key, e); }
  }
  const queue = {
    onError: null,
    enqueue(key, produce, wait = delay) {
      pending.set(key, { produce, due: now() + wait });
      arm(wait + 1);
    },
    get size() { return pending.size; },
    // Everything now (used when the game is about to save).
    flush() {
      if (timer) { cancel(timer); timer = 0; }
      for (let round = 0; round < 4 && pending.size; round++) {
        const jobs = [...pending];
        pending.clear();
        for (const [key, job] of jobs) run(key, job);
      }
    },
    clear() { if (timer) { cancel(timer); timer = 0; } pending.clear(); },
  };
  return queue;
}
