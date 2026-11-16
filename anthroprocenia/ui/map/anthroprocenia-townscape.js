// Procedural layouts that decorate the map when it is zoomed in extremely far: a town or city for a constructible,
// an encampment for a unit (or battle lines for a unit in battle). Layouts live in a unit disc (radius ~1, a few
// features reach past it) and are deterministic for a given seed.
//
// Scale: one map tile is 100 miles across; each townscape's nominal diameter is 10 miles.
// Culture picks the street plan, house, monument and wall styles and a few signature features; the age (antiquity,
// exploration, modern) and how far into it the game is (early / middle / late) decide what has been built: palisades
// and huts, then stone walls and temples, then aqueducts and amphitheatres; castles, cathedrals and star forts; then
// factories, railways and skyscrapers.

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 0 for a hamlet (hundreds of people) up to 1 for a great city (millions).
export function townscapeScale(population) {
  return clamp((Math.log10(Math.max(10, Number(population) || 10)) - 2) / 4, 0, 1);
}

const AGES = ['ANTIQUITY', 'EXPLORATION', 'MODERN'];
// age: 0 antiquity, 1 exploration, 2 modern; lvl: 0 early, 1 middle, 2 late within it.
export function townEra(ageKey, turn = 1) {
  const age = Math.max(0, AGES.indexOf(String(ageKey || '').toUpperCase()));
  return { age, lvl: turn < 150 ? 0 : turn < 300 ? 1 : 2 };
}

export function townRadiusHex(population, era, kind) {
  return 0.05;
}

// plan | house | sacred | civic | wall | extras
const PROFILE_ROWS = {
  ROME: 'grid|rect|temple|hall|square|aqueduct,amphitheatre,plaza',
  GREECE: 'organic|rect|temple|hall|round|theatre,acropolis,market',
  EGYPT: 'linear|court|temple|palace|square|nile,obelisk,plaza',
  PERSIA: 'round|court|dome|palace|round|garden,qanat',
  ABBASID: 'round|court|dome|palace|round|garden,bazaar',
  ASSYRIA: 'round|court|ziggurat|palace|square|garden',
  BABYLON: 'grid|court|ziggurat|palace|square|garden',
  QAJAR: 'organic|court|dome|palace|square|garden,bazaar',
  HAN: 'grid|court|pagoda|tower|square|drum,canal',
  MING: 'grid|court|pagoda|palace|square|drum,canal',
  QING: 'grid|court|pagoda|palace|square|drum',
  MAURYA: 'grid|rect|stupa|hall|round|tank',
  CHOLA: 'mandala|rect|temple|hall|square|tank',
  KHMER: 'mandala|long|temple|palace|square|baray',
  MAJAPAHIT: 'mandala|long|temple|palace|square|tank',
  SIAM: 'organic|long|pagoda|palace|square|canal',
  DAIVIET: 'grid|rect|pagoda|hall|square|canal',
  NEPAL: 'organic|rect|stupa|palace|none|plaza,market',
  MAYA: 'mandala|round|pyramid|palace|none|ballcourt,causeway',
  INCA: 'terrace|rect|temple|palace|none|terraces,causeway',
  MISSISSIPPIAN: 'ring|round|mound|hall|palisade|plaza',
  SHAWNEE: 'ring|long|mound|hall|palisade|plaza',
  HAWAII: 'organic|long|shrine|hall|none|fishpond',
  TONGA: 'organic|long|mound|hall|none|plaza',
  BUGANDA: 'ring|round|shrine|palace|palisade|plaza',
  SONGHAI: 'organic|court|dome|palace|square|bazaar',
  CARTHAGE: 'round|court|temple|hall|round|cothon,market',
  AKSUM: 'organic|rect|stele|palace|none|stelae',
  GAUL: 'ring|round|shrine|hall|palisade|oppidum',
  MONGOLIA: 'ring|round|shrine|hall|none|',
  NORMAN: 'radial|rect|church|hall|round|castle,market,moat',
  ENGLAND: 'radial|rect|church|hall|round|castle,market',
  FRENCHEMPIRE: 'radial|court|church|palace|round|market',
  GREATBRITAIN: 'organic|rect|church|hall|none|market',
  PRUSSIA: 'grid|rect|church|palace|square|barracks',
  SPAIN: 'grid|court|church|palace|square|plaza',
  MEXICO: 'grid|court|church|palace|none|plaza',
  AMERICA: 'grid|rect|church|hall|none|market',
  RUSSIA: 'radial|long|dome|palace|round|kremlin',
  BULGARIA: 'radial|rect|church|hall|round|castle',
  ICELAND: 'linear|long|shrine|hall|none|',
  OTTOMANS: 'organic|court|dome|palace|square|bazaar',
  MUGHAL: 'grid|court|dome|palace|square|garden',
  MEIJI: 'grid|rect|shrine|hall|none|canal',
  HEIAN: 'grid|rect|shrine|palace|none|canal',
  SENGOKU: 'radial|rect|shrine|castle|round|moat',
  JOSEON: 'organic|rect|pagoda|palace|square|',
  GORYEO: 'organic|rect|pagoda|palace|square|',
  SILLA: 'organic|rect|pagoda|palace|square|',
  PIRATEREPUBLIC: 'organic|rect|shrine|hall|none|market',
};
PROFILE_ROWS.FRENCH = PROFILE_ROWS.FRANCE = PROFILE_ROWS.FRENCHEMPIRE;
const PROFILES = {};
for (const [civ, row] of Object.entries(PROFILE_ROWS)) {
  const [plan, house, sacred, civic, wall, extras] = row.split('|');
  PROFILES[civ] = { plan, house, sacred, civic, wall, extras: extras ? extras.split(',') : [] };
}
const DEFAULT_PROFILE = { plan: 'organic', house: 'rect', sacred: 'shrine', civic: 'hall', wall: 'palisade', extras: [] };
const BASTION_CIVS = new Set(['ENGLAND', 'FRENCHEMPIRE', 'FRENCH', 'FRANCE', 'PRUSSIA', 'SPAIN', 'RUSSIA', 'BULGARIA', 'OTTOMANS', 'NORMAN']);
const ROUND_CAMP = new Set(['MONGOLIA', 'SHAWNEE', 'MISSISSIPPIAN', 'HAWAII', 'TONGA', 'BUGANDA', 'SONGHAI', 'GAUL']);
const ROW_CAMP = new Set(['ROME', 'HAN', 'MING', 'QING', 'PERSIA', 'MAURYA', 'PRUSSIA', 'GREATBRITAIN', 'AMERICA', 'FRENCHEMPIRE', 'FRENCH', 'RUSSIA', 'MEIJI']);
const EXTRA_LEVEL = { plaza: 0, castle: 0, moat: 0, aqueduct: 2, market: 1, causeway: 1 };

export function townLayoutStyle(civKey) {
  const profile = PROFILES[civKey];
  return profile ? profile.plan : 'organic';
}
export const TOWN_CLASSES = ['house', 'civic', 'sacred', 'industry', 'military', 'store'];
export const TOWNSCAPE_CIVS = Object.keys(PROFILES);

// ---- geometry helpers -------------------------------------------------------------------------------------------
function rotate(points, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}
function local(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
}
const box = (L, lx, ly, w, h) => [[lx - w / 2, ly - h / 2], [lx + w / 2, ly - h / 2], [lx + w / 2, ly + h / 2], [lx - w / 2, ly + h / 2]].map(([px, py]) => L(px, py));
const disc = (L, lx, ly, r, n = 12) => Array.from({ length: n }, (_, i) => L(lx + Math.cos(i / n * TAU) * r, ly + Math.sin(i / n * TAU) * r));
const closedLine = pts => pts.concat([pts[0]]);
function ringLine(radius, steps = 36, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < steps; i++) out.push([cx + Math.cos(i / steps * TAU) * radius, cy + Math.sin(i / steps * TAU) * radius]);
  return out;
}
function arcLine(radius, from, to, steps = 14, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i <= steps; i++) { const a = from + (to - from) * i / steps; out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]); }
  return out;
}
function triangle(cx, cy, size) { return [[cx, cy - size], [cx + size * 0.85, cy + size * 0.7], [cx - size * 0.85, cy + size * 0.7]]; }
function plainBox(cx, cy, w, h, a = 0) { return box(local(cx, cy, a), 0, 0, w, h); }

// Building forms in local coordinates (L maps them to the layout); each returns { poly, parts?, detail? }. `poly` is the
// convex footprint used for collisions and picking, `parts` extra filled pieces, `detail` strokes drawn on top.
const FORMS = {
  rect: (L, w, h) => ({ poly: box(L, 0, 0, w, h) }),
  court: (L, w, h) => ({ poly: box(L, 0, 0, w, h), detail: [closedLine(box(L, 0, 0, w * 0.5, h * 0.5))] }),
  long: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.5, h * 0.65) }),
  hut: (L, w, h) => ({ poly: disc(L, 0, 0, Math.min(w, h) * 0.5, 9) }),
  temple: (L, w, h) => {
    const W = w * 1.3, lines = [];
    for (let i = 0; i < 5; i++) {
      const lx = -W / 2 + W * (i + 0.5) / 5;
      lines.push([L(lx, -h * 0.5), L(lx, -h * 0.28)], [L(lx, h * 0.28), L(lx, h * 0.5)]);
    }
    return { poly: box(L, 0, 0, W, h), detail: lines };
  },
  ziggurat: (L, w) => ({ poly: box(L, 0, 0, w, w), detail: [0.75, 0.5, 0.25].map(f => closedLine(box(L, 0, 0, w * f, w * f))) }),
  pyramid: (L, w) => ({ poly: box(L, 0, 0, w, w), detail: [0.8, 0.6, 0.4, 0.2].map(f => closedLine(box(L, 0, 0, w * f, w * f))).concat([[L(-w / 2, 0), L(w / 2, 0)], [L(0, -w / 2), L(0, w / 2)]]) }),
  stupa: (L, w) => ({ poly: disc(L, 0, 0, w * 0.5, 14), detail: [closedLine(disc(L, 0, 0, w * 0.32, 12)), closedLine(disc(L, 0, 0, w * 0.1, 8))] }),
  pagoda: (L, w) => ({ poly: box(L, 0, 0, w * 0.8, w * 0.8), detail: [0.6, 0.35].map(f => closedLine(box(L, 0, 0, w * 0.8 * f, w * 0.8 * f))).concat([[L(-w * 0.4, -w * 0.4), L(w * 0.4, w * 0.4)], [L(-w * 0.4, w * 0.4), L(w * 0.4, -w * 0.4)]]) }),
  dome: (L, w) => ({ poly: disc(L, 0, 0, w * 0.5, 14), parts: [box(L, w * 0.75, -w * 0.3, w * 0.12, w * 0.12)], detail: [closedLine(disc(L, 0, 0, w * 0.3, 12))] }),
  church: (L, w, h) => ({ poly: box(L, 0, 0, w * 0.5, h * 1.3), parts: [box(L, 0, -h * 0.25, w, h * 0.4)], detail: [[L(0, -h * 0.65), L(0, h * 0.65)]] }),
  mound: (L, w) => ({ poly: disc(L, 0, 0, w * 0.55, 12), detail: [closedLine(disc(L, 0, 0, w * 0.38, 10)), closedLine(disc(L, 0, 0, w * 0.2, 8))] }),
  shrine: (L, w, h) => ({ poly: box(L, 0, 0, w * 0.6, h * 0.5), detail: [[L(-w * 0.3, h * 0.55), L(-w * 0.3, h * 0.8)], [L(w * 0.3, h * 0.55), L(w * 0.3, h * 0.8)], [L(-w * 0.4, h * 0.62), L(w * 0.4, h * 0.62)]] }),
  stele: (L, w, h) => ({ poly: box(L, 0, 0, w * 0.16, h * 0.6) }),
  hall: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.2, h * 0.8), detail: [[L(-w * 0.6, 0), L(w * 0.6, 0)]] }),
  palace: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.5, h * 1.2), detail: [closedLine(box(L, -w * 0.35, 0, w * 0.5, h * 0.55)), closedLine(box(L, w * 0.35, 0, w * 0.5, h * 0.55))] }),
  amphitheatre: (L, w) => ({ poly: disc(L, 0, 0, w * 0.7, 18), detail: [closedLine(disc(L, 0, 0, w * 0.45, 14))] }),
  theatre: (L, w) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 8; pts.push(L(Math.cos(a) * w * 0.6, Math.sin(a) * w * 0.6)); }
    const inner = [];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 8; inner.push(L(Math.cos(a) * w * 0.35, Math.sin(a) * w * 0.35)); }
    return { poly: pts, detail: [inner] };
  },
  tower: (L, w) => ({ poly: box(L, 0, 0, w * 0.36, w * 0.36), detail: [[L(-w * 0.18, -w * 0.18), L(w * 0.18, w * 0.18)], [L(-w * 0.18, w * 0.18), L(w * 0.18, -w * 0.18)]] }),
  castle: (L, w) => ({ poly: box(L, 0, 0, w * 0.9, w * 0.9), parts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => box(L, sx * w * 0.45, sy * w * 0.45, w * 0.26, w * 0.26)), detail: [closedLine(box(L, 0, 0, w * 0.4, w * 0.4))] }),
  bazaar: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.8, h * 0.45), detail: [-0.6, -0.2, 0.2, 0.6].map(f => [L(w * 0.9 * f, -h * 0.225), L(w * 0.9 * f, h * 0.225)]) }),
  factory: (L, w, h) => {
    const zig = [];
    for (let i = 0; i <= 6; i++) zig.push(L(-w * 0.7 + w * 1.4 * i / 6, i % 2 ? h * 0.2 : -h * 0.2));
    return { poly: box(L, 0, 0, w * 1.4, h * 0.7), parts: [box(L, w * 0.55, -h * 0.55, w * 0.12, w * 0.12)], detail: [zig] };
  },
  skyscraper: (L, w) => ({ poly: box(L, 0, 0, w * 0.5, w * 0.5), detail: [closedLine(box(L, 0, 0, w * 0.3, w * 0.3))] }),
  warehouse: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.2, h * 0.6), detail: [[L(-w * 0.6, -h * 0.3), L(w * 0.6, h * 0.3)]] }),
  granary: (L, w) => ({ poly: disc(L, 0, 0, w * 0.32, 10) }),
  barracks: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.5, h * 0.5), detail: [[L(-w * 0.75, 0), L(w * 0.75, 0)]] }),
  windmill: (L, w) => ({ poly: disc(L, 0, 0, w * 0.2, 8), detail: [[L(-w * 0.5, 0), L(w * 0.5, 0)], [L(0, -w * 0.5), L(0, w * 0.5)]] }),
  ballcourt: (L, w, h) => ({ poly: box(L, 0, 0, w * 1.5, h * 0.4), parts: [box(L, -w * 0.7, 0, w * 0.3, h * 0.9), box(L, w * 0.7, 0, w * 0.3, h * 0.9)] }),
  stall: (L, w) => ({ poly: box(L, 0, 0, w * 0.2, w * 0.2) }),
  wagon: (L, w) => ({ poly: box(L, 0, 0, w * 0.34, w * 0.2) }),
  command: (L, w) => ({ poly: box(L, 0, 0, w * 0.4, w * 0.3), detail: [[L(-w * 0.2, 0), L(w * 0.2, 0)]] }),
  block: (L, w, h) => ({ poly: box(L, 0, 0, w, h * 0.55) }),
};
const FORM_CLASS = {
  rect: 'house', court: 'house', long: 'house', hut: 'house',
  temple: 'sacred', ziggurat: 'sacred', pyramid: 'sacred', stupa: 'sacred', pagoda: 'sacred', dome: 'sacred', church: 'sacred', mound: 'sacred', shrine: 'sacred', stele: 'sacred',
  hall: 'civic', palace: 'civic', amphitheatre: 'civic', theatre: 'civic', bazaar: 'civic', skyscraper: 'civic', ballcourt: 'civic',
  tower: 'military', castle: 'military', barracks: 'military', command: 'military', block: 'military',
  factory: 'industry', warehouse: 'store', granary: 'store', windmill: 'store', stall: 'store', wagon: 'store',
};
const HOUSE_FORMS = { rect: 'rect', court: 'court', long: 'long', round: 'hut' };

function emptyShapes() {
  return {
    streets: [], mainStreets: [], buildings: [], walls: [], tents: [], fires: [], accents: [], water: [], pools: [], fields: [], parks: [], plazas: [],
    nodes: [], edges: [], people: 0,
  };
}

function addBuilding(c, form, lot, scale = 1) {
  const L = local(lot.x, lot.y, lot.a || 0), built = FORMS[form](L, lot.w * scale, lot.h * scale);
  c.shapes.buildings.push({ poly: built.poly, cls: FORM_CLASS[form], form, parts: built.parts || [], detail: built.detail || [] });
}
function node(c, x, y) { c.shapes.nodes.push([x, y]); return c.shapes.nodes.length - 1; }
function link(c, a, b) { if (a !== b && a >= 0 && b >= 0) c.shapes.edges.push([a, b]); }

// ---- street plans (each fills streets, graph nodes/edges and lots) --------------------------------------------------
function planGrid(c) {
  const { rand, t, age } = c, s = c.shapes;
  const blocks = clamp(2 + Math.round(t * 3), 2, 5), half = 0.8, step = half / blocks;
  const tilt = ['AMERICA', 'MEXICO', 'SPAIN'].includes(c.civKey) ? (rand() - 0.5) * 0.3 : 0;
  const R = (x, y) => rotate([[x, y]], tilt)[0];
  const id = [];
  for (let i = -blocks; i <= blocks; i++) { id.push([]); for (let j = -blocks; j <= blocks; j++) { const [x, y] = R(i * step, j * step); id[i + blocks].push(node(c, x, y)); } }
  for (let i = 0; i <= 2 * blocks; i++) for (let j = 0; j <= 2 * blocks; j++) { if (i < 2 * blocks) link(c, id[i][j], id[i + 1][j]); if (j < 2 * blocks) link(c, id[i][j], id[i][j + 1]); }
  for (let k = -blocks; k <= blocks; k++) {
    const list = k === 0 ? s.mainStreets : s.streets;
    list.push(rotate([[k * step, -half], [k * step, half]], tilt));
    list.push(rotate([[-half, k * step], [half, k * step]], tilt));
  }
  s.plazas.push(rotate(plainBox(0, 0, step * 1.7, step * 1.7), tilt));
  const dense = age === 2 ? 0.8 : 0.5 + 0.1 * t;
  for (let bx = -blocks; bx < blocks; bx++) for (let by = -blocks; by < blocks; by++) {
    const cx = bx * step + step / 2, cy = by * step + step / 2;
    if (Math.abs(cx) < step * 1.05 && Math.abs(cy) < step * 1.05 && blocks > 2 && !(bx === 0 && by === 0)) continue;
    if (rand() > dense && !(bx === 0 && by === 0)) continue;
    const [x, y] = R(cx + (rand() - 0.5) * step * 0.15, cy + (rand() - 0.5) * step * 0.15);
    c.lots.push({ x, y, w: step * 0.55, h: step * 0.55, a: tilt, r: Math.hypot(cx, cy) / half });
  }
  c.extent = half + 0.06; c.wallShape = 'square'; c.tilt = tilt;
}

function planRadial(c, fixedSpokes) {
  const { rand, t } = c, s = c.shapes;
  const rings = 2 + Math.round(t * 2), spokes = fixedSpokes || 5 + Math.round(t * 3), outer = 0.9, gap = outer / rings, phase = rand() * TAU;
  const center = node(c, 0, 0), grid = [];
  for (let k = 1; k <= rings; k++) {
    const radius = gap * k - gap * 0.5, row = [];
    for (let sp = 0; sp < spokes; sp++) { const a = phase + sp / spokes * TAU; row.push(node(c, Math.cos(a) * radius, Math.sin(a) * radius)); }
    grid.push(row);
    s.streets.push(closedLine(ringLine(radius, 30)));
    for (let sp = 0; sp < spokes; sp++) { link(c, row[sp], row[(sp + 1) % spokes]); if (k > 1) link(c, grid[k - 2][sp], row[sp]); else link(c, center, row[sp]); }
  }
  for (let sp = 0; sp < spokes; sp++) { const a = phase + sp / spokes * TAU; (sp < 2 ? s.mainStreets : s.streets).push([[0, 0], [Math.cos(a) * outer, Math.sin(a) * outer]]); }
  s.plazas.push(ringLine(gap * 0.4, 16));
  const width = 0.09 - t * 0.03;
  c.lots.push({ x: 0, y: 0, w: width * 1.6, h: width * 1.6, a: phase, r: 0 });
  for (let k = 1; k <= rings; k++) {
    const radius = gap * k - gap * 0.5 - gap * 0.28, count = Math.max(3, Math.round(TAU * radius / (width * 2.8)));
    for (let i = 0; i < count; i++) {
      const a = phase + i / count * TAU;
      let nearSpoke = false;
      for (let sp = 0; sp < spokes; sp++) if (Math.abs(((a - phase - sp / spokes * TAU) % TAU + TAU * 1.5) % TAU - Math.PI) > Math.PI - 0.14) nearSpoke = true;
      if (nearSpoke || rand() < 0.22) continue;
      c.lots.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius, w: width * 0.9, h: gap * 0.36, a: a + Math.PI / 2, r: radius / outer });
    }
  }
  c.extent = 0.97; c.wallShape = 'round';
}

function planOrganic(c) {
  const { rand, t } = c, s = c.shapes, streetCount = 2 + Math.round(t * 2), directions = [], chains = [];
  for (let k = 0; k < streetCount; k++) {
    const a = rand() * Math.PI, phase = rand() * 6.28, amplitude = 0.08 + rand() * 0.1, pts = [], ids = [];
    for (let i = 0; i <= 14; i++) {
      const sv = -0.95 + 1.9 * i / 14, wobble = amplitude * Math.sin(sv * 3 + phase);
      const p = [sv * Math.cos(a) - wobble * Math.sin(a), sv * Math.sin(a) + wobble * Math.cos(a)];
      pts.push(p); ids.push(node(c, p[0], p[1]));
    }
    for (let i = 0; i < ids.length - 1; i++) link(c, ids[i], ids[i + 1]);
    (k === 0 ? s.mainStreets : s.streets).push(pts);
    directions.push(a); chains.push(ids);
  }
  for (let a = 0; a < chains.length; a++) for (let b = a + 1; b < chains.length; b++) {
    let best = null, bestD = 0.2;
    for (const i of chains[a]) for (const j of chains[b]) { const d = Math.hypot(s.nodes[i][0] - s.nodes[j][0], s.nodes[i][1] - s.nodes[j][1]); if (d < bestD) { bestD = d; best = [i, j]; } }
    if (best) link(c, best[0], best[1]);
  }
  s.plazas.push(ringLine(0.2, 14));
  const wanted = Math.round(8 + t * 40), spacing = 1.9 / Math.sqrt(wanted + 6), placed = [];
  for (let tries = 0; tries < wanted * 14 && placed.length < wanted; tries++) {
    const r = Math.sqrt(rand()) * 0.9, a = rand() * TAU, x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < spacing)) continue;
    placed.push([x, y]);
    const size = spacing * (0.42 + rand() * 0.2), base = directions[Math.floor(rand() * directions.length)] || 0;
    c.lots.push({ x, y, w: size * (1 + rand() * 0.4), h: size, a: base + (rand() - 0.5) * 0.9, r });
  }
  c.extent = 0.95; c.wallShape = 'round';
}

function planLinear(c) {
  const { rand, t } = c, s = c.shapes, angle = rand() * Math.PI, L = local(0, 0, angle);
  c.angle = angle;
  const ids = [];
  for (let i = 0; i <= 12; i++) { const sv = -0.95 + 1.9 * i / 12; const [x, y] = L(sv, Math.sin(sv * 3) * 0.04); ids.push(node(c, x, y)); }
  for (let i = 0; i < 12; i++) link(c, ids[i], ids[i + 1]);
  s.mainStreets.push(ids.map(i => s.nodes[i]));
  for (const offset of [0.3, -0.3]) {
    const row = [];
    for (let i = 0; i <= 12; i += 2) { const sv = -0.9 + 1.8 * i / 12; const [x, y] = L(sv, offset); row.push(node(c, x, y)); }
    for (let i = 0; i < row.length - 1; i++) link(c, row[i], row[i + 1]);
    for (let i = 0; i < row.length; i++) link(c, row[i], ids[i * 2]);
    s.streets.push(row.map(i => s.nodes[i]));
  }
  s.plazas.push(plainBox(0, 0, 0.3, 0.2, angle));
  const rows = [[0.14, 0.05], [-0.14, 0.05], [0.44, 0.1], [-0.44, 0.1]];
  const spacing = 0.34 - t * 0.12;
  for (const [offset, jitter] of rows) for (let sv = -0.85; sv <= 0.85; sv += spacing) {
    const [x, y] = L(sv + (rand() - 0.5) * jitter, offset + (rand() - 0.5) * jitter);
    c.lots.push({ x, y, w: spacing * 0.7, h: 0.16, a: angle, r: Math.hypot(sv, offset) });
  }
  c.extent = 0.95; c.wallShape = 'square'; c.tilt = angle;
}

function planMandala(c) {
  const { rand, t } = c, s = c.shapes, rings = [0.3, 0.6, 0.9], tilt = 0;
  const center = node(c, 0, 0), ringNodes = [];
  for (const r of rings) {
    s.streets.push(closedLine([[-r, -r], [r, -r], [r, r], [-r, r]]));
    const pts = [[-r, -r], [0, -r], [r, -r], [r, 0], [r, r], [0, r], [-r, r], [-r, 0]].map(([x, y]) => node(c, x, y));
    for (let i = 0; i < pts.length; i++) link(c, pts[i], pts[(i + 1) % pts.length]);
    ringNodes.push(pts);
  }
  for (let q = 0; q < 4; q++) { link(c, center, ringNodes[0][1 + q * 2]); for (let k = 0; k < 2; k++) link(c, ringNodes[k][1 + q * 2], ringNodes[k + 1][1 + q * 2]); }
  s.mainStreets.push([[-0.9, 0], [0.9, 0]], [[0, -0.9], [0, 0.9]]);
  s.plazas.push(plainBox(0, 0, 0.22, 0.22));
  c.lots.push({ x: 0, y: 0, w: 0.34, h: 0.34, a: 0, r: 0 });
  rings.forEach((r, k) => {
    const per = Math.round(5 + k * 3 + t * 3);
    for (let i = 0; i < per * 4; i++) {
      const side = Math.floor(i / per), f = ((i % per) + 0.5) / per * 2 - 1;
      const inset = r - 0.07;
      const p = side === 0 ? [f * inset, -inset] : side === 1 ? [inset, f * inset] : side === 2 ? [-f * inset, inset] : [-inset, -f * inset];
      if (Math.abs(f) < 0.12) continue;
      c.lots.push({ x: p[0], y: p[1], w: 0.13, h: 0.09, a: side % 2 === 0 ? 0 : Math.PI / 2, r: r / 0.9 });
    }
  });
  c.extent = 0.98; c.wallShape = 'square'; c.tilt = tilt + rand() * 0;
}

function planTerrace(c) {
  const { rand, t } = c, s = c.shapes, mid = rand() * TAU, rows = [];
  for (let k = 1; k <= 4; k++) {
    const r = 0.22 * k, ids = [];
    s.streets.push(arcLine(r, mid - 1.3, mid + 1.3, 16));
    for (let i = 0; i <= 8; i++) { const a = mid - 1.3 + 2.6 * i / 8; ids.push(node(c, Math.cos(a) * r, Math.sin(a) * r)); }
    for (let i = 0; i < ids.length - 1; i++) link(c, ids[i], ids[i + 1]);
    rows.push(ids);
    const per = Math.round(4 + k * 1.5 + t * 3);
    for (let i = 0; i < per; i++) {
      const a = mid - 1.15 + 2.3 * (i + 0.5) / per;
      c.lots.push({ x: Math.cos(a) * (r - 0.06), y: Math.sin(a) * (r - 0.06), w: 0.12, h: 0.07, a: a + Math.PI / 2, r: r / 0.9 });
    }
  }
  for (let k = 0; k < rows.length - 1; k++) for (const i of [2, 6]) link(c, rows[k][i], rows[k + 1][i]);
  s.mainStreets.push([[Math.cos(mid) * 0.1, Math.sin(mid) * 0.1], [Math.cos(mid) * 0.9, Math.sin(mid) * 0.9]]);
  c.lots.push({ x: Math.cos(mid) * 0.1, y: Math.sin(mid) * 0.1, w: 0.2, h: 0.2, a: mid, r: 0 });
  c.extent = 0.95; c.wallShape = 'round';
}

function planRing(c) {
  const { rand, t } = c, s = c.shapes, phase = rand() * TAU, center = node(c, 0, 0);
  s.plazas.push(ringLine(0.28, 18));
  const rings = t > 0.5 ? [0.55, 0.85] : [0.6];
  rings.forEach((r, k) => {
    const count = Math.round(5 + k * 5 + t * 4), ids = [];
    for (let i = 0; i < count; i++) {
      const a = phase + i / count * TAU + k * 0.2;
      ids.push(node(c, Math.cos(a) * r, Math.sin(a) * r));
      c.lots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, w: 0.16, h: 0.16, a, r: r });
    }
    for (let i = 0; i < ids.length; i++) { link(c, ids[i], ids[(i + 1) % ids.length]); if (k === 0) link(c, center, ids[i]); }
    s.streets.push(closedLine(ringLine(r * 0.93, 30)));
  });
  c.lots.push({ x: 0, y: 0, w: 0.2, h: 0.2, a: 0, r: 0 });
  c.extent = 0.95; c.wallShape = 'round';
}

// ---- walls, fields, extras ---------------------------------------------------------------------------------------
function addWalls(c) {
  const { age, lvl, profile } = c, s = c.shapes, style = profile.wall;
  if (style === 'none' || age === 2 || (lvl === 0 && c.t < 0.18 && age === 0)) return;
  const radius = c.extent, kind = lvl === 0 && age === 0 ? 'palisade' : (age === 1 && lvl === 2 && BASTION_CIVS.has(c.civKey)) ? 'bastion' : style === 'palisade' ? 'palisade' : c.wallShape;
  if (kind === 'palisade') return;
  const tower = (x, y) => { if (lvl >= 1) s.buildings.push({ poly: plainBox(x, y, 0.07, 0.07), cls: 'military', form: 'tower', parts: [], detail: [] }); };
  if (kind === 'bastion') {
    const pts = [], n = 6;
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? radius - 0.05 : radius + 0.1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    s.walls.push(closedLine(pts));
    s.water.push(closedLine(ringLine(radius + 0.2, 36)));
  } else if (kind === 'square') {
    const tilt = c.tilt || 0, corners = rotate([[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]], tilt);
    s.walls.push(closedLine(corners));
    for (const [x, y] of corners) tower(x, y);
  } else {
    s.walls.push(closedLine(ringLine(radius, 40)));
    for (let i = 0; i < 40; i += 8) tower(Math.cos(i / 40 * TAU) * radius, Math.sin(i / 40 * TAU) * radius);
  }
}

function addFields(c) {
  if (c.age === 2 && c.lvl === 2) return;
  const { rand } = c, count = clamp(Math.round(((c.age === 2 ? 3 : 10) - 7 * c.t) * (c.style && c.style.fields || 1)), 2, 18), phase = rand() * TAU;
  for (let k = 0; k < count; k++) {
    const a = phase + k / count * TAU + (rand() - 0.5) * 0.4, r = c.extent + 0.14 + rand() * 0.12;
    c.shapes.fields.push(plainBox(Math.cos(a) * r, Math.sin(a) * r, 0.28, 0.12, a + Math.PI / 2));
  }
}

const EXTRAS = {
  aqueduct(c) {
    const a = c.rand() * TAU, line = [[Math.cos(a) * 1.3, Math.sin(a) * 1.3], [Math.cos(a) * 0.2, Math.sin(a) * 0.2]];
    c.shapes.accents.push(line);
    for (let i = 1; i < 16; i++) {
      const f = i / 16, x = line[0][0] + (line[1][0] - line[0][0]) * f, y = line[0][1] + (line[1][1] - line[0][1]) * f;
      c.shapes.accents.push([[x - Math.sin(a) * 0.025, y + Math.cos(a) * 0.025], [x + Math.sin(a) * 0.025, y - Math.cos(a) * 0.025]]);
    }
  },
  qanat(c) { EXTRAS.aqueduct(c); },
  garden(c) {
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) c.shapes.parks.push(plainBox(sx * 0.2, sy * 0.2, 0.15, 0.15));
    c.shapes.accents.push([[-0.4, 0], [0.4, 0]], [[0, -0.4], [0, 0.4]]);
  },
  baray(c) { const a = c.rand() * TAU, r = c.extent + 0.32; c.shapes.pools.push(plainBox(Math.cos(a) * r, Math.sin(a) * r, 0.5, 0.2, a)); },
  tank(c) { const a = c.rand() * TAU, r = c.extent + 0.28; c.shapes.pools.push(plainBox(Math.cos(a) * r, Math.sin(a) * r, 0.26, 0.26, a)); },
  canal(c) { const a = c.rand() * TAU; c.shapes.water.push(arcLine(c.extent + 0.1, a, a + 3.4, 24)); },
  nile(c) {
    const a = c.angle === undefined ? c.rand() * Math.PI : c.angle, L = local(0, 0, a), pts = [];
    for (let i = 0; i <= 16; i++) { const sv = -1.15 + 2.3 * i / 16; pts.push(L(sv, 0.66 + 0.05 * Math.sin(sv * 4))); }
    c.shapes.water.push(pts);
  },
  cothon(c) { const a = c.rand() * TAU; c.shapes.pools.push(ringLine(0.22, 18, Math.cos(a) * (c.extent + 0.28), Math.sin(a) * (c.extent + 0.28))); c.shapes.accents.push(arcLine(c.extent + 0.06, a - 0.4, a + 0.4, 8)); },
  terraces(c) { for (const r of [0.3, 0.5, 0.7]) c.shapes.accents.push(arcLine(r + 0.1, 0.3, 2.6, 16)); },
  oppidum(c) { c.shapes.walls.push(closedLine(ringLine(c.extent * 0.55, 32))); },
  moat(c) { c.shapes.water.push(closedLine(ringLine(c.extent + 0.12, 40))); },
  plaza(c) { c.shapes.plazas.push(ringLine(0.26, 16)); },
  market(c) {
    c.shapes.plazas.push(ringLine(0.3, 16));
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; addBuilding(c, 'stall', { x: Math.cos(a) * 0.22, y: Math.sin(a) * 0.22, w: 0.2, h: 0.2, a }); }
  },
  kremlin(c) {
    c.shapes.walls.push(closedLine(ringLine(0.46, 28)));
    for (let i = 0; i < 28; i += 7) c.shapes.buildings.push({ poly: plainBox(Math.cos(i / 28 * TAU) * 0.46, Math.sin(i / 28 * TAU) * 0.46, 0.07, 0.07), cls: 'military', form: 'tower', parts: [], detail: [] });
  },
  castle(c) {
    if (c.profile.civic === 'castle') return;
    const a = c.rand() * TAU, x = Math.cos(a) * c.extent * 0.6, y = Math.sin(a) * c.extent * 0.6;
    addBuilding(c, 'castle', { x, y, w: 0.3, h: 0.3, a }); c.shapes.water.push(closedLine(ringLine(0.26, 20, x, y)));
  },
  obelisk(c) { addBuilding(c, 'stele', { x: 0, y: 0, w: 0.2, h: 0.5, a: 0 }); },
  drum(c) { addBuilding(c, 'tower', { x: 0, y: 0, w: 0.3, h: 0.3, a: 0 }); },
  causeway(c) { const a = c.rand() * TAU; for (const o of [-0.012, 0.012]) c.shapes.accents.push([[Math.cos(a) * 0.15 - Math.sin(a) * o, Math.sin(a) * 0.15 + Math.cos(a) * o], [Math.cos(a) * 1.25 - Math.sin(a) * o, Math.sin(a) * 1.25 + Math.cos(a) * o]]); },
  acropolis(c) { for (const k of [0.28, 0.2, 0.12]) c.shapes.accents.push(closedLine(rotate(ringLine(k, 20), 0).map(([x, y]) => [x * 1.2 + 0.4, y - 0.3]))); },
  stelae(c) { for (let i = 0; i < 3; i++) addBuilding(c, 'stele', { x: -0.1 + i * 0.1, y: 0.18, w: 0.12, h: 0.35, a: 0 }); },
  fishpond(c) { const a = c.rand() * TAU; c.shapes.pools.push(ringLine(0.14, 14, Math.cos(a) * (c.extent + 0.25), Math.sin(a) * (c.extent + 0.25))); },
};

// Features that come with the age rather than the culture: rail and factories in the modern age, harbour works near
// water, and the coast and river the tile has.
function addTerrainAndAge(c, opts) {
  const { rand, age, lvl } = c, s = c.shapes;
  if (opts.coast) {
    const a = rand() * TAU;
    s.water.push(arcLine(1.05, a - 0.6, a + 0.6, 12));
    for (let i = 1; i < 6; i += 2) { const an = a - 0.6 + 1.2 * i / 6; s.accents.push([[Math.cos(an) * 1.05, Math.sin(an) * 1.05], [Math.cos(an) * 1.2, Math.sin(an) * 1.2]]); }
    s.pools.push(ringLine(0.24, 16, Math.cos(a) * 1.28, Math.sin(a) * 1.28));
  }
  if (opts.river) {
    const a = rand() * Math.PI, phase = rand() * 6.28, L = local(0, 0, a), pts = [];
    for (let i = 0; i <= 16; i++) { const sv = -1.15 + 2.3 * i / 16; pts.push(L(sv, 0.55 + 0.12 * Math.sin(sv * 3 + phase))); }
    s.water.push(pts);
  }
  if (age === 2) {
    const a = rand() * Math.PI, L = local(0, 0, a);
    for (const o of [0.34, 0.37]) s.accents.push([L(-1.25, o), L(1.25, o)]);
    for (let sv = -1.2; sv < 1.2; sv += 0.08) s.accents.push([L(sv, 0.325), L(sv, 0.385)]);
    if (lvl >= 1) for (const [x, y] of [[0.55, -0.5], [-0.6, 0.55], [0.6, 0.6]]) s.parks.push(plainBox(x, y, 0.2, 0.14));
    if (lvl === 2) s.accents.push(closedLine(ringLine(c.extent + 0.08, 44)), closedLine(ringLine(c.extent + 0.1, 44)));
  }
}

// ---- populating the lots -----------------------------------------------------------------------------------------
function monuments(c) {
  const { age, lvl, profile } = c, extras = new Set(profile.extras), list = [];
  const sacred = lvl === 0 ? (profile.sacred === 'mound' ? 'mound' : 'shrine') : profile.sacred;
  const civic = profile.civic === 'castle' ? 'castle' : profile.civic === 'tower' ? 'tower' : profile.civic === 'palace' ? 'palace' : 'hall';
  if (c.t > 0.1 || lvl > 0) list.push(sacred);
  if (lvl >= 1 || (age === 1 && profile.civic === 'castle')) list.push(civic);
  if (lvl >= 1 && c.t > 0.45) list.push(profile.sacred === 'dome' ? 'dome' : sacred);
  if (lvl >= 1 && c.t > 0.6) {
    list.push(extras.has('amphitheatre') && lvl >= 2 ? 'amphitheatre' : extras.has('theatre') ? 'theatre' : extras.has('bazaar') ? 'bazaar'
      : extras.has('ballcourt') ? 'ballcourt' : age === 2 ? 'skyscraper' : 'hall');
  }
  return list;
}

// Every lot but the central one holds a cluster of LOT_BUILDINGS small buildings, each a tenth of the area one building
// would have had, set out over about the same ground so the streets and spacing of the plan stay as they were.
export const LOT_BUILDINGS = 10;
const PIECE_SCALE = 1 / Math.sqrt(LOT_BUILDINGS);
// The cluster's cells: a 4 x 3 grid without two opposite corners.
const CLUSTER_CELLS = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) if (!((row === 0 && col === 0) || (row === 2 && col === 3))) CLUSTER_CELLS.push([col, row]);
// How far a form reaches beyond its lot's width (long halls, bazaars...), so a cluster's pieces are shrunk to keep apart.
const FORM_REACH = { long: 1.5, temple: 1.3, hall: 1.2, palace: 1.5, amphitheatre: 1.4, theatre: 1.2, bazaar: 1.8, factory: 1.4, warehouse: 1.2, barracks: 1.5, ballcourt: 1.5, castle: 1.2, church: 1, windmill: 1 };
function addCluster(c, lot, scale, formFor) {
  const span = 1.5, cellW = lot.w * scale * span / 4, cellH = lot.h * scale * span / 3, L = local(lot.x, lot.y, lot.a || 0);
  CLUSTER_CELLS.forEach(([col, row], k) => {
    const form = formFor(k), reach = FORM_REACH[form] || 1;
    const fit = Math.min(1, (cellW * 0.9) / (lot.w * scale * PIECE_SCALE * reach), (cellH * 0.9) / (lot.h * scale * PIECE_SCALE * (form === 'church' ? 1.3 : 1)));
    const jx = (c.rand() - 0.5) * cellW * 0.12, jy = (c.rand() - 0.5) * cellH * 0.12;
    const [x, y] = L((col - 1.5) * cellW + jx, (row - 1) * cellH + jy);
    addBuilding(c, form, { x, y, w: lot.w, h: lot.h, a: lot.a || 0 }, scale * PIECE_SCALE * fit);
  });
}
// Forms with small footprints are scaled up further when they are a townscape's central building.
const CENTRAL_SCALE = { castle: 1.45, granary: 2.8, windmill: 3.2, tower: 2.6, warehouse: 1.25, long: 1.25, factory: 1.3, bazaar: 1.1, barracks: 1.2, ballcourt: 1.2 };
function populate(c) {
  const { rand, age, lvl, profile } = c, extras = new Set(profile.extras);
  const style = c.style;
  const target = clamp(Math.round((5 + 10 * Math.max(0, Math.log10(c.population / 100))) * (age === 2 ? 1.2 : 1) * (style ? style.density : 1)), 4, 66);
  const lots = c.lots.slice().sort((a, b) => a.r - b.r);
  const inner = Math.min(lots.length, Math.ceil(target * 0.5)), rest = lots.slice(inner);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const chosen = lots.slice(0, inner).concat(rest.slice(0, Math.max(0, target - inner))).sort((a, b) => a.r - b.r);
  const monumental = monuments(c), house = HOUSE_FORMS[profile.house] || (FORMS[profile.house] ? profile.house : 'rect');
  // The innermost lot holds the townscape's one large central building: the type's own centrepiece when it has one,
  // else its first monument big enough to stand at the centre (a shrine, stele or watchtower is not), else its hall.
  // The other monuments head the lots after it.
  const SMALL_FORMS = new Set(['shrine', 'stele', 'tower']);
  const styled = style && style.central ? (style.central === '$sacred' ? profile.sacred : style.central === '$civic' ? profile.civic : style.central) : '';
  const central = (styled && FORMS[styled] ? styled : '') || monumental.find(f => !SMALL_FORMS.has(f)) || (profile.civic === 'palace' && lvl >= 1 ? 'palace' : profile.civic === 'castle' ? 'castle' : 'hall');
  const others = monumental.slice();
  if (others.includes(central)) others.splice(others.indexOf(central), 1);
  const ordinary = lot => {
    const outer = lot.r > 0.62;
    if (style && style.ordinary && rand() < 0.3) return style.ordinary[Math.floor(rand() * style.ordinary.length)];
    if (age === 2) return outer ? (rand() < 0.5 ? 'factory' : rand() < 0.5 ? 'warehouse' : 'rect') : (lvl >= 1 && rand() < 0.3 ? 'skyscraper' : 'rect');
    if (outer && extras.has('barracks') && rand() < 0.25) return 'barracks';
    if (outer && rand() < 0.28) return age === 1 && rand() < 0.35 ? 'windmill' : rand() < 0.5 ? 'granary' : 'warehouse';
    return lvl === 0 && rand() < 0.6 ? 'hut' : house;
  };
  chosen.forEach((lot, i) => {
    if (i === 0) { addBuilding(c, central, lot, CENTRAL_SCALE[central] || 1.4); return; }
    const head = i - 1 < others.length ? others[i - 1] : '';
    const scale = head ? (head === 'castle' ? 1.3 : 1.2) : 0.8 + rand() * 0.3;
    addCluster(c, lot, scale, k => (k === 0 && head ? head : ordinary(lot)));
  });
}

function townscapeTown(c, opts) {
  const plan = c.profile.plan;
  if (plan === 'grid') planGrid(c); else if (plan === 'radial') planRadial(c); else if (plan === 'round') planRadial(c, 4);
  else if (plan === 'linear') planLinear(c); else if (plan === 'mandala') planMandala(c); else if (plan === 'terrace') planTerrace(c);
  else if (plan === 'ring') planRing(c); else planOrganic(c);
  populate(c);
  addWalls(c);
  addFields(c);
  for (const name of c.profile.extras) {
    if (c.lvl < (EXTRA_LEVEL[name] === undefined ? 1 : EXTRA_LEVEL[name])) continue;
    if (EXTRAS[name]) EXTRAS[name](c);
  }
  addTerrainAndAge(c, opts);
  c.shapes.people = clamp(Math.round(3 + c.t * 14), 3, 18);
  if (c.style && c.style.tilt) turnShapes(c.shapes, c.style.tilt);
}
// Turns a whole layout about its centre (a type's own lean on its civ's plan).
function turnShapes(s, angle) {
  for (const key of KEYS) if (s[key]) s[key] = s[key].map(poly => rotate(poly, angle));
  s.nodes = rotate(s.nodes, angle);
  for (const b of s.buildings) { b.poly = rotate(b.poly, angle); b.parts = b.parts.map(p => rotate(p, angle)); b.detail = b.detail.map(p => rotate(p, angle)); }
}

// ---- encampments and battles -------------------------------------------------------------------------------------
export const TENT_SCALE = 1 / 40;
function campTent(c, x, y, size, round) {
  const r = size * TENT_SCALE;
  const poly = round ? ringLine(r * 0.9, 8, x, y) : plainBox(x, y, r * 1.7, r * 1.4);
  const detail = round ? [closedLine(ringLine(r * 0.5, 8, x, y))]
    : [[[x - r * 0.85, y], [x + r * 0.85, y]], [[x, y], [x, y + r * 0.7]]];
  c.shapes.buildings.push({ poly, cls: 'tents', form: 'tent', parts: [], detail });
}
function encampment(c) {
  const { rand, t, age, lvl, civKey } = c, s = c.shapes, size = 0.12 - t * 0.04, st = c.style;
  const count = clamp(Math.round((3 + t * 9) * (st ? st.tents : 1)), 2, 16);
  const center = node(c, 0, 0);
  const rows = st ? st.camp === 'row' || (st.camp !== 'ring' && st.camp !== 'round' && ROW_CAMP.has(civKey)) : ROW_CAMP.has(civKey);
  if (rows) {
    const cols = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / cols), step = 1.1 / Math.max(cols, rows), ids = [];
    let placed = 0;
    for (let r = 0; r < rows; r++) { ids.push([]); for (let k = 0; k < cols && placed < count; k++, placed++) {
      const x = (k - (cols - 1) / 2) * step, y = (r - (rows - 1) / 2) * step;
      campTent(c, x, y, size, false); ids[r].push(node(c, x, y + size * TENT_SCALE * 1.4));
    } }
    for (let r = 0; r < ids.length; r++) for (let k = 0; k < ids[r].length; k++) { if (k > 0) link(c, ids[r][k - 1], ids[r][k]); if (r > 0 && ids[r - 1][k] !== undefined) link(c, ids[r - 1][k], ids[r][k]); }
    link(c, center, ids[0][0]);
    const edge = 0.66;
    if (age === 2) { for (const o of [-edge, edge]) s.accents.push(Array.from({ length: 12 }, (_, i) => [-edge + 2 * edge * i / 11, o + (i % 2 ? 0.03 : -0.03)])); }
    else s.walls.push(closedLine([[-edge, -edge], [edge, -edge], [edge, edge], [-edge, edge]]));
    s.streets.push([[-edge, 0], [edge, 0]], [[0, -edge], [0, edge]]);
  } else {
    const round = st ? st.camp === 'ring' || st.camp === 'round' || ROUND_CAMP.has(civKey) : ROUND_CAMP.has(civKey), phase = rand() * TAU, ids = [];
    for (let i = 0; i < count; i++) {
      const layer = i < 6 ? 0 : 1, radius = layer ? 0.7 : 0.38, perLayer = layer ? Math.max(1, count - 6) : Math.min(6, count);
      const a = phase + (layer ? (i - 6) : i) / perLayer * TAU + (rand() - 0.5) * 0.15;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      campTent(c, x, y, size, round);
      ids.push(node(c, x * 0.8, y * 0.8));
    }
    for (let i = 0; i < ids.length; i++) { link(c, center, ids[i]); if (i > 0) link(c, ids[i - 1], ids[i]); }
    if (age === 1 && lvl === 2) { const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; pts.push([Math.cos(a) * (i % 2 ? 0.85 : 1.0), Math.sin(a) * (i % 2 ? 0.85 : 1.0)]); } s.walls.push(closedLine(pts)); }
    else if (age === 2) s.accents.push(closedLine(Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * TAU) * (i % 2 ? 0.88 : 0.95), Math.sin(i / 24 * TAU) * (i % 2 ? 0.88 : 0.95)])));
    else if (lvl === 0 && age === 0) s.accents.push(closedLine(ringLine(0.98, 28)));
  }
  s.fires.push(ringLine(0.05, 8));
  s.buildings.push({ poly: plainBox(0, -0.12, size * 2.4, size * 1.8), cls: 'military', form: 'command', parts: [], detail: [[[-size, -0.12], [size, -0.12]]] });
  for (let i = 0; i < 2; i++) s.buildings.push({ poly: plainBox(0.5 - i, 0.5, size * 1.8, size * 1.1, rand()), cls: age === 2 ? 'military' : 'store', form: 'wagon', parts: [], detail: [] });
  if (c.style) unitCampTouches(c, size);
  s.people = clamp(Math.round(3 + t * 5), 3, 8);
}
// What a unit's type adds to its camp: a longer baggage train, horse paddocks, a commander's standards, a shrine, an
// airstrip, or a shore with drawn-up boats.
function unitCampTouches(c, size) {
  const { rand } = c, s = c.shapes, st = c.style, phase = st.phase || 0;
  for (let k = 2; k < (st.wagons || 2); k++) {
    const a = phase + Math.PI * 0.6 + (k - 2) * 0.3;
    s.buildings.push({ poly: plainBox(Math.cos(a) * 1.06, Math.sin(a) * 1.06, size * 1.8, size * 1.1, a + Math.PI / 2), cls: 'store', form: 'wagon', parts: [], detail: [] });
  }
  if (st.paddock) { const a = phase + Math.PI * 1.4; s.fields.push(plainBox(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0.42, 0.24, a + Math.PI / 2)); }
  if (st.banner) for (const x of [-0.16, 0.16]) s.accents.push([[x, -0.2], [x, -0.34]], [[x, -0.34], [x + 0.06, -0.31], [x, -0.28]]);
  if (st.shrine) addBuilding(c, 'shrine', { x: 0, y: 0.2, w: 0.14, h: 0.14, a: 0 });
  if (st.strip) { const a = phase; s.plazas.push(plainBox(Math.cos(a) * 1.1, Math.sin(a) * 1.1, 1.1, 0.1, a + Math.PI / 2)); }
  if (st.camp === 'shore') {
    const a = phase + Math.PI;
    s.water.push(arcLine(1.12, a - 0.7, a + 0.7, 14));
    for (let k = -1; k <= 1; k++) { const an = a + k * 0.35; addBuilding(c, 'long', { x: Math.cos(an) * 0.98, y: Math.sin(an) * 0.98, w: 0.09 + rand() * 0.02, h: 0.06, a: an + Math.PI / 2 }); }
  }
}

function battle(c) {
  const { rand, t, age } = c, s = c.shapes, angle = rand() * TAU, blocks = 3 + Math.round(t * 3), width = 1.5 / (blocks + 1), blockW = width * 0.7;
  const place = (offsetY, loss, direction) => {
    for (let i = 0; i < blocks; i++) {
      if (rand() < loss) continue;
      const x = -0.75 + (i + 1) * width + (rand() - 0.5) * 0.03, y = offsetY + (rand() - 0.5) * 0.04;
      s.buildings.push({ poly: rotate(plainBox(x, y, blockW, blockW * 0.55), angle), cls: 'military', form: 'block', parts: [], detail: [] });
    }
    for (const x of [-0.55, 0, 0.55]) {
      const from = [x, offsetY - direction * 0.18], to = [x, offsetY - direction * 0.42];
      s.accents.push(rotate([from, to], angle), rotate([[to[0] - 0.05, to[1] + direction * 0.07], to, [to[0] + 0.05, to[1] + direction * 0.07]], angle));
    }
  };
  place(-0.4, 0.05, 1);
  place(0.4, 0.2, -1);
  for (let k = 0; k < 3 + Math.round(t * 3); k++) {
    const x = (rand() - 0.5) * 1.3, y = (rand() - 0.5) * 0.3, e = 0.04;
    s.accents.push(rotate([[x - e, y - e], [x + e, y + e]], angle), rotate([[x - e, y + e], [x + e, y - e]], angle));
  }
  if (age === 2) for (const o of [-0.62, 0.62]) s.walls.push(rotate(Array.from({ length: 14 }, (_, i) => [-0.8 + 1.6 * i / 13, o + (i % 2 ? 0.035 : -0.035)]), angle));
  s.walls.push(rotate([[-0.8, 0], [0.8, 0]], angle));
}

// ---- per-type layouts ----------------------------------------------------------------------------------------------
// Each building, improvement, wonder and unit type gets its own take on its civ's layout: an archetype read from the
// type's name (so DLC and modded types are covered too) sets the kind of place it is, and a hash of the full type key
// picks among that archetype's plans, centrepieces, house forms and extras, so two types of the same archetype differ.
const TYPE_ARCHETYPES = [
  ['palace', /PALACE|CAPITAL|ROYAL|CHANCERY|COURT_OF/, { central: ['palace'], plans: ['grid', 'mandala', 'radial', 'round'], houses: ['court', 'long'], extras: ['garden', 'plaza'], wall: 'square', density: 1.1 }],
  ['wonder', /^WONDER_|_WONDER/, { central: ['pyramid', 'ziggurat', 'temple', 'dome', 'amphitheatre', 'stupa', 'pagoda', 'tower', 'castle', 'palace'], plans: ['mandala', 'radial', 'grid', 'round'], houses: ['court', 'rect'], extras: ['plaza', 'garden', 'stelae', 'obelisk'], density: 0.8 }],
  ['sacred', /TEMPLE|ALTAR|SHRINE|MONASTERY|PAGODA|MOSQUE|CATHEDRAL|CHURCH|SANCTUAR|ORACLE|STUPA|MADRASA|DHARAM|SYNAGOG|HOLY|SACRED|MARAE|HEIAU|TOMB|MAUSOLE|NECRO/, { central: ['$sacred', 'temple', 'dome', 'stupa', 'pagoda'], plans: ['mandala', 'round', 'organic'], houses: ['court', 'rect', 'long'], extras: ['plaza', 'stelae', 'garden', 'tank'], density: 0.85 }],
  ['market', /MARKET|BAZAAR|BANK|STOCK|EXCHANGE|TRADE|EMPORIUM|CARAVAN|GUILD|COUNTING/, { central: ['bazaar', 'hall', 'warehouse'], plans: ['grid', 'linear', 'organic'], houses: ['rect', 'court', 'long'], ordinary: ['stall', 'warehouse', 'bazaar'], extras: ['market', 'plaza'], density: 1.15 }],
  ['campus', /LIBRARY|ACADEMY|UNIVERSITY|LABORATORY|SCHOOL|OBSERVATORY|ARCHIVE|INSTITUTE|SCRIPTOR|MUSEUM/, { central: ['hall', 'court', 'dome'], plans: ['grid', 'mandala', 'radial'], houses: ['court', 'rect'], extras: ['garden', 'plaza'], density: 0.9 }],
  ['fort', /BARRACKS|FORT|ARMOR|MILITARY|GARRISON|WALLS|STABLE|DUNGEON|CITADEL|BASTION|OUTPOST|BUNKER|ARSENAL|DEFENSE|KASBAH|DZONG/, { central: ['castle', 'tower', 'barracks'], plans: ['grid', 'ring', 'radial'], houses: ['rect', 'long'], ordinary: ['barracks', 'tower', 'warehouse'], extras: ['moat', 'castle', 'drum'], wall: 'square', density: 0.75 }],
  ['harbour', /QUAY|HARBOR|HARBOUR|DOCK|LIGHTHOUSE|FISH|SHIPYARD|PORT|WHARF|PIER|NAVAL|COTHON|MARINA|SEAPORT/, { central: ['warehouse', 'hall', 'tower'], plans: ['linear', 'organic', 'grid'], houses: ['long', 'rect'], ordinary: ['warehouse', 'long'], extras: ['canal', 'fishpond', 'cothon'], density: 0.9 }],
  ['rural', /FARM|PLANTATION|PASTURE|CAMP|GRANARY|RANCH|WOODCUT|SAWMILL|CLAY|IRRIGAT|ORCHARD|VINEYARD|PADDY|TERRACE|HOMESTEAD|HUNTING|GATHER|FIELD|OASIS|CORRAL|KRAAL|LODGE/, { central: ['granary', 'hall', 'long', 'windmill'], plans: ['organic', 'linear', 'ring'], houses: ['hut', 'long', 'rect'], ordinary: ['granary', 'hut', 'windmill'], extras: ['fishpond', 'tank'], fields: 2, density: 0.55 }],
  ['works', /MINE|QUARRY|WORKSHOP|FACTORY|FOUNDRY|POWER|REFINERY|OIL|SMELT|FORGE|KILN|MILL|INDUSTR|RAIL|MANUFACT|BREWERY|TANNERY|WELL/, { central: ['factory', 'warehouse', 'hall'], plans: ['grid', 'linear'], houses: ['rect', 'long'], ordinary: ['warehouse', 'factory', 'rect'], extras: ['canal'], density: 0.8 }],
  ['spectacle', /AMPHITHEAT|ARENA|THEAT|COLOSS|STADIUM|OPERA|ZOO|CIRCUS|HIPPODROM|BALLCOURT|BATH|FESTIVAL|PAVILION/, { central: ['amphitheatre', 'theatre', 'ballcourt'], plans: ['radial', 'round', 'grid'], houses: ['rect', 'court'], extras: ['plaza', 'garden'], density: 1 }],
  ['waterworks', /AQUEDUCT|WATER|DAM|CANAL|CISTERN|RESERVOIR|BARAY|QANAT|STEPWELL|FOUNTAIN|SEWER/, { central: ['hall', 'court'], plans: ['grid', 'linear', 'mandala'], houses: ['rect', 'court'], extras: ['aqueduct', 'tank', 'canal', 'baray'], density: 0.9 }],
  ['garden', /GARDEN|PARK|ARBORETUM|GROVE|PRESERVE|RESERVE|BOTANIC|PLEASURE/, { central: ['hall', 'pagoda', 'shrine'], plans: ['mandala', 'organic', 'round'], houses: ['court', 'rect'], extras: ['garden', 'tank', 'fishpond'], density: 0.65 }],
  ['civic', /CITY_HALL|GOVERN|TOWN_HALL|FORUM|AGORA|SENATE|PARLIAMENT|MANSION|VILLA|CITY_CENTER|URBAN|MONUMENT|SQUARE/, { central: ['hall', 'palace', 'court'], plans: ['grid', 'radial', 'organic'], houses: ['rect', 'court'], extras: ['plaza', 'market'], density: 1.05 }],
];
const UNIT_ARCHETYPES = [
  ['commander', /COMMANDER|GENERAL|ADMIRAL|MARSHAL|CAPTAIN|LEADER/, { camp: 'row', tents: 1.4, wagons: 4, banner: true }],
  ['naval', /DOMAIN_SEA|SHIP|GALLEY|BOAT|TRIREME|FRIGATE|CARRACK|COG|DESTROYER|SUBMARINE|CRUISER|IRONCLAD|BIREME|PRIVATEER|CARAVEL/, { camp: 'shore', tents: 0.8, wagons: 1 }],
  ['cavalry', /HORSE|CAVALRY|KNIGHT|CHARIOT|LANCER|HUSSAR|CUIRASS|CAMEL|ELEPHANT|RIDER|MOUNTED|CATAPHRACT|DRAGOON|KESHIG|MAMLUK/, { camp: 'ring', tents: 0.9, wagons: 3, paddock: true }],
  ['siege', /CATAPULT|BALLISTA|TREBUCHET|CANNON|BOMBARD|ARTILLERY|SIEGE|RAM|MORTAR|HOWITZER/, { camp: 'row', tents: 0.7, wagons: 5 }],
  ['civilian', /SETTLER|MIGRANT|MERCHANT|SCOUT|EXPLORER|ARCHAEOLOG|BUILDER|WORKER|CARAVAN|DOMAIN_LAND\|CORE_CLASS_CIVILIAN|CORE_CLASS_CIVILIAN/, { camp: 'round', tents: 0.6, wagons: 3 }],
  ['religious', /MISSIONARY|PRIEST|APOSTLE|INQUISIT|MONK|SHAMAN|PROPHET|SAGE/, { camp: 'round', tents: 0.6, wagons: 1, shrine: true }],
  ['air', /DOMAIN_AIR|FIGHTER|BOMBER|PLANE|BIPLANE|AIRCRAFT|HELICOPTER/, { camp: 'row', tents: 1, wagons: 2, strip: true }],
];
function hashKey(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// The style a type key gives a layout (null when there is no type key).
export function townTypeStyle(typeKey, kind) {
  const key = String(typeKey || '').toUpperCase();
  if (!key) return null;
  const h = hashKey(key), pick = (list, salt) => list[(hashKey(key + '#' + salt) % list.length)];
  if (kind === 'camp' || kind === 'battle') {
    const row = UNIT_ARCHETYPES.find(([, re]) => re.test(key));
    const base = row ? row[2] : { camp: pick(['row', 'round', 'ring'], 'camp'), tents: 1, wagons: 2 };
    return { archetype: row ? row[0] : 'troops', variant: h % 997, ...base, phase: (h % 360) / 360 * TAU, tents: base.tents * (0.85 + (h % 7) * 0.05) };
  }
  const row = TYPE_ARCHETYPES.find(([, re]) => re.test(key)) || ['district', null, { central: ['hall', 'court', '$civic'], plans: ['$civ', 'grid', 'organic', 'radial'], houses: ['$civ', 'rect', 'court'], extras: ['plaza'], density: 1 }];
  const spec = row[2], extras = spec.extras || [];
  // One or two of the archetype's extras, chosen by the hash.
  const chosen = new Set([pick(extras, 'x1')]);
  if (extras.length > 1 && (h >> 3) % 2) chosen.add(pick(extras, 'x2'));
  return {
    archetype: row[0], variant: h % 997, central: pick(spec.central, 'central'), plan: pick(spec.plans, 'plan'), house: pick(spec.houses, 'house'),
    ordinary: spec.ordinary || null, extras: [...chosen].filter(Boolean), wall: spec.wall || '', fields: spec.fields || 1,
    density: (spec.density || 1) * (0.88 + ((h >> 5) % 9) * 0.03), tilt: ((h >> 9) % 7 - 3) * 0.12,
  };
}
// The civ profile with a type style laid over it.
function styledProfile(profile, style) {
  if (!style) return profile;
  const resolve = (value, fallback) => value === '$civ' ? fallback : value === '$sacred' ? profile.sacred : value === '$civic' ? profile.civic : value;
  const extras = new Set(profile.extras);
  for (const x of style.extras) extras.add(x);
  return {
    ...profile, plan: resolve(style.plan, profile.plan), house: resolve(style.house, profile.house),
    wall: style.wall && profile.wall !== 'none' ? style.wall : profile.wall, extras: [...extras],
  };
}

// opts: { seed, civKey, population, kind: 'town' | 'camp' | 'battle', coast, river, age (0-2), lvl (0-2), typeKey }
export function generateTownscape(opts) {
  const rand = random(Number(opts.seed) || 1), population = Math.max(10, Number(opts.population) || 10);
  const civKey = opts.civKey || '', style = townTypeStyle(opts.typeKey, opts.kind || 'town');
  const base = PROFILES[civKey] || DEFAULT_PROFILE;
  const c = {
    rand, civKey, population, t: townscapeScale(population), age: clamp(opts.age | 0, 0, 2), lvl: clamp(opts.lvl | 0, 0, 2),
    profile: opts.kind === 'camp' || opts.kind === 'battle' ? base : styledProfile(base, style), style,
    shapes: emptyShapes(), lots: [], extent: 0.95, wallShape: 'round', tilt: 0,
  };
  if (opts.kind === 'battle') battle(c);
  else if (opts.kind === 'camp') encampment(c);
  else townscapeTown(c, opts);
  const key = String(opts.typeKey || '').toUpperCase();
  if (!/PALACE|FORT|CITADEL|BASTION|KASBAH|DZONG|BUNKER|CITY_CENTER|URBAN/.test(key)) {
    c.shapes.walls = c.shapes.walls.filter(line => line.length < 8 ||
      Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) > 1e-6);
  }
  if (opts.kind !== 'camp' && opts.kind !== 'battle') c.shapes.buildings = rectangularBuildings(denserBuildings(c.shapes.buildings, population, c.age));
  return c.shapes;
}

export const MAX_TOWN_BUILDINGS = 1000;
export function nearestNodeLookup(nodes, indices) {
  const build = (items, depth) => {
    if (!items.length) return null;
    const axis = depth % 2 ? 'y' : 'x';
    items.sort((a, b) => nodes[a][axis] - nodes[b][axis] || a - b);
    const middle = Math.floor(items.length / 2);
    return { id: items[middle], axis, left: build(items.slice(0, middle), depth + 1), right: build(items.slice(middle + 1), depth + 1) };
  };
  const root = build(indices.slice(), 0);
  return (x, y) => {
    let best = -1, distance = Infinity;
    const visit = branch => {
      if (!branch) return;
      const point = nodes[branch.id], dx = point.x - x, dy = point.y - y, d = dx * dx + dy * dy;
      if (d < distance || (d === distance && (best < 0 || branch.id < best))) { best = branch.id; distance = d; }
      const delta = branch.axis === 'x' ? x - point.x : y - point.y;
      visit(delta < 0 ? branch.left : branch.right);
      if (delta * delta <= distance) visit(delta < 0 ? branch.right : branch.left);
    };
    visit(root);
    return best;
  };
}
export function approachPath(start, end, { seed = 0, amplitude = 0, clear, waypoints = [] }) {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!length) return [start, end];
  const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
  for (const scale of [1, -1, 0.4, -0.4, 0]) {
    const path = Array.from({ length: 5 }, (_, i) => {
      const t = i / 4, bend = i === 0 || i === 4 ? 0 : Math.sin(t * Math.PI * 2 + (seed % 7) * 0.1) * Math.sin(t * Math.PI) * Math.min(amplitude, length * 0.15) * scale;
      return { x: start.x + (end.x - start.x) * t + nx * bend, y: start.y + (end.y - start.y) * t + ny * bend };
    });
    if (path.slice(1).every((p, i) => clear(path[i], p))) return path;
  }
  const detours = (typeof waypoints === 'function' ? waypoints() : waypoints).slice().sort((a, b) =>
    Math.hypot(a.x - start.x, a.y - start.y) + Math.hypot(a.x - end.x, a.y - end.y) -
    Math.hypot(b.x - start.x, b.y - start.y) - Math.hypot(b.x - end.x, b.y - end.y)).slice(0, 24);
  const points = [start, end, ...detours], best = points.map(() => Infinity), previous = points.map(() => -1), used = new Set();
  best[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let node = -1;
    for (let i = 0; i < points.length; i++) if (!used.has(i) && (node < 0 ||
      best[i] + Math.hypot(points[i].x - end.x, points[i].y - end.y) < best[node] + Math.hypot(points[node].x - end.x, points[node].y - end.y))) node = i;
    if (node < 0 || best[node] === Infinity) break;
    if (node === 1) {
      const path = [];
      for (let at = 1; at >= 0; at = previous[at]) path.push(points[at]);
      return path.reverse();
    }
    used.add(node);
    for (let i = 0; i < points.length; i++) {
      const cost = best[node] + Math.hypot(points[i].x - points[node].x, points[i].y - points[node].y);
      if (!used.has(i) && cost < best[i] && clear(points[node], points[i])) { best[i] = cost; previous[i] = node; }
    }
  }
  return null;
}
export function quarterBuildings(buildings) {
  return [...quarterBuildingGroups(buildings)].flat();
}
export function* quarterBuildingGroups(buildings) {
  const areas = buildings.map(b => {
    const box = b.box || polygonBounds(b.poly);
    return (box.x1 - box.x0) * (box.y1 - box.y0);
  });
  let largest = 0;
  for (const area of areas) if (area > largest) largest = area;
  const clip = (poly, axis, boundary, sign) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (out.length === 3) out.splice(1, 0, [(out[0][0] + out[1][0]) / 2, (out[0][1] + out[1][1]) / 2]);
    return out;
  };
  for (let index = 0; index < buildings.length; index++) {
    const b = buildings[index];
    const box = b.box || polygonBounds(b.poly);
    const mx = b.poly.reduce((n, p) => n + p[0], 0) / b.poly.length, my = b.poly.reduce((n, p) => n + p[1], 0) / b.poly.length;
    const subdivisionCenter = { x: mx, y: my };
    const gapX = (box.x1 - box.x0) * 0.025, gapY = (box.y1 - box.y0) * 0.025;
    let accepted = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const margin = 1 / 2 ** attempt;
      const quarters = Array.from({ length: 4 }, (_, q) => {
        const sx = q % 2 ? 1 : -1, sy = q < 2 ? -1 : 1;
        const cut = poly => clip(clip(poly, 0, mx + sx * gapX * margin, sx), 1, my + sy * gapY * margin, sy);
        const poly = cut(b.poly);
        return { ...b, sourceIndex: `${b.sourceIndex ?? index}.${q}`, subdivisionParent: String(b.sourceIndex ?? index), subdivisionCenter, poly,
          parts: (b.parts || []).map(cut).filter(validBuildingPolygon), detail: [], box: polygonBounds(poly),
          housingWeight: largest > 0 && areas[index] >= largest * 0.35 ? 5 : 1, capacityShare: 0.25 };
      });
      if (quarters.every(b => validBuildingPolygon(b.poly))) { accepted = quarters; break; }
    }
    if (!accepted) throw new Error(`Cannot subdivide townscape roof ${b.sourceIndex ?? index}`);
    yield accepted.map(b => {
      const cx = (b.box.x0 + b.box.x1) / 2, cy = (b.box.y0 + b.box.y1) / 2;
      const shrink = poly => poly.map(([x, y]) => [cx + (x - cx) / 4, cy + (y - cy) / 4]);
      const poly = shrink(b.poly);
      return { ...b, poly, parts: b.parts.map(shrink), box: polygonBounds(poly) };
    });
  }
}
export function validBuildingPolygon(poly) {
  if (poly.length < 4 || poly.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return false;
  if (new Set(poly.map(([x, y]) => `${x},${y}`)).size < 4) return false;
  const [ox, oy] = poly[0];
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    area += (poly[i][0] - ox) * (poly[i + 1][1] - oy) - (poly[i + 1][0] - ox) * (poly[i][1] - oy);
  }
  return Math.abs(area) > 0;
}
export function rectangularBuildings(buildings) {
  let central = -1, largest = 0;
  buildings.forEach((b, i) => {
    const box = polygonBounds(b.poly), area = (box.x1 - box.x0) * (box.y1 - box.y0);
    if (area > largest) { largest = area; central = i; }
  });
  return buildings.map((b, i) => {
    if (i === central || b.form === 'tent' || !['house', 'store', 'industry'].includes(b.cls)) return b;
    let length = 0, angle = 0;
    for (let k = 0; k < b.poly.length; k++) {
      const a = b.poly[k], next = b.poly[(k + 1) % b.poly.length], d = Math.hypot(next[0] - a[0], next[1] - a[1]);
      if (d > length) { length = d; angle = Math.atan2(next[1] - a[1], next[0] - a[0]); }
    }
    const cos = Math.cos(angle), sin = Math.sin(angle), projected = b.poly.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
    const box = polygonBounds(projected), cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    const hw = (box.x1 - box.x0) * 0.43, hh = (box.y1 - box.y0) * 0.37;
    const at = (x, y) => [x * cos - y * sin, x * sin + y * cos];
    return { ...b, poly: [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]].map(([x, y]) => at(x, y)),
      parts: [], detail: [[at(cx - hw * 0.8, cy), at(cx + hw * 0.8, cy)]] };
  });
}
const SMALL_HOME_CAPACITY = [3, 4, 6];
export function denserBuildings(buildings, population, age) {
  if (!buildings.length) return buildings;
  const capacity = SMALL_HOME_CAPACITY[clamp(age | 0, 0, 2)];
  const target = Math.min(MAX_TOWN_BUILDINGS, Math.max(buildings.length, Math.ceil(population / capacity)));
  if (target <= buildings.length) return buildings;
  const boxes = buildings.map(b => polygonBounds(b.poly));
  const area = b => (b.x1 - b.x0) * (b.y1 - b.y0);
  let central = 0;
  for (let i = 1; i < boxes.length; i++) if (area(boxes[i]) > area(boxes[central])) central = i;
  const ordinary = Math.max(1, buildings.length - 1), base = Math.floor((target - 1) / ordinary), remainder = (target - 1) % ordinary;
  const out = [];
  let rank = 0;
  buildings.forEach((b, i) => {
    if (i === central) { out.push(b); return; }
    const count = base + (rank++ < remainder ? 1 : 0), cols = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / cols);
    const box = boxes[i], cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    for (let k = 0; k < count; k++) {
      const x = box.x0 + (k % cols + 0.5) * (box.x1 - box.x0) / cols;
      const y = box.y0 + (Math.floor(k / cols) + 0.5) * (box.y1 - box.y0) / rows;
      const place = poly => poly.map(([px, py]) => [x + (px - cx) * 0.9 / cols, y + (py - cy) * 0.9 / rows]);
      out.push({ ...b, poly: place(b.poly), parts: b.parts.map(place), detail: b.detail.map(place) });
    }
  });
  return out;
}

const KEYS = ['streets', 'mainStreets', 'walls', 'fires', 'accents', 'water', 'pools', 'fields', 'parks', 'plazas', 'tents'];
const CLOSED = new Set(['fires', 'pools', 'fields', 'parks', 'plazas', 'tents']);

// Scales a layout to a centre and radius and returns one SVG path string per ground feature (buildings are handled by
// the caller, which filters them against the map).
export function townscapePaths(shapes, cx, cy, radius) {
  const out = {}, fmt = n => (Math.round(n * 1000000) / 1000000).toString();
  for (const key of KEYS) {
    let d = '';
    for (const poly of shapes[key] || []) {
      if (poly.length < 2) continue;
      d += poly.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(cx + x * radius)},${fmt(cy + y * radius)}`).join('');
      if (CLOSED.has(key) || (key === 'walls' && poly.length > 2)) d += 'Z';
    }
    out[key] = d;
  }
  return out;
}

export function townscapeShapeCount(shapes) {
  return KEYS.reduce((sum, key) => sum + (shapes[key] || []).length, 0) + shapes.buildings.length;
}

// ---- physical mini-decorations; early townscape zoom uses preview markers for their locations.
// Placed in clumps across the layout's disc (radius ~1.15), deterministic per seed. --
export const DECO_GROUPS = ['decoPlants', 'decoBushes', 'decoRocks', 'decoFurniture', 'decoLamps'];
export const DECORATION_STROKE_FEET = 0.125;
export function decorationGroup(kind) {
  if (kind === 'plant') return 'decoPlants';
  if (kind === 'bush') return 'decoBushes';
  if (kind === 'rock' || kind === 'pebbles') return 'decoRocks';
  if (kind === 'lamp') return 'decoLamps';
  if (['bench', 'barrel', 'crate', 'table', 'cart', 'well', 'statue', 'stall', 'basket'].includes(kind)) return 'decoFurniture';
  throw new Error(`Unknown decoration kind: ${kind}`);
}
export function decorationTouchesWater(x, y, radius, isWater) {
  if (isWater(x, y)) return true;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    if (isWater(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) return true;
  }
  return false;
}
const DECO_KINDS = [['plant', 0.465], ['bush', 0.23], ['rock', 0.05], ['pebbles', 0.04], ['lamp', 0.025], ['bench', 0.025], ['barrel', 0.02], ['crate', 0.02],
  ['table', 0.025], ['cart', 0.025], ['well', 0.02], ['statue', 0.02], ['stall', 0.02], ['basket', 0.015]];
export function townDecorations(seed, count) {
  const rand = random((Number(seed) >>> 0) || 7), out = [], n = clamp(Math.round(Number(count) || 0), 0, 12000);
  const pickKind = () => { let v = rand(); for (const [kind, w] of DECO_KINDS) { if ((v -= w) < 0) return kind; } return 'plant'; };
  while (out.length < n) {
    // A clump: a few of one or two kinds around a spot, as plants and stones gather in real ground.
    const a = rand() * TAU, d = Math.sqrt(rand()) * 1.15, cx = Math.cos(a) * d, cy = Math.sin(a) * d;
    const main = pickKind(), size = 2 + Math.floor(rand() * 5);
    for (let k = 0; k < size && out.length < n; k++) {
      const ka = rand() * TAU, kd = rand() * 0.05;
      out.push({ x: cx + Math.cos(ka) * kd, y: cy + Math.sin(ka) * kd, kind: rand() < 0.75 ? main : pickKind(), size: 2 + rand() * 6, a: rand() * TAU });
    }
  }
  return out;
}
// A world-anchored grid visits only visible cells; no town-wide dense candidate array is retained.
export function* viewportVegetation(seed, rect, bounds, density, budget = 96000) {
  const step = 1 / Math.sqrt(density);
  const x0 = Math.max(bounds.x0, rect.x0), x1 = Math.min(bounds.x1, rect.x1);
  const y0 = Math.max(bounds.y0, rect.y0), y1 = Math.min(bounds.y1, rect.y1);
  if (!(step > 0) || !Number.isFinite(step) || x1 < x0 || y1 < y0) return;
  const stride = Math.max(1, Math.ceil(Math.sqrt((Math.ceil((x1 - x0) / step) + 1) * (Math.ceil((y1 - y0) / step) + 1) / Math.max(1, budget))));
  for (let y = Math.floor(y0 / step / stride) * stride; y <= Math.floor(y1 / step); y += stride) {
    for (let x = Math.floor(x0 / step / stride) * stride; x <= Math.floor(x1 / step); x += stride) {
      const rand = random((seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0);
      const px = (x + rand()) * step, py = (y + rand()) * step;
      if (px < x0 || px > x1 || py < y0 || py > y1) continue;
      yield { x: px, y: py, kind: rand() < 0.669 ? 'plant' : 'bush', size: 2 + rand() * 6, a: rand() * TAU };
    }
  }
}
export function townRoadWidths(hexWidth, pixelsPerUnit = Infinity) {
  const thin = Math.max(0.005, hexWidth * 0.0005) / 20;
  return {
    streets: Math.max(thin * 0.4, 0.9 / pixelsPerUnit),
    mainStreets: Math.max(thin * 0.75, 1.4 / pixelsPerUnit),
    accessRoads: Math.max(thin * 0.04, 0.8 / pixelsPerUnit),
    links: Math.max(thin * 0.75, 1.4 / pixelsPerUnit),
  };
}
export function majorRoadWidth(hexWidth, townZoomRatio = 0) {
  const wide = Math.max(0.5, hexWidth * 0.022);
  const physical = hexWidth * 20 / (100 * 5280);
  const blend = clamp((townZoomRatio - 1) / 0.5, 0, 1);
  return wide * (1 - blend) + physical * blend;
}
// Normalize the silhouette's longest span; unit is map units per foot, including the round stroke.
export function decorationPath(deco, x, y, unit) {
  const [group, shape] = decorationShapePath(deco, 0, 0, 1);
  if (group !== decorationGroup(deco.kind)) throw new Error(`Decoration group mismatch: ${deco.kind}`);
  const points = [...shape.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  let diameter = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    diameter = Math.max(diameter, Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]));
  }
  if (!(diameter > 0) || !Number.isFinite(diameter)) throw new Error('Decoration geometry must have a finite, positive span.');
  const scale = unit * (clamp(deco.size, 2, 8) - DECORATION_STROKE_FEET) / diameter;
  const coordinate = value => value.toFixed(9).replace(/\.?0+$/, '');
  return [group, shape.replace(/([ML])(-?[\d.]+),(-?[\d.]+)/g, (_, command, px, py) =>
    `${command}${coordinate(x + Number(px) * scale)},${coordinate(y + Number(py) * scale)}`)];
}
function decorationShapePath(deco, x, y, unit) {
  const s = unit * deco.size, f = v => (Math.round(v * 1000000) / 1000000).toString(), a = deco.a;
  const at = (r, an) => `${f(x + Math.cos(an) * r)},${f(y + Math.sin(an) * r)}`;
  const path = points => points.map(([px, py], i) => `${i ? 'L' : 'M'}${f(x + (px * Math.cos(a) - py * Math.sin(a)) * s)},${f(y + (px * Math.sin(a) + py * Math.cos(a)) * s)}`).join('');
  if (deco.kind === 'table') return ['decoFurniture', path([[-0.7, -0.5], [0.7, -0.5], [0.7, 0.5], [-0.7, 0.5]]) + 'Z' + path([[-0.8, -0.7], [0.8, -0.7]]) + path([[-0.8, 0.7], [0.8, 0.7]])];
  if (deco.kind === 'cart') return ['decoFurniture', path([[-0.65, -0.5], [0.45, -0.5], [0.45, 0.5], [-0.65, 0.5]]) + 'Z' + path([[0.45, -0.35], [0.95, -0.35]]) + path([[0.45, 0.35], [0.95, 0.35]]) + path([[-0.5, -0.7], [0.3, -0.7]]) + path([[-0.5, 0.7], [0.3, 0.7]])];
  if (deco.kind === 'well') return ['decoFurniture', path([[-0.6, -0.4], [0, -0.7], [0.6, -0.4], [0.6, 0.4], [0, 0.7], [-0.6, 0.4]]) + 'Z' + path([[-0.4, 0], [0.4, 0]])];
  if (deco.kind === 'statue') return ['decoFurniture', path([[-0.5, 0.55], [0.5, 0.55], [0.5, 0.85], [-0.5, 0.85]]) + 'Z' + path([[-0.25, 0.5], [-0.2, -0.4], [0, -0.8], [0.2, -0.4], [0.25, 0.5]]) + 'Z'];
  if (deco.kind === 'stall') return ['decoFurniture', path([[-0.8, -0.6], [0.8, -0.6], [0.8, 0.5], [-0.8, 0.5]]) + 'Z' + path([[-0.8, -0.1], [0.8, -0.1]]) + path([[-0.4, -0.6], [-0.4, -0.1]]) + path([[0.4, -0.6], [0.4, -0.1]])];
  if (deco.kind === 'basket') return ['decoFurniture', path([[-0.5, -0.3], [0.5, -0.3], [0.35, 0.5], [-0.35, 0.5]]) + 'Z' + path([[-0.35, -0.3], [-0.2, -0.6], [0.2, -0.6], [0.35, -0.3]])];
  if (deco.kind === 'lamp') return ['decoLamps', path([[-0.3, 0.5], [0.3, 0.5], [0, 0.5], [0, -0.5]]) + path([[-0.2, -0.5], [-0.28, -0.95], [0.28, -0.95], [0.2, -0.5]]) + 'Z'];
  if (deco.kind === 'bench') return ['decoFurniture', path([[-0.9, -0.25], [0.9, -0.25], [0.9, 0.25], [-0.9, 0.25]]) + 'Z' + path([[-0.7, -0.45], [0.7, -0.45]]) + path([[-0.65, 0.25], [-0.65, 0.5]]) + path([[0.65, 0.25], [0.65, 0.5]])];
  if (deco.kind === 'barrel') return ['decoFurniture', path([[-0.4, -0.55], [0.4, -0.55], [0.55, 0], [0.4, 0.55], [-0.4, 0.55], [-0.55, 0]]) + 'Z' + path([[-0.5, -0.25], [0.5, -0.25]]) + path([[-0.5, 0.25], [0.5, 0.25]])];
  if (deco.kind === 'crate') return ['decoFurniture', path([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) + 'Z' + path([[-0.5, -0.5], [0.5, 0.5]]) + path([[0.5, -0.5], [-0.5, 0.5]])];
  if (deco.kind === 'plant') {
    let d = '';
    for (let k = 0; k < 4; k++) { const an = -Math.PI / 2 + (k - 1.5) * 0.45 + Math.sin(a + k) * 0.15; d += `M${f(x)},${f(y)}L${at(s * (0.8 + 0.25 * (k % 2)), an)}`; }
    return ['decoPlants', d];
  }
  if (deco.kind === 'bush') return ['decoBushes', path([[-0.65, 0.2], [-0.5, -0.3], [-0.2, -0.65], [0.2, -0.55], [0.65, -0.1], [0.5, 0.45], [0, 0.65]]) + 'Z'];
  if (deco.kind === 'rock') {
    const corners = 5 + (Math.round(deco.size * 10) % 3), pts = [];
    for (let k = 0; k < corners; k++) pts.push(at(s * (0.45 + 0.2 * Math.abs(Math.sin(a * 3 + k * 1.7))), a + k / corners * TAU));
    return ['decoRocks', `M${pts.join('L')}Z`];
  }
  let d = '';
  for (let k = 0; k < 3; k++) {
    const an = a + k * 2.1, cx = x + Math.cos(an) * s * 0.35, cy = y + Math.sin(an) * s * 0.35, r = s * (0.12 + 0.05 * k);
    d += `M${f(cx - r)},${f(cy)}L${f(cx)},${f(cy - r)}L${f(cx + r)},${f(cy + r * 0.5)}Z`;
  }
  return ['decoRocks', d];
}

// A shared broad phase for the whole visible townscape scene; accepted decorations reserve their full footprint too.
export class DecorationIndex {
  constructor(cellSize, bounds) {
    this.cellSize = Math.max(0.01, cellSize);
    this.bounds = bounds;
    this.cells = new Map();
    this.large = [];
    this.stamp = 0;
    this.checks = 0;
    this.probes = 0;
  }
  add(record) {
    const b = record.box, bounds = this.bounds;
    if (bounds && (b.x1 < bounds.x0 || b.x0 > bounds.x1 || b.y1 < bounds.y0 || b.y0 > bounds.y1)) return;
    const x0 = Math.floor(b.x0 / this.cellSize), x1 = Math.floor(b.x1 / this.cellSize);
    const y0 = Math.floor(b.y0 / this.cellSize), y1 = Math.floor(b.y1 / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256 || this.cells.size >= 8192) { this.large.push(record); return; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`, cell = this.cells.get(key);
      if (cell) cell.push(record); else this.cells.set(key, [record]);
    }
  }
  circle(x, y, r) {
    this.add({ kind: 'circle', x, y, r, box: { x0: x - r, x1: x + r, y0: y - r, y1: y + r } });
  }
  polygon(poly, clear = 0) {
    if (poly.length < 3) return;
    const b = polygonBounds(poly);
    this.add({ kind: 'polygon', poly, clear, box: { x0: b.x0 - clear, x1: b.x1 + clear, y0: b.y0 - clear, y1: b.y1 + clear } });
  }
  segment(x1, y1, x2, y2, clear) {
    // Clip long map connections to this scene before splitting them into small grid-friendly pieces.
    const b = this.bounds, dx = x2 - x1, dy = y2 - y1;
    let from = 0, to = 1;
    if (b) for (const [p, q] of [[-dx, x1 - b.x0 + clear], [dx, b.x1 + clear - x1], [-dy, y1 - b.y0 + clear], [dy, b.y1 + clear - y1]]) {
      if (!p) { if (q < 0) return; continue; }
      const t = q / p;
      if (p < 0) from = Math.max(from, t); else to = Math.min(to, t);
      if (from > to) return;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * (to - from) / this.cellSize));
    // Long world roads must not allocate a record per tiny townscape cell.
    if (steps > 256) {
      const ax = x1 + dx * from, ay = y1 + dy * from, bx = x1 + dx * to, by = y1 + dy * to;
      this.large.push({ kind: 'segment', unsplit: true, x1: ax, y1: ay, x2: bx, y2: by, clear,
        box: { x0: Math.min(ax, bx) - clear, x1: Math.max(ax, bx) + clear, y0: Math.min(ay, by) - clear, y1: Math.max(ay, by) + clear } });
      return;
    }
    for (let i = 0; i < steps; i++) {
      const a = from + (to - from) * i / steps, z = from + (to - from) * (i + 1) / steps;
      const ax = x1 + dx * a, ay = y1 + dy * a, bx = x1 + dx * z, by = y1 + dy * z;
      this.add({ kind: 'segment', x1: ax, y1: ay, x2: bx, y2: by, clear,
        box: { x0: Math.min(ax, bx) - clear, x1: Math.max(ax, bx) + clear, y0: Math.min(ay, by) - clear, y1: Math.max(ay, by) + clear } });
    }
  }
  recordsInBox(box, margin = 0) {
    const records = new Set(), out = [];
    const add = record => {
      if (records.has(record)) return;
      records.add(record);
      const b = record.box;
      if (b.x1 + margin >= box.x0 && b.x0 - margin <= box.x1 && b.y1 + margin >= box.y0 && b.y0 - margin <= box.y1) out.push(record);
    };
    const x0 = Math.floor((box.x0 - margin) / this.cellSize), x1 = Math.floor((box.x1 + margin) / this.cellSize);
    const y0 = Math.floor((box.y0 - margin) / this.cellSize), y1 = Math.floor((box.y1 + margin) / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.cells.size * 4) {
      for (const cell of this.cells.values()) for (const record of cell) add(record);
    } else for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      for (const record of this.cells.get(`${x},${y}`) || []) add(record);
    }
    for (const record of this.large) add(record);
    return out;
  }
  blocks(x, y, r) {
    const stamp = ++this.stamp;
    const hits = record => {
      if (record.stamp === stamp) return false;
      record.stamp = stamp;
      this.probes++;
      const b = record.box;
      if (x + r < b.x0 || x - r > b.x1 || y + r < b.y0 || y - r > b.y1) return false;
      this.checks++;
      if (record.kind === 'circle') return Math.hypot(x - record.x, y - record.y) <= r + record.r;
      if (record.kind === 'segment') return pointNearSegment(x, y, record.x1, record.y1, record.x2, record.y2, r + record.clear);
      return polygonNearCircle(record.poly, x, y, r + record.clear);
    };
    const x0 = Math.floor((x - r) / this.cellSize), x1 = Math.floor((x + r) / this.cellSize);
    const y0 = Math.floor((y - r) / this.cellSize), y1 = Math.floor((y + r) / this.cellSize);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.cells.size * 4) {
      for (const cell of this.cells.values()) for (const record of cell) if (hits(record)) return true;
    } else for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const cell = this.cells.get(`${gx},${gy}`);
      if (cell) for (const record of cell) if (hits(record)) return true;
    }
    for (const record of this.large) if (hits(record)) return true;
    return false;
  }
}

// ---- collision helpers (convex polygons are arrays of [x, y]) -----------------------------------------------------
export function polygonBounds(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

function project(poly, ax, ay) {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of poly) { const d = x * ax + y * ay; if (d < min) min = d; if (d > max) max = d; }
  return [min, max];
}

// True when two convex polygons overlap or come closer than `margin` along some axis.
export function polygonsOverlap(a, b, margin = 0) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      let ax = y1 - y2, ay = x2 - x1;
      const length = Math.hypot(ax, ay);
      if (!length) continue;
      ax /= length; ay /= length;
      const [minA, maxA] = project(a, ax, ay), [minB, maxB] = project(b, ax, ay);
      if (maxA + margin < minB || maxB + margin < minA) return false;
    }
  }
  return true;
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const side = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return side(ax, ay, bx, by, cx, cy) !== side(ax, ay, bx, by, dx, dy) && side(cx, cy, dx, dy, ax, ay) !== side(cx, cy, dx, dy, bx, by);
}

function segmentDistance(ax, ay, bx, by, cx, cy, dx, dy) {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(distanceToSegment(ax, ay, cx, cy, dx, dy), distanceToSegment(bx, by, cx, cy, dx, dy),
    distanceToSegment(cx, cy, ax, ay, bx, by), distanceToSegment(dx, dy, ax, ay, bx, by));
}

// True when the polygon contains the segment's end, crosses it, or lies within `clearance` of it.
export function polygonNearSegment(poly, x1, y1, x2, y2, clearance = 0) {
  if (pointInPolygon(x1, y1, poly) || pointInPolygon(x2, y2, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length];
    if (segmentDistance(px, py, qx, qy, x1, y1, x2, y2) <= clearance) return true;
  }
  return false;
}

export function polygonNearCircle(poly, cx, cy, radius) {
  if (pointInPolygon(cx, cy, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length];
    if (distanceToSegment(cx, cy, px, py, qx, qy) <= radius) return true;
  }
  return false;
}

export function buildingGroundClear(poly, roads, water, pools, margin = 0) {
  const box = polygonBounds(poly);
  const nearby = s => Math.max(s.x1, s.x2) + s.clear + margin >= box.x0 &&
    Math.min(s.x1, s.x2) - s.clear - margin <= box.x1 && Math.max(s.y1, s.y2) + s.clear + margin >= box.y0 &&
    Math.min(s.y1, s.y2) - s.clear - margin <= box.y1;
  for (const road of roads) if (nearby(road) && polygonNearSegment(poly, road.x1, road.y1, road.x2, road.y2, road.clear + margin)) return false;
  const streams = water.filter(nearby), ponds = pools.filter(pool => polygonsOverlap(poly, pool));
  if (!streams.length && !ponds.length) return true;
  let samples = 0, wet = 0;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    const px = box.x0 + (x + 0.5) * (box.x1 - box.x0) / 6, py = box.y0 + (y + 0.5) * (box.y1 - box.y0) / 6;
    if (!pointInPolygon(px, py, poly)) continue;
    samples++;
    if (ponds.some(pool => pointInPolygon(px, py, pool)) || streams.some(s => pointNearSegment(px, py, s.x1, s.y1, s.x2, s.y2, s.clear))) wet++;
  }
  // Keep at least a quarter of the roof footprint on dry ground, even where waterways meet.
  return samples > 0 && wet <= samples * 0.75;
}

export function clearMinorRoads(lines, index, clearance) {
  const out = [];
  for (const line of lines) {
    let current = null;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1];
      if (!dx && !dy) continue;
      const bounds = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
      const blocked = [];
      for (const record of index.recordsInBox(bounds, clearance)) {
        if (record.unsplit) {
          // Clip against the actual stroke, not the world-sized diagonal bounding box.
          const sx = record.x2 - record.x1, sy = record.y2 - record.y1, length = Math.hypot(sx, sy);
          const ux = sx / length, uy = sy / length, radius = record.clear + clearance;
          const x = (a[0] - record.x1) * ux + (a[1] - record.y1) * uy;
          const y = -(a[0] - record.x1) * uy + (a[1] - record.y1) * ux;
          const vx = dx * ux + dy * uy, vy = -dx * uy + dy * ux;
          let from = 0, to = 1;
          for (const [p, q] of [[-vx, x], [vx, length - x], [-vy, y + radius], [vy, radius - y]]) {
            if (!p) { if (q < 0) { from = 1; to = 0; break; } continue; }
            if (p < 0) from = Math.max(from, q / p); else to = Math.min(to, q / p);
          }
          if (from <= to) blocked.push([from, to]);
          for (const [cx, cy] of [[record.x1, record.y1], [record.x2, record.y2]]) {
            const px = a[0] - cx, py = a[1] - cy, aa = dx * dx + dy * dy, bb = 2 * (px * dx + py * dy);
            const discriminant = bb * bb - 4 * aa * (px * px + py * py - radius * radius);
            if (discriminant < 0) continue;
            const root = Math.sqrt(discriminant), lo = Math.max(0, (-bb - root) / (2 * aa)), hi = Math.min(1, (-bb + root) / (2 * aa));
            if (lo <= hi) blocked.push([lo, hi]);
          }
          continue;
        }
        const box = record.box;
        let from = 0, to = 1;
        for (const [p, q] of [[-dx, a[0] - box.x0 + clearance], [dx, box.x1 + clearance - a[0]],
          [-dy, a[1] - box.y0 + clearance], [dy, box.y1 + clearance - a[1]]]) {
          if (!p) { if (q < 0) { from = 1; to = 0; break; } continue; }
          const t = q / p;
          if (p < 0) from = Math.max(from, t); else to = Math.min(to, t);
        }
        if (from <= to) blocked.push([from, to]);
      }
      blocked.sort((a, b) => a[0] - b[0]);
      let start = 0;
      const append = (from, to) => {
        if (to - from < 1e-9) return;
        const p = [a[0] + dx * from, a[1] + dy * from], q = [a[0] + dx * to, a[1] + dy * to];
        const last = current && current[current.length - 1];
        if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 1e-9) current.push(q);
        else { current = [p, q]; out.push(current); }
      };
      for (const [from, to] of blocked) {
        append(start, from);
        start = Math.max(start, to);
      }
      append(start, 1);
      if (start >= 1) current = null;
    }
  }
  return out;
}

export function pointNearSegment(px, py, x1, y1, x2, y2, clearance) {
  return distanceToSegment(px, py, x1, y1, x2, y2) <= clearance;
}

// Exact interval of a walking edge covered by a round-capped water/road stroke.
function strokeInterval(a, b, stroke) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  const sx = stroke.x2 - stroke.x1, sy = stroke.y2 - stroke.y1, length = Math.hypot(sx, sy);
  const intervals = [], radius = stroke.clear;
  const cap = (x, y) => {
    const ox = a.x - x, oy = a.y - y, dot = ox * dx + oy * dy;
    const disc = dot * dot - length2 * (ox * ox + oy * oy - radius * radius);
    if (disc < 0) return;
    const root = Math.sqrt(disc), from = Math.max(0, (-dot - root) / length2), to = Math.min(1, (-dot + root) / length2);
    if (from <= to) intervals.push([from, to]);
  };
  cap(stroke.x1, stroke.y1); cap(stroke.x2, stroke.y2);
  if (length) {
    const ux = sx / length, uy = sy / length, ox = a.x - stroke.x1, oy = a.y - stroke.y1;
    let from = 0, to = 1;
    for (const [at, delta, min, max] of [
      [ox * ux + oy * uy, dx * ux + dy * uy, 0, length],
      [-ox * uy + oy * ux, -dx * uy + dy * ux, -radius, radius],
    ]) {
      if (Math.abs(delta) < 1e-12) { if (at < min || at > max) { from = 1; to = 0; break; } }
      else {
        const p = (min - at) / delta, q = (max - at) / delta;
        from = Math.max(from, Math.min(p, q)); to = Math.min(to, Math.max(p, q));
      }
    }
    if (from <= to) intervals.push([from, to]);
  }
  return intervals.length ? [Math.min(...intervals.map(i => i[0])), Math.max(...intervals.map(i => i[1]))] : null;
}

export function walkCreekAllowed(a, b, creeks, roads) {
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-10) return true;
  const wet = creeks.map(s => strokeInterval(a, b, s)).filter(Boolean);
  if (!wet.length) return true;
  const covered = roads.map(s => strokeInterval(a, b, s)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  for (const [from, to] of wet) {
    let end = from;
    for (const interval of covered) {
      if (interval[0] > end + 1e-8) break;
      if (interval[1] >= end) end = interval[1];
      if (end >= to - 1e-8) break;
    }
    if (end < to - 1e-8 || !covered.some(i => i[0] <= from + 1e-8 && i[1] >= from - 1e-8)) return false;
  }
  return true;
}

// What a walking edge from a to b costs: its length, times AVOID_COST when it runs through a tree or other natural feature
// (avoid.circles: {x, y, r}), along or over a river (avoid.segments: {x1, y1, x2, y2, clear}) or across a building
// (avoid.buildings: {poly, box, door}). A building's own door (`door`, a node index) may be walked to: an edge ending at
// node ia or ib does not count as crossing the building whose door that node is.
export function walkEdgeCost(a, b, avoid, ia = -1, ib = -1) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const blocked = () => {
    for (const c of avoid.circles || []) {
      if (c.x + c.r < x0 || c.x - c.r > x1 || c.y + c.r < y0 || c.y - c.r > y1) continue;
      if (distanceToSegment(c.x, c.y, a.x, a.y, b.x, b.y) < c.r) return true;
    }
    for (const s of avoid.segments || []) {
      if (Math.max(s.x1, s.x2) + s.clear < x0 || Math.min(s.x1, s.x2) - s.clear > x1 || Math.max(s.y1, s.y2) + s.clear < y0 || Math.min(s.y1, s.y2) - s.clear > y1) continue;
      if (segmentDistance(a.x, a.y, b.x, b.y, s.x1, s.y1, s.x2, s.y2) < s.clear) return true;
    }
    for (const p of avoid.buildings || []) {
      if (p.box.x1 < x0 || p.box.x0 > x1 || p.box.y1 < y0 || p.box.y0 > y1) continue;
      if (p.door !== undefined && p.door >= 0 && (p.door === ia || p.door === ib)) continue;
      if (polygonNearSegment(p.poly, a.x, a.y, b.x, b.y, 0)) return true;
    }
    return false;
  };
  return length * (blocked() ? AVOID_COST : 1);
}

// ---- walking people ----------------------------------------------------------------------------------------------
// graph: { nodes: [{x, y}], adj: [[index...]], cost?: [[number...]] }. The cheapest path between two nodes, or null. Without
// `cost` every hop costs the same; with it (cost[i][k] for the edge to adj[i][k]) people take a longer way round to avoid
// expensive edges (ones through trees, along rivers or across buildings) when there is one.
export function graphRoute(graph, from, to) {
  if (from === to) return [from];
  if (graph.cost) return cheapestRoute(graph, from, to);
  const previous = new Map([[from, -1]]), queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    for (const next of graph.adj[at]) {
      if (previous.has(next)) continue;
      previous.set(next, at);
      if (next === to) {
        const route = [to];
        for (let n = at; n !== -1; n = previous.get(n)) route.push(n);
        return route.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

// How long (seconds) a person takes to fade in or out when going into or coming out of a building or tent.
export const WALKER_FADE_SECONDS = 0.6;

export function buildingDoorPoint(poly, street) {
  let best = null, distance = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    const t = length2 ? clamp(((street.x - a[0]) * dx + (street.y - a[1]) * dy) / length2, 0, 1) : 0;
    const point = { x: a[0] + dx * t, y: a[1] + dy * t }, d = Math.hypot(point.x - street.x, point.y - street.y);
    if (d < distance) { distance = d; best = point; }
  }
  return best;
}

// How many times its length an edge costs when it runs through something people would rather walk around.
export const AVOID_COST = 25;
function cheapestRoute(graph, from, to) {
  const n = graph.adj.length, best = new Float64Array(n).fill(Infinity), previous = new Int32Array(n).fill(-1), heap = [];
  const push = (node, d) => {
    heap.push([d, node]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  best[from] = 0; push(from, 0);
  while (heap.length) {
    const [d, at] = pop();
    if (d > best[at]) continue;
    if (at === to) break;
    const list = graph.adj[at], costs = graph.cost[at] || [];
    for (let k = 0; k < list.length; k++) {
      const next = list[k], nd = d + (costs[k] >= 0 ? costs[k] : 1);
      if (nd < best[next]) { best[next] = nd; previous[next] = at; push(next, nd); }
    }
  }
  if (best[to] === Infinity) return null;
  const route = [to];
  for (let at = previous[to]; at !== -1; at = previous[at]) route.push(at);
  return route.reverse();
}

// A townscape's people are shared out between indoors and out: at any moment between 30% and 60% of them are in sight (a lone
// person cannot be split, so a townscape of one or two always shows its people). `quota.visible` is the number in sight now.
export const VISIBLE_MIN_FRACTION = 0.3, VISIBLE_MAX_FRACTION = 0.6;
export function visibleQuota(count, startFraction = 0.45) {
  const min = Math.ceil(count * VISIBLE_MIN_FRACTION - 1e-9), max = Math.max(min, Math.floor(count * VISIBLE_MAX_FRACTION + 1e-9));
  return { count, min, max, visible: Math.max(min, Math.min(max, Math.round(count * startFraction))) };
}

// A person who walks a route of graph nodes at `speed` map pixels per second, pausing at the end of each trip. Reaching a door
// (a node in graph.doorForms) takes them inside when the townscape's quota allows it (see visibleQuota, `walker.quota`): they
// fade out, stay out of sight for the rest of the pause, then come out again when the quota has room, fading in; walker.fade
// (0..1) is how visible they are. Street corners and road ends are just pauses in plain sight; spots (graph.spots) are longer
// stops. pickDestination(walker) gives the next node to walk to; walker.target is where they are going (or last went) and
// walker.trip counts their trips.
function walkerLeg(walker, graph) {
  const a = graph.nodes[walker.route[walker.leg]], b = graph.nodes[walker.route[walker.leg + 1]];
  if (!b) return { a, b: a, mid: a, length: 1 };
  if (walker.bendRoute === walker.route && walker.bendLeg === walker.leg) return walker.bend;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  let mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (length > 1e-6 && graph.bendAllowed) {
    const phase = ((walker.id || 0) * 1.618 + (walker.trip || 0) * 2.399 + walker.leg * 0.73);
    const offset = Math.sin(phase) * Math.min(length * 0.08, graph.bendLimit || length * 0.02);
    const bend = { x: mid.x - (b.y - a.y) / length * offset, y: mid.y + (b.x - a.x) / length * offset };
    if (graph.bendAllowed(a, bend) && graph.bendAllowed(bend, b)) mid = bend;
  }
  walker.bendRoute = walker.route; walker.bendLeg = walker.leg;
  walker.bend = { a, b, mid, length: Math.hypot(mid.x - a.x, mid.y - a.y) + Math.hypot(b.x - mid.x, b.y - mid.y) || 1 };
  return walker.bend;
}
export function stepWalker(walker, graph, dt, pickDestination, rand, visitRoute = null, onArrival = null, planRoute = null) {
  if (walker.fade === undefined) walker.fade = 1;
  const quota = walker.quota;
  // A pinned person (see the Population Panel's pins) stays in sight: one indoors comes straight back out.
  if (walker.pinned && walker.inside && !walker.exiting && walker.wait > 0) {
    const elapsed = Math.max(0, (walker.waitTotal || 0) - walker.wait);
    walker.wait = Math.min(walker.wait, WALKER_FADE_SECONDS * 0.9); walker.waitTotal = elapsed + walker.wait;
    walker.exiting = true;
    if (quota) quota.visible++;
  }
  if (walker.wait > 0) {
    walker.wait -= dt;
    if (walker.inside) {
      const remaining = Math.max(0, walker.wait);
      if (!walker.exiting && remaining < WALKER_FADE_SECONDS) {
        // Not yet time to come out if too many are already in sight: stay in a little longer.
        if (quota && quota.visible >= quota.max) { walker.wait += WALKER_FADE_SECONDS; walker.waitTotal += WALKER_FADE_SECONDS; return; }
        walker.exiting = true;
        if (quota) quota.visible++;
      }
      const total = walker.waitTotal || 1, elapsed = Math.max(0, total - Math.max(0, walker.wait));
      walker.fade = Math.max(1 - Math.min(1, elapsed / WALKER_FADE_SECONDS), 1 - Math.min(1, Math.max(0, walker.wait) / WALKER_FADE_SECONDS));
    }
    return;
  }
  walker.inside = false; walker.exiting = false; walker.fade = 1;
  if (walker.strollPause > 0) { walker.strollPause = Math.max(0, walker.strollPause - dt); return; }
  if (!walker.route || walker.leg >= walker.route.length - 1) {
    if (onArrival) onArrival(walker);
    walker.stayActivity = walker.activity;
    walker.stayTarget = walker.node;
    const door = !!(graph.doorForms && graph.doorForms.has(walker.node)) && !walker.pinned && !(walker.stayActivity && walker.stayActivity.outside);
    let goesIn = door && (!quota || quota.visible - 1 >= quota.min);
    if (door && !goesIn && quota && quota.people) {
      // The townscape can't spare anyone from sight: trade places with someone indoors, who comes out as this person goes in.
      const other = quota.people.find(p => p !== walker && p.inside && !p.exiting);
      if (other) {
        const elapsed = Math.max(0, (other.waitTotal || 0) - Math.max(0, other.wait));
        other.wait = WALKER_FADE_SECONDS * 0.9; other.waitTotal = elapsed + other.wait;
        other.exiting = true; quota.visible++;
        goesIn = true;
      }
    }
    walker.wait = 1 + rand() * 3 + (goesIn ? 2 * WALKER_FADE_SECONDS : 0);
    // At a spot (a tree, a riverbank, a resource...: graph.spots) a person stays a while doing something there.
    if (!goesIn && graph.spots && graph.spots.has(walker.node)) walker.wait += 3 + rand() * 5;
    if (walker.stayActivity && walker.stayActivity.node === walker.node) walker.wait = Math.max(walker.wait, walker.stayActivity.duration || 5);
    walker.waitTotal = walker.wait; walker.inside = goesIn;
    if (goesIn && quota) quota.visible--;
    const resuming = walker.resumeTarget !== undefined;
    walker.activity = null;
    let target = resuming ? walker.resumeTarget : pickDestination(walker);
    delete walker.resumeTarget;
    let route = target === undefined || !planRoute ? undefined : planRoute(walker, target);
    if (route === undefined) route = target === undefined ? null : graphRoute(graph, walker.node, target);
    if (!resuming && route && route.length > 1 && visitRoute) {
      const visit = visitRoute(walker, route, target);
      if (visit) { route = visit.route; target = visit.target; }
    }
    walker.route = route && route.length > 1 ? route : null;
    if (!walker.route && target !== walker.node) walker.activity = null;
    walker.target = walker.route ? target : walker.node;
    walker.trip = (walker.trip || 0) + 1;
    walker.leg = 0; walker.t = 0;
    if (walker.groupTravel && !goesIn && !walker.stayActivity) walker.wait = walker.waitTotal = 0.2 + rand() * 0.5;
    return;
  }
  if (graph.casualPauses && !walker.clump && !walker.runnerDuty && walker.pauseTrip !== walker.trip &&
      walker.t > 0.2 && walker.t < 0.8 && rand() < 1 - Math.exp(-Math.max(0, dt) * 0.12)) {
    walker.pauseTrip = walker.trip; walker.strollPause = 0.8 + rand() * 2.2;
    return;
  }
  let travel = Math.max(0, walker.speed * dt);
  while (walker.leg < walker.route.length - 1) {
    const leg = walkerLeg(walker, graph), left = leg.length * (1 - walker.t);
    if (travel < left) { walker.t += travel / leg.length; break; }
    travel -= left; walker.leg++; walker.node = walker.route[walker.leg]; walker.t = 0;
  }
  const leg = walkerLeg(walker, graph), second = walker.t >= 0.5;
  const from = second ? leg.mid : leg.a, to = second ? leg.b : leg.mid, t = second ? walker.t * 2 - 1 : walker.t * 2;
  walker.x = from.x + (to.x - from.x) * t; walker.y = from.y + (to.y - from.y) * t;
}

// A person sent somewhere by a command (see the commands module): `walker.cmd` is { route, x, y } — graph nodes to follow, then
// the target point (x, y) off the network. They walk from wherever they stand, along the route, on to the target, in plain sight
// (paused or not) and at a steady walking pace, never jumping; then stay there for the rest of the turn (`walker.cmd.arrived`).
// Without a route they walk straight to the target.
export const COMMAND_PACE = 1.1;
export function stepCommanded(walker, graph, dt) {
  const cmd = walker.cmd;
  if (!cmd) return;
  if (cmd.blocked) return;
  walker.inside = false; walker.exiting = false; walker.fade = 1; walker.wait = 0;
  if (!cmd.pts) {
    const pts = [{ x: walker.x, y: walker.y, node: walker.node }];
    for (const n of cmd.route || []) { const p = graph.nodes[n]; if (p) pts.push({ x: p.x, y: p.y, node: n }); }
    if (cmd.x != null) pts.push({ x: cmd.x, y: cmd.y, node: undefined });
    if (graph.edgeAllowed && pts.some((point, i) => i > 0 && !graph.edgeAllowed(pts[i - 1], point))) {
      cmd.blocked = true;
      return;
    }
    cmd.pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6 || p.node !== undefined);
    cmd.seg = 0; cmd.t = 0;
  }
  const pts = cmd.pts, last = pts.length - 1;
  if (cmd.arrived || cmd.seg >= last) {
    const end = pts[last];
    walker.x = end.x; walker.y = end.y;
    cmd.arrived = true;
    return;
  }
  let travel = Math.max(0, walker.speed * COMMAND_PACE * dt);
  while (cmd.seg < last) {
    const a = pts[cmd.seg], b = pts[cmd.seg + 1], length = Math.hypot(b.x - a.x, b.y - a.y);
    const left = length * (1 - cmd.t);
    if (travel < left) { cmd.t += length > 0 ? travel / length : 1; break; }
    travel -= left; cmd.seg++; cmd.t = 0;
    if (b.node !== undefined) walker.node = b.node;
  }
  if (cmd.seg >= last) return stepCommanded(walker, graph, 0);
  const from = pts[cmd.seg], to = pts[cmd.seg + 1];
  walker.x = from.x + (to.x - from.x) * cmd.t; walker.y = from.y + (to.y - from.y) * cmd.t;
}

// The cheapest way from every node to `goal` at once (Dijkstra from the goal, the network being two-way): next[n] is the node
// after n on the way to the goal (-1 at the goal or where it can't be reached). Many walkers heading for one place share it.
export function routeTree(graph, goal) {
  const n = graph.adj.length, best = new Float64Array(n).fill(Infinity), next = new Int32Array(n).fill(-1), heap = [];
  if (goal < 0 || goal >= n) return { goal, next, best };
  const push = (node, d) => {
    heap.push([d, node]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  best[goal] = 0; push(goal, 0);
  while (heap.length) {
    const [d, at] = pop();
    if (d > best[at]) continue;
    const list = graph.adj[at], costs = graph.cost ? graph.cost[at] || [] : [];
    for (let k = 0; k < list.length; k++) {
      const node = list[k], nd = d + (costs[k] >= 0 ? costs[k] : 1);
      if (nd < best[node]) { best[node] = nd; next[node] = at; push(node, nd); }
    }
  }
  return { goal, next, best };
}
// The route (nodes) from `from` to the tree's goal, or null when there is none.
export function routeFromTree(tree, from) {
  if (!tree || from < 0 || from >= tree.next.length) return null;
  if (from === tree.goal) return [from];
  if (tree.best[from] === Infinity) return null;
  const route = [from];
  for (let at = from, guard = 0; at !== tree.goal && guard < tree.next.length; guard++) { at = tree.next[at]; if (at < 0) return null; route.push(at); }
  return route;
}