import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-placement.js', import.meta.url), 'utf8');
const { getPlacementGroups, placementYields, localCityAtPlot, dispatchPlacementSelection, validCameraAspect, placementYieldScale } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const workers = {
  workablePlotIndexes: [3],
  workablePlots: [{ PlotIndex: 3, NextYields: [5, 2], CurrentYields: [3, 2], NextMaintenance: [0, 3], CurrentMaintenance: [0, 1] }]
};
const cities = { get: () => ({ isTown: false, getPurchasedPlots: () => [1, 2] }) };
const building = {
  cityID: { id: 8, owner: 0 }, urbanPlots: [2], developedPlots: [4], expandablePlots: [5],
  selectedPlacementData: {},
  getPlacementPlotData: (plot) => plot === 2 ? {} : null,
  getTotalYieldChanges: () => [{ yieldType: 'YIELD_FOOD', yieldChange: 2 }]
};
const yields = [{ YieldType: 'YIELD_FOOD' }, { YieldType: 'YIELD_GOLD' }];
yields.lookup = (type) => yields[type];
const info = { Yields: yields };
const map = { getYieldsWithCity: () => [[0, 4], [1, 0]], getYields: () => [[0, 2]] };

test('growth plots use native valid and specialist sets and yield data', () => {
  const handler = { cityID: building.cityID, validPlots: [2, 4], validNeighborPlots: [4] };
  const state = getPlacementGroups('INTERFACEMODE_ACQUIRE_TILE', handler, building, workers, cities);
  assert.deepEqual(state.groups, [[1, 2], [2, 4], [3], [4]]);
  assert.deepEqual(state.yieldPlots, [2, 4, 3]);
  assert.deepEqual(placementYields(state, 2, building, workers, map, info, 0), [{ type: 'YIELD_FOOD', amount: 4, delta: false }]);
  assert.deepEqual(placementYields(state, 3, building, workers, map, info, 0), [
    { type: 'YIELD_FOOD', amount: 2, delta: true },
    { type: 'YIELD_GOLD', amount: -2, delta: true }
  ]);
  assert.throws(() => getPlacementGroups('INTERFACEMODE_ACQUIRE_TILE', {}, building, workers, cities), /unavailable/);
});

test('building and wonder placement uses native placement results', () => {
  const state = getPlacementGroups('INTERFACEMODE_PLACE_BUILDING', null, building, workers, cities);
  assert.deepEqual(state.groups, [[], [2], [4], [5]]);
  assert.deepEqual(placementYields(state, 2, building, workers, map, info, 0), [{ type: 'YIELD_FOOD', amount: 2, delta: true }]);
  assert.deepEqual(placementYields(state, 5, building, workers, map, info, 0), []);
  assert.equal(getPlacementGroups('INTERFACEMODE_DEFAULT', null, building, workers, cities), null);
});

test('city selection targets only local city centers at the clicked tile', () => {
  const cityID = { owner: 0, id: 9 };
  const gameplayMap = { getLocationFromIndex: (i) => ({ x: i, y: 1 }) };
  const mapCities = { getDistrict: (x) => x === 4 ? { id: 2 } : null };
  const districts = { get: () => ({ type: 7, cityId: cityID }) };
  assert.equal(localCityAtPlot(4, gameplayMap, mapCities, districts, { get: () => ({ owner: 0 }) }, 7, 0), cityID);
  assert.equal(localCityAtPlot(4, gameplayMap, mapCities, districts, { get: () => ({ owner: 1 }) }, 7, 0), null);
  assert.equal(localCityAtPlot(4, gameplayMap, mapCities, districts, cities, 8, 0), null);
  assert.equal(localCityAtPlot(-1, gameplayMap, mapCities, districts, cities, 7, 0), null);
});

test('placement dispatch consumes input once and respects native selection permissions', () => {
  const calls = [];
  const event = { preventDefault: () => calls.push('prevent'), stopImmediatePropagation: () => calls.push('stop') };
  const world = { selectPlot: location => calls.push(location) };
  const location = { x: 4, y: 7 };
  dispatchPlacementSelection(event, location, world, true);
  assert.deepEqual(calls, ['prevent', 'stop', location]);
  calls.length = 0;
  dispatchPlacementSelection(event, location, world, false);
  assert.deepEqual(calls, ['prevent', 'stop']);
});

test('camera fit rejects extreme and non-finite aspect ratios', () => {
  for (const aspect of [NaN, Infinity, 0.29, 1.51]) assert.equal(validCameraAspect(aspect), false);
  for (const aspect of [0.3, 1, 1.5]) assert.equal(validCameraAspect(aspect), true);
});

test('map placement reaches native selection even while its own city overlay hides map chrome', async () => {
  const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  const names = ['mapGamepadAction', 'prepareExpansionSelection', 'expansionWorldTarget', 'setExpansionCursor'];
  const functions = names.map(name => {
    const start = playback.indexOf(`function ${name}(`);
    let depth = 0, end = playback.indexOf('{', start);
    for (; end < playback.length; end++) {
      if (playback[end] === '{') depth++;
      else if (playback[end] === '}' && --depth === 0) break;
    }
    return playback.slice(start, end + 1);
  }).join('\n');
  const body = {}, popupButton = {}, calls = [];
  let hit = body, allowed = true, mode = 'INTERFACEMODE_PLACE_BUILDING';
  const handler = { onPlotUpdated: loc => calls.push(['hover', loc.x, loc.y]) };
  const context = {
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false },
    settlementExpansionActive: () => mode === 'INTERFACEMODE_ACQUIRE_TILE', mapPlotSelectionActive: () => true,
    gameOverlayActive: () => true, overlayShown: true, InputActionStatuses: { FINISH: 2 },
    InterfaceMode: { getCurrent: () => mode, getInterfaceModeHandler: () => handler },
    Cursor: { position: { x: 120, y: 80 } }, FocusManager: { get: () => ({ isWorldFocused: () => true }) },
    document: { body, elementFromPoint: () => hit }, measureArea: () => ({}), pointInRect: () => true,
    hexAt: () => 37, GameplayMap: { getLocationFromIndex: () => ({ x: 7, y: 3 }) }, PlotCursor: {},
    ViewManager: { get isPlotSelectionAllowed() { return allowed; } },
    WorldInput: { selectPlot: loc => calls.push(['select', loc.x, loc.y]) }, dispatchPlacementSelection,
    err: message => assert.fail(message),
  };
  runInNewContext(functions, context);
  const press = (name = 'mousebutton-left', status = 2) => context.mapGamepadAction({
    detail: { name, status, x: 120, y: 80 }, preventDefault() {}, stopImmediatePropagation() {},
  });
  press('mousebutton-left', 1);
  assert.deepEqual(calls, [], 'press start cannot submit a build location');
  press();
  assert.deepEqual(calls, [['hover', 7, 3], ['select', 7, 3]]);
  calls.length = 0; hit = popupButton; press();
  assert.deepEqual(calls, [], 'native panels must still receive their own clicks');
  hit = body; allowed = false; press();
  assert.ok(!calls.some(call => call[0] === 'select'), 'modal native selection permissions remain enforced');
  calls.length = 0; allowed = true; mode = 'INTERFACEMODE_ACQUIRE_TILE'; press();
  assert.deepEqual(calls, [['select', 7, 3]], 'city improvement/growth selection uses the same translated map coordinate');
  calls.length = 0; press('touch-tap');
  assert.deepEqual(calls, [['select', 7, 3]], 'touch selection follows the same path exactly once');
});

test('yield labels stay bounded on screen and shrink to fit small hexes', () => {
  for (const zoom of [0.1, 1, 10]) {
    for (const aspect of [0.3, 1, 1.5]) {
      const [x, y] = placementYieldScale(40, 35, zoom, aspect);
      assert.ok(x * zoom <= 1.25);
      assert.ok(y * zoom * aspect <= 1.25);
      assert.ok(72 * x <= 40 + 1e-10);
      assert.ok(20 * y <= 35 + 1e-10);
      assert.ok(Math.abs(x * zoom - y * zoom * aspect) < 1e-10);
    }
  }
});

test('playback yields are batched, render explicit text and icons, and cancel stale work', async () => {
  const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  const start = playback.indexOf('function buildPlacementYields(state) {');
  const end = playback.indexOf('function syncExpansionOverlay()', start);
  assert.ok(start >= 0 && end > start);
  const callbacks = [], rendered = [];
  const element = () => ({
    children: [], classList: { add() {} }, style: {},
    appendChild(child) { this.children.push(child); }
  });
  const context = {
    placementYieldToken: 0, mapVisible: true, basePos: Array.from({ length: 25 }, () => ({ x: 0, y: 0 })),
    hexW: 40, hexH: 35, nowMs: () => 0,
    document: { createElement: element, createDocumentFragment: element },
    expansionYields: { appendChild(fragment) { rendered.push(...fragment.children); }, style: {} },
    placementYields: () => [{ type: 'YIELD_FOOD', amount: 2, delta: true }],
    BuildingPlacementManager: {}, PlotWorkersManager: {}, GameplayMap: {}, GameInfo: {},
    GameContext: { localPlayerID: 0 }, UI: { getIconURL: type => `icon:${type}` },
    requestAnimationFrame: callback => callbacks.push(callback),
    err: message => { throw new Error(message); }
  };
  runInNewContext(playback.slice(start, end), context);
  context.buildPlacementYields({ yieldPlots: Array.from({ length: 25 }, (_, i) => i) });
  assert.equal(rendered.length, 0);
  callbacks.shift()();
  assert.equal(rendered.length, 20);
  assert.equal(rendered[0].children[0].src, 'icon:YIELD_FOOD');
  assert.equal(rendered[0].children[1].textContent, '+2');
  context.placementYieldToken++;
  callbacks.shift()();
  assert.equal(rendered.length, 20);
});
