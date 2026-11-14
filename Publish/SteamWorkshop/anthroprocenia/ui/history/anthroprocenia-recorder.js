/**
 * Civilization VII Anthroprocenia — Recorder
 *
 * Passive, no UI. Each turn records a compact frame — territory owner + tile class, units,
 * constructibles, settlements, man-made wonders, visibility, suzerains, player identity /
 * relationships / victory points — into the GAME config store (survives save/reload AND age
 * transitions; see gameStore below), plus a static terrain base map. Every age's first frame
 * (and the first record of a session) is a snapshot; other frames are diffs.
 *
 * ---------------------------------------------------------------------------
 * STORAGE FORMAT (v14) — game-config store, keys "CivAnthroprocenia__<obj>_<key>"
 * ---------------------------------------------------------------------------
 * Records are keyed by a GLOBAL frame index gi that runs across all ages (in-age turn numbers
 * reset to 1 each age, so they can't be the key — see record()).
 *
 * Object "meta", key "index" → JSON manifest:
 *   { v:14, rev, w, h, frames:[[ageId, inAgeTurn, snap, turnDate], …], ages:[[startGi, ageId, ageName], …],
 *     unitTypes:[[hash, name, cat], …], buildingTypes:[[hash, name, classCode], …],
 *     wonderTypes:[[hash, name], …], victoryTypes:[label, …] }
 *   rev: bumps whenever a record changed drawable content — lets playback detect same-turn
 *        re-records (mid-turn "record on map open") and drop its caches (see anthroprocenia-playback.js).
 *   Type tables: names are resolved + baked in at record time and a small index is stored per
 *   entity, so playback never depends on a hash surviving game updates / mod changes.
 *
 * Object "turns", key "t<gi>" → { t:<inAgeTurn>, s:0|1, terr, bld, set, vis, won }
 *   terr: flat packTerr(plot, owner, cls) ints — snapshot lists every owned plot; diff lists only
 *         plots whose owner or cls changed (owner -1 = became unowned).
 *     cls: 0 normal/rural | 1 urban | 2 city-center (non-capital city, or independent power)
 *          | 3 town center | 4 capital center
 *   bld: [[plot, [buildingTypeIdx…]], …] delta ([] = all constructibles gone)
 *   set: [[centerPlot, name, pop, typeLabel, [yields]], …] delta ([centerPlot] = removed)
 *   vis: flat packVis(plot, state) ints, local-observer visibility delta
 *        (0 hidden / 1 revealed / 2 in-LOS)
 *   won: [[plot, owner, wonderTypeIdx], …] delta ([plot] = removed)
 *
 * Object "units", key "u<gi>" → { t, u: flat packUnit(plot, owner, unitTypeIdx) ints, h: health percent by unit }
 *   (full list every turn; units move too much to diff)
 *     cat (in the unit-type table): 0 land military | 1 naval | 2 civilian/other land | 3 air
 *
 * Object "suze", key "s<gi>" → { t, s:[[cityStateId, suzerainId], …] } (full list every turn)
 * Object "players", key "p<gi>" → { t, s, vp, idd, met, rel } — victory points + met full each
 *   turn; identity (including government) + relationships delta-coded (see anthroprocenia-playback.js)
 *
 * Object "base" (static layers):
 *   key "terrain" → JSON array length w*h of terrain class codes (captured once per game):
 *     0 deep ocean | 1 coastal sea | 2 mountain | 3 desert | 4 plains |
 *     5 grassland | 6 tropical | 7 tundra | 8 other land | 9 lake | 10 navigable river
 *   key "natural" → plotIndexes that are NATURAL wonders (captured once)
 *   key "res_<ageId>" → [[plot, resourceClassCode, resourceType], …] per age (class → dot color via
 *       RESOURCE_CLASS_CODE; type → exact resource name in the tooltip. Older recordings omit the 3rd field.)
 *
 * plotIndex is the engine index (GameplayMap.getIndexFromXY / getLocationFromIndex).
 * Reconstruction: nearest snapshot <= gi, then apply diffs forward (anthroprocenia-playback.js).
 * ---------------------------------------------------------------------------
 */

import { PEOPLE_PROGRESSION_NODES } from '../map/anthroprocenia-people.js';
import { currentRealisticDate, REALISTIC_AGES } from '../map/anthroprocenia-calendar.js';
import { captureMapDetails } from '../map/anthroprocenia-map-details.js';

const TAG = '[ANTHROPROCENIA]';
const STORE_NS = 'CivAnthroprocenia__';   // key prefix in the GAME config store (Configuration.getGame/editGame)
const DATA_VERSION = 14;  // v14: compact encoding — territory/units/visibility bit-packed into flat int arrays; wonders delta-coded + type-indexed; terrain captured once
// Bit-packing for the numeric per-plot layers → one integer per element in a FLAT array (drops JSON's
// per-element brackets + field commas). Arithmetic (not bitwise) so it's safe past 32 bits on big maps.
// Playback (anthroprocenia-playback.js) must decode with the identical math — keep these in sync.
function packTerr(i, owner, cls) { return i * 1024 + ((owner + 1) & 127) * 8 + (cls & 7); }   // owner -1 (unowned) → 0
function packUnit(plot, owner, typeIdx) { return plot * 65536 + (owner & 63) * 1024 + (typeIdx & 1023); }
function packVis(i, st) { return i * 4 + (st & 3); }
const OBJ_META = 'meta';
const OBJ_TURNS = 'turns';
const OBJ_BASE = 'base';
const OBJ_UNITS = 'units';
const OBJ_WONDERS = 'wonders';
const OBJ_SUZE = 'suze';
const OBJ_PLAYERS = 'players';   // per-turn victory-type points + delta-coded identity (record-only for now)
const KEY_INDEX = 'index';
const KEY_TERRAIN = 'terrain';
const KEY_NATURAL = 'natural';
const KEY_FEATURES = 'features';
const KEY_FEATURES_V2 = 'features_v2';
const KEY_FEATURES_V3 = 'features_v3';   // v3 adds ice and the other single-tile features (codes 6-12)
const KEY_FEATURES_V4 = 'features_v4';
let featureCaptureUnavailableLogged = false;
const KEY_RES = 'res';   // per-age resource layer: OBJ_BASE key 'res_<ageId>' → [[plotIndex, classCode], …]
// Resource class → compact code (matches playback's RESOURCE_COLOR).
const RESOURCE_CLASS_CODE = { RESOURCECLASS_BONUS: 0, RESOURCECLASS_CITY: 1, RESOURCECLASS_EMPIRE: 2, RESOURCECLASS_TREASURE: 3, RESOURCECLASS_FACTORY: 4 };
const MAX_PLAYER_ID = 63;   // sweep all slots so barbarians (alive=false, ~id 63) and independents are included

// Civ 7 only writes console.warn/console.error to Logs/UI.log; console.log is dropped.
const DEBUG = false;   // set true to re-enable the mod's [ANTHROPROCENIA] informational logging
function log(msg) { if (DEBUG) console.warn(`${TAG} ${msg}`); }
function err(msg) { console.error(`${TAG} ${msg}`); }

// --- session state -----------------------------------------------------------
let started = false;
let initializing = false;
let initPending = false;
let initAttempts = 0;
let gameplayReady = false;
let mapW = 0, mapH = 0;
let prevOwner = null;      // Int16Array[w*h], -1 unowned
let prevCls = null;        // Int8Array[w*h]
let prevVis = null;        // Int8Array[w*h]: 0 hidden / 1 revealed / 2 in-LOS (local observer); for delta-coding visibility
let prevBuildings = new Map();   // plotIndex -> sorted [buildingTypeIndex]; for delta-coding constructibles
let prevDamaged = new Map();     // plotIndex -> sorted [typeIndex] of pillaged constructibles; for delta-coding
let prevSettlements = new Map(); // centerPlotIndex -> [name, pop, type, [yields]]; for delta-coding settlements
let lastUnitsJson = '', lastSuzeJson = '', lastSocietyJson = '', lastRelJson = '';   // last written per-frame payloads, for the manifest-rev change check
let prevIdentity = new Map();    // playerId -> [leader, civ, adjective, primaryInt, secondaryInt, civType, csType]; for delta-coding identity
let prevRelationships = new Map(); // "a,b" (a<b majors) -> broad relationship code; for delta-coding relationships
let prevWonders = new Map();      // plotIndex -> [ownerId, wonderTypeIndex]; for delta-coding man-made wonders
let manifest = null;
let indexedFrames = null, indexedLength = 0;
const frameIndices = new Map(), recordedAges = new Set();
function frameIndex(age, turn) {
  const frames = manifest.frames;
  if (indexedFrames !== frames || indexedLength > frames.length) {
    indexedFrames = frames; indexedLength = 0; frameIndices.clear(); recordedAges.clear();
  }
  for (; indexedLength < frames.length; indexedLength++) {
    const frame = frames[indexedLength];
    frameIndices.set(`${frame[0]}|${frame[1]}`, indexedLength); recordedAges.add(frame[0]);
  }
  return frameIndices.get(`${age}|${turn}`) ?? -1;
}
let lastTurnRecorded = -1;
// Delta baselines are pinned to the PREVIOUS frame (gi-1): captured when a gi is first recorded and
// restored for any RE-record of the same gi. Without this, a second record of a turn (e.g. record-on-open
// mid-turn, then the end-of-turn record — same gi) would diff against a baseline the first record already
// advanced, so the overwrite silently drops the first record's changes (a founded city vanishing until the
// next age snapshot). base* hold references to the gi-1 prev* objects; prev* are always REASSIGNED (never
// mutated in place), so the references stay valid.
let lastRecordedGi = -1;
let baseOwner = null, baseCls = null, baseVis = null;
let baseBuildings = new Map(), baseSettlements = new Map(), baseWonders = new Map(), baseDamaged = new Map();
let baseIdentity = new Map(), baseRelationships = new Map();

// Persistence: the GAME config store (Configuration.editGame().setValue / getGame().getValue). Unlike the
// GameTutorial-backed Catalog we used before, this SURVIVES age transitions (verified via the community
// History mod), so the replay spans all ages in one game. Same getObject(id).write/read(key) shape as the
// old Catalog, so the call sites are unchanged; keys are namespaced STORE_NS + id + '_' + key.
const LEGACY_STORE_NS = ['CivRew', 'ind__'].join('');   // the earlier key prefix: saves recorded under it keep their history
function cfgGet(k) {
  try {
    const g = (typeof Configuration !== 'undefined' && Configuration.getGame) ? Configuration.getGame() : null;
    if (!g || !g.getValue) return null;
    let v = g.getValue(k);
    if ((v == null || v === '') && k.indexOf(STORE_NS) === 0) { const old = g.getValue(LEGACY_STORE_NS + k.slice(STORE_NS.length)); if (old != null && old !== '') v = old; }
    return v;
  } catch (e) { return null; }
}
function cfgSet(k, v) { try { const g = (typeof Configuration !== 'undefined' && Configuration.editGame) ? Configuration.editGame() : null; if (g && g.setValue) { g.setValue(k, v); return true; } } catch (e) {} return false; }
const gameStore = { getObject(id) { const pfx = STORE_NS + id + '_'; return { read: (key) => cfgGet(pfx + key), write: (key, val) => cfgSet(pfx + key, val) }; } };
function getCatalog() { return gameStore; }
// Map View's own saved data (population-panel people, townscape layouts) rides in the same store under OBJ_VIEW; the playback module
// reads it directly and writes through this bridge.
const OBJ_VIEW = 'view';
try { window.AnthroproceniaViewStore = { write(key, val) { return cfgSet(STORE_NS + OBJ_VIEW + '_' + key, val); } }; } catch (e) {}
// Map-label names (regions, rivers, buildings, wars...) are generated procedurally; remembering the first name
// given to each label keeps it identical on every turn, every redraw and after a save/reload, the same way marker
// positions are fixed by their seeds. Stored as one JSON object in the game config store, so it travels with saves.
const NAMES_KEY = STORE_NS + 'label_names';
let namesCache = null, namesFlushTimer = 0, namesDirty = false, namesWriteErrorLogged = false;
function loadNames() {
  if (namesCache) return namesCache;
  let names = {};
  try { const raw = cfgGet(NAMES_KEY); if (raw) names = JSON.parse(raw) || {}; } catch (e) { err(`label names read failed: ${e}`); }
  namesCache = names;
  return names;
}
function flushNames() {
  if (namesFlushTimer) clearTimeout(namesFlushTimer);
  namesFlushTimer = 0;
  if (!namesCache || !namesDirty) return;
  try {
    if (!cfgSet(NAMES_KEY, JSON.stringify(namesCache))) throw new Error('game configuration store is unavailable');
    namesDirty = false;
    namesWriteErrorLogged = false;
  } catch (e) {
    if (!namesWriteErrorLogged) err(`label names write failed: ${e}`);
    namesWriteErrorLogged = true;
    namesFlushTimer = setTimeout(flushNames, 5000);
  }
}
function setStoredName(key, name) {
  const names = loadNames();
  if (typeof name !== 'string' || !name) throw new Error('label name must be a non-empty string');
  if (Object.prototype.hasOwnProperty.call(names, key) && names[key] === name) return name;
  names[key] = name;
  namesDirty = true;
  if (!namesFlushTimer) namesFlushTimer = setTimeout(flushNames, 2000);
  return name;
}
try {
  window.AnthroproceniaNames = {
    get(key) { const names = loadNames(); return Object.prototype.hasOwnProperty.call(names, key) ? names[key] : undefined; },
    // Returns the stored name for key; otherwise stores and returns `name`.
    remember(key, name) {
      const names = loadNames();
      if (Object.prototype.hasOwnProperty.call(names, key)) return names[key];
      if (typeof name !== 'string' || !name) return name;
      return setStoredName(key, name);
    },
    set: setStoredName,
    reset() {
      if (namesFlushTimer) clearTimeout(namesFlushTimer);
      namesFlushTimer = 0; namesCache = null; namesDirty = false; namesWriteErrorLogged = false;
    },   // a different game was loaded
  };
} catch (e) { err(`label name store unavailable: ${e}`); }

// --- map reading -------------------------------------------------------------
/** Tile class for an owned plot: 2 city-center, 1 urban, else 0. */
function tileClass(loc, district) {
  try {
    const d = district === undefined ? Districts.getAtLocation(loc) : district;
    if (d) {
      if (d.type === DistrictTypes.CITY_CENTER) return 2;
      if (d.type === DistrictTypes.URBAN) return 1;
    }
  } catch (e) {}
  return 0;
}

/**
 * Mark settlement CENTER tiles as cls=2. Per-tile Districts only catches major
 * CITY_CENTER districts; independent powers' settlements are IMPROVEMENT_VILLAGE/
 * ENCAMPMENT constructibles, so detect those per-player (culture-borders pattern).
 */
function markCenters(cls) {
  try {
    // Iterate ALL player ids (not Players.getAlive()): a player who has RETIRED/been defeated but whose
    // settlements still stand on the map is dropped from getAlive(), yet remains a major with cities — so
    // getAlive() left their town centers at tileClass()=2 (CITY_CENTER district) and they drew the city dot
    // on the retire turn. This mirrors readSettlements (the tooltip's type channel), which is why the tooltip
    // stayed correct while the dot didn't.
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const player = Players.get(pid);
      if (!player) continue;
      if (player.isIndependent) {
        const cons = player.Constructibles?.getConstructibles?.();
        if (cons) for (const con of cons) {
          const def = GameInfo.Constructibles.lookup(con.type);
          if (def && (def.ConstructibleType === 'IMPROVEMENT_VILLAGE' || def.ConstructibleType === 'IMPROVEMENT_ENCAMPMENT')) {
            const i = GameplayMap.getIndexFromLocation(con.location);
            if (i >= 0 && i < cls.length) cls[i] = 2;
          }
        }
      } else if (player.isMajor) {
        const cities = player.Cities?.getCities?.();
        if (cities) for (const city of cities) {
          const i = GameplayMap.getIndexFromLocation(city.location);
          if (i >= 0 && i < cls.length) cls[i] = city.isTown ? 3 : (city.isCapital ? 4 : 2);
        }
      }
    }
  } catch (e) { err(`markCenters: ${e}`); }
}

/**
 * Occupier of an OCCUPIED district (a district whose controllingPlayer differs from its owner — e.g. an
 * enemy holding an urban district of a besieged, not-yet-captured city), or -1. GameplayMap.getOwner
 * keeps returning the territory owner during occupation, so we attribute occupied district tiles to the
 * occupier here → they render with the occupier's fill + border. (Fully captured cities already report
 * the conqueror via getOwner, and then owner == controllingPlayer, so this returns -1 for them.)
 */
function districtOccupier(loc, district) {
  try {
    const d = district === undefined ? Districts.getAtLocation(loc) : district;
    if (d && d.controllingPlayer != null && d.controllingPlayer >= 0 && d.owner !== d.controllingPlayer) return d.controllingPlayer;
  } catch (e) {}
  return -1;
}

/** Read owner + cls for the whole map. */
function readTiles() {
  const n = mapW * mapH;
  const owner = new Int16Array(n);
  const cls = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const loc = { x: i % mapW, y: Math.floor(i / mapW) };
    let o = GameplayMap.getOwner(loc.x, loc.y);
    let district = null;
    try { district = Districts.getAtLocation(loc); } catch (e) { err(`district at ${i}: ${e}`); }
    const occ = districtOccupier(loc, district);
    if (occ >= 0) o = occ;   // occupied urban district → attribute to the occupier
    if (o === PlayerIds.NO_PLAYER || o < 0) { owner[i] = -1; cls[i] = 0; }
    else { owner[i] = o; cls[i] = tileClass(loc, district); }
  }
  markCenters(cls);
  return { owner, cls };
}

/**
 * Per-tile visibility from the LOCAL OBSERVER's viewpoint → Int8Array: 0 hidden (never seen), 1 revealed
 * (known but not currently in line-of-sight), 2 in-LOS. Powers playback's optional fog-of-war mode, so a
 * mid-game replay doesn't spoil the unexplored map. API: GameplayMap.getRevealedState(observer, x, y).
 */
function localObserverId() {
  try { if (typeof GameContext !== 'undefined') return GameContext.localObserverID != null ? GameContext.localObserverID : GameContext.localPlayerID; } catch (e) {}
  return -1;
}
function readVisibility() {
  const n = mapW * mapH;
  const vis = new Int8Array(n);
  const obs = localObserverId();
  try {
    for (let i = 0; i < n; i++) {
      const loc = { x: i % mapW, y: Math.floor(i / mapW) };
      let rs = 0; try { rs = GameplayMap.getRevealedState(obs, loc.x, loc.y); } catch (e) {}
      // map the engine enum to our compact codes (robust to the enum's numeric values)
      vis[i] = (typeof RevealedStates !== 'undefined')
        ? (rs === RevealedStates.VISIBLE ? 2 : (rs === RevealedStates.HIDDEN ? 0 : 1))
        : (rs | 0);
    }
  } catch (e) { err(`readVisibility: ${e}`); }
  return vis;
}
// Delta-code visibility against prevVis → [[plotIndex, state], …]. Snapshot lists every non-hidden tile
// (hidden is the reconstruction default); diff lists only tiles whose state changed.
function visibilityDelta(snapshot, vis) {
  const out = [];   // flat packVis()'d ints
  if (snapshot || !prevVis || prevVis.length !== vis.length) {
    for (let i = 0; i < vis.length; i++) if (vis[i] !== 0) out.push(packVis(i, vis[i]));
  } else {
    for (let i = 0; i < vis.length; i++) if (vis[i] !== prevVis[i]) out.push(packVis(i, vis[i]));
  }
  prevVis = vis;
  return out;
}

/** Unit category: 0 land military | 1 naval | 2 civilian/other land | 3 air. */
function unitCategory(unit) {
  try {
    const def = GameInfo.Units.lookup(unit.type);
    const domain = def?.Domain;
    if (domain === 'DOMAIN_AIR') return 3;
    if (domain === 'DOMAIN_SEA') return 1;
    if (def?.CoreClass === 'CORE_CLASS_MILITARY') return 0;
    return 2;
  } catch (e) { return 2; }
}

/** City-states that have a suzerain → [cityStateId, suzerainId]. */
function readSuzerain() {
  const out = [];
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !(p.isIndependent || p.isMinor)) continue;
      const inf = p.Influence;
      const suz = (inf && inf.getSuzerain) ? inf.getSuzerain() : -1;
      if (suz >= 0 && suz <= MAX_PLAYER_ID) out.push([pid, suz]);
    }
  } catch (e) { err(`readSuzerain: ${e}`); }
  return out;
}

// Per-recording wonder-type table: manifest.wonderTypes[index] = [typeHash, name] (name baked in at record
// time, like unit/building types). Wonders change rarely, so we delta-code them and store a small type index.
let wonderTypeMap = new Map();   // typeHash -> index
function rebuildWonderTypeMap() {
  wonderTypeMap = new Map();
  try { const t = manifest && manifest.wonderTypes; if (Array.isArray(t)) for (let i = 0; i < t.length; i++) wonderTypeMap.set(t[i][0], i); } catch (e) {}
}
function wonderTypeIndex(hash, def) {
  let idx = wonderTypeMap.get(hash);
  if (idx == null) {
    if (!Array.isArray(manifest.wonderTypes)) manifest.wonderTypes = [];
    idx = manifest.wonderTypes.length;
    let name = ''; try { if (def && def.Name) name = Locale.compose(def.Name); } catch (e) {}
    manifest.wonderTypes.push([hash, name]);
    wonderTypeMap.set(hash, idx);
  }
  return idx;
}
/** Man-made wonders (ConstructibleClass WONDER) for all majors → Map(plotIndex -> [ownerId, wonderTypeIndex]). */
function readWonders() {
  const m = new Map();
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !p.isMajor) continue;
      const cons = p.Constructibles && p.Constructibles.getConstructibles ? p.Constructibles.getConstructibles() : null;
      if (!cons) continue;
      for (const con of cons) {
        const def = GameInfo.Constructibles.lookup(con.type);
        if (def && def.ConstructibleClass === 'WONDER') {
          const idx = GameplayMap.getIndexFromLocation(con.location);
          if (idx >= 0) m.set(idx, [pid, wonderTypeIndex(con.type, def)]);
        }
      }
    }
  } catch (e) { err(`readWonders: ${e}`); }
  return m;
}
// Delta-code wonders against prevWonders → [[plot, owner, typeIdx], …]; a lone [plot] = removed.
function wondersDelta(snapshot) {
  const cur = readWonders(), out = [];
  const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  if (snapshot) { for (const [plot, e] of cur) out.push([plot, e[0], e[1]]); }
  else {
    for (const [plot, e] of cur) if (!eq(e, prevWonders.get(plot))) out.push([plot, e[0], e[1]]);
    for (const [plot] of prevWonders) if (!cur.has(plot)) out.push([plot]);
  }
  prevWonders = cur;
  return out;
}

/**
 * Human-readable settlement type: "Capital", "City", or the town's current growth focus ("Growing Town"
 * by default, else the specialization project). Original capitals that are no longer the capital (e.g.
 * later-era conversions to towns) get "& Original Capital" appended — relevant to the domination victory.
 */
function settlementType(city) {
  try {
    let base;
    if (city.isCapital) base = city.isOriginalCapital ? 'Original Capital' : 'Capital';
    else if (!city.isTown) base = 'City';
    else {
      base = 'Growing Town';   // default growth-focus town
      const g = city.Growth;
      if (g && typeof GrowthTypes !== 'undefined' && GrowthTypes.PROJECT != null && g.growthType === GrowthTypes.PROJECT && g.projectType != null) {
        const def = GameInfo.Projects.lookup(g.projectType);
        if (def && def.Name) base = Locale.compose(def.Name);   // specialized town (Fort, Urban Center, …)
      }
    }
    if (city.isOriginalCapital && !city.isCapital) base += ' & Original Capital';
    return base;
  } catch (e) { return city && city.isTown ? 'Town' : 'City'; }
}

// Per-settlement net yields, fixed order (see YIELD_KEYS), rounded to ints so the deltas stay quiet
// (yields are step-functions; integer rounding suppresses sub-1 jitter). API: city.Yields.getYield(type).
const YIELD_KEYS = ['YIELD_FOOD', 'YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_SCIENCE', 'YIELD_CULTURE', 'YIELD_HAPPINESS', 'YIELD_DIPLOMACY'];
function cityYields(city) {
  const out = [];
  try {
    const Y = city.Yields;
    if (Y && Y.getYield && typeof YieldTypes !== 'undefined') {
      for (const k of YIELD_KEYS) { const t = YieldTypes[k]; let v = 0; try { v = Y.getYield(t); } catch (e) {} out.push(Math.round(v) || 0); }
    }
  } catch (e) {}
  return out;
}

/** Active player settlements this turn → Map(centerPlotIndex -> [name, population, typeLabel, [yields]]). */
function readSettlements() {
  const m = new Map();
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p) continue;
      const cities = p.Cities && p.Cities.getCities ? p.Cities.getCities() : null;
      for (const city of cities || []) {
        const idx = GameplayMap.getIndexFromLocation(city.location);
        if (idx < 0) continue;
        let name = typeof city.name === 'string' ? city.name : '';
        try {
          const localizedName = Locale.compose(city.name);
          if (localizedName && !/^LOC_/.test(localizedName)) name = localizedName;
        } catch (e) { err(`settlement name localization: ${e}`); }
        if (!name || /^LOC_/.test(name)) name = 'Settlement';
        m.set(idx, [name, city.population | 0, settlementType(city), cityYields(city)]);
      }
      if (p.isIndependent && p.Constructibles && p.Constructibles.getConstructibles) {
        for (const con of p.Constructibles.getConstructibles() || []) {
          const def = GameInfo.Constructibles.lookup(con.type);
          if (!def || (def.ConstructibleType !== 'IMPROVEMENT_VILLAGE' && def.ConstructibleType !== 'IMPROVEMENT_ENCAMPMENT')) continue;
          const idx = GameplayMap.getIndexFromLocation(con.location);
          if (idx < 0 || m.has(idx)) continue;
          const raw = p.civilizationFullName || def.Name;
          const name = raw ? Locale.compose(raw) : '';
          if (name && !/^LOC_/.test(name)) m.set(idx, [name, 0, def.ConstructibleType === 'IMPROVEMENT_VILLAGE' ? 'Village' : 'Encampment', []]);
        }
      }
    }
  } catch (e) { err(`readSettlements: ${e}`); }
  return m;
}
// Delta-code settlements against prevSettlements → [[center, name, pop, type, [yields]], …]; a lone
// [center] entry means the settlement was removed (razed/absorbed). Same snapshot+diff machinery as
// buildings; folded onto the turn record so reconstruction reuses the shared turn-record walk.
function settlementsDelta(snapshot) {
  const cur = readSettlements(), out = [];
  const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
    && a[3].length === b[3].length && a[3].every((v, k) => v === b[3][k]);
  if (snapshot) { for (const [c, e] of cur) out.push([c, e[0], e[1], e[2], e[3]]); }
  else {
    for (const [c, e] of cur) if (!eq(e, prevSettlements.get(c))) out.push([c, e[0], e[1], e[2], e[3]]);
    for (const [c] of prevSettlements) if (!cur.has(c)) out.push([c]);
  }
  prevSettlements = cur;
  return out;
}

// --- players: victory points (by broad class) + identity + met + relationships ----------------------
// Per-leader points come from the Victories system (Test of Time removed legacy-path scoring —
// LegacyPaths.getScore now returns 0 in every age). We read them via Victories.getPointsForVictoryType,
// keyed by the broad VictoryClassType (Military/Economic/Culture/Science), plus the overall Score. The four
// category victories are Modern-age only; VICTORY_SCORE is age-agnostic, so pre-Modern frames show a real
// Score with 0 in the category columns.
const VICTORY_CLASSES = ['VICTORY_CLASS_MILITARY', 'VICTORY_CLASS_ECONOMIC', 'VICTORY_CLASS_CULTURE', 'VICTORY_CLASS_SCIENCE'];
const VICTORY_SCORE_CLASS = 'VICTORY_CLASS_SCORE';
function ensureVictoryTypes() {
  if (Array.isArray(manifest.victoryTypes) && manifest.victoryTypes.length) return;
  const out = [];
  for (const cls of VICTORY_CLASSES) {
    let name = cls.replace('VICTORY_CLASS_', ''); name = name.charAt(0) + name.slice(1).toLowerCase();   // "Military"
    try { const d = GameInfo.VictoryClasses && GameInfo.VictoryClasses.lookup(cls); if (d && d.Name) { const n = Locale.compose(d.Name); if (n && !/^LOC_/.test(n)) name = n; } } catch (e) {}
    out.push(name);
  }
  out.push('Score');   // overall game score (VICTORY_SCORE) — its own metric, not the sum of the four
  manifest.victoryTypes = out;
}
// Map each VictoryClassType → its victory's $hash (the arg getPointsForVictoryType wants). One per class.
function victoryHashByClass() {
  const m = {};
  try {
    for (const v of GameInfo.Victories) {
      if (v.VictoryClassType && m[v.VictoryClassType] == null) m[v.VictoryClassType] = v.$hash;
    }
  } catch (e) { err(`victoryHashByClass: ${e}`); }
  return m;
}
/** Per-major victory points this turn → [[playerId, [military, economic, cultural, scientific, score]], …]. */
function readVictoryPoints() {
  const out = [];
  try {
    const byClass = victoryHashByClass();
    const scoreHash = byClass[VICTORY_SCORE_CLASS];
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !p.isMajor) continue;
      const vic = p.Victories, scores = [];
      for (const cls of VICTORY_CLASSES) {
        const h = byClass[cls]; let s = 0;
        try { if (h != null && vic && vic.getPointsForVictoryType) s = vic.getPointsForVictoryType(h) || 0; } catch (e) {}
        scores.push(s | 0);
      }
      let score = 0;
      try { if (scoreHash != null && vic && vic.getPointsForVictoryType) score = vic.getPointsForVictoryType(scoreHash) || 0; } catch (e) {}
      scores.push(score | 0);
      out.push([pid, scores]);
    }
  } catch (e) { err(`readVictoryPoints: ${e}`); }
  return out;
}
/** Major players the LOCAL observer has met this turn (self included) → [pid, …]. Powers history-aware fog. */
function readMet() {
  const out = [];
  try {
    const obs = localObserverId();
    const dip = (obs >= 0 && Players.get(obs)) ? Players.get(obs).Diplomacy : null;
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !p.isMajor) continue;
      if (pid === obs || (dip && dip.hasMet && dip.hasMet(pid))) out.push(pid);
    }
  } catch (e) { err(`readMet: ${e}`); }
  return out;
}
// Broad pairwise relationship among majors that have met each other: 0 neutral / 1 thumbs-up (friendly or
// helpful) / 2 thumbs-down (unfriendly or hostile) / 3 alliance / 4 war. -1 = not met (skip).
function relationCode(b, diplomacy) {
  try {
    const da = diplomacy; if (!da) return -1;
    if (da.hasMet && !da.hasMet(b)) return -1;
    if (da.isAtWarWith && da.isAtWarWith(b)) return 4;
    if (da.hasAllied && da.hasAllied(b)) return 3;
    let rel = null; try { rel = da.getRelationshipEnum(b); } catch (e) {}
    if (typeof DiplomacyPlayerRelationships === 'undefined' || rel == null) return 0;
    const R = DiplomacyPlayerRelationships;
    if (rel === R.PLAYER_RELATIONSHIP_UNKNOWN) return -1;
    if (rel === R.PLAYER_RELATIONSHIP_FRIENDLY || rel === R.PLAYER_RELATIONSHIP_HELPFUL) return 1;
    if (rel === R.PLAYER_RELATIONSHIP_UNFRIENDLY || rel === R.PLAYER_RELATIONSHIP_HOSTILE) return 2;
    return 0;   // neutral
  } catch (e) { return -1; }
}
function readRelationships() {
  const m = new Map();   // "a,b" (a<b) -> code
  try {
    const majors = [];
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !p.isMajor) continue;
      let diplomacy;
      try { diplomacy = p.Diplomacy; }
      catch (e) { err(`readRelationships diplomacy ${pid}: ${e}`); }
      majors.push({ id: pid, diplomacy });
    }
    for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) {
      const a = majors[i], b = majors[j], code = relationCode(b.id, a.diplomacy);
      if (code >= 0) m.set(a.id + ',' + b.id, code);
    }
  } catch (e) { err(`readRelationships: ${e}`); }
  return m;
}
// Delta-code relationships → [[a, b, code], …]; a lone [a, b] (no code) = the pair is no longer tracked.
function relationshipsDelta(snapshot) {
  const cur = readRelationships(), out = [];
  if (snapshot) { for (const [k, code] of cur) { const p = k.split(','); out.push([+p[0], +p[1], code]); } }
  else {
    for (const [k, code] of cur) if (prevRelationships.get(k) !== code) { const p = k.split(','); out.push([+p[0], +p[1], code]); }
    for (const [k] of prevRelationships) if (!cur.has(k)) { const p = k.split(','); out.push([+p[0], +p[1]]); }
  }
  prevRelationships = cur;
  return out;
}
// Player identity (leader / civ / adjective / colors / government). Delta-coded because it only changes at age/civ
// swaps — enables a future legend and historically-accurate colors per age. Colors are the raw ints from
// UI.Player.get*ColorValueAsHex (playback already turns these into CSS via intToRgb).
function readSociety() {
  const rows = [];
  let crisis = null;
  try {
    if (Game.CrisisManager && typeof Game.CrisisManager.getCurrentCrisisStage === 'function') crisis = Game.CrisisManager.getCurrentCrisisStage(0) > 0;
  } catch (e) { err(`readSociety crisis: ${e}`); }
  for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
    const player = Players.get(pid);
    if (!player || !(player.isMajor || player.isMinor || player.isIndependent)) continue;
    let discoveries = null, celebrating = null;
    try {
      const techs = player.Techs, culture = player.Culture;
      if (techs && typeof techs.isNodeUnlocked === 'function' && culture && typeof culture.isNodeUnlocked === 'function') {
        discoveries = [];
        PEOPLE_PROGRESSION_NODES.forEach((node, id) => {
          if ((node.startsWith('NODE_TECH_') ? techs : culture).isNodeUnlocked(node)) discoveries.push(id);
        });
      }
      if (player.Happiness && typeof player.Happiness.isInGoldenAge === 'function') celebrating = !!player.Happiness.isInGoldenAge();
    } catch (e) { discoveries = null; celebrating = null; err(`readSociety player ${pid}: ${e}`); }
    rows.push([pid, discoveries, celebrating, crisis]);
  }
  return rows;
}
function playerIdentity(pid) {
  const p = Players.get(pid);
  let leader = '', civ = '', adj = '', pc = 0, sc = 0, civType = '', csType = '', government = '';
  try { const cp = Configuration.getPlayer(pid); if (cp && cp.leaderName) leader = Locale.compose(cp.leaderName); } catch (e) {}
  try { if (p.civilizationFullName) civ = Locale.compose(p.civilizationFullName); } catch (e) {}
  try { if (p.civilizationAdjective) adj = Locale.compose(p.civilizationAdjective); } catch (e) {}
  try { pc = UI.Player.getPrimaryColorValueAsHex(pid) | 0; } catch (e) {}
  try { sc = UI.Player.getSecondaryColorValueAsHex(pid) | 0; } catch (e) {}
  try {
    if (p.civilizationType != null) {
      const def = GameInfo.Civilizations.lookup(p.civilizationType);
      civType = def && def.CivilizationType ? def.CivilizationType : p.civilizationType;
    }
  } catch (e) { err(`civilization type ${pid}: ${e}`); }
  try {
    const govType = p.Culture && p.Culture.getGovernmentType ? p.Culture.getGovernmentType() : null;
    const gov = govType != null ? GameInfo.Governments.lookup(govType) : null;
    if (gov && gov.Name) {
      const localized = Locale.compose(gov.Name);
      if (localized && !/^LOC_/.test(localized)) government = localized;
    }
    if (!government && govType != null) {
      government = String(govType).replace(/^GOVERNMENT_/, '').replace(/_/g, ' ').toLowerCase()
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }
  } catch (e) {}
  // City-state class code ("MILITARISTIC", "CULTURAL", …) — recorded so playback can label/color a
  // city-state's tiles at frames from before it was dispersed (Players.get returns null by then).
  try { if (!p.isMajor && p.getCityStateCityStateType) { const d = GameInfo.CityStateTypes.lookup(p.getCityStateCityStateType()); if (d && d.CityStateType) csType = d.CityStateType; } } catch (e) {}
  // Ideology (Modern age), founded religion name and pantheon belief names: these flavour generated place names.
  let ideology = '', religion = '', pantheons = '', people = '';
  try {
    if ((p.isMinor || p.isIndependent) && Game.IndependentPowers && Game.IndependentPowers.independentName) {
      const name = Game.IndependentPowers.independentName(pid);
      if (name) people = Locale.compose(String(name)) || '';
      if (/^LOC_/.test(people)) people = '';
    }
  } catch (e) { err(`independent people name ${pid}: ${e}`); }
  try {
    const ideoHash = p.Culture && p.Culture.getChosenIdeology ? p.Culture.getChosenIdeology() : -1;
    const ideoDef = ideoHash != null && ideoHash !== -1 ? GameInfo.Ideologies.lookup(ideoHash) : null;
    if (ideoDef && ideoDef.IdeologyType) ideology = String(ideoDef.IdeologyType).replace(/^IDEOLOGY_/, '');
  } catch (e) {}
  try {
    if (p.Religion) {
      if (p.Religion.hasCreatedReligion && p.Religion.hasCreatedReligion() && p.Religion.getReligionName) religion = Locale.compose(p.Religion.getReligionName()) || '';
      if (p.Religion.getPantheons) {
        const list = [];
        for (const h of p.Religion.getPantheons()) {
          const d = GameInfo.Beliefs.lookup(h); if (!d) continue;
          let nm = ''; try { nm = d.Name ? Locale.compose(d.Name) : ''; } catch (e) {}
          list.push(nm && !/^LOC_/.test(nm) ? nm : String(d.BeliefType || '').replace(/^BELIEF_/, ''));
        }
        pantheons = list.join('|');
      }
    }
  } catch (e) {}
  return [leader, civ, adj, pc, sc, civType, csType, government, ideology, religion, pantheons, people];
}
function readIdentity() {
  const m = new Map();   // pid -> [leader, civ, adj, primaryInt, secondaryInt, civType]
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      if (!p || !(p.isMajor || p.isMinor || p.isIndependent)) continue;
      m.set(pid, playerIdentity(pid));
    }
  } catch (e) { err(`readIdentity: ${e}`); }
  return m;
}
function identityDelta(snapshot) {
  const cur = readIdentity(), out = [];
  const eq = (a, b) => a && b && a.length === b.length && a.every((v, k) => v === b[k]);
  if (snapshot) { for (const [pid, e] of cur) out.push([pid, ...e]); }
  else {
    for (const [pid, e] of cur) if (!eq(e, prevIdentity.get(pid))) out.push([pid, ...e]);
    for (const [pid] of prevIdentity) if (!cur.has(pid)) out.push([pid]);
  }
  prevIdentity = cur;
  return out;
}

// Per-recording building-type table: manifest.buildingTypes[index] = [typeHash, name, classCode] where
// classCode 0=building (incl. fortifications/walls), 1=improvement. Same design as unit types: small
// index per building, name baked in at record time so playback never depends on the hash.
let buildingTypeMap = new Map();   // typeHash -> index
function rebuildBuildingTypeMap() {
  buildingTypeMap = new Map();
  try { const t = manifest && manifest.buildingTypes; if (Array.isArray(t)) for (let i = 0; i < t.length; i++) buildingTypeMap.set(t[i][0], i); } catch (e) {}
}
function buildingTypeIndex(hash, def) {
  let idx = buildingTypeMap.get(hash);
  if (idx == null) {
    if (!Array.isArray(manifest.buildingTypes)) manifest.buildingTypes = [];
    idx = manifest.buildingTypes.length;
    let name = ''; try { if (def && def.Name) name = Locale.compose(def.Name); } catch (e) {}
    manifest.buildingTypes.push([hash, name, def && def.ConstructibleClass === 'IMPROVEMENT' ? 1 : 0]);
    buildingTypeMap.set(hash, idx);
  }
  return idx;
}
/** Constructibles this turn (buildings + improvements + fortifications; wonders excluded) → Map(plot -> sorted [typeIdx]). */
function readBuildings() {
  const m = new Map(), damaged = new Map();
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      const cons = p && p.Constructibles && p.Constructibles.getConstructibles ? p.Constructibles.getConstructibles() : null;
      if (!cons) continue;
      for (const con of cons) {
        const def = GameInfo.Constructibles.lookup(con.type);
        if (!def || (def.ConstructibleClass !== 'BUILDING' && def.ConstructibleClass !== 'IMPROVEMENT')) continue;   // skip wonders
        const idx = GameplayMap.getIndexFromLocation(con.location);
        if (idx < 0) continue;
        let arr = m.get(idx); if (!arr) { arr = []; m.set(idx, arr); }
        const typeIndex = buildingTypeIndex(con.type, def);
        arr.push(typeIndex);
        if (con.damaged) { let bad = damaged.get(idx); if (!bad) { bad = []; damaged.set(idx, bad); } bad.push(typeIndex); }   // pillaged
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a - b);   // canonical order so diffing is stable
    for (const arr of damaged.values()) arr.sort((a, b) => a - b);
  } catch (e) { err(`readBuildings: ${e}`); }
  lastReadDamaged = damaged;
  return m;
}
let lastReadDamaged = new Map();   // pillaged constructibles found by the most recent readBuildings(): plot -> sorted [typeIdx]
// Delta-code buildings against prevBuildings → [[plot, [typeIdx…]], …] (empty array = all constructibles gone).
function buildingsDelta(snapshot) {
  const cur = readBuildings(), out = [];
  if (snapshot) { for (const [plot, arr] of cur) out.push([plot, arr]); }
  else {
    const same = (a, b) => a && b && a.length === b.length && a.every((v, k) => v === b[k]);
    for (const [plot, arr] of cur) if (!same(arr, prevBuildings.get(plot))) out.push([plot, arr]);
    for (const [plot] of prevBuildings) if (!cur.has(plot)) out.push([plot, []]);
  }
  prevBuildings = cur;
  return out;
}
// The same, for the pillaged subset (read by the readBuildings() just before): [[plot, [typeIdx…]], …], empty array = repaired.
function damagedDelta(snapshot) {
  const cur = lastReadDamaged, out = [];
  if (snapshot) { for (const [plot, arr] of cur) out.push([plot, arr]); }
  else {
    const same = (a, b) => a && b && a.length === b.length && a.every((v, k) => v === b[k]);
    for (const [plot, arr] of cur) if (!same(arr, prevDamaged.get(plot))) out.push([plot, arr]);
    for (const [plot] of prevDamaged) if (!cur.has(plot)) out.push([plot, []]);
  }
  prevDamaged = cur;
  return out;
}

/** All units on the map (every owner incl. independents & barbarians) → [plotIndex, ownerId, cat]. */
// Per-recording unit-type table: manifest.unitTypes[index] = [typeHash, resolvedName, category]. We store
// a small index per unit (not the hash), and the NAME is resolved+baked in here at record time — so
// playback never touches the hash, making it robust to game updates / removed types / missing mods.
// The hash is kept in the table only to rebuild this in-memory hash→index map after a save/reload.
let unitTypeMap = new Map();   // typeHash -> index into manifest.unitTypes
function rebuildUnitTypeMap() {
  unitTypeMap = new Map();
  try { const t = manifest && manifest.unitTypes; if (Array.isArray(t)) for (let i = 0; i < t.length; i++) unitTypeMap.set(t[i][0], i); } catch (e) {}
}
function unitTypeIndex(u) {
  const hash = u.type;
  let idx = unitTypeMap.get(hash);
  if (idx == null) {
    if (!Array.isArray(manifest.unitTypes)) manifest.unitTypes = [];
    idx = manifest.unitTypes.length;
    let name = ''; try { const def = GameInfo.Units.lookup(hash); if (def && def.Name) name = Locale.compose(def.Name); } catch (e) {}
    manifest.unitTypes.push([hash, name, unitCategory(u)]);
    unitTypeMap.set(hash, idx);
  }
  return idx;
}
const lastUnitPlot = new Map();   // unit id key -> plot it stood on when last recorded (for motion paths)
let baseUnitPlot = new Map();     // lastUnitPlot as it stood before the current frame's first record (re-records restore it)
let routeTypeLevels = null;
// Road (1) / railroad (2) plots as a flat [plot, level, ...] list.
function readRoutes() {
  const out = [];
  try {
    if (!routeTypeLevels) {
      routeTypeLevels = new Map();
      for (const r of GameInfo.Routes) routeTypeLevels.set(r.$hash, /RAIL/i.test(r.RouteType) ? 2 : 1);
    }
    const w = GameplayMap.getGridWidth(), h = GameplayMap.getGridHeight();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hash = GameplayMap.getRouteType(x, y);
        if (hash == null || hash === -1) continue;
        let lv = routeTypeLevels.get(hash);
        if (lv == null) { const d = GameInfo.Routes.lookup(hash); lv = d ? (/RAIL/i.test(d.RouteType) ? 2 : 1) : 0; routeTypeLevels.set(hash, lv); }
        if (lv) out.push(y * w + x, lv);
      }
    }
  } catch (e) { err(`readRoutes: ${e}`); }
  return out;
}
function readUnits() {
  const out = [], health = [], from = [], bonus = [], activity = [];
  const seen = new Set();
  try {
    for (let pid = 0; pid <= MAX_PLAYER_ID; pid++) {
      const p = Players.get(pid);
      const ids = p && p.Units && p.Units.getUnitIds ? p.Units.getUnitIds() : null;
      if (!ids) continue;
      for (const id of ids) {
        const u = Units.get(id);
        if (!u || !u.location) continue;
        const idx = GameplayMap.getIndexFromLocation(u.location);
        if (idx >= 0) {
          const pct = unitStrengthBonusPercent(u);
          if (pct > 0) bonus.push(out.length, pct);
          const state = unitFormationState(u, id, pid);
          if (state) activity.push(out.length, state);
          out.push(packUnit(idx, pid, unitTypeIndex(u)));
          health.push(unitHealthPercent(u));
          const key = pid + ':' + (id.id !== undefined ? id.id : JSON.stringify(id));
          seen.add(key);
          const prev = lastUnitPlot.get(key);
          from.push(prev !== undefined && prev !== idx ? prev : -1);
          lastUnitPlot.set(key, idx);
        }
      }
    }
    for (const k of [...lastUnitPlot.keys()]) if (!seen.has(k)) lastUnitPlot.delete(k);
    for (const k of unitFormationOperations.keys()) if (!seen.has(k)) unitFormationOperations.delete(k);
  } catch (e) { err(`readUnits: ${e}`); }
  const result = { u: out, h: health, f: from, r: readRoutes() };
  if (bonus.length) result.s = bonus;   // [row, strength bonus %, …] for the units whose strength is above their type's base
  if (activity.length) result.a = activity;   // [row, state, ...]: alert, asleep, fortified, holding, healing, idle
  return result;
}
const unitFormationOperations = new Map();
function unitFormationState(unit, id, owner) {
  if (typeof UnitActivityTypes === 'undefined') return 0;
  const activity = unit.activityType;
  if (activity === undefined || activity === null) return 0;
  const matches = name => UnitActivityTypes[name] !== undefined && activity === UnitActivityTypes[name];
  if (matches('SENTRY')) return 1;
  if (matches('SLEEP')) return 2;
  const key = owner + ':' + (id.id !== undefined ? id.id : JSON.stringify(id));
  if (matches('FORTIFY') || (matches('OPERATION') && typeof UnitOperationTypes !== 'undefined' &&
      UnitOperationTypes.FORTIFY !== undefined && unitFormationOperations.get(key) === UnitOperationTypes.FORTIFY)) return 3;
  if (matches('HOLD')) return 4;
  if (matches('HEAL')) return 5;
  return matches('AWAKE') || matches('NONE') ? 6 : 0;
}
function recordUnitFormationActivity(data) {
  if (!data || !data.unit) return;
  const unit = Units.get(data.unit);
  if (!unit) return;
  const key = unit.owner + ':' + (data.unit.id !== undefined ? data.unit.id : JSON.stringify(data.unit));
  unitFormationOperations.set(key, data.operationType);
  scheduleMidTurnRecord();
}
// How far a unit's current combat strength (promotions, commander and other bonuses) is above its type's base, in percent.
const baseStrengthCache = new Map();
function unitStrengthBonusPercent(unit) {
  try {
    const combat = unit.Combat;
    if (!combat) return 0;
    let base = baseStrengthCache.get(unit.type);
    if (base === undefined) {
      const def = GameInfo.Units.lookup(unit.type), stats = def && GameInfo.Unit_Stats ? GameInfo.Unit_Stats.lookup(def.UnitType) : null;
      base = stats ? Math.max(stats.Combat || 0, stats.RangedCombat || 0, stats.Bombard || 0) : 0;
      baseStrengthCache.set(unit.type, base);
    }
    if (!(base > 0)) return 0;
    const melee = typeof combat.getMeleeStrength === 'function' ? combat.getMeleeStrength(false) : 0;
    const current = Math.max(melee || 0, combat.rangedStrength || 0, combat.bombardStrength || 0);
    return current > base ? Math.min(300, Math.round((current / base - 1) * 100)) : 0;
  } catch (e) { return 0; }
}
function unitHealthPercent(unit) {
  const health = unit && unit.Health;
  if (!health || !(health.maxDamage > 0) || !Number.isFinite(health.damage)) return 100;
  return Math.max(0, Math.min(100, Math.round((health.maxDamage - health.damage) * 100 / health.maxDamage)));
}

/** Terrain class for a plot (see header). */
function terrainClass(x, y) {
  try {
    // water types get their own codes (checked before isWater so they win regardless of how the
    // engine flags them): 10 navigable river, 9 lake, 1 coastal sea, 0 deep ocean.
    if (GameplayMap.isNavigableRiver(x, y)) return 10;
    if (GameplayMap.isLake(x, y)) return 9;
    if (GameplayMap.isWater(x, y)) {
      const tt = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y))?.TerrainType;
      return (tt === 'TERRAIN_COAST') ? 1 : 0;
    }
    const tt = GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y))?.TerrainType;
    if (tt === 'TERRAIN_MOUNTAIN') return 2;
    const bt = GameInfo.Biomes.lookup(GameplayMap.getBiomeType(x, y))?.BiomeType;
    switch (bt) {
      case 'BIOME_DESERT': return 3;
      case 'BIOME_PLAINS': return 4;
      case 'BIOME_GRASSLAND': return 5;
      case 'BIOME_TROPICAL': return 6;
      case 'BIOME_TUNDRA': return 7;
      default: return 8;
    }
  } catch (e) { return 8; }
}

function captureTerrain() {
  try {
    // Terrain + natural wonders are the same world across ages, so capture ONCE. Skip if already stored
    // (survives reload: the value is read back from the game-config store).
    try { const existing = getCatalog().getObject(OBJ_BASE).read(KEY_TERRAIN); if (existing) return; } catch (e) {}
    const n = mapW * mapH;
    const arr = new Array(n);
    const nat = [];
    for (let i = 0; i < n; i++) {
      const loc = GameplayMap.getLocationFromIndex(i);
      arr[i] = terrainClass(loc.x, loc.y);
      try { if (GameplayMap.isNaturalWonder(loc.x, loc.y)) nat.push(i); } catch (e) {}
    }
    getCatalog().getObject(OBJ_BASE).write(KEY_TERRAIN, JSON.stringify(arr));
    getCatalog().getObject(OBJ_BASE).write(KEY_NATURAL, JSON.stringify(nat));
    log(`captured terrain base (${n} plots), ${nat.length} natural-wonder tiles`);
  } catch (e) { err(`captureTerrain failed: ${e}`); }
}
function captureMapFeatures() {
  try {
    const base = getCatalog().getObject(OBJ_BASE);
    const existing = base.read(KEY_FEATURES_V4);
    if (existing) return;
    if (typeof GameplayMap.getFeatureType !== 'function'
        || typeof GameInfo === 'undefined'
        || !GameInfo.Features
        || typeof GameInfo.Features.lookup !== 'function') {
      if (!featureCaptureUnavailableLogged) {
        err('map feature capture unavailable: GameplayMap.getFeatureType or GameInfo.Features.lookup is missing');
        featureCaptureUnavailableLogged = true;
      }
      return;
    }
    const markers = [];
    for (let i = 0; i < mapW * mapH; i++) {
      const location = GameplayMap.getLocationFromIndex(i);
      const feature = GameInfo.Features.lookup(GameplayMap.getFeatureType(location.x, location.y));
      const featureType = String(feature && feature.FeatureType || '');
      const type = featureType.toUpperCase();
      let navigableRiver = false, river = false;
      try { navigableRiver = typeof GameplayMap.isNavigableRiver === 'function' && GameplayMap.isNavigableRiver(location.x, location.y); } catch (e) {}
      try { river = typeof GameplayMap.isRiver === 'function' && GameplayMap.isRiver(location.x, location.y); } catch (e) {}
      const code = /ATOLL/.test(type) ? 3 : /REEF/.test(type) ? 2 : /ICE/.test(type) ? 6 : /MARSH|MANGROVE|BOG/.test(type) ? 7
        : /TAIGA/.test(type) ? 8 : /SAVANNA/.test(type) ? 9 : /SAGEBRUSH|STEPPE/.test(type) ? 10 : /VOLCANO/.test(type) ? 11 : /LOTUS|FLOWERS/.test(type) ? 12
        : /FOREST|JUNGLE|RAINFOREST/.test(type) ? 1 : /OASIS/.test(type) ? 4 : /CLIFF/.test(type) ? 13
        : /FLOODPLAIN/.test(type) ? 14 : /WETLAND|SWAMP/.test(type) ? 7 : /SCRUB/.test(type) ? 15
        : (!navigableRiver && (river || /RIVER/.test(type))) ? 5 : feature && type && !/NO_FEATURE|FEATURE_NONE/.test(type) ? 16 : 0;
      let cliffs = false;
      if (typeof GameplayMap.isCliffCrossing === 'function') {
        for (let d = 0; d < 6; d++) if (GameplayMap.isCliffCrossing(location.x, location.y, d)) { cliffs = true; break; }
      }
      if (code || cliffs) markers.push([i, code, cliffs ? 1 : 0]);
    }
    base.write(KEY_FEATURES_V4, JSON.stringify(markers));
    log(`captured ${markers.length} map feature markers`);
  } catch (e) { err(`captureMapFeatures failed: ${e}`); }
}
function captureMapDetailSnapshot() {
  try {
    const base = getCatalog().getObject(OBJ_BASE);
    if (base.read('map_details_v1')) return;
    const details = captureMapDetails(GameplayMap, GameInfo, mapW, mapH, text => Locale.compose(text));
    base.write('map_details_v1', JSON.stringify(details));
  } catch (error) { err(`map detail capture failed: ${error}`); }
}
// Resource layer for the CURRENT age (resources are age-specific: Treasure/Factory only exist in later
// ages). Sparse list of [plotIndex, classCode]. Stored per-age under 'res_<ageId>' (like the terrain base).
function captureResources() {
  try {
    const n = mapW * mapH, out = [];
    for (let i = 0; i < n; i++) {
      const loc = GameplayMap.getLocationFromIndex(i);
      let rt = null; try { rt = GameplayMap.getResourceType(loc.x, loc.y); } catch (e) {}
      if (rt == null || (typeof ResourceTypes !== 'undefined' && rt === ResourceTypes.NO_RESOURCE)) continue;
      let cls = null; try { const def = GameInfo.Resources.lookup(rt); cls = def && def.ResourceClassType; } catch (e) {}
      const code = RESOURCE_CLASS_CODE[cls];
      // Store the resource TYPE (rt) alongside the class code: the code drives the map dot's color, rt lets the
      // tooltip resolve the exact historical resource name from the same recorded snapshot as the dot (reading
      // the live map instead diverges — harvested/age-changed resources leave a dot with no name).
      out.push([i, code != null ? code : 5, rt]);
    }
    getCatalog().getObject(OBJ_BASE).write(KEY_RES + '_' + Game.age, JSON.stringify(out));
    log(`captured ${out.length} resources for age ${Game.age}`);
  } catch (e) { err(`captureResources failed: ${e}`); }
}

// --- manifest ----------------------------------------------------------------
function loadManifest() {
  let m = null;
  try {
    const raw = getCatalog().getObject(OBJ_META).read(KEY_INDEX);
    if (raw) m = JSON.parse(raw);
  } catch (e) { err(`manifest read/parse failed: ${e}`); }
  if (!m || m.v !== DATA_VERSION) m = { v: DATA_VERSION, w: mapW, h: mapH, frames: [], ages: [], unitTypes: [], buildingTypes: [], wonderTypes: [], victoryTypes: [] };
  if (!Array.isArray(m.frames)) m.frames = [];   // [ [ageId, inAgeTurn, snap], ... ]; index = global frame index (gi)
  if (!Array.isArray(m.ages)) m.ages = [];       // [ [startGi, ageId, ageName], ... ]
  if (!Array.isArray(m.unitTypes)) m.unitTypes = [];
  if (!Array.isArray(m.buildingTypes)) m.buildingTypes = [];
  if (!Array.isArray(m.wonderTypes)) m.wonderTypes = [];
  if (!Array.isArray(m.victoryTypes)) m.victoryTypes = [];
  m.w = mapW; m.h = mapH;
  return m;
}
/** Localized name of the current age (for the playback age bar). */
function currentAgeName() {
  try { const def = GameInfo.Ages.lookup(Game.age); if (def) return (typeof Locale !== 'undefined' && Locale.compose ? Locale.compose(def.Name) : def.Name) || def.AgeType || ''; } catch (e) {}
  return '';
}
function saveManifest() { getCatalog().getObject(OBJ_META).write(KEY_INDEX, JSON.stringify(manifest)); }

// --- clear / reset -----------------------------------------------------------
// Wipe this game's recording (the store has no true "delete", so we blank the values, which frees the
// space) and start a fresh baseline. Run here in the recorder because it owns the in-memory manifest /
// prev-state — clearing from elsewhere would be undone by the recorder's next save. Exposed on window.
function clearData(reSnapshot) {
  try {
    try { mapW = GameplayMap.getGridWidth(); mapH = GameplayMap.getGridHeight(); } catch (e) {}
    const cat = getCatalog();
    let m = null;
    try { const raw = cat.getObject(OBJ_META).read(KEY_INDEX); if (raw) m = JSON.parse(raw); } catch (e) {}
    const frameCount = (m && Array.isArray(m.frames)) ? m.frames.length : 0;
    for (let gi = 0; gi < frameCount; gi++) {   // records are keyed by global frame index
      try { cat.getObject(OBJ_TURNS).write('t' + gi, ''); } catch (e) {}
      try { cat.getObject(OBJ_UNITS).write('u' + gi, ''); } catch (e) {}
      try { cat.getObject(OBJ_WONDERS).write('w' + gi, ''); } catch (e) {}
      try { cat.getObject(OBJ_SUZE).write('s' + gi, ''); } catch (e) {}
      try { cat.getObject(OBJ_PLAYERS).write('p' + gi, ''); } catch (e) {}
    }
    try { const ages = (m && Array.isArray(m.ages)) ? m.ages : []; for (const a of ages) cat.getObject(OBJ_BASE).write(KEY_RES + '_' + a[1], ''); } catch (e) {}   // per-age resource layers
    try { cat.getObject(OBJ_BASE).write(KEY_TERRAIN, ''); } catch (e) {}
    try { cat.getObject(OBJ_BASE).write(KEY_NATURAL, ''); } catch (e) {}
    try { cat.getObject(OBJ_BASE).write(KEY_FEATURES, ''); } catch (e) {}
    try { cat.getObject(OBJ_BASE).write(KEY_FEATURES_V2, ''); } catch (e) {}
    try { cat.getObject(OBJ_BASE).write(KEY_FEATURES_V3, ''); } catch (e) {}
    try { cat.getObject(OBJ_BASE).write(KEY_FEATURES_V4, ''); } catch (e) {}
    try {   // Map View's saved population-panel and townscape records
      const viewIndexRaw = cat.getObject(OBJ_VIEW).read('idx');
      const viewIndex = viewIndexRaw ? JSON.parse(viewIndexRaw) : [];
      if (Array.isArray(viewIndex)) for (const key of viewIndex) cat.getObject(OBJ_VIEW).write(key, '');
      cat.getObject(OBJ_VIEW).write('idx', ''); cat.getObject(OBJ_VIEW).write('twlib', '');
    } catch (e) {}
    try { window.dispatchEvent(new Event('anthroprocenia-view-data-cleared')); } catch (e) {}
    manifest = { v: DATA_VERSION, w: mapW, h: mapH, frames: [], ages: [], unitTypes: [], buildingTypes: [], wonderTypes: [], victoryTypes: [] };
    rebuildUnitTypeMap(); rebuildBuildingTypeMap(); rebuildWonderTypeMap();
    saveManifest();
    prevOwner = null; prevCls = null; prevVis = null; prevBuildings = new Map(); prevDamaged = new Map();
    prevSettlements = new Map(); prevIdentity = new Map(); prevRelationships = new Map(); prevWonders = new Map();
    lastTurnRecorded = -1;   // next record() is a clean snapshot
    lastRecordedGi = -1; baseOwner = null; baseCls = null; baseVis = null;   // reset the pinned diff baselines
    baseBuildings = new Map(); baseSettlements = new Map(); baseWonders = new Map(); baseDamaged = new Map(); baseIdentity = new Map(); baseRelationships = new Map();
    // Re-snapshot the current turn so the replay isn't empty (skipped for auto-delete, which wants nothing left).
    if (reSnapshot !== false) { try { if (typeof Game !== 'undefined' && Game.turn != null) record(Game.turn, true); } catch (e) {} }
    log(`clearData: wiped ${frameCount} frames${reSnapshot !== false ? ' and re-snapshotted current turn' : ''}`);
    return true;
  } catch (e) { err(`clearData failed: ${e}`); return false; }
}
try { window.AnthroproceniaClearData = clearData; } catch (e) {}

// --- recording ---------------------------------------------------------------
// Records are keyed by a GLOBAL frame index (gi) that runs across all ages (turn numbers reset to 1 each
// age, so they can't be the key). A frame is identified by (ageId, in-age turn): re-recording the same one
// (e.g. after a save/reload within an age) reuses its gi; a new (age, turn) appends. Every age's first
// frame is a snapshot, so playback can reconstruct each age independently.
function record(turn, forceSnap) {
  const captureStarted = Date.now();
  const ageId = Game.age;
  let turnDate = '';
  try { turnDate = typeof Game.getTurnDate === 'function' ? Game.getTurnDate() : ''; } catch (e) { err(`getTurnDate: ${e}`); }
  const realistic = currentRealisticDate(turn);
  if (realistic) turnDate = realistic;
  if (typeof turnDate !== 'string') turnDate = '';
  let gi = frameIndex(ageId, turn);
  const newAge = !recordedAges.has(ageId);
  const { owner, cls } = readTiles();
  const tilesMs = Date.now() - captureStarted;
  // gi: reuse the existing frame for (ageId, turn), else append a new one at the end.
  if (gi < 0) gi = manifest.frames.length;
  const turnDateChanged = !manifest.frames[gi] || manifest.frames[gi][3] !== turnDate;
  // Pin the diff baseline to gi-1 (see base* declarations): the FIRST record of a gi saves the current
  // prev* (state through gi-1); a RE-record of the same gi restores it, so re-records never diff against a
  // baseline a prior record already advanced (which would drop that record's changes on overwrite).
  const reRecord = (gi === lastRecordedGi);
  if (reRecord) {
    prevOwner = baseOwner; prevCls = baseCls; prevVis = baseVis;
    prevBuildings = baseBuildings; prevSettlements = baseSettlements; prevWonders = baseWonders; prevDamaged = baseDamaged;
    prevIdentity = baseIdentity; prevRelationships = baseRelationships;
    lastUnitPlot.clear(); for (const [k, v] of baseUnitPlot) lastUnitPlot.set(k, v);
  } else {
    baseOwner = prevOwner; baseCls = prevCls; baseVis = prevVis;
    baseBuildings = prevBuildings; baseSettlements = prevSettlements; baseWonders = prevWonders; baseDamaged = prevDamaged;
    baseIdentity = prevIdentity; baseRelationships = prevRelationships;
    baseUnitPlot = new Map(lastUnitPlot);
    lastRecordedGi = gi;
  }
  // A re-record of a frame that was a SNAPSHOT stays a snapshot (must remain self-contained for playback's
  // per-age reconstruction); otherwise the usual rule (forced / no baseline / new age).
  const wasSnap = reRecord && manifest.frames[gi] && manifest.frames[gi][2] === 1;
  const snapshot = forceSnap || !prevOwner || newAge || wasSnap;
  const terr = [];

  if (snapshot) {
    for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) terr.push(packTerr(i, owner[i], cls[i]));
  } else {
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] !== prevOwner[i] || cls[i] !== prevCls[i]) {
        terr.push(owner[i] >= 0 ? packTerr(i, owner[i], cls[i]) : packTerr(i, -1, 0));
      }
    }
  }

  const bld = buildingsDelta(snapshot);   // constructibles, delta-coded onto the same frame record
  const dmg = damagedDelta(snapshot);     // which of them are pillaged
  const set = settlementsDelta(snapshot); // settlements (name/pop/type/yields), delta-coded onto the same frame record
  const vis = visibilityDelta(snapshot, readVisibility());   // local-observer visibility (packed), delta-coded onto the frame record
  const won = wondersDelta(snapshot);     // man-made wonders (delta + type index), folded onto the frame record
  getCatalog().getObject(OBJ_TURNS).write('t' + gi, JSON.stringify({ t: turn, s: snapshot ? 1 : 0, terr, bld, dmg, set, vis, won }));

  const unitData = readUnits();
  const unitsJson = JSON.stringify({ t: turn, ...unitData });
  getCatalog().getObject(OBJ_UNITS).write('u' + gi, unitsJson);
  const suze = readSuzerain();
  const suzeJson = JSON.stringify({ t: turn, s: suze });
  getCatalog().getObject(OBJ_SUZE).write('s' + gi, suzeJson);
  const idd = identityDelta(snapshot);     // per-player identity, government, and colors
  const soc = readSociety(), societyJson = JSON.stringify(soc);
  const rel = relationshipsDelta(snapshot), relJson = JSON.stringify([...prevRelationships]);
  // Manifest revision: bumped only when this record changed anything the map draws — lets playback detect
  // SAME-TURN re-records (mid-turn "record on map open") and drop its caches; identical re-records don't
  // churn the caches.
  if (snapshot || turnDateChanged || terr.length || vis.length || won.length || set.length || (bld && bld.length) || dmg.length || idd.length || unitsJson !== lastUnitsJson || suzeJson !== lastSuzeJson || societyJson !== lastSocietyJson || relJson !== lastRelJson) manifest.rev = (manifest.rev || 0) + 1;
  lastUnitsJson = unitsJson; lastSuzeJson = suzeJson;
  lastSocietyJson = societyJson; lastRelJson = relJson;
  ensureVictoryTypes();                    // record the victory-point column labels once
  const vp = readVictoryPoints();          // per-major victory points by class + score (full each turn)
  const met = readMet();                   // majors the local observer has met (full each turn — small)
  getCatalog().getObject(OBJ_PLAYERS).write('p' + gi, JSON.stringify({ t: turn, s: snapshot ? 1 : 0, vp, idd, met, rel, soc }));

  manifest.frames[gi] = [ageId, turn, snapshot ? 1 : 0, turnDate];
  if (realistic) manifest.frames[gi].push(REALISTIC_AGES[GameInfo.Ages.lookup(ageId).AgeType].yearsPerTurn);
  // age-start markers: [startGi, ageId, ageName] — appended whenever the age id changes
  const lastAge = manifest.ages.length ? manifest.ages[manifest.ages.length - 1] : null;
  if (!lastAge || lastAge[1] !== ageId) manifest.ages.push([gi, ageId, currentAgeName()]);
  saveManifest();
  if (snapshot) { captureTerrain(); captureMapFeatures(); captureMapDetailSnapshot(); captureResources(); }

  prevOwner = owner; prevCls = cls;
  lastTurnRecorded = turn;
  try { window.dispatchEvent(new Event('anthroprocenia-replay-updated')); }
  catch (e) { err(`replay update notification failed: ${e}`); }
  const captureMs = Date.now() - captureStarted;
  if (captureMs >= 250) console.warn(`[ANTHROPROCENIA] Replay capture: ${captureMs} ms (${tilesMs} ms tiles), age=${ageId}, turn=${turn}`);
  log(`frame ${gi} (age ${ageId} turn ${turn}) ${snapshot ? 'SNAPSHOT' : 'diff'}: ${terr.length} territory ${snapshot ? 'owned-plots' : 'changes'}, ${set.length} settlement ${snapshot ? '' : 'changes, '}${vis.length} vis, ${unitData.u.length} units, ${won.length} wonder ${snapshot ? '' : 'changes, '}${suze.length} suzerained (frames=${manifest.frames.length})`);
}

// --- lifecycle ---------------------------------------------------------------
function init(evtName) {
  if (started || initializing) return;
  initializing = true;
  try {
    mapW = GameplayMap.getGridWidth();
    mapH = GameplayMap.getGridHeight();
    if (!(mapW > 0) || !(mapH > 0) || typeof Game === 'undefined' || Game.turn == null) return;
    getCatalog();
    manifest = loadManifest();
    rebuildUnitTypeMap(); rebuildBuildingTypeMap(); rebuildWonderTypeMap();   // restore typeHash→index maps across a save/reload
    log(`init via '${evtName}': map ${mapW}x${mapH}, age=${Game.age}, prior recorded frames=${manifest.frames.length}`);
    // Frame X = state at the END of turn X = state at the START of turn X+1. So we label every record
    // Game.turn-1: at game start (turn 1) this is the turn-0 baseline; on resume it re-snapshots the last
    // completed turn (Game.turn-1), which also re-establishes the diff baseline. record() dedups by (age,turn).
    record(Game.turn - 1, true);
    started = true;
    initializing = false;
    if (!gameplayReady) {
      gameplayReady = true;
      try { window.dispatchEvent(new Event('anthroprocenia-gameplay-ready')); }
      catch (e) { err(`gameplay-ready notification failed: ${e}`); }
    }
  } catch (e) { err(`init failed: ${e}`); }
  finally { initializing = false; }
}

function scheduleInit(evtName, delay = 750) {
  if (started || initializing || initPending) return;
  initPending = true;
  setTimeout(() => {
    initPending = false;
    if (started) return;
    initAttempts++;
    init(evtName);
    if (!started && initAttempts < 120) scheduleInit(evtName, 500);
    else if (!started) err(`recorder initialization timed out after ${initAttempts} attempts`);
  }, delay);
}

// Mid-turn captures (a unit moved, a city was founded or claimed tiles). Bursts of events share one capture.
// The capture is labeled Game.turn and is provisional: every one re-records the same frame, and the next
// turn-begin overwrites it with the fully-resolved end-of-turn state (record() dedups by (age, turn)).
const MID_TURN_RECORD_DELAY_MS = 1000;
let midTurnTimer = 0;
function scheduleMidTurnRecord() {
  if (!started || midTurnTimer) return;
  if (!localRecordingTurn()) return;
  if (!window.AnthroproceniaReplay || !window.AnthroproceniaReplay.isVisible()) return;
  midTurnTimer = setTimeout(() => {
    midTurnTimer = 0;
    try {
      if (!started || typeof Game === 'undefined' || Game.turn == null) return;
      if (!localRecordingTurn()) return;
      if (!window.AnthroproceniaReplay || !window.AnthroproceniaReplay.isVisible()) return;
      // Wait for this turn's turn-begin capture (labeled Game.turn-1) so frames stay in chronological order.
      if (frameIndex(Game.age, Game.turn - 1) < 0) return;
      const prevLast = lastTurnRecorded;
      record(Game.turn, false);
      lastTurnRecorded = prevLast;   // the next turn-begin must still be allowed to overwrite this frame
    } catch (e) { err(`mid-turn capture failed: ${e}`); }
  }, MID_TURN_RECORD_DELAY_MS);
}
window.AnthroproceniaRequestCapture = scheduleMidTurnRecord;
function localRecordingTurn() {
  const player = Players.get(GameContext.localPlayerID);
  return !!player && player.isTurnActive === true;
}

function onTurnBegin() {
  try {
    if (midTurnTimer) { clearTimeout(midTurnTimer); midTurnTimer = 0; }
    if (!started) {
      scheduleInit('LocalPlayerTurnBegin', 250);
      return;
    }
    // The start of turn N = the fully-resolved END of turn N-1 (every player's N-1 moves are in). Record it
    // labeled N-1. record() forces a snapshot itself on a new age (turn numbers reset per age).
    const turn = Game.turn - 1;
    if (turn === lastTurnRecorded) return;
    record(turn, false);
  } catch (e) { err(`onTurnBegin failed: ${e}`); }
}

// Final-state capture: the last turn of a game (or of an age) is never reached by a following turn-begin, so
// grab the current fully-resolved state here. Labeled Game.turn (the turn just completed). GameAgeEnded fires
// at every age boundary (incl. the final age = game over); TeamVictory covers a victory-triggered game over.
function onGameOrAgeEnd(evtName) {
  try {
    if (!started || typeof Game === 'undefined' || Game.turn == null) return;
    const prevLast = lastTurnRecorded;
    record(Game.turn, false);
    // Restore the dedupe marker: if the game actually CONTINUES after this event (e.g. a rival's defeat
    // mid-game), the next turn-begin must be allowed to overwrite this possibly-mid-turn frame with the
    // fully-resolved end-of-turn state — record() dedupes by (age, turn), so it lands on the same frame.
    lastTurnRecorded = prevLast;
    log(`final state recorded via '${evtName}' (turn ${Game.turn})`);
  } catch (e) { err(`onGameOrAgeEnd(${evtName}) failed: ${e}`); }
}
// Local player eliminated while the game continues (conquest of the last city): no further
// LocalPlayerTurnBegin will ever fire for us, so the post-conquest world (opponent's borders complete)
// would be missing from the replay entirely — capture it now. Rival defeats are recorded too when the
// event payload is ambiguous (harmless: the next turn-begin overwrites with the resolved state).
function onPlayerDefeat(data) {
  try {
    const pid = data && (data.player != null ? data.player : data.playerId);
    if (pid != null && typeof GameContext !== 'undefined' && GameContext.localPlayerID != null && pid !== GameContext.localPlayerID) return;
    onGameOrAgeEnd('PlayerDefeat');
  } catch (e) { err(`onPlayerDefeat failed: ${e}`); }
}
// Endgame-screen safety net: anthroprocenia-playback calls this when the Victories screen mounts, so whatever
// path led to the end screen, the final resolved world state is in the replay before the map builds.
try { window.AnthroproceniaRecordFinal = () => { try { if (started) onGameOrAgeEnd('endgame-screen'); } catch (e) {} }; } catch (e) {}

log('recorder module loaded — binding lifecycle events');
engine.on('GameStarted', () => { unitFormationOperations.clear(); try { window.AnthroproceniaNames.reset(); } catch (e) {} scheduleInit('GameStarted'); });
engine.on('LoadComplete', () => { unitFormationOperations.clear(); try { window.AnthroproceniaNames.reset(); } catch (e) {} scheduleInit('LoadComplete'); });
engine.on('StartSaveRequest', flushNames);
engine.on('LocalPlayerTurnBegin', onTurnBegin);
engine.on('TurnBegin', () => { if (typeof Autoplay !== 'undefined' && Autoplay.isActive) onTurnBegin(); });
engine.on('AutoplayEnded', onTurnBegin);
engine.on('UnitMoved', scheduleMidTurnRecord);                     // capture when a unit moves
engine.on('UnitActivityChanged', recordUnitFormationActivity);
engine.on('PlotOwnershipChanged', scheduleMidTurnRecord);          // capture when a city expands or borders change
engine.on('CityAddedToMap', scheduleMidTurnRecord);                // capture when a city is founded
engine.on('GameAgeEnded', () => onGameOrAgeEnd('GameAgeEnded'));   // captures each age's final resolved state (final age = game over)
engine.on('TeamVictory', () => onGameOrAgeEnd('TeamVictory'));     // victory-triggered game over
engine.on('PlayerDefeat', onPlayerDefeat);                         // local elimination → capture the post-conquest final state
try {
  if (typeof UI !== 'undefined' && UI.isInGame && UI.isInGame()) scheduleInit('module-load');
} catch (e) { /* game lifecycle events will schedule initialization */ }
