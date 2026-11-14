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
function element() {
  return {
    attrs: {}, style: {}, children: [], getAttribute(k) { return this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = v; },
    append(...children) { this.children.push(...children); },
    insertBefore(child) { this.children.unshift(child); },
    appendChild(child) { this.children.push(child); },
  };
}
function world(count = 40) {
  let now = 1000, nextTimer = 0;
  const timers = new Map(), warnings = [];
  const markers = Array.from({ length: count }, (_, i) => ({
    index: i % 4, radius: 1, shape: i % 2 ? 'tree' : 'peak', kind: i % 2 ? 'forest' : 'mountain',
    cols: '#111111|#999999', decor: true,
  }));
  const frame = new Map(), svg = element();
  const ctx = vm.createContext({
    unitDom: { el: element() }, terrainMarkerDom: { el: svg }, iconDom: {},
    mapVisible: true, miniMapVisible: false, miniMapScale: 0.1, viewZoom: 10, viewAspectY: 1,
    mapPanX: 0, mapPanY: 0, mapPxW: 1000, mapPxH: 800, mapX: 0, mapY: 0, pos: 2, colShift: 0,
    hexW: 12, hexH: 14, window: { innerWidth: 1000, innerHeight: 800 },
    naturalRender: { viewKey: '', budgetReported: false, loggedTier: '' },
    naturalMarkerGroup: null, naturalMarkerPaths: new Map(), terrainMarkerPaths: new Map(), isletMarkerPaths: new Map(),
    showNaturalFeatures: true, markerRendered: false, markerRenderedVis: null,
    fogMarkersStale: false, columnShiftMarkersStale: false, naturalDetailActive: () => true,
    naturalDecorActive: () => true, hideNaturalMarkers() {}, labelTier: () => 3, detailD: 3,
    syncMapDetailVisibility() {},
    iconModeActive: () => false, townscapeActive: () => false, fogMode: false,
    unitMapFor: () => markers, scatterJob: null, decorPendingRect: null, decorDrawnRect: null,
    tileLayoutSig: (_, group) => 'same|' + group.length, scatterCache: new Map(), SCATTER_BUDGET_MS: 14,
    scatterTileMarkers: group => group.map((_, i) => ({ x: i * 0.2, y: 1 })),
    basePos: Array.from({ length: 4 }, (_, i) => ({ x: i * 12, y: 0 })),
    terrain: null, neighborsByIndex: [], isletFrame: null, TOWN_TREE_SCALE: 0.002, TREE_KINDS: new Set(['forest']),
    improvementDotPos: new Map(), iconPoints: [], unitFlagPoints: [], townTreePoints: [], unitSlots: [],
    townPanScene: {}, placeIcons() {}, syncTownscapes() {}, curFrame: frame,
    drawSettlementLabelLayer() {}, visForPos: () => null, lastMapInputTs: 0,
    decorRefreshTimer: 0, scatterContinueTimer: 0,
    decorViewRect: () => ({ x0: 0, x1: 100, y0: 0, y1: 100 }),
    Date: { now: () => now }, setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    console: { warn: message => warnings.push(message) }, TAG: '[test]', err: message => assert.fail(message),
    cssToRgb: () => [16, 32, 48], blendCss: () => '#223344',
    document: { createElementNS: () => element() },
  });
  vm.runInContext(['naturalViewKey', 'syncNaturalVisibility', 'naturalRenderLimits', 'appendNaturalPaths', 'drawUnitLayer',
    'terrainMarkerPath', 'isletPaths', 'shapePaths', 'polyPts', 'polyCircle', 'polyRect',
    'scheduleDecorRefresh', 'scheduleScatterContinuation'].map(slice).join('\n'), ctx);
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const fn of pending) fn();
  };
  return { ctx, frame, markers, timers, warnings, runTimers, advance: ms => { now += ms; } };
}
const pathData = ctx => [...ctx.naturalMarkerPaths.values()]
  .flatMap(paths => [paths.outer.attrs.d || '', paths.inner.attrs.d || ''])
  .concat([...ctx.isletMarkerPaths.values()].flatMap(paths => paths.map(path => path.el.attrs.d || ''))).join('');

test('townscape zoom hides coarse natural glyphs immediately and does not submit replacement tree or mountain paths', () => {
  const { ctx, frame } = world();
  ctx.drawUnitLayer(frame, null);
  assert.ok(pathData(ctx).length > 0);
  ctx.townscapeActive = () => true; ctx.syncNaturalVisibility();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  ctx.drawUnitLayer(frame, null);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  assert.equal([...ctx.naturalMarkerPaths.values()].map(p => (p.outer.attrs.d || '') + (p.inner.attrs.d || '')).join(''), '');
  ctx.townscapeActive = () => false; ctx.drawUnitLayer(frame, null);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block'); assert.ok(pathData(ctx).length > 0);
});

test('zoom immediately hides retained trees/mountains and islets until a complete current-camera redraw', () => {
  const { ctx, frame, runTimers } = world();
  assert.equal(ctx.drawUnitLayer(frame, null), true);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  const islets = ctx.isletPaths('#112233', '#445566');
  ctx.syncNaturalVisibility();
  assert.ok(islets.every(path => path.el.style.display === ''));
  const oldKey = ctx.naturalRender.viewKey;
  ctx.viewZoom = 9.9;
  assert.equal(ctx.syncNaturalVisibility(), false);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none', 'do not wait for a detail-tier or one-pixel threshold');
  assert.ok(islets.every(path => path.el.style.display === 'none'));
  ctx.scheduleDecorRefresh();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none', 'queued redraw does not reveal old paths');
  runTimers();
  assert.notEqual(ctx.naturalRender.viewKey, oldKey);
  assert.equal(ctx.naturalRender.viewKey, ctx.naturalViewKey());
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  assert.ok(islets.every(path => path.el.style.display === ''));
  assert.ok(pathData(ctx).length > 0);
});

test('rapid zooming coalesces redraws and refreshes tier-one geometry instead of leaving stale detail visible', () => {
  const { ctx, frame, timers, runTimers } = world();
  ctx.labelTier = () => 1; ctx.detailD = 1; ctx.viewZoom = 1;
  ctx.drawUnitLayer(frame, null);
  let renders = 0;
  const draw = ctx.drawUnitLayer;
  ctx.drawUnitLayer = (...args) => { renders++; return draw(...args); };
  for (const zoom of [0.99, 0.9, 0.8, 0.7]) {
    ctx.viewZoom = zoom; ctx.syncNaturalVisibility(); ctx.scheduleDecorRefresh();
    assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
    assert.equal(timers.size, 1, 'replace rather than accumulate zoom redraw timers');
  }
  runTimers();
  assert.equal(renders, 1);
  assert.equal(ctx.naturalRender.viewKey, ctx.naturalViewKey());
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  ctx.mapPanX += 50; ctx.syncNaturalVisibility();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  ctx.scheduleDecorRefresh(); runTimers();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
});

test('interrupted scatter jobs from old zooms cannot restore outdated natural paths', () => {
  const { ctx, frame, timers, runTimers, advance } = world();
  ctx.drawUnitLayer(frame, null);
  ctx.scatterCache.clear();
  let layouts = 0, scans = 0;
  ctx.unitMapFor = () => { scans++; return Array.from({ length: 4 }, (_, index) => ({
    index, radius: 1, kind: 'mountain', shape: 'peak', cols: '#111111|#999999', decor: true,
  })); };
  ctx.scatterTileMarkers = group => { layouts++; advance(20); return group.map(() => ({ x: layouts, y: 1 })); };
  ctx.viewZoom = 8; ctx.syncNaturalVisibility();
  assert.equal(ctx.drawUnitLayer(frame, null), false);
  const oldJob = ctx.scatterJob;
  assert.equal(oldJob.nextTile, 1);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  ctx.viewZoom = 7; ctx.syncNaturalVisibility();
  assert.equal(ctx.drawUnitLayer(frame, null, oldJob), false);
  assert.notEqual(ctx.scatterJob, oldJob);
  assert.equal(scans, 2, 'old-camera continuation is rebuilt, never committed');
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  for (let i = 0; i < 8 && timers.size; i++) runTimers();
  assert.equal(ctx.scatterJob, null);
  assert.equal(ctx.naturalRender.viewKey, ctx.naturalViewKey());
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
});

test('a detail-tier redraw firing during active zoom cannot reveal or rebuild natural geometry early', () => {
  const { ctx, frame, runTimers, advance, timers } = world();
  ctx.drawUnitLayer(frame, null);
  ctx.viewZoom = 0.8;
  ctx.lastMapInputTs = 1000;
  let builds = 0;
  const markers = ctx.unitMapFor;
  ctx.unitMapFor = (...args) => { builds++; return markers(...args); };
  assert.equal(ctx.drawUnitLayer(frame, null), false, 'early generic redraw is deferred too');
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  assert.equal(builds, 0);
  advance(150); runTimers();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  assert.equal(builds, 0);
  assert.equal(timers.size, 1, 'one continuation waits for navigation to settle');
  advance(100); runTimers();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  assert.equal(builds, 1);
});

test('actual maximum forest/mountain SVG output is bounded and does not remove item markers or tree picking data', t => {
  const { ctx, frame, markers, warnings } = world(10000);
  markers.push({ index: 0, radius: 1, shape: 'building', kind: 'unit', cols: '#abcdef|#123456',
    item: { kind: 'building' }, labelKey: 'home' });
  assert.equal(ctx.drawUnitLayer(frame, null), true);
  const d = pathData(ctx), commands = (d.match(/[MLHVQCTSAZ]/gi) || []).length;
  assert.ok((d.match(/M/g) || []).length >= 1024, 'detailed views retain a dense sample');
  assert.ok(commands > 1000 && commands <= 8192);
  assert.ok(d.length <= 262144);
  assert.ok((d.match(/M/g) || []).length <= 1024);
  assert.equal(ctx.iconPoints.length, 0, 'fixture is outside icon mode');
  assert.ok(ctx.improvementDotPos.has('home'), 'real item anchors survive natural-detail limits');
  assert.equal(warnings.filter(message => message.includes('drawing limited')).length, 1);
  ctx.drawUnitLayer(frame, null);
  assert.equal(warnings.filter(message => message.includes('drawing limited')).length, 1);
  ctx.townscapeActive = () => true; ctx.drawUnitLayer(frame, null);
  assert.equal(pathData(ctx), '', 'townscape zoom submits no coarse natural glyphs');
  assert.equal(ctx.townTreePoints.length, 5000, 'hidden trees remain command targets and collision data');
  assert.ok(ctx.improvementDotPos.has('home'), 'townscape mode preserves real item anchors');
  t.diagnostic(`10,000 candidates: ${commands} submitted natural SVG commands, ${d.length} characters`);
});

test('islet bands and natural symbols share a hard command/character ceiling', () => {
  const { ctx, frame } = world(5000);
  ctx.terrain = [0, 0, 0, 0];
  ctx.TERRAIN_RGB = [[1, 2, 3], [4, 5, 6]];
  ctx.rgbCss = rgb => `rgb(${rgb.join(',')})`;
  ctx.landFillCss = () => '#445566'; ctx.terrainCss = () => '#445566';
  ctx.activeIslets = () => Array.from({ length: 2000 }, (_, i) => ({
    land: 0, dx: i * 0.001, dy: 0,
    verts: Array.from({ length: 16 }, (_, k) => [Math.cos(k * Math.PI / 8), Math.sin(k * Math.PI / 8)]),
  }));
  ctx.drawUnitLayer(frame, null);
  const d = pathData(ctx);
  assert.ok((d.match(/[MLHVQCTSAZ]/gi) || []).length <= 8192);
  assert.ok(d.length <= 262144);
  assert.ok([...ctx.isletMarkerPaths.values()].some(paths => paths.some(path => path.el.attrs.d.length > 0)));
});

test('failed current-camera rendering leaves old natural geometry hidden', () => {
  const { ctx, frame } = world();
  ctx.drawUnitLayer(frame, null);
  ctx.viewZoom = 0.5; ctx.syncNaturalVisibility();
  ctx.unitMapFor = () => { throw new Error('injected scatter failure'); };
  assert.throws(() => ctx.drawUnitLayer(frame, null), /injected scatter failure/);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  assert.notEqual(ctx.naturalRender.viewKey, ctx.naturalViewKey());
});

test('natural detail toggles and subpixel cutoffs override a successfully committed camera', () => {
  const { ctx, frame } = world();
  ctx.drawUnitLayer(frame, null);
  ctx.showNaturalFeatures = false; ctx.syncNaturalVisibility();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  ctx.showNaturalFeatures = true; ctx.naturalDecorActive = () => false; ctx.syncNaturalVisibility();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none', 'fresh camera cannot revive subpixel trees');
  ctx.naturalDecorActive = () => true; ctx.syncNaturalVisibility();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  const islets = ctx.isletPaths('#112233', '#445566');
  ctx.naturalDetailActive = () => false; ctx.syncNaturalVisibility();
  assert.ok(islets.every(path => path.el.style.display === 'none'));
});

test('natural path admission checks both exact command and serialized-character limits before submission', () => {
  const { ctx } = world();
  const target = { outer: [], inner: [] }, budget = { commands: 0, chars: 0 };
  const outer = 'M0,0L1,0L0,1Z';
  budget.commands = 8192 - 4;
  assert.equal(ctx.appendNaturalPaths(target, outer, '', budget), true, 'exact command budget is accepted');
  assert.equal(budget.commands, 8192);
  assert.equal(ctx.appendNaturalPaths(target, outer, '', budget), false);
  assert.equal(target.outer.length, 1, 'rejected shape submits no partial contours');
  budget.commands = 0; budget.chars = 262144 - outer.length;
  assert.equal(ctx.appendNaturalPaths(target, outer, '', budget), true);
  assert.equal(budget.chars, 262144);
  assert.equal(ctx.appendNaturalPaths(target, outer, '', budget), false);
  assert.equal(target.outer.length, 2);
  assert.equal(budget.limited, true);
});

test('zoomed-out natural detail is sampled before layout and shares a small budget with intact islet bands', () => {
  const { ctx, frame, markers } = world(10000);
  let laidOut = 0;
  const scatter = ctx.scatterTileMarkers;
  ctx.scatterTileMarkers = (...args) => { laidOut += args[0].length; return scatter(...args); };
  ctx.viewZoom = 2.36; ctx.terrain = [0, 0, 0, 0];
  ctx.TERRAIN_RGB = [[1, 2, 3], [4, 5, 6]];
  ctx.rgbCss = rgb => 'rgb(' + rgb.join(',') + ')'; ctx.terrainCss = () => '#445566';
  ctx.activeIslets = () => [{ land: -1, dx: 0, dy: 0, verts: [[-1, 0], [0, -1], [1, 0], [0, 1]] }];
  ctx.TERRAIN_RGB[8] = [7, 8, 9];
  ctx.drawUnitLayer(frame, null);
  const d = pathData(ctx);
  assert.equal(laidOut, 256, 'do not lay out all ten thousand offscreen/coarse decorations');
  assert.ok((d.match(/[MLHVQCTSAZ]/g) || []).length <= 2048); assert.ok(d.length <= 65536);
  assert.ok([...ctx.isletMarkerPaths.values()].some(paths => paths.every(path => !!path.el.attrs.d)), 'accepted islets keep all three bands');
  assert.equal(markers.length, 10000, 'sampling does not remove recorded markers');
});

test('offscreen islets are culled before constructing their three-band geometry', () => {
  const { ctx, frame } = world(0);
  const visited = [];
  ctx.terrain = [0, 0, 0, 0]; ctx.basePos[3].x = 100000;
  ctx.TERRAIN_RGB = [[1, 2, 3], [4, 5, 6]]; ctx.TERRAIN_RGB[8] = [7, 8, 9];
  ctx.rgbCss = rgb => 'rgb(' + rgb.join(',') + ')'; ctx.terrainCss = () => '#445566';
  ctx.activeIslets = index => { visited.push(index); return [{ land: -1, dx: 0, dy: 0, verts: [[-1, 0], [0, -1], [1, 0], [0, 1]] }]; };
  ctx.drawUnitLayer(frame, null);
  assert.deepEqual(visited, [0, 1, 2]); assert.ok(pathData(ctx).length > 0);
});

test('natural visibility is revoked before the map transform and minimap resize, not by a later timer', () => {
  const apply = slice('applyMapView'), mini = slice('applyMiniMapView');
  assert.ok(apply.indexOf('syncNaturalVisibility()') < apply.indexOf('el.style.transform = transform'));
  assert.ok(apply.indexOf('syncNaturalVisibility()') < apply.indexOf('syncTownscapes()'));
  assert.ok(mini.indexOf('syncNaturalVisibility()') < mini.indexOf('transform: `scale'));
});

test('the real camera update hides natural paths before transforming and restores them only from the settled draw', () => {
  const { ctx, frame, runTimers } = world();
  ctx.drawUnitLayer(frame, null);
  let transforms = 0;
  const style = {};
  Object.defineProperty(style, 'transform', { set() {
    transforms++;
    assert.equal(ctx.naturalMarkerGroup.style.display, 'none', 'no transform can expose the previous zoom geometry');
  } });
  Object.assign(ctx, {
    syncCrowdVisibility() {}, syncTownVisibility() {}, syncTownCompass() {}, syncMapLabelVisibility() {}, hideHoverOutline() {}, applyLayerDepth() {}, clampMapPan() {},
    syncFullscreenState() {}, LAYERS: [{ el: { style } }], natwLayer: { byAge: new Map(), spare: [] },
    mapFrame: null, viewTransformCss: () => 'scale(9.9)', measureArea: () => ({ x: 0, y: 0, w: 1000, h: 800 }),
    syncExpansionOverlay() {}, refreshSiteLabels() {}, pathPreview: {}, flagsActive: () => false, flagHits: [],
    syncMapScale() {}, fringeTier: () => 1, fringeNeedsRefresh: () => false, fringeTierShown: 1, iconModeShown: false, townscapeShown: false,
    labelTierShown: 3, naturalDetailShown: true, naturalDecorShown: true, tileArrows: [],
    selectionIndicatorLastUpdate: Infinity,
  });
  for (const name of ['dotDom', 'wonDom', 'riverDom', 'tradeRouteDom', 'routeDom', 'regionBorderDom', 'regionLabelDom',
    'civIconDom', 'countryDom', 'settlementDom', 'geographicLabelDom']) ctx[name] = {};
  vm.runInContext(slice('applyMapView'), ctx);
  ctx.viewZoom = 9.9;
  ctx.applyMapView();
  assert.equal(transforms, 1);
  assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
  runTimers();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  assert.equal(ctx.naturalRender.viewKey, ctx.naturalViewKey());
});

test('minimap resizing hides natural and islet paths until its new projection is rendered', () => {
  const { ctx, frame, runTimers } = world();
  ctx.mapVisible = false; ctx.miniMapVisible = true;
  ctx.drawUnitLayer(frame, null);
  const islets = ctx.isletPaths('#112233', '#445566');
  ctx.syncNaturalVisibility();
  let transforms = 0;
  const style = {};
  Object.defineProperty(style, 'transform', { set() {
    transforms++;
    assert.equal(ctx.naturalMarkerGroup.style.display, 'none');
    assert.ok(islets.every(path => path.el.style.display === 'none'));
  } });
  const host = { getBoundingClientRect: () => ({ width: 200, height: 100 }) };
  Object.assign(ctx, {
    miniMapHost: host, miniMapLayers: () => [{ parentNode: host, style }], updateMiniMapViewport() {},
  });
  vm.runInContext(slice('applyMiniMapView'), ctx);
  ctx.applyMiniMapView();
  assert.equal(transforms, 1);
  runTimers();
  assert.equal(ctx.naturalMarkerGroup.style.display, 'block');
  assert.ok(islets.every(path => path.el.style.display === ''));
});
