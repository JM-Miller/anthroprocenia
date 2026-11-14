import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
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
function scene(width, height) {
  const basePos = Array.from({ length: width * height }, (_, i) => ({
    x: (i % width) * 12 + (Math.floor(i / width) % 2) * 6, y: Math.floor(i / width) * 10.5,
  }));
  const neighborsByIndex = basePos.map((_, i) => {
    const x = i % width, y = Math.floor(i / width), shift = y % 2;
    return [[x + 1, y], [x - 1, y], [x + shift, y - 1], [x + shift - 1, y - 1],
      [x + shift, y + 1], [x + shift - 1, y + 1]]
      .map(([c, r]) => c >= 0 && c < width && r >= 0 && r < height ? r * width + c : -1);
  });
  let current = null, polygons = [], vertices = 0, fills = 0;
  const logs = [];
  const ctx = context(['prepareFringeScene', 'fringeNeedsRefresh', 'fringeViewRect', 'fringeTier', 'paintEdgeFringe', 'hexVert'], {
    basePos, neighborsByIndex, hexW: 12, hexH: 14, viewZoom: 1, viewAspectY: 1,
    mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, mapPxW: width * 12 + 6, mapPxH: height * 10.5 + 14,
    measureArea: () => ({ x: 0, y: 0, w: width * 12 + 6, h: height * 10.5 + 14 }),
    mapVisible: true, miniMapVisible: false, miniMapScale: 1, labelTier: () => 1,
    FRINGE_LOD: [null, { segs: 10, octaves: 3 }, { segs: 20, octaves: 4 }, { segs: 36, octaves: 5 }, { segs: 56, octaves: 6 }],
    FRINGE_SEGMENT_BUDGET: 4096,
    fringeScene: { base: null, neighbors: null, keys: new Set(), revision: 0 }, fringeSegs: 10, fringeOctaves: 3,
    EDGE_VERTS: [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]],
    tileShownColor: i => `color${i % 3}`, isWaterTile: () => false,
    coastNoise: (lo, hi, t) => Math.cos(t * 19 + lo * 0.1),
    log: message => logs.push(message),
    mapCtx: {
      beginPath() {},
      moveTo(x, y) { current = [x, y]; vertices++; },
      lineTo(x, y) { current.push(x, y); vertices++; },
      closePath() { polygons.push(JSON.stringify(current)); },
      fill() { fills++; },
    },
  });
  const reset = () => { polygons = []; vertices = fills = 0; };
  const stats = () => ({ polygons, vertices, fills });
  return { ctx, logs, stats, reset, all: new Set(basePos.map((_, i) => i)) };
}

test('giant-map fringes restore every eligible boundary without sparse sampling, using one joined triangle per coarse edge', t => {
  const { ctx, all, logs, stats } = scene(256, 160);
  const eligible = ctx.neighborsByIndex.reduce((count, neighbors, i) => count + neighbors.filter(n => n > i).length, 0);
  const boundaries = ctx.neighborsByIndex.reduce((count, neighbors, i) => count + neighbors.filter(n => n > i && n % 3 !== i % 3).length, 0);
  assert.ok(eligible * 2 > 60000, 'fixture exceeds the old minimum-segment budget before sign-split polygons');
  ctx.paintEdgeFringe(all, new Map(), null, true);
  assert.equal(ctx.fringeScene.keys.size, eligible);
  assert.equal(ctx.fringeSegs, 2);
  assert.equal(stats().polygons.length, boundaries, 'each eligible differently-colored edge receives a fringe');
  assert.equal(stats().vertices, boundaries * 3, 'merge adjacent same-side segments and deduplicate endpoints');
  assert.ok(stats().fills <= 3, 'all polygons remain color-batched');
  assert.equal(logs.length, 0);
  t.diagnostic(`${eligible} eligible edges: ${stats().polygons.length} emitted polygons / ${stats().vertices} vertices / ${stats().fills} paint calls`);
});

test('full and partial fringe repaints use identical edge selection and geometry across territory and fog changes', () => {
  const { ctx, all, logs, stats, reset } = scene(80, 60);
  ctx.paintEdgeFringe(all, new Map(), null, true);
  const full = new Set(stats().polygons), keys = [...ctx.fringeScene.keys];
  reset();
  ctx.paintEdgeFringe(new Set([...all].filter(i => i % 4 === 0)), new Map(), null, false);
  assert.ok(stats().polygons.length > 0);
  assert.ok(stats().polygons.every(polygon => full.has(polygon)), 'partial clears repaint the same decorative footprints');
  reset();
  const vis = new Uint8Array(all.size).fill(2);
  for (let i = 0; i < vis.length; i += 3) vis[i] = 0;
  ctx.paintEdgeFringe(all, new Map([[0, 7]]), vis, true);
  assert.ok(stats().polygons.every(polygon => full.has(polygon)), 'fog hides geometry rather than reallocating detail to reveal new footprints');
  assert.deepEqual([...ctx.fringeScene.keys], keys);
  assert.equal(logs.length, 0);
  ctx.basePos = ctx.basePos.map(point => ({ ...point, x: point.x + 10 }));
  ctx.prepareFringeScene();
  assert.equal(ctx.fringeScene.base, ctx.basePos, 'layout changes rebuild the bounded topology cache');
  assert.equal(logs.length, 0);
});

test('small scenes retain every eligible edge and the finer detail available within the hard budget', () => {
  const { ctx, all, logs, stats } = scene(8, 8);
  ctx.labelTier = () => 4;
  ctx.paintEdgeFringe(all, new Map(), null, true);
  const eligible = ctx.neighborsByIndex.reduce((count, neighbors, i) => count + neighbors.filter(n => n > i).length, 0);
  assert.equal(ctx.fringeScene.keys.size, eligible);
  assert.ok(ctx.fringeSegs > 2);
  assert.ok(stats().polygons.length > 0 && stats().polygons.length <= 8192);
  assert.ok(stats().vertices <= 32768);
  assert.equal(logs.length, 0);
});

test('a first partial paint and stale high-detail settings use the same per-edge subdivision limit as a full paint', () => {
  const { ctx, all, stats, reset } = scene(80, 60);
  ctx.fringeSegs = 56;
  for (const full of [false, true, false]) {
    reset();
    ctx.paintEdgeFringe(all, new Map(), null, full);
    const boundaries = [...ctx.fringeScene.keys].filter(key => Math.floor(key / 1048576) % 3 !== (key % 1048576) % 3).length;
    assert.equal(stats().polygons.length, boundaries);
    assert.equal(stats().vertices, boundaries * 3);
  }
});

test('recording/layout recycling releases the previous boundary topology and its retained map arrays', () => {
  const { ctx } = scene(80, 60);
  ctx.naturalRender = {}; ctx.syncNaturalVisibility = () => {};
  ctx.townRender = { timer: 22, viewKey: 'old', inputKey: 'old', pending: true };
  let canceled = 0;
  ctx.clearTimeout = id => { canceled = id; };
  vm.runInContext(slice('recycleAllLayers'), ctx);
  ctx.natwLayer = { byAge: new Map(), spare: [], el: null };
  ctx.prepareFringeScene();
  assert.ok(ctx.fringeScene.keys.size > 0);
  ctx.recycleAllLayers();
  assert.equal(canceled, 22);
  assert.equal(ctx.townRender.timer, 0);
  assert.equal(ctx.townRender.viewKey, '');
  assert.equal(ctx.townRender.inputKey, '');
  assert.equal(ctx.townRender.pending, false);
  assert.equal(ctx.fringeScene.base, null);
  assert.equal(ctx.fringeScene.neighbors, null);
  assert.equal(ctx.fringeScene.keys.size, 0);
  ctx.prepareFringeScene();
  assert.equal(ctx.fringeScene.base, ctx.basePos);
  assert.ok(ctx.fringeScene.keys.size > 0);
});

test('only very far zoom-out below two projected pixels suppresses fringes', () => {
  const { ctx, all, stats } = scene(80, 60);
  ctx.viewZoom = 0.1;
  ctx.paintEdgeFringe(all, new Map(), null, true);
  assert.equal(ctx.fringeTier(), 0);
  assert.equal(ctx.fringeScene.base, null, 'coarse views do not even build the decorative edge cache');
  assert.equal(stats().polygons.length, 0);
  assert.equal(stats().fills, 0);
  ctx.viewZoom = 2 / 12;
  assert.equal(ctx.fringeTier(), 1, 'exact threshold is stable');
  ctx.viewAspectY = 0.5;
  assert.equal(ctx.fringeTier(), 0, 'tilted vertical scale also limits resolvable detail');
  ctx.mapVisible = false; ctx.miniMapVisible = true; ctx.miniMapScale = 0.1;
  assert.equal(ctx.fringeTier(), 0, 'minimap cannot allocate full-map fringe for subpixel tiles');
});

test('camera crossing the fringe threshold schedules a state repaint even within one label tier', () => {
  let redraws = 0;
  const doms = Object.fromEntries(['unitDom', 'dotDom', 'wonDom', 'terrainMarkerDom', 'riverDom', 'tradeRouteDom',
    'routeDom', 'regionBorderDom', 'regionLabelDom', 'civIconDom', 'countryDom', 'settlementDom', 'geographicLabelDom'].map(name => [name, {}]));
  const ctx = context(['applyMapView', 'fringeTier', 'stateSignature'], {
    ...doms, syncCrowdVisibility() {}, hideHoverOutline() {}, applyLayerDepth() {}, clampMapPan() {},
    syncNaturalVisibility() {}, syncTownVisibility() {}, syncTownCompass() {}, syncMapLabelVisibility() {}, prepareFringeScene() {}, fringeNeedsRefresh: () => false, fringeScene: { revision: 0 },
    syncFullscreenState() {}, LAYERS: [], natwLayer: { byAge: new Map(), spare: [] }, mapFrame: null,
    miniMapVisible: false, mapVisible: true, mapPxW: 1000, mapPxH: 800, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
    viewZoom: 1, viewAspectY: 1, hexW: 12, hexH: 14, viewTransformCss: () => '',
    measureArea: () => ({ x: 0, y: 0, w: 1000, h: 800 }), syncExpansionOverlay() {}, refreshSiteLabels() {},
    pathPreview: {}, iconModeActive: () => false, townscapeActive: () => false, flagsActive: () => false, flagHits: [],
    syncTownscapes() {}, syncMapScale() {}, labelTier: () => 1, naturalDetailActive: () => true,
    naturalDecorActive: () => true, showNaturalFeatures: true, labelTierShown: 1, fringeTierShown: 1,
    iconModeShown: false, townscapeShown: false, naturalDetailShown: true, naturalDecorShown: true,
    scheduleViewDetailRedraw: () => redraws++, selectionIndicatorLastUpdate: Infinity, tileArrows: [],
    scheduleDecorRefresh() {},
    showTerritory: true, showBorders: true, showResources: true, showWonders: true, fogMode: false,
    showSettlements: true, showBuildingLabels: true, err: message => assert.fail(message),
  });
  const detailed = ctx.stateSignature();
  ctx.viewZoom = 0.1; ctx.applyMapView();
  assert.equal(redraws, 1);
  assert.equal(ctx.fringeTierShown, 0);
  assert.notEqual(ctx.stateSignature(), detailed, 'cached canvas state must be cleared rather than retaining old fringe');
  ctx.applyMapView();
  assert.equal(redraws, 1, 'unchanged camera tier does not repeatedly paint');
  ctx.viewZoom = 1; ctx.applyMapView();
  assert.equal(redraws, 2);
  assert.equal(ctx.stateSignature(), detailed, 'zooming back restores the original detail signature');
  ctx.fringeNeedsRefresh = () => true;
  ctx.applyMapView();
  assert.equal(redraws, 3, 'moving into uncached boundaries schedules a full state redraw at the same detail tier');
  assert.equal(ctx.showTerritory, true);
  assert.equal(ctx.showBorders, true);
});

test('viewport culling retains every on-screen boundary and invalidates state when panning beyond its padded region', t => {
  const { ctx, all, stats, reset } = scene(256, 160);
  ctx.measureArea = () => ({ x: 0, y: 0, w: 240, h: 160 });
  Object.assign(ctx, {
    showTerritory: true, showBorders: true, showResources: true, showWonders: true,
    fogMode: false, showSettlements: true, showBuildingLabels: true,
  });
  vm.runInContext(slice('stateSignature'), ctx);
  const initial = ctx.stateSignature();
  ctx.paintEdgeFringe(all, new Map(), null, true);
  assert.ok(ctx.fringeScene.keys.size < 2000, 'distant boundaries do not reach the canvas');
  const assertCoverage = () => {
    const view = ctx.fringeViewRect();
    for (let i = 0; i < ctx.basePos.length; i++) {
      const tile = ctx.basePos[i];
      if (tile.x < view.x0 || tile.x + ctx.hexW > view.x1 || tile.y < view.y0 || tile.y + ctx.hexH > view.y1) continue;
      for (const n of ctx.neighborsByIndex[i]) {
        if (n < 0) continue;
        const key = Math.min(i, n) * 1048576 + Math.max(i, n);
        assert.ok(ctx.fringeScene.keys.has(key), `visible tile ${i} boundary ${n} must not be sampled away`);
      }
    }
  };
  assertCoverage();
  ctx.mapPanX -= 10;
  assert.equal(ctx.fringeNeedsRefresh(), false, 'padding avoids repainting the full state canvas on every pan tick');
  assert.equal(ctx.stateSignature(), initial);
  ctx.mapPanX -= 1800;
  assert.equal(ctx.fringeNeedsRefresh(), true);
  const moved = ctx.stateSignature();
  assert.notEqual(moved, initial, 'changed coverage invalidates both unchanged-state and partial-state shortcuts');
  reset(); ctx.paintEdgeFringe(all, new Map(), null, true);
  assertCoverage();
  assert.equal(ctx.fringeNeedsRefresh(), false);
  t.diagnostic(`240 x 160 viewport on 40,960-tile map: ${ctx.fringeScene.keys.size} topology edges / ${stats().polygons.length} polygons / ${stats().vertices} vertices`);
});

test('joined fringe lobes preserve the area of the original piecewise curve through real-noise sign crossings', () => {
  const { ctx, all, stats } = scene(8, 8);
  Object.assign(ctx, { layoutTable: null, LAYOUT_N: 2048 });
  vm.runInContext(['seededUnitRandom', 'layoutGenerate', 'layoutPair', 'layoutRand', 'coastNoise'].map(slice).join('\n'), ctx);
  ctx.paintEdgeFringe(all, new Map(), null, true);
  let expected = 0, crossings = 0;
  for (const key of ctx.fringeScene.keys) {
    const lo = Math.floor(key / 1048576), hi = key % 1048576;
    if (lo % 3 === hi % 3) continue;
    const direction = ctx.neighborsByIndex[lo].indexOf(hi), ends = ctx.EDGE_VERTS[direction];
    const a = ctx.hexVert(lo, ends[0]), b = ctx.hexVert(lo, ends[1]), p = ctx.basePos[lo];
    const mx = (a[0] + b[0]) / 2 - p.x - ctx.hexW / 2, my = (a[1] + b[1]) / 2 - p.y - ctx.hexH / 2;
    const length = Math.hypot(mx, my), count = ctx.fringeSegs;
    const stepWidth = Math.abs((b[0] - a[0]) * my - (b[1] - a[1]) * mx) / length / count;
    let previous = 0;
    for (let j = 1; j <= count; j++) {
      const current = j === count ? 0 : ctx.hexW * 0.33 * ctx.coastNoise(lo, hi, j / count, ctx.fringeOctaves) * Math.sqrt(Math.sin(Math.PI * j / count));
      const total = Math.abs(previous) + Math.abs(current);
      if (previous * current < 0) {
        crossings++;
        expected += stepWidth * (previous ** 2 + current ** 2) / (2 * total);
      } else expected += stepWidth * total / 2;
      previous = current;
    }
  }
  const area = stats().polygons.reduce((sum, serialized) => {
    const points = JSON.parse(serialized);
    assert.ok(points.length >= 6 && points.every(Number.isFinite));
    let twiceArea = 0;
    for (let i = 0; i < points.length; i += 2) {
      const next = (i + 2) % points.length;
      twiceArea += points[i] * points[next + 1] - points[next] * points[i + 1];
    }
    return sum + Math.abs(twiceArea) / 2;
  }, 0);
  assert.ok(crossings > 50, 'exercise positive/negative lobe splitting, not only a monotonic curve');
  assert.ok(Math.abs(area - expected) < 1e-8, `${area} must preserve the piecewise-curve area ${expected}`);
});
