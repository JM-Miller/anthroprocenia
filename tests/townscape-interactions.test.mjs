import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
test('map input handlers are defined in the intact module scope', () => {
  const exports = ['selectFlagUnit', 'unitIconClickActive', 'selectMapUnitIcon', 'mapUnitIconAt',
    'mapUnitIconInput', 'onUnitIconConsumedClick', 'onMapDragStart', 'onPopPress', 'personAt',
    'syncTownCompass', 'syncWalkerHeadwear', 'leadHomeName', 'syncRouteWidths', 'townLinkTile',
    'timelineRowsHtml', 'buildWalkerControls', 'peopleHeadwearPaths', 'townCompassState',
    'syncTownElementVisibility', 'visibilityToggleGrid', 'townElementVisibility', 'TOWN_ELEMENT_OPTIONS',
    'skipAheadSnapshot', 'toggleSkipAhead', 'sharedTerritoryClaim', 'territoryClip', 'splitTerritoryFill',
    'syncCivNotices', 'civTimelineExtras', 'drawMapDetails', 'syncUnitHighlights', 'buildMapScaleControls',
    'worldTimelineRowsHtml', 'syncWorldTimeline', 'buildWorldTimelineUi', 'toggleMapHistory', 'resetWorldTimeline', 'worldTimelineEventAt', 'normalizeCountryName',
    'syncWorldScrollbar', 'buildWorldScrollbar', 'syncWorldTimelineHighlights', 'syncMapSvgViewport', 'syncHistoryFocus', 'syncMapDetailVisibility'];
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '-e',
    "new (require('node:vm').SourceTextModule)(require('node:fs').readFileSync(0,'utf8'));"],
  { input: `${source}\nexport { ${exports.join(', ')} };`, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
test('the intact playback module initializes state, exposes Map View and attaches its HUD control on DOM ready', () => {
  const result = spawnSync(process.execPath, ['--max-old-space-size=96', '--experimental-vm-modules', '-e', `
    const vm = require('node:vm'), assert = require('node:assert/strict');
    const source = require('node:fs').readFileSync(0, 'utf8');
    (async () => {
      const { loadModule } = await import(${JSON.stringify(new URL('./load.mjs', import.meta.url).href)});
      const hooks = [], ready = [], errors = [], nodes = new Map();
      const element = () => ({ nodeType: 1, childNodes: [], style: {}, classList: { add() {} }, setAttribute() {}, addEventListener() {},
        appendChild(child) { this.childNodes.push(child); child.parentNode = this; if (child.id) nodes.set(child.id, child); } });
      const document = { body: null, head: element(), getElementById: id => nodes.get(id), createElement: element,
        querySelector: selector => selector === '.mini-map__image' ? { getBoundingClientRect: () => ({ width: 200, height: 100 }) } : null,
        querySelectorAll: () => [], addEventListener(name, fn) { hooks.push(name); if (name === 'DOMContentLoaded') ready.push(fn); } };
      const window = { addEventListener: name => hooks.push(name), innerWidth: 1920, innerHeight: 1080 };
      const context = vm.createContext({ document, window, setTimeout: () => 1, setInterval: () => 1,
        clearTimeout() {}, clearInterval() {}, engine: { on: name => hooks.push(name) },
        GameInfo: { Civilizations: [{ CivilizationType: 'CIVILIZATION_ROME', Name: 'Rome', Adjective: 'Roman' }] },
        UI: { isInGame: () => true },
        MutationObserver: class { observe() {} disconnect() {} },
        console: { warn() {}, error: message => errors.push(message) } });
      const imports = new Map([...source.matchAll(/import ([^\\n]+?) from '([^']+)'/g)]
        .map(([, names, path]) => [path, names]));
      const modules = new Map();
      const playback = new vm.SourceTextModule(source, { context });
      await playback.link(async path => {
        if (modules.has(path)) return modules.get(path);
        let exports;
        if (path.startsWith('./')) exports = await loadModule(path.slice(2));
        else {
          const names = imports.get(path);
          exports = names.startsWith('{')
            ? Object.fromEntries(names.slice(1, -1).split(',').map(name => [name.trim(), {}]))
            : { default: {} };
        }
        const module = new vm.SyntheticModule(Object.keys(exports), function () {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        }, { context });
        modules.set(path, module); return module;
      });
      await playback.evaluate();
      assert.equal(typeof window.AnthroproceniaReplay.show, 'function');
      assert.equal(typeof window.AnthroproceniaReplay.hide, 'function');
      assert.equal(window.AnthroproceniaReplay.isVisible(), false);
      assert.ok(hooks.includes('loading-start-curtain-removed'));
      assert.ok(hooks.includes('DOMContentLoaded'));
      document.body = element(); for (const callback of ready) callback();
      assert.ok(document.getElementById('anthroprocenia-map-hud-button'));
      assert.equal(document.getElementById('anthroprocenia-map-hud-ring').style.visibility, 'visible');
      assert.deepEqual(errors, []);
    })().catch(error => { console.error(error.stack); process.exitCode = 1; });
  `], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
const panel = await loadModule('anthroprocenia-population-panel.js');
const town = await loadModule('anthroprocenia-townscape.js');
const links = await loadModule('anthroprocenia-townlinks.js');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
}
function context(functions, state) {
  const ctx = vm.createContext({ ...panel, lastMapInputTs: 0, townPaths: null, ...state });
  if (!functions.includes('townHousingFor')) functions = ['townHousingFor', ...functions];
  vm.runInContext(functions.map(slice).join('\n'), ctx);
  return ctx;
}

test('unit circle selection owns both DOM and native click routes without selecting twice or falling through', () => {
  let time = 1000, selected = 0, flag = true, icons = false;
  const surface = {}, point = { x: 50, y: 50 }, item = { kind: 'unit', owner: 0 };
  const ctx = context(['mapGamepadAction', 'mapUnitIconAt', 'mapUnitIconInput', 'selectMapUnitIcon', 'unitIconClickActive', 'onUnitIconConsumedClick', 'onMapDragStart'], {
    unitIconPress: { time: -Infinity }, Date: { now: () => time }, ps: n => n,
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false }, els: {}, mapDrag: null,
    Cursor: { position: point }, InputActionStatuses: { START: 0, FINISH: 2 },
    document: { body: surface, documentElement: {}, elementFromPoint: () => surface },
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false,
    gameOverlayActive: () => false, mapUiInput: () => false, personClickActive: () => false,
    cmdInputActive: () => false, townscapeActive: () => false, peopleActive: () => false,
    flagsActive: () => !icons, flagAt: () => flag ? { item } : null,
    iconModeActive: () => icons, iconAt: () => flag ? { item } : null,
    measureArea: () => ({}), pointInRect: () => true, expansionWorldTarget: () => true, overControlPanels: () => false,
    selectFlagUnit: () => selected++, hexAt: () => 1, localCityAt: () => 'city beneath the unit',
    selectMapCity: () => false, mapCameraAction: () => false, lastMapDragEnd: -Infinity,
    InterfaceMode: { getCurrent: () => 'INTERFACEMODE_UNIT_SELECTED' },
    err: message => assert.fail(message),
  });
  const native = status => ({
    detail: { name: 'mousebutton-left', status },
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; },
  });
  const dom = () => ({
    button: 0, target: surface, clientX: 50, clientY: 50,
    preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; },
  });
  for (const useIcons of [false, true]) {
    icons = useIcons; time += 1000;
    const start = native(0); ctx.mapGamepadAction(start);
    assert.equal(start.stopped, true, 'the native world does not process the initial press');
    const count = selected;
    ctx.onMapDragStart(dom());
    const finish = native(2); ctx.mapGamepadAction(finish);
    assert.equal(finish.stopped, true);
    assert.equal(selected, count + 1, 'one unit selection for the complete gesture');
    const release = dom(); ctx.onUnitIconConsumedClick(release);
    assert.equal(release.stopped, true, 'DOM release cannot deselect the chosen unit');
    assert.equal(ctx.mapDrag, null, 'the press cannot become a city click or drag');
  }
  time += 1000;
  const finishOnly = native(2); ctx.mapGamepadAction(finishOnly);
  assert.equal(finishOnly.stopped, true, 'native-only/controller clicks also select');
  assert.equal(selected, 3);
  flag = false; point.x = 100;
  const background = native(2); ctx.mapGamepadAction(background);
  assert.equal(background.defaultPrevented, undefined, 'a different world click retains normal native behavior');
});

test('townscape zoom blocks all plain city click routes and deferred item UI while preserving plot placement', () => {
  let townscape = true, cities = 0, timers = 0, placements = 0;
  const ctx = context(['selectMapCity', 'openItemUi', 'mapGamepadAction'], {
    gameOverlayActive: () => false, mapUiInput: () => false,
    townscapeActive: () => townscape, cmdInputActive: () => false, personClickActive: () => false,
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false }, mapDrag: null, els: {},
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false,
    prepareExpansionSelection: () => placements++, setTimeout: () => timers++,
    hexAt: () => 1, localCityAt: () => 'city', lastMapCitySelection: { index: -1, time: 0 },
    Date: { now: () => 3000 }, frames: [], nowMs: () => 0,
    UI: { Player: { selectCity: () => cities++ } }, err: e => assert.fail(e),
  });
  assert.equal(ctx.selectMapCity(5, 5), false);
  ctx.openItemUi({ kind: 'building' });
  assert.equal(timers, 0, 'no deferred city-opening callback is queued at townscape zoom');
  for (const status of [0, 1, 2]) {
    const e = { detail: { name: 'mousebutton-left', status }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    ctx.mapGamepadAction(e);
    assert.equal(e.prevented, true);
    assert.equal(e.stopped, true);
  }
  assert.equal(cities, 0);
  ctx.mapPlotSelectionActive = () => true;
  ctx.mapGamepadAction({ detail: { name: 'mousebutton-left' } });
  assert.equal(placements, 1);
  townscape = false;
  assert.equal(ctx.selectMapCity(5, 5), true);
  assert.equal(cities, 1);
});

test('walker tooltips include the live current action in close and single-member crowd views', () => {
  const person = { key: 'home#0', id: 0, cmd: { label: 'Load supplies', place: 'Harbor' } };
  const group = { nodeId: 'home', owner: 1 };
  const ctx = context(['personTipText', 'popLifeLines', 'personActionText', 'crowdTipText'], {
    personProfileFor: () => ({ name: 'Ada Harbor', gender: 'female', occupation: 'Sailor', years: 31, ageCategory: 'Adult', life: { state: {}, turn: 4 } }),
    townWorld: { graph: {} }, RAW_MARK: '', escHtml: s => s,
    popIsPinned: () => false, cmdLiveTurn: () => false, cmdState: { chosen: new Set() }, err: e => assert.fail(e),
    popState: { nodeIndex: new Map([['home', {}]]) }, popRefreshModel() {}, popWorkplace: () => ({ label: 'Harbor' }),
  });
  const text = ctx.personTipText({ person, group });
  for (const field of ['Ada Harbor', 'Gender: Female', 'Age: 31 (Adult)', 'Occupation: Sailor']) assert.ok(text.includes(field), field);
  assert.ok(text.includes('Action: Traveling to Harbor: Load supplies'));
  const marker = { members: [person], clump: { group } };
  assert.equal(ctx.crowdTipText(marker), text, 'one-person coarse dots show the same current action');
  person.cmd.arrived = true;
  assert.ok(ctx.crowdTipText(marker).includes('Action: Command at Harbor: Load supplies'));
  person.cmd.blocked = true;
  assert.ok(ctx.crowdTipText(marker).includes('Action: Blocked on the way to Harbor: Load supplies'));
  marker.members.push({ key: 'home#1', id: 1 });
  assert.match(ctx.crowdTipText(marker), /^Walker Group: 2 people/);
  marker.clump.military = true;
  assert.match(ctx.crowdTipText(marker), /^Military Formation: 2 people/);
});

test('zoom immediately hides civ-coloured shapes without hiding the map input surface, then restores zoomed-out markers', () => {
  let visible = true, parked = 0;
  const paths = { outer: { style: {} }, inner: { style: {} } }, input = { style: { display: 'none' } };
  const ctx = context(['syncTownscapes'], {
    syncMapLabelVisibility() {}, syncTownVisibility() {}, townRender: { timer: 0 },
    terrainMarkerPaths: new Map([['primary|secondary', paths]]), unitDom: { el: input }, unitSlots: [{}],
    parkSlot: () => parked++, townscapeActive: () => visible, dotDom: { el: { style: {} } }, wonDom: { el: { style: {} } },
    mapVisible: true, showWonders: true, bgLayer: {}, townLayer: null,
    townDecoScene: { key: '', placements: [], rect: null }, townKey: '', townPanScene: { key: '' },
    hideTownLabels() {}, setTownHighlight() {}, stopPeople() {}, townDecoActive: () => false,
  });
  ctx.syncTownscapes();
  assert.equal(input.style.display, '');
  assert.equal(paths.outer.style.display, 'none');
  assert.equal(paths.inner.style.display, 'none');
  assert.equal(parked, 1);
  visible = false;
  ctx.syncTownscapes();
  assert.equal(paths.outer.style.display, '');
  assert.equal(paths.inner.style.display, '');
  assert.equal(input.style.display, '');
});

test('map hover reaches walker and roof tooltips through the preserved transparent input surface', () => {
  let person = true, building = true;
  const tip = { style: {}, innerHTML: '' }, surface = { hasAttribute: key => key === 'data-pointer-passthrough' };
  const ctx = context(['onMapHoverInner'], {
    mapVisible: true, mapRoot: {}, LeaderModelManager: { isLeaderShowing: false }, mapDrag: null,
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false,
    InterfaceMode: { getCurrent: () => '' }, popPanelContains: () => false, fogLocked: false,
    overControlPanels: () => false, gameOverlayActive: () => false, document: { body: {}, documentElement: {} },
    flagsActive: () => false, clumpAt: () => null, iconModeActive: () => true, hideHoverOutline() {}, peopleActive: () => true,
    personAt: () => person ? { group: { nodeId: 'home', entry: { item: { index: 1 } } }, person: { key: 'home#0' } } : null,
    popHoverFor: () => ({ tile: 1 }), hideIconRing() {}, updateAttackArrow() {},
    personTipText: () => 'Ada / Female / 31 / Sailor', townscapeActive: () => true,
    townBuildingAt: () => building ? { item: { index: 1 }, building: { name: 'Dockhouse' } } : null,
    iconAt: () => null, townHomeAt: () => null, townLocationTipText: () => 'Dockhouse',
    setTownHighlight() {}, townHoverKeep: false, popHoverNext: null, lastTipText: '', lastHoverIdx: -2,
    ensureTip: () => tip, tipHtml: s => s, HB: { tips: 0 }, positionTip() {},
  });
  const event = { clientX: 10, clientY: 10, target: surface };
  ctx.onMapHoverInner(event);
  assert.equal(tip.style.display, 'block');
  assert.equal(tip.innerHTML, 'Ada / Female / 31 / Sailor');
  person = false;
  ctx.onMapHoverInner(event);
  assert.equal(tip.innerHTML, 'Dockhouse');
  assert.match(slice('syncTownscapes'), /unitDom.el.style.display = ''/);
  assert.match(slice('syncTownscapes'), /paths.outer.style.display = paths.inner.style.display = display/);
});

test('all resident IDs belong to exactly one roof, stay stable across reloads, and page without population-sized arrays', () => {
  for (let total = 0; total <= 40; total++) for (let roofs = 1; roofs < 10; roofs++) {
    const seen = new Set();
    for (let slot = 0; slot < roofs; slot++) {
      const residents = panel.buildingResidents(total, slot, roofs);
      for (let i = 0; i < residents.count; i++) {
        const id = residents.indexAt(i);
        assert.ok(!seen.has(id) && residents.includes(id));
        seen.add(id);
      }
    }
    assert.equal(seen.size, total);
  }
  const node = { id: 'home', label: 'Docks', total: 100_000_000 };
  const residents = panel.buildingResidents(node.total, 2, 5), again = panel.buildingResidents(node.total, 2, 5);
  assert.equal(residents.count, 20_000_000);
  assert.equal(residents.indexAt(10_000_000), again.indexAt(10_000_000));
  const indoors = panel.buildingResidents(node.total, 2, 5, [2, 7, 17, 7, -1, node.total]);
  assert.equal(indoors.count, residents.count - 3);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => indoors.indexAt(i)), [12, 22, 27, 32, 37]);
  const inside = { count: indoors.count, rowAt: i => ({ node, index: indoors.indexAt(i) }) };
  const shown = new Map(), rows = panel.buildingPopulationRows(node, residents, inside, shown);
  assert.equal(rows.filter(r => r.type === 'person').length, 2 * panel.PAGE_SIZE);
  assert.equal(rows.filter(r => r.type === 'more').length, 2);
  panel.showMore(shown, `residents:${node.id}`);
  const more = panel.buildingPopulationRows(node, residents, inside, shown);
  assert.equal(more.filter(r => r.type === 'person').length, 3 * panel.PAGE_SIZE);
});

test('selected roofs show live residents and occupants, including visiting walkers from other Home Locations', () => {
  const home = { id: 'home', kind: 'icon', label: 'Docks', total: 10 }, guestHome = { id: 'guest', kind: 'icon', label: 'Market', total: 3 };
  const entry = { pathKey: 'dock', polys: [{ sourceIndex: 0 }, { sourceIndex: 1 }] };
  const resident = (id, node, inside) => ({ id, node, inside, key: `home#${id}` });
  const live = [
    { entry, nodeId: 'home', people: [resident(0, 10, true), resident(2, 11, false), resident(1, 10, true), resident(4, 11, true)] },
    { entry: { pathKey: 'market' }, nodeId: 'guest', people: [{ id: 0, node: 10, inside: true, key: 'guest#0' }] },
  ];
  const filter = { nodeId: 'home', sourceIndex: 0, entry };
  const ctx = context(['popBuildingRows', 'popRefreshBuilding'], {
    ...panel, popFilteredTree: () => [home], personBaseId: s => s,
    popState: { homeFilter: filter, nodeIndex: new Map([['home', home], ['guest', guestHome]]), shown: new Map(), search: '', open: true },
    townWalkers: new Map(live.map((g, i) => [i, g])),
    townWorld: { graph: { doorBuildings: new Map([[10, { pathKey: 'dock', sourceIndex: 0 }], [11, { pathKey: 'dock', sourceIndex: 1 }]]) } },
    popPerson: () => ({ name: 'Ada', gender: 'female', years: 31, occupation: 'Sailor' }), popRender: () => renders++,
  });
  let renders = 0;
  let rows = ctx.popBuildingRows();
  const headers = rows.filter(r => r.type === 'header');
  assert.equal(headers[0].label, 'Currently inside (5)');
  assert.equal(headers[1].label, 'Currently outside (1)');
  assert.equal(headers[2].label, 'Lives here (5)');
  const firstSection = rows.slice(1, rows.indexOf(headers[1])).filter(r => r.type === 'person');
  assert.deepEqual(firstSection.map(r => `${r.node.id}#${r.index}`), ['home#0', 'home#6', 'home#8', 'home#1', 'guest#0']);
  const outside = rows.slice(rows.indexOf(headers[1]) + 1, rows.indexOf(headers[2])).filter(r => r.type === 'person');
  assert.deepEqual(outside.map(r => r.index), [2], 'residents visiting another building are not currently outside');
  const residents = rows.slice(rows.indexOf(headers[2]) + 1).filter(r => r.type === 'person').map(r => r.index);
  assert.deepEqual(residents, [0, 2, 4, 6, 8]);
  filter.refreshAt = 0;
  live[1].people[0].exiting = true;
  ctx.popRefreshBuilding(1000);
  assert.equal(filter.inside, 4);
  assert.equal(renders, 1);
  ctx.popRefreshBuilding(1200);
  assert.equal(renders, 1, 'no occupancy or row work more than twice per second');
  ctx.popRefreshBuilding(1600);
  assert.equal(renders, 1, 'unchanged occupancy does not rewrite the panel');
  live[0].people[3].inside = false;
  ctx.popRefreshBuilding(2200);
  assert.equal(filter.outside, 2, 'a resident leaving another building becomes currently outside');
  assert.equal(renders, 2, 'outside-only changes refresh the rows too');
  live[0].people[3].cmd = { dead: true };
  ctx.popRefreshBuilding(2800);
  assert.equal(filter.outside, 1, 'deceased commanded walkers are not listed as currently outside');
  live[1].people[0].exiting = false;
  ctx.popState.search = 'sailor';
  rows = ctx.popBuildingRows();
  assert.ok(rows.some(r => r.node === guestHome), 'search retains visitors instead of expanding to the whole home');
});

test('each roof gets its own door even when several buildings share the same nearest street', () => {
  const poly = [[1, 1], [2, 1], [2, 2], [1, 2]];
  const entry = { pathKey: 'home', center: { x: 0, y: 0 }, radius: 10,
    population: 10,
    shapes: { nodes: [[0, 0], [1, 0]], edges: [[0, 1]] }, obstacles: { circles: [], segments: [], roads: [] },
    final: [0, 1].map(sourceIndex => ({ sourceIndex, poly, box: { x0: 1, x1: 2, y0: 1, y1: 2 }, form: 'house' })) };
  const ctx = context(['buildWalkGraph', 'newWalker'], {
    ...town, hexW: 20, townPointBlocked: () => false, townSpots: () => [], popIsPinned: () => false,
  });
  const graph = ctx.buildWalkGraph(entry);
  assert.equal(graph.doorBuildings.size, 2);
  assert.notEqual(graph.destinations[0], graph.destinations[1]);
  entry.polys = entry.final;
  const group = { entry, nodeId: 'home', destinations: graph.destinations };
  const part = { offset: 0 }, a = ctx.newWalker(group, part, graph, 0, true, null), b = ctx.newWalker(group, part, graph, 1, true, null);
  assert.notEqual(a.home, b.home);
  assert.equal(graph.doorBuildings.get(a.node).sourceIndex, 0);
  assert.equal(graph.doorBuildings.get(b.node).sourceIndex, 1);
  assert.equal(ctx.newWalker(group, part, graph, 2, true, null).home, a.home);
});

test('a building click opens the real filtered panel, clearing restores all homes, and missing homes cannot leave stale occupants', () => {
  const home = { id: 'home', kind: 'icon', label: 'Docks', total: 10, children: [] };
  const other = { id: 'market', kind: 'icon', label: 'Market', total: 4, children: [] };
  const entry = { pathKey: 'town', polys: [{ sourceIndex: 0 }, { sourceIndex: 1 }] };
  const state = { open: false, tree: [home, other], nodeIndex: new Map([['home', home], ['market', other]]),
    expanded: new Set(), shown: new Map(), search: '', homeFilter: null, scroll: 50 };
  let renders = 0, requests = 0;
  const ctx = context(['popSelectBuilding', 'popBuildingRows', 'popRefreshBuilding', 'popFilteredTree', 'popRecomputeRows', 'popClearHomeFilter'], {
    ...panel, popState: state, townWalkers: new Map(), townWorld: null, personBaseId: s => s,
    togglePopulationPanel: () => { state.open = true; }, popRefreshModel() {}, popIconKey: () => ({ nodeId: 'home' }),
    popClearSearch: () => { state.search = ''; }, popSelect() {}, popPinnedRows: () => [], popSortOptions: () => ({}),
    popRender: () => renders++, townLabelSpecKey: 'old', requestViewApply: () => requests++, err: e => assert.fail(e),
  });
  assert.equal(ctx.popSelectBuilding({ item: {}, entry, building: { sourceIndex: 1, name: 'Named Roof' } }), true);
  assert.equal(state.open, true);
  assert.equal(state.homeFilter.name, 'Named Roof');
  assert.equal(state.homeFilter.residents, 5);
  assert.equal(state.homeFilter.inside, 5);
  assert.ok(state.rows.filter(r => r.type === 'person').every(r => r.node === home && r.index % 2 === 1));
  state.nodeIndex.delete('home');
  ctx.popRefreshBuilding(2000);
  assert.equal(state.homeFilter.inside, 0);
  assert.equal(state.homeFilter.residents, 0);
  assert.equal(state.rows.length, 1);
  assert.match(state.rows[0].label, /not present/);
  ctx.popClearHomeFilter();
  assert.equal(state.homeFilter, null);
  assert.equal(state.rows.filter(r => r.type === 'node').length, 2);
  assert.equal(requests, 2);
  assert.equal(renders, 3);
});

test('small pans reuse the exact town scene for 100 frames instead of rescanning icons and rebuilding walking networks', () => {
  let layouts = 0, scans = 0;
  const points = Array.from({ length: 1000 }, (_, i) => ({ x: i * 10, y: 0, s: 1, item: { kind: 'building' } }));
  const ctx = context(['townSceneEntries'], {
    pos: 1, frames: [0, 1], detailD: 4, hexW: 20, mapPxW: 10000,
    iconPoints: { *[Symbol.iterator]() { scans++; yield* points; } }, townPanScene: { key: '', rect: null, entries: [] },
    townscapeCached: p => { layouts++; return { pathKey: String(p.x) }; }, err: e => assert.fail(e),
  });
  const entries = ctx.townSceneEntries(0, 100, -20, 20);
  for (let i = 0; i < 100; i++) assert.equal(ctx.townSceneEntries(i / 10, 100 + i / 10, -20, 20), entries);
  assert.equal(scans, 1);
  assert.ok(layouts <= 24);
  ctx.townSceneEntries(1000, 1100, -20, 20);
  assert.equal(scans, 2);
  ctx.pos = 0;
  ctx.townSceneEntries(1000, 1100, -20, 20);
  assert.equal(scans, 3, 'turn changes invalidate the pan scene');
  ctx.townPanScene.key = '';
  ctx.townSceneEntries(1000, 1100, -20, 20);
  assert.equal(scans, 4, 'marker/fog redraws invalidate the scene too');
});

test('small pans translate cached labels without repeating line placement or collision work', () => {
  let pan = 0, placements = 0, featureBuilds = 0;
  const layer = { style: {}, appendChild() {} }, slots = [];
  const ctx = context(['syncTownLabels'], {
    showTownLabels: true, showSettlements: true, showBuildingLabels: true, showRiverNames: true, townLabelVisible: () => true,
    ensureTownLabelLayer() {}, townLabelLayer: layer, townLabelSlots: slots, townLabelPan: {},
    townLabelSpecKey: 'same', townKey: 'same', townLabelSpecs: [{ text: 'Docks', kind: 'home', pts: [], total: 0, rank: 0 }],
    townFeatureKey: '', townFeatureSpecs: [], buildFeatureLabelSpecs: () => { featureBuilds++; return []; },
    window: { innerWidth: 800, innerHeight: 600 }, viewZoom: 1, viewAspectY: 1, hexW: 20, hexH: 24, pos: 0,
    mapToScreen: (x, y) => ({ x: x + pan, y }), lineSpecPointAt: () => { placements++; return { x: 200, y: 100, dx: 1, dy: 0 }; },
    TOWN_LABEL_STYLE: { home: [13, '#fff', '700', 'normal'] }, MAX_TOWN_LABELS: 600, ps: n => n,
    document: { createElement: () => ({ style: {} }) },
  });
  ctx.syncTownLabels([], 0, 800, 0, 600);
  const count = placements;
  for (let i = 1; i <= 100; i++) { pan = i; ctx.syncTownLabels([], -i, 800 - i, 0, 600); }
  assert.equal(placements, count);
  assert.equal(featureBuilds, 0, 'non-townscape features are no longer redrawn at townscape zoom');
  assert.equal(layer.style.transform, 'translate(100.0px,0.0px)');
  ctx.townLabelSpecKey = '';
  ctx.buildTownLabelSpecs = () => [];
  ctx.townPlan = null;
  ctx.syncTownLabels([], -100, 700, 0, 600);
  assert.equal(layer.style.transform, '', 'selection invalidates cached label layout');
});

test('waterfront layouts reach their dry landing, keep roofs separate and reject overlapping neighboring decks', () => {
  const first = links.waterfrontLayout({ x: 0, y: 0 }, { x: 20, y: 0 }, 3, true);
  const allPoints = first.decks.flat();
  assert.ok(Math.min(...allPoints.map(p => p[0])) < 0, 'deck overlaps dry landing even when shore is far from town');
  assert.ok(links.deckEdgeAllowed({ x: 0, y: 0 }, { x: 20, y: 0 }, first.decks));
  for (let i = 0; i < first.buildings.length; i++) for (let j = i + 1; j < first.buildings.length; j++) {
    assert.equal(town.polygonsOverlap(first.buildings[i].poly, first.buildings[j].poly), false);
  }
  const entries = [
    { waterfront: first },
    { waterfront: links.waterfrontLayout({ x: 0, y: 0.1 }, { x: 20, y: 0.1 }, 3, true) },
    { waterfront: links.waterfrontLayout({ x: 0, y: 5 }, { x: 20, y: 5 }, 3, true) },
  ];
  const ctx = context(['townWaterfronts'], { ...town, hexW: 20 });
  const decks = ctx.townWaterfronts(entries);
  assert.equal(entries[0].waterfrontAccepted, true);
  assert.equal(entries[1].waterfrontAccepted, false);
  assert.equal(entries[2].waterfrontAccepted, true);
  for (const a of decks) for (const b of decks) if (a.entry !== b.entry) assert.equal(town.polygonsOverlap(a.poly, b.poly), false);
});
