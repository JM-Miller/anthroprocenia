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
    ...town, townRender: { viewKey: '', zoomKey: '', inputKey: '', changedAt: 0, pending: false, geometryRetained: false, timer: 0, logged: false, limitReported: false },
    townLayer: null, townDecorationLayer: null, townPaths: null, townKey: '', townSizeKey: '', townHighlightKey: null, townHits: [], townPeople: null,
    townRoofScene: {}, TOWN_ROOF_PATHS: [...town.TOWN_CLASSES, 'tents', 'battleBuildings', 'detail', 'tentDetail'],
    townInterturn: { active: false }, lastMapInputTs: 0,
    mapVisible: true, miniMapVisible: false, miniMapScale: 1, colShift: 0,
    mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0, mapPxW: 1000, mapPxH: 1000,
    viewZoom: 10, viewAspectY: 1, hexW: 100, hexH: 115, pos: 0, detailD: 4, fogMode: false,
    window: { innerWidth: 100, innerHeight: 100 }, MAP_DEPTH: 300000, TAG: '[test]',
    measureArea: () => ({ x: 0, y: 0, w: ctx.window.innerWidth, h: ctx.window.innerHeight }),
    document: { createElementNS: element, body: element() },
    townscapeActive: () => ctx.mapVisible && ctx.viewZoom >= 1,
    syncMapLabelVisibility() {}, syncTownCompass() {}, townLinkTile: () => 0, iconPoints: [], terrainMarkerPaths: new Map(), unitDom: {}, unitSlots: [], dotDom: {}, wonDom: {},
    bgLayer: { el: { style: {} } }, columnShiftMarkersStale: false, fogMarkersStale: false,
    townDecoScene: {}, townPanScene: {}, hideTownLabels() {}, revalidateTownHover() {},
    townSceneEntries() { scenes++; return []; }, releaseTownSceneEntries() {}, townWaterfronts: () => [],
    planEntryLinks: () => ({ roads: [], water: [], bridges: [], tileWalls: [] }),
    townDryRoads() {}, townBridgeRoads() {}, townBuildingGround: () => ({ clear: () => true }),
    townMinorRoads() {}, townAccessRoads() {}, prepareTownLeisure() {},
    syncTownDecorations() { decorations++; }, syncTownLabels() {},
    syncPeople() { assert.equal(ctx.townRender.pending, false); people++; },
    peopleSvg: { style: {} }, peopleDotPaths: [], peopleClumpPaths: [], peopleHeadwearPaths: [], cmdPickRings: [],
    peopleRing: null, peopleRingUnder: null, stopPeople() {},
    Date: { now: () => now },
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    console: { warn: message => warnings.push(message) }, err: message => errors.push(message),
  });
  vm.runInContext(source.slice(source.indexOf('const TOWN_ELEMENT_OPTIONS ='), source.indexOf('let showNaturalFeatures =')), ctx);
  vm.runInContext(['naturalViewKey', 'townZoomKey', 'townViewKey', 'syncTownVisibility', 'townDecoActive', 'syncTownDecorationVisibility', 'scheduleTownRefresh',
    'syncTownElementVisibility', 'submitTownGeometry', 'syncTownscapes', 'syncTownRoofs', 'setTownHighlight', 'clearPeopleVisuals',
    'opaqueTownColor', 'ensureTownscapeLayer', 'linePath', 'polygonPath', 'syncMapSvgViewport'].map(slice).join('\n'), ctx);
  ctx.townRender.inputKey = ctx.townViewKey();
  ctx.townRender.zoomKey = ctx.townZoomKey();
  return { ctx, timers, errors, warnings, counts: () => ({ scenes, decorations, people }),
    advance: ms => { now += ms; }, input: () => { ctx.lastMapInputTs = now; },
    flush() { const queued = [...timers.values()]; timers.clear(); for (const fn of queued) fn(); } };
}

test('decoration previews appear four times farther away without building town scenes or walkers, and hide on map closure', () => {
  const f = fixture(), { ctx } = f;
  ctx.window.innerWidth = 1600; ctx.window.innerHeight = 900; ctx.viewZoom = 4;
  vm.runInContext(['iconModeActive', 'townscapeActive'].map(slice).join('\n'), ctx);
  assert.equal(ctx.townscapeActive(), false); assert.equal(ctx.townDecoActive(), true);
  ctx.syncTownscapes(); f.advance(250); f.flush();
  assert.equal(f.counts().scenes, 0); assert.equal(f.counts().people, 0);
  assert.equal(f.counts().decorations, 1); assert.equal(ctx.townDecorationLayer.style.display, 'block');
  assert.notEqual(ctx.townLayer.style.display, 'block'); assert.match(ctx.townLayer.style.cssText, /display:none/);
  ctx.viewZoom = 3.99; ctx.syncTownscapes(); assert.equal(ctx.townDecorationLayer.style.display, 'none');
  ctx.viewZoom = 4; ctx.syncTownscapes(); f.advance(250); f.flush();
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
