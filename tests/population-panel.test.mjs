import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = file => readFile(new URL(`../anthroprocenia/ui/map/${file}`, import.meta.url), 'utf8');
import { loadModule as load } from './load.mjs';
const panel = await load('anthroprocenia-population-panel.js');
const { personProfile, homePlan, occupationGroupLabel, NAME_LISTS_VERSION, personRecord } = await load('anthroprocenia-people.js');
const { ageCategory } = await load('anthroprocenia-demography.js');
const { PAGE_SIZE, ROW_HEIGHT, formatThousands, buildPopulationTree, visibleRows, showMore, windowRows, wheelStep, scrollToRow, ancestorIds, isSelectableNode } = panel;
const persist = await load('anthroprocenia-persist.js');

const entry = (civ, continent, tile, icon, population) => ({
  civ: { id: civ, name: `Civ ${civ}` }, continent: { id: continent, name: `Land ${continent}` },
  tile: { index: tile, name: `Tile ${tile}` }, icon: { id: icon, name: `Icon ${icon}`, kind: 'building', population },
});
const sample = () => buildPopulationTree([
  entry('a', 'k1', 10, 'x', 100), entry('a', 'k1', 10, 'y', 50), entry('a', 'k1', 11, 'x', 20),
  entry('a', 'k2', 30, 'x', 5), entry('b', 'k1', 40, 'x', 400), entry('b', 'k1', 40, 'z', 0),
]);

test('totals roll up through tiles, continents and civilizations, largest first', () => {
  const tree = sample();
  assert.deepEqual(tree.map(c => [c.label, c.total]), [['Civ b', 400], ['Civ a', 175]]);
  const a = tree[1];
  assert.deepEqual(a.children.map(k => [k.label, k.total]), [['Land k1', 170], ['Land k2', 5]]);
  assert.deepEqual(a.children[0].children.map(t => [t.label, t.total]), [['Tile 10', 150], ['Tile 11', 20]]);
  assert.deepEqual(a.children[0].children[0].children.map(i => [i.label, i.total]), [['Icon x', 100], ['Icon y', 50]]);
  assert.equal(tree[0].children[0].children[0].children.length, 1, 'icons with no population are left out');
});

test('everything starts collapsed and expanding shows exactly one level more', () => {
  const tree = sample(), expanded = new Set(), shown = new Map();
  assert.equal(visibleRows(tree, expanded, shown).length, 2);
  expanded.add(tree[1].id);
  const rows = visibleRows(tree, expanded, shown);
  assert.deepEqual(rows.map(r => [r.node.kind, r.depth]), [['civ', 0], ['civ', 0], ['continent', 1], ['continent', 1]]);
  assert.ok(rows.every(r => r.type === 'node'));
});

test('an expanded icon lists one person per head of population, a page at a time', () => {
  const tree = buildPopulationTree([entry('a', 'k', 1, 'big', 150)]), expanded = new Set(), shown = new Map();
  const group = tree[0].children[0].children[0].children[0], icon = group.children[0];
  assert.equal(group.kind, 'group');
  for (const id of [tree[0].id, tree[0].children[0].id, tree[0].children[0].children[0].id, group.id, icon.id]) expanded.add(id);
  let rows = visibleRows(tree, expanded, shown);
  assert.equal(rows.filter(r => r.type === 'person').length, PAGE_SIZE);
  assert.deepEqual(rows.at(-1), { type: 'more', parentId: icon.id, remaining: 150 - PAGE_SIZE, depth: 5 });
  showMore(shown, icon.id);
  rows = visibleRows(tree, expanded, shown);
  assert.equal(rows.filter(r => r.type === 'person').length, PAGE_SIZE * 2);
  showMore(shown, icon.id);
  rows = visibleRows(tree, expanded, shown);
  assert.equal(rows.filter(r => r.type === 'person').length, 150);
  assert.ok(rows.every(r => r.type !== 'more'));
});

test('huge populations never create huge numbers of rows', () => {
  const tree = buildPopulationTree([entry('a', 'k', 1, 'x', 5_000_000)]);
  const expanded = new Set(['c:a', 'c:a|k:k', 'c:a|k:k|t:1', 'c:a|k:k|t:1|g:x', 'c:a|k:k|t:1|g:x|i:x']);
  assert.ok(visibleRows(tree, expanded, new Map()).length < 100);
  assert.equal(tree[0].total, 5_000_000);
});

test('long lists of children are paged too', () => {
  const entries = [];
  for (let i = 0; i < 150; i++) entries.push(entry('a', 'k', i, 'x', 10 + i));
  const tree = buildPopulationTree(entries), expanded = new Set(['c:a', 'c:a|k:k']), shown = new Map();
  const rows = visibleRows(tree, expanded, shown);
  assert.equal(rows.filter(r => r.node && r.node.kind === 'tile').length, PAGE_SIZE);
  assert.equal(rows.at(-1).remaining, 150 - PAGE_SIZE);
  assert.equal(rows.at(-1).parentId, 'c:a|k:k');
});

test('ids are stable so expansion survives a rebuild, and selection kinds are tiles and icons only', () => {
  const first = sample(), second = sample();
  assert.deepEqual(first.map(c => c.id), second.map(c => c.id));
  const tile = first[1].children[0].children[0], group = tile.children[0], icon = group.children[0];
  assert.deepEqual(ancestorIds(icon.id), [first[1].id, first[1].children[0].id, tile.id, group.id]);
  assert.equal(isSelectableNode(tile), true);
  assert.equal(isSelectableNode(icon), true);
  assert.equal(isSelectableNode(group), false);
  assert.equal(isSelectableNode(first[1]), false);
  assert.equal(isSelectableNode(first[1].children[0]), false);
  assert.equal(tile.tile, 10);
  assert.equal(icon.tile, 10);
});

test('scroll windowing draws only the visible rows and keeps the offset in range', () => {
  const win = windowRows(1000, 5000, 400, 26, 4);
  assert.ok(win.end - win.start < 40);
  assert.equal(win.start, Math.floor(5000 / 26) - 4);
  assert.equal(windowRows(10, 999, 400).offset, 0);
  assert.equal(windowRows(1000, -50, 400).offset, 0);
  assert.equal(windowRows(1000, 1e9, 400, 26).offset, 1000 * 26 - 400);
  assert.equal(scrollToRow(0, 500, 400), 0);
  assert.equal(scrollToRow(50, 0, 400), 51 * 26 - 400);
  assert.equal(scrollToRow(5, 0, 400), 0);
});

test('a wheel notch reported twice scrolls once', () => {
  assert.equal(wheelStep(120, 1000, 0), ROW_HEIGHT * 3);
  assert.equal(wheelStep(-120, 1000, 0), -ROW_HEIGHT * 3);
  assert.equal(wheelStep(120, 1010, 1000), 0);
  assert.equal(wheelStep(120, 1100, 1000), ROW_HEIGHT * 3);
  assert.equal(wheelStep(0, 5000, 0), 0);
});

test('thousands separators', () => {
  assert.equal(formatThousands(0), '0');
  assert.equal(formatThousands(999), '999');
  assert.equal(formatThousands(1234567), '1,234,567');
  assert.equal(formatThousands(-5), '0');
});

test('specialists and every other kind of icon yield a named person with a trade', () => {
  for (const category of ['specialist', 'farm', 'wonder', 'generic']) {
    for (let i = 0; i < 20; i++) {
      const p = personProfile({ civKey: 'ROME', religion: '', age: i % 3, lvl: 1, seed: `${category}${i}`, category, form: '', unit: null });
      assert.ok(p.name.includes(' ') && p.occupation.length > 2 && !/undefined/.test(p.name + p.occupation), `${category}: ${p.name} / ${p.occupation}`);
    }
  }
});

// ---- playback wiring (functions sliced out of the playback module and run against stubs) ----
const playback = await read('anthroprocenia-playback.js');
const slice = name => {
  const start = playback.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = playback.indexOf('{', start);
  for (; i < playback.length; i++) {
    if (playback[i] === '{') depth++;
    else if (playback[i] === '}' && --depth === 0) break;
  }
  return playback.slice(start, i + 1);
};
const makeEl = (attrs = {}, parent = null) => ({ attrs, parentNode: parent, getAttribute(k) { return k in attrs ? attrs[k] : null; } });

test('population panel clicks select tiles and icons and a click elsewhere clears the selection', () => {
  const calls = []; let clock = 1000;
  const context = vm.createContext({
    ...panel, mapVisible: true, Date: { now: () => clock }, calls, popPersonDoublePress: () => false,
    els: {}, popState: { open: true, rows: [], expanded: new Set(), shown: new Map(), selectedId: '', selectedTile: -1, selectedKind: '', pressStamp: 0 },
    updateSelectionIndicator() { calls.push('arrow'); }, popRender() { calls.push('render'); }, popRecomputeRows() { calls.push('rows'); },
  });
  vm.runInContext(['popActionTarget', 'popRowFromTarget', 'popInside', 'popSelect', 'popDeselect', 'onPopPress', 'onPopOffClick'].map(slice).join('\n'), context);
  const root = makeEl(), button = makeEl();
  context.els.popPanel = root; context.els.popBtn = button;
  const tree = sample(), tile = tree[1].children[0].children[0], icon = tile.children[0].children[0];
  const rows = [
    { type: 'node', node: tree[1], depth: 0 }, { type: 'node', node: tile, depth: 2 },
    { type: 'node', node: icon, depth: 3 }, { type: 'person', node: icon, index: 0, depth: 4 }, { type: 'more', parentId: icon.id, remaining: 5, depth: 4 },
  ];
  context.popState.rows = rows;
  const rowEl = i => makeEl({ 'data-pop-row': String(i) }, root);
  const inner = i => makeEl({}, rowEl(i));

  context.onPopPress({ button: 0, target: inner(0), type: 'click' });
  assert.ok(context.popState.expanded.has(tree[1].id), 'civ header expands');
  assert.equal(context.popState.selectedId, '', 'civ headers are not selectable');
  context.popState.pressStamp = 0;

  context.onPopPress({ button: 0, target: inner(1), type: 'click' });
  assert.equal(context.popState.selectedId, tile.id);
  assert.equal(context.popState.selectedTile, 10);
  assert.equal(context.popState.selectedKind, '');
  assert.ok(context.popState.expanded.has(tile.id));
  context.popState.pressStamp = 0;

  context.onPopPress({ button: 0, target: inner(2), type: 'mouseup' });
  assert.equal(context.popState.selectedId, icon.id);
  assert.equal(context.popState.selectedKind, 'building');
  const stamp = context.popState.pressStamp;
  clock += 1000;
  context.onPopPress({ button: 0, target: inner(2), type: 'click' });
  assert.ok(context.popState.expanded.has(icon.id), 'even a delayed click tail cannot close the expanded entry');
  assert.equal(context.popState.pressStamp, stamp);

  context.onPopOffClick({ button: 0, target: inner(3) });
  assert.equal(context.popState.selectedId, icon.id, 'a person row is part of the selection');
  context.onPopOffClick({ button: 0, target: inner(4) });
  assert.equal(context.popState.selectedId, icon.id, 'show-more is panel chrome');
  context.onPopOffClick({ button: 0, target: makeEl({}, root) });
  assert.equal(context.popState.selectedId, icon.id, 'the title area is panel chrome');
  context.onPopOffClick({ button: 0, target: makeEl({}, button) });
  assert.equal(context.popState.selectedId, icon.id, 'the toggle button is panel chrome');
  context.onPopOffClick({ button: 2, target: makeEl() });
  assert.equal(context.popState.selectedId, icon.id, 'only a left click clears it');
  context.onPopOffClick({ button: 0, target: inner(1) });
  assert.equal(context.popState.selectedId, icon.id, 'another selectable header is not "off"');
  context.onPopOffClick({ button: 0, target: inner(0) });
  assert.equal(context.popState.selectedId, '', 'a civ header clears the selection');
  assert.equal(context.popState.selectedTile, -1);
  assert.ok(calls.includes('arrow'));

  context.popState.pressStamp = 0;
  context.onPopPress({ button: 0, target: inner(2), type: 'click' });
  context.onPopOffClick({ button: 0, target: makeEl() });
  assert.equal(context.popState.selectedId, '', 'a click on the map clears it');
});

test('the panel is wired into the map: toggle button, wheel, panel hit-testing, arrow and reset', () => {
  assert.match(playback, /els\.popBtn/);
  assert.match(slice('overControlPanels'), /els\.popPanel/);
  assert.match(playback, /popPanelContains\(p\.x, p\.y\)/);
  assert.match(slice('syncOverlayState'), /syncPopulationUi\(\)/);
  assert.match(slice('stopCameraFollow'), /resetPopulationUi\(\)/);
  assert.match(slice('positionPanel'), /positionPopulationUi\(\)/);
  assert.match(slice('updateSelectionIndicator'), /updateTileArrow\(populationArrow, popState\.selectedTile, /);
  assert.match(slice('arrowControlRects'), /els\.popPanel/);
  assert.match(slice('resetPopulationUi'), /expanded\.clear\(\)/);
  assert.match(playback, /anthro-selection-arrow svg/);
  // The button sits at the top centre, below anything it would overlap, and never over a game menu or popup.
  assert.match(slice('positionPopulationUi'), /btn\.style\.top = popButtonTop\(/);
  assert.doesNotMatch(slice('positionPopulationUi'), /btn\.style\.bottom/);
  assert.match(slice('syncPopulationUi'), /!gameOverlayActive\(\)/);
  assert.match(slice('buildPopulationUi'), /popPeopleIcon\(\)/);
  // Hovering a person row points the arrow at them; hovering the map lights up the panel.
  assert.match(slice('buildPopulationUi'), /addEventListener\('mousemove', event => popSetHoverRow\(/);
  assert.match(slice('updateSelectionIndicator'), /popPersonTarget\(/);
  assert.match(slice('onMapHover'), /popSetMapHover\(popHoverNext\)/);
  assert.match(slice('clearHover'), /popSetMapHover\(null\)/);
  assert.match(slice('syncTownscapes'), /dotDom\.el[\s\S]*townscapeActive\(\) \? 'none'/);
});

test('the Population button moves down past anything at the top centre', () => {
  const context = vm.createContext({ window: { innerWidth: 1000 }, ps: v => v, Math });
  vm.runInContext(slice('popButtonTop'), context);
  const area = { x: 0, y: 0, w: 1000, h: 800 };
  assert.equal(context.popButtonTop(area, 100, 30, []), 8);
  assert.equal(context.popButtonTop(area, 100, 30, [{ left: 900, right: 990, top: 0, bottom: 60 }]), 8, 'off to the side');
  assert.equal(context.popButtonTop(area, 100, 30, [{ left: 300, right: 700, top: 0, bottom: 50 }]), 56, 'below the tab row');
  assert.equal(context.popButtonTop(area, 100, 30, [{ left: 300, right: 700, top: 0, bottom: 50 }, { left: 480, right: 520, top: 60, bottom: 90 }]), 96, 'and below whatever that uncovers');
});

test('the arrow follows a hovered person: their dot outdoors, else their Home Location circle, else their tile', () => {
  const node = { id: 'c:o1|k:1|t:7|g:b2|i:b2.0.0', tile: 7, iconKind: 'building', icon: { id: 'b2.0.0' } };
  const flags = { townscape: false, icons: false, spot: null };
  const context = vm.createContext({
    personKey: panel.personKey,
    townscapeActive: () => flags.townscape, iconModeActive: () => flags.icons, personSpot: () => flags.spot, personBuildingSpot: () => null,
    popIconId: item => `b${item.typeIndex}.${item.n}.${item.dot}`,
    iconPoints: [{ x: 1, y: 2, s: 3, item: { kind: 'building', index: 7, typeIndex: 2, n: 0, dot: 1 } }, { x: 4, y: 5, s: 6, item: { kind: 'building', index: 7, typeIndex: 2, n: 0, dot: 0 } }],
  });
  vm.runInContext(['popHomeCircle', 'popPersonTarget'].map(slice).join('\n'), context);
  const target = () => JSON.parse(JSON.stringify(context.popPersonTarget(node, 3)));
  assert.deepEqual(target(), { tile: 7, kind: 'building', spot: null, person: '' }, 'the home tile');
  flags.icons = true;
  assert.deepEqual(target().spot, { x: 4, y: 5, s: 6 }, 'the Home Location\'s own icon circle');
  flags.townscape = true;
  assert.deepEqual(target().spot, { x: 4, y: 5, s: 6 }, 'indoors (no dot), still the circle');
  flags.spot = { x: 9, y: 9 };
  assert.deepEqual(target(), { tile: 7, kind: 'building', spot: { x: 9, y: 9 }, person: `${node.id}#3` }, 'outdoors, their dot');
});

test('panel rows light up for what is hovered on the map', () => {
  const tree = sample(), tile = tree[1].children[0].children[0], group = tile.children[0], icon = group.children[0];
  const { rowHovered, personKey } = panel;
  const person = { type: 'person', node: icon, index: 4 };
  const rows = [{ type: 'node', node: tile }, { type: 'node', node: group }, { type: 'node', node: icon }, person];
  const lit = hover => rows.map(r => rowHovered(r, hover));
  assert.deepEqual(lit({ person: personKey(icon.id, 4), home: icon.id, tile: 10 }), [true, false, true, true]);
  assert.deepEqual(lit({ person: '', home: icon.id, tile: 10 }), [true, false, true, false]);
  assert.deepEqual(lit({ person: '', home: '', tile: 10 }), [true, false, false, false]);
  assert.deepEqual(lit({ person: '', home: '', tile: 11 }), [false, false, false, false]);
  assert.deepEqual(lit(null), [false, false, false, false]);
});

test('the model builder and renderer run end to end against stubbed game data', () => {
  const entityNames = ['collectPopulationEntries', 'popCivInfo', 'popPlaceInfo', 'popOwnerContext', 'popTileOwner', 'popIconId', 'popIconTraits', 'popIconGroup', 'popEraNow', 'popHomePlan', 'popNodePlan', 'popProfile', 'popModelKey', 'popRecomputeRows', 'popSortOptions', 'popBuildModel', 'popRefreshModel',
    'popFrameSignature', 'popLoadEntries', 'popBackgroundSave', 'popPerson', 'popRowHtml', 'popViewHeight', 'popRender', 'popScrollBy', 'popScrollToTrack', 'popPersonHighlightAttrs', 'popSyncPersonHighlights', 'popHoverIdentity',
    'lifeSeed', 'popPinButtonHtml', 'popPersonRowHtml', 'popPinStatus', 'popPinnedRows', 'popKeptWalking', 'popRebindPin', 'popIndexNodes', 'popPins', 'popIsPinned', 'popSearchRows', 'popNameCountries', 'popFilteredTree'];
  const store = new Map(), saves = [];
  let collected = 0;
  const styleBox = () => ({ style: {}, offsetHeight: 20, clientHeight: 400, getBoundingClientRect: () => ({ top: 0, height: 400 }) });
  const settlements = new Map([[5, ['Roma', 6, 1, []]], [9, ['Ostia', 2, 1, []]]]);
  const frame = new Map([[5, 1 << 3], [6, 1 << 3], [9, 1 << 3], [7, 2 << 3]]);
  const context = vm.createContext({
    ...panel, ...persist, Date, console, Math, Number, String, Map, Set, Array, Object, JSON, playing: false,
    readPlayersRec: () => null, relationshipForPos: () => new Map(),
    popFollow: { person: null }, panelActionIcon: () => '', setPanelButtonLabel: (button, kind, text) => { button.textContent = text; },
    viewRead: key => (store.has(key) ? JSON.parse(store.get(key)) : null),
    viewSave: (key, produce) => { saves.push(key); store.set(key, JSON.stringify(produce())); },
    entityCountForPos: () => 42,
    popWorkplace: () => ({ label: 'Workshop' }),
    popCurrentAction: () => 'Heading Home',
    popLeaderHousehold: () => false,
    cmdCheckHtml: () => '', cmdHomeCheckHtml: () => '', popFamilySummary: () => 'Unmarried | Children: 0', popFamilyButtonHtml: () => '', popFollowButtonHtml: () => '', popLeaderRole: () => '', cmdNoteLeader: () => {}, unitLineageId: (row, t) => `0.${row}`, popCountryNames: () => new Map([['o1', 'The Roman Republic (Rome)']]),
    popState: { open: true, tree: [], total: 0, builtKey: '', pendingKey: '', pendingSince: 0, expanded: new Set(), shown: new Map(), rows: [], scroll: 0, selectedId: '', selectedTile: -1, selectedKind: '', profiles: new Map(), plans: new Map(), sortMode: 'default', mapHover: null, wheelStamp: 0, errorLogged: false, lastViewHeight: -1, era: null, eraKey: '', fromSaved: false, bgKey: '', bgSince: 0,     selectedPerson: '', focusPerson: '', occCounts: new Map(), peoplePaused: false,
      homes: new Map(), changes: new Map(), pins: null, pinKeys: null, nodeIndex: null, search: '', searchRows: null, searchKey: '' },
    personRecord, ageCategory, POP_PIN_ICON: '<path d="M0 0"/>', MAX_PINS: 40,
    popLife: (nodeId, index) => ({ state: { gen: 0, family: 0 }, years: 10 + (index * 7) % 70, turn: 0 }),
    damagedForPos: () => new Map(),
    POP_COLORS: { civ: '#fff', continent: '#fff', tile: '#fff', group: '#fff', icon: '#fff', occupation: '#fff' }, POP_MAP_HOVER: { background: '#ff0', edge: '#ff0' }, originMemo: null, popOwnerMemo: new Map(),
    homePlan, occupationGroupLabel, NAME_LISTS_VERSION,
    DOTS_PER_ITEM: 10, TAG: '[t]', nowMs: () => Date.now(), ps: v => v, popRowPx: () => ROW_HEIGHT,
    frames: [[0, 0, 1, 'Turn 1']], pos: 0, fogMode: false, basePos: Array.from({ length: 20 }, () => ({ x: 0, y: 0 })), curFrame: frame,
    manifest: { w: 5, h: 4, buildingTypes: [[1, 'Farm', 1], [2, 'Temple', 0]], unitTypes: [[3, 'Warrior', 0]] },
    err: e => { throw new Error(e); },
    visForPos: () => new Int8Array(20).fill(2),
    settlementsForPos: () => settlements,
    buildingsForPos: () => new Map([[6, [0, 0, 1]], [5, [1]]]),
    wondersForPos: () => new Map([[5, [1, 0]]]),
    wonderNameByIdx: () => 'Pyramids',
    readUnitsTurn: () => [[6, 1, 0, 100], [7, 2, 0, 50]],
    identityForPos: () => new Map([[1, ['L', 'Rome', 'Roman', 0, 0, 'CIVILIZATION_ROME', '', 'Despotism', '', 'Roman Pantheon', '', '']], [2, ['L', '', '', 0, 0, '', 'MILITARISTIC', '', '', '', '', 'Carthage']]]),
    normalizedCivKey: v => String(v).replace('CIVILIZATION_', ''),
    ownerMeta: o => ({ kind: o === 1 ? 'major' : 'citystate' }),
    countryName: () => 'The Latin League', replayEraKey: () => 'ANTIQUITY', civAdjective: () => 'Roman', cityStateName: () => 'Carthage',
    mapLabelText: s => String(s), continentTypeForTile: i => (i === 9 ? null : 3), continentNameForType: () => 'Europe',
    siteCategory: key => (key.startsWith('WONDER_') ? 'wonder' : 'farm'), constructibleTypeKey: () => 'BUILDING_X',
    siteNameForItem: item => { collected++; return `The Brutii ${item.typeIndex}-${item.dot}`; },
    siteNamesForTile: (civ, index, items) => items.map(it => [`The ${civ} ${it.base}`]),
    populationForItem: item => 40 + (item.dot || 0),
    unitNameForItem: () => 'The First Roma Slingers', unitTypeName: () => 'Warrior', unitSubcategory: () => 'infantry', unitTypeKey: () => 'UNIT_WARRIOR',
    townEraNow: () => ({ age: 0, lvl: 1 }), personProfile, escHtml: s => String(s),
    els: { popRows: { innerHTML: '' }, popTotal: { textContent: '' }, popTrack: styleBox(), popThumb: styleBox(), popView: styleBox(), popPanel: styleBox() },
  });
  vm.runInContext(entityNames.map(slice).join('\n'), context);
  const entries = vm.runInContext('collectPopulationEntries()', context);
  assert.equal(entries.length, 40 + 2 + 1 + 2, 'buildings (3 types on one tile, 1 on another, 10 dots each), 2 units, 1 wonder, 2 specialist groups');
  const kinds = entries.reduce((n, e) => (n[e.icon.kind] = (n[e.icon.kind] || 0) + 1, n), {});
  assert.deepEqual(kinds, { building: 40, unit: 2, wonder: 1, specialist: 2 });
  assert.ok(entries.every(e => e.icon.population > 0 && e.icon.name && e.civ.name && e.continent.name && e.tile.name));
  assert.ok(entries.some(e => e.civ.name === 'Carthage') && entries.some(e => e.civ.name === 'The Latin League'));
  assert.ok(entries.some(e => e.continent.name === 'Open Waters'), 'a tile with no continent is open water');
  assert.ok(entries.some(e => e.tile.name === 'Roma (0, 1)'), 'a settlement tile is named after it with its coordinates');

  assert.equal(vm.runInContext('popRefreshModel(true)', context), true);
  const state = context.popState;
  assert.ok(state.tree.length >= 2 && state.total > 0);
  assert.equal(state.rows.length, state.tree.length, 'collapsed: civilizations only');
  assert.equal(vm.runInContext('popRefreshModel(false)', context), false, 'unchanged turn does not rebuild');
  assert.deepEqual(saves, ['pop0a'], 'the turn\'s people were saved');
  assert.equal(state.fromSaved, false);
  const worked = collected, totalBefore = state.total, firstLabels = state.tree.map(c => `${c.label}:${c.total}`);

  // A rebuild of the same turn (say, after a reload) comes from the saved record without working anything out again.
  state.builtKey = ''; state.tree = []; saves.length = 0;
  assert.equal(vm.runInContext('popRefreshModel(true)', context), true);
  assert.equal(state.fromSaved, true);
  assert.equal(collected, worked, 'nothing was recomputed');
  assert.deepEqual(saves, [], 'and nothing was saved again');
  assert.equal(state.total, totalBefore);
  assert.deepEqual(state.tree.map(c => `${c.label}:${c.total}`), firstLabels);
  assert.equal(JSON.stringify(state.era), JSON.stringify({ age: 0, lvl: 1 }));

  // A record from a different world (another signature) is ignored and replaced.
  context.entityCountForPos = () => 43;
  state.builtKey = '';
  assert.equal(vm.runInContext('popRefreshModel(true)', context), true);
  assert.equal(state.fromSaved, false);
  assert.ok(collected > worked);
  assert.deepEqual(saves, ['pop0a']);
  context.entityCountForPos = () => 42;
  state.builtKey = '';
  vm.runInContext('popRefreshModel(true)', context);
  assert.equal(state.fromSaved, false, 'the other signature replaced the record');

  // Fog mode saves under its own record.
  context.fogMode = true; saves.length = 0; state.builtKey = '';
  vm.runInContext('popRefreshModel(true)', context);
  assert.deepEqual(saves, ['pop0f']);
  context.fogMode = false; state.builtKey = '';
  vm.runInContext('popRefreshModel(true)', context);

  // With the panel closed, a settled turn is still worked out and saved, but not while playing or before it settles.
  state.builtKey = ''; state.bgKey = ''; saves.length = 0; store.clear();
  context.playing = true;
  vm.runInContext('popBackgroundSave()', context);
  assert.equal(state.bgKey, '', 'not while playing');
  context.playing = false;
  vm.runInContext('popBackgroundSave()', context);
  assert.equal(state.builtKey, '', 'waits for the view to settle');
  state.bgSince = Date.now() - 3000;
  vm.runInContext('popBackgroundSave()', context);
  assert.equal(state.builtKey, '0|1|0');
  assert.deepEqual(saves, ['pop0a']);

  const civ = state.tree[0];
  const open = [civ];
  let node = civ;
  while (node.children.length) { node = node.children[0]; open.push(node); }
  for (const n of open) state.expanded.add(n.id);
  vm.runInContext('popRecomputeRows(); popRender()', context);
  const html = context.els.popRows.innerHTML;
  assert.match(html, /data-pop-row="0"/);
  assert.match(html, /<span[^>]*>[^<]+<small[^>]*>[^<]+<\/small><\/span><span[^>]*>(Male|Female)<\/span><span[^>]*>(Child|Youth|Adult|Elder)<\/span><span[^>]*>[^<]+<\/span><span[^>]*>[^<]+<\/span><span[^>]*>[^<]+<\/span><span[^>]*>Action: Heading Home<\/span><\/div>/, 'person rows show name, family summary, gender, age, occupation, home, workplace and live action');
  assert.match(html, /data-pop-pin="1"/, 'person rows have a pin button');
  assert.ok(html.includes(node.label));
  assert.match(context.els.popTotal.textContent, /^Total: [\d,]+$/);
  assert.match(html, /Home Location: /, 'each icon circle is shown as a Home Location');

  // Sorted by occupation the same people are listed (in another order); in groups each occupation is its own header.
  const people = mode => { state.sortMode = mode; vm.runInContext('popRecomputeRows()', context); return state.rows.filter(r => r.type === 'person'); };
  const plain = people('default'), sorted = people('occupation');
  assert.deepEqual(sorted.map(r => r.index).sort((a, b) => a - b), plain.map(r => r.index).sort((a, b) => a - b));
  const plan = vm.runInContext('popNodePlan(popState.rows.find(r => r.type === "person").node)', context);
  const order = sorted.map(r => plan.groupOf(r.index));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'people come occupation by occupation');
  people('groups');
  const groupRows = state.rows.filter(r => r.type === 'node' && r.node.kind === 'occupation');
  assert.equal(groupRows.length, plan.groups.length);
  assert.equal(groupRows.reduce((sum, r) => sum + r.node.total, 0), node.total);
  state.expanded.add(groupRows[0].node.id);
  assert.equal(people('groups').length, Math.min(PAGE_SIZE, groupRows[0].node.total));
  // Each level's tooltip counts its people's occupations; the counts add up to the level's total.
  const planOf = vm.runInContext('popNodePlan', context);
  for (const level of [civ, ...open.filter(n => n.kind !== 'icon'), node, groupRows[0].node]) {
    const counts = panel.occupationCounts(level, planOf, new Map());
    assert.equal([...counts.values()].reduce((a, b) => a + b, 0), level.total, `${level.kind} counts add up`);
  }
  const homeCounts = panel.occupationCounts(node, planOf, new Map());
  for (const group of planOf(node).groups) assert.equal(homeCounts.get(group.title), group.count);
  state.sortMode = 'default';

  // What is hovered on the map lights up its rows.
  vm.runInContext('popRecomputeRows()', context);
  const firstPerson = state.rows.find(r => r.type === 'person');
  state.mapHover = { person: `${firstPerson.node.id}#${firstPerson.index}`, home: firstPerson.node.id, tile: firstPerson.node.tile };
  vm.runInContext('popRender()', context);
  const lit = context.els.popRows.innerHTML.split('data-pop-row=').slice(1).filter(row => row.includes('#ff0'));
  assert.equal(lit.length, 2, 'Home Location and tile backgrounds are rendered; person identity highlighting is applied in-place');
  assert.match(context.els.popRows.innerHTML, /data-person-key=/);
  state.mapHover = null;

  // A pinned person is listed in a "Pinned" section above the tree, and stays there when everything is collapsed.
  const pinRow = state.rows.find(r => r.type === 'person');
  const pinKey = `${pinRow.node.id}#${pinRow.index}`, pinName = vm.runInContext('popPerson', context)(pinRow.node, pinRow.index).name;
  store.set('pins', JSON.stringify([{ key: pinKey, nodeId: pinRow.node.id, index: pinRow.index, tile: pinRow.node.tile, gen: 0, name: pinName, gender: '', occupation: 'x', home: 'h', turn: 0 }]));
  state.pins = null; state.nodeIndex = null;
  const savedExpanded = new Set(state.expanded);
  state.expanded.clear();
  vm.runInContext('popRecomputeRows(); popRender()', context);
  assert.equal(state.rows[0].type, 'header');
  assert.equal(state.rows[1].type, 'pin');
  assert.equal(state.rows[1].node, pinRow.node, 'the pin finds its Home Location on this turn');
  assert.ok(context.els.popRows.innerHTML.includes(pinName));
  assert.equal(vm.runInContext('popIsPinned', context)(pinKey), true);
  // Searching lists matching people from the whole tree, below the pins.
  const surname = pinName.split(' ').pop();
  state.search = surname.toLowerCase(); state.searchRows = null;
  vm.runInContext('popRecomputeRows()', context);
  const results = state.rows.filter(r => r.type === 'person');
  assert.ok(results.length > 0, 'the search finds people');
  const textOf = r => { const p = vm.runInContext('popPerson', context)(r.node, r.index); return `${p.name}|${p.occupation}|${p.ageCategory}`.toLowerCase(); };
  assert.ok(results.every(r => textOf(r).includes(state.search)), 'and only people who match');
  assert.ok(state.rows.some(r => r.type === 'header' && /Search results/.test(r.label)));
  state.search = 'zzzz-nobody'; state.searchRows = null;
  vm.runInContext('popRecomputeRows()', context);
  assert.ok(state.rows.some(r => r.type === 'note' && r.label === 'No matches'));
  state.search = ''; state.searchRows = null; store.delete('pins'); state.pins = null;
  for (const id of savedExpanded) state.expanded.add(id);
  vm.runInContext('popScrollBy(1)', context);
  assert.ok(state.scroll >= 0);

  state.turnChanged = true;
  context.pos = 1;
  assert.equal(vm.runInContext('popRefreshModel(false)', context), false, 'a changed turn waits for things to settle first');
  assert.equal(state.pendingKey, '1|1|0');
});

test('search finds levels by name and people by name, occupation or age, within a budget', () => {
  const { searchPopulation, withPinnedSection, normalizeQuery, rowHovered, personKey } = panel;
  assert.equal(normalizeQuery('  Brutus   SMITH '), 'brutus smith');
  const tree = sample();
  const names = (node, i) => (i % 10 === 3 ? 'Marcus Smith|Smith|Adult' : 'Gaius Farmer|Farmer|Child');
  const byName = searchPopulation(tree, 'tile 10', { personText: names });
  assert.deepEqual(byName.rows.filter(r => r.type === 'node').map(r => r.node.label), ['Tile 10']);
  const all = searchPopulation(tree, 'smith', { personText: names, perHome: 1000, budget: 1e6 });
  assert.equal(all.scanned, all.people);
  assert.equal(all.rows.length, Math.min(200, all.rows.length));
  assert.ok(all.rows.every(r => r.type === 'person' && r.index % 10 === 3 && r.result));
  const tight = searchPopulation(tree, 'smith', { personText: names, perHome: 5, budget: 12 });
  assert.equal(tight.scanned, 12);
  assert.ok(tight.scanned < tight.people);
  const opened = tree[0].children[0].children[0].children[0].children[0];
  const first = searchPopulation(tree, 'smith', { personText: names, perHome: 5, budget: 50, expanded: new Set([opened.id]) });
  assert.equal(first.rows[0].node, opened, 'open Home Locations are searched first and deeper');
  assert.deepEqual(searchPopulation(tree, '   ', { personText: names }), { rows: [], scanned: 0, people: 0 });
  assert.equal(searchPopulation(tree, 'smith', { personText: names, maxResults: 3, perHome: 1000, budget: 1e6 }).rows.length, 3);

  const body = [{ type: 'node' }];
  assert.deepEqual(withPinnedSection([], body, ''), body);
  assert.deepEqual(withPinnedSection([], body, 'Search results').map(r => r.label || r.type), ['Search results', 'node']);
  const pin = { type: 'pin', pin: { key: personKey('h', 2) }, node: null, index: 2 };
  assert.deepEqual(withPinnedSection([pin], body, '').map(r => r.label || r.type), ['Pinned (1)', 'pin', 'Everyone', 'node']);
  assert.equal(rowHovered(pin, { person: personKey('h', 2) }), true);
  assert.equal(rowHovered(pin, { person: personKey('h', 3) }), false);
  assert.equal(rowHovered({ type: 'header', label: 'x' }, { person: 'x' }), false);
});
test('the occupations tooltip lists the commonest occupations first and says how many more there are', () => {
  const { occupationCounts, occupationTipLines } = panel;
  const plans = { a: { groups: [{ title: 'Farmer', count: 5 }, { title: 'Potter', count: 2 }] }, b: { groups: [{ title: 'Farmer', count: 1 }, { title: 'Smith', count: 4 }] } };
  const icon = (id, total) => ({ id, kind: 'icon', label: id, total, children: [] });
  const tile = { id: 't', kind: 'tile', label: 'Tile 1', total: 12, children: [icon('a', 7), icon('b', 5)] };
  let asked = 0;
  const planFor = n => { asked++; return plans[n.id]; };
  const cache = new Map(), counts = occupationCounts(tile, planFor, cache);
  assert.deepEqual([...counts], [['Farmer', 6], ['Smith', 4], ['Potter', 2]]);
  occupationCounts(tile, planFor, cache);
  assert.equal(asked, 2, 'cached');
  assert.deepEqual([...occupationCounts({ id: 'o', kind: 'occupation', title: 'Smith', total: 4 }, planFor)], [['Smith', 4]]);
  assert.deepEqual(occupationTipLines(tile, counts, t => t.toUpperCase()), ['Tile 1 (12 people)', 'FARMER: 6', 'SMITH: 4', 'POTTER: 2']);
  assert.deepEqual(occupationTipLines(tile, counts, null, 1), ['Tile 1 (12 people)', 'Farmer: 6', 'and 2 more occupations']);
  assert.deepEqual(occupationTipLines(icon('a', 7), new Map()), ['Home Location: a (7 people)', 'No occupations recorded']);
});

test('the panel has a pause/play button for the walking people, row tooltips and a gender column', () => {
  assert.match(slice('buildPopulationUi'), /popState\.peoplePaused = !popState\.peoplePaused;\s*popSyncPauseButton\(\);/);
  assert.match(slice('buildPopulationUi'), /header\.append\(title, els\.popTotal, els\.popPause, els\.popSort, close\)/);
  assert.match(slice('peopleTick'), /if \(!popState\.peoplePaused && dt > 0\) stepWalker\(/);
  assert.match(slice('onMapHoverInner'), /if \(popPanelContains\(x, y\)\) \{ popRowTip\(e\); return; \}/);
  assert.ok(slice('onMapHoverInner').indexOf('popRowTip(e)') < slice('onMapHoverInner').indexOf('overControlPanels(x, y)'), 'before the control panels hide the tip');
  assert.match(slice('popRowTip'), /occupationCounts\(row\.node, popNodePlan, popState\.occCounts\)/);
  assert.match(slice('popBuildModel'), /popState\.occCounts\.clear\(\)/);
  assert.match(slice('popPersonRowHtml'), /p\.gender\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(slice('popPersonRowHtml'), /p\.ageCategory/, 'and an age column');
  assert.match(slice('popPersonRowHtml'), /popPinButtonHtml\(pinned\)/, 'each person row starts with its pin button');
  assert.match(slice('popPinButtonHtml'), /data-pop-pin="1"/);
  assert.match(slice('onPopPress'), /popPinTarget\(event\.target\)/);
  assert.match(slice('buildPopulationUi'), /els\.popSearch = /, 'a search box');
  assert.match(slice('popRowTip'), /Born this turn: about/);
  assert.match(slice('syncPopulationUi'), /popState\.pinsDirty && !playing\) popSavePins\(\)/, 'pins changed while playing are saved later');
});

test('the panel starts hidden and collapsed', () => {
  const reset = [slice('resetPopulationUi'), slice('clearPopulationSelection'), slice('popClearSearch')].join('\n');
  const context = vm.createContext({
    popStopFollow: () => {}, closeClumpPicker() {}, cmdClearYieldPopups: () => {}, popStopCameraTrip() {}, popCameraTrip: { press: {} }, familyCache: new Map([['family', {}]]),
    cmdState: { chosen: new Set(['p#1']) }, cmdCloseMenu() {}, cmdClearPanelCommand() {}, cmdUpdateStatus() {},
    peopleRingUnder: null, peopleRing: null, cmdPickRings: [], popSyncPersonHighlights() {}, updateSelectionIndicator() {}, leadRender() {},
    workplaceState: { tiles: new Map(), plans: new Map(), entries: new Map(), doors: new Map() },
    els: { popPanel: { style: { display: 'flex' } }, popBtn: { style: { display: 'flex' } }, popSearch: { value: 'smith' }, leadPanel: { style: { display: 'flex' } }, leadBtn: { style: { display: 'flex' } } },
    leadState: { open: true, rows: [1], builtKey: 'k', start: 4, hover: 2 }, cmdPanelState: { key: 'x' }, familyState: { open: true, key: 'x' },
    popState: { open: true, tree: [1], total: 5, builtKey: 'k', pendingKey: 'p', expanded: new Set(['a']), shown: new Map([['a', 1]]), rows: [1], scroll: 9, profiles: new Map([['a', 1]]), selectedId: 'x', selectedTile: 4, selectedKind: 'unit', selectedPerson: 'p#1', focusPerson: 'p#1', dragging: true,
      search: 'smith', searchRows: [1], homes: new Map([['h', 1]]), changes: new Map([['c', 1]]) },
  });
  vm.runInContext(reset, context);
  vm.runInContext('resetPopulationUi()', context);
  const s = context.popState;
  assert.deepEqual([s.open, s.tree.length, s.expanded.size, s.shown.size, s.rows.length, s.scroll, s.selectedId, s.selectedTile], [false, 0, 0, 0, 0, 0, '', -1]);
  assert.deepEqual([s.search, s.searchRows, context.els.popSearch.value, s.homes.size, s.changes.size], ['', null, '', 0, 0], 'the search and the lives\' caches are cleared');
  assert.equal(context.els.popPanel.style.display, 'none');
  assert.equal(context.els.popBtn.style.display, 'none');
  assert.equal(context.cmdState.chosen.size, 0, 'map close also deselects command-picked walkers');
  assert.deepEqual([context.leadState.open, context.leadState.rows.length, context.els.leadPanel.style.display, context.els.leadBtn.style.display], [false, 0, 'none', 'none'], 'the Leaders Panel closes too');
});
