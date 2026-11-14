import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';
const { unitDestinationGroups, destinationPaths } = await loadModule('anthroprocenia-unit-highlights.js');
function fixture(type) {
  return { type, unit: { owner: 0, getActivationOperationPlots: () => [1, 2], getActivationPlots: () => [0, 2] },
    map: { getGridWidth: () => 4, getGridHeight: () => 1, getLocationFromIndex: x => ({ x, y: 0 }), getIndexFromLocation: loc => loc.x,
      getRevealedState: (owner, x) => x === 2 ? 0 : 2, isFreshWater: x => x === 1 },
    player: { Diplomacy: { isValidLandClaimLocation: loc => loc.x < 3 }, Trade: { projectPossibleTradeRoutes: () => [{ status: [1], targetCityId: 1 }, { status: [0], targetCityId: 3 }] } },
    cities: { get: id => ({ location: { x: id, y: 0 } }) }, success: 1,
    districts: { getAtLocation: () => ({ type: 0 }) }, constructibles: { getHiddenFilteredConstructibles: x => [x] },
    definitions: { wilderness: 0, rural: 1, getConstructible: id => ({ type: id }), lookupConstructible: id => ({ Discovery: id > 0 }) } };
}
test('scout discoveries remain restricted to actual revealed discovery constructibles even with map fog off', () => {
  assert.deepEqual(unitDestinationGroups(fixture('UNIT_SCOUT')).discoveries, [1, 3]);
});
test('missionaries and merchants use native legal activation plots and successful route projections, not settlement guesses', () => {
  assert.deepEqual(unitDestinationGroups(fixture('UNIT_MISSIONARY')).religion, [1]);
  const merchant = unitDestinationGroups(fixture('UNIT_MERCHANT'));
  assert.deepEqual(merchant.roads, [0]); assert.deepEqual(merchant.trade, [1]);
  const invalid = fixture('UNIT_MISSIONARY'); delete invalid.unit.getActivationOperationPlots;
  assert.throws(() => unitDestinationGroups(invalid), /require/);
});
test('settlers distinguish native-legal freshwater sites and reject forbidden or hidden plots', () => {
  const groups = unitDestinationGroups(fixture('UNIT_SETTLER'));
  assert.deepEqual(groups.settlements, [0]); assert.deepEqual(groups.freshwater, [1]);
});
test('highlight geometry is viewport-filtered and bounded without altering the native legal destination set', () => {
  const groups = { settlements: Array.from({ length: 5000 }, (_, i) => i) };
  const vertex = (i, k) => [i * 10 + k, k];
  const all = destinationPaths(groups, vertex, () => true);
  assert.equal(all.limited, true); assert.equal((all.paths.settlements.match(/Z/g) || []).length, 1170);
  const close = destinationPaths(groups, vertex, i => i >= 2000 && i < 2010);
  assert.equal(close.limited, false); assert.equal((close.paths.settlements.match(/Z/g) || []).length, 10);
  assert.equal(groups.settlements.length, 5000);
});

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
function highlightFixture() {
  const native = fixture('UNIT_SCOUT'), callbacks = new Map();
  native.unit.location = { x: 0, y: 0 };
  const element = () => ({ attrs: {}, style: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    appendChild(child) { this.children.push(child); }, classList: { add() {} } });
  const state = { key: '', geometry: '', groups: null, paths: {}, legend: null, revision: 0 };
  const ctx = vm.createContext({
    unitHighlightState: state, unitDestinationGroups, destinationPaths,
    mapVisible: true, cmdLiveTurn: () => true, gameOverlayActive: () => false, riverDom: { el: element() },
    UI: { Player: { getHeadSelectedUnit: () => 1 } }, Units: { get: () => native.unit },
    ComponentID: { isValid: () => true, toLogString: String }, GameInfo: { Units: { lookup: () => ({ UnitType: native.type }) },
      Constructibles: { lookup: id => native.definitions.lookupConstructible(id) } },
    Players: { get: () => native.player }, GameplayMap: native.map, Districts: native.districts, MapConstructibles: native.constructibles,
    Constructibles: { getByComponentID: native.definitions.getConstructible }, Cities: native.cities,
    DistrictTypes: { WILDERNESS: 0, RURAL: 1 }, TradeRouteStatus: { SUCCESS: 1 },
    GameContext: { localPlayerID: 0 }, Game: { turn: 1 }, manifest: { rev: 1 },
    naturalViewKey: () => '', mapPanX: 0, mapPanY: 0, measureArea: () => ({ x: 0, y: 0, w: 1000, h: 1000 }),
    hexVert: (i, k) => [i * 10 + k, k], basePos: Array.from({ length: 4 }, (_, i) => ({ x: i * 10, y: 0 })),
    mapToScreen: (x, y) => ({ x, y }), hexW: 10, hexH: 10, viewZoom: 0.1, viewAspectY: 1, ps: n => n,
    document: { createElement: element, createElementNS: element, body: element() }, MAP_CHROME_CLASS: 'chrome',
    engine: { on: (name, fn) => callbacks.set(name, fn) }, window: { addEventListener() {} },
    invalidateGameOverlayCache() {}, InterfaceModeChangedEventName: 'mode', err: assert.fail,
  });
  vm.runInContext(playback.slice(playback.indexOf('function syncUnitHighlights('), playback.indexOf('function prepareTownLeisure(')), ctx);
  const start = playback.indexOf("try {\n  engine.on('UnitSelectionChanged'");
  vm.runInContext(playback.slice(start, playback.indexOf('function sizeScreenSvg(', start)), ctx);
  return { ctx, state, native, callbacks };
}
test('selected scout highlights update when discoveries are revealed, added or collected and hide on deselection or replay', () => {
  const { ctx, state, native, callbacks } = highlightFixture();
  native.map.getRevealedState = (owner, x) => x === 2 || x === 3 ? 0 : 2;
  ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.discoveries, [1]);
  assert.equal(state.paths.discoveries.style.display, 'block');
  assert.equal(state.paths.religion.style.display, 'none');
  assert.equal(Number(state.paths.discoveries.attrs['stroke-width']) * ctx.viewZoom, 1.5, 'zoomed-out highlights remain screen-visible');
  native.map.getRevealedState = (owner, x) => x === 2 ? 0 : 2;
  callbacks.get('PlotVisibilityChanged')();
  ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.discoveries, [1, 3]);
  native.definitions.lookupConstructible = () => ({ Discovery: false });
  callbacks.get('ConstructibleRemovedFromMap')();
  ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.discoveries, []);
  assert.equal(state.paths.discoveries.style.display, 'none');
  ctx.syncUnitHighlights();
  assert.equal(state.paths.discoveries.style.display, 'none', 'cached empty paths stay hidden');
  native.definitions.lookupConstructible = id => ({ Discovery: id === 3 });
  callbacks.get('ConstructibleAddedToMap')();
  ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.discoveries, [3]);
  ctx.cmdLiveTurn = () => false; ctx.syncUnitHighlights();
  assert.equal(state.paths.discoveries.style.display, 'none');
  ctx.cmdLiveTurn = () => true; ctx.syncUnitHighlights();
  assert.equal(state.paths.discoveries.style.display, 'block');
  ctx.UI.Player.getHeadSelectedUnit = () => null; ctx.syncUnitHighlights();
  assert.equal(state.paths.discoveries.style.display, 'none'); assert.equal(state.legend.style.display, 'none');
});
test('a transient discovery lookup failure is surfaced and retried instead of poisoning the selected-unit cache', () => {
  const { ctx, state, native } = highlightFixture();
  native.definitions.lookupConstructible = () => null;
  assert.throws(() => ctx.syncUnitHighlights(), /discovery definition is unavailable/);
  assert.equal(state.key, '');
  native.definitions.lookupConstructible = id => ({ Discovery: id > 0 });
  ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.discoveries, [1, 3]); assert.equal(state.paths.discoveries.style.display, 'block');
});
