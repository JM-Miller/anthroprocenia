import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const panel = await loadModule('anthroprocenia-population-panel.js');
const people = await loadModule('anthroprocenia-people.js');
const town = await loadModule('anthroprocenia-townscape.js');
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
  names = [...new Set([...names, 'mapScaleMetrics'])];
  const ctx = vm.createContext({ ...panel, ...people, ...town, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}

test('all building people sections collapse independently without scanning a large population', () => {
  const node = { id: 'home', label: 'Docks' }, residents = panel.buildingResidents(100_000_000, 0, 5);
  const inside = { count: residents.count, rowAt: i => ({ node, index: residents.indexAt(i) }) };
  const outside = [{ node, index: 0 }, { node, index: 5 }], collapsed = new Set(['inside:home', 'residents:home']);
  let scans = 0;
  const render = () => panel.buildingPopulationRows(node, residents, inside, new Map(), '', () => { scans++; return ''; }, { outside, collapsed });
  let rows = render();
  assert.deepEqual(rows.filter(r => r.type === 'header').map(r => [r.sectionId, r.collapsed]), [
    ['inside:home', true], ['outside:home', false], ['residents:home', true],
  ]);
  assert.deepEqual(rows.filter(r => r.type === 'person').map(r => r.index), [0, 5]);
  collapsed.add('outside:home');
  rows = render();
  assert.equal(rows.length, 3, 'all collapsed headers remain available for expansion');
  assert.equal(scans, 0);
  collapsed.delete('residents:home');
  assert.equal(render().filter(r => r.type === 'person').length, panel.PAGE_SIZE);
});

test('building header presses toggle only their section and clear stale shared hover', () => {
  const filter = { collapsed: new Set(['inside:home']) }, rows = [{ type: 'header', sectionId: 'outside:home' }];
  const calls = [];
  const ctx = context(['onPopPress'], {
    popState: { homeFilter: filter, rows, pressStamp: 0 }, popRowFromTarget: () => 0,
    popPersonDoublePress: () => false, popSetHoverRow: row => calls.push(row),
    popRecomputeRows: () => calls.push('rows'), popRender: () => calls.push('render'),
  });
  ctx.onPopPress({ button: 0, target: {} });
  assert.ok(filter.collapsed.has('outside:home'));
  assert.ok(filter.collapsed.has('inside:home'));
  assert.deepEqual(calls, [null, 'rows', 'render']);
  ctx.popState.pressStamp = 0;
  ctx.onPopPress({ button: 0, target: {} });
  assert.ok(!filter.collapsed.has('outside:home'));
});

test('opening a building initializes every minimizable row group collapsed', () => {
  const node = { id: 'home', label: 'Docks' };
  const ctx = context(['popSelectBuilding'], {
    popState: { open: true, nodeIndex: new Map([['home', node]]) }, popRefreshModel() {},
    popIconKey: () => ({ nodeId: 'home' }), popClearSearch() {}, popSelect() {},
    popRecomputeRows() {}, popRender() {}, requestViewApply() {},
  });
  assert.equal(ctx.popSelectBuilding({ item: {}, building: { sourceIndex: 2 }, entry: {} }), true);
  const rows = panel.buildingPopulationRows(node, { count: 100_000_000 }, { count: 100_000_000 },
    new Map(), '', () => { throw new Error('collapsed groups must not scan people'); },
    { outside: [{ node, index: 0 }], collapsed: ctx.popState.homeFilter.collapsed });
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.type === 'header' && row.collapsed));
});

const stroke = (x1, y1, x2, y2, clear) => ({ x1, y1, x2, y2, clear });
test('creek crossings require continuous road coverage over the full wet stroke, not just its centre', () => {
  const a = { x: -10, y: 0 }, b = { x: 10, y: 0 }, creek = stroke(0, -10, 0, 10, 1);
  assert.equal(town.walkCreekAllowed(a, b, [creek], []), false);
  assert.equal(town.walkCreekAllowed(a, b, [creek], [stroke(-10, 0, 10, 0, 0.1)]), true);
  assert.equal(town.walkCreekAllowed(a, b, [creek], [stroke(-0.2, 0, 0.2, 0, 0.1)]), false, 'tiny road at the centre cannot authorize the banks');
  assert.equal(town.walkCreekAllowed(a, b, [creek], [stroke(-10, 2, 10, 2, 0.2)]), false, 'nearby parallel road does not help');
  assert.equal(town.walkCreekAllowed(a, b, [creek], [stroke(-10, 0, 0, 0, 0.1), stroke(0, 0, 10, 0, 0.1)]), true, 'joined road strokes cover the crossing');
  assert.equal(town.walkCreekAllowed({ x: 0.5, y: -8 }, { x: 0.5, y: 8 }, [creek], []), false, 'cannot walk along the creek without crossing its centreline');
  assert.equal(town.walkCreekAllowed({ x: 2, y: -8 }, { x: 2, y: 8 }, [creek], []), true);
  assert.equal(town.walkCreekAllowed({ x: -2, y: 10.5 }, { x: 2, y: 10.5 }, [creek], []), false, 'round-capped stream ends also block');
  assert.equal(town.walkCreekAllowed(a, a, [creek], []), true, 'stationary door duplicates are harmless');
});

test('commanded off-network target legs cannot bypass the creek-crossing restriction', () => {
  const creek = stroke(0, -10, 0, 10, 0.1), a = { x: -1, y: 0 }, b = { x: 1, y: 0 };
  const graph = { nodes: [a], edgeAllowed: (a, b) => town.walkCreekAllowed(a, b, [creek], []) };
  const walker = { ...a, node: 0, speed: 10, cmd: { route: [0], ...b } };
  town.stepCommanded(walker, graph, 1);
  assert.equal(walker.cmd.blocked, true);
  assert.equal(walker.x, -1);
  assert.ok(!walker.cmd.arrived);
  town.stepCommanded(walker, graph, 1);
  assert.equal(walker.x, -1, 'a repeated simulation tick cannot retry the forbidden direct fallback');
  const allowed = { nodes: [a], edgeAllowed: (a, b) => town.walkCreekAllowed(a, b, [creek], [stroke(-2, 0, 2, 0, 0.1)]) };
  const commuter = { ...a, node: 0, speed: 10, cmd: { route: [0], ...b } };
  town.stepCommanded(commuter, allowed, 1);
  assert.equal(commuter.cmd.arrived, true);
  assert.equal(commuter.x, 1);
});

function pinContext(limit = 40) {
  const node = { id: 'home', label: 'Court', tile: 2, total: 4 };
  const members = [
    { id: '0:0', index: 0, gen: 0, parents: [], spouse: '1:0', children: ['2:1', '3:0'], deathTurn: 2 },
    { id: '1:0', index: 1, gen: 0, parents: [], spouse: '0:0', children: ['2:1', '3:0'] },
    { id: '2:1', index: 2, gen: 1, parents: ['0:0', '1:0'], children: [], spouse: null },
    { id: '3:0', index: 3, gen: 0, parents: ['0:0', '1:0'], children: [], spouse: null },
  ];
  const data = { members: new Map(members.map(member => [member.id, member])) };
  let saved = [], refreshes = 0, notices = 0;
  const ctx = context(['popLivingFamily', 'popFamilyRows', 'popToggleFamilyPins', 'popPinRecord', 'popPins', 'popSavePins', 'popPinsChanged', 'popIsPinned', 'syncFamilyPin', 'popPinButtonHtml'], {
    popState: { tree: [], nodeIndex: new Map([[node.id, node]]), pins: [], pinKeys: new Set() },
    familyState: { open: true, nodeId: node.id, index: 1, gen: 0 }, leadState: { open: true },
    popFamilyData: () => data, popPerson: (node, i) => ({ name: `Person ${i}`, gender: 'female', occupation: 'Courtier', life: { state: { gen: i === 2 ? 1 : 0 } } }),
    popFollowMatches: () => false, popStopFollow() {}, leadRender() {}, popRecomputeRows() {}, popRender() {},
    refreshPinnedWalkers() { refreshes++; }, cmdToast() { notices++; }, MAX_PINS: limit, pos: 3, playing: false, els: {}, ps: n => n, escHtml: String, POP_PIN_ICON: '',
    viewSave(key, produce) { saved = structuredClone(produce()); }, viewRead: () => saved,
  });
  return { ctx, node, saved: () => saved, refreshes: () => refreshes, notices: () => notices };
}

test('family pin toggle includes every living relative once, excludes deceased ancestors, saves and unpins as a batch', () => {
  const fixture = pinContext(), { ctx } = fixture;
  assert.equal(ctx.popToggleFamilyPins(), true);
  assert.deepEqual(Array.from(ctx.popState.pins, pin => pin.index).sort(), [1, 2, 3]);
  assert.equal(fixture.refreshes(), 1);
  assert.equal(fixture.saved().length, 3);
  const saved = fixture.saved();
  ctx.popState.pins = null;
  assert.deepEqual(Array.from(ctx.popPins(), pin => pin.key), saved.map(pin => pin.key), 'existing pin persistence reloads the whole family');
  assert.equal(ctx.popToggleFamilyPins(), true);
  assert.equal(ctx.popState.pins.length, 0);
  assert.equal(ctx.popState.pinKeys.size, 0);
  assert.equal(fixture.refreshes(), 2);
});

test('family pinning preflights capacity atomically and replaces stale slot-generation pins without duplication', () => {
  const fixture = pinContext(3), { ctx } = fixture;
  ctx.popState.pins.push({ key: 'other#0', gen: 0 });
  ctx.popState.pinKeys.add('other#0');
  assert.equal(ctx.popToggleFamilyPins(), false);
  assert.equal(ctx.popState.pins.length, 1, 'no partial family pinning when slots are exhausted');
  assert.equal(fixture.notices(), 1);
  assert.equal(fixture.refreshes(), 0);
  ctx.popState.pins = [{ key: 'home#2', gen: 0 }];
  ctx.popState.pinKeys = new Set(['home#2']);
  assert.equal(ctx.popToggleFamilyPins(), true);
  assert.equal(ctx.popState.pins.length, 3);
  assert.equal(ctx.popState.pins.find(pin => pin.key === 'home#2').gen, 1, 'a dead predecessor does not count as a pinned living relative');
  const attrs = {}, button = { innerHTML: '', setAttribute(k, v) { attrs[k] = v; } };
  ctx.els.familyPin = button;
  ctx.syncFamilyPin();
  assert.equal(attrs['aria-label'], 'Unpin all living family members (3)');
  assert.equal(button.disabled, false);
});

test('Leaders keeps all pinned people in an independently collapsible section on every civ tab', () => {
  const own = { id: 'a', label: 'Farm', icon: { owner: 1 } }, foreign = { id: 'b', label: 'Market', icon: { owner: 2 } };
  const pins = [
    { type: 'pin', node: own, index: 10, pin: { key: 'a#10', gen: 0, name: 'Farmer' } },
    { type: 'pin', node: foreign, index: 4, pin: { key: 'b#4', gen: 0, name: 'Trader' } },
    { type: 'pin', node: null, index: 1, pin: { key: 'gone#1', gen: 0, name: 'Past Person' } },
  ];
  const state = { open: true, tab: 'own', rows: [], pins: [], start: 0, expanded: new Set() };
  const ctx = context(['leadSectionRows', 'leadRender', 'leadPinnedFromTarget'], {
    leadState: state, LEAD_ROWS_SHOWN: 18, LEAD_HOME_NAMES: {}, ps: n => n, escHtml: String,
    els: { leadPanel: {}, leadRows: { innerHTML: '' }, leadInfo: {} },
    popPinnedRows: () => pins, popPinStatus: row => row.node ? '' : 'Died',
    popPersonRowHtml: row => `<div>${row.pin.name}</div>`, popPinButtonHtml: () => 'pin', popFollowButtonHtml: () => '',
    popSyncPersonHighlights() {}, formatThousands: String,
  });
  ctx.leadRender();
  assert.match(ctx.els.leadRows.innerHTML, /Pinned people/);
  assert.doesNotMatch(ctx.els.leadRows.innerHTML, /Farmer|Trader|Past Person/);
  state.expanded.add('pinned');
  for (const tab of ['own', 'met', 'all']) {
    state.tab = tab; ctx.leadRender();
    assert.match(ctx.els.leadRows.innerHTML, /Farmer/);
    assert.match(ctx.els.leadRows.innerHTML, /Trader/);
    assert.match(ctx.els.leadRows.innerHTML, /Past Person - Died/);
  }
  const target = { parentNode: null, getAttribute: name => name === 'data-lead-pin' ? '1' : null };
  assert.equal(ctx.leadPinnedFromTarget(target), pins[1], 'pinned nonleaders retain their own action identity');
  state.expanded.delete('pinned'); ctx.leadRender();
  assert.match(ctx.els.leadRows.innerHTML, /Pinned people/);
  assert.doesNotMatch(ctx.els.leadRows.innerHTML, /Farmer|Trader|Past Person/);
});

function workplaceContext() {
  const home = (id, tile, category, owner = 1) => ({ id, tile, kind: 'icon', iconKind: 'building', label: id, total: 100_000_000, icon: { category, owner } });
  const origin = home('home', 0, 'home'), workshop = home('workshop', 1, 'workshop'), shrine = home('shrine', 1, 'shrine'), hostile = home('hostile', 0, 'workshop', 2);
  const roof = (sourceIndex, form, group) => ({ sourceIndex, form, group, name: `${form} ${sourceIndex}` });
  const workEntry = { pathKey: 'work', item: { nodeId: 'workshop' }, final: [roof(0, 'house', 'house'), roof(1, 'factory', 'industry'), roof(2, 'factory', 'industry')] };
  const shrineEntry = { pathKey: 'temple', item: { nodeId: 'shrine' }, final: [roof(0, 'house', 'house'), roof(1, 'temple', 'sacred')] };
  const world = { key: 'scene', graph: { doorBuildings: new Map([[10, { pathKey: 'work', sourceIndex: 1 }], [11, { pathKey: 'work', sourceIndex: 2 }]]) },
    parts: new Map([['work', { entry: workEntry }], ['temple', { entry: shrineEntry }]]) };
  const ctx = context(['popWorkplace', 'walkerWorkNode'], {
    workplaceState: { index: null, tiles: new Map(), plans: new Map(), entries: new Map(), doors: new Map(), world: null },
    popState: { builtKey: 'turn1', nodeIndex: new Map([origin, workshop, shrine, hostile].map(node => [node.id, node])) },
    neighborsByIndex: [[1], [0]], townWorld: world, popIconKey: item => ({ nodeId: item.nodeId }), popRefreshModel() {},
    popNodePlan: () => ({ occupationOf: i => i % 2 ? 'Priest' : 'Smith' }),
    hashString: s => [...s].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7),
  });
  return { ctx, origin, workshop, workEntry, world };
}

test('every person gets a deterministic nearby same-civ workplace matching their trade without population arrays', () => {
  const { ctx, origin, workshop } = workplaceContext();
  const before = origin.total, assigned = new Set();
  for (const id of [0, 2, 4, 10_000_000, 99_999_998]) {
    const work = ctx.popWorkplace(origin, id);
    assert.equal(work.node, workshop, 'nearby workshop beats the home and the foreign workshop');
    assert.equal(work.building.form, 'factory');
    assert.equal(ctx.popWorkplace(origin, id).building, work.building);
    assigned.add(work.building.sourceIndex);
  }
  assert.equal(assigned.size, 2, 'arithmetic slot assignment distributes workers among suitable roofs');
  assert.equal(ctx.popWorkplace(origin, 1).building.form, 'temple', 'a priest works in the nearby shrine');
  assert.equal(origin.total, before);
  assert.equal(ctx.workplaceState.plans.size, 2, 'cache is per home and occupation family, not per person');
  assert.equal(ctx.popState.nodeIndex.size, 4);
});

test('workplace assignment survives camera changes without retaining unloaded town geometry', () => {
  const { ctx, origin, world } = workplaceContext();
  const work = ctx.popWorkplace(origin, 2), person = { id: 2 };
  const door = ctx.walkerWorkNode({ nodeId: origin.id }, person);
  assert.ok(door === 10 || door === 11);
  assert.equal(world.graph.doorBuildings.get(door).sourceIndex, work.building.sourceIndex);
  ctx.townWorld = { key: 'panned', graph: { doorBuildings: new Map() }, parts: new Map() };
  const away = ctx.popWorkplace(origin, 2);
  assert.equal(away.node, work.node, 'panning away does not reassign the job');
  assert.equal(away.building, null);
  assert.equal(ctx.workplaceState.entries.size, 0, 'old scene geometry is not retained by workplace lookups');
  assert.equal(ctx.walkerWorkNode({ nodeId: origin.id }, person), -1, 'an unloaded workplace does not point at an unrelated graph node');
  ctx.townWorld = world;
  assert.equal(ctx.walkerWorkNode({ nodeId: origin.id }, person), door);
  ctx.workplaceState.entries.clear(); ctx.workplaceState.world = world;
  const unloaded = ctx.popWorkplace(origin, 2);
  assert.equal(unloaded.node.id, 'workshop');
  assert.equal(unloaded.building, null);
  assert.match(unloaded.label, /townscape not loaded/, 'unrendered buildings are reported explicitly');
});

test('townscape vegetation keeps bounded density while decoration sizes use the physical map scale', () => {
  assert.match(source, /const TOWN_TREE_SCALE = 0\.002/);
  assert.ok(Math.abs(0.002 / 0.04 - 1 / 20) < 1e-12);
  const entry = { center: { x: 0, y: 0 }, radius: 25, pathKey: 'density' };
  const ctx = context(['townDecoPlacements'], { hexW: 100, hashString: () => 73, isWaterAt: () => false });
  const placed = ctx.townDecoPlacements(entry, new town.DecorationIndex(1));
  assert.equal(entry.decoCandidates.length, 10400, 'four times the original 2600 candidates for this radius');
  assert.equal(placed[0].unit * 100 * 5280 / ctx.hexW, 1, 'one map-unit conversion per foot');
  assert.ok(placed.length > 2000, 'smaller footprints retain substantially more detail');
  const featureStyle = { 1: ['green|lightgreen', 'forest', 'tree', 160] };
  const trees = context(['pushDecorMarkers'], {
    detailD: 4, hexW: 100, MAX_DECOR_SHAPES: 5000, TREE_KINDS: new Set(['forest']),
    decorCache: { key: '' }, terrain: [5], FEATURE_STYLES: featureStyle,
    basePos: [{ x: 0, y: 0 }], mapFeatureCliffs: [], townscapeActive: () => true, decorViewRect: () => null,
  });
  const dots = [], features = new Map([[0, 1]]);
  trees.pushDecorMarkers(dots, null, features, 10, 3, 44);
  assert.equal(dots.length, 1280, 'twice the old 640 small trees on a forest tile');
  trees.townscapeActive = () => false;
  const normal = [];
  trees.pushDecorMarkers(normal, null, features, 10, 3, 44);
  assert.equal(normal.length, 640, 'zoomed-out forests retain their previous density');
});
