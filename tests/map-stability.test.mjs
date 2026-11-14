import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const town = await loadModule('anthroprocenia-townscape.js');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
function context(names, state) {
  const ctx = vm.createContext(state);
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const point = (index, x, y = 0) => ({ x, y, item: { kind: 'building', index, typeIndex: 0 } });
test('wrapping commits fog-filtered terrain before yielding and coalesces only the later marker redraw', () => {
  const callbacks = [], paints = [], fog = [0, 2, 1], frame = new Map();
  const ctx = context(['applyColumnShift'], {
    basePos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], colOfIndex: [0, 1], rowOfIndex: [0, 0],
    layoutCols: 4, colShift: 0, hexW: 10, bgLayer: { el: { style: {} } }, stateLayer: { el: { style: {} } },
    terrainMarkerDom: { el: { style: {} } }, iconDom: { el: { style: {} } },
    improvementDotPos: new Map(), iconHits: [], markBgDirty() {}, recycleAllLayers() {},
    resetUnitDom() {}, resetDotDom() {}, resetWonDom() {}, curFrame: frame,
    columnShiftRedrawPending: false, columnShiftCanvasStale: false, columnShiftMarkersStale: false,
    fogMode: true, visForPos: () => fog, ensureBackground: () => paints.push('terrain'),
    drawStateLayer(current, visibility) { assert.equal(current, frame); assert.equal(visibility, fog); paints.push('fogged-state'); },
    drawMap: () => paints.push('markers'), requestAnimationFrame: fn => callbacks.push(fn), err: message => assert.fail(message),
  });
  ctx.applyColumnShift(1);
  assert.deepEqual(paints, ['terrain', 'fogged-state']);
  assert.equal(ctx.bgLayer.el.style.visibility, '');
  assert.equal(ctx.stateLayer.el.style.visibility, '');
  assert.equal(ctx.columnShiftCanvasStale, false);
  ctx.applyColumnShift(-1);
  assert.equal(callbacks.length, 1);
  assert.equal(ctx.colShift, 3);
  callbacks[0]();
  assert.equal(paints.at(-1), 'markers');
  assert.equal(ctx.columnShiftRedrawPending, false);
});
test('region labels retain their names through zoom tiers without allocating per-character DOM', () => {
  let created = 0, tier = 1;
  const element = () => ({ style: {}, children: [], textContent: '', appendChild(child) { this.children.push(child); } });
  const ctx = context(['placeGeographyLabels', 'geographySlot', 'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap'], {
    geographyLabelSlots: { regions: [] }, regionLabelDom: { el: element() }, document: { createElement: () => { created++; return element(); } },
    basePos: [{ x: 0, y: 0 }, { x: 20, y: 0 }], hexW: 20, hexH: 24,
    labelTier: () => tier, townLabelScale: () => 1,
  });
  const labels = [{ id: 'land:0', name: 'Plains', center: 0, tiles: [0, 1] }];
  for (const zoomTier of [1, 4, 1, 2, 4, 1]) {
    tier = zoomTier; ctx.placeGeographyLabels('regions', labels, null, 15);
    const slot = ctx.geographyLabelSlots.regions[0];
    assert.equal(slot.el.textContent, 'Plains'); assert.equal(slot.visible, true);
    assert.equal(slot.el.children.length, 0, 'no glyph spans or per-character transforms');
  }
  assert.equal(created, 1, 'the same label node survives repeated far zoom-out');
});

test('long replay scans keep parsed turn records bounded and reload evicted history', () => {
  let reads = 0;
  const ctx = context(['readTurnCached'], {
    turnCache: new Map(), readTurn: t => { reads++; return { t, terr: [t] }; },
  });
  for (let t = 0; t < 12600; t++) ctx.readTurnCached(t);
  assert.equal(ctx.turnCache.size, 32);
  assert.equal(ctx.readTurnCached(0).t, 0);
  assert.equal(reads, 12601);
});

test('visible townscapes beat offscreen homes around the former two-tile sorting center', () => {
  const homes = [point(0, 0), point(1, 25), point(2, 0, 25), point(3, 25, 25)];
  const offscreen = Array.from({ length: 30 }, (_, i) => point(i + 4, 90 + i * 0.1, 90));
  const ctx = context(['townSceneEntries'], {
    pos: 0, frames: [0], detailD: 4, hexW: 100, mapPxW: 1000,
    iconPoints: [...homes, ...offscreen], townPanScene: {},
    townscapeCached: p => ({ pathKey: String(p.item.index) }), err: e => assert.fail(e),
  });
  const entries = ctx.townSceneEntries(0, 30, 0, 30);
  for (const home of homes) assert.ok(entries.some(entry => entry.pathKey === String(home.item.index)));
  assert.ok(entries.length <= 24);
  assert.equal(entries.length, 4, 'distant offscreen layouts cannot fill the scene with unnecessary geometry');
});

test('a budget-excluded town invalidates the cached pan scene before entering the viewport', () => {
  let scans = 0;
  const points = [...Array.from({ length: 24 }, (_, i) => point(i, i / 100)), point(24, 15)];
  const ctx = context(['townSceneEntries'], {
    pos: 0, frames: [0], detailD: 4, hexW: 100, mapPxW: 1000,
    iconPoints: { *[Symbol.iterator]() { scans++; yield* points; } }, townPanScene: {},
    townscapeCached: p => ({ pathKey: String(p.item.index) }), err: e => assert.fail(e),
  });
  const first = ctx.townSceneEntries(0, 1, 0, 1);
  assert.equal(first.length, 24);
  assert.ok(!first.some(entry => entry.pathKey === '24'));
  assert.equal(ctx.townSceneEntries(0.1, 1.1, 0, 1), first, 'safe small pans still reuse the walking scene');
  const moved = ctx.townSceneEntries(14, 16, 0, 1);
  assert.equal(scans, 2);
  assert.ok(moved.some(entry => entry.pathKey === '24'), 'new on-screen home cannot remain missing inside the old wide buffer');
});

test('town entry caching retains at most one scene and promotes reused entries rather than clearing everything', () => {
  let builds = 0;
  const cache = new Map(), ctx = context(['townscapeCached'], {
    pos: 0, frames: [0], detailD: 4, hexW: 100, hexH: 115, mapPxW: 10000,
    townEntryCache: cache, townscapeFor: p => ({ pathKey: String(p.item.index), serial: ++builds }),
  });
  const hot = point(0, 0), first = ctx.townscapeCached(hot);
  for (let i = 1; i <= 200; i++) {
    ctx.townscapeCached(point(i, i * 10));
    assert.equal(ctx.townscapeCached(hot), first);
    assert.ok(cache.size <= 24);
  }
  assert.equal(cache.size, 24);
  assert.equal(builds, 201);
  const retained = ctx.townscapeCached(point(200, 2000));
  ctx.townscapeCached(point(1, 10));
  assert.equal(ctx.townscapeCached(point(200, 2000)), retained, 'evict only the oldest entry, not every nearby town');
});

test('shape and path caches stay bounded while retaining recently viewed layouts', () => {
  const shapes = { buildings: [], tents: [], fields: [], parks: [] };
  const shapeCache = new Map(), pathCache = new Map();
  let generated = 0, pathBuilds = 0;
  const ctx = context(['townscapeFor'], {
    townShapeCache: shapeCache, townPathCache: pathCache,
    itemOwner: () => -1, populationForItem: () => 10, townEraNow: () => ({ age: 0, lvl: 0 }),
    neighborsByIndex: [], terrain: null, hashString: s => Number(s.split('|')[0]), itemTypeKey: () => '',
    twLibGet: () => null, generateTownscape: () => { generated++; return shapes; }, twLibPut: (_, value) => value,
    townRadiusHex: () => 0.05, hexW: 100, detailD: 4, viewFrameSignature: () => 'frame',
    townObstacles: () => ({}), townWaterfront: () => ({ buildings: [] }),
    decodePlacement: () => null, twPlacements: () => new Map(), twRememberPlacement() {},
    townscapePaths: () => { pathBuilds++; return {}; }, err: e => assert.fail(e),
  });
  const hot = point(0, 0);
  ctx.townscapeFor(hot);
  for (let i = 1; i <= 250; i++) {
    ctx.townscapeFor(point(i, i));
    ctx.townscapeFor(hot);
    assert.ok(shapeCache.size <= 24);
    assert.ok(pathCache.size <= 24);
  }
  assert.equal(generated, 251);
  assert.equal(pathBuilds, 251);
});

test('joining dense townscapes searches streets rather than thousands of building doors and never links through a roof', () => {
  let distances = 0;
  const doors = 2000;
  function localGraph(x) {
    const nodes = [{ x, y: 0 }, { x: x + 1, y: 0 }];
    const adj = [[1], [0]], cost = [[1], [1]], doorForms = new Map();
    for (let i = 0; i < doors; i++) {
      const id = nodes.length;
      nodes.push({ x: x + 0.5, y: i / doors });
      adj.push([0]); cost.push([1]); adj[0].push(id); cost[0].push(1);
      doorForms.set(id, 'rect');
    }
    return { nodes, adj, cost, doorForms, doorBuildings: new Map(), spots: new Map(), roadEnds: [], destinations: [] };
  }
  const graphs = [localGraph(0), localGraph(3)];
  const entries = graphs.map((g, i) => ({ pathKey: String(i), item: { index: 0 }, shapes: {},
    final: [], obstacles: { circles: [] }, graph: g }));
  const ctx = context(['buildTownWorld'], {
    ...town, hexW: 100, townKey: 'dense',
    Math: Object.assign(Object.create(Math), { hypot: (...args) => { distances++; return Math.hypot(...args); } }),
    walkGraphFor: entry => entry.graph, walkEdgeAllowed: () => true, walkCreekAllowed: () => true,
    townWalkCrossings: () => ({ creeks: new town.DecorationIndex(1), roads: new town.DecorationIndex(1) }),
  });

  const { graph, parts } = ctx.buildTownWorld(entries, null);
  assert.equal(graph.nodes.length, 4004);
  assert.equal(parts.get('0').streets.length, 2);
  assert.equal(parts.get('1').streets.length, 2);
  assert.ok(distances <= 12, `${distances} distance comparisons instead of door-count-squared searches`);
  assert.ok(town.graphRoute(graph, 2, doors + 4), 'residents still reach the neighbouring town through actual streets');
  const split = graphs[0].nodes.length;
  for (let i = 0; i < split; i++) for (const j of graph.adj[i]) if (j >= split) {
    assert.ok(!graph.doorForms.has(i) && !graph.doorForms.has(j), 'cross-town links cannot start or finish at building doors');
  }
});

test('panning through forests cannot retain all historical terrain decoration markers', () => {
    let rect = { x0: 0, x1: 100, y0: 0, y1: 100 };
    const ctx = context(['pushDecorMarkers'], {
      MAX_DECOR_SHAPES: 5000, detailD: 4, hexW: 100, hexH: 100, townscapeActive: () => true,
      decorCache: { key: '' }, terrain: Array(500).fill(5), neighborsByIndex: [], mapFeatureCliffs: new Set(),
      basePos: Array.from({ length: 500 }, (_, i) => ({ x: i * 100, y: 0 })),
      FEATURE_STYLES: { 1: ['green|green', 'forest', 'tree', 160] }, TREE_KINDS: new Set(['forest']),
      decorViewRect: () => rect,
    });
    const features = new Map(Array.from({ length: 500 }, (_, i) => [i, 1]));
    for (let i = 0; i < 150; i++) {
      rect = { x0: i * 100, x1: i * 100 + 100, y0: 0, y1: 100 };
      const dots = [];
      ctx.pushDecorMarkers(dots, null, features, 1, 1, 32);
      assert.ok(dots.length > 1000 && dots.length <= 10000, 'visible density is preserved');
      let retained = 0;
      for (const list of ctx.decorCache.tiles.values()) retained += list.length;
      assert.ok(retained <= 10000, `${retained} retained forest markers exceeds the live scene budget`);
      assert.ok(ctx.decorCache.tiles.size <= 64);
    }
  });

  test('decoration placement stops at its actual budget rather than building and slicing thousands of discarded objects', () => {
    let checked = 0;
    const entry = { center: { x: 0, y: 0 }, radius: 5, pathKey: 'budget' };
    const ctx = context(['townDecoPlacements'], {
      ...town, hexW: 100, hashString: () => 7, isWaterAt: () => false,
    });
    const index = { blocks: () => { checked++; return false; }, circle() {} };
    assert.equal(ctx.townDecoPlacements(entry, index, null, 0).length, 0);
    assert.equal(entry.decoCandidates, undefined, 'zero remaining budget never generates candidates');
    assert.equal(ctx.townDecoPlacements(entry, index, null, 12).length, 12);
    assert.equal(checked, 12);
    assert.match(slice('prepareTownLeisure'), /entry\.decoCandidates = null/);
  });
