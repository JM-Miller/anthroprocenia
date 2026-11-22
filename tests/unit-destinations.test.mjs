import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';
const { unitDestinationGroups, destinationPaths, unitDestinationGroupSteps, destinationPathSteps, UNIT_DESTINATION_STYLES } = await loadModule('anthroprocenia-unit-highlights.js');
function fixture(type) {
  return { type, definition: { UnitType: type, FoundCity: type === 'UNIT_SETTLER', MakeTradeRoute: type === 'UNIT_MERCHANT', SpreadCharges: type === 'UNIT_MISSIONARY' ? 3 : 0 },
    lens: type === 'UNIT_SCOUT' ? 'fxs-discovery-lens' : null,
    unit: { owner: 0, getActivationOperationPlots: () => [1, 2], getActivationPlots: () => [0, 2] },
    map: { getGridWidth: () => 4, getGridHeight: () => 1, getLocationFromIndex: x => ({ x, y: 0 }), getIndexFromLocation: loc => loc.x,
      getRevealedState: (owner, x) => x === 2 ? 0 : 2, isFreshWater: x => x === 1, isWater: () => false },
    player: { Diplomacy: { isValidLandClaimLocation: loc => loc.x < 3 }, Trade: { projectPossibleTradeRoutes: () => [{ status: [1], targetCityId: 1 }, { status: [0], targetCityId: 3 }] } },
    cities: { get: id => ({ location: { x: id, y: 0 }, getPurchasedPlots: () => [id] }) }, success: 1,
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
  assert.deepEqual(groups.blocked, [3]);
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
function highlightFixture(incremental = false) {
  const native = fixture('UNIT_SCOUT'), callbacks = new Map(), timers = new Map();
  let sequence = 0;
  native.unit.location = { x: 0, y: 0 };
  const element = () => ({ attrs: {}, style: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    appendChild(child) { this.children.push(child); }, classList: { add() {} } });
  const state = { key: '', geometry: '', groups: null, paths: {}, legend: null, revision: 0 };
  const ctx = vm.createContext({
    unitHighlightState: state, unitDestinationGroupSteps, destinationPathSteps, UNIT_DESTINATION_STYLES,
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    LensManager: { getLensForUnit: () => native.lens, layers: new Map() },
    mapVisible: true, cmdLiveTurn: () => true, gameOverlayActive: () => false, riverDom: { el: element() },
    UI: { Player: { getHeadSelectedUnit: () => 1 } }, Units: { get: () => native.unit },
    ComponentID: { isValid: () => true, toLogString: String }, GameInfo: { Units: { lookup: () => native.definition },
      Constructibles: { lookup: id => native.definitions.lookupConstructible(id) } },
    Players: { get: () => native.player }, GameplayMap: native.map, Districts: native.districts, MapConstructibles: native.constructibles,
    Constructibles: { getByComponentID: native.definitions.getConstructible }, Cities: native.cities,
    DistrictTypes: { WILDERNESS: 0, RURAL: 1 }, TradeRouteStatus: { SUCCESS: 1 },
    GameContext: { localPlayerID: 0 }, Game: { turn: 1 }, manifest: { rev: 1 },
    naturalViewKey: () => '', mapPanX: 0, mapPanY: 0, measureArea: () => ({ x: 0, y: 0, w: 1000, h: 1000 }),
    hexVert: (i, k) => [i * 10 + k, k], basePos: Array.from({ length: 4 }, (_, i) => ({ x: i * 10, y: 0 })),
    mapToScreen: (x, y) => ({ x, y }), hexW: 10, hexH: 10, viewZoom: 0.1, viewAspectY: 1, ps: n => n,
    document: { createElement: element, createElementNS: element, body: element() }, MAP_CHROME_CLASS: 'chrome',
    engine: { on: (name, fn) => callbacks.set(name, fn) }, window: { addEventListener: (name, fn) => callbacks.set(name, fn) },
    invalidateGameOverlayCache() {}, InterfaceModeChangedEventName: 'mode', err: assert.fail,
  });
  vm.runInContext(playback.slice(playback.indexOf('function syncUnitHighlights('), playback.indexOf('function prepareTownLeisure(')), ctx);
  const start = playback.indexOf("try {\n  engine.on('UnitSelectionChanged'");
  vm.runInContext(playback.slice(start, playback.indexOf('function sizeScreenSvg(', start)), ctx);
  const sync = ctx.syncUnitHighlights;
  function flush() {
    let batches = 0;
    while (timers.size) {
      assert.ok(++batches < 1000, 'highlight jobs finish');
      const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
    }
  }
  if (!incremental) ctx.syncUnitHighlights = () => { sync(); flush(); };
  return { ctx, state, native, callbacks, timers, flush };
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
test('large lenses defer both native scanning and geometry, coalesce polls and cancel obsolete selection work', () => {
  const { ctx, native, state, timers, flush } = highlightFixture(true);
  let reads = 0, vertices = 0;
  native.map.getGridWidth = () => 4096;
  native.map.getRevealedState = () => { reads++; return 2; };
  ctx.basePos = Array.from({ length: 4096 }, () => ({ x: 0, y: 0 }));
  ctx.hexVert = (i, k) => { vertices++; return [k, k]; };
  const tick = () => {
    const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
  };
  ctx.syncUnitHighlights();
  assert.equal(reads, 0, 'the native lens gets its first paint before scanning');
  tick();
  assert.ok(reads > 0 && reads <= 128);
  const firstBatch = reads;
  for (let i = 0; i < 10; i++) ctx.syncUnitHighlights();
  assert.equal(reads, firstBatch, 'overlay polls do not force additional work before the scheduled continuation');
  assert.equal(timers.size, 1);
  native.unit.owner = 1; ctx.syncUnitHighlights();
  assert.equal(timers.size, 0); assert.equal(state.job, null); assert.equal(state.groups, null);
  native.unit.owner = 0; ctx.syncUnitHighlights();
  while (state.job && state.job.key.startsWith('destinations|')) tick();
  assert.equal(vertices, 0, 'path construction is deferred separately from scanning');
  assert.equal(state.groups.discoveries.length, 4095);
  let batches = 0;
  while (timers.size) {
    const before = vertices; tick(); batches++;
    assert.ok(vertices - before <= 128 * 6, 'a geometry batch never builds the whole lens');
  }
  assert.ok(batches > 1);
  assert.equal(state.job, null); assert.equal(state.paths.discoveries.style.display, 'block');
  state.revision++; ctx.syncUnitHighlights(); ctx.mapVisible = false; ctx.syncUnitHighlights(); flush();
  assert.equal(state.job, null); assert.equal(state.paths.discoveries.style.display, 'none');
});
test('slow native plot queries stop a lens batch at its time budget before the step limit', () => {
  const { ctx, native, timers } = highlightFixture(true);
  let clock = 0, reads = 0;
  ctx.Date = { now: () => clock };
  native.map.getGridWidth = () => 1000;
  native.map.getRevealedState = () => { clock += 2; reads++; return 2; };
  ctx.syncUnitHighlights();
  const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
  assert.equal(reads, 3, 'three two-millisecond queries consume the six-millisecond batch budget');
  ctx.mapVisible = false; ctx.syncUnitHighlights(); assert.equal(timers.size, 0);
});

test('selected-unit highlights survive native lens panels and repeated overlay polls but hide behind real menus', () => {
  const { ctx, state, native } = highlightFixture();
  native.definition = { UnitType: 'UNIT_SETTLER', FoundCity: true }; native.lens = 'fxs-settler-lens';
  Object.assign(ctx, {
    ContextManager: { screens: [] }, ViewManager: { current: { getName: () => 'World' } },
    InterfaceMode: { getCurrent: () => 'INTERFACEMODE_UNIT_SELECTED' },
    OVERLAY_MODE_PATTERN: /PAUSE|DIPLOM|CITY_/, POPUP_SELECTOR: 'fxs-popup',
    overlayActiveCache: { time: -Infinity, value: false }, performance: { now: () => 1000 },
  });
  ctx.UI.Player.getHeadSelectedCity = () => null;
  ctx.document.querySelector = () => null;
  const start = playback.indexOf('function computeGameOverlayActive(');
  vm.runInContext(playback.slice(start, playback.indexOf('let overlayTimer', start)), ctx);
  ctx.gameOverlayActive = () => ctx.computeGameOverlayActive();
  ctx.syncUnitHighlights();
  assert.equal(state.paths.freshwater.style.display, 'block');
  for (const tagName of ['PANEL-SETTLER-LEGEND', 'TRADE-ROUTE-CHOOSER', 'PANEL-CONTINENTS']) {
    ctx.ViewManager.current.getName = () => 'Unit';
    ctx.ContextManager.screens = [{ tagName, isConnected: true }];
    for (let poll = 0; poll < 5; poll++) ctx.syncUnitHighlights();
    assert.equal(state.paths.freshwater.style.display, 'block', tagName);
    ctx.ContextManager.screens.push({ tagName: 'PAUSE-MENU', isConnected: true });
    ctx.syncUnitHighlights();
    assert.equal(state.paths.freshwater.style.display, 'none', 'a real menu still hides lens tiles');
    ctx.ContextManager.screens.pop(); ctx.syncUnitHighlights();
    assert.equal(state.paths.freshwater.style.display, 'block');
  }
  ctx.ViewManager.current.getName = () => 'UnitPromotion';
  ctx.syncUnitHighlights();
  assert.equal(state.paths.freshwater.style.display, 'none', 'unit modal views still hide the lens');
  ctx.ViewManager.current.getName = () => 'Unit';
  ctx.syncUnitHighlights();
  assert.equal(state.paths.freshwater.style.display, 'block', 'returning to the native unit harness restores cached geometry');
  ctx.cmdLiveTurn = () => false; ctx.syncUnitHighlights();
  assert.equal(state.paths.freshwater.style.display, 'none', 'historical playback still hides live classifications');
  ctx.cmdLiveTurn = () => true;
  native.unit.owner = 1; ctx.syncUnitHighlights();
  assert.equal(state.paths.freshwater.style.display, 'none', 'foreign settlers do not reveal legal sites');
});

test('replacement units use native capabilities and settlers omit blocked water and hidden land', () => {
  for (const [original, replacement, kind] of [
    ['UNIT_SETTLER', 'UNIT_PIONEER', 'freshwater'],
    ['UNIT_MISSIONARY', 'UNIT_KAHUNA', 'religion'],
    ['UNIT_MERCHANT', 'UNIT_CARAVAN', 'trade'],
    ['UNIT_SCOUT', 'UNIT_PATHFINDER', 'discoveries'],
  ]) {
    const input = fixture(original);
    input.type = replacement; input.definition.UnitType = replacement;
    assert.ok(unitDestinationGroups(input)[kind].includes(1), replacement);
  }
  const input = fixture('UNIT_SETTLER');
  input.map.isWater = x => x === 3;
  assert.deepEqual(unitDestinationGroups(input).blocked, []);
});

test('native trade classifications cover purchased territory for both successful and failed routes', () => {
  const input = fixture('UNIT_MERCHANT');
  input.cities.get = id => ({ location: { x: id, y: 0 }, getPurchasedPlots: () => id === 1 ? [0, 1, 2] : [] });
  const groups = unitDestinationGroups(input);
  assert.deepEqual(groups.trade, [0, 1]);
  assert.deepEqual(groups.tradeBlocked, [3], 'empty purchased sets use the destination city center');
});

test('native action-target events support arbitrary selected units, update colors and clear on selection changes', () => {
  const { ctx, state, native, callbacks } = highlightFixture();
  native.definition = { UnitType: 'UNIT_CUSTOM_SUPPORT' }; native.lens = null;
  const update = callbacks.get('update-operation-target');
  update({ detail: { plots: [1, 2], canStart: false } }); ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.operationBlocked, [1]);
  assert.equal(state.paths.operationBlocked.attrs.fill, '#690909');
  assert.equal(state.paths.operationBlocked.attrs['fill-opacity'], '0.6');
  update({ detail: { plots: [0, 2], canStart: true } }); ctx.syncUnitHighlights();
  assert.deepEqual(state.groups.operationAvailable, [0]);
  assert.equal(state.paths.operationBlocked.style.display, 'none');
  assert.equal(state.paths.operationAvailable.attrs.fill, '#28eebe');
  callbacks.get('UnitSelectionChanged')({ selected: false }); ctx.syncUnitHighlights();
  assert.equal(state.paths.operationAvailable.style.display, 'none');
  assert.equal(state.legend.style.display, 'none');
});

test('settler and native continent tiles retain their exact native colors and a shared SVG budget', () => {
  const { ctx, state, native } = highlightFixture();
  native.definition = { UnitType: 'UNIT_PIONEER', FoundCity: true }; native.lens = 'fxs-settler-lens';
  ctx.syncUnitHighlights();
  for (const [kind, color, opacity] of [['blocked', '#690909', '0.6'], ['settlements', '#b49e28', '0.6'], ['freshwater', '#28eebe', '0.45']]) {
    assert.equal(state.paths[kind].attrs.fill, color); assert.equal(state.paths[kind].attrs['fill-opacity'], opacity);
    assert.equal(state.paths[kind].style.display, 'block');
  }
  native.definition = { UnitType: 'UNIT_EXPLORER', ExtractsArtifacts: true }; native.lens = 'fxs-continent-lens';
  ctx.LensManager.layers.set('fxs-continent-layer', { continentsList: [{ color: 0x55112233, plotList: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }], naturalWonderCoords: [{ x: 3, y: 0 }] });
  ctx.syncUnitHighlights();
  assert.deepEqual(Array.from(state.groups.continent0), [1, 3]);
  assert.equal(state.paths.continent0.attrs.fill, 'rgb(51,34,17)');
  assert.equal(state.paths.continent0.attrs['fill-opacity'], String(1 / 3));
  assert.equal(state.paths.blocked.style.display, 'none', 'switching lens cannot retain old suitability tiles');
  const layer = ctx.LensManager.layers.get('fxs-continent-layer');
  layer.continentsList.push({ color: 0x55332211, plotList: [{ x: 0, y: 0 }] });
  state.revision++; ctx.syncUnitHighlights();
  assert.equal(state.paths.continent1.style.display, 'block');
  layer.continentsList.pop(); state.revision++; ctx.syncUnitHighlights(); ctx.syncUnitHighlights();
  assert.equal(state.paths.continent1.style.display, 'none', 'cached refresh cannot restore obsolete continent buckets');
  const groups = { green: Array.from({ length: 1000 }, (_, i) => i), red: Array.from({ length: 1000 }, (_, i) => i + 1000) };
  const result = destinationPaths(groups, (i, k) => [i + k, k], () => true);
  assert.equal(Object.values(result.paths).join('').match(/Z/g).length, 1170);
  assert.ok(Object.values(result.paths).join('').length <= 262144);
  assert.equal(result.limited, true);
});
