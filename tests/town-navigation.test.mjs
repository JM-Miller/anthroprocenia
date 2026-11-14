import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const town = await loadModule('anthroprocenia-townscape.js');
const crowds = await loadModule('anthroprocenia-crowds.js');
const ui = await loadModule('anthroprocenia-ui.js');
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
  return { style: {}, attrs: {}, events: {}, children: [], classList: { add() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, fn) { this.events[name] = fn; },
    getBoundingClientRect: () => ({ left: 776, right: 812, top: 312, bottom: 348 }),
  };
}
function compass() {
  let time = 1000, overlay = false;
  const ctx = vm.createContext({
    ...ui, toggleMapHistory() {}, historyControlsExpanded: false,
    els: {}, townCompassState: { enabled: false, el: null, shape: '' }, townLayer: { style: { display: 'block' } },
    mapVisible: true, townscapeActive: () => true, gameOverlayActive: () => overlay,
    document: { createElement: element, createElementNS: element, body: element() },
    window: { innerWidth: 1000, innerHeight: 800 }, MAP_CHROME_CLASS: 'chrome', MAP_DEPTH: 300000,
    ps: n => n, Date: { now: () => time }, popState: {}, syncWalkerSpeed() {}, popSyncPauseButton() {},
    measureArea: () => ({ x: 20, y: 30, w: 800, h: 600 }), hexAt: () => 0,
    hexW: 100, viewZoom: 1, viewAspectY: 1, layoutCols: 10, neighborsByIndex: [[1, 2]],
    arrowControlRects: () => [], indicatorPointAvailable: (x, y, area) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h, ensureArrowStyle() {},
    mapToScreen: (x, y) => ({ x, y }), fogMode: false, visForPos: () => [2, 0, 2, 2],
    iconPoints: [
      { x: 100, y: 100, item: { index: 0, kind: 'building' } },
      { x: 300, y: 100, item: { index: 1, kind: 'unit' } },
      { x: 1000, y: 100, item: { index: 2, kind: 'improvement' } },
      { x: 500, y: 100, item: { index: 3, kind: 'building' } },
      { x: 600, y: 100, item: { index: 0, kind: 'resource' } },
    ],
  });
  vm.runInContext(['buildWalkerControls', 'syncTownCompass', 'selectionArrowPlacement'].map(slice).join('\n'), ctx);
  ctx.buildWalkerControls();
  return { ctx, advance: ms => { time += ms; }, overlay: value => { overlay = value; } };
}
test('compass is anchored to the map middle-right, points to all seven-tile neighbors and respects fog and overlays', () => {
  const { ctx, overlay } = compass();
  ctx.syncTownCompass();
  const button = ctx.els.townCompass, state = ctx.townCompassState;
  assert.equal(button.style.left, '776px');
  assert.equal(button.style.top, '312px');
  assert.equal(button.style.display, 'flex');
  assert.ok(button.children[0].children[0].attrs.d, 'explicit SVG compass glyph');
  assert.equal(state.el, null, 'disabled arrows allocate no rendering layer');
  state.enabled = true; ctx.syncTownCompass();
  assert.equal((state.shape.match(/Z/g) || []).length, 3, 'current tile plus its adjacent tiles, not resources or other tiles');
  assert.match(state.el.style.cssText, /pointer-events:none/);
  ctx.fogMode = true; ctx.syncTownCompass();
  assert.equal((state.shape.match(/Z/g) || []).length, 2, 'unrevealed town is not exposed');
  overlay(true); ctx.syncTownCompass();
  assert.equal(button.style.display, 'none'); assert.equal(state.el.style.display, 'none');
  overlay(false); ctx.syncTownCompass();
  assert.equal(state.el.style.display, 'block');
  ctx.townLayer.style.display = 'none'; ctx.syncTownCompass();
  assert.equal(button.style.display, 'none');
  assert.equal(state.path.attrs.d, '');
});
test('one slow compass click toggles once across mouseup and delayed click, and genuine next gestures toggle it off', () => {
  const { ctx, advance } = compass(), button = ctx.els.townCompass;
  const event = type => ({ type, button: 0, preventDefault() {}, stopPropagation() {} });
  button.events.mousedown(event('mousedown')); button.events.mouseup(event('mouseup'));
  advance(1000); button.events.click(event('click'));
  assert.equal(ctx.townCompassState.enabled, true);
  assert.equal(button.compassSlash.style.display, 'block', 'slash means the next click turns arrows off');
  assert.match(button.attrs.title, /Turn off/);
  button.events.mousedown(event('mousedown')); button.events.mouseup(event('mouseup'));
  assert.equal(ctx.townCompassState.enabled, false);
  assert.equal(button.compassSlash.style.display, 'none', 'plain compass means the next click turns arrows on');
  assert.match(button.attrs.title, /Turn on/);
  assert.equal(ctx.townCompassState.path.attrs.d, '');
  assert.ok(ctx.els.civTimelineButton.children[0].children[0].attrs.d, 'timeline control also uses an explicit SVG icon');
});
test('major roads taper just past townscape visibility to exactly twenty feet at the existing hundred-mile tile scale', () => {
  for (const width of [10, 100, 1000]) {
    assert.equal(town.majorRoadWidth(width, 0), Math.max(0.5, width * 0.022));
    const physical = town.majorRoadWidth(width, 1.5);
    assert.ok(Math.abs(physical / width * 100 * 5280 - 20) < 1e-10);
    assert.equal(town.majorRoadWidth(width, 100), physical);
    assert.ok(town.majorRoadWidth(width, 1.25) > physical);
    assert.ok(town.majorRoadWidth(width, 1.25) < town.majorRoadWidth(width, 1));
  }
  const paths = { road: element(), roadDim: element() };
  const ctx = vm.createContext({ ...town, townElementVisibility: { townRoads: true }, routePaths: paths, mapVisible: true, hexW: 100, hexH: 100,
    viewZoom: 15, viewAspectY: 1, window: { innerWidth: 1000, innerHeight: 800 } });
  vm.runInContext(slice('syncRouteWidths'), ctx); ctx.syncRouteWidths();
  assert.equal(paths.road.attrs['stroke-width'], String(town.majorRoadWidth(100, 1.5)));
  assert.equal(paths.roadDim.attrs['stroke-width'], paths.road.attrs['stroke-width']);
  ctx.viewZoom = 1; ctx.syncRouteWidths();
  assert.equal(paths.road.attrs['stroke-width'], String(town.majorRoadWidth(100, 0)));
});
test('townscape road visibility includes major map roads at town zoom but restores their overview visibility', () => {
  const paths = { road: element(), roadDim: element(), rail: element() };
  const ctx = vm.createContext({ ...town, routePaths: paths, townElementVisibility: { townRoads: false },
    mapVisible: true, hexW: 100, hexH: 100, viewZoom: 2, viewAspectY: 1,
    window: { innerWidth: 100, innerHeight: 100 } });
  vm.runInContext(slice('syncRouteWidths'), ctx);
  ctx.syncRouteWidths();
  assert.equal(paths.road.style.display, 'none'); assert.equal(paths.roadDim.style.display, 'none');
  ctx.townElementVisibility.townRoads = true; ctx.syncRouteWidths();
  assert.equal(paths.road.style.display, '');
  ctx.townElementVisibility.townRoads = false; ctx.viewZoom = 0.5; ctx.syncRouteWidths();
  assert.equal(paths.road.style.display, ''); assert.equal(paths.roadDim.style.display, '');
  assert.equal(paths.rail.style.display, undefined);
});

test('headwear builds at most 128 new profiles per draw and eventually includes rare jobs without stale-turn icons', () => {
  let builds = 0, key = 'turn1';
  const ctx = vm.createContext({ ...crowds, townElementVisibility: { walkerHats: true }, peopleSvg: element(), peopleHeadwearPaths: [], ps: n => n,
    document: { createElementNS: element }, popModelKey: () => key,
    personProfileFor(hit) {
      if (!hit.person.profile || hit.person.profileKey !== key) {
        builds++; hit.person.profileKey = key;
        hit.person.profile = { occupation: hit.person.id === 259 ? 'Physician' : 'Farmer' };
      }
      return hit.person.profile;
    },
  });
  vm.runInContext(slice('syncWalkerHeadwear'), ctx);
  const hits = Array.from({ length: 260 }, (_, id) => ({ person: { id, fade: 1 }, at: { x: id, y: 30 } }));
  for (let i = 0; i < 3; i++) {
    const before = builds; ctx.syncWalkerHeadwear(hits, 2);
    assert.ok(builds - before <= 128);
  }
  assert.equal(builds, 260);
  assert.equal(ctx.peopleSvg.headwearPeople.size, 260);
  assert.ok(ctx.peopleHeadwearPaths.some(path => path.attrs.fill === '#ef8b8b' && path.attrs.d));
  key = 'turn2'; ctx.syncWalkerHeadwear(hits, 2);
  assert.equal(builds, 388);
  assert.ok(!ctx.peopleHeadwearPaths.some(path => path.attrs.fill === '#ef8b8b' && path.attrs.d));
  ctx.townElementVisibility.walkerHats = false;
  const before = builds;
  ctx.syncWalkerHeadwear(hits, 2);
  assert.equal(builds, before, 'hidden hats do not build more profiles');
  assert.equal(ctx.peopleSvg.headwearPeople.size, 0);
  ctx.syncWalkerHeadwear([], 2);
  assert.ok(ctx.peopleHeadwearPaths.every(path => path.attrs.d === '' && path.style.visibility === 'hidden'));
});
