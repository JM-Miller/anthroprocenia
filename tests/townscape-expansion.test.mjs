import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const panel = await loadModule('anthroprocenia-population-panel.js');
const town = await loadModule('anthroprocenia-townscape.js');
const demo = await loadModule('anthroprocenia-demography.js');
const people = await loadModule('anthroprocenia-people.js');
const timeline = await loadModule('anthroprocenia-timeline.js');
const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const recorder = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
function slice(name, source = playback) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
}
const runFunctions = (names, state) => {
  const context = vm.createContext({ ...panel, ...state });
  if (!names.includes('townHousingFor')) names = ['townHousingFor', ...names];
  vm.runInContext([...names, 'walkerBaseSpeed', 'mapScaleMetrics'].map(n => slice(n)).join('\n'), context);
  return context;
};

test('whole-home selection includes millions without constructing millions of person keys', () => {
  const selection = new panel.PeopleSelection();
  selection.setHome('home', 10_000_000, true);
  assert.equal(selection.size, 10_000_000);
  assert.equal(selection.people.size, 0);
  assert.equal(selection.homeStatus('home'), 'true');
  assert.equal(selection.has('home#9999999'), true);
  assert.equal(selection.has('home#10000000'), false);
  assert.equal(selection.has('home#-1'), false);
  selection.delete('home#4');
  assert.equal(selection.homeStatus('home'), 'mixed');
  assert.equal(selection.size, 9999999);
  assert.equal(selection.has('home#4'), false);
  selection.add('home#4');
  assert.equal(selection.homeStatus('home'), 'true');
  selection.add('other#3');
  assert.equal(selection.size, 10000001);
  selection.setHome('home', 10000000, false);
  assert.equal(selection.size, 1);
  selection.setHome('other', 100, true);
  assert.equal(selection.size, 100, 'individual picks are not counted twice');
  selection.clear();
  assert.equal(selection.size, 0);
  assert.equal(selection.excluded.size, 0);
});

test('the Home Location checkbox toggles all remaining people and does not expand the row', () => {
  const chosen = new panel.PeopleSelection(), node = { id: 'h', total: 1000000, icon: { owner: 1 } };
  const context = runFunctions(['cmdToggleHome', 'popActionTarget'], {
    cmdState: { chosen }, cmdLiveTurn: () => true, cmdGameplayAllowed: () => true, cmdOwnPeople: o => o === 1,
    cmdActed: () => new Map([['h#2', []]]), cmdCommandsLeft: () => 0, cmdUpdateStatus: () => {},
  });
  context.cmdToggleHome(node);
  assert.equal(chosen.size, 999999);
  assert.equal(chosen.has('h#2'), false, 'spent commands cannot be selected');
  context.cmdToggleHome(node);
  assert.equal(chosen.size, 0, 'a second press clears even a partially spent home');
  context.cmdToggleHome({ ...node, icon: { owner: 2 } });
  assert.equal(chosen.size, 0, 'not someone else\'s people');
  assert.match(slice('onPopPress'), /cmdToggleHome\(row.node\); popRender\(\); return/);
  assert.match(slice('buildPopulationUi'), /selectNone.textContent = 'Select none'/);
});

test('walker simulation and rendering budgets increase by eight and ten times respectively', () => {
  const budgets = playback.match(/const MAX_PEOPLE = (\d+), MAX_TOWN_PEOPLE = (\d+);/);
  assert.equal(+budgets[1], 7200);
  assert.equal(+budgets[2], 480);
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 5, y: 0 }], destinations: [0, 1], roadEnds: [], doorBuildings: new Map([[0, { pathKey: 'p', sourceIndex: 0 }], [1, { pathKey: 'p', sourceIndex: 1 }]]) };
  const world = { graph, parts: new Map([['p', { offset: 0, destinations: [0, 1], spots: [] }]]) };
  const context = runFunctions(['createWalkers', 'newWalker'], {
    ...town, MAX_TOWN_PEOPLE: +budgets[2], hexW: 40, townWorld: null,
    landMilitaryUnit: () => false, popIconTraits: () => ({ unit: null }), walkerGroupStreets: group => { group.streetNodes = []; }, walkerFormationTraits: () => ({}),
    popIconKey: () => ({ nodeId: 'n', owner: 1 }), popIsPinned: () => false, syncPinnedWalkers: () => {},
  });
  const group = context.createWalkers({ pathKey: 'p', population: 5000, polys: [{ sourceIndex: 0 }, { sourceIndex: 1 }] }, world);
  assert.equal(group.people.length, 480);
  assert.equal(group.people.filter(p => !p.inside).length, 216, 'eight times the old initial 27 outside per home');
});

test('camp tents are detailed building polygons at exactly one fortieth of their old linear size', () => {
  assert.equal(town.TENT_SCALE, 1 / 40);
  const camp = town.generateTownscape({ seed: 8, civKey: 'ROME', population: 5000, kind: 'camp' });
  const tents = camp.buildings.filter(b => b.form === 'tent');
  assert.ok(tents.length >= 4);
  assert.equal(camp.tents.length, 0, 'no legacy giant triangle paths');
  for (const tent of tents) {
    const b = town.polygonBounds(tent.poly);
    const oldSize = 0.12 - town.townscapeScale(5000) * 0.04;
    assert.ok(Math.abs((b.x1 - b.x0) / (oldSize * 1.7) - 1 / 40) < 1e-10);
    assert.ok(tent.detail.length >= 2);
    assert.equal(tent.cls, 'tents');
  }
  assert.match(slice('townscapeFor'), /polys.push\(\{ sourceIndex: i, group: building.cls/);
  assert.match(slice('buildWalkGraph'), /doors.add\(door\)/, 'tent building polygons get distinct doors and collision handling');
});

test('denser decorations include lamps, benches, barrels and crates using the same placement pipeline', () => {
  const decorations = town.townDecorations(73, 4000), kinds = new Set(decorations.map(d => d.kind));
  for (const kind of ['rock', 'pebbles', 'plant', 'bush', 'lamp', 'bench', 'barrel', 'crate']) assert.ok(kinds.has(kind), kind);
  assert.equal(kinds.has('flower'), false, 'pink flower circles removed');
  const context = runFunctions(['townDecoPlacements', 'townDecoPaths'], {
    ...town, hexW: 100, hashString: demo.seedNumber, isWaterAt: () => false,
  });
  const placed = context.townDecoPlacements({
    shapes: { streets: [], mainStreets: [], water: [], walls: [], plazas: [], pools: [] },
    center: { x: 50, y: 50 }, radius: 25, pathKey: 'p', polys: [],
  }, new town.DecorationIndex(1.5));
  const paths = context.townDecoPaths(placed, { x0: 0, x1: 100, y0: 0, y1: 100 });
  for (const group of town.DECO_GROUPS) {
    assert.ok(paths[group].length > 100, group);
    assert.ok(!/NaN|Infinity/.test(paths[group]));
  }
  assert.ok(paths.decoRocks.split('M').length > 100);
});

test('modeled family links update at births and deaths, ignore newcomers, and are deterministic', () => {
  const seed = demo.seedNumber('family'), initial = demo.startLife(seed, 0);
  initial.born = -40;
  demo.stepLife(initial, seed, 1, 2, 2, { birth: 1 }, 'disease');
  assert.equal(initial.parent, 0);
  let members = demo.familyMembers(initial);
  assert.deepEqual(members.map(p => [p.gen, p.depth, p.parent]), [[0, 0, null], [1, 1, 0]]);
  assert.equal(members[0].cause, 'disease');
  assert.equal(members[0].deathTurn, 1);
  const replay = structuredClone(initial);
  demo.stepLife(initial, seed, 2, 4, 2, { birth: 0 }, 'battle');
  demo.stepLife(replay, seed, 2, 4, 2, { birth: 0 }, 'battle');
  assert.deepEqual(initial, replay);
  assert.equal(initial.parent, null, 'a newcomer is not a relative of the previous occupant');
  assert.equal(demo.familyMembers(initial).length, 1);
  assert.equal(demo.familyMembers(initial, 0).length, 2, 'deceased people keep their recorded children');
  for (let t = 3; t < 100; t++) demo.stepLife(initial, seed, t, t * 2, 2, { birth: 1 }, 'disease');
  assert.equal(initial.history.length, 64, 'bounded storage per slot');
  assert.deepEqual(demo.familyMembers(initial, 0), [], 'pruned and future generations are not guessed');
});

test('Family Tree buttons open, toggle and update a real panel while retaining the selected individual after death', () => {
  const node = { id: 'c:o1|k:0|t:1|g:b1|i:b1.0.0', total: 1, label: 'Home', icon: { owner: 1 } };
  const life = demo.startLife(123, 0); life.born = -35;
  const state = { open: false, nodeId: '', index: 0, gen: 0, key: '' };
  const body = { innerHTML: '', style: {} }, box = { style: {} };
  const context = runFunctions(['toggleFamilyPanel', 'syncFamilyPanel', 'familyViewport', 'popFamilyData', 'popFamilyRows', 'popFamilyMemberName', 'popFamilyButtonHtml', 'lifeSeed', 'popPersonHighlightAttrs', 'popSyncPersonHighlights', 'popHoverIdentity'], {
    ...panel, ...people, ...demo, ...timeline, frames: [[0, 1, 1, '4002 BCE'], [0, 2, 0, '4000 BCE']], syncFamilyPin() {}, syncFamilyTimeline() {}, popWorkplace: () => ({ label: 'Court' }), familyState: state, mapVisible: true, ps: n => n, gameOverlayActive: () => false,
    popPerson: () => ({ life: { state: life, turn: life.turn } }), popOwnerContext: () => ({ civKey: 'ROME', religion: '' }),
    popEraNow: () => ({ age: 0 }), popState: { nodeIndex: new Map([[node.id, node]]), builtKey: 't0' },
    popRefreshModel: () => false, popLife: () => ({ state: life }), familyCache: new Map(), pos: 0, lifeTimelineNow: () => ({ years: [0, 2] }), escHtml: s => String(s),
    els: { familyPanel: box, familyBody: body, familyContent: body, familyEventsBody: { style: {} } }, measureArea: () => ({ y: 0 }), window: { innerWidth: 1920, innerHeight: 1080 }, leadState: { open: false },
  });
  context.toggleFamilyPanel(node, 0);
  assert.equal(state.open, true);
  assert.equal(box.style.display, 'flex');
  assert.match(body.innerHTML, /Living, age 35/);
  assert.match(context.popFamilyButtonHtml(), /data-pop-family/);
  demo.stepLife(life, 123, 1, 2, 2, { birth: 1 }, 'old age');
  context.pos = 1;
  context.popState.builtKey = 't1';
  context.syncFamilyPanel(true);
  assert.match(body.innerHTML, /Died on 4000 BCE \(Turn 2\), aged \d+: old age/);
  assert.doesNotMatch(body.innerHTML, /Died on recorded turn/i);
  context.frames[1][3] = 'Summer 1200 CE';
  state.key = '';
  context.syncFamilyPanel(true);
  assert.match(body.innerHTML, /Died on Summer 1200 CE \(Turn 2\)/);
  assert.match(body.innerHTML, /Living, age/);
  assert.equal(state.gen, 0, 'the selected ancestor is not silently replaced by the newborn');
  context.syncFamilyPanel(false);
  assert.equal(box.style.display, 'none', 'hidden under other game screens');
  context.toggleFamilyPanel(node, 0);
  context.toggleFamilyPanel(node, 0);
  assert.equal(state.open, false, 'the same current person toggles closed');
});

test('feature capture upgrades old saves and preserves cliffs on forest tiles as well as unknown feature types', () => {
  const store = new Map([['features_v3', '[[0,1]]']]);
  const types = ['FEATURE_OASIS', 'FEATURE_FOREST', 'FEATURE_FLOODPLAINS', 'FEATURE_SCRUB', 'FEATURE_NEW_DLC', 'NO_FEATURE'];
  const context = vm.createContext({
    KEY_FEATURES_V4: 'features_v4', mapW: types.length, mapH: 1,
    getCatalog: () => ({ getObject: () => ({ read: k => store.get(k), write: (k, v) => store.set(k, v) }) }), OBJ_BASE: 'b',
    GameplayMap: { getFeatureType: x => x, getLocationFromIndex: x => ({ x, y: 0 }), isCliffCrossing: (x, y, d) => x === 1 && d === 2 },
    GameInfo: { Features: { lookup: i => ({ FeatureType: types[i] }) } }, log: () => {}, err: e => assert.fail(e),
  });
  vm.runInContext(slice('captureMapFeatures', recorder), context);
  context.captureMapFeatures();
  assert.deepEqual(JSON.parse(store.get('features_v4')), [[0, 4, 0], [1, 1, 1], [2, 14, 0], [3, 15, 0], [4, 16, 0]]);
  const cliffs = new Set();
  const reader = runFunctions(['readMapFeatureMarkers'], {
    mapFeatureCliffs: cliffs, mapFeatureMarkers: null, mapFeaturesAreV3: false, mapFeaturesCheckedAt: 0,
    KEY_FEATURES_V3: 'features_v3', KEY_FEATURES_V2: 'features_v2', KEY_FEATURES: 'features', OBJ_BASE: 'b',
    getCatalog: context.getCatalog, err: e => assert.fail(e),
  });
  const markers = reader.readMapFeatureMarkers();
  assert.equal(markers.get(0), 4);
  assert.equal(markers.get(1), 1);
  assert.equal(markers.get(4), 16);
  assert.equal(cliffs.has(1), true);
  const shapes = runFunctions(['shapePaths', 'polyPts', 'polyCircle', 'polyRect'], {});
  for (const kind of ['oasis', 'cliff']) {
    const path = shapes.shapePaths(kind, 100, 100, 5, 1);
    assert.match(path.outer, /^M/); assert.match(path.inner, /^M/);
    assert.notEqual(path.outer, path.inner);
  }
});

test('command gestures consume DOM click tails and engine mouse input before city selection', () => {
  let time = 1000, citySelects = 0;
  const fakeDate = { now: () => time };
  const context = runFunctions(['cmdConsumeInput', 'cmdInputActive', 'onCmdConsumedClick', 'mapGamepadAction', 'onMapDragEnd'], {
    gameOverlayActive: () => false, mapUiInput: () => false,
    Date: fakeDate, cmdState: { inputUntil: 0, rightDown: false, menu: null }, mapDrag: { citySelected: false },
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false }, popPanelContains: () => false, commandPanelContains: () => false, els: {},
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false, cmdRightActive: () => false,
    personClickActive: () => false, mapUnitIconInput: () => false, townscapeActive: () => false, Cursor: { position: { x: 5, y: 5 } }, InputActionStatuses: { FINISH: 2 },
    measureArea: () => ({}), pointInRect: () => true, document: { elementFromPoint: () => ({}) }, expansionWorldTarget: () => true,
    overControlPanels: () => false, lastMapDragEnd: 0, selectMapCity: () => { citySelects++; return true; },
  });
  const event = name => ({ button: 0, detail: { name, status: 2 }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } });
  context.cmdConsumeInput();
  assert.equal(context.mapDrag, null);
  for (const name of ['mousebutton-left', 'mousebutton-right']) {
    const e = event(name);
    context.mapGamepadAction(e);
    assert.equal(e.prevented, true); assert.equal(e.stopped, true);
  }
  const click = event('');
  context.onCmdConsumedClick(click);
  assert.equal(click.stopped, true, 'the detached menu\'s click is swallowed');
  context.onMapDragEnd({ clientX: 5, clientY: 5 });
  assert.equal(citySelects, 0);
  time += 701;
  context.mapGamepadAction(event('mousebutton-left'));
  assert.equal(citySelects, 1, 'ordinary city clicks still work after the command gesture ends');
  assert.match(slice('cmdOpenMenu'), /event.preventDefault\(\); event.stopImmediatePropagation\(\);\s*cmdConsumeInput\(\)/);
});

test('completed selection boxes and deselection clicks consume subsequent engine releases', () => {
  let boxes = 0, citySelects = 0, statusUpdates = 0;
  const context = runFunctions(['cmdConsumeInput', 'cmdInputActive', 'onMapDragEnd', 'mapGamepadAction'], {
    gameOverlayActive: () => false, mapUiInput: () => false,
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false,
    Date: { now: () => 2000 }, cmdState: { inputUntil: 0, chosen: new Set(['walker']) },
    mapDrag: { box: true, moved: true, startX: 1, startY: 1, add: false },
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false }, lastMapDragEnd: 0, els: {},
    cmdHideBox: () => {}, cmdSelectBox: () => { boxes++; }, cmdUpdateStatus: () => { statusUpdates++; },
    popState: { open: false }, selectMapCity: () => { citySelects++; }, err: e => assert.fail(e),
  });
  const release = () => {
    const e = { detail: { name: 'mousebutton-left', status: 2 },
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    context.mapGamepadAction(e);
    assert.equal(e.prevented, true);
    assert.equal(e.stopped, true);
    assert.equal(context.mapDrag, null);
    assert.equal(citySelects, 0);
  };
  context.onMapDragEnd({ clientX: 50, clientY: 50 });
  assert.equal(boxes, 1);
  release();
  context.cmdState.inputUntil = 0;
  context.mapDrag = { box: true, moved: false, add: false };
  context.onMapDragEnd({ clientX: 50, clientY: 50 });
  assert.equal(context.cmdState.chosen.size, 0);
  assert.equal(statusUpdates, 1);
  release();
});

test('the shared city selection entrypoint refuses active command gestures but otherwise opens cities', () => {
  let citySelects = 0;
  const context = runFunctions(['cmdInputActive', 'selectMapCity'], {
    Date: { now: () => 2000 }, cmdState: { inputUntil: 0, menu: {}, rightDown: false },
    personClickActive: () => false, townscapeActive: () => false, hexAt: () => 10, localCityAt: () => 'city',
    lastMapCitySelection: { index: -1, time: 0 }, frames: [], pos: 0, nowMs: () => 0,
    UI: { Player: { selectCity: id => { assert.equal(id, 'city'); citySelects++; } } },
    err: e => assert.fail(e),
  });
  assert.equal(context.selectMapCity(5, 5), false);
  context.cmdState.menu = null;
  context.cmdState.inputUntil = 2700;
  assert.equal(context.selectMapCity(5, 5), false);
  context.cmdState.inputUntil = 0;
  assert.equal(context.selectMapCity(5, 5), true);
  assert.equal(citySelects, 1);
});
