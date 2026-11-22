import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const persist = await loadModule('anthroprocenia-persist.js');
const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
}
function context(names, state = {}) {
  const ctx = vm.createContext({ ...town, ...panel, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const square = (x, y, w) => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
const roof = (sourceIndex, size = 1) => ({ sourceIndex, poly: square(sourceIndex * 3, 0, size), box: { x0: sourceIndex * 3, x1: sourceIndex * 3 + size, y0: 0, y1: size } });

test('population adds deterministic roofs up to a fixed geometry budget and retains the central building', () => {
  const base = [
    { poly: square(0, 0, 0.3), cls: 'civic', form: 'rect', parts: [], detail: [] },
    { poly: square(0.5, 0, 0.1), cls: 'house', form: 'rect', parts: [], detail: [] },
    { poly: square(-0.5, 0, 0.1), cls: 'house', form: 'rect', parts: [], detail: [] },
  ];
  for (const age of [0, 1, 2]) for (const population of [90, 900, 9_000_000]) {
    const dense = town.denserBuildings(base, population, age);
    assert.equal(dense.length, Math.min(town.MAX_TOWN_BUILDINGS, Math.ceil(population / [3, 4, 6][age])));
    assert.equal(dense[0], base[0], 'central roof is not shrunk');
    assert.deepEqual(town.denserBuildings(base, population, age), dense);
    for (let i = 0; i < dense.length; i++) for (let j = i + 1; j < dense.length; j++) {
      assert.equal(town.polygonsOverlap(dense[i].poly, dense[j].poly), false);
    }
  }
});

test('dense generated layouts remain bounded and roofs survive compact persistence', () => {
  for (const age of [0, 1, 2]) {
    const shapes = town.generateTownscape({ seed: 35, civKey: 'CIVILIZATION_ROME', population: 100_000_000, age });
    assert.equal(shapes.buildings.length, town.MAX_TOWN_BUILDINGS);
    const encoded = persist.encodeShapes(shapes);
    assert.ok(JSON.stringify(encoded).length < persist.MAX_RECORD_CHARS);
    const decoded = persist.decodeShapes(encoded);
    assert.equal(decoded.buildings.length, shapes.buildings.length);
    for (const b of decoded.buildings) {
      const bounds = town.polygonBounds(b.poly);
      assert.ok(bounds.x1 > bounds.x0 && bounds.y1 > bounds.y0, 'quantization does not collapse roofs');
    }
  }
});

test('accepted roofs own every person exactly once, with fivefold capacity for big buildings and bounded exclusions', () => {
  const buildings = [roof(0, 3), roof(2), roof(5)];
  for (const age of [0, 1, 2]) for (let total = 0; total <= 100; total++) {
    const housing = panel.buildingHousing(total, buildings, age), seen = new Set();
    assert.equal(housing.homes.size, 3, 'rejected source indices do not become invisible homes');
    let sum = 0;
    for (const [sourceIndex, home] of housing.homes) {
      sum += home.count;
      assert.equal(home.capacity, sourceIndex === 0 ? [15, 20, 30][age] : [3, 4, 6][age]);
      if (!housing.overflow) assert.ok(home.count <= home.capacity);
      const residents = home.residents();
      for (let rank = 0; rank < residents.count; rank++) {
        const id = residents.indexAt(rank);
        assert.ok(!seen.has(id) && residents.includes(id));
        assert.equal(housing.sourceOf(id), sourceIndex);
        seen.add(id);
      }
    }
    assert.equal(sum, total);
    assert.equal(seen.size, total);
  }
  const huge = panel.buildingHousing(1_000_000_000, buildings, 2);
  assert.ok(huge.overflow);
  assert.equal([...huge.homes.values()].reduce((n, h) => n + h.count, 0), 1_000_000_000);
  const home = huge.homes.get(0), excluded = [0, 2, 9, 0, 5, -1, 1_000_000_000];
  const inside = home.residents(excluded);
  assert.equal(inside.count, home.count - 3);
  for (let i = 0; i < 100; i++) assert.ok(inside.includes(inside.indexAt(i)) && !excluded.includes(inside.indexAt(i)));
});

test('residence caches and walker lookup use final roofs instead of obstacle-rejected candidates', () => {
  const ctx = context(['townHousingFor']);
  const entry = { population: 50000, polys: [roof(0), roof(1), roof(2)], final: [roof(0), roof(2)], era: { age: 2 } };
  const housing = ctx.townHousingFor(entry);
  assert.equal(ctx.townHousingFor(entry), housing);
  assert.equal([...housing.homes.values()].reduce((n, h) => n + h.count, 0), entry.population);
  for (let i = 0; i < 1000; i++) assert.notEqual(housing.sourceOf(i), 1);
  entry.final = [roof(2)];
  assert.notEqual(ctx.townHousingFor(entry), housing);
  assert.equal(ctx.townHousingFor(entry).homes.get(2).count, entry.population);
  assert.match(slice('newWalker'), /townHousingFor\(group.entry\).sourceOf\(i\)/);
});

test('all water is below roads, decorations and roofs, and outer field rectangles are invisible', () => {
  const elements = [];
  const ctx = context(['ensureTownscapeLayer', 'opaqueTownColor'], {
    townLayer: null, MAP_DEPTH: 0,
    document: { createElementNS: () => ({ style: {}, classList: { add() {} }, attrs: {}, children: [],
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(child) { this.children.push(child); } }),
    body: { appendChild: el => elements.push(el) } },
  });
  ctx.ensureTownscapeLayer();
  const order = Object.keys(ctx.townPaths);
  for (const water of ['pools', 'water', 'linkWater']) for (const foreground of ['streets', 'mainStreets', 'links', 'quays', ...town.DECO_GROUPS, ...town.TOWN_CLASSES]) {
    assert.ok(order.indexOf(water) < order.indexOf(foreground), `${water} under ${foreground}`);
  }
  assert.equal(ctx.townPaths.fields.attrs.fill, 'none');
  assert.equal(ctx.townPaths.fields.attrs.stroke, 'none');
});

test('decorations appear throughout townscape zoom, including crowded and compressed views', () => {
  const ctx = context(['maxViewZoom', 'walkerCrowdsActive', 'townDecoActive'], {
    CLUMP_SPLIT_SCREENS: 12,
    WALKER_MIN_DIAMETER_MILES: 0.0003, TILE_MILES: 100, ps: n => n,
    hexW: 12, hexH: 14, viewZoom: 1, viewAspectY: 0.1,
    townscapeActive: () => true, window: { innerHeight: 1080 },
  });
  assert.equal(ctx.maxViewZoom(), 12 * 100 / (12 * 0.0003));
  ctx.viewZoom = 1080 * 8.99 / 14;
  assert.equal(ctx.townDecoActive(), true);
  ctx.viewZoom = 1080 * 9 / 14;
  assert.equal(ctx.townDecoActive(), true);
  ctx.viewZoom = ctx.maxViewZoom();
  assert.equal(ctx.townDecoActive(), true);
  ctx.window.innerHeight = 100;
  ctx.viewAspectY = 1;
  ctx.viewZoom = 100 * 12 / 14;
  assert.equal(ctx.townDecoActive(), true, 'individual-walker threshold is enough; maximum zoom is not required');
  ctx.viewZoom *= 0.99;
  assert.equal(ctx.townDecoActive(), true);
  ctx.viewZoom = ctx.maxViewZoom();
  assert.equal(ctx.townDecoActive(), true);
  ctx.viewZoom = ctx.maxViewZoom(); ctx.townscapeActive = () => false; ctx.mapVisible = false;
  assert.equal(ctx.townDecoActive(), false);
});

test('natural tile scatter works with no town, is deterministic, and excludes water and obstacle footprints', () => {
  const ctx = context(['townDecoTiles', 'tileDecoPlacements', 'townDecorationIndex'], {
    hexW: 100, hexH: 115, layoutCols: 2, mapPxW: 200, basePos: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    terrain: [5, 5], neighborsByIndex: [[1], [0]], fogMode: false, visForPos: () => [2, 0], tileDecoCandidates: new Map(),
    tileAtMapPoint: (x, y) => y >= 0 && y <= 115 ? Math.floor(((x % 200) + 200) % 200 / 100) : -1,
    isWaterAt: (x, y) => x > 45 && x < 55,
    hashString: s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7),
  });
  const rect = { x0: 10, x1: 190, y0: 10, y1: 100 };
  assert.deepEqual(Array.from(ctx.townDecoTiles(rect)), [0, 1]);
  const makeIndex = () => {
    const index = ctx.townDecorationIndex([], null, rect);
    index.polygon(square(20, 20, 20));
    index.segment(60, 0, 60, 115, 2);
    return index;
  };
  const placements = ctx.tileDecoPlacements([0, 1], rect, makeIndex());
  assert.ok(placements.length > 100 && placements.length <= 24000);
  assert.ok(placements.some(p => p.x < 100) && placements.some(p => p.x >= 100));
  assert.ok(placements.every(p => ['plant', 'bush', 'rock', 'pebbles'].includes(p.deco.kind)));
  const vegetation = placements.filter(p => p.deco.kind === 'plant' || p.deco.kind === 'bush');
  assert.ok(vegetation.length > placements.length * 0.7);
  const obstacles = makeIndex();
  for (const p of placements) assert.ok(!obstacles.blocks(p.x, p.y, p.pad) && !town.decorationTouchesWater(p.x, p.y, p.pad, ctx.isWaterAt));
  assert.equal(JSON.stringify(ctx.tileDecoPlacements([0, 1], rect, makeIndex())), JSON.stringify(placements));
  assert.ok(ctx.tileDecoCandidates.size <= 128);
  ctx.fogMode = true;
  assert.deepEqual(Array.from(ctx.townDecoTiles(rect)), [0]);
  ctx.visForPos = () => null;
  assert.deepEqual(Array.from(ctx.townDecoTiles(rect)), []);
  ctx.fogMode = false; ctx.terrain[1] = 0;
  assert.deepEqual(Array.from(ctx.townDecoTiles(rect)), [0]);
  const wrapped = ctx.tileDecoPlacements([0], { x0: 210, x1: 240, y0: 10, y1: 100 }, ctx.townDecorationIndex([], null, { x0: 210, x1: 240, y0: 10, y1: 100 }));
  assert.ok(wrapped.length > 0 && wrapped.every(p => p.x >= 210 && p.x <= 240));
});

test('roof paths are generated only near the viewport and cached through small pans', () => {
  let writes = 0;
  const keys = [...town.TOWN_CLASSES, 'tents', 'battleBuildings', 'detail', 'tentDetail'];
  const ctx = context(['syncTownRoofs', 'polygonPath', 'linePath', 'submitTownGeometry'], {
    TOWN_ROOF_PATHS: keys, townRoofScene: {}, townKey: 'test', viewZoom: 10, viewAspectY: 1,
    townPaths: Object.fromEntries(keys.map(k => [k, { setAttribute: () => writes++ }])),
  });
  const buildings = [roof(0), roof(1000), roof(1, 0.001)].map(b => ({ ...b, group: 'house', parts: [], detail: [] }));
  const entries = [{ kind: 'town', final: buildings }];
  ctx.syncTownRoofs(entries, -1, 10, -1, 10);
  assert.ok(buildings[0].roofPath);
  assert.equal(buildings[1].roofPath, undefined, 'offscreen geometry is not submitted');
  assert.equal(buildings[2].roofPath, undefined, 'subpixel geometry waits for sufficient zoom');
  const initial = writes;
  for (let i = 0; i < 100; i++) ctx.syncTownRoofs(entries, -1 + i / 100, 10 + i / 100, -1, 10);
  assert.equal(writes, initial);
  ctx.viewZoom = 1000;
  ctx.syncTownRoofs(entries, -1, 10, -1, 10);
  assert.ok(buildings[2].roofPath);
});

test('scene budgets limit accepted geometry, retain exact populations, and still draw decorations without icons', () => {
  const keys = [...slice('ensureTownscapeLayer').matchAll(/\['(\w+)', \{ fill:/g)].map(m => m[1]);
  const roofKeys = [...town.TOWN_CLASSES, 'tents', 'battleBuildings', 'detail', 'tentDetail'];
  const entries = Array.from({ length: 8 }, (_, home) => ({
    pathKey: String(home), kind: 'town', item: {}, center: { x: 0, y: home * 10 }, radius: 1,
    population: 10000000, paths: { accents: '' }, shapes: {},
    polys: Array.from({ length: 1000 }, (_, i) => {
      const b = roof(i);
      return { ...b, poly: b.poly.map(([x, y]) => [x, y + home * 10]),
        box: { ...b.box, y0: home * 10, y1: home * 10 + 1 }, group: 'house', form: 'rect', parts: [], detail: [] };
    }),
  }));
  let decorated = -1;
  const ctx = context(['townZoomKey', 'syncTownscapes', 'townHousingFor', 'polygonPath', 'linePath', 'syncTownRoofs', 'townMinorRoads', 'submitTownGeometry'], {
    townInterturn: { active: false }, scatterJob: null, lastMapInputTs: 0,
    syncTownVisibility() {}, syncTownElementVisibility() {}, syncTownCompass() {}, townLinkTile: () => 0, iconPoints: [], townRender: { pending: false, logged: true }, townViewKey: () => 'current',
    townDecoScene: {}, hideTownLabels() {}, syncMapLabelVisibility() {}, syncRiverDeltas() {}, syncMapSvgViewport() {}, syncTownDecorationVisibility() {}, showTownDecorationPreview() {}, placeIcons() {}, clearPeopleVisuals() {},
    terrainMarkerPaths: new Map(), unitDom: {}, dotDom: {}, wonDom: {}, mapVisible: true, showWonders: false,
    townscapeActive: () => true, bgLayer: { el: { style: {} } }, columnShiftMarkersStale: false, fogMarkersStale: false,
    townLayer: { style: {} }, ensureTownscapeLayer() {}, townKey: '', townSizeKey: '1000x1000', townHighlightKey: null,
    townPaths: Object.fromEntries(keys.map(k => [k, { style: {}, setAttribute() {} }])),
    TOWN_ROOF_PATHS: roofKeys, townRoofScene: {}, townSceneEntries: () => entries, townWaterfronts: () => [],
    planEntryLinks: () => ({ roads: [], water: [], bridges: [], tileWalls: [] }),
    townBuildingGround: function* () { return { clear: () => true }; },
    townDryRoads: function* () {}, townBridgeRoads: function* () {}, townAccessRoads: function* () {}, releaseTownSceneEntries() {}, prepareTownLeisure() {},
    window: { innerWidth: 100, innerHeight: 100 }, mapPxW: 1000, mapPxH: 1000,
    mapVisible: true, miniMapVisible: false, miniMapScale: 1, colShift: 0,
    viewZoom: 100, viewAspectY: 1, hexW: 100, hexH: 115, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, pos: 0, detailD: 4, fogMode: false,
    peopleActive: () => false, syncPeople() {}, advanceTownDecorations: e => { decorated = e.length; }, revalidateTownHover() {}, syncTownLabels() {},
    err: e => assert.fail(e), iconPoints: [], scheduleTownRefresh() {},
  });
  ctx.syncTownscapes();
  while (ctx.townRender.accessJob) ctx.syncTownscapes();
  const accepted = entries.reduce((n, e) => n + e.final.length, 0);
  assert.ok(accepted <= 6000 && accepted >= 6000 - entries.length * 3);
  for (const entry of entries) {
    assert.equal(entry.final.length % 4, 0, 'the scene budget never leaves a partial parent building');
    assert.equal([...ctx.townHousingFor(entry).homes.values()].reduce((n, h) => n + h.count, 0), entry.population);
  }
  ctx.townSceneEntries = () => [];
  ctx.syncTownscapes();
  assert.equal(decorated, 0, 'empty/townless scenes still reach decoration rendering');
});

test('ordinary town roofs are rectangular with inset margins while central and cultural monuments remain distinctive', () => {
  const buildings = [
    { cls: 'civic', form: 'palace', poly: square(0, 0, 4), parts: [], detail: [] },
    { cls: 'house', form: 'hut', poly: [[5, 0], [6, -0.5], [7, 0], [7, 1], [6, 1.5], [5, 1]], parts: [], detail: [] },
    { cls: 'sacred', form: 'dome', poly: square(8, 0, 1), parts: [], detail: [] },
  ];
  const result = town.rectangularBuildings(buildings);
  assert.equal(result[0], buildings[0]);
  assert.equal(result[2], buildings[2]);
  const p = result[1].poly;
  assert.equal(p.length, 4);
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    assert.ok(Math.abs((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) < 1e-10);
  }
  assert.equal(result[1].parts.length, 0);
  assert.equal(result[1].detail.length, 1);
  assert.deepEqual(town.rectangularBuildings(buildings), result);
  const generated = town.generateTownscape({ seed: 35, civKey: 'ROME', population: 100000, kind: 'town', age: 0 });
  const ordinary = generated.buildings.filter(b => ['house', 'store', 'industry'].includes(b.cls));
  assert.ok(ordinary.length > generated.buildings.length / 2);
  assert.ok(ordinary.filter(b => b.poly.length === 4).length > ordinary.length * 0.95);
  assert.match(slice('syncTownscapes'), /gap = hexW \* 0\.00015/);
});

test('minor, major and connecting roads stop before townscape creeks, pools, map rivers and water tiles', () => {
  const ctx = context(['townDryRoads', 'linePath'], {
    hexW: 100, hexH: 100, mapPxW: 1000, basePos: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    neighborsByIndex: [[1], [0]], terrain: [5, 0],
    hexVert: (tile, k) => [[10, -5], [15, -5], [18, 0], [15, 5], [10, 5], [8, 0]][k],
  });
  const entry = { pathKey: 'a', item: { index: 0 }, center: { x: 0, y: 0 }, radius: 1,
    shapes: { streets: [[[-20, 0], [20, 0]]], mainStreets: [[[-20, 0], [20, 0]]],
      water: [[[0, -5], [0, 5]]], pools: [square(4, -2, 2)] },
    obstacles: { segments: [{ x1: -10, y1: -5, x2: -10, y2: 5, clear: 0.5 }] } };
  const original = JSON.stringify(entry.shapes);
  const plan = { roads: [{ towns: ['a'], pts: [{ x: -20, y: 0 }, { x: 20, y: 0 }] }],
    water: [{ pts: [{ x: -5, y: -5 }, { x: -5, y: 5 }] }], rivers: [], bridges: [] };
  ctx.townDryRoads([entry], plan);
  const roads = [...entry.dryMinorRoads, ...entry.dryMainRoads, ...plan.roads.map(road => road.pts.map(p => [p.x, p.y]))];
  assert.ok(roads.length > 10);
  for (const line of roads) for (let i = 1; i < line.length; i++) {
    for (const [x, clear] of [[0, 0.0225], [-5, 0.0225], [-10, 0.5]]) {
      assert.equal(town.polygonNearSegment(square(x - clear, -5, clear * 2), ...line[i - 1], ...line[i], 0), false);
      assert.ok(!town.pointNearSegment(x, 0, ...line[i - 1], ...line[i], clear));
    }
    for (const poly of [square(4, -2, 2), square(10, -5, 5)]) {
      assert.equal(town.polygonNearSegment(poly, ...line[i - 1], ...line[i], 0), false);
    }
  }
  assert.equal(JSON.stringify(entry.shapes), original, 'persisted base layout stays unchanged');
  assert.equal(entry.linkRoads.length, plan.roads.length, 'walk graph inputs share the dry connecting-road fragments');
  assert.ok(entry.dryMainRoadPath.split('M').length > 2);
  assert.match(slice('townDecorationIndex'), /mainStreets: entry.dryMainRoads/);
  assert.match(slice('buildTownLabelSpecs'), /entry.dryMainRoads \|\| entry.shapes.mainStreets/);
});

test('river names receive explicit, prioritized labels and road label sizes are slightly larger', async () => {
  const names = await loadModule('anthroprocenia-linenames.js');
  const ctx = context(['townLineSpec', 'buildTownLabelSpecs', 'townHousingFor'], {
    ...names, popState: {}, itemHomeName: () => 'Town',
  });
  const entry = { item: {}, pathKey: 'a', center: { x: 0, y: 0 }, radius: 10, population: 0,
    shapes: { water: [[[0, 0], [1, 0]]] }, final: [], civKey: '' };
  const stream = { towns: ['a'], pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }] };
  const specs = ctx.buildTownLabelSpecs([entry], { roads: [], water: [stream] });
  const river = specs.find(spec => spec.kind === 'river'), creek = specs.find(spec => spec.kind === 'creek');
  assert.ok(river && river.text && creek && creek.text);
  assert.equal(river.text, names.townLineName('', 'Town', 'river', 100));
  assert.equal(river.rank, 1);
  assert.equal(creek.rank, 1);
  const styles = source.match(/const TOWN_LABEL_STYLE = (\{[\s\S]*?\n});/)[1];
  const style = vm.runInNewContext(`(${styles})`);
  assert.equal(style.street[0], 12);
  assert.equal(style.main[0], 13.5);
  assert.equal(style.road[0], 13);
  assert.equal(style.creek[0], 12);
  assert.equal(style.river[0], 13.5);
  assert.equal(style.building[0], 10);
});

test('all eras use exact 149/150 and 299/300 turn boundaries independent of replay length', () => {
  for (const [age, name] of ['ANTIQUITY', 'EXPLORATION', 'MODERN'].entries()) {
    for (const [turn, lvl] of [[1, 0], [149, 0], [150, 1], [299, 1], [300, 2], [999, 2]]) {
      assert.deepEqual(town.townEra(name, turn), { age, lvl });
    }
  }
  const ctx = context(['townEraNow'], {
    townEraCache: { pos: -2, frames: -1 }, pos: 0,
    frames: [[1, 149], [1, 150], [1, 299], [1, 300], [2, 1], [2, 300]],
    replayEraKey: () => ctx.frames[ctx.pos][0] === 1 ? 'ANTIQUITY' : 'EXPLORATION',
  });
  for (const [pos, lvl] of [[0, 0], [1, 1], [2, 1], [3, 2], [4, 0], [5, 2]]) {
    ctx.pos = pos;
    assert.equal(ctx.townEraNow().lvl, lvl);
  }
  ctx.pos = 0;
  const before = ctx.townEraNow();
  ctx.frames.push([2, 999]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.townEraNow())), JSON.parse(JSON.stringify(before)));
  assert.match(slice('popFrameSignature'), /v8\./, 'old phase-derived occupation and panel data is invalidated');
});

test('bumpy palisade rings are absent, while stone, bastion and recorded tile walls remain', () => {
  for (const civKey of ['ROME', 'GAUL', 'MONGOLIA']) for (const lvl of [0, 1, 2]) {
    const shapes = town.generateTownscape({ civKey, seed: 4, population: 300000, age: 0, lvl, typeKey: 'BUILDING_PALACE' });
    assert.ok(shapes.walls.every(wall => wall.length !== 73), `${civKey} ${lvl}`);
  }
  const camp = town.generateTownscape({ civKey: 'MONGOLIA', seed: 4, population: 1000, kind: 'camp', age: 0, lvl: 1, typeKey: 'UNIT_COMMANDER' });
  assert.ok(camp.walls.every(wall => wall.length !== 49));
  assert.match(slice('townscapeFor'), /`t8\|/, 'saved palisade layouts are regenerated');
  assert.match(slice('planEntryLinks'), /townTileWalls\(entries\)/);
});

test('buildings and their filled parts remain finite four-sided-or-more polygons after save round trips in every culture', () => {
  for (const civKey of town.TOWNSCAPE_CIVS) for (const age of [0, 1, 2]) for (const kind of ['town', 'camp', 'battle']) {
    const shapes = town.generateTownscape({ civKey, seed: 71, population: 100000, kind, age, lvl: 2, typeKey: kind === 'town' ? 'BUILDING_PALACE' : 'UNIT_WARRIOR' });
    for (const layout of [shapes, persist.decodeShapes(persist.encodeShapes(shapes))]) {
      for (const b of layout.buildings) for (const poly of [b.poly, ...b.parts]) {
        assert.ok(town.validBuildingPolygon(poly), `${civKey} ${age} ${kind} ${b.form}`);
      }
    }
  }
  for (const poly of [[], [[0, 0], [1, 1]], [[0, 0], [1, 0], [0, 1], [0, 0]], [[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, NaN], [0, 1]]]) {
    assert.equal(town.validBuildingPolygon(poly), false);
  }
  assert.match(slice('syncTownscapes'), /validBuildingPolygon\(footprint.poly\)/);
  assert.match(slice('syncTownscapes'), /err\(`invalid townscape building polygon/);
});

test('SVG roof polygons preserve tiny distinct vertices and thin roofs wait until both dimensions are visible', () => {
  const keys = [...town.TOWN_CLASSES, 'tents', 'battleBuildings', 'detail', 'tentDetail'];
  const ctx = context(['syncTownRoofs', 'polygonPath', 'linePath', 'submitTownGeometry'], {
    TOWN_ROOF_PATHS: keys, townRoofScene: {}, townKey: 'tiny', viewZoom: 1000, viewAspectY: 0.6,
    townPaths: Object.fromEntries(keys.map(k => [k, { setAttribute() {} }])),
  });
  const tiny = square(4.001, 4.001, 0.001);
  const path = ctx.polygonPath(tiny);
  assert.ok(path.endsWith('Z'));
  const vertices = [...path.matchAll(/[ML]([^,]+),([^MLZ]+)/g)].map(m => [+m[1], +m[2]]);
  assert.deepEqual(vertices, tiny, 'coordinate formatting must not round a roof into a line or point');
  assert.equal(town.validBuildingPolygon(vertices), true);
  const thin = { group: 'house', form: 'rect', poly: [[0, 0], [1, 0], [1, 0.0001], [0, 0.0001]],
    box: { x0: 0, x1: 1, y0: 0, y1: 0.0001 }, parts: [], detail: [] };
  ctx.syncTownRoofs([{ kind: 'town', final: [thin] }], -1, 2, -1, 2);
  assert.equal(thin.roofPath, undefined, 'long dimension alone must not trigger line-shaped rendering');
  ctx.viewZoom = 10000;
  ctx.syncTownRoofs([{ kind: 'town', final: [thin] }], -1, 2, -1, 2);
  assert.ok(thin.roofPath.endsWith('Z'));
});
