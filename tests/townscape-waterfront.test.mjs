import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const links = await loadModule('anthroprocenia-townlinks.js');
const town = await loadModule('anthroprocenia-townscape.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
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
  const ctx = vm.createContext(state);
  if (!functions.includes('townHousingFor')) functions = ['townHousingFor', ...functions];
  vm.runInContext(functions.map(slice).join('\n'), ctx);
  return ctx;
}
const obstacles = segments => ({ circles: [], segments, roads: [] });
const item = { kind: 'building', index: 0 };
function waterfront(state = {}) {
  return context(['townWaterfront'], {
    ...links, pointNearSegment: town.pointNearSegment, terrain: [8, 1], basePos: [{ x: -10, y: -12 }, { x: 10, y: -12 }],
    neighborsByIndex: [[1], [0]], hexW: 20, hexH: 24, mapPxW: 0, isWaterAt: x => x >= 10,
    ...state,
  });
}

test('harbors, quays and ports reach coastal water with decks and dockhouses; ordinary coasts get smaller landings', () => {
  const ctx = waterfront();
  for (const type of ['QUAY', 'HARBOR', 'HARBOUR', 'DOCK', 'PORT', 'SHIPYARD', 'COTHON', 'WHARF', 'MARINA']) {
    const layout = ctx.townWaterfront(item, { x: 0, y: 0 }, 3, `BUILDING_${type}`, obstacles([]));
    assert.equal(layout.buildings.length, 3, type);
    assert.ok(layout.decks.length >= 4);
    assert.ok(layout.buildings.every(b => b.poly.every(([x]) => x > 10)), 'dockhouses sit beyond the shoreline');
    assert.ok(layout.decks.some(poly => poly.some(([x]) => x < 10) && poly.some(([x]) => x > 10)));
    assert.deepEqual(JSON.parse(JSON.stringify(layout)), JSON.parse(JSON.stringify(ctx.townWaterfront(item, { x: 0, y: 0 }, 3, `BUILDING_${type}`, obstacles([])))));
  }
  const small = ctx.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_MARKET', obstacles([]));
  assert.equal(small.buildings.length, 1);
  assert.equal(small.decks.length, 2);
});

test('navigable rivers, lakes and non-navigable river lines support waterfronts but roads alone and dry inland tiles do not', () => {
  for (const waterType of [0, 1, 9, 10]) {
    const ctx = waterfront({ terrain: [8, waterType] });
    assert.equal(ctx.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_PORT', obstacles([])).buildings.length, 3);
  }
  const dry = waterfront({ terrain: [8, 8], isWaterAt: () => false });
  const river = { x1: 6, y1: -10, x2: 6, y2: 10, clear: 0.3 };
  const riverLayout = dry.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_DOCK', obstacles([river]));
  assert.equal(riverLayout.buildings.length, 3);
  assert.ok(riverLayout.decks.some(poly => poly.some(([x, y]) => town.pointNearSegment(x, y, 6, -10, 6, 10, 0.3))), 'landing extends into the river, not necessarily past its centre');
  assert.equal(dry.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_PORT', obstacles([])).decks.length, 0);
  assert.equal(dry.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_PORT', obstacles([{ ...river, road: true }])).decks.length, 0);
  assert.equal(dry.townWaterfront({ kind: 'unit', index: 0 }, { x: 0, y: 0 }, 3, 'UNIT_SHIP', obstacles([river])).decks.length, 0);
});

test('waterfront targeting respects map wrapping and points in the direction of the actual water', () => {
  const ctx = waterfront({
    basePos: [{ x: -10, y: -12 }, { x: 70, y: -12 }], mapPxW: 100,
    isWaterAt: x => x <= -10,
  });
  const layout = ctx.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_QUAY', obstacles([]));
  assert.equal(layout.buildings.length, 3);
  assert.ok(layout.buildings.every(b => b.poly.every(([x]) => x < -10)));
  assert.equal(links.waterfrontLayout({ x: 0, y: 0 }, { x: 0, y: 0 }, 3).decks.length, 0);
});

test('water-side home markers anchor their waterfront to actual neighbouring dry land, never open water', () => {
  const ctx = waterfront({
    terrain: [1, 8], isWaterAt: x => x < 10,
  });
  const layout = ctx.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_QUAY', obstacles([]));
  assert.equal(layout.buildings.length, 3);
  assert.ok(layout.decks.some(poly => poly.some(([x, y]) => !ctx.isWaterAt(x, y))), 'a gangway reaches land even when the home marker is in water');
  const connected = new Set([0]);
  for (let pass = 0; pass < layout.decks.length; pass++) layout.decks.forEach((poly, i) => {
    if ([...connected].some(j => town.polygonsOverlap(poly, layout.decks[j], 0.00001))) connected.add(i);
  });
  assert.equal(connected.size, layout.decks.length, 'all piers and cross-decks connect to the landing');
  assert.ok(layout.buildings.every(b => layout.decks.some(poly => town.polygonsOverlap(b.poly, poly))), 'every dockhouse rests on a connected deck');
  ctx.isWaterAt = () => true;
  assert.equal(ctx.townWaterfront(item, { x: 0, y: 0 }, 3, 'BUILDING_PORT', obstacles([])).decks.length, 0, 'no floating harbour without any land');
});

test('waterfront decks exclude decorations and dockhouses retain normal building hits, titles and selection', () => {
  const layout = links.waterfrontLayout({ x: 0, y: 0 }, { x: 6, y: 0 }, 3, true);
  const ctx = context(['townDecorationIndex'], { ...town, hexW: 20 });
  const entry = { center: { x: 0, y: 0 }, radius: 10, polys: [], shapes: {}, obstacles: obstacles([]), waterfront: layout };
  const index = ctx.townDecorationIndex([entry], null);
  assert.equal(index.blocks(6, 0, 0.02), true);
  assert.match(slice('townscapeFor'), /sourceIndex: `dock\$\{i\}`/);
  assert.match(slice('townscapeFor'), /form: 'dock', poly: b\.poly/);
  assert.match(slice('buildTownLabelSpecs'), /b\.form === 'dock' \? ' \(Dockhouse\)'/);
  assert.ok(slice('ensureTownscapeLayer').indexOf("['quays'") < slice('ensureTownscapeLayer').indexOf("['store'"));
  assert.doesNotMatch(slice('buildWalkGraph'), /waterfront/);
  assert.doesNotMatch(slice('planEntryLinks'), /waterfront/);
});

test('circular district walls are limited to palaces, forts and urban centres', () => {
  const circular = wall => wall.length >= 8 && wall[0][0] === wall[wall.length - 1][0] && wall[0][1] === wall[wall.length - 1][1];
  for (const typeKey of ['BUILDING_MARKET', 'BUILDING_TEMPLE', 'BUILDING_QUAY', 'IMPROVEMENT_FARM']) {
    const shapes = town.generateTownscape({ seed: 4, civKey: 'GREECE', population: 300000, age: 0, lvl: 2, typeKey });
    assert.equal(shapes.walls.some(circular), false, typeKey);
  }
  for (const typeKey of ['BUILDING_PALACE', 'BUILDING_FORT', 'DISTRICT_CITY_CENTER', 'DISTRICT_URBAN']) {
    const shapes = town.generateTownscape({ seed: 4, civKey: 'GREECE', population: 300000, age: 0, lvl: 2, typeKey });
    assert.ok(shapes.walls.some(wall => wall.length >= 5), typeKey);
  }
});

test('only the selected roof receives the selected-building title, including individual tents', async () => {
  const names = await loadModule('anthroprocenia-linenames.js');
  const poly = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const entry = { item, pathKey: 'town', kind: 'camp', population: 20, center: { x: 0, y: 0 }, radius: 3, shapes: {},
    final: ['tent0', 'tent1'].map(sourceIndex => ({ sourceIndex, group: 'tents', form: 'tent', poly, box: { x0: 0, y0: 0, x1: 1, y1: 1 } })) };
  entry.polys = entry.final;
  const ctx = context(['townLineSpec', 'buildTownLabelSpecs'], {
    ...names, ...panel, popState: { homeFilter: { sourceIndex: 'tent1', nodeId: 'home' } },
    itemHomeName: () => 'Encampment', personBaseId: id => id, popIconKey: () => ({ nodeId: 'home' }),
  });
  const titles = ctx.buildTownLabelSpecs([entry], null).filter(s => s.kind === 'selectedBuilding');
  assert.equal(titles.length, 1);
  assert.equal(titles[0].text, entry.final[1].name);
  assert.match(slice('townscapeFor'), /sourceIndex: `tent\$\{i\}`/);
});

test('tile-edge walls follow recorded fortifications on urban tiles, suppress shared edges and update on turn changes', () => {
  let buildings = new Map([[0, [0]], [1, [0]]]);
  const ctx = context(['townTileWalls'], {
    manifest: { buildingTypes: [[10, 'Walls'], [20, 'Farm']] }, townWallTypesKey: '', townWallTypes: new Set(),
    GameInfo: { TypeTags: [{ Type: 'BUILDING_FORTIFICATION', Tag: 'DISTRICT_WALL' }],
      Constructibles: { lookup: hash => ({ ConstructibleType: hash === 10 ? 'BUILDING_FORTIFICATION' : 'IMPROVEMENT_FARM' }) } },
    buildingsForPos: () => buildings, neighborsByIndex: [[1], [0]], basePos: [{ x: 0 }, { x: 20 }],
    hexW: 20, mapPxW: 100, popTileOwner: () => 1,
    EDGE_VERTS: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
    hexVert: (tile, v) => [tile * 20 + v, v],
  });
  const entries = [{ item: { index: 0 }, center: { x: 10 } }, { item: { index: 1 }, center: { x: 30 } }];
  assert.equal(ctx.townTileWalls(entries).length, 10);
  ctx.popTileOwner = tile => tile;
  assert.equal(ctx.townTileWalls(entries).length, 12, 'enemy walls keep their shared edges');
  buildings = new Map([[0, [0]]]);
  assert.equal(ctx.townTileWalls(entries).length, 6);
  const wrapped = ctx.townTileWalls([{ ...entries[0], center: { x: 110 } }]);
  assert.ok(wrapped.every(w => w.x1 >= 100 && w.x2 >= 100));
  buildings = new Map([[0, [1]]]);
  assert.equal(ctx.townTileWalls(entries).length, 0);
});

test('building selection filters people to their Home Location, preserves saved pins and can be cleared', () => {
  const home = { id: 'home', level: 'icon', label: 'The Docks', total: 3, children: [] };
  const other = { id: 'other', level: 'icon', label: 'Market', total: 2, children: [] };
  let rendered = 0, requested = 0;
  const ctx = context(['popFilteredTree', 'popRecomputeRows', 'popSelectBuilding', 'popClearHomeFilter'], {
    ...panel, personBaseId: id => id, popIndexNodes: () => new Map([[home.id, home], [other.id, other]]),
    popState: { open: true, tree: [home, other], expanded: new Set(), shown: new Map(), homeFilter: null, search: '', scroll: 100 },
    popIconKey: () => ({ nodeId: home.id }), popRefreshModel: () => {},
    popClearSearch: () => {}, popSelect: () => {}, popSortOptions: () => ({}),
    popPinnedRows: () => [{ type: 'person', node: other, index: 0 }],
    popRender: () => rendered++, requestViewApply: () => requested++, townLabelSpecKey: 'old',
    err: e => assert.fail(e),
  });
  assert.equal(ctx.popSelectBuilding({ item, building: { sourceIndex: 'dock0', name: 'Dockhouse' } }), true);
  assert.equal(ctx.popState.homeFilter.sourceIndex, 'dock0');
  assert.equal(ctx.popFilteredTree()[0], home);
  assert.ok(ctx.popState.expanded.has(home.id));
  assert.ok(ctx.popState.rows.every(row => !row.node || row.node.id === home.id));
  assert.equal(ctx.popPinnedRows().length, 1, 'saved pins are untouched');
  ctx.popClearHomeFilter();
  assert.equal(ctx.popState.homeFilter, null);
  assert.equal(ctx.popFilteredTree().length, 2);
  assert.equal(ctx.townLabelSpecKey, '');
  assert.equal(rendered, 2);
  assert.equal(requested, 2);
});

test('a building press wins over city details even when the engine click arrives first; drags still select walkers', () => {
  const hit = { item, building: { sourceIndex: 'dock0' } };
  const ctx = context(['personClickActive', 'onMapDragEnd'], {
    personPress: { time: 0 }, Date: { now: () => 2000 }, peopleActive: () => true,
    gameOverlayActive: () => false, clumpAt: () => null, personAt: () => null, townBuildingAt: () => hit,
    cmdInputActive: () => false, cmdHideBox: () => {}, lastMapDragEnd: 0,
    cmdSelectBox: () => calls.push('box'), popSelectBuilding: b => { assert.equal(b, hit); calls.push('building'); },
    cmdConsumeInput: () => { ctx.mapDrag = null; calls.push('consume'); }, err: e => assert.fail(e),
  });
  const calls = [];
  assert.equal(ctx.personClickActive({ x: 5, y: 5 }), true);
  ctx.mapDrag = { box: true, moved: false, building: hit };
  ctx.onMapDragEnd({ clientX: 5, clientY: 5 });
  assert.deepEqual(calls, ['building', 'consume']);
  calls.length = 0;
  ctx.mapDrag = { box: true, moved: true, building: hit };
  ctx.onMapDragEnd({ clientX: 6, clientY: 6 });
  assert.deepEqual(calls, ['box', 'consume']);
});
