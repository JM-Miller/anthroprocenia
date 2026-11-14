import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const town = await loadModule('anthroprocenia-townscape.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const crowds = await loadModule('anthroprocenia-crowds.js');
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
function context(names, state) {
  const ctx = vm.createContext({ ...town, ...panel, ...crowds, hexW: 100, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];

test('indoor arrows use the occupied roof, including a visited building in another Home Location', () => {
  const person = { key: 'home#4', inside: true, exiting: false, node: 7, fade: 0 };
  const home = { id: 'home', tile: 2, iconKind: 'building' };
  const visitorEntry = { final: [{ sourceIndex: 9, box: { x0: 100, x1: 120, y0: 50, y1: 70 } }] };
  const ctx = context(['personBuildingSpot', 'personSpot', 'popPersonTarget'], {
    peopleActive: () => true, townscapeActive: () => true, popHomeCircle: () => ({ x: 1, y: 1, s: 2 }),
    townWalkers: new Map([['home', { people: [person] }]]),
    townWorld: { graph: { doorBuildings: new Map([[7, { pathKey: 'visitor', sourceIndex: 9 }]]) },
      parts: new Map([['visitor', { entry: visitorEntry }]]) },
  });
  const spot = ctx.popPersonTarget(home, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(spot.spot)), { x: 110, y: 50, s: 0 });
  assert.equal(spot.person, person.key);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.personBuildingSpot(person.key, true))), { x: 110, y: 60, s: 0 }, 'camera centers the roof rather than the arrow anchor');
  person.exiting = true; person.fade = 1; person.x = 130; person.y = 80;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popPersonTarget(home, 4).spot)), { x: 130, y: 80 });
  ctx.townscapeActive = () => false;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popPersonTarget(home, 4).spot)), { x: 1, y: 1, s: 2 });
  person.exiting = false; person.node = 999;
  assert.equal(ctx.personBuildingSpot(person.key), null, 'a stale/missing door is not mistaken for home');
});

test('roofs clear minor and major road strokes and cannot be almost entirely under water', () => {
  const poly = square(0, 0, 10);
  const road = { x1: -10, y1: 5, x2: 20, y2: 5, clear: 0.2 };
  assert.equal(town.buildingGroundClear(poly, [road], [], []), false);
  assert.equal(town.buildingGroundClear(poly, [{ ...road, y1: -0.5, y2: -0.5, clear: 0.6 }], [], []), false, 'stroke overlaps even when the centreline is outside');
  assert.equal(town.buildingGroundClear(poly, [{ ...road, y1: -1, y2: -1 }], [], []), true);
  assert.equal(town.buildingGroundClear(poly, [], [{ ...road, clear: 1 }], []), true, 'narrow creek may partially cross a roof');
  assert.equal(town.buildingGroundClear(poly, [], [{ ...road, clear: 10 }], []), false);
  assert.equal(town.buildingGroundClear(poly, [], [], [square(-1, -1, 12)]), false);
  assert.equal(town.buildingGroundClear(poly, [], [], [square(5, 0, 10)]), true, 'partial decorative pool overlap remains possible');
  assert.equal(town.buildingGroundClear(poly, [], [], [square(-1, -1, 10), square(5, -1, 10)]), false, 'combined waterways cannot cover the whole building');
});

test('ground indexing includes neighboring streets, connecting roads, creeks and pools', () => {
  const entry = {
    center: { x: 100, y: 100 }, radius: 10,
    shapes: { streets: [[[-1, 0], [1, 0]]], mainStreets: [[[0, -1], [0, 1]]],
      water: [[[-1, 2], [1, 2]]], pools: [square(3, 3, 2)] },
    obstacles: { segments: [] },
  };
  const ctx = context(['townBuildingGround'], { hexW: 100 });
  const plan = { roads: [{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }],
    water: [{ pts: [{ x: 0, y: 10 }, { x: 10, y: 10 }] }] };
  const ground = ctx.townBuildingGround([entry], plan);
  for (const poly of [square(95, 99, 2), square(99, 95, 2), square(4, -1, 2)]) {
    assert.equal(ground.clear(poly, 0), false);
  }
  assert.equal(ground.clear(square(132, 132, 2), 0), false, 'fully submerged by a decorative pool');
  assert.equal(ground.clear(square(95, 119.99, 0.02), 0), false, 'tiny roof submerged by a local creek');
  assert.equal(ground.clear(square(4, 9.99, 0.02), 0), false, 'connected creek counts too');
  assert.equal(ground.clear(square(70, 70, 2), 0), true);
  const sync = slice('syncTownscapes');
  assert.ok(sync.indexOf('planEntryLinks(entries)') < sync.indexOf('entry.final = []'));
  assert.match(sync, /group.flatMap\(b => \[b.poly, \.\.\.b.parts\]\).map/);
});

test('decoration reservations keep complete footprints out of accepted roofs and their parts', () => {
  const ctx = context(['townDecorationIndex', 'townDecoPlacements'], {
    hexW: 100, isWaterAt: () => false, hashString: () => 37,
  });
  const poly = square(-5, -5, 10), part = square(5, 0, 3);
  const entry = { center: { x: 0, y: 0 }, radius: 20, pathKey: 'test', shapes: {}, final: [{ poly, parts: [part] }],
    obstacles: { circles: [], segments: [], roads: [] } };
  const index = ctx.townDecorationIndex([entry], null);
  const placements = ctx.townDecoPlacements(entry, index);
  assert.ok(placements.length > 0);
  for (const p of placements) {
    assert.equal(town.polygonNearCircle(poly, p.x, p.y, p.pad), false);
    assert.equal(town.polygonNearCircle(part, p.x, p.y, p.pad), false);
  }
});

test('the spatial ground query is bounded to nearby records and includes oversized polygons', () => {
  const index = new town.DecorationIndex(1);
  for (let i = 0; i < 1000; i++) index.segment(i * 5, 0, i * 5 + 2, 0, 0.2);
  index.polygon(square(-20, -20, 40));
  const hits = index.recordsInBox({ x0: 0, x1: 2, y0: -1, y1: 1 });
  assert.ok(hits.length < 10);
  assert.ok(hits.some(h => h.kind === 'polygon'));
  assert.equal(new Set(hits).size, hits.length);
});

test('map clicks check eligible people once and focus corresponding leader rows, without selecting foreign or spent people', () => {
  const node = { id: 'home', tile: 2, icon: { owner: 1 } }, chosen = new panel.PeopleSelection();
  let own = true, left = 3, live = true, renders = 0;
  const state = {
    popState: { open: true, tree: [], expanded: new Set(), shown: new Map(), builtKey: 'test', search: 'unrelated' },
    popClearHomeFilter() {}, popRefreshModel() {}, popModelKey: () => 'test',
    popClearSearch() { state.popState.search = ''; },
    popSortOptions: () => ({}), revealPerson: () => node, popRecomputeRows() {},
    popSelectPerson(n, i) { state.popState.selectedPerson = `${n.id}#${i}`; }, popRender() {},
    cmdLiveTurn: () => live, cmdOwnPeople: () => own, cmdCommandsLeft: () => left,
    cmdState: { chosen }, cmdToggleChosen(key) { chosen.add(key); },
    leadState: { open: true, start: 0, rows: Array.from({ length: 41 }, (_, index) => ({ node, index })) },
    LEAD_ROWS_SHOWN: 10, leadRender: () => { renders++; },
  };
  const ctx = context(['selectPersonFromMap', 'leadSectionRows'], state);
  const hit = index => ({ group: { nodeId: 'home' }, person: { id: index } });
  ctx.selectPersonFromMap(hit(23)); ctx.selectPersonFromMap(hit(23));
  assert.equal(chosen.size, 1);
  assert.ok(chosen.has('home#23'));
  assert.equal(ctx.popState.focusPerson, 'home#23');
  assert.equal(ctx.leadState.start, 24);
  assert.equal(ctx.popState.search, '');
  assert.equal(renders, 2);
  own = false; ctx.selectPersonFromMap(hit(24)); assert.ok(!chosen.has('home#24'));
  own = true; left = 0; ctx.selectPersonFromMap(hit(25)); assert.ok(!chosen.has('home#25'));
  left = 3; live = false; ctx.selectPersonFromMap(hit(26)); assert.ok(!chosen.has('home#26'));
});

test('follow switches targets exclusively, saves pins, and remains listed even when all permanent pin slots are full', () => {
  const pins = [], keys = new Set(), node = { id: 'home', tile: 2, label: 'Town' };
  let cancelled = 0;
  const ctx = context(['popToggleFollow', 'popStopFollow', 'popFollowMatches', 'popKeptWalking', 'popPinnedRows', 'popIsPinned', 'popTogglePinKey'], {
    popFollow: { person: null, timer: 0 }, popState: { tree: [], pins, pinKeys: keys, nodeIndex: new Map([['home', { ...node, total: 10 }]]) },
    MAX_PINS: 2, pos: 0, leadState: { open: false }, popStopCameraTrip() {},
    popPerson: () => ({ name: 'Ada', occupation: 'Farmer', life: { state: { gen: 0 } } }),
    popPins: () => pins, popSelectPerson() {}, popRender() {}, popRecomputeRows() {}, refreshPinnedWalkers() {},
    popTickFollow() { ctx.popFollow.timer = 123; }, clearTimeout: () => { cancelled++; },
    popSavePins() {}, popTogglePin(n, i) { const key = `${n.id}#${i}`; pins.push({ key, nodeId: n.id, index: i }); keys.add(key); },
  });
  ctx.popToggleFollow(node, 0);
  assert.equal(pins.length, 1);
  assert.equal(ctx.popPinnedRows().length, 1);
  ctx.popToggleFollow(node, 1);
  assert.equal(cancelled, 1);
  assert.equal(ctx.popFollow.person.key, 'home#1');
  assert.equal(pins.length, 2);
  ctx.popToggleFollow(node, 2);
  assert.equal(ctx.popFollow.person.key, 'home#2');
  assert.equal(ctx.popPinnedRows().length, 3, 'transient follow pin does not evict saved people');
  assert.equal(pins.length, 2, 'permanent pin budget remains bounded');
  ctx.popStopFollow();
  assert.equal(ctx.popPinnedRows().length, 2);
});

test('panel controls keep their icons after label updates, with people/crown toggles and X close buttons', () => {
  const ctx = context(['panelActionIcon', 'setPanelButtonLabel'], {
    ps: n => n, escHtml: text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  });
  const button = {};
  for (const kind of ['clear', 'sort', 'home', 'more']) {
    ctx.setPanelButtonLabel(button, kind, '<A & B>');
    assert.match(button.innerHTML, /<svg/);
    assert.match(button.innerHTML, /pointer-events:none/);
    assert.match(button.innerHTML, /&lt;A &amp; B>/);
    assert.ok(!button.innerHTML.includes('undefined'));
  }
  for (const [fn, icon] of [['buildPopulationUi', 'popPeopleIcon'], ['buildLeadersUi', 'leadCrownIcon']]) {
    const body = slice(fn);
    assert.match(body, /btn.style.borderRadius = '50%'/);
    assert.match(body, /close.style.borderRadius = '50%'/);
    assert.ok(body.includes(`btn.append(${icon}())`));
    assert.ok(body.includes("close.textContent = 'X'"));
    assert.match(body, /aria-label/);
  }
  assert.match(slice('leadRender'), /popPinButtonHtml.*popFollowButtonHtml.*popFamilyButtonHtml/);
  assert.match(slice('onLeadPress'), /data-pop-follow/);
  assert.match(slice('popSetSortMode'), /setPanelButtonLabel/);
  assert.match(slice('popRender'), /setPanelButtonLabel\(els.popHomeFilter/);
});

test('Population and Leaders UI build real circular icon controls and retain labels on other actions', () => {
  const all = [];
  const element = tag => {
    const el = { tag, style: {}, attrs: {}, children: [], events: {}, classList: { add() {} },
      setAttribute(k, v) { this.attrs[k] = v; },
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); },
      addEventListener(name, fn) { this.events[name] = fn; },
    };
    all.push(el);
    return el;
  };
  const ctx = context(['buildPopulationUi', 'buildLeadersUi', 'popPeopleIcon', 'leadCrownIcon', 'popSyncPauseButton', 'panelActionIcon', 'setPanelButtonLabel'], {
    document: { body: element('body'), createElement: element, createElementNS: (ns, tag) => element(tag) },
    window: { addEventListener() {} }, els: {}, ps: n => n, escHtml: text => text, addPanelMinimize() {},
    popState: { sortMode: 'default', peoplePaused: false }, MAP_CHROME_CLASS: 'chrome',
    onPopPress() {}, onPopOffClick() {}, onLeadPress() {},
  });
  ctx.buildPopulationUi(); ctx.buildLeadersUi();
  for (const button of [ctx.els.popBtn, ctx.els.leadBtn]) {
    assert.equal(button.style.borderRadius, '50%');
    assert.equal(button.style.width, button.style.height);
    assert.equal(button.children.length, 1);
    assert.equal(button.children[0].tag, 'svg');
    assert.ok(button.attrs.title && button.attrs['aria-label']);
  }
  const populationClose = all.find(el => el.attrs.title === 'Close the Population Panel');
  const leadersClose = all.find(el => el.attrs.title === 'Close the Leaders Panel');
  for (const button of [populationClose, leadersClose]) {
    assert.equal(button.style.borderRadius, '50%');
    assert.equal(button.textContent, 'X');
    assert.equal(button.children.length, 0);
  }
  assert.match(ctx.els.popSort.innerHTML, /<svg.*Sort:/);
  assert.match(all.find(el => el.attrs.title === 'Clear the search').innerHTML, /<svg.*Clear/);
  assert.match(all.find(el => el.textContent === 'Select none').innerHTML, /<svg.*Select none/);
});

test('minor road segments clear roof footprints, parts and neighboring buildings including stroke caps', () => {
  const buildings = [square(-2, -2, 4), square(6, -2, 2), square(7, -1, 3)];
  const index = new town.DecorationIndex(1);
  for (const poly of buildings) index.polygon(poly);
  const lines = [
    [[-10, 0], [15, 0]], [[0, -10], [0, 10]], [[-10, -5], [10, -5]],
    [[0, 0], [0, 0], [0, 1]], [[-10, 3], [0, 3], [10, 3]],
  ];
  const cleared = town.clearMinorRoads(lines, index, 0.3);
  assert.ok(cleared.length > 3);
  assert.ok(cleared.some(line => line.length === 3), 'unchanged bends/vertices remain joined');
  for (const line of cleared) for (let i = 1; i < line.length; i++) {
    for (const poly of buildings) assert.equal(town.polygonNearSegment(poly, ...line[i - 1], ...line[i], 0.29), false);
  }
  assert.equal(town.clearMinorRoads([[[0, 0], [0, 1]]], index, 0.3).length, 0, 'road fully under a roof is not drawn');
  assert.equal(JSON.stringify(town.clearMinorRoads(lines, index, 0.3)), JSON.stringify(cleared));
});

test('minor-road clipping is scene-local and shared by SVG drawing, labels and decoration reservations', () => {
  const ctx = context(['townMinorRoads', 'linePath'], { hexW: 100 });
  const entries = [{
    center: { x: 100, y: 200 }, radius: 10,
    shapes: { streets: [[[-2, 0], [2, 0]]] },
    final: [{ poly: square(99, 199, 2), parts: [square(105, 199, 2)] }],
  }, {
    center: { x: 110, y: 200 }, radius: 10, shapes: {},
    final: [{ poly: square(111, 199, 2), parts: [] }],
  }];
  ctx.townMinorRoads(entries);
  assert.equal(entries[0].minorRoads.length, 4);
  assert.equal(entries[0].minorRoadPath.split('M').length - 1, 4, 'separate SVG subpaths cannot bridge the blocked stretches');
  assert.equal(entries[1].minorRoadPath, '');
  assert.equal(entries[0].shapes.streets[0].length, 2, 'shared persisted geometry is not mutated');
  assert.match(slice('syncTownscapes'), /name === 'streets' \? entry.minorRoadPath/);
  assert.match(slice('buildTownLabelSpecs'), /entry.minorRoads \|\| entry.shapes.streets/);
  assert.match(slice('townDecorationIndex'), /streets: entry.minorRoads/);
});
