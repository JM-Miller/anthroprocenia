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
  const ctx = vm.createContext({ pos: 0, fogMode: false, hexH: 115, colShift: 0, ...state });
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
    townElementVisibility: { townDecorations: true }, townDecoActive: () => true, walkerCrowdsActive: () => false, DECO_GROUPS: town.DECO_GROUPS,
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
  assert.equal(ctx.townDecoScene.placements.length, 6144);
  assert.equal(home.decorations.length, 16000, 'draw limits do not modify simulation/leisure geometry');
  assert.ok(paths.decoFurniture.d.length > 0);
  assert.equal(warnings.length, 1);
  ctx.walkerCrowdsActive = () => true; ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements.length, 6144);
  assert.equal((paths.decoFurniture.d.match(/M/g) || []).length, 4096, 'early townscape zoom shows eight times the previous 512 previews');
  ctx.walkerCrowdsActive = () => false; ctx.syncTownDecorations([home]);
  assert.equal(ctx.townDecoScene.placements.length, 6144, 'closer zoom upgrades detail even inside the same padded scene');
  assert.equal((paths.decoFurniture.d.match(/M/g) || []).length, 4096);
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
