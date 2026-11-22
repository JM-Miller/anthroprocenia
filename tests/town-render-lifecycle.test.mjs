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
function element() {
  return { style: {}, attrs: {}, children: [], classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(child) { this.children.push(child); } };
}
function fixture() {
  let now = 1000, sequence = 0, scenes = 0, decorations = 0, people = 0;
  const timers = new Map(), errors = [], warnings = [];
  const ctx = vm.createContext({
    showRoads: true,
    ...town, townRender: { viewKey: '', zoomKey: '', inputKey: '', changedAt: 0, pending: false, geometryRetained: false, timer: 0, logged: false, limitReported: false },
    townLayer: null, townDecorationLayer: null, townPaths: null, townKey: '', townSizeKey: '', townHighlightKey: null, townHits: [], townPeople: null,
    townRoofScene: {}, TOWN_ROOF_PATHS: [...town.TOWN_CLASSES, 'tents', 'battleBuildings', 'detail', 'tentDetail'],
    townInterturn: { active: false }, lastMapInputTs: 0, scatterJob: null, scatterContinueTimer: 0, geographyRefreshTimer: 0, unitHighlightState: {},
    mapVisible: true, miniMapVisible: false, miniMapScale: 1, colShift: 0,
    mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, mapPxW: 1000, mapPxH: 1000,
    viewZoom: 10, viewAspectY: 1, hexW: 100, hexH: 115, pos: 0, detailD: 4, fogMode: false, ps: n => n,
    walkerCrowdsActive: () => true,
    window: { innerWidth: 100, innerHeight: 100 }, MAP_DEPTH: 300000, TAG: '[test]',
    measureArea: () => ({ x: 0, y: 0, w: ctx.window.innerWidth, h: ctx.window.innerHeight }),
    document: { createElementNS: element, body: element() },
    townscapeActive: () => ctx.mapVisible && ctx.viewZoom >= 1,
    syncMapLabelVisibility() {}, syncRiverDeltas() {}, syncTownCompass() {}, placeIcons() {}, townLinkTile: () => 0, iconPoints: [], terrainMarkerPaths: new Map(), unitDom: {}, unitSlots: [], dotDom: {}, wonDom: {},
    bgLayer: { el: { style: {} } }, columnShiftMarkersStale: false, fogMarkersStale: false,
    townDecoScene: {}, townPanScene: {}, hideTownLabels() {}, revalidateTownHover() {}, showTownDecorationPreview() {},
    townSceneEntries() { scenes++; return []; }, releaseTownSceneEntries() {}, townWaterfronts: () => [],
    planEntryLinks: () => ({ roads: [], water: [], bridges: [], tileWalls: [] }),
    townDryRoads: function* () {}, townBridgeRoads: function* () {}, townBuildingGround: function* () { return { clear: () => true }; },
    townMinorRoads: function* () {}, townAccessRoads: function* () {}, prepareTownLeisure() {},
    townWorld: null, peopleActive: () => false, buildTownWorld: function* (entries, plan, incremental, key) { return { key }; },
    syncTownDecorations() { decorations++; }, syncTownLabels() {},
    advanceTownDecorations(entries) { ctx.syncTownDecorations(entries); },
    syncPeople() { assert.equal(ctx.townRender.pending, false); people++; },
    peopleSvg: { style: {} }, peopleDotPaths: [], peopleClumpPaths: [], peopleHeadwearPaths: [], cmdPickRings: [],
    peopleRing: null, peopleRingUnder: null, stopPeople() {},
    Date: { now: () => now },
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    console: { warn: message => warnings.push(message) }, err: message => errors.push(message),
  });
  vm.runInContext(source.slice(source.indexOf('const TOWN_ELEMENT_OPTIONS ='), source.indexOf('let showNaturalFeatures =')), ctx);
  vm.runInContext(['naturalViewKey', 'townZoomKey', 'townViewKey', 'syncTownVisibility', 'townDecoActive', 'townDecoAtScale', 'townDecoFullDetail', 'mapScaleForView', 'mapScaleMetrics', 'syncTownDecorationVisibility', 'scheduleTownRefresh',
    'syncTownElementVisibility', 'submitTownGeometry', 'syncTownscapes', 'syncTownRoofs', 'setTownHighlight', 'clearPeopleVisuals',
    'opaqueTownColor', 'ensureTownscapeLayer', 'linePath', 'polygonPath', 'syncMapSvgViewport'].map(slice).join('\n'), ctx);
  ctx.townRender.inputKey = ctx.townViewKey();
  ctx.townRender.zoomKey = ctx.townZoomKey();
  return { ctx, timers, errors, warnings, counts: () => ({ scenes, decorations, people }),
    advance: ms => { now += ms; }, input: () => { ctx.lastMapInputTs = now; },
    flush() { const queued = [...timers.values()]; timers.clear(); for (const fn of queued) fn(); } };
}

test('decoration batches preserve roofs, defer road publication, cancel obsolete camera work, and honor step/time budgets', () => {
  const h = fixture(), { ctx } = h;
  vm.runInContext(slice('advanceTownDecorations'), ctx);
  ctx.walkerCrowdsActive = () => true;
  let steps = 0, commits = 0;
  ctx.syncTownDecorations = function* (entries, incremental) {
    assert.equal(incremental, true);
    for (let i = 0; i < 200; i++) { steps++; yield; }
    commits++;
  };
  ctx.syncTownscapes();
  assert.equal(steps, 64);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.pending, false, 'decorations do not gate static geometry');
  assert.equal(ctx.townPaths.streets.style.visibility, 'hidden', 'prepared roads wait for decorations');
  const obsolete = ctx.townRender.decoJob;
  ctx.mapPanX = 10;
  ctx.advanceTownDecorations([]);
  assert.notEqual(ctx.townRender.decoJob, obsolete);
  for (let i = 0; i < 5 && ctx.townRender.decoJob; i++) { h.advance(300); h.flush(); }
  assert.equal(commits, 1, 'the canceled iterator never publishes its geometry');
  assert.equal(ctx.townPaths.streets.style.visibility, 'visible');
  let timedSteps = 0;
  ctx.syncTownDecorations = function* () {
    for (let i = 0; i < 100; i++) { timedSteps++; h.advance(3); yield; }
  };
  ctx.advanceTownDecorations([]);
  assert.equal(timedSteps, 3, 'the eight-millisecond budget stops before the fourth work item');
  ctx.mapVisible = false; ctx.syncTownscapes();
  assert.equal(ctx.townRender.decoJob, null);
  assert.equal(ctx.townDecorationLayer.style.display, 'none');
});

test('towns publish pools, roofs and decorations, roads, walkers, then remaining layers and labels', () => {
  const f = fixture(), { ctx } = f;
  const poly = [[452, 452], [456, 452], [456, 456], [452, 456]];
  const entry = {
    item: { kind: 'building', index: 0 }, pathKey: 'ordered-home', kind: 'town',
    center: { x: 454, y: 454 }, radius: 4,
    polys: [{ poly, box: town.polygonBounds(poly), parts: [], detail: [], form: 'rect', group: 'house', sourceIndex: 0 }],
    paths: { pools: 'M450,450L451,450L451,451Z', water: 'M450,450L450,458',
      fields: 'M457,453L458,453L458,454Z', accents: '' },
    minorRoadPath: 'M453,451L453,457', accessRoadPath: 'M454,451L454,457',
  };
  ctx.townSceneEntries = () => [entry];
  ctx.townDryRoads = function* () {
    for (let i = 0; i < 90; i++) { f.advance(2); yield; }
    entry.dryMainRoadPath = 'M451,453L457,453';
  };
  let decorated = false, walkers = false, labels = false;
  vm.runInContext(slice('advanceTownDecorations'), ctx);
  ctx.syncTownDecorations = function* () {
    if (decorated) return;
    assert.match(ctx.townPaths.house.attrs.d, /^M/);
    assert.equal(ctx.townPaths.pools.style.visibility, 'visible');
    assert.equal(ctx.townPaths.streets.style.visibility, 'hidden');
    for (let i = 0; i < 90; i++) { f.advance(2); yield; }
    decorated = true;
  };
  ctx.peopleActive = () => true;
  ctx.buildTownWorld = function* (entries, plan, incremental, key) {
    assert.equal(decorated, true);
    for (const name of ['streets', 'accessRoads']) {
      assert.match(ctx.townPaths[name].attrs.d, /^M/);
      assert.equal(ctx.townPaths[name].style.visibility, 'visible');
    }
    assert.equal(ctx.townPaths.fields.style.visibility, 'hidden');
    for (let i = 0; i < 90; i++) { f.advance(2); yield; }
    return { key, complete: true };
  };
  ctx.syncPeople = (entries, world) => {
    assert.equal(world.complete, true);
    assert.equal(ctx.townPaths.fields.style.visibility, 'hidden');
    walkers = true; ctx.townWorld = world;
  };
  ctx.syncTownLabels = () => {
    assert.equal(walkers, true);
    assert.equal(ctx.townPaths.fields.style.visibility, 'visible');
    labels = true;
  };
  ctx.syncTownscapes();
  assert.match(ctx.townPaths.pools.attrs.d, /^M/);
  assert.match(ctx.townPaths.water.attrs.d, /^M/);
  assert.ok(Number(ctx.townPaths.pools.attrs['stroke-width']) < 0.1);
  assert.equal(ctx.townPaths.house.attrs.d, '');
  assert.equal(ctx.townPaths.streets.attrs.d, '');
  assert.equal(labels, false);
  for (let i = 0; i < 100 && !ctx.townRender.decoJob; i++) { f.advance(300); f.flush(); }
  assert.ok(ctx.townRender.decoJob);
  assert.match(ctx.townPaths.house.attrs.d, /^M/);
  assert.match(ctx.townPaths.pools.attrs.d, /^M/, 'roof previews preserve the first water stage');
  assert.equal(ctx.townPaths.streets.style.visibility, 'hidden');
  assert.equal(walkers, false); assert.equal(labels, false);
  for (let i = 0; i < 100 && !ctx.townRender.walkJob; i++) { f.advance(300); f.flush(); }
  assert.ok(ctx.townRender.walkJob);
  assert.equal(decorated, true);
  assert.equal(ctx.townPaths.fields.style.visibility, 'hidden');
  for (let i = 0; i < 100 && !labels; i++) { f.advance(300); f.flush(); }
  assert.equal(walkers, true); assert.equal(labels, true);
  assert.equal(ctx.townRender.deferredPaths, null);
  assert.equal(f.timers.size, 0);
});

test('failed decoration preparation discards partial cache state without hiding the committed townscape', () => {
  const { ctx } = fixture();
  vm.runInContext(slice('advanceTownDecorations'), ctx);
  ctx.walkerCrowdsActive = () => true;
  ctx.syncTownDecorations = function* () { throw new Error('decoration failure'); };
  ctx.townDecoScene.key = 'partial';
  assert.throws(() => ctx.syncTownscapes(), /decoration failure/);
  assert.equal(ctx.townRender.decoJob, null);
  assert.equal(ctx.townDecoScene.key, '');
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.pending, false);
});

test('full decoration artwork uses a screen-sized SVG and hides obsolete camera projections', () => {
  const { ctx } = fixture();
  ctx.walkerCrowdsActive = () => false;
  vm.runInContext(['peopleCameraKey', 'sizeScreenSvg'].map(slice).join('\n'), ctx);
  ctx.ensureTownscapeLayer();
  ctx.townDecoScene.fullDetail = true;
  ctx.townDecoScene.screenKey = ctx.peopleCameraKey();
  ctx.syncTownDecorationVisibility();
  assert.equal(ctx.townDecorationLayer.style.display, 'block');
  assert.equal(ctx.townDecorationLayer.attrs.viewBox, '0 0 100 100');
  ctx.mapPanX += 1; ctx.syncTownDecorationVisibility();
  assert.equal(ctx.townDecorationLayer.style.display, 'none', 'old screen positions are never painted at the new camera');
  ctx.townDecoScene.screenKey = ctx.peopleCameraKey(); ctx.syncTownDecorationVisibility();
  assert.equal(ctx.townDecorationLayer.style.display, 'block');
  ctx.townDecoScene.fullDetail = false; ctx.syncTownDecorationVisibility();
  assert.notEqual(ctx.townDecorationLayer.attrs.viewBox, '0 0 100 100', 'crowd previews restore the map-space viewport');
});

test('decoration previews appear eight times farther away without building town scenes or walkers, and hide on map closure', () => {
  const f = fixture(), { ctx } = f;
  ctx.window.innerWidth = 1600; ctx.window.innerHeight = 900; ctx.viewZoom = 2;
  vm.runInContext(['iconModeActive', 'townscapeActive'].map(slice).join('\n'), ctx);
  assert.equal(ctx.townscapeActive(), false); assert.equal(ctx.townDecoActive(), true);
  ctx.syncTownscapes(); f.advance(250); f.flush();
  assert.equal(f.counts().scenes, 0); assert.equal(f.counts().people, 0);
  assert.equal(f.counts().decorations, 1); assert.equal(ctx.townDecorationLayer.style.display, 'block');
  assert.notEqual(ctx.townLayer.style.display, 'block'); assert.match(ctx.townLayer.style.cssText, /display:none/);
  ctx.viewZoom = 1.99; ctx.syncTownscapes(); assert.equal(ctx.townDecorationLayer.style.display, 'none');
  ctx.viewZoom = 2; ctx.syncTownscapes(); f.advance(250); f.flush();
  ctx.mapVisible = false; ctx.syncTownscapes();
  assert.equal(ctx.townDecorationLayer.style.display, 'none'); assert.equal(f.timers.size, 0);
});

test('continuous townscape zoom retains transformed roads and roofs and coalesces rebuilds until settled', () => {
  const f = fixture(), { ctx, timers, counts, input, advance, flush } = f;
  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.deepEqual(counts(), { scenes: 1, decorations: 1, people: 1 });
  for (let i = 0; i < 80; i++) {
    advance(16); input(); ctx.viewZoom *= 0.99; ctx.mapPanX++;
    ctx.syncTownVisibility();
    assert.equal(ctx.townLayer.style.display, 'block', 'keep the committed town visible throughout zoom');
    assert.ok(Object.values(ctx.townPaths).every(path => path.style.visibility === 'visible'));
    ctx.bgLayer.el.style.transform = `scale(${ctx.viewZoom})`;
    ctx.syncTownscapes();
    assert.equal(ctx.townLayer.style.transform, 'none');
    assert.equal(ctx.townLayer.style.width, '100px');
    assert.equal(ctx.townRender.pending, true);
    assert.deepEqual(counts(), { scenes: 1, decorations: 1, people: 1 }, 'no intermediate road/roof/decor/walker rebuilds');
    assert.equal(timers.size, 1, 'one replaceable settle callback, not a zoom-event backlog');
  }
  advance(249); flush();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(timers.size, 1, 'an early callback rechecks the input clock');
  advance(1); flush();
  assert.equal(ctx.townRender.viewKey, ctx.townViewKey());
  assert.equal(ctx.townRender.pending, false);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.ok(Object.values(ctx.townPaths).every(path => path.style.visibility === 'visible'));
  assert.deepEqual(counts(), { scenes: 2, decorations: 2, people: 2 });
  assert.equal(timers.size, 0);
  assert.ok(slice('applyMapView').indexOf('syncTownVisibility()') < slice('applyMapView').indexOf('el.style.transform ='));
});

test('large entrance plans resume in bounded batches without rebuilding the scene or blocking navigation', () => {
  const f = fixture(), { ctx } = f;
  const entries = [];
  let plans = 0, starts = 0, targets = 0;
  let continuationDelay = 0;
  const schedule = ctx.setTimeout;
  ctx.setTimeout = (fn, delay) => { continuationDelay = delay; return schedule(fn, delay); };
  ctx.townSceneEntries = () => entries;
  ctx.planEntryLinks = () => { plans++; return { roads: [], water: [], bridges: [], tileWalls: [] }; };
  ctx.townAccessRoads = function* () { starts++; for (let i = 0; i < 180; i++) { yield; targets++; } };
  ctx.syncTownscapes();
  assert.equal(ctx.townRender.pending, true);
  assert.ok(targets < 64);
  assert.equal(continuationDelay, 16, 'leave time for native input and painting between routing batches');
  assert.equal(ctx.townRender.geometryRetained, false);
  f.advance(250); f.flush();
  assert.equal(ctx.townRender.pending, true);
  f.flush();
  assert.equal(targets, 180);
  assert.equal(starts, 1); assert.equal(plans, 1);
  assert.equal(ctx.townRender.pending, false);
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(ctx.townLayer.style.display, 'block');
  ctx.pos++;
  ctx.syncTownscapes(); f.advance(250); f.flush();
  assert.ok(ctx.townRender.accessJob);
  ctx.mapVisible = false; ctx.syncTownscapes();
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(f.timers.size, 0);
});

test('validated roofs appear before long road jobs finish and remain visible through camera changes', () => {
  const f = fixture(), { ctx } = f;
  const entry = {
    item: { kind: 'building', index: 0 }, pathKey: 'progressive-home', kind: 'town',
    center: { x: 454, y: 454 }, radius: 4, paths: { accents: '' },
    polys: Array.from({ length: 100 }, (_, i) => {
      const x = 452 + i % 10 * 0.5, y = 452 + Math.floor(i / 10) * 0.5;
      const poly = [[x, y], [x + 0.45, y], [x + 0.45, y + 0.45], [x, y + 0.45]];
      return { poly, box: town.polygonBounds(poly), parts: [], detail: [], form: 'rect', group: 'house', sourceIndex: i };
    }),
    dryMainRoadPath: 'M451,451L458,451',
  };
  let roads = 0;
  vm.runInContext(['showTownDecorationPreview', 'townDecoPaths', 'townDecoPathSteps'].map(slice).join('\n'), ctx);
  ctx.hashString = () => 7;
  ctx.isWaterAt = x => x < 454;
  const draw = ctx.townDecoPaths;
  let previewPlacements = [];
  ctx.townDecoPaths = (...args) => { previewPlacements = args[0]; return draw(...args); };
  ctx.townSceneEntries = () => [entry];
  ctx.townMinorRoads = function* () {
    for (let i = 0; i < 160; i++) { roads++; f.advance(2); yield; }
    entry.minorRoadPath = 'M451,451L451,458';
  };
  ctx.syncTownscapes();
  const job = ctx.townRender.accessJob;
  assert.equal(ctx.townRender.pending, true);
  assert.equal(ctx.townLayer.style.display, 'block', 'safe roofs cannot wait for the full road network');
  assert.equal(ctx.townRender.geometryRetained, true);
  assert.match(ctx.townPaths.house.attrs.d, /^M/);
  assert.equal(ctx.townPaths.house.attrs['stroke-width'], '0', 'preview must not inherit a giant default SVG outline');
  assert.equal(roads, 0, 'preview is visible while footprints are still being checked');
  assert.equal(ctx.townDecorationLayer.style.display, 'block', 'decorations are visible on the same commit as the first roofs');
  assert.ok(previewPlacements.length > 0 && previewPlacements.length <= 128);
  assert.ok(previewPlacements.every(placed => placed.x - placed.pad >= 454), 'preview footprints cannot enter water');
  assert.ok(previewPlacements.every(placed => !entry.final.some(building => town.polygonsOverlap(building.poly,
    [[placed.x - placed.pad, placed.y - placed.pad], [placed.x + placed.pad, placed.y - placed.pad],
      [placed.x + placed.pad, placed.y + placed.pad], [placed.x - placed.pad, placed.y + placed.pad]], 0))),
  'preview decorations respect the already accepted roof index');
  assert.ok(town.DECO_GROUPS.some(name => ctx.townPaths[name].attrs.d));
  assert.equal(f.counts().people, 0);
  ctx.mapPanX += 1; ctx.viewZoom *= 1.01;
  ctx.syncTownVisibility();
  assert.equal(ctx.townLayer.style.display, 'block');
  f.advance(250);
  for (let i = 0; i < 100 && ctx.townRender.accessJob; i++) {
    assert.equal(ctx.townRender.accessJob, job, 'camera-only updates keep preparation progress');
    assert.equal(ctx.townLayer.style.display, 'block');
    f.advance(20); f.flush();
  }
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(ctx.townRender.pending, false);
  assert.equal(roads, 160);
  assert.match(ctx.townPaths.house.attrs.d, /^M/);
  assert.match(ctx.townPaths.streets.attrs.d, /^M/);
  assert.ok(Number(ctx.townPaths.house.attrs['stroke-width']) > 0, 'finished roofs regain their physical outlines');
  ctx.townSceneEntries = () => [{ ...entry, pathKey: 'replacement-home' }];
  ctx.syncTownscapes();
  assert.equal(ctx.townKey, '', 'a preview invalidates the static scene it replaced, even if the camera returns there');
  assert.equal(ctx.townRender.pending, true);
  assert.equal(ctx.townLayer.style.display, 'block');
  ctx.viewZoom = 0.5; ctx.syncTownscapes();
  assert.equal(ctx.townRender.accessJob, null, 'zooming out cancels unfinished preview work');
  assert.equal(ctx.townRender.geometryRetained, false);
  assert.equal(ctx.townLayer.style.display, 'none');
  assert.equal(ctx.townPaths.house.attrs.d, '');
});

test('equivalent marker redraws do not restart pending townscapes, and the first commit refreshes icon sizes', () => {
  const f = fixture(), { ctx } = f;
  let starts = 0, targets = 0, icons = 0;
  ctx.townSceneEntries = () => [];
  ctx.placeIcons = () => { icons++; assert.equal(ctx.townLayer.style.display, 'block'); };
  ctx.townAccessRoads = function* () {
    starts++;
    for (let i = 0; i < 180; i++) { yield; targets++; }
  };
  ctx.syncTownscapes();
  const job = ctx.townRender.accessJob;
  assert.equal(icons, 0, 'pending geometry does not shrink the icons');
  f.advance(250); f.flush();
  assert.equal(ctx.townRender.accessJob, job, 'a new array with the same scene keeps its iterator');
  f.flush();
  assert.equal(targets, 180);
  assert.equal(starts, 1);
  assert.equal(icons, 1, 'completion refreshes circles without requiring another camera input');
});

test('entrance batches yield at the time budget and discard a failed iterator rather than publishing partial roads', () => {
  const f = fixture(), { ctx } = f, entries = [];
  let targets = 0;
  ctx.townSceneEntries = () => entries;
  ctx.townAccessRoads = function* () {
    for (let i = 0; i < 20; i++) { yield; targets++; f.advance(5); }
  };
  ctx.syncTownscapes();
  assert.equal(targets, 2, 'stop after crossing eight milliseconds, well before the 64-step cap');
  assert.equal(ctx.townRender.pending, true);
  ctx.pos++;
  ctx.townAccessRoads = function* () { yield; throw new Error('injected entrance failure'); };
  ctx.syncTownscapes();
  f.advance(250); f.flush();
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(ctx.townRender.geometryRetained, false);
  assert.match(f.errors[0], /injected entrance failure/);
  ctx.townAccessRoads = function* () {};
  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
});

test('dry-road and bridge phases retain progress, yield to input, and discard failed preparation', () => {
  const f = fixture(), { ctx } = f, entries = [];
  let dryStarts = 0, bridgeStarts = 0, completed = 0;
  ctx.townSceneEntries = () => entries;
  ctx.townDryRoads = function* (actualEntries, plan, incremental) {
    assert.equal(actualEntries, entries); assert.equal(incremental, true);
    dryStarts++;
    for (let i = 0; i < 100; i++) { yield; completed++; f.advance(1); }
  };
  ctx.townBridgeRoads = function* () { bridgeStarts++; yield; throw new Error('bridge preparation failed'); };
  ctx.syncTownscapes();
  assert.ok(completed <= 8);
  assert.equal(ctx.townRender.accessJob.phase, 'dry roads');
  const job = ctx.townRender.accessJob;
  f.advance(250);
  for (let i = 0; i < 20 && ctx.townRender.accessJob; i++) f.flush();
  assert.equal(completed, 100);
  assert.equal(dryStarts, 1); assert.equal(bridgeStarts, 1);
  assert.equal(job.done, false);
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(ctx.townRender.geometryRetained, false);
  assert.match(f.errors[0], /bridge preparation failed/);
});

test('town geometry appears while walking-network preparation resumes and only completed networks reach people', () => {
  const f = fixture(), { ctx } = f, entries = [];
  let starts = 0, edges = 0, published = null;
  ctx.townSceneEntries = () => entries;
  ctx.peopleActive = () => true;
  ctx.buildTownWorld = function* (actualEntries, plan, incremental, key) {
    starts++;
    assert.equal(actualEntries, entries); assert.equal(incremental, true);
    for (let i = 0; i < 160; i++) { yield; edges++; f.advance(1); }
    return { key, complete: true };
  };
  ctx.syncPeople = (actualEntries, world) => { assert.equal(actualEntries, entries); published = world; ctx.townWorld = world; };
  ctx.syncTownscapes();
  assert.ok(edges <= 8);
  assert.ok(ctx.townRender.walkJob);
  assert.equal(ctx.townRender.accessJob, null);
  assert.equal(ctx.townRender.geometryRetained, true);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.pending, false, 'the static scene does not wait for walkers');
  assert.equal(published, null);
  f.advance(250);
  for (let i = 0; i < 30 && ctx.townRender.walkJob; i++) f.flush();
  assert.equal(edges, 160); assert.equal(starts, 1);
  assert.equal(published.complete, true);
  assert.equal(published.key, ctx.townKey);
  assert.equal(ctx.townRender.pending, false);
  const runningWorld = published;
  ctx.pos++;
  ctx.buildTownWorld = function* () { yield; throw new Error('walking network failed'); };
  ctx.syncTownscapes(); f.advance(250); f.flush();
  assert.equal(ctx.townRender.walkJob, null);
  assert.match(f.errors[0], /walking network failed/);
  assert.equal(published, runningWorld, 'do not publish a failed replacement');
  assert.equal(ctx.townLayer.style.display, 'block', 'a walker failure cannot hide town geometry');
});

test('the first townscape waits for its markers and then submits visible roads and roofs', () => {
  const { ctx, counts } = fixture();
  ctx.scatterJob = { nextTile: 1 };
  ctx.syncTownscapes();
  assert.equal(counts().scenes, 0);
  assert.equal(ctx.townRender.geometryRetained, false);
  assert.equal(ctx.townRender.pending, true);
  const poly = [[452, 452], [456, 452], [456, 456], [452, 456]];
  const entry = {
    item: { kind: 'building', index: 0 }, pathKey: 'visible-home', kind: 'town',
    center: { x: 454, y: 454 }, radius: 4,
    polys: [{ poly, box: town.polygonBounds(poly), parts: [], detail: [], form: 'rect', group: 'house', sourceIndex: 0 }],
    paths: { accents: '', mainStreets: 'M451,453L457,453' },
    minorRoadPath: 'M453,451L453,457', dryMainRoadPath: 'M451,453L457,453',
  };
  ctx.townSceneEntries = () => [entry];
  ctx.scatterJob = null;
  ctx.iconPoints.push({ x: 454, y: 454, item: entry.item });
  ctx.syncTownscapes();
  assert.equal(ctx.townRender.pending, false);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.geometryRetained, true);
  assert.match(ctx.townPaths.house.attrs.d, /^M/);
  assert.match(ctx.townPaths.mainStreets.attrs.d, /^M/);
  assert.ok(entry.final.length > 0);
});

test('oversized accepted footprints cannot enumerate unbounded empty grid cells during town preparation', () => {
  const { ctx } = fixture();
  const poly = [[-1e9, -1e9], [1e9, -1e9], [1e9, 1e9], [-1e9, 1e9]];
  const entry = {
    item: { kind: 'building', index: 0 }, pathKey: 'large-footprint', kind: 'town',
    center: { x: 0, y: 0 }, radius: 1, paths: { accents: '' },
    polys: [{ poly, box: town.polygonBounds(poly), parts: [], detail: [], form: 'rect', group: 'house', sourceIndex: 0 }],
  };
  ctx.townSceneEntries = () => [entry];
  vm.runInContext('syncTownscapes()', ctx, { timeout: 1000 });
  assert.equal(ctx.townRender.pending, false);
  assert.equal(entry.final.length, 4);
  assert.equal(ctx.townLayer.style.display, 'block');
});

test('townscape and river SVG viewports stay screen-sized at the actual maximum zoom and map points correctly through pan and aspect changes', () => {
  const { ctx } = fixture(), svg = element();
  ctx.ps = n => n; ctx.TILE_MILES = 100; ctx.WALKER_MIN_DIAMETER_MILES = 0.0003;
  vm.runInContext(slice('maxViewZoom'), ctx);
  ctx.viewZoom = ctx.maxViewZoom(); ctx.viewAspectY = 0.75;
  ctx.mapPanX = 125; ctx.mapPanY = -220;
  ctx.window.innerWidth = 1920; ctx.window.innerHeight = 1080;
  ctx.syncMapSvgViewport(svg);
  assert.equal(svg.style.width, '1920px'); assert.equal(svg.style.height, '1080px');
  assert.equal(svg.style.transform, 'none'); assert.equal(svg.style.clip, 'auto');
  const [x, y, width, height] = svg.attrs.viewBox.split(' ').map(Number);
  assert.ok(width < 1 && height < 1, 'this zoom would make a local CSS clip subpixel');
  const px = 500, py = 500;
  assert.ok(Math.abs((px - x) * 1920 / width - (500 + ctx.mapPanX)) < 1e-6);
  assert.ok(Math.abs((py - y) * 1080 / height - (500 + ctx.mapPanY)) < 1e-6);
  assert.ok(slice('syncTownscapes').includes('syncMapSvgViewport(townLayer)'));
  assert.ok(slice('applyMapView').includes('syncMapSvgViewport(el)'));
  ctx.mapPanX += 100; ctx.syncMapSvgViewport(svg);
  assert.notEqual(svg.attrs.viewBox.split(' ')[0], String(x));
  ctx.mapVisible = false; ctx.syncMapSvgViewport(svg);
  assert.equal(svg.attrs.viewBox, '0 0 1000 1000', 'minimap restores the full map coordinate system');
});

test('unclocked programmatic camera changes also settle and recover all detail on zoom-in', () => {
  const { ctx, advance, flush, counts } = fixture();
  ctx.syncTownscapes();
  ctx.viewZoom = 8; ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(counts().scenes, 1);
  advance(250); flush();
  assert.equal(ctx.townLayer.style.display, 'block');
  ctx.viewZoom = 10; ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  advance(250); flush();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.viewKey, ctx.townViewKey());
  assert.equal(counts().scenes, 3);
});

test('panning keeps townscapes and decorations visible while the settled scene refreshes', () => {
  const { ctx, advance, flush, counts } = fixture();
  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.ok(Object.values(ctx.townPaths).every(path => path.style.visibility === 'visible'));

  ctx.mapPanX += 100;
  ctx.mapPanY -= 75;
  ctx.syncTownVisibility();
  assert.equal(ctx.townRender.pending, true);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.ok(Object.values(ctx.townPaths).every(path => path.style.visibility === 'visible'));

  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.deepEqual(counts(), { scenes: 1, decorations: 1, people: 1 });
  advance(250); flush();
  assert.equal(ctx.townRender.viewKey, ctx.townViewKey());
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.ok(Object.values(ctx.townPaths).every(path => path.style.visibility === 'visible'));
  assert.deepEqual(counts(), { scenes: 2, decorations: 2, people: 2 });
});

test('zooming out releases retained SVG geometry once and rebuilds it when townscapes return', () => {
  const { ctx } = fixture();
  ctx.syncTownscapes();
  assert.equal(ctx.townDecorationLayer.style.display, 'block', 'decorations are visible on the first full-townscape commit');
  const paths = Object.values(ctx.townPaths);
  let writes = 0;
  for (const path of paths) {
    const setAttribute = path.setAttribute;
    path.setAttribute = function (name, value) {
      if (name === 'd') writes++;
      setAttribute.call(this, name, value);
    };
    path.setAttribute('d', 'M0,0L1,1');
    path.townShape = 'M0,0L1,1';
  }
  ctx.townRoofScene.rect = { x0: 0, x1: 1, y0: 0, y1: 1 };
  ctx.townDecoActive = () => ctx.townscapeActive();
  ctx.townscapeActive = () => false;
  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'none');
  assert.ok(paths.every(path => path.attrs.d === '' && path.townShape === ''));
  assert.equal(ctx.townRoofScene.rect, null);
  assert.equal(ctx.townRender.geometryRetained, false);
  const clearedWrites = writes;
  ctx.syncTownscapes();
  assert.equal(writes, clearedWrites, 'inactive frames do not repeatedly submit empty paths');

  ctx.townscapeActive = () => true;
  ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.viewKey, ctx.townViewKey());
  assert.equal(ctx.townRender.geometryRetained, true);
  assert.ok(paths.every(path => path.attrs.d === ''), 'the empty fixture redraw does not revive released geometry');
});

test('failed zoom refresh retains committed geometry but closing the map hides it', () => {
  const { ctx, advance, input, flush, timers, errors } = fixture();
  ctx.syncTownscapes();
  advance(10); input(); ctx.viewZoom = 9; ctx.syncTownscapes();
  const old = ctx.townRender.viewKey;
  ctx.townSceneEntries = () => { throw new Error('injected scene failure'); };
  advance(250); flush();
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(ctx.townRender.viewKey, old);
  assert.equal(ctx.townRender.pending, true);
  assert.match(errors[0], /settled townscape refresh failed.*injected scene failure/);
  ctx.townInterturn.active = true; ctx.syncTownscapes();
  assert.equal(ctx.townLayer.style.display, 'block');
  ctx.townInterturn.active = false;
  input(); ctx.syncTownscapes();
  assert.equal(timers.size, 1);
  ctx.mapVisible = false; ctx.syncTownVisibility(); flush();
  assert.equal(ctx.townLayer.style.display, 'none');
  assert.equal(timers.size, 0);
});

test('zooming below townscape visibility cancels pending geometry work and retains the map input surface', () => {
  const { ctx, input, advance, timers, counts } = fixture();
  ctx.unitDom.el = element();
  ctx.syncTownscapes();
  advance(10); input(); ctx.viewZoom = 2; ctx.syncTownscapes();
  assert.equal(timers.size, 1);
  ctx.viewZoom = 0.1; ctx.syncTownscapes();
  assert.equal(timers.size, 0);
  assert.equal(ctx.townLayer.style.display, 'none');
  assert.equal(ctx.unitDom.el.style.display, '');
  assert.equal(ctx.townRender.pending, false);
  assert.equal(counts().scenes, 1);
});

test('a failed structural submission keeps the last committed key and retries the complete scene before revealing it', () => {
  const { ctx, advance, flush, errors } = fixture();
  ctx.syncTownscapes();
  const committedKey = ctx.townKey;
  ctx.pos++;
  ctx.planEntryLinks = () => ({ roads: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], water: [], bridges: [], tileWalls: [] });
  const path = ctx.townPaths.links, write = path.setAttribute;
  path.setAttribute = () => { throw new Error('injected submission failure'); };
  ctx.syncTownscapes(); advance(250); flush();
  assert.equal(ctx.townKey, committedKey);
  assert.equal(ctx.townLayer.style.display, 'none');
  assert.equal(ctx.townRender.pending, true);
  assert.match(errors[0], /injected submission failure/);
  path.setAttribute = write;
  ctx.syncTownscapes();
  assert.notEqual(ctx.townKey, committedKey);
  assert.equal(ctx.townLayer.style.display, 'block');
  assert.equal(path.attrs.d, 'M0,0L1,1');
  assert.equal(ctx.townRender.viewKey, ctx.townViewKey());
});

test('walker simulation pauses for pending town geometry without destroying people or publishing a stale projection', () => {
  const { ctx } = fixture();
  const world = {};
  Object.assign(ctx, {
    peopleLoop: 1, peopleLast: 0, townLayer: {}, townWorld: world, peopleActive: () => true,
    syncCrowdVisibility() {}, nowMs: () => 123,
    stopPeople: () => assert.fail('keep the existing simulation while navigation settles'),
  });
  ctx.townRender.pending = true;
  vm.runInContext(slice('peopleTick'), ctx);
  ctx.peopleTick();
  assert.equal(ctx.peopleLoop, 0);
  assert.equal(ctx.peopleLast, 123);
  assert.equal(ctx.townWorld, world);
  ctx.townRender.pending = false;
  ctx.townRender.walkJob = {};
  ctx.peopleLoop = 1;
  ctx.peopleTick();
  assert.equal(ctx.peopleLoop, 0, 'old-world walkers pause while the new network is being built');
  assert.equal(ctx.townWorld, world);
});

test('actual road/roof/highlight submission obeys hard command and serialized-character limits without truncating subpaths', t => {
  const { ctx, warnings } = fixture();
  ctx.townPaths = { accessRoads: element(), streets: element(), mainStreets: element(), highlight: element() };
  const line = i => `M${i},0` + Array.from({ length: 20 }, (_, j) => `L${i + j / 100},${j / 100}`).join('');
  const paths = {
    accessRoads: Array.from({ length: 6000 }, (_, i) => line(i)).join(''),
    streets: Array.from({ length: 1000 }, (_, i) => line(i + 6000)).join(''),
    mainStreets: line(8000),
  };
  const result = ctx.submitTownGeometry(paths);
  const submitted = Object.keys(paths).map(key => ctx.townPaths[key].attrs.d);
  const commands = submitted.reduce((sum, d) => sum + (d.match(/[MLHVQCTSAZ]/gi) || []).length, 0);
  const chars = submitted.reduce((sum, d) => sum + d.length, 0);
  assert.equal(result.commands, commands); assert.equal(result.chars, chars);
  assert.ok(commands > 1000 && commands <= 8192);
  assert.ok(chars <= 262144);
  assert.ok(submitted.every(d => d.startsWith('M') && !d.endsWith('L')));
  const originals = new Set(paths.accessRoads.match(/M[^M]*/g));
  assert.ok(ctx.townPaths.accessRoads.attrs.d.match(/M[^M]*/g).every(d => originals.has(d)), 'keep complete meandering road paths, not sliced commands');
  ctx.submitTownGeometry(paths);
  assert.deepEqual(Object.keys(paths).map(key => ctx.townPaths[key].attrs.d), submitted);
  const longPolygon = 'M0.' + '1'.repeat(180) + ',0L1,0L1,1Z';
  const characterBound = ctx.submitTownGeometry({ streets: longPolygon.repeat(1500) });
  assert.ok(characterBound.chars > 200000 && characterBound.chars <= 262144);
  assert.ok(characterBound.commands < 6000, 'serialized size must bind even below the command ceiling');
  const hugeCoordinates = 'M' + '1'.repeat(140000) + ',0L0,1Z';
  ctx.submitTownGeometry({ highlight: hugeCoordinates + 'M0,0L1,0L1,1Z' }, 4096, 131072);
  assert.equal(ctx.townPaths.highlight.attrs.d, 'M0,0L1,0L1,1Z', 'an individually overlarge subpath is omitted, never truncated');
  assert.equal(warnings.length, 1, 'limiting is explicitly diagnosed once, not every frame');
  t.diagnostic(`7,001 meandering roads: ${commands} submitted commands / ${chars} characters`);
});

test('thousands of roofs retain full residence data while actual roof/detail output stays bounded', t => {
  const { ctx } = fixture();
  ctx.townPaths = Object.fromEntries(ctx.TOWN_ROOF_PATHS.map(key => [key, element()]));
  const buildings = Array.from({ length: 6000 }, (_, i) => ({
    sourceIndex: i, group: 'house', form: 'rect', box: { x0: 0, x1: 1, y0: 0, y1: 1 },
    poly: [[0, 0], [1, 0], [1, 1], [0, 1]], parts: [], detail: [[[0, 0.5], [1, 0.5]]],
  }));
  vm.runInContext(['polygonPath', 'linePath'].map(slice).join('\n'), ctx);
  ctx.syncTownRoofs([{ kind: 'town', final: buildings }], -1, 10, -1, 10);
  const output = Object.values(ctx.townPaths).map(path => path.attrs.d).join('');
  const commands = (output.match(/[MLHVQCTSAZ]/gi) || []).length;
  assert.ok(commands > 0 && commands <= 8192);
  assert.ok(output.length <= 262144);
  assert.equal(buildings.length, 6000);
  assert.equal(new Set(buildings.map(b => b.sourceIndex)).size, 6000);
  t.diagnostic(`6,000 roof/detail records: ${commands} submitted commands / ${output.length} characters`);
});
