import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
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
  if (names.includes('drawCountryLabelLayer')) names = [...names, 'shortCountryLabels'];
  const ctx = vm.createContext({ ps: n => n, viewZoom: 1, mapPanX: 0, mapPanY: 0, viewAspectY: 1, showLabelArches: false, showRegionBoundaries: false,
    regionOutlineState: { path: null }, els: {}, syncGeographyLabelViewport() {}, syncRegionHover() {}, hideRegionHover() {},
    showIslandNames: true, showWaterNames: true, showMountainNames: true, showWarNames: false, drawWarBorders() {},
    settlementsForPos: () => new Map(), replayEraKey: () => '', pos: 0, routeVis: null,
    TAG: '[test]', measureArea: () => ({ x: 0, y: 0, w: 1920, h: 1080 }), ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
test('geographic viewport and country UI helpers are accessible at module scope during map initialization', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: `${source}\nexport { syncGeographyLabelViewport, controlledCountryRegions, civUiDiplomacyMode, syncRegionHover, hideRegionHover, regionHoverGeometry, countryLabelComponents, regionNameForHex, syncRegionsUi, updateRegionSelectionArrow };`,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
test('civ picking keeps cached map layers above the hidden HUD and restores normal depth afterward', () => {
  const layer = { id: 'map', style: { position: 'fixed', zIndex: '100005' } };
  const ctx = context(['applyLayerDepth'], {
    document: { body: { children: [layer] } }, MAP_DEPTH: 300000, mapVisible: true,
    civSwitchPicker: { active: false },
  });
  ctx.applyLayerDepth();
  assert.equal(layer.style.zIndex, '-199995');
  ctx.civSwitchPicker.active = true; ctx.applyLayerDepth();
  assert.equal(layer.style.zIndex, '100005');
  ctx.applyLayerDepth();
  assert.equal(layer.style.zIndex, '100005');
  ctx.civSwitchPicker.active = false; ctx.applyLayerDepth();
  assert.equal(layer.style.zIndex, '-199995');
});
test('region hover dims only other known regions, feathers with retained paths, and respects map/checkbox/UI lifecycle', () => {
  const element = () => ({ style: {}, attrs: {}, children: [], classList: { add() {} },
    setAttribute(key, value) { this.attrs[key] = value; }, appendChild(child) { this.children.push(child); } });
  const body = element(), geography = { regionForTile: new Map([[0, 'a'], [1, 'b'], [2, 'c']]) };
  let geometryCalls = 0;
  const ctx = context(['hexVert', 'clipTerritoryPolygon', 'connectedBoundaryPaths', 'regionHoverGeometry', 'hideRegionHover', 'syncRegionHover', 'sizeScreenSvg'], {
    regionHoverState: { svg: null, paths: [], pointer: null }, mapVisible: true, mapRoot: {}, showRegionBoundaries: true,
    mapDrag: null, LeaderModelManager: { isLeaderShowing: false }, gameOverlayActive: () => false,
    overControlPanels: () => false, popPanelContains: () => false, MAP_DEPTH: 300000, pos: 0, colShift: 0,
    document: { body, documentElement: element(), createElementNS: element },
    window: { innerWidth: 60, innerHeight: 24, AnthroproceniaGeography: { getMapData: () => geography } },
    measureArea: () => ({ x: 0, y: 0, w: 60, h: 24 }),
    pointInRect: (x, y, area) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h,
    hexW: 20, hexH: 24, basePos: [0, 20, 40].map(x => ({ x, y: 0 })),
    neighborsByIndex: [[1, -1, -1, -1, -1, -1], [2, 0, -1, -1, -1, -1], [-1, 1, -1, -1, -1, -1]],
    EDGE_VERTS: [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]],
    mapToScreen: (x, y) => ({ x, y }), peopleCameraKey: () => 'camera',
    hexAt: x => Math.floor(x / 20), fogMode: false, visForPos: () => [2, 2, 0],
  });
  const geometry = ctx.regionHoverGeometry;
  ctx.regionHoverGeometry = (...args) => { geometryCalls++; return geometry(...args); };
  const event = x => ({ clientX: x, clientY: 12, target: body });
  const inside = (path, x, y) => {
    let contained = false;
    for (const loop of path.match(/M[^Z]+Z/g) || []) {
      const points = [...loop.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [+match[1], +match[2]]);
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, ay] = points[i], [bx, by] = points[j];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) contained = !contained;
      }
    }
    return contained;
  };
  ctx.syncRegionHover(event(30));
  const state = ctx.regionHoverState, svg = state.svg, path = state.paths[0].attrs.d;
  assert.equal(inside(path, 10, 12), true); assert.equal(inside(path, 30, 12), false); assert.equal(inside(path, 50, 12), true);
  assert.equal(svg.style.display, 'block'); assert.equal(svg.style.transform, 'none');
  assert.equal(svg.style.zIndex, '-199982');
  assert.equal(state.paths.length, 4);
  assert.deepEqual(state.paths.map(layer => Number(layer.attrs['stroke-width'])), [0, 12, 8, 4]);
  assert.ok(Number(state.paths[0].attrs.opacity) >= 0.65, 'other regions receive strong dark shading, not the former faint overlay');
  assert.ok(state.paths.slice(1).every(layer => Number(layer.attrs.opacity) > 0 && Number(layer.attrs.opacity) < Number(state.paths[0].attrs.opacity)), 'soft edge strokes remain lighter than the main shadow');
  assert.match(svg.style.cssText, /pointer-events:none/);
  ctx.syncRegionHover(event(31));
  assert.equal(geometryCalls, 1, 'moving inside the same region reuses geometry and DOM');
  ctx.fogMode = true; ctx.syncRegionHover(event(30));
  assert.equal(inside(state.paths[0].attrs.d, 50, 12), false, 'unknown neighboring regions are not shaded or outlined');
  ctx.syncRegionHover(event(50)); assert.equal(svg.style.display, 'none', 'unknown hovered tiles do not reveal region shape');
  ctx.fogMode = false; ctx.syncRegionHover(event(10));
  assert.equal(inside(state.paths[0].attrs.d, 10, 12), false); assert.equal(inside(state.paths[0].attrs.d, 30, 12), true);
  for (const key of ['showRegionBoundaries', 'mapVisible']) {
    ctx[key] = false; ctx.syncRegionHover(event(10)); assert.equal(svg.style.display, 'none');
    ctx[key] = true; ctx.syncRegionHover(event(10)); assert.equal(svg.style.display, 'block');
  }
  ctx.overControlPanels = () => true; ctx.syncRegionHover(event(10)); assert.equal(svg.style.display, 'none');
  ctx.overControlPanels = () => false; ctx.syncRegionHover(event(10));
  ctx.hideRegionHover(true); ctx.syncRegionHover(); assert.equal(svg.style.display, 'none', 'leaving the map clears the retained pointer');
  assert.equal(body.children.length, 1, 'only one overlay SVG is allocated');
  geography.regions = ['a', 'b', 'c'].map((id, index) => ({ id, tiles: [index] }));
  let arrowRegion = null;
  ctx.updateRegionSelectionArrow = (data, id) => { arrowRegion = id; };
  ctx.els.regionView = { visible: true, open: true, selected: 'b', highlight: 'c', rows: ['a', 'b', 'c'].map(id => ({ id, regionIds: [id] })) }; ctx.showRegionBoundaries = false;
  ctx.overControlPanels = () => true;
  ctx.syncRegionHover();
  assert.equal(svg.style.display, 'block', 'panel selections work without a map pointer or the borders checkbox');
  assert.equal(inside(state.paths[0].attrs.d, 30, 12), false);
  assert.equal(arrowRegion, 'b');
  ctx.els.regionView.rows[1].regionIds = ['b', 'c']; ctx.syncRegionHover();
  assert.equal(inside(state.paths[0].attrs.d, 50, 12), false, 'all same-named pieces are clear when their grouped panel row is active');
  assert.equal(inside(state.paths[0].attrs.d, 10, 12), true, 'other named groups remain shaded');
  ctx.els.regionView.selected = null; ctx.els.regionView.highlight = 'c'; ctx.fogMode = true; ctx.syncRegionHover();
  assert.equal(svg.style.display, 'none', 'a stale panel selection cannot expose an entirely hidden region');
  for (const id of ['river:Nile', 'mountains:Alps', 'continent:Europe']) {
    ctx.els.regionView = { visible: true, open: true, highlight: id, rows: [{ id, regionIds: [], tileIndices: [0, 2] }] };
    ctx.syncRegionHover();
    assert.equal(svg.style.display, 'block', `${id} highlights without a matching region record`);
    assert.equal(inside(state.paths[0].attrs.d, 10, 12), false, 'selected feature tiles stay clear');
    assert.equal(inside(state.paths[0].attrs.d, 30, 12), true, 'other known tiles are dimmed');
    assert.equal(inside(state.paths[0].attrs.d, 50, 12), false, 'hidden feature tiles are not revealed');
    assert.equal(arrowRegion, id);
  }
  ctx.civSwitchPicker = { active: true, target: 1 };
  ctx.civPickerGeography = { regionForTile: new Map([[0, null], [1, null], [2, null]]) };
  ctx.civPickerTiles = new Map([[1, new Set([0, 2])], [2, new Set([1])]]);
  ctx.fogMode = false; ctx.window.AnthroproceniaGeography = null;
  ctx.syncRegionHover();
  assert.equal(svg.style.display, 'block', 'civ picker works without geographic records, region toggles or pointer passthrough');
  assert.equal(svg.style.zIndex, '100018', 'picker shading stays above its foreground map layers');
  assert.equal(inside(state.paths[0].attrs.d, 10, 12), false);
  assert.equal(inside(state.paths[0].attrs.d, 50, 12), false, 'all disconnected territory of the hovered civ stays clear');
  assert.equal(inside(state.paths[0].attrs.d, 30, 12), true, 'other civilizations are shadowed');
  const pickerCalls = geometryCalls; ctx.syncRegionHover();
  assert.equal(geometryCalls, pickerCalls, 'same-civilization hover reuses geometry');
  ctx.civSwitchPicker.target = 2; ctx.syncRegionHover();
  assert.equal(inside(state.paths[0].attrs.d, 30, 12), false);
  ctx.civSwitchPicker.target = null; ctx.syncRegionHover();
  assert.equal(svg.style.display, 'none', 'unowned water clears picker shading');
  ctx.civSwitchPicker.active = false;
  ctx.window.AnthroproceniaGeography = { getMapData: () => geography };
  ctx.els.regionView = null; ctx.showRegionBoundaries = true; ctx.fogMode = false; ctx.overControlPanels = () => false;
  ctx.peopleCameraKey = () => 'fragmented fog';
  ctx.basePos = Array.from({ length: 601 }, (_, i) => ({ x: i * 30, y: 0 }));
  geography.regionForTile = new Map(ctx.basePos.map((_, i) => [i, i === 0 ? 'a' : 'b']));
  ctx.neighborsByIndex = []; ctx.hexAt = () => 0;
  ctx.window.innerWidth = 18030; ctx.measureArea = () => ({ x: 0, y: 0, w: 18030, h: 24 });
  ctx.regionHoverGeometry = geometry;
  ctx.syncRegionHover(event(10)); ctx.syncRegionHover(event(11));
  assert.equal(svg.style.display, 'block', 'large fragmented contours retain their shading');
  const fills = state.paths.filter(layer => layer.attrs.fill !== 'none' && layer.attrs.d);
  assert.ok(fills.length > 1, 'overbudget geometry is batched, never truncated');
  for (let i = 1; i < 601; i++) assert.ok(fills.some(layer => inside(layer.attrs.d, i * 30 + 10, 12)), `tile ${i} is shaded`);
  assert.ok(fills.every(layer => !inside(layer.attrs.d, 10, 12)), 'selected tiles stay clear across batches');
  for (const layer of state.paths) {
    assert.ok(layer.attrs.d.length <= 65536);
    assert.ok((layer.attrs.d.match(/[MLZ]/g) || []).length <= 2048);
  }
});
test('panel region arrow blinks with the shared selection style, points offscreen and hides when any known fragment enters view', () => {
  const nodes = new Map(), element = () => ({ style: {}, children: [], attrs: {}, classList: { add() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); } });
  const body = element(), head = element(), area = { x: 0, y: 0, w: 200, h: 100 };
  let pan = 0, blocked = false;
  const ctx = context(['updateRegionSelectionArrow', 'makeTileArrow', 'ensureTileArrow', 'ensureArrowStyle', 'hideTileArrow', 'selectionArrowPlacement', 'indicatorPointAvailable'], {
    regionHoverState: {}, tileArrows: [], MAP_DEPTH: 0, layoutCols: 1000, hexW: 10, hexH: 10,
    basePos: [{ x: 1000, y: 45 }, { x: 2000, y: 45 }], viewZoom: 1, viewAspectY: 1,
    mapToScreen: (x, y) => ({ x: x + pan, y }), document: { body, head, getElementById: id => nodes.get(id), createElement: element, createElementNS: element, elementFromPoint: () => body },
    arrowControlRects: () => blocked ? [{ x: 0, y: 0, w: 200, h: 100 }] : [],
    pointInRect: (x, y, rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h,
  });
  const geography = { regions: [{ id: 0, tiles: [1] }, { id: 1, tiles: [0] }] };
  const update = vis => ctx.updateRegionSelectionArrow(geography, 0, vis, area, [0, 1]);
  update(null);
  const arrow = ctx.regionHoverState.arrow, el = arrow.el;
  assert.equal(el.style.display, 'block'); assert.match(el.style.transform, /rotate\(0deg\)/);
  assert.ok(parseFloat(el.style.left) > 150 && parseFloat(el.style.left) < 200);
  assert.match(head.children[0].textContent, /anthro-selection-pulse.*infinite/);
  pan = -1000; update(null);
  assert.equal(el.style.display, 'none', 'one visible island suppresses an arrow even if another is offscreen');
  update([0, 2]);
  assert.equal(el.style.display, 'block', 'a hidden fragment does not count as a visible destination');
  update([0, 0]); assert.equal(el.style.display, 'none');
  blocked = true; pan = 0; update(null); assert.equal(el.style.display, 'none');
  blocked = false; ctx.layoutCols = 110; update(null);
  assert.match(el.style.transform, /rotate\(180deg\)/, 'wrapped direction points toward the nearer map edge');
  ctx.layoutCols = 1000;
  ctx.updateRegionSelectionArrow({ regions: [] }, 'river:Nile', null, area, [], new Set([0]));
  assert.equal(el.style.display, 'block', 'feature-only selections get the same offscreen arrow');
  pan = -1000;
  ctx.updateRegionSelectionArrow({ regions: [] }, 'river:Nile', null, area, [], new Set([0]));
  assert.equal(el.style.display, 'none', 'feature arrows disappear when their tiles enter view');
  assert.equal(body.children.length, 1); assert.equal(head.children.length, 1); assert.equal(ctx.tileArrows.length, 1);
});
test('projected region contours clip extreme camera coordinates before native submission', () => {
  const ctx = context(['clipTerritoryPolygon', 'connectedBoundaryPaths'], { hexW: 20 });
  const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const edges = square.map((a, i) => ({ a, b: square[(i + 1) % 4] }));
  const paths = ctx.connectedBoundaryPaths(edges, ([x, y]) => [x * 1e6, y * 1e6], { x0: 0, y0: 0, x1: 1920, y1: 1080 });
  assert.equal(paths.length, 1);
  const points = [...paths[0].matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => [+match[1], +match[2]]);
  assert.ok(points.length >= 4);
  assert.ok(points.every(([x, y]) => x >= 0 && x <= 1920 && y >= 0 && y <= 1080));
  assert.ok(points.some(([x, y]) => x === 1920 && y === 1080));
  assert.match(paths[0], /Z$/);
});
const point = (index, x, y = 0) => ({ x, y, item: { kind: 'building', index, typeIndex: 0 } });
test('fog reconstruction rejects a cached map of the wrong size and keeps unrecorded tiles hidden', () => {
  const ctx = context(['unpackVisI', 'unpackVisS', 'walkFrames', 'replayState', 'reconstructVisibility', 'visForPos'], {
    reconstructionCaches: new Map(), basePos: [], manifest: {}, frames: [[0, 0, 1]],
    readTurnCached: () => ({ vis: [2, 6, 10] }), curVis: null, curVisPos: -2,
  });
  assert.equal(ctx.visForPos().length, 0);
  ctx.manifest = { w: 2, h: 1 };
  assert.deepEqual([...ctx.visForPos()], [2, 2]);
  ctx.basePos = [{}, {}, {}, {}];
  const vis = ctx.visForPos();
  assert.deepEqual([...vis], [2, 2, 2, 0]);
  assert.equal(ctx.visForPos(), vis, 'unchanged dimensions reuse the reconstructed visibility');
  ctx.frames = []; ctx.curVisPos = -2;
  assert.deepEqual([...ctx.visForPos()], [0, 0, 0, 0]);
});
test('opening Map View defaults fog on while only active multiplayer locks its checkbox', () => {
  const defaults = source.slice(source.indexOf('const DEFAULT_MAP_OPTIONS ='), source.indexOf('let fogMode ='));
  for (const [multiplayer, gameOver] of [[false, false], [true, false], [true, true]]) {
    const attrs = {};
    const ctx = context(['setFogFromContext'], {
      fogLocked: false, fogMode: false, suppressFog: false,
      isMultiplayerGame: () => multiplayer, isLocalGameOver: () => gameOver,
      els: { fogToggleCb: { setAttribute(name, value) { attrs[name] = value; } } },
    });
    vm.runInContext(defaults, ctx);
    ctx.setFogFromContext();
    assert.equal(ctx.fogMode, true);
    assert.equal(attrs.selected, 'true');
    assert.equal(attrs.disabled, multiplayer && !gameOver ? 'true' : 'false');
    assert.equal(ctx.suppressFog, false);
  }
});
test('fog masks retained overhangs and missing visibility before a deferred toggle redraw, reusing unchanged geometry', () => {
  const paints = [], callbacks = [], paths = [], originalCtx = {};
  const canvas = {
    clearRect() { paths.length = 0; }, beginPath() {}, moveTo(x, y) { paths.push([[x, y]]); },
    lineTo(x, y) { paths.at(-1).push([x, y]); }, closePath() {},
    fill() { paints.push(paths.map(path => path.map(point => [...point]))); },
  };
  const ctx = context(['hexSubpath', 'drawFogLayer', 'setFogVisibility'], {
    fogLayer: { el: { style: {} }, ctx: canvas, paintKey: '', vis: null, base: null },
    mapCtx: originalCtx, mapVisible: true, miniMapVisible: false,
    mapPxW: 40, mapPxH: 12, hexW: 10, hexH: 12, colShift: 0,
    basePos: [0, 10, 20, 30].map(x => ({ x, y: 0 })), fogMode: false,
    suppressFog: false, fogLocked: false, FOG_HIDDEN: '#04060a', visForPos: () => [2, 1, 0],
    terrainMarkerDom: { el: { style: {} } }, iconDom: { el: { style: {} } },
    fogMarkersStale: false, markBgDirty() {}, cancelPendingMapDraws() {},
    placeIcons() {}, syncTownscapes() {}, nextPaint: callback => callbacks.push(callback), redraw() {},
    err: message => assert.fail(message),
  });
  ctx.setFogVisibility(true);
  assert.equal(callbacks.length, 1);
  assert.equal(paints.length, 1, 'unknown content is covered before yielding to animation frames');
  assert.deepEqual(paints[0].map(path => path[0]), [[25, 0], [35, 0]], 'both recorded-hidden and missing tiles are masked; revealed static content remains visible');
  assert.equal(ctx.mapCtx, originalCtx);
  assert.equal(ctx.terrainMarkerDom.el.style.display, 'none');
  assert.equal(ctx.iconDom.el.style.display, 'none');
  assert.equal(ctx.fogMarkersStale, true);
  ctx.drawFogLayer(ctx.fogLayer.vis);
  assert.equal(paints.length, 1, 'unchanged fog does not consume additional native canvas paint resources');
  ctx.drawFogLayer([1, 2, 0]);
  assert.equal(paints.length, 1, 'new frame arrays and line-of-sight changes reuse the same hidden-tile mask');
  ctx.colShift++;
  ctx.drawFogLayer(ctx.fogLayer.vis);
  assert.equal(paints.length, 2, 'wrapped geometry is repainted');
  ctx.fogLayer.paintKey = '';
  ctx.drawFogLayer(ctx.fogLayer.vis);
  assert.equal(paints.length, 3, 'resized backing stores are repainted');
  ctx.setFogVisibility(false);
  assert.equal(ctx.fogLayer.el.style.display, 'none');
  ctx.fogLocked = true; ctx.setFogVisibility(true);
  assert.equal(ctx.fogMode, false);
});
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
    drawFogLayer(visibility) { assert.equal(visibility, fog); paints.push('fog-mask'); },
    drawMap: () => paints.push('markers'), requestAnimationFrame: fn => callbacks.push(fn), err: message => assert.fail(message),
  });
  ctx.applyColumnShift(1);
  assert.deepEqual(paints, ['terrain', 'fogged-state', 'fog-mask']);
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

  test('geographic labels cull offscreen work and reuse their slots when panning into another part of a region', () => {
    const element = () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } });
    let pan = 0, layouts = 0;
    const ctx = context(['placeGeographyLabels', 'geographySlot', 'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap'], {
      geographyLabelSlots: { regions: [] }, regionLabelDom: { el: element() }, document: { createElement: element },
      basePos: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 100, y: 0 }], hexW: 20, hexH: 24,
      mapVisible: true, viewAspectY: 1, window: { innerWidth: 500, innerHeight: 400 },
      mapToScreen: (x, y) => ({ x: x - pan, y }), labelTier: () => 1, townLabelScale: () => 1,
    });
    const geometry = ctx.countryLabelGeometry;
    ctx.countryLabelGeometry = tiles => { layouts++; return geometry(tiles); };
    const labels = [0, 1, 2].map(index => ({ id: `land:${index}`, name: 'Gaul', nativeEarthName: true, center: index, tiles: [index] }));
    ctx.placeGeographyLabels('regions', labels, null, 15);
    assert.equal(layouts, 1, 'offscreen and duplicate Earth labels are rejected before layout');
    const slot = ctx.geographyLabelSlots.regions[0];
    pan = 5000; ctx.placeGeographyLabels('regions', labels, null, 15);
    assert.equal(layouts, 2); assert.equal(ctx.geographyLabelSlots.regions[0], slot); assert.equal(slot.visible, true);
    ctx.placeGeographyLabels('regions', labels, [0, 0, 0], 15);
    assert.equal(slot.visible, false, 'culling never exposes a hidden region');
  });
  const labels = [{ id: 'land:0', name: 'Plains', center: 0, tiles: [0, 1] }];
  for (const zoomTier of [1, 4, 1, 2, 4, 1]) {
    tier = zoomTier; ctx.viewZoom = 1 / (zoomTier * 10); ctx.placeGeographyLabels('regions', labels, null, 15);
    const slot = ctx.geographyLabelSlots.regions[0];
    assert.equal(slot.el.textContent, 'Plains'); assert.equal(slot.visible, true);
    assert.equal(slot.el.children.length, 0, 'no glyph spans or per-character transforms');
    assert.ok(parseFloat(slot.el.style.fontSize) * ctx.viewZoom / zoomTier >= 10.99, 'region text remains at least eleven screen pixels high');
  }
  assert.equal(created, 1, 'the same label node survives repeated far zoom-out');
});
test('arched text uses bounded HTML runs, not unsupported SVG paths or unbounded per-character elements', () => {
  let created = 0;
  const element = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; },
    setAttributeNS(ns, k, v) { this.attrs[k] = v; }, appendChild(child) { this.children.push(child); } });
  const ctx = context(['setArchedLines'], { document: { createElement: () => { created++; return element(); } } });
  const lines = ['A very long country name'.repeat(20), 'A second line'];
  const label = element(); ctx.setArchedLines(label, lines, 300, 30, 12);
  assert.ok(created <= 18, 'at most eight paint runs and one row per line regardless of text length');
  for (let i = 0; i < lines.length; i++) {
    const row = label.children[i];
    assert.equal(row.children.map(run => run.textContent).join(''), lines[i], 'the entire label remains visible');
    const rotation = run => Number(run.style.cssText.match(/rotate\(([-\d.]+)deg\)/)[1]);
    assert.ok(rotation(row.children[0]) < 0);
    assert.ok(rotation(row.children.at(-1)) > 0);
    assert.ok(row.style.cssText.includes('position:relative'));
    for (const run of row.children) {
      assert.ok(run.style.cssText.includes('display:block;flex:0 0 auto'), 'supported flex children determine horizontal spacing');
      assert.doesNotMatch(run.style.cssText, /inline-block|e-\d+/);
      assert.doesNotMatch(run.style.cssText, /(?:position:absolute|(?:^|;)left:|(?:^|;)width:)/);
      assert.ok(run.style.cssText.includes('font-size:12px'), 'each painted run has an explicit font size');
    }
  }
});

test('arched text curves single Latin words while preserving whitespace, combining marks and joined scripts', () => {
  const element = () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } });
  const ctx = context(['setArchedLines'], { document: { createElement: element } });
  for (const line of ['AVATAR  Western Illinois', 'Wiiiiiiide WWWWW', '大漢帝國', 'Αθηναϊκή Δημοκρατία', 'الجمهورية العربية', 'AnUnbrokenCountryName', 'Re\u0301publique']) {
    const label = element();
    ctx.setArchedLines(label, [line], 300, 30, 12);
    const runs = label.children[0].children;
    assert.equal(runs.map(run => run.textContent).join(''), line);
    assert.ok(runs.length <= 8);
    if (/^[\x20-\u024f\u0300-\u036f]+$/.test(line)) {
      assert.ok(new Set(runs.map(run => run.style.cssText.match(/rotate\(([^)]+)\)/)[1])).size >= 3, 'a single word has a genuine curve, not one diagonal transform');
      assert.ok(runs.every(run => !/^[\u0300-\u036f]/.test(run.textContent)), 'combining marks stay with their base');
    } else {
      assert.ok(runs.every((run, i) => i === runs.length - 1 || /\s$/.test(run.textContent)), 'joined words remain shaped together');
      if (!/\s/.test(line)) assert.equal(runs.length, 1);
    }
  }
});

test('arches follow measured shaped-run widths with a visible curve and read layout before writing transforms', () => {
  const width = text => Array.from(text).reduce((sum, ch) => sum + (ch === 'i' ? 3 : ch === 'W' ? 20 : ch === ' ' ? 4 : 6), 0), runs = [];
  const element = tag => {
    const value = { style: {}, children: [], appendChild(child) { this.children.push(child); } };
    if (tag === 'span') {
      runs.push(value);
      Object.defineProperty(value, 'offsetWidth', { get() {
        assert.ok(runs.every(run => !run.style.cssText.includes('transform:')), 'all width reads precede transform writes');
        return width(value.textContent);
      } });
    }
    return value;
  };
  const ctx = context(['setArchedLines'], { document: { createElement: element } }), label = element('div');
  ctx.setArchedLines(label, ['iiii WWWW tail', 'iiii WWWW tail'], 300, 40, 12);
  const first = label.children[0].children[0];
  const angle = Number(first.style.cssText.match(/rotate\(([-\d.]+)deg\)/)[1]);
  const span = width('iiii WWWW tail'), amplitude = 12 * 0.65, t = width(first.textContent) / 2 / span;
  assert.ok(Math.abs(angle - Math.atan2(-4 * amplitude * (1 - 2 * t), span) * 180 / Math.PI) <= 0.00051);
  assert.ok(parseFloat(label.children[1].style.marginTop) >= 12, 'multiple arched lines reserve space for rotated run bounds');
});

test('region, subcontinent, island and water names all retain readable arches across zoom/aspect changes and toggles', () => {
  const element = () => ({
    style: {}, children: [], _text: '',
    set textContent(value) { this._text = value; this.children = []; },
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); },
    appendChild(child) { this.children.push(child); },
  });
  const region = (id, name, center, extra = {}) => ({ id, name, center, tiles: [center], ...extra });
  const geography = {
    regions: [
      region('land:0', 'Iberia', 0), region('land:1', 'Indian Subcontinent', 1),
      region('land:2', 'Britain', 2, { island: true }),
      region('water:3', 'Atlantic Ocean', 3, { water: true }),
      region('water:4', 'Hidden Lake', 4, { water: true }),
    ],
    features: [],
  };
  const ctx = context(['drawGeographyLayers', 'drawRegionBoundaries', 'placeGeographyLabels', 'geographySlot',
    'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap', 'setArchedLines', 'setPlainLines', 'splitLabelLines'], {
    regionLabelDom: { el: element() }, geographicLabelDom: { el: element() }, regionBorderDom: { el: element() },
    regionBorderPath: { setAttribute() {} }, regionBorderKey: '', placeBorderLabels() {},
    geographyLabelSlots: { regions: [], features: [], rivers: [] }, geographyLabelCache: {},
    document: { createElement: element }, window: { AnthroproceniaGeography: { getMapData: () => geography } },
    mapVisible: true, miniMapVisible: false, showRegionLabels: true, showRegionBorders: false,
    showGeographicLabels: true, showRiverNames: false, showLabelArches: true, historicalWarLabels: () => [],
    basePos: Array.from({ length: 5 }, (_, i) => ({ x: i * 4000, y: 0 })), hexW: 20, hexH: 24,
    colShift: 0, labelTier: () => 4, townLabelScale: () => 0.35, isWaterTile: i => i >= 3,
  });
  const frame = new Map(), vis = [2, 2, 2, 2, 0];
  for (const [zoom, aspect] of [[0.1, 1], [1, 0.1], [250, 0.1], [40000, 0.001]]) {
    ctx.viewZoom = zoom; ctx.viewAspectY = aspect;
    ctx.drawGeographyLayers(frame, vis);
    const slots = ['regions', 'features'].flatMap(kind => ctx.geographyLabelSlots[kind].filter(slot => slot.visible));
    assert.deepEqual(slots.map(slot => slot.el.children.map(row => row.textContent).join(' ')).sort(),
      ['Atlantic Ocean', 'Britain', 'Iberia', 'Indian Subcontinent']);
    for (const slot of slots) {
      assert.ok(slot.el.children.length >= 1, `${slot.el.textContent} has arch rows`);
      assert.ok(slot.el.children.every(row => row.children.length > 0), 'every geographic name uses arched runs, not plain text');
      const fontSize = parseFloat(slot.el.style.fontSize);
      const scales = slot.el.style.transform.match(/scale\(([\d.e+-]+),([\d.e+-]+)\)/);
      const scaleX = Number(scales[1]), scaleY = Number(scales[2]);
      assert.ok(fontSize >= 16, 'native paint font never becomes subpixel');
      const screenFont = fontSize * scaleX * zoom;
      assert.ok(screenFont >= 9.99 && screenFont <= 24.01, 'geographic text stays readable without growing beyond 24 screen pixels');
      assert.ok(Math.abs(fontSize * scaleY * zoom * aspect - screenFont) < 0.000001, 'map compression cannot flatten the text');
      assert.ok(parseFloat(slot.el.style.width) * scaleX * zoom <= 24 * (slot.el.textContent.length * 0.68 + 0.35) + 0.01,
        'padding scales with the font rather than creating world-sized native text boxes');
      assert.ok(parseFloat(slot.el.style.height) > 0);
    }
  }
  ctx.showLabelArches = false; ctx.drawGeographyLayers(frame, vis);
  for (const kind of ['regions', 'features']) for (const slot of ctx.geographyLabelSlots[kind]) {
    assert.ok(slot.el.children.every(row => row.children.length === 0), 'disabling arches restores plain lines');
  }
  ctx.showRegionLabels = ctx.showGeographicLabels = false; ctx.drawGeographyLayers(frame, vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '0'); assert.equal(ctx.geographicLabelDom.el.style.opacity, '0');
  ctx.showRegionLabels = ctx.showGeographicLabels = ctx.showLabelArches = true; ctx.drawGeographyLayers(frame, vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '1'); assert.equal(ctx.geographicLabelDom.el.style.opacity, '1');
  assert.equal(ctx.geographyLabelSlots.features.filter(slot => slot.visible).length, 2, 'hidden water remains hidden when toggles return');
});
test('unplaceable region names are omitted instead of overlapping, including across feature layers', () => {
  const element = () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } });
  const ctx = context(['placeGeographyLabels', 'geographySlot', 'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap'], {
    geographyLabelSlots: { regions: [], features: [] }, regionLabelDom: { el: element() }, geographicLabelDom: { el: element() },
    document: { createElement: element }, basePos: [{ x: 0, y: 0 }], hexW: 20, hexH: 24,
    labelTier: () => 1, townLabelScale: () => 1,
  });
  const occupied = ctx.makeLabelBoxIndex(80);
  const first = { id: 'land:0', name: 'Plains', center: 0, tiles: [0] };
  ctx.placeGeographyLabels('regions', [first, { ...first, id: 'land:1', name: 'Valley' }], null, 15, occupied);
  assert.equal(ctx.geographyLabelSlots.regions.filter(slot => slot.visible).length, 1);
  ctx.placeGeographyLabels('features', [{ ...first, name: 'Highlands', type: 'mountains' }], null, 12, occupied);
  assert.equal(ctx.geographyLabelSlots.features.filter(slot => slot.visible).length, 0, 'feature names share collision reservations');
  ctx.placeGeographyLabels('features', [{ ...first, name: 'Ireland', nativeEarthName: true, requiredEarthName: true }], null, 12, occupied);
  assert.equal(ctx.geographyLabelSlots.features.filter(slot => slot.visible).length, 1, 'required Earth places are not dropped when the overview is crowded');
  ctx.placeGeographyLabels('features', [{ ...first, name: 'Ireland', nativeEarthName: true, requiredEarthName: true }], [0], 12, occupied);
  assert.equal(ctx.geographyLabelSlots.features.filter(slot => slot.visible).length, 0, 'required names still respect fog');
  ctx.placeGeographyLabels('regions', [first], [0], 15);
  assert.equal(ctx.geographyLabelSlots.regions[0].visible, false, 'unrevealed labels are parked');
});
test('geographic roots and arched text stay in viewport pixels through extreme zoom, pan and minimap transitions', () => {
    const element = () => ({ style: {}, children: [], appendChild(child) { this.children.push(child); } });
    const area = { x: 120, y: 80, w: 1600, h: 850 };
    const ctx = context(['syncGeographyLabelViewport', 'mapToScreen', 'placeGeographyLabels', 'geographySlot',
      'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap', 'setArchedLines', 'splitLabelLines'], {
      regionLabelDom: { el: element() }, geographicLabelDom: { el: element() },
      geographyLabelSlots: { regions: [], features: [], rivers: [] }, document: { createElement: element },
      mapVisible: true, mapPxW: 1800, mapPxH: 940, mapX: 20, mapY: 30,
      measureArea: () => area, basePos: [{ x: 890, y: 458 }], hexW: 20, hexH: 24,
      labelTier: () => 4, townLabelScale: () => 0.35, showLabelArches: true,
    });
    const labels = [{ id: 'land:0', name: 'Indian Subcontinent', center: 0, tiles: [0] }];
    for (const [zoom, aspect] of [[1, 1], [250, 0.1], [40000, 0.001]]) {
      ctx.viewZoom = zoom; ctx.viewAspectY = aspect;
      ctx.placeGeographyLabels('regions', labels, null, 15);
      ctx.syncGeographyLabelViewport();
      const slot = ctx.geographyLabelSlots.regions[0], style = slot.el.style;
      for (const root of [ctx.regionLabelDom.el, ctx.geographicLabelDom.el]) {
        assert.equal(root.style.width, '1600px'); assert.equal(root.style.height, '850px');
        assert.equal(root.style.transform, 'none'); assert.equal(root.style.clip, 'auto');
      }
      const scale = Number(style.transform.match(/scale\(([^)]+)\)/)[1]);
      assert.ok(parseFloat(style.fontSize) * scale >= 10.99);
      const before = parseFloat(style.left);
      ctx.mapPanX += 125; ctx.syncGeographyLabelViewport();
      assert.ok(Math.abs(parseFloat(style.left) - before - 125) < 1e-8, 'pan reprojects retained text immediately, without a new data/layout pass');
      const center = ctx.mapToScreen(slot.layout.x, slot.layout.y);
      assert.ok(Math.abs(parseFloat(style.left) + slot.layout.width / 2 + area.x - center.x) < 1e-8);
      assert.ok(Math.abs(parseFloat(style.top) + slot.layout.height / 2 + area.y - center.y) < 1e-8);
      ctx.viewZoom *= 100; ctx.syncGeographyLabelViewport();
      assert.equal(Number(style.transform.match(/scale\(([^)]+)\)/)[1]), scale, 'retained text cannot balloon during zoom before the settled layout refresh');
      ctx.mapVisible = false; ctx.syncGeographyLabelViewport();
      assert.equal(ctx.regionLabelDom.el.style.width, '1800px');
      assert.equal(style.transform, slot.layout.transform, 'minimap restores the original map-space label transform');
      assert.equal(parseFloat(style.left), slot.layout.x - slot.layout.width / 2);
      ctx.mapVisible = true;
    }
});
test('roads and rail branches never enter ocean, coastal-water or lake tiles, while river crossings remain', () => {
  const element = () => ({ style: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } });
  const paths = Object.fromEntries(['road', 'rail', 'ties', 'roadDim', 'railDim', 'tiesDim', 'moveUnder', 'move', 'moveHead'].map(key => [key, element()]));
  const drawn = [];
  let level = 1;
  const ctx = context(['drawRouteLayer', 'polylinePath'], {
    routeDom: { el: element() }, routePaths: paths, ensureRoutePaths() {}, syncRouteWidths() {}, syncRouteStatus() {},
    terrain: [5, 5, 0, 5], basePos: [0, 10, 20, 30].map(x => ({ x, y: 0 })), neighborsByIndex: [[1], [0, 2], [1, 3], [2]],
    frames: [0], pos: 0, mapPxW: 40, mapPxH: 12, hexW: 10, hexH: 12, colShift: 0,
    showUnits: false, showPreviousMovement: false, showNaturalFeatures: false, mapVisible: true, miniMapVisible: false,
    riverEdges: new Set(), routeKey: '', roadLines: new Map(), readUnitsTurn: () => [],
    readRoutesTurn: () => new Map([0, 1, 2, 3].map(index => [index, level])),
    routeEdgePoints: (a, b) => { drawn.push([a, b]); return [{ x: a * 10, y: 0 }, { x: b * 10, y: 0 }]; },
  });
  for (level of [1, 2]) for (const water of [0, 1, 9]) for (const vis of [null, [1, 2, 2, 2]]) {
    ctx.terrain[2] = water; ctx.routeKey = ''; drawn.length = 0;
    ctx.drawRouteLayer(vis);
    assert.deepEqual(drawn, [[0, 1]], 'both branches touching the water tile must be omitted');
    assert.deepEqual([...ctx.roadLines.keys()], [0, 1], 'no hidden water road remains in collision or connector data');
  }
  ctx.terrain[2] = 10; ctx.routeKey = ''; drawn.length = 0;
  ctx.drawRouteLayer(null);
  assert.deepEqual(drawn, [[0, 1], [1, 2], [2, 3]]);
});

test('previous movement visibility changes only motion paths, retaining road geometry and attack paths', () => {
  const element = () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  const paths = Object.fromEntries(['road', 'rail', 'ties', 'roadDim', 'railDim', 'tiesDim', 'moveUnder', 'move', 'moveHead', 'atk'].map(key => [key, element()]));
  paths.atk.attrs.d = 'attack';
  const ctx = context(['drawRouteLayer', 'polylinePath'], {
    routeDom: { el: element() }, routePaths: paths, ensureRoutePaths() {}, syncRouteWidths() {}, syncRouteStatus() {},
    terrain: [5, 5], basePos: [{ x: 0, y: 0 }, { x: 10, y: 0 }], neighborsByIndex: [[1], [0]], frames: [0], pos: 0,
    mapPxW: 100, mapPxH: 100, hexW: 10, hexH: 12, colShift: 0, showUnits: true, showPreviousMovement: true,
    showNaturalFeatures: true, mapVisible: true, miniMapVisible: false, riverEdges: new Set(), routeKey: '', roadLines: new Map(),
    readRoutesTurn: () => new Map([[0, 1], [1, 1]]), readUnitsTurn: () => [[1, 0, 0, 0, 0]],
    routeEdgePoints: () => [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  });
  ctx.drawRouteLayer(null); assert.ok(paths.move.attrs.d); assert.ok(paths.moveHead.attrs.d);
  const road = paths.road.attrs.d; assert.ok(road);
  ctx.showPreviousMovement = false; ctx.drawRouteLayer(null);
  assert.equal(paths.move.attrs.d, ''); assert.equal(paths.moveHead.attrs.d, '');
  assert.equal(paths.road.attrs.d, road); assert.equal(paths.atk.attrs.d, 'attack');
  ctx.showPreviousMovement = true; ctx.drawRouteLayer(null); assert.ok(paths.move.attrs.d);
  ctx.drawRouteLayer([2]);
  assert.equal(paths.road.attrs.d, '', 'roads cannot extend into a tile missing from the visibility record');
  assert.equal(paths.move.attrs.d, '', 'movement cannot expose a missing visibility entry');
  ctx.drawRouteLayer([2, 2]);
  assert.equal(paths.road.attrs.d, road, 'fully visible road geometry is preserved');
});

test('region outlines are independent of continent outlines and never reveal hidden region tiles', () => {
  const element = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(child) { this.children.push(child); } });
  const root = element(), geography = { regions: [
    { id: 'a', boundary: [{ index: 0, direction: 0 }] },
    { id: 'b', boundary: [{ index: 1, direction: 1 }] },
  ], regionForTile: new Map([[0, 'a'], [1, 'b']]) };
  const ctx = context(['drawRegionBoundaries', 'connectedBoundaryPaths', 'hexVert'], {
    regionOutlineState: { path: null }, regionBorderDom: { el: root }, showRegionBoundaries: true,
    document: { createElementNS: element }, basePos: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    neighborsByIndex: [[1], [-1, 0]], EDGE_VERTS: [[1, 2], [4, 5]],
    hexW: 10, hexH: 12, colShift: 0, mapPxW: 20, mapPxH: 12,
  });
  ctx.drawRegionBoundaries(geography, [2, 0]);
  const path = ctx.regionOutlineState.path;
  assert.match(path.attrs.d, /^M/); assert.doesNotMatch(path.attrs.d, /NaN/);
  assert.equal(root.children.length, 1, 'one retained path draws region edges');
  ctx.drawRegionBoundaries(geography, [0, 0]); assert.equal(path.attrs.d, '');
  ctx.showRegionBoundaries = false; ctx.drawRegionBoundaries(geography, null); assert.equal(path.style.display, 'none');
  ctx.showRegionBoundaries = true; ctx.drawRegionBoundaries(geography, null);
  assert.equal(path.style.display, 'block'); assert.equal(root.children.length, 1);
});
test('country land connectivity follows ownership and wrap, not fog, and updates with borders and capitals', () => {
  const frame = new Map(Array.from({ length: 8 }, (_, index) => [index, index === 0 ? 4 : index === 6 ? 9 : 1]));
  const water = new Set([5]);
  const ctx = context(['countryTerritories', 'countryLabelComponents'], {
    basePos: Array.from({ length: 8 }, (_, index) => ({ x: index * 20, y: 0 })), hexW: 20, hexH: 24,
    neighborsByIndex: [[1, 7], [0, 2], [1, 5, 6], [4, 5, 6], [3], [2, 3], [2, 3], [0]],
    isWaterTile: index => water.has(index), ownerMeta: () => ({ kind: 'major' }),
  });
  const visible = [2, 0, 2, 2, 2, 2, 2, 2];
  const groups = () => ctx.countryLabelComponents(frame, ctx.countryTerritories(frame, visible).get(0), 0);
  const indices = components => Array.from(components, group => Array.from(group.tiles, tile => tile.index).sort((a, b) => a - b));
  assert.deepEqual(indices(groups()), [[0, 2, 7], [3, 4]], 'hidden land connects, wrapping land connects, water and foreign land do not');
  visible[0] = visible[2] = visible[7] = 0;
  assert.deepEqual(indices(groups()), [[3, 4]], 'a fully hidden capital component contributes no label tiles');
  visible.fill(2);
  frame.set(0, 2); frame.set(3, 4);
  assert.deepEqual(indices(groups()), [[3, 4], [0, 1, 2, 7]], 'the new capital takes primary placement even in a smaller component');
  water.delete(5);
  assert.equal(groups().length, 1, 'a newly owned land bridge removes the duplicate label');
  water.add(5); frame.set(1, 9);
  assert.deepEqual(indices(groups()), [[3, 4], [0, 7], [2]], 'losing a connecting plot adds a component immediately');
});
test('country labels use reusable whole-line text through zoom-out without laying out disabled civilization icons', () => {
  let created = 0, tier = 4;
  const element = () => ({
    style: {}, children: [], setAttribute() {}, _text: '',
    set textContent(text) { this._text = text; this.children = []; },
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); },
    appendChild(child) { this.children.push(child); },
  });
  const names = new Map(Array.from({ length: 64 }, (_, owner) => [owner, `The Northern Confederacy of the ${'Highland '.repeat(12)}People ${owner}`]));
  const territories = new Map([...names.keys()].map(owner => [owner, [{ x: owner * 100, y: 0, index: owner }]]));
  const ctx = context(['drawCountryLabelLayer', 'countryLabelSlot', 'setPlainLines', 'splitLabelLines'], {
    countryDom: { el: element() }, civIconDom: { el: element() }, countryLabelSlots: [],
    document: { createElement: () => { created++; return element(); } },
    showCountryLabels: true, showCivIcons: false, showBorders: false, frames: [0], hexW: 20,
    countryTerritories: () => territories, majorCountryNames: () => names,
    countryLabelComponents: (frame, tiles) => [{ tiles, capital: false }],
    identityForPos: () => new Map([...names.keys()].map(owner => [owner, ['', '', '', '', '', 'ROME']])),
    ownerMeta: () => ({ kind: 'major' }), drawCivBorderLabels() {}, placeBorderLabels() {},
    countryLabelGeometry: tiles => ({ ...tiles[0], angle: 12, span: 300 }),
    fitCountryLabel(tiles, text, geometry) {
      return { ...geometry, size: 12, width: 300, height: 30, lines: ctx.splitLabelLines(text) };
    },
    labelTier: () => tier, townLabelScale: () => 1,
    civSymbolFor: () => 'symbol', countryIconsForFrame: () => new Map(), countryIconSeed: () => 0,
    ownerColors: () => ({ secondaryCss: '#fff' }),
    countryIconTile: () => assert.fail('disabled icons must not run a territory/boundary scan'),
  });
  for (const zoomTier of [4, 3, 2, 1, 4, 1]) {
    tier = zoomTier; ctx.drawCountryLabelLayer(new Map(), null);
    for (const [owner, slot] of ctx.countryLabelSlots.entries()) {
      assert.equal(slot.el.style.opacity, '1');
      assert.equal(slot.el.children.length, 2);
      assert.ok(slot.el.children.every(row => row.children.length === 0), 'no transformed, stroked and shadowed glyph nodes');
      assert.equal(slot.el.children.map(row => row.textContent).join(' '), names.get(owner));
      assert.equal(slot.icon.style.opacity, '0');
    }
  }
  assert.equal(created, names.size * 4, 'only a label, icon and two reusable text rows per country, regardless of name length or zoom');
  ctx.showCountryLabels = false; ctx.drawCountryLabelLayer(new Map(), null);
  assert.ok(ctx.countryLabelSlots.every(slot => slot.el.style.opacity === '0'));
  ctx.showCountryLabels = true; ctx.drawCountryLabelLayer(new Map(), null);
  assert.ok(ctx.countryLabelSlots.every(slot => slot.el.style.opacity === '1'));
  assert.equal(created, names.size * 4, 'toggling names restores the same text rows');
  let iconScans = 0;
  ctx.countryIconTile = tiles => { iconScans++; return { ...tiles[0], maxIconSize: 20 }; };
  ctx.showCivIcons = true; ctx.showCountryLabels = false; ctx.drawCountryLabelLayer(new Map(), null);
  assert.equal(iconScans, names.size, 'enabled icons still use territory-constrained placement');
  assert.ok(ctx.countryLabelSlots.every(slot => slot.icon.style.opacity === '1' && slot.icon.style.width === '20px'));
  assert.ok(ctx.countryLabelSlots.every(slot => slot.el.style.opacity === '0'), 'icons do not force text labels on');
  ctx.countryLabelComponents = (frame, tiles, owner) => owner === 0 ? [{ tiles, capital: false }, { tiles: [{ x: 10000, y: 0, index: 1000 }], capital: false }] : [{ tiles, capital: false }];
  ctx.showCountryLabels = true; ctx.drawCountryLabelLayer(new Map(), null);
  const matching = ctx.countryLabelSlots.filter(slot => slot.op && slot.el.children.map(row => row.textContent).join(' ') === names.get(0));
  assert.equal(matching.length, 2, 'detached territory repeats the exact main country name through the same text pipeline');
  assert.ok(matching.every(slot => slot.el.style.opacity === '1' && slot.el.style.fontWeight === '700'));
  assert.equal(matching.filter(slot => slot.icon.style.opacity === '1').length, 1, 'extra country labels do not duplicate civilization emblems');
  ctx.showCountryLabels = false; ctx.drawCountryLabelLayer(new Map(), null);
  assert.ok(ctx.countryLabelSlots.every(slot => slot.el.style.opacity === '0'));
  ctx.countryLabelComponents = (frame, tiles) => [{ tiles, capital: false }];
  ctx.showCountryLabels = true; ctx.drawCountryLabelLayer(new Map(), null);
  assert.equal(ctx.countryLabelSlots.filter(slot => slot.op).length, names.size, 'reconnection parks the spare label');
  const anchors = [];
  ctx.countryIconTile = tiles => { anchors.push(tiles[0].index); return { ...tiles[0], maxIconSize: 20 }; };
  ctx.showCountryLabels = false;
  ctx.countryLabelComponents = (frame, tiles, owner) => owner === 0
    ? [{ tiles: [{ x: 10000, y: 0, index: 1000 }], capital: false }, { tiles, capital: true }]
    : [{ tiles, capital: false }];
  ctx.drawCountryLabelLayer(new Map([[0, 4]]), null);
  assert.ok(anchors.includes(0) && !anchors.includes(1000), 'the icon remains on capital-connected land even if a detached label is listed first');
  anchors.length = 0;
  ctx.countryLabelComponents = (frame, tiles) => [{ tiles, capital: false }];
  ctx.drawCountryLabelLayer(new Map([[1000, 4]]), null);
  assert.ok(!anchors.includes(0), 'a wholly hidden capital component never transfers its icon to visible detached land');
});

test('region-name toggles restore parent opacity and cached text without reopening Map View, retaining fog filtering', () => {
  const element = () => ({ style: { opacity: '0' }, children: [], textContent: '', appendChild(child) { this.children.push(child); } });
  const geography = { regions: [
    { id: 'land:0', name: 'Plains', center: 0, tiles: [0, 1] },
    { id: 'land:1', name: 'Hidden', center: 2, tiles: [2] },
  ], features: [] };
  const ctx = context(['drawGeographyLayers', 'drawRegionBoundaries', 'placeGeographyLabels', 'geographySlot', 'mapLabelText',
    'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap'], {
    regionLabelDom: { el: element() }, geographicLabelDom: { el: element() }, regionBorderDom: { el: element() },
    regionBorderPath: { setAttribute() {} }, regionBorderKey: '', placeBorderLabels() {},
    geographyLabelSlots: { regions: [], features: [], rivers: [] }, geographyLabelCache: { regions: null, rivers: null },
    document: { createElement: element }, window: { AnthroproceniaGeography: { getMapData: () => geography } },
    mapVisible: true, miniMapVisible: false, showRegionLabels: false, showRegionBorders: false,
    showGeographicLabels: false, showRiverNames: false,
    basePos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }], hexW: 20, hexH: 24, colShift: 0,
    labelTier: () => 1, townLabelScale: () => 1,
  });
  const vis = [2, 2, 0];
  ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '0');
  ctx.showRegionLabels = true; ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '1', 'the parent must not retain its previous hidden opacity');
  const slot = ctx.geographyLabelSlots.regions[0];
  assert.equal(slot.el.textContent, 'Plains'); assert.equal(slot.visible, true);
  assert.equal(ctx.geographyLabelSlots.regions.length, 1, 'unrevealed regions stay hidden');
  ctx.showRegionLabels = false; ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '0'); assert.equal(slot.visible, false);
  ctx.showRegionLabels = true; ctx.drawGeographyLayers(new Map(), vis); ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '1'); assert.equal(slot.visible, true);
  assert.equal(ctx.geographyLabelSlots.regions[0], slot);
  ctx.mapVisible = false; ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '0', 'hidden maps cannot reveal label roots');
  ctx.miniMapVisible = true; ctx.drawGeographyLayers(new Map(), vis);
  assert.equal(ctx.regionLabelDom.el.style.opacity, '1');
});

test('geographic toggles display named island and water regions, retain land names, and invalidate pan layouts', () => {
  const diagnostics = [];
  const element = () => ({ style: {}, children: [], textContent: '', appendChild(child) { this.children.push(child); } });
  const region = (id, name, center, extra = {}) => ({ id, name, center, tiles: [center], nativeEarthName: true, ...extra });
  const geography = {
    regions: [region('land:0', 'Iberia', 0), region('land:1', 'Gaul', 1),
      region('land:2', 'Britain', 2, { island: true }), region('water:3', 'Atlantic Ocean', 3, { water: true }),
      region('water:4', 'Hidden Lake', 4, { water: true })],
    features: [region('island:2', 'Britain', 2, { type: 'island' }),
      region('river:5', 'Nile', 5, { type: 'river' })],
  };
  const ctx = context(['drawGeographyLayers', 'drawRegionBoundaries', 'placeGeographyLabels', 'geographySlot',
    'mapLabelText', 'countryLabelGeometry', 'makeLabelBoxIndex', 'labelBoxesOverlap'], {
    regionLabelDom: { el: element() }, geographicLabelDom: { el: element() }, regionBorderDom: { el: element() },
    regionBorderPath: { setAttribute() {} }, regionBorderKey: '', placeBorderLabels() {},
    geographyLabelSlots: { regions: [], features: [], rivers: [] }, geographyLabelCache: {},
    document: { createElement: element }, window: { AnthroproceniaGeography: { getMapData: () => geography } },
    console: { warn: message => diagnostics.push(message) },
    mapVisible: true, miniMapVisible: false, showRegionLabels: false, showRegionBorders: false,
    showGeographicLabels: false, showRiverNames: false, historicalWarLabels: () => [],
    basePos: Array.from({ length: 6 }, (_, i) => ({ x: i * 400, y: 0 })), hexW: 20, hexH: 24,
    colShift: 0, labelTier: () => 1, townLabelScale: () => 1, isWaterTile: i => i >= 3,
  });
  const frame = new Map(), vis = [2, 2, 2, 2, 0, 2];
  ctx.drawGeographyLayers(frame, vis);
  ctx.showRegionLabels = ctx.showGeographicLabels = true;
  ctx.drawGeographyLayers(frame, vis);
  const text = kind => ctx.geographyLabelSlots[kind].filter(slot => slot.visible).map(slot => slot.el.textContent);
  assert.deepEqual(text('regions'), ['Iberia', 'Gaul']);
  assert.deepEqual(text('features'), ['Britain', 'Atlantic Ocean']);
  assert.equal(ctx.geographicLabelDom.el.style.opacity, '1');
  const reports = () => diagnostics.map(message => JSON.parse(message.slice(message.indexOf('{'))));
  assert.equal(reports().length, 2, 'one native report for each category-toggle state, not every redraw');
  assert.equal(reports().at(-1).labels.regions.placed, 2);
  assert.equal(reports().at(-1).labels.features.placed, 2);
  const first = ctx.geographyLabelCache.layout;
  ctx.mapPanX = 200; ctx.drawGeographyLayers(frame, vis);
  assert.notEqual(ctx.geographyLabelCache.layout, first);
  assert.equal(reports().length, 2, 'camera-driven layouts cannot flood the native log');
  ctx.showGeographicLabels = false; ctx.drawGeographyLayers(frame, vis);
  assert.equal(ctx.geographicLabelDom.el.style.opacity, '0');
  assert.deepEqual(text('features'), []);
  assert.deepEqual(text('regions'), ['Iberia', 'Gaul']);
  ctx.showGeographicLabels = true; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(text('features'), ['Britain', 'Atlantic Ocean']);
  ctx.showIslandNames = false; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(text('features'), ['Atlantic Ocean']);
  ctx.showIslandNames = true; ctx.showWaterNames = false; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(text('features'), ['Britain']);
  geography.features.push(region('mountains:5', 'Alps', 5, { type: 'mountains' }));
  ctx.geographyLabelCache = {}; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(text('features'), ['Britain', 'Alps']);
  ctx.showMountainNames = false; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(text('features'), ['Britain']);
  assert.deepEqual(text('regions'), ['Iberia', 'Gaul'], 'independent geographic filters never suppress land regions');
});

test('war fronts draw shared hostile borders once, update for peace, and respect fog, seams and the combined toggle', () => {
  const element = () => ({ attrs: {}, style: {}, writes: 0, children: [],
    setAttribute(key, value) { this.attrs[key] = value; if (key === 'd') this.writes++; },
    appendChild(child) { this.children.push(child); } });
  let relations = new Map([['0,1', 4], ['1,2', 3]]);
  const frame = new Map([[0, 0], [1, 8], [2, 16], [3, 8], [4, 8]]);
  const ctx = context(['drawWarBorders', 'meanderingWarPath', 'warFrontCenters', 'polyStar', 'polyPts', 'hexVert', 'connectedBoundaryPaths', 'hashString', 'isWaterTile'], {
    showWarNames: true, showBorders: false, showTerritory: false, mapVisible: true, miniMapVisible: false,
    warBorderState: { group: null }, regionBorderDom: { el: element() }, terrain: [5, 5, 5, 5, 5, 5],
    relationshipForPos: () => relations, document: { createElementNS: element },
    basePos: [0, 20, 40, 60, 1000, -20].map(x => ({ x, y: 0 })),
    neighborsByIndex: [[1, 5, 4], [2, 0], [3, 1], [-1, 2], [-1, -1, 0], [0]],
    hexW: 20, hexH: 24, colShift: 0, mapPxW: 1020, mapPxH: 24,
    EDGE_VERTS: [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]],
    mapToScreen: (x, y) => ({ x, y }),
  });
  ctx.drawWarBorders(frame, null);
  const state = ctx.warBorderState, path = state.strokes.at(-1).path, geometry = state.geometry, stars = path.attrs.d;
  assert.ok(geometry.startsWith('M20,6C') && geometry.endsWith('20,18'), 'only the one shared hostile land edge becomes a front');
  assert.equal((geometry.match(/C/g) || []).length, 3, 'the front meanders through smooth cubic curves, not straight hex segments');
  const xs = geometry.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number).filter((value, i) => i % 2 === 0);
  assert.ok(Math.min(...xs) < 20 && Math.max(...xs) > 20);
  assert.ok(xs.every(x => Math.abs(x - 20) < 3), 'meandering stays near the shared territorial edge');
  assert.ok(state.strokes.every(stroke => (stroke.path.attrs.d.match(/L/g) || []).length === 23), 'each gradient layer draws a 12-point star rather than a round dash');
  assert.deepEqual(Array.from(state.strokes, stroke => stroke.width), [24, 20, 16, 10, 7, 5]);
  assert.equal(state.gradients.length, 2);
  assert.equal(state.gradients[0].children[1].attrs['stop-color'], '#ffbb62');
  assert.equal(state.gradients[1].children[1].attrs['stop-color'], '#ff7968');
  assert.ok(state.strokes.every(stroke => stroke.path.attrs.fill.startsWith('url(#anthroprocenia-war-front-') && stroke.path.attrs.stroke === 'none'));
  assert.equal(ctx.regionBorderDom.el.style.opacity, '1', 'fronts do not depend on ordinary borders or territory fills');
  const writes = path.writes;
  ctx.drawWarBorders(frame, null);
  assert.equal(path.writes, writes, 'unchanged camera reuses retained star geometry');
  ctx.viewZoom = 2; ctx.drawWarBorders(frame, null);
  assert.equal(state.geometry, geometry, 'camera zoom reuses boundary curves');
  assert.notEqual(path.attrs.d, stars, 'star size and spacing remain screen-sized while zooming');
  ctx.viewZoom = 1; ctx.drawWarBorders(frame, null); assert.equal(path.attrs.d, stars);
  ctx.drawWarBorders(frame, [2, 0, 2, 2, 2, 2]); assert.equal(path.attrs.d, '');
  ctx.drawWarBorders(frame, [0, 2, 2, 2, 2, 2]); assert.equal(path.attrs.d, '');
  ctx.drawWarBorders(frame, [2, 1, 2, 2, 2, 2]); assert.equal(path.attrs.d, stars);
  for (const water of [0, 1, 9, 10]) for (const index of [0, 1]) {
    ctx.terrain = [5, 5, 5, 5, 5, 5]; ctx.terrain[index] = water;
    ctx.drawWarBorders(frame, null);
    assert.ok(state.strokes.every(stroke => stroke.path.attrs.d === ''), 'neither gradient covers ocean, coast, lake or navigable-river borders');
  }
  ctx.terrain = [5, 5, 5, 5, 5, 5];
  ctx.drawWarBorders(frame, null); assert.equal(path.attrs.d, stars);
  relations = new Map([['0,1', 0]]);
  ctx.drawWarBorders(frame, null); assert.equal(path.attrs.d, '', 'peace updates even when territory is unchanged');
  relations = new Map([['0,1', 4]]);
  ctx.drawWarBorders(new Map([[0, 0], [1, 0]]), null); assert.equal(path.attrs.d, '', 'same-owner borders stay empty');
  ctx.drawWarBorders(frame, null); assert.ok(path.attrs.d);
  ctx.showWarNames = false; ctx.drawWarBorders(frame, null); assert.equal(state.group.style.display, 'none');
  ctx.showWarNames = true; ctx.drawWarBorders(frame, null); assert.equal(state.group.style.display, 'block');
  ctx.mapVisible = false; ctx.drawWarBorders(frame, null); assert.equal(state.group.style.display, 'none');
});

test('war stars have twelve readable spikes and evenly spaced, viewport-filtered centers without joining separate fronts', () => {
  const ctx = context(['warFrontCenters', 'polyStar', 'polyPts'], {});
  const curve = 'M0,0C32,0 64,0 96,0M0,50C32,50 64,50 96,50';
  const centers = ctx.warFrontCenters(curve, 32);
  assert.deepEqual(Array.from(centers, point => Array.from(point, value => Math.round(value * 1e6) / 1e6)), [[0, 0], [32, 0], [64, 0], [96, 0], [0, 50], [32, 50], [64, 50], [96, 50]]);
  assert.deepEqual(Array.from(ctx.warFrontCenters(curve, 32, ([x]) => x >= 64), point => Array.from(point)), [[64, 0], [96, 0], [64, 50], [96, 50]]);
  assert.equal(ctx.warFrontCenters('M0,0C10000,0 20000,0 30000,0', 1).length, 1024, 'front detail has a hard visible-marker budget');
  assert.equal(ctx.warFrontCenters('', 32).length, 0);
  const star = ctx.polyStar(0, 0, 12);
  const vertices = star.match(/[ML][^MLZ]+/g).map(point => point.slice(1).split(',').map(Number));
  assert.equal(vertices.length, 24);
  for (let index = 0; index < vertices.length; index++) {
    const [x, y] = vertices[index];
    assert.ok(Math.abs(Math.hypot(x, y) - (index % 2 ? 12 * 0.58 : 12)) < 0.1);
  }
});

test('war names toggle independently of other geographic names and refresh across turns without territory changes', () => {
  const element = () => ({ style: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } });
  const geography = { regions: [], features: [] }, frame = new Map(), vis = [2], placed = [];
  const slot = { visible: true, el: element() };
  const ctx = context(['drawGeographyLayers'], {
    showWarNames: true, showGeographicLabels: false, showRiverNames: false, showRegionLabels: false, showRegionBorders: false,
    mapVisible: true, miniMapVisible: false, regionLabelDom: { el: element() }, geographicLabelDom: { el: element() },
    regionBorderDom: { el: element() }, regionBorderPath: element(), regionBorderKey: '',
    geographyLabelSlots: { regions: [], features: [slot], rivers: [] }, geographyLabelCache: {},
    window: { AnthroproceniaGeography: { getMapData: () => geography } }, basePos: [{}],
    hexW: 20, hexH: 24, colShift: 0, labelTier: () => 1, townLabelScale: () => 1, makeLabelBoxIndex: () => ({}),
    historicalWarLabels: () => [{ type: 'war', name: `War ${ctx.pos}` }],
    placeGeographyLabels: (kind, labels) => placed.push([kind, Array.from(labels, label => label.name)]),
    drawRegionBoundaries() {}, placeBorderLabels() {}, console: { warn() {} },
  });
  ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(placed.at(-1), ['features', ['War 0']]);
  assert.equal(ctx.geographicLabelDom.el.style.opacity, '1');
  assert.equal(ctx.regionBorderDom.el.style.opacity, '1');
  ctx.pos = 1; ctx.drawGeographyLayers(frame, vis);
  assert.deepEqual(placed.at(-1), ['features', ['War 1']]);
  ctx.showWarNames = false; ctx.drawGeographyLayers(frame, vis);
  assert.equal(slot.visible, false);
  assert.equal(ctx.geographicLabelDom.el.style.opacity, '0');
  assert.equal(ctx.regionBorderDom.el.style.opacity, '0');
});

test('minimap suppresses war overlays without losing the full map checkbox setting', () => {
  const save = slice('rememberMiniMapOptions');
  const fields = save.match(/miniMapSavedOptions = \{([\s\S]*?)\};/)[1].match(/\bshow\w+|\bfogMode\b/g);
  const ctx = context(['rememberMiniMapOptions', 'restoreMiniMapOptions'], {
    ...Object.fromEntries(fields.map(field => [field, true])), miniMapSavedOptions: null,
  });
  ctx.rememberMiniMapOptions(); assert.equal(ctx.showWarNames, false);
  ctx.restoreMiniMapOptions(); assert.equal(ctx.showWarNames, true);
  ctx.showWarNames = false;
  ctx.rememberMiniMapOptions(); ctx.restoreMiniMapOptions(); assert.equal(ctx.showWarNames, false);
});

test('the native map shortcut still opens Map View without the removed HUD button and respects UI focus', () => {
  const opened = [];
  let worldFocused = true;
  const ctx = context(['onRawMapInput', 'openMapScreenFromShortcut'], {
    dispatchedCameraInput: null, gamepadControlsActive: false, mapVisible: false,
    InputActionStatuses: { FINISH: 2 }, FocusManager: { get: () => ({ isWorldFocused: () => worldFocused }) },
    gameOverlayActive: () => false, settlementExpansionActive: () => false,
    mapHudGameReady: () => true, lastMapShortcutActivation: 0,
    Date: { now: () => 1000 }, requestShow: value => opened.push(value), err: message => assert.fail(message),
  });
  ctx.onRawMapInput('shell-action-3', 2, 0, 0);
  assert.deepEqual(opened, [true]);
  worldFocused = false;
  ctx.onRawMapInput('shell-action-3', 2, 0, 0);
  assert.deepEqual(opened, [true], 'a native menu cannot be bypassed');
});

test('capital stars are filled for current capitals, hollow for former originals, and occur only before the first line', () => {
  const element = () => ({ attrs: {}, style: {}, children: [], set textContent(value) { this.children = []; this.text = value; },
    setAttribute(key, value) { this.attrs[key] = value; }, appendChild(child) { this.children.push(child); } });
  const ctx = context(['setPlainLines'], { document: { createElement: element, createElementNS: element } }), root = element();
  ctx.setPlainLines(root, ['New', 'Cahokia'], 2);
  assert.equal(root.children[0].children[0].attrs['aria-label'], 'Capital city');
  assert.equal(root.children[0].children[0].children[0].attrs.fill, 'currentColor');
  assert.equal(root.children[1].children.length, 0);
  ctx.setPlainLines(root, ['New', 'Cahokia'], 1);
  assert.equal(root.children[0].children[0].attrs['aria-label'], 'Original capital');
  assert.equal(root.children[0].children[0].children[0].attrs.fill, 'none');
  ctx.setPlainLines(root, ['New', 'Cahokia'], 0);
  assert.ok(root.children.every(row => !row.children.length));
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
