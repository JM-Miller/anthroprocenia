import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
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
function context(names, state) {
  if (names.includes('townDecoPaths')) names = [...names, 'townDecoPathSteps'];
  const ctx = vm.createContext({ pos: 0, fogMode: false, hexH: 115, colShift: 0, townRender: {}, townscapeActive: () => false,
    showTownDecorationPreview() {}, walkerCrowdsActive: () => false, ...state });
  ctx.townDecoFullDetail = () => !ctx.walkerCrowdsActive();
  ctx.peopleCameraKey = () => `${ctx.viewZoom}|${ctx.viewAspectY}|${ctx.mapPanX}|${ctx.mapPanY}`;
  ctx.mapToScreen = (x, y) => ({ x, y });
  ctx.syncTownDecorationVisibility = () => {};
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const square = (x, y, r) => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
const entry = (key = 'a') => ({
  pathKey: key, center: { x: 0, y: 0 }, radius: 25,
  shapes: { streets: [], mainStreets: [], water: [], walls: [], fields: [], parks: [], plazas: [], pools: [], tents: [] },
  final: [], obstacles: { circles: [], segments: [], roads: [] },
});
const emptyPlan = () => ({ roads: [], water: [], rivers: [], bridges: [] });
const setup = () => context(['townDecorationIndex', 'townDecoPlacements', 'townDecoPaths'], {
  ...town, hexW: 100, isWaterAt: () => false,
  hashString: s => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7),
});
test('era palettes provide distinct appropriate artwork and denser silhouettes without expanding native budgets', () => {
  const palettes = [0, 1, 2].map(age => town.townDecorations(91, 4000, age));
  const kinds = palettes.map(decos => new Set(decos.map(deco => deco.kind)));
  assert.ok(kinds[0].has('amphora') && kinds[0].has('fishingRack') && kinds[0].has('torch'));
  assert.ok(kinds[1].has('lantern') && kinds[1].has('cart') && kinds[1].has('signpost'));
  assert.ok(kinds[2].has('handpump') && kinds[2].has('mailbox') && kinds[2].has('bicycle'));
  for (const kind of ['lamp', 'handpump', 'mailbox', 'bicycle']) {
    assert.equal(kinds[0].has(kind), false, `Antiquity excludes ${kind}`);
    assert.equal(kinds[1].has(kind), false, `Exploration excludes ${kind}`);
  }
  for (const decos of palettes) for (const kind of new Set(decos.map(deco => deco.kind))) {
    const [group, path] = town.decorationPath({ kind, size: 4, a: 0 }, 0, 0, 1);
    assert.ok(town.DECO_GROUPS.includes(group));
    assert.ok(path.startsWith('M') && !path.includes('NaN'), `${kind} has valid artwork`);
  }
  assert.deepEqual(palettes[2], town.townDecorations(91, 4000, 2), 'era placement stays deterministic');
  const unit = 100 / (100 * 5280);
  const placements = Array.from({ length: 2000 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), unit, pad: unit * 10,
    deco: { kind: 'plant', size: 4, a: 0 } }));
  const paths = setup().townDecoPaths(placements, { x0: -1, x1: 101, y0: -1, y1: 101 }, 4096, 20, true);
  assert.equal(paths.rendered, 1536, '50 percent more complete silhouettes fit than the old 1024-shape limit');
  const geometry = town.DECO_GROUPS.map(name => paths[name]).join('');
  assert.ok(geometry.length <= 262144 && geometry.match(/[MLZ]/g).length <= 8192);
});
test('cancelled incremental decoration geometry never publishes new cache metadata or unfinished paths', () => {
  const home = entry(), unit = 100 / (100 * 5280);
  home.decorations = Array.from({ length: 2000 }, (_, i) => ({ x: i % 20, y: Math.floor(i / 20), unit, pad: unit * 10,
    deco: { kind: 'plant', size: 4, a: 0 } }));
  const paths = Object.fromEntries(town.DECO_GROUPS.map(name => [name, { style: {}, decorationHasGeometry: true, d: 'previous',
    setAttribute(key, value) { this[key] = value; } }]));
  let shapes = 0;
  const ctx = context(['syncTownDecorations', 'townDecoPaths', 'townDecorationIndex', 'tileDecoPlacements'], {
    ...town, TAG: '[test]', console: { warn() {} }, townElementVisibility: { townDecorations: true },
    townDecoActive: () => true, townPaths: paths, townDecoScene: { key: 'previous', placements: [], rect: null },
    townKey: 'replacement', townPlan: emptyPlan(), townDecoTiles: () => [], tileDecoPlacements: () => [],
    townDecorationIndex: () => ({ circle() {} }), hashString: () => 1, viewportVegetation: function* () {},
    mapPxW: 1000, mapPxH: 1000, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, hexW: 100,
    viewZoom: 1, viewAspectY: 1, window: { innerWidth: 1000, innerHeight: 1000 },
    decorationPath(...args) { shapes++; return town.decorationPath(...args); },
  });
  const job = ctx.syncTownDecorations([home], true);
  for (let steps = 0; shapes < 10; steps++) {
    assert.ok(steps < 4000);
    const before = shapes;
    assert.equal(job.next().done, false);
    assert.ok(shapes - before <= 1, 'normalizing dense SVG silhouettes yields between shapes');
  }
  job.return();
  assert.equal(ctx.townDecoScene.key, 'previous');
  assert.ok(Object.values(paths).every(path => path.d === 'previous'));
  ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.key, 'replacement');
  assert.ok(paths.decoPlants.d.startsWith('M'));
});
test('world-scale segments and queries stay bounded at tiny townscape cell sizes without losing collisions', () => {
  const index = new town.DecorationIndex(0.01);
  index.segment(-1000000, 0, 1000000, 0, 0.1);
  assert.equal(index.cells.size, 0);
  assert.equal(index.large.length, 1);
  assert.equal(index.blocks(999999, 0.15, 0.1), true);
  assert.equal(index.blocks(999999, 1, 0.1), false);
  for (let i = 0; i < 20000; i++) index.circle(i, 2, 0.001);
  assert.ok(index.cells.size <= 8200);
  const all = index.recordsInBox({ x0: -1000001, x1: 1000001, y0: -10, y1: 10 });
  assert.equal(all.length, 20001, 'large-query fallback keeps every obstacle');
  assert.equal(index.blocks(19999, 2, 0.01), true, 'overflow records still collide');
  const diagonal = new town.DecorationIndex(0.01);
  diagonal.segment(-10000, -10000, 10000, 10000, 0.1);
  const clear = town.clearMinorRoads([[[0, 50], [10, 50]]], diagonal, 0.01);
  assert.deepEqual(clear, [[[0, 50], [10, 50]]], 'a huge stroke bounding box cannot erase dry roads');
  const crossing = town.clearMinorRoads([[[-1, 0], [1, 0]]], diagonal, 0.01);
  assert.equal(crossing.length, 2);
  assert.ok(crossing[0][1][0] < -0.15 && crossing[1][0][0] > 0.15);
});

test('spatial collision checks full footprints against circles, polygons, strokes and long clipped segments', () => {
  const index = new town.DecorationIndex(1, { x0: -20, x1: 20, y0: -20, y1: 20 });
  index.circle(-10, -10, 1);
  index.polygon(square(10, -10, 2));
  index.segment(-10000, 5, 10000, 5, 0.5);
  assert.equal(index.blocks(-8.8, -10, 0.3), true, 'center outside, footprint overlaps circle');
  assert.equal(index.blocks(12.2, -10, 0.3), true, 'footprint clips building edge');
  assert.equal(index.blocks(0, 5.7, 0.3), true, 'footprint clips river stroke');
  assert.equal(index.blocks(0, 6, 0.3), false);
  assert.equal(index.blocks(0, -10, 0.3), false);
  assert.ok(index.cells.size < 1000, 'long map geometry clipped before insertion');
  const large = new town.DecorationIndex(0.1);
  large.polygon(square(0, 0, 100));
  assert.equal(large.large.length, 1, 'large areas do not populate millions of buckets');
  assert.equal(large.blocks(99.9, 0, 0.2), true);
  const stroked = new town.DecorationIndex(1);
  stroked.polygon(square(0, 0, 2), 0.4);
  assert.equal(stroked.blocks(2.5, 0, 0.2), true, 'building stroke participates in collision checks');
  assert.equal(stroked.blocks(2.7, 0, 0.2), false);
});

test('decorations avoid every home, all street and creek types, map obstacles, link lines and bridges', () => {
  const a = entry(), b = entry('b'), plan = emptyPlan();
  a.shapes.streets = [[[-1, -0.5], [1, -0.5]]];
  a.shapes.mainStreets = [[[-1, 0.5], [1, 0.5]]];
  a.shapes.water = [[[-0.5, -1], [-0.5, 1]]];
  a.shapes.pools = [square(0.5, 0.5, 0.1)];
  a.shapes.parks = [square(-0.75, -0.75, 0.1)];
  const poly = square(5, 0, 2), part = square(8, 0, 1);
  b.final.push({ poly, parts: [part], box: town.polygonBounds(poly) });
  b.obstacles.circles.push({ x: 15, y: -15, r: 2 });
  a.obstacles.segments.push({ x1: -30, y1: -20, x2: 30, y2: -20, clear: 1 });
  a.obstacles.roads.push({ pts: [{ x: -30, y: 20 }, { x: 30, y: 20 }], half: 1 });
  plan.roads.push({ pts: [{ x: -3, y: -30 }, { x: -3, y: 30 }] });
  plan.water.push({ pts: [{ x: 13, y: -30 }, { x: 13, y: 30 }] });
  plan.rivers.push({ x1: -25, y1: 0, x2: -25, y2: 30, clear: 1 });
  plan.bridges.push({ poly: square(-3, 0, 2) });
  const ctx = setup(), index = ctx.townDecorationIndex([a, b], plan);
  const placed = [...ctx.townDecoPlacements(a, index), ...ctx.townDecoPlacements(b, index)];
  assert.ok(placed.length > 200, 'preserves a dense but non-overlapping scene');
  for (const p of placed) {
    assert.ok(!town.pointNearSegment(p.x, p.y, -25, -12.5, 25, -12.5, 0.05 * 0.2 / 20 + p.pad), 'minor roads');
    assert.ok(!town.pointNearSegment(p.x, p.y, -25, 12.5, 25, 12.5, 0.05 * 0.375 / 20 + p.pad), 'major roads');
    assert.ok(!town.pointNearSegment(p.x, p.y, -12.5, -25, -12.5, 25, 1.125 + p.pad), 'local creeks');
    assert.ok(!town.polygonNearCircle(poly, p.x, p.y, p.pad), 'neighbouring buildings');
    assert.ok(!town.polygonNearCircle(part, p.x, p.y, p.pad), 'building wings');
    assert.ok(!town.polygonNearCircle(square(12.5, 12.5, 2.5), p.x, p.y, p.pad), 'pools');
    assert.ok(Math.hypot(p.x - 15, p.y + 15) > p.pad + 2, 'existing rocks/vegetation');
    for (const [x1, y1, x2, y2, width] of [[-30, -20, 30, -20, 1], [-30, 20, 30, 20, 1], [-3, -30, -3, 30, 0.01875 / 20], [13, -30, 13, 30, 0.0225], [-25, 0, -25, 30, 1]]) {
      assert.ok(!town.pointNearSegment(p.x, p.y, x1, y1, x2, y2, width + p.pad), 'full footprint clears map/link stroke');
    }
    assert.ok(!town.polygonNearCircle(plan.bridges[0].poly, p.x, p.y, p.pad));
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    assert.ok(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) > placed[i].pad + placed[j].pad,
      'decorations cannot overlap, even between different townscapes');
  }
});

test('all generated shape vertices fit within their reserved radius, with no pink flower circles or SVG arcs', () => {
  const unit = 0.09, decos = town.townDecorations(73, 4000);
  assert.ok(!decos.some(d => d.kind === 'flower'));
  assert.ok(!town.DECO_GROUPS.includes('decoFlowers'));
  for (const deco of decos) {
    const [group, path] = town.decorationPath(deco, 0, 0, unit);
    assert.ok(town.DECO_GROUPS.includes(group));
    assert.ok(!/[aA]/.test(path), 'small polygons replace expensive circular arcs');
    const pad = unit * (deco.size * 1.15 + 0.2) + 0.015;
    for (const match of path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) assert.ok(Math.hypot(+match[1], +match[2]) <= pad);
  }
  assert.ok(!slice('ensureTownscapeLayer').includes('decoFlowers'));
});

test('viewport culling generates and caches paths only for decorations within the padded view', () => {
  let builds = 0;
  const ctx = setup(), original = ctx.decorationPath;
  ctx.decorationPath = (...args) => { builds++; return original(...args); };
  const placements = Array.from({ length: 10000 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), pad: 0.1, unit: 0.1, deco: { kind: 'rock', size: 1, a: 0 } }));
  const rect = { x0: 10, x1: 19, y0: 10, y1: 19 };
  const first = ctx.townDecoPaths(placements, rect);
  assert.equal(builds, 100, '99% of offscreen decoration paths are not generated or submitted');
  assert.equal(first.decoRocks.split('M').length - 1, 100);
  assert.equal(JSON.stringify(ctx.townDecoPaths(placements, rect)), JSON.stringify(first));
  assert.equal(builds, 100, 'cached paths reused');
  ctx.townDecoPaths(placements, { x0: 20, x1: 29, y0: 10, y1: 19 });
  assert.equal(builds, 200);
});

test('small camera pans reuse the scene and SVG attributes; larger pans update only the visible paths', () => {
  let placements = 0, renders = 0, writes = 0;
  const scene = { key: '', placements: [], rect: null };
  const ctx = context(['syncTownDecorations'], {
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, walkerCrowdsActive: () => true, DECO_GROUPS: town.DECO_GROUPS,
    townPaths: Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute: () => { writes++; } }])),
    townDecoScene: scene, townKey: 'one', townPlan: {},
    townDecoTiles: () => [], tileDecoPlacements: () => [],
    townDecorationIndex: () => ({}), townDecoPlacements: () => { placements++; return [{ x: 0, y: 0 }]; },
    townDecoPaths: () => { renders++; return Object.fromEntries(town.DECO_GROUPS.map(k => [k, ''])); },
    mapPxW: 1000, mapPxH: 1000, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
    hexW: 100, hashString: () => 1, viewportVegetation: function* () {},
    viewZoom: 1, viewAspectY: 1, window: { innerWidth: 100, innerHeight: 100 },
  });
  const homes = [{ center: { x: 0, y: 0 }, radius: 5 }];
  ctx.syncTownDecorations(homes);
  assert.equal(placements, 1);
  assert.equal(renders, 1);
  const firstWrites = writes;
  ctx.mapPanX = 10;
  ctx.syncTownDecorations(homes);
  assert.equal(writes, firstWrites);
  assert.equal(placements, 1);
  ctx.mapPanX = 50;
  ctx.syncTownDecorations(homes);
  assert.equal(renders, 2);
  assert.equal(placements, 2, 'crossing the padded viewport rebuilds placements only for the new window');
  ctx.townKey = 'changed-links';
  ctx.syncTownDecorations(homes);
  assert.equal(placements, 3, 'changed scene invalidates placement and checks new roads');
});

test('dense vegetation targets fiftyfold density without allocating offscreen candidates', () => {
  const bounds = { x0: -1000000, x1: 1000000, y0: -1000000, y1: 1000000 };
  const rect = { x0: 0, x1: 1, y0: 0, y1: 1 };
  const baseline = [...town.viewportVegetation(41, rect, bounds, 100)];
  const dense = [...town.viewportVegetation(41, rect, bounds, 5000)];
  assert.ok(dense.length >= baseline.length * 49 && dense.length <= baseline.length * 51);
  assert.ok(dense.every(d => ['plant', 'bush'].includes(d.kind) && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1));
  assert.deepEqual([...town.viewportVegetation(41, rect, bounds, 5000)], dense);
  const left = [...town.viewportVegetation(41, { ...rect, x1: 0.5 }, bounds, 5000)];
  assert.deepEqual(left, dense.filter(d => d.x <= 0.5), 'grid positions remain stable through viewport clipping');
  const clipped = { x0: 0.013, x1: 0.592, y0: 0.017, y1: 0.873 };
  assert.deepEqual([...town.viewportVegetation(41, clipped, bounds, 5000)],
    dense.filter(d => d.x >= clipped.x0 && d.x <= clipped.x1 && d.y >= clipped.y0 && d.y <= clipped.y1),
    'fractional viewport edges include their partially visible grid cells');
  const broad = [...town.viewportVegetation(41, bounds, bounds, 5000, 1000)];
  assert.ok(broad.length <= 1100, 'wide views use bounded, uniform level-of-detail sampling');
});

test('road widths are exactly one twentieth at every map scale', () => {
  for (const hexWidth of [1, 10, 100, 1000]) {
    const thin = Math.max(0.005, hexWidth * 0.0005), widths = town.townRoadWidths(hexWidth);
    for (const [name, oldFactor] of [['streets', 0.4], ['mainStreets', 0.75], ['accessRoads', 0.04], ['links', 0.75]]) {
      assert.ok(Math.abs(widths[name] / (thin * oldFactor) - 1 / 20) < 1e-12);
    }
  }
  const mainFeet = town.townRoadWidths(100).mainStreets * 5280;
  assert.ok(mainFeet > 9 && mainFeet < 11, 'major miniroads are approximately ten feet across at 100 miles per tile');
});

test('rendered roads and house connectors retain a visible opaque-width footprint under zoom and tilt', () => {
  for (const zoom of [100, 500, 3000, 30000]) for (const aspect of [0.25, 1, 2]) {
    const scale = zoom * Math.min(1, aspect), widths = town.townRoadWidths(100, scale);
    assert.ok(widths.streets * scale >= 0.9 - 1e-10);
    assert.ok(widths.accessRoads * scale >= 0.8 - 1e-10);
    assert.ok(widths.mainStreets * scale >= 1.4 - 1e-10);
    assert.ok(widths.links * scale >= 1.4 - 1e-10);
    for (const [name, width] of Object.entries(widths)) assert.ok(width >= town.townRoadWidths(100)[name], 'never shrink the physical-width rendering');
  }
});

test('real dense town vegetation renders only its viewport, avoids roofs/water and reuses a padded pan', () => {
  const home = entry();
  home.radius = 5; home.decorations = [];
  home.final = [{ poly: square(0, 0, 0.1), parts: [] }];
  const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute(name, d) { if (name === 'd') this.d = d; } }]));
  const ctx = context(['townDecorationIndex', 'syncTownDecorations', 'townDecoPaths'], {
    ...town, TAG: '[test]', hexW: 100, walkerCrowdsActive: () => false, isWaterAt: x => x > 0.3, hashString: () => 41,
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, townPaths: paths, townDecoScene: { key: '', placements: [], rect: null },
    townKey: 'one', townPlan: emptyPlan(), townDecoTiles: () => [], tileDecoPlacements: () => [],
    mapPxW: 1000, mapPxH: 1000, mapX: 0.5, mapY: 0.5, mapPanX: 0, mapPanY: 0,
    viewZoom: 1, viewAspectY: 1, window: { innerWidth: 1, innerHeight: 1 },
  });
  ctx.syncTownDecorations([home]);
  const placed = ctx.townDecoScene.placements;
  assert.ok(placed.length > 100 && placed.length <= 24000, 'dense visible plants are actually accepted and rendered');
  assert.ok(paths.decoPlants.d.length > 0 && paths.decoBushes.d.length > 0);
  for (const p of placed) {
    assert.ok(!town.decorationTouchesWater(p.x, p.y, p.pad, ctx.isWaterAt));
    assert.ok(!town.polygonNearCircle(home.final[0].poly, p.x, p.y, p.pad));
    assert.ok(p.x >= -0.75 && p.x <= 0.75 && p.y >= -0.75 && p.y <= 0.75);
  }
  assert.ok(home.decoCandidates == null, 'dense town-wide candidates are never retained');
  ctx.mapPanX += 0.05; ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements, placed, 'small pans do not regenerate dense vegetation or SVG paths');
});

test('all decoration kinds span 2-8 feet including their strokes, and vegetation resolves at the actual maximum zoom', () => {
  const ctx = setup();
  ctx.ps = n => n; ctx.TILE_MILES = 100; ctx.WALKER_MIN_DIAMETER_MILES = 0.0003;
  vm.runInContext(slice('maxViewZoom'), ctx);
  const kinds = ['plant', 'bush', 'rock', 'pebbles', 'lamp', 'bench', 'barrel', 'crate', 'table', 'cart', 'well', 'statue', 'stall', 'basket'];
  for (const hexWidth of [20, 100]) for (const kind of kinds) for (const size of [2, 5, 8]) for (const angle of [0, 0.7, 2.4]) {
    const unit = hexWidth / (100 * 5280);
    const [, path] = town.decorationPath({ kind, size, a: angle }, 0, 0, unit);
    const points = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    let diameter = 0;
    for (const a of points) for (const b of points) diameter = Math.max(diameter, Math.hypot(a[0] - b[0], a[1] - b[1]));
    const feet = diameter / unit + town.DECORATION_STROKE_FEET;
    assert.ok(Math.abs(feet - size) < 0.0001, `${kind}: ${feet} feet at width ${hexWidth}`);
  }
  for (const kind of ['plant', 'bush', 'rock', 'bench']) {
    const deco = { kind, size: 2, a: 0 }, unit = ctx.hexW / (100 * 5280);
    const placed = { deco, x: 0, y: 0, unit, pad: unit * 2.5 };
    const paths = ctx.townDecoPaths([placed], { x0: -1, x1: 1, y0: -1, y1: 1 });
    const [group, expected] = town.decorationPath(deco, 0, 0, unit);
    assert.equal(paths[group], expected, 'no hidden 1/20 vegetation reduction');
    const points = [...paths[group].matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    const zoom = ctx.maxViewZoom();
    const width = (Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0]))) * zoom;
    const height = (Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]))) * zoom;
    assert.ok(width >= 1 && height >= 1, `${kind}: ${width} x ${height} screen pixels at max zoom`);
    assert.ok(Math.max(...points.map(p => Math.hypot(...p))) <= placed.pad, 'restored geometry stays in its collision reservation');
  }
  const sized = [...town.townDecorations(73, 1000), ...town.viewportVegetation(73, { x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 0, x1: 1, y0: 0, y1: 1 }, 1000)];
  assert.ok(sized.every(deco => deco.size >= 2 && deco.size <= 8));
  const simplified = ctx.townDecoPaths(Array.from({ length: 1536 }, () =>
    ({ deco: { kind: 'cart', size: 8, a: 0 }, x: 0, y: 0, unit: 1, pad: 10 })),
    { x0: -10, x1: 10, y0: -10, y1: 10 });
  assert.equal(simplified.detailLimited, true);
  const first = simplified.decoFurniture.match(/^M([^M]+)/)[1];
  const vertices = [...('M' + first).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.equal(vertices.length, 4);
  assert.equal(vertices[2][0] - vertices[0][0] + town.DECORATION_STROKE_FEET, 8, 'budget fallback keeps the full physical span');
});

test('maximum-density decoration paths obey command, subpath and serialized-geometry limits across scales', t => {
  const kinds = ['plant', 'bush', 'pebbles', 'cart', 'bench', 'lamp', 'statue', 'rock'];
  const ctx = setup();
  for (const unit of [0.000001, 0.01, 1]) {
    const placements = Array.from({ length: 24000 }, (_, i) => ({
      x: (i % 200) * 0.01, y: Math.floor(i / 200) * 0.01, pad: unit * 2, unit,
      deco: { kind: kinds[i % kinds.length], size: 0.7, a: i * 0.1 },
    }));
    const rect = { x0: -2, x1: 4, y0: -2, y1: 4 }, paths = ctx.townDecoPaths(placements, rect);
    const d = town.DECO_GROUPS.map(group => paths[group]).join('');
    const commands = (d.match(/[MLHVQCTSAZ]/gi) || []).length;
    assert.ok(commands <= 8192, `actual commands: ${commands}`);
    assert.ok((d.match(/M/g) || []).length <= 4096);
    assert.ok((d.match(/M/g) || []).length > 1024, 'increase visible decoration density without raising command limits');
    assert.ok(d.length <= 262144);
    assert.equal(paths.detailLimited, true);
    assert.ok(placements.filter(p => p.path).length <= 4096, 'do not allocate paths for discarded candidates');
    assert.equal(JSON.stringify(ctx.townDecoPaths(placements, rect)), JSON.stringify(paths));
    const points = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
    assert.ok(Math.max(...points.map(p => +p[2])) > 1, 'sample across the view, not only the first dense home');
    t.diagnostic(`24,000 candidates at unit ${unit}: ${commands} path commands, ${d.length} characters`);
  }
});

test('dense scene rendering diagnoses detail limiting once, preserves placements, and clears paths on large pans', () => {
  const home = entry(), warnings = [];
  home.decorations = Array.from({ length: 16000 }, (_, i) => ({
    x: i % 200, y: Math.floor(i / 200), pad: 0.02, unit: 0.01,
    deco: { kind: 'cart', size: 1, a: 0 },
  }));
  const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute(name, d) { if (name === 'd') this.d = d; } }]));
  const ctx = context(['syncTownDecorations', 'townDecoPaths'], {
    ...town, TAG: '[test]', console: { warn: message => warnings.push(message) },
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, townPaths: paths, townDecoScene: { key: '', placements: [], rect: null },
    walkerCrowdsActive: () => false,
    townKey: 'one', townPlan: emptyPlan(), townDecoTiles: () => [], tileDecoPlacements: () => [],
    townDecorationIndex: () => ({ circle() {} }), hashString: () => 1, viewportVegetation: function* () {},
    mapPxW: 1000, mapPxH: 1000, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, hexW: 100,
    viewZoom: 1, viewAspectY: 1, window: { innerWidth: 1000, innerHeight: 1000 },
  });
  ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements.length, 9216);
  assert.equal(home.decorations.length, 16000, 'draw limits do not modify simulation/leisure geometry');
  assert.ok(paths.decoFurniture.d.length > 0);
  assert.equal(warnings.length, 1);
  ctx.walkerCrowdsActive = () => true; ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements.length, 9216);
  assert.equal((paths.decoFurniture.d.match(/M/g) || []).length, 4096, 'early townscape zoom shows eight times the previous 512 previews');
  ctx.walkerCrowdsActive = () => false; ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements.length, 9216, 'closer zoom upgrades detail even inside the same padded scene');
  const detailed = (paths.decoFurniture.d.match(/Z/g) || []).length;
  assert.ok(detailed >= 512 && detailed <= 1024, 'closer zoom spends the unchanged command budget on complete silhouettes');
  ctx.mapPanX = 2000; ctx.syncTownDecorations([home]);
  assert.ok(Object.values(paths).every(path => path.d === ''), 'no stale decorative geometry after panning offscreen');
  assert.ok(Object.values(paths).every(path => path.style.display === 'none'), 'empty retained SVG paths are explicitly hidden');
  ctx.mapPanX = 0; ctx.syncTownDecorations([home]);
  assert.ok(paths.decoFurniture.d.length > 0);
  assert.equal(warnings.length, 1, 'budget diagnostics do not flood the log on panning');
});

test('early decoration previews are visible at townscape entry, transition to physical size and keep the dense renderer budget', () => {
  const ctx = setup(), unit = 100 / (100 * 5280);
  const placements = Array.from({ length: 6144 }, (_, i) => ({
    x: i % 100, y: Math.floor(i / 100), unit, pad: unit * 10,
    deco: { kind: 'bush', size: 8, a: 0 },
  }));
  const rect = { x0: -1, x1: 101, y0: -1, y1: 101 };
  const detailedPath = ctx.decorationPath;
  ctx.decorationPath = () => assert.fail('preview markers must not normalize full decoration silhouettes');
  const early = ctx.townDecoPaths(placements, rect, 4096, 20);
  ctx.decorationPath = detailedPath;
  const d = town.DECO_GROUPS.map(group => early[group]).join('');
  assert.equal((d.match(/M/g) || []).length, 4096);
  assert.ok(early.strokeWidth * 20 >= 0.65); assert.ok((d.match(/[MLZ]/g) || []).length <= 8192);
  assert.ok(d.length <= 262144);
  const close = ctx.townDecoPaths([placements[0]], rect, 4096, 40000);
  assert.equal(close.strokeWidth, unit * town.DECORATION_STROKE_FEET);
  assert.equal(close.decoBushes, town.decorationPath(placements[0].deco, 0, 0, unit)[1]);
  const dense = ctx.townDecoPaths(placements, rect, 4096, 40000);
  const first = [...dense.decoBushes.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].slice(0, 2);
  const feet = Math.hypot(+first[1][1] - +first[0][1], +first[1][2] - +first[0][2]) / unit + town.DECORATION_STROKE_FEET;
  assert.ok(Math.abs(feet - 8) < 0.0001, 'dense close-zoom fallback retains the physical span');
});

test('decorations upgrade on the first update below the displayed 1000-foot boundary, independently of crowds and aspect', () => {
  for (const [width, scale, aspect] of [[1000, 1, 1], [400, 0.75, 0.001], [3840, 2, 0.5]]) {
    const home = entry(), unit = 100 / (100 * 5280);
    home.decorations = [{ x: 0, y: 0, unit, pad: unit * 10, deco: { kind: 'bush', size: 8, a: 0.4 } }];
    const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute(name, value) { this[name] = value; } }]));
    const target = Math.min(180 * scale, width * 0.3);
    let indexing = 0;
    const ctx = context(['townDecoAtScale', 'townDecoFullDetail', 'mapScaleForView', 'mapScaleMetrics',
      'syncTownDecorations', 'townDecoPaths', 'advanceTownDecorations', 'syncTownDecorationVisibility'], {
      ...town, TAG: '[test]', console: { warn() {} }, townElementVisibility: { townDecorations: true },
      townDecoActive: () => true, townPaths: paths, townDecorationLayer: { style: {} },
      townDecoScene: { key: '', placements: [], rect: null }, townKey: 'scale', townPlan: emptyPlan(),
      townRender: {}, townZoomKey: () => String(ctx.viewZoom), scheduleTownRefresh() {},
      columnShiftMarkersStale: false, fogMarkersStale: false, sizeScreenSvg() {}, syncMapSvgViewport() {},
      townDecoTiles: () => [], tileDecoPlacements: () => [], townDecorationIndex() { indexing++; return { circle() {} }; },
      hashString: () => 1, viewportVegetation: function* () {},
      mapPxW: 0, mapPxH: 0, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, hexW: 100,
      viewZoom: target * 5280 / 1500, viewAspectY: aspect, ps: n => n * scale,
      measureArea: () => ({ w: width }), window: { innerWidth: width, innerHeight: 600 }, walkerCrowdsActive: () => true,
    });
    assert.equal(ctx.mapScaleForView().label, '1000 feet');
    assert.equal(ctx.townDecoAtScale(), false);
    ctx.syncTownDecorations([home]);
    assert.equal(ctx.townDecoScene.fullDetail, false);
    assert.ok(!paths.decoBushes.d.includes('Z'));
    ctx.viewZoom = target * 5280 / 999;
    assert.equal(ctx.mapScaleForView().label, '500 feet');
    ctx.advanceTownDecorations([home]);
    assert.equal(ctx.walkerCrowdsActive(), true, 'decorations cannot wait for individual walkers');
    assert.equal(ctx.townDecoScene.fullDetail, true);
    assert.equal(ctx.townDecorationLayer.style.display, 'block');
    assert.ok(paths.decoBushes.d.includes('Z'), 'first bounded update paints closed, readable decoration artwork');
    assert.equal(indexing, 1, 'upgrading cached previews does not restart placement work');
    const commands = (paths.decoBushes.d.match(/[MLZ]/g) || []).length;
    assert.ok(commands > 0 && commands <= 8192); assert.ok(paths.decoBushes.d.length <= 262144);
  }
});

test('crowd dispersal immediately submits readable full decoration artwork within native budgets', () => {
  const unit = 100 / (100 * 5280), home = entry();
  home.decorations = Array.from({ length: 6144 }, (_, i) => ({
    x: i % 20 / 100, y: Math.floor(i / 20) / 100, unit, pad: unit * 10,
    deco: { kind: ['bush', 'plant', 'cart'][i % 3], size: 8, a: 0.4 },
  }));
  const physical = home.decorations.map(placed => [placed.unit, placed.pad]);
  const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute(name, value) { this[name] = value; } }]));
  let indexing = 0;
  const ctx = context(['walkerCrowdsActive', 'peopleCameraKey', 'mapToScreen', 'syncTownDecorations', 'townDecoPaths'], {
    ...town, CLUMP_SPLIT_SCREENS: 24, maxViewZoom: () => 1920, TAG: '[test]', console: { warn() {} },
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, townPaths: paths,
    townDecoScene: { key: '', placements: [], rect: null }, townKey: 'boundary', townPlan: emptyPlan(),
    townDecoTiles: () => [], tileDecoPlacements: () => [],
    townDecorationIndex() { indexing++; return { circle() {} }; }, hashString: () => 1, viewportVegetation: function* () {},
    mapPxW: 0, mapPxH: 0, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, hexW: 100, hexH: 100,
    viewZoom: 287, viewAspectY: 0.5, window: { innerWidth: 1000, innerHeight: 600 },
  });
  ctx.syncTownDecorations([home]);
  assert.equal(ctx.walkerCrowdsActive(), true);
  assert.equal((paths.decoBushes.d.match(/Z/g) || []).length, 0, 'crowd zoom retains lightweight previews');
  for (const [aspect, zoom] of [[0.5, 288], [0.001, 1920]]) {
    ctx.viewAspectY = aspect; ctx.viewZoom = zoom;
    assert.equal(ctx.walkerCrowdsActive(), false);
    ctx.syncTownDecorations([home]);
    assert.ok(paths.decoBushes.d.includes('Z'), 'closed bush silhouettes are submitted at the exact split');
    assert.ok(paths.decoFurniture.d.includes('Z'), 'furniture is not reduced to preview dashes');
    const vertices = [...paths.decoBushes.d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].slice(0, 7);
    let diameter = 0;
    for (const a of vertices) for (const b of vertices) diameter = Math.max(diameter, Math.hypot(+a[1] - +b[1], +a[2] - +b[2]));
    assert.ok(diameter >= 2.9 && diameter <= 3.1, 'full artwork has a readable screen-space span even at compressed maximum zoom');
    const d = town.DECO_GROUPS.map(group => paths[group].d).join('');
    assert.ok((d.match(/M/g) || []).length > 512, 'mixed close-up decorations are more numerous than the previous 512-shape ceiling');
    assert.ok((d.match(/[MLHVQCTSAZ]/gi) || []).length <= 8192);
    assert.ok(d.length <= 262144);
  }
  assert.equal(indexing, 2, 'a contained split transition reuses physical placements instead of restarting obstacle work');
  assert.deepEqual(home.decorations.map(placed => [placed.unit, placed.pad]), physical, 'rendering does not enlarge physical collision footprints');
});

test('incremental decoration preparation yields even when every candidate is rejected', () => {
  const ctx = context(['townDecorationIndex', 'townDecoPlacements', 'tileDecoPlacements'], {
    ...town, hexW: 100, hexH: 115, layoutCols: 1, basePos: [{ x: 0, y: 0 }],
    tileDecoCandidates: new Map(), tileAtMapPoint: () => 0, isWaterAt: () => false, hashString: () => 1,
  });
  const home = entry(), rect = { x0: -100, x1: 100, y0: -100, y1: 100 };
  home.obstacles.circles = Array.from({ length: 2000 }, (_, x) => ({ x, y: 0, r: 0.1 }));
  const steps = ctx.townDecorationIndex([home], emptyPlan(), rect, true);
  assert.equal(steps.next().done, false, 'index construction is deferred');
  let index;
  for (let result = steps.next(); ; result = steps.next()) {
    if (result.done) { index = result.value; break; }
  }
  assert.deepEqual(index.recordsInBox(rect), ctx.townDecorationIndex([home], emptyPlan(), rect).recordsInBox(rect));
  home.decoCandidates = town.townDecorations(1, 2000);
  for (const prepare of [
    blocked => ctx.townDecoPlacements(home, blocked, rect, 1, true),
    blocked => ctx.tileDecoPlacements([0], rect, blocked, 1, true),
  ]) {
    let probes = 0;
    const iterator = prepare({ blocks() { probes++; return true; }, circle() { assert.fail('blocked candidates must not be accepted'); } });
    for (let i = 0; i < 128; i++) {
      const before = probes;
      assert.equal(iterator.next().done, false);
      assert.ok(probes - before <= 1, 'a single step cannot scan the entire rejected candidate list');
    }
    iterator.return();
  }
});

test('native incremental decoration preparation publishes the same complete artwork as synchronous preparation', () => {
  function prepare() {
    const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute(name, value) { this[name] = value; } }]));
    const ctx = context(['townDecorationIndex', 'townDecoPlacements', 'tileDecoPlacements', 'syncTownDecorations', 'townDecoPaths'], {
      ...town, TAG: '[test]', console: { warn() {} }, hexW: 100, isWaterAt: () => false, hashString: () => 41,
      townElementVisibility: { townDecorations: true }, townDecoActive: () => true, townPaths: paths,
      townDecoScene: { key: '', placements: [], rect: null }, townKey: 'parity', townPlan: emptyPlan(),
      townDecoTiles: () => [], mapPxW: 0, mapPxH: 0, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
      viewZoom: 288, viewAspectY: 0.5, window: { innerWidth: 600, innerHeight: 600 },
    });
    const home = entry(); home.radius = 5;
    return { ctx, paths, home };
  }
  const sync = prepare(), incremental = prepare();
  sync.ctx.syncTownDecorations([sync.home]);
  const iterator = incremental.ctx.syncTownDecorations([incremental.home], true);
  let yields = 0;
  for (let result = iterator.next(); !result.done; result = iterator.next()) {
    yields++;
    assert.ok(Object.values(incremental.paths).every(path => path.d === undefined), 'partial SVG geometry is not published');
  }
  assert.ok(yields > 64, 'native preparation really requires multiple batches');
  assert.equal(JSON.stringify(incremental.paths), JSON.stringify(sync.paths));
  assert.equal(incremental.ctx.townDecoScene.placements.length, sync.ctx.townDecoScene.placements.length);
});

test('close-zoom vegetation is much denser across the viewport without retaining a dense town-wide array', () => {
  const home = entry(); home.radius = 5; home.decorations = [];
  const paths = Object.fromEntries(town.DECO_GROUPS.map(k => [k, { style: {}, setAttribute() {} }]));
  const ctx = context(['townDecorationIndex', 'syncTownDecorations', 'townDecoPaths'], {
    ...town, TAG: '[test]', hexW: 100, isWaterAt: () => false, hashString: () => 41,
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, townPaths: paths,
    townDecoScene: { key: '', placements: [], rect: null }, townKey: 'dense', townPlan: emptyPlan(),
    townDecoTiles: () => [], tileDecoPlacements: () => [], mapPxW: 0, mapPxH: 0, mapX: 0, mapY: 0,
    mapPanX: 0, mapPanY: 0, viewZoom: 40000, viewAspectY: 1, window: { innerWidth: 1600, innerHeight: 900 },
  });
  ctx.syncTownDecorations([home]);
  const scene = ctx.townDecoScene, bounds = { x0: -6, x1: 6, y0: -6, y1: 6 };
  const oldDensity = 4000 * 0.695 * 49 / (Math.PI * 5.75 ** 2);
  const baseline = [...town.viewportVegetation(41, scene.rect, bounds, oldDensity)];
  assert.ok(scene.placements.length >= 80 && scene.placements.length >= Math.max(1, baseline.length) * 32,
    `${scene.placements.length} accepted decorations versus ${baseline.length} former candidates`);
  for (const left of [true, false]) for (const top of [true, false]) {
    assert.ok(scene.placements.some(p => (p.x < 0.02) === left && (p.y < 0.01125) === top), 'dense detail covers every viewport quadrant');
  }
  assert.ok(home.decoCandidates == null); assert.ok(scene.placements.length <= 6144);
});

test('indexed placement performs at least 20x fewer obstacle probes than scanning every obstacle', t => {
  const obstacles = [];
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) obstacles.push({ x: x * 2, y: y * 2, r: 0.3 });
  const index = new town.DecorationIndex(1.5);
  for (const o of obstacles) index.circle(o.x, o.y, o.r);
  const samples = town.townDecorations(41, 4000).map(d => ({ x: d.x * 40 + 50, y: d.y * 40 + 50 }));
  const start = performance.now(), indexed = samples.map(p => index.blocks(p.x, p.y, 0.15)), indexedMs = performance.now() - start;
  let probes = 0;
  const baseline = performance.now();
  const naive = samples.map(p => {
    for (const o of obstacles) { probes++; if (Math.hypot(p.x - o.x, p.y - o.y) <= o.r + 0.15) return true; }
    return false;
  });
  const naiveMs = performance.now() - baseline;
  assert.deepEqual(indexed, naive, 'broad phase preserves exact collision results');
  assert.ok(index.probes * 20 < probes, `${index.probes} indexed probes vs ${probes} linear probes`);
  t.diagnostic(`4000 queries / 2500 obstacles: ${index.probes} indexed vs ${probes} linear probes; ${indexedMs.toFixed(1)}ms indexed vs ${naiveMs.toFixed(1)}ms linear`);
});
