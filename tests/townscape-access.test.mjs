import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const links = await loadModule('anthroprocenia-townlinks.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
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
const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const roof = (poly, sourceIndex = 0) => ({ poly, sourceIndex, box: town.polygonBounds(poly), parts: [], detail: [], form: 'rect' });
function context(names, state = {}) {
  const ctx = vm.createContext({ ...town, ...links, hexW: 1, hashString: s => [...s].reduce((n, c) => n + c.charCodeAt(0), 0),
    isWaterAt: () => false, segmentTouchesWater: () => false, townSpots: () => [], err: e => assert.fail(e), ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
test('four inset roofs preserve aggregate capacity, deterministic IDs, and exact resident counts', () => {
  const originals = [roof(square(0, 0, 2), 5), roof(square(4, 0, 0.5), 6)];
  originals[0].parts = [square(0.1, 0.1, 0.3)];
  const quarters = town.quarterBuildings(originals);
  assert.equal(quarters.length, 8);
  assert.deepEqual(quarters.map(b => b.sourceIndex), ['5.0', '5.1', '5.2', '5.3', '6.0', '6.1', '6.2', '6.3']);
  assert.deepEqual(town.quarterBuildings(originals), quarters);
  for (let i = 0; i < quarters.length; i++) {
    assert.ok(town.validBuildingPolygon(quarters[i].poly));
    for (let j = i + 1; j < quarters.length; j++) assert.equal(town.polygonsOverlap(quarters[i].poly, quarters[j].poly, 0), false);
  }
  const area = b => (b.box.x1 - b.box.x0) * (b.box.y1 - b.box.y0);
  assert.ok(Math.abs(quarters.slice(0, 4).reduce((n, b) => n + area(b), 0) / area(originals[0]) - 0.9025 / 16) < 1e-10);
  assert.ok(Math.abs(quarters[0].box.x1 - quarters[0].box.x0 - 0.95 / 4) < 1e-10);
  for (const era of [0, 1, 2]) {
    const before = panel.buildingHousing(10003, originals, era), after = panel.buildingHousing(10003, quarters, era);
    assert.equal(after.capacity, before.capacity);
    assert.equal([...after.homes.values()].reduce((n, h) => n + h.count, 0), 10003);
    for (let id = 0; id < 10003; id++) assert.ok(after.homes.has(after.sourceOf(id)));
  }
});
test('approaches are deterministic, bend in open space, and route around an obstructing roof', () => {
  const start = { x: 0, y: 0 }, end = { x: 10, y: 0 }, obstacle = square(4, -1, 2);
  const clear = (a, b) => !town.polygonNearSegment(obstacle, a.x, a.y, b.x, b.y, 0);
  const waypoints = [{ x: 3.9, y: -1.1 }, { x: 6.1, y: -1.1 }, { x: 6.1, y: 1.1 }, { x: 3.9, y: 1.1 }];
  const options = { seed: 12, amplitude: 0.2, clear, waypoints };
  const path = town.approachPath(start, end, options);
  assert.ok(path && path.length >= 4);
  assert.ok(path.slice(1).every((p, i) => clear(path[i], p)));
  assert.deepEqual(town.approachPath(start, end, options), path);
  const open = town.approachPath(start, end, { seed: 12, amplitude: 0.2, clear: () => true });
  assert.ok(open.some(p => Math.abs(p.y) > 0.01));
  assert.equal(town.approachPath(start, end, { ...options, clear: () => false }), null);
  let preparations = 0;
  const lazyOptions = { ...options, waypoints: () => { preparations++; return waypoints; } };
  assert.deepEqual(town.approachPath(start, end, lazyOptions), path);
  assert.equal(preparations, 1);
  town.approachPath(start, end, { ...lazyOptions, clear: () => true });
  assert.equal(preparations, 1, 'open approaches never build detour geometry');
});
function entry(buildings) {
  return { pathKey: 'town', center: { x: 0, y: 0 }, radius: 2, final: buildings,
    shapes: { streets: [[[-1, -0.5], [1, -0.5]]], nodes: [[-1, -0.5], [1, -0.5]], edges: [[0, 1]] },
    obstacles: { circles: [], segments: [], roads: [] } };
}
test('every quarter roof gets a drawn approach ending at its routable door, with no sibling-roof crossings', () => {
  const e = entry(town.quarterBuildings([roof(square(-0.5, 0, 1))]));
  const ctx = context(['townPointBlocked', 'townAccessRoads', 'linePath', 'buildWalkGraph']);
  ctx.townAccessRoads([e]);
  assert.equal(e.accessRoads.length, 5);
  const graph = ctx.buildWalkGraph(e);
  assert.equal(graph.doorBuildings.size, 4);
  const routes = town.routeTree(graph, 0);
  for (const road of e.accessRoads.filter(road => road.sourceIndex !== undefined)) {
    const [door] = [...graph.doorBuildings].find(([, ref]) => ref.sourceIndex === road.sourceIndex);
    const end = road.pts.at(-1);
    assert.deepEqual([graph.nodes[door].x, graph.nodes[door].y], [end.x, end.y]);
    assert.ok(town.routeFromTree(routes, door));
    for (let i = 1; i < road.pts.length; i++) for (const b of e.final) if (b.sourceIndex !== road.sourceIndex)
      assert.equal(town.polygonNearSegment(b.poly, road.pts[i - 1].x, road.pts[i - 1].y, road.pts[i].x, road.pts[i].y, 0), false);
  }
  assert.equal((e.accessRoadPath.match(/M/g) || []).length, 5);
  const saved = e.accessRoadPath;
  ctx.townAccessRoads([e]); assert.equal(e.accessRoadPath, saved);
});
test('harbor access follows connected deck surfaces, never a shortcut over water', () => {
  const harbor = { ...links.waterfrontLayout({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 2, true), landing: { x: 0, y: 0 } };
  const docks = town.quarterBuildings(harbor.buildings.map((b, i) => ({ ...roof(b.poly, `dock${i}`), form: 'dock' })));
  const e = entry(docks);
  e.waterfront = harbor; e.waterfrontAccepted = true;
  e.shapes.streets = [[[-0.5, 0], [0, 0]]]; e.shapes.nodes = [[-0.5, 0], [0, 0]];
  const ctx = context(['townPointBlocked', 'townAccessRoads', 'linePath', 'buildWalkGraph'], { isWaterAt: x => x > 0.1 });
  ctx.townAccessRoads([e]);
  assert.equal(e.accessRoads.length, docks.length + harbor.buildings.length + 1 + harbor.decks.length);
  for (const road of e.accessRoads.filter(r => r.harbor)) for (let i = 1; i < road.pts.length; i++)
    assert.ok(links.deckEdgeAllowed(road.pts[i - 1], road.pts[i], harbor.decks));
  assert.equal(links.deckEdgeAllowed({ x: 0, y: 0 }, { x: 1, y: 1 }, harbor.decks), false);
  assert.equal(links.deckEdgeAllowed({ x: 0, y: 0 }, { x: 2, y: 0 }, [square(0, -0.1, 0.2), square(1.8, -0.1, 0.2)]), false);
  const graph = ctx.buildWalkGraph(e);
  assert.equal(graph.doorBuildings.size, docks.length);
});
test('blocked entrances report the obstruction and never get an invisible straight shortcut', () => {
  const e = entry([roof(square(0, 0, 0.2))]), errors = [];
  const ctx = context(['townPointBlocked', 'townAccessRoads', 'linePath', 'buildWalkGraph'],
    { isWaterAt: () => true, segmentTouchesWater: () => true, err: e => errors.push(e) });
  ctx.townAccessRoads([e]);
  assert.equal(e.accessRoads.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(ctx.buildWalkGraph(e).doorBuildings.size, 0);
});
test('coastal decks reach dry land and every deck edge has a road-connected approach', () => {
  const harbor = { ...links.waterfrontLayout({ x: 0, y: 0 }, { x: 4, y: 0 }, 2, true), landing: { x: 0, y: 0 } };
  assert.ok(links.deckEdgeAllowed(harbor.landing, { x: 4, y: 0 }, harbor.decks), 'long quay cannot float beyond its landing');
  const e = entry([]);
  e.waterfront = harbor; e.waterfrontAccepted = true;
  e.shapes.streets = [[[-0.5, 0], [0, 0]]]; e.shapes.nodes = [[-0.5, 0], [0, 0]];
  const ctx = context(['townPointBlocked', 'townAccessRoads', 'linePath', 'buildWalkGraph'], {
    isWaterAt: x => x >= 4, segmentTouchesWater: (a, b) => a.x >= 4 || b.x >= 4,
  });
  ctx.townAccessRoads([e]);
  assert.ok(e.waterfrontAccepted);
  assert.equal(e.accessRoads.filter(road => road.harbor).length, harbor.decks.length);
  const graph = ctx.buildWalkGraph(e), routes = town.routeTree(graph, 0);
  for (const road of e.accessRoads.filter(road => road.harbor)) {
    for (let i = 1; i < road.pts.length; i++) assert.ok(links.deckEdgeAllowed(road.pts[i - 1], road.pts[i], harbor.decks));
    const end = road.pts.at(-1), node = graph.nodes.findIndex(n => n.x === end.x && n.y === end.y);
    assert.ok(node >= 0 && town.routeFromTree(routes, node));
  }
});
test('an unreachable dry landing hides its coastal decks and roofs instead of showing an isolated harbor', () => {
  const harbor = { ...links.waterfrontLayout({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 2), landing: { x: 0, y: 0 } };
  const docks = town.quarterBuildings(harbor.buildings.map((b, i) => ({ ...roof(b.poly, `dock${i}`), form: 'dock' })));
  const e = entry(docks), errors = [];
  e.waterfront = harbor; e.waterfrontAccepted = true;
  const ctx = context(['townAccessRoads', 'linePath'], { segmentTouchesWater: () => true, err: e => errors.push(e) });
  ctx.townAccessRoads([e]);
  assert.equal(e.waterfrontAccepted, false);
  assert.equal(e.final.length, 0);
  assert.equal(e.accessRoads.length, 0);
  assert.equal(errors.length, 1);
});
test('offscreen entries release all derived data and leave the live cache while retaining an inspected home', () => {
  const cached = new Map(Array.from({ length: 24 }, (_, i) => [i, {
    polys: [roof(square(0, 0, 1))], final: town.quarterBuildings([roof(square(0, 0, 1))]),
    walkGraph: {}, accessRoads: [{}], accessRoadPath: 'old',
    housing: {}, housingRoofs: [{}], decorations: [{}], decoCandidates: [{}],
  }]));
  const visible = cached.get(23), inspected = cached.get(22);
  const records = [...cached.entries()];
  const ctx = context(['releaseTownSceneEntries'], {
    townEntryCache: cached, popState: { homeFilter: { entry: inspected } },
    townShapeCache: new Map(records), townPathCache: new Map(records),
  });
  ctx.releaseTownSceneEntries([visible]);
  assert.equal(visible.final.length, 4); assert.equal(inspected.final.length, 4);
  assert.equal(cached.size, 2);
  assert.equal(ctx.townShapeCache.size, 4); assert.equal(ctx.townPathCache.size, 4);
  for (const [i, entry] of records) {
    assert.equal(entry.polys.length, 1);
    if (i < 22) {
      assert.equal(entry.final, undefined); assert.equal(entry.walkGraph, undefined);
      assert.equal(entry.accessRoads, undefined); assert.equal(entry.accessRoadPath, undefined);
      assert.equal(entry.housing, undefined); assert.equal(entry.housingRoofs, undefined);
      assert.equal(entry.decorations, undefined); assert.equal(entry.decoCandidates, undefined);
    }
  }
});

test('streamed subdivision is identical but stops allocating after the accepted roof budget', () => {
  const originals = Array.from({ length: 1000 }, (_, i) => roof(square(i * 2, 0, 1), i));
  assert.deepEqual([...town.quarterBuildingGroups(originals.slice(0, 3))].flat(), town.quarterBuildings(originals.slice(0, 3)));
  let visited = 0;
  for (const b of originals) {
    const poly = b.poly;
    Object.defineProperty(b, 'poly', { get() { visited++; return poly; } });
  }
  const accepted = [];
  for (const group of town.quarterBuildingGroups(originals)) {
    if (accepted.length + group.length > 8) break;
    accepted.push(...group);
  }
  assert.equal(accepted.length, 8);
  assert.ok(visited < 100, `polygon reads: ${visited}; eager subdivision touches all 1,000 roofs`);
});

test('dense entrance planning keeps collision queries bounded while preserving all safe approaches', () => {
  const buildings = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++)
    buildings.push(roof(square(-0.9 + x * 0.18, -0.3 + y * 0.18, 0.16), buildings.length));
  const e = entry(town.quarterBuildings(buildings));
  let queries = 0;
  class CountedIndex extends town.DecorationIndex {
    recordsInBox(...args) { queries++; return super.recordsInBox(...args); }
  }
  const errors = [];
  let costCalls = 0;
  const ctx = context(['townPointBlocked', 'townAccessRoads', 'linePath', 'buildWalkGraph'], {
    DecorationIndex: CountedIndex, err: message => errors.push(message),
    walkEdgeCost: (...args) => { costCalls++; return town.walkEdgeCost(...args); },
  });
  const start = performance.now();
  const steps = ctx.townAccessRoads([e], true);
  assert.equal(e.accessRoads, undefined, 'creating a resumable plan does not route the entire town');
  for (let i = 0; i < 64; i++) assert.equal(steps.next().done, false);
  assert.equal(e.accessRoads, undefined, 'collision-index construction also yields before routing starts');
  for (const step of steps) {}
  console.log(`Dense entrance fixture: ${e.final.length} roofs, ${queries} queries, ${(performance.now() - start).toFixed(1)} ms, ${e.accessRoads.length} approaches`);
  assert.ok(e.accessRoads.length > e.final.length);
  assert.ok(queries < 16500, `collision queries: ${queries}`);
  assert.equal(errors.length, 0);
  const graph = ctx.buildWalkGraph(e);
  assert.equal(graph.doorBuildings.size, e.final.length);
  assert.ok(graph.nodes.length < e.accessRoads.length * 4.1, `shared approach nodes: ${graph.nodes.length}`);
  assert.equal(costCalls, graph.adj.reduce((n, list) => n + list.length, 0) / 2, 'score each undirected edge once');
  const graphSteps = ctx.buildWalkGraph(e, true);
  const before = queries;
  assert.equal(graphSteps.next().done, false);
  assert.equal(queries, before, 'the first graph step leaves collision work to later batches');
  let graphResult;
  do { graphResult = graphSteps.next(); } while (!graphResult.done);
  for (const key of ['nodes', 'adj', 'cost', 'destinations'])
    assert.deepEqual(graphResult.value[key], graph[key], `incremental ${key}`);
  const buildingsToAvoid = e.final.map(b => ({ poly: b.poly, box: b.box, door: [...graph.doorBuildings].find(([, ref]) => ref.sourceIndex === b.sourceIndex)?.[0] }));
  for (let i = 0; i < graph.adj.length; i++) for (let k = 0; k < graph.adj[i].length; k++) {
    const j = graph.adj[i][k];
    assert.equal(graph.cost[i][k], town.walkEdgeCost(graph.nodes[i], graph.nodes[j], { buildings: buildingsToAvoid }, i, j));
  }
});
