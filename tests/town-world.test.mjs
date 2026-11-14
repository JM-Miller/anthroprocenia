import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const links = await loadModule('anthroprocenia-townlinks.js');
const town = await loadModule('anthroprocenia-townscape.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const people = await loadModule('anthroprocenia-people.js');
const crowds = await loadModule('anthroprocenia-crowds.js');
const { graphRoute, stepWalker, visibleQuota, WALKER_FADE_SECONDS } = town;

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

// A small hex map: 4 columns x 3 rows; tile index = row * 4 + col; the tile at col 1, row 1 is open sea.
const W = 4, hexW = 100, hexH = 115, rowStep = hexH * 0.75, maxRow = 2;
function world(waterTiles = [5]) {
  const basePos = [], idxByCR = new Int32Array(W * 3).fill(-1), terrain = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c;
    basePos[i] = { x: c * hexW + ((r & 1) ? hexW / 2 : 0), y: (maxRow - r) * rowStep };
    idxByCR[r * W + c] = i; terrain[i] = waterTiles.includes(i) ? 0 : 5;
  }
  const context = vm.createContext({
    basePos, idxByCR, terrain, layoutW: W, layoutCols: W, hexW, hexH, rowStep, maxRow, colShift: 0, mapPxW: W * hexW + hexW / 2, mapPxH: 3 * hexH,
    Math, Set, Map, Array, Number, ...panel, ...town, walkerWorkNode: () => -1, segmentIntersection: links.segmentIntersection, stepWalker, visibleQuota, WALKER_FADE_SECONDS, MAX_TOWN_PEOPLE: 60,
    townKey: 'k1', townPlan: null, townWorld: null, townWalkers: new Map(), peopleSvg: { style: {} }, peopleLoop: 1, peopleLast: 0,
    peopleCameraKey: () => 'camera', peopleViewKey: 'camera',
    popIconKey: entry => ({ nodeId: `n:${entry.pathKey}`, owner: 1 }), peopleActive: () => true, ensurePeopleLayer() {}, stopPeople() {}, nowMs: () => 0, requestAnimationFrame: () => 1,
    popIsPinned: () => false, popPins: () => [], popFollowMatches: () => false, popKeptWalking: () => [],
    cmdCombatant: () => false, battleTilesFor: () => new Set(), nodeTile: () => -1,
    popState: { open: false, nodeIndex: new Map() }, leadState: { open: false }, FAMILY_COHORT_SIZE: 8,
    landMilitaryUnit: people.landMilitaryUnit, popIconTraits: () => ({ unit: null }), walkerFormationTraits: () => ({ unitSub: '', unitState: '' }),
    walkerClumps: new crowds.WalkerClumps(), walkerRunnerDestination: () => undefined,
    walkerActivityDestination: () => undefined, walkerActivityArrival: () => {}, personProfileFor: () => ({}),
  });
  vm.runInContext(['townHousingFor', 'tileAtMapPoint', 'isWaterAt', 'segmentTouchesWater', 'walkEdgeAllowed', 'walkGraphFor', 'townWalkCrossings', 'buildTownWorld', 'walkerTravelCompanion', 'walkerGroupStreets', 'createWalkers', 'newWalker', 'syncPinnedWalkers', 'syncPeople', 'worldPartOf'].map(slice).join('\n'), context);
  return context;
}
const centre = (context, tile) => ({ x: context.basePos[tile].x + hexW / 2, y: context.basePos[tile].y + hexH / 2 });
const call = (context, name, ...args) => vm.runInContext(name, context)(...args);

// A townscape entry whose walk graph is a row of street nodes (two of them doors) starting at (x, y).
function entry(pathKey, tile, x, y, count = 6, spacing = 6) {
  const nodes = Array.from({ length: count }, (_, i) => ({ x: x + i * spacing, y }));
  const adj = nodes.map((_, i) => [i - 1, i + 1].filter(j => j >= 0 && j < count));
  return {
    pathKey, center: { x, y }, radius: Math.max(1, (count - 1) * spacing), item: { index: tile }, obstacles: { circles: [], roads: [] },
    final: [0, 1].map(sourceIndex => ({ sourceIndex, poly: [[x, y + 10], [x + 1, y + 10], [x + 1, y + 11], [x, y + 11]], box: { x0: x, x1: x + 1, y0: y + 10, y1: y + 11 } })),
    polys: [{ sourceIndex: 0 }, { sourceIndex: 1 }], linkRoads: [], population: 40, walkGraphKey: '0,1||',
    walkGraph: { nodes, adj, destinations: [0, count - 1], roadEnds: [], doorForms: new Map([[0, 'rect'], [count - 1, 'rect']]),
      doorBuildings: new Map([[0, { pathKey, sourceIndex: 0 }], [count - 1, { pathKey, sourceIndex: 1 }]]) },
  };
}

test('map points find their tile, and sea, coast, lake and river tiles are water', () => {
  const context = world([5]);
  const sea = centre(context, 5);
  assert.equal(call(context, 'tileAtMapPoint', sea.x, sea.y), 5);
  assert.equal(call(context, 'isWaterAt', sea.x, sea.y), true);
  const land = centre(context, 6);
  assert.equal(call(context, 'tileAtMapPoint', land.x, land.y), 6);
  assert.equal(call(context, 'isWaterAt', land.x, land.y), false);
  assert.equal(call(context, 'tileAtMapPoint', -5000, -5000), -1);
  for (const [code, water] of [[0, true], [1, true], [9, true], [10, true], [5, false], [2, false], [8, false]]) {
    context.terrain[6] = code;
    assert.equal(call(context, 'isWaterAt', land.x, land.y), water, `terrain ${code}`);
  }
  // points shifted by a whole map width land on the same tile
  context.terrain[6] = 0;
  assert.equal(call(context, 'isWaterAt', land.x + context.layoutCols * hexW, land.y), true);
});

test('a walking edge may not touch water, nor cross a river except on a bridge', () => {
  const context = world([5]);
  const sea = centre(context, 5), left = centre(context, 4), right = centre(context, 6);
  assert.equal(call(context, 'walkEdgeAllowed', left, right, [], []), false, 'straight across the sea');
  assert.equal(call(context, 'segmentTouchesWater', left, right), true);
  const land = centre(context, 8);
  const a = { x: land.x, y: land.y }, b = { x: land.x + 40, y: land.y };
  assert.equal(call(context, 'walkEdgeAllowed', a, b, [], []), true, 'dry land');
  const river = { x1: land.x + 20, y1: land.y - 50, x2: land.x + 20, y2: land.y + 50, clear: 3 };
  assert.equal(call(context, 'walkEdgeAllowed', a, b, [river], []), false, 'across a river');
  assert.equal(call(context, 'walkEdgeAllowed', a, b, [river], [{ x: land.x + 20, y: land.y, reach: 6 }]), true, 'across a bridge');
  assert.equal(call(context, 'walkEdgeAllowed', a, b, [river], [{ x: land.x + 20, y: land.y + 40, reach: 6 }]), false, 'a bridge elsewhere does not help');
  assert.equal(call(context, 'walkEdgeAllowed', a, b, [{ ...river, x1: land.x + 70, x2: land.x + 70 }], []), true, 'a river it does not reach');
  assert.ok(sea);
});

test('townscapes on the same tile share one network, so people can walk between them', () => {
  const context = world([5]), c = centre(context, 8);
  const a = entry('a', 8, c.x - 30, c.y), b = entry('b', 8, c.x + 10, c.y);
  const built = call(context, 'buildTownWorld', [a, b], null);
  const route = graphRoute(built.graph, built.parts.get('a').destinations[0], built.parts.get('b').destinations[1]);
  assert.ok(route, 'a door of one townscape reaches a door of the other');
  assert.equal(built.graph.nodes.length, 12);
  assert.equal(built.graph.destinations.length, 4);
  assert.equal(built.graph.doorForms.size, 4);
  for (let k = 0; k + 1 < route.length; k++) assert.equal(call(context, 'segmentTouchesWater', built.graph.nodes[route[k]], built.graph.nodes[route[k + 1]]), false);
});

test('dense same-tile networks connect without comparing every pair of street nodes', () => {
  const context = world([]), c = centre(context, 8);
  const a = entry('dense-a', 8, c.x - 20, c.y, 1000, 0.02);
  const b = entry('dense-b', 8, c.x + 5, c.y, 1000, 0.02);
  let distances = 0;
  context.Math = Object.create(Math);
  context.Math.hypot = (...args) => { distances++; return Math.hypot(...args); };
  const built = call(context, 'buildTownWorld', [a, b], null);
  assert.ok(graphRoute(built.graph, built.parts.get(a.pathKey).destinations[0], built.parts.get(b.pathKey).destinations[1]));
  assert.ok(distances < 20000, `distance calls: ${distances}; all-pairs joining requires roughly a million`);
});

test('townscapes on different tiles are not joined unless a road was planned between them', () => {
  const context = world([5]), c8 = centre(context, 8), c9 = centre(context, 9);
  const a = entry('a', 8, c8.x + 20, c8.y), b = entry('b', 9, c9.x - 20, c9.y);
  const apart = call(context, 'buildTownWorld', [a, b], null);
  assert.equal(graphRoute(apart.graph, apart.parts.get('a').destinations[0], apart.parts.get('b').destinations[0]), null);
  const plan = { rivers: [], bridges: [], roads: [{ pts: [{ x: c8.x + 50, y: c8.y }, { x: c9.x - 20, y: c9.y }], towns: ['a', 'b'], kind: 'town' }] };
  const joined = call(context, 'buildTownWorld', [a, b], plan);
  assert.ok(graphRoute(joined.graph, joined.parts.get('a').destinations[0], joined.parts.get('b').destinations[0]), 'along the road');
});

test('shared world includes local and connecting creeks and permits crossings only along rendered roads', () => {
  const context = world([]), c = centre(context, 8), a = entry('a', 8, c.x - 15, c.y);
  a.center = c; a.radius = 10;
  a.shapes = { water: [[[0, -1], [0, 1]]], streets: [], mainStreets: [] };
  a.obstacles = { roads: [], circles: [] };
  const closed = call(context, 'buildTownWorld', [a], null);
  assert.equal(graphRoute(closed.graph, 0, 5), null);
  const plan = { rivers: [], bridges: [], water: [], roads: [{ towns: [], pts: [{ x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }] }] };
  const crossing = call(context, 'buildTownWorld', [a], plan);
  assert.ok(graphRoute(crossing.graph, 0, 5), 'the road covers the entire creek crossing');
  assert.equal(crossing.graph.edgeAllowed({ x: c.x - 5, y: c.y + 2 }, { x: c.x + 5, y: c.y + 2 }), false, 'a shortcut near the road is not on it');
  plan.roads = [];
  plan.bridges = [links.bridgeAt(c, { x: 1, y: 0 }, 0.2, 0.5)];
  const bridge = call(context, 'buildTownWorld', [a], plan);
  assert.ok(graphRoute(bridge.graph, 0, 5), 'the visible bridge spans the gap left by clipped road strokes');
  plan.bridges = [];
  a.shapes.water = [];
  plan.roads = [];
  plan.water = [{ pts: [{ x: c.x, y: c.y - 20 }, { x: c.x, y: c.y + 20 }] }];
  const linkCreek = call(context, 'buildTownWorld', [a], plan);
  assert.equal(graphRoute(linkCreek.graph, 0, 5), null, 'connecting creeks use the same restriction');
});

test('a river between townscapes is crossed only where a bridge was built', () => {
  const context = world([5]), c = centre(context, 8);
  const a = entry('a', 8, c.x - 30, c.y, 4), b = entry('b', 8, c.x + 5, c.y, 4);
  const river = { x1: c.x - 6, y1: c.y - 80, x2: c.x - 6, y2: c.y + 80, clear: 2 };
  const closed = call(context, 'buildTownWorld', [a, b], { rivers: [river], bridges: [], roads: [] });
  assert.equal(graphRoute(closed.graph, closed.parts.get('a').destinations[0], closed.parts.get('b').destinations[0]), null, 'no bridge, no crossing');
  const bridged = call(context, 'buildTownWorld', [a, b], { rivers: [river], bridges: [{ x: c.x - 6, y: c.y, reach: 8 }], roads: [] });
  assert.ok(graphRoute(bridged.graph, bridged.parts.get('a').destinations[0], bridged.parts.get('b').destinations[0]), 'over the bridge');
});

test('townscapes separated by water are not joined, even on the same tile', () => {
  const context = world([8]), c = centre(context, 8);
  context.terrain[8] = 5;
  const left = entry('a', 8, c.x - 40, c.y, 3, 2), right = entry('b', 8, c.x + 38, c.y, 3, 2);
  const dry = call(context, 'buildTownWorld', [left, right], null);
  assert.ok(graphRoute(dry.graph, dry.parts.get('a').destinations[0], dry.parts.get('b').destinations[1]), 'joined on dry land');
  // flood the middle of the tile: a lake in the neighbouring tile does not matter, so put the sea over this tile's centre
  context.terrain[8] = 0;
  const wet = call(context, 'buildTownWorld', [left, right], null);
  assert.equal(graphRoute(wet.graph, wet.parts.get('a').destinations[0], wet.parts.get('b').destinations[1]), null);
});

test('people stay when the visible townscapes change: they are set down on the rebuilt network', () => {
  const context = world([5]), c = centre(context, 8);
  const a = entry('a', 8, c.x - 30, c.y), b = entry('b', 8, c.x + 10, c.y);
  context.townKey = 'k1';
  call(context, 'syncPeople', [a, b]);
  const groupA = context.townWalkers.get('a'), people = [...groupA.people];
  groupA.runnerCamps = { graph: context.townWorld.graph, candidates: [] };
  assert.ok(people.length > 0 && context.townWorld.key === 'k1');
  assert.ok(context.townWalkers.has('b'));
  const keep = people.map(p => p.key);
  // a third townscape appears and b scrolls away
  const d = entry('d', 8, c.x + 60, c.y, 3);
  context.townKey = 'k2';
  call(context, 'syncPeople', [a, d]);
  assert.equal(context.townWorld.key, 'k2');
  assert.equal(context.townWalkers.get('a'), groupA, 'the same group');
  assert.equal(JSON.stringify(groupA.people.map(p => p.key)), JSON.stringify(keep));
  assert.ok(groupA.people.every((p, i) => p === people[i]), 'the very same people');
  assert.ok(!context.townWalkers.has('b') && context.townWalkers.has('d'));
  const graph = context.townWorld.graph;
  assert.equal(groupA.graph, graph, 'the group references only its current shared graph');
  assert.equal(groupA.runnerCamps, null, 'old graph-bearing runner caches are released even when no runner requests a new route');
  for (const person of groupA.people) {
    assert.equal(person.x, graph.nodes[person.node].x);
    assert.equal(person.y, graph.nodes[person.node].y);
    assert.equal(person.route, null);
  }
  // an unchanged set does not rebuild the network
  const before = context.townWorld;
  call(context, 'syncPeople', [a, d]);
  assert.equal(context.townWorld, before);
});

test('panning to a neighboring scene preserves an in-progress route through unchanged local graphs without snapping the walker', () => {
  const context = world([]), c = centre(context, 8);
  const a = entry('a', 8, c.x - 30, c.y), b = entry('b', 8, c.x + 10, c.y);
  call(context, 'syncPeople', [b, a]);
  const person = context.townWalkers.get('a').people[0], offset = context.townWorld.parts.get('a').offset;
  person.node = offset + 1; person.target = offset + 2; person.route = [offset + 1, offset + 2];
  person.leg = 0; person.t = 0.4; person.inside = false;
  person.x = a.walkGraph.nodes[1].x + 2.4; person.y = a.walkGraph.nodes[1].y;
  const x = person.x, y = person.y;
  context.townKey = 'next-scene';
  call(context, 'syncPeople', [a, entry('d', 8, c.x + 60, c.y, 3)]);
  assert.equal(person.node, 1);
  assert.deepEqual(Array.from(person.route), [1, 2]);
  assert.equal(person.t, 0.4);
  assert.equal(person.x, x);
  assert.equal(person.y, y);
});

test('panning preserves an in-progress journey along unchanged inter-town roads', () => {
  const context = world([]), ca = centre(context, 8), cb = centre(context, 9);
  const a = entry('a', 8, ca.x - 20, ca.y), b = entry('b', 9, cb.x - 20, cb.y);
  const from = a.walkGraph.nodes[4], to = b.walkGraph.nodes[1];
  context.townPlan = { roads: [{ towns: ['a', 'b'], pts: [from, to] }] };
  call(context, 'syncPeople', [a, b]);
  const graph = context.townWorld.graph, [start, end] = [...graph.roadKeys.values()];
  const person = context.townWalkers.get('a').people[0];
  person.node = start; person.target = end; person.route = [start, end];
  person.leg = 0; person.t = 0.4; person.inside = false;
  person.x = from.x + (to.x - from.x) * person.t; person.y = from.y;
  const x = person.x, y = person.y;
  context.townKey = 'road-pan';
  call(context, 'syncPeople', [entry('new', 10, cb.x + 70, cb.y), a, b]);
  const expected = [...context.townWorld.graph.roadKeys.values()];
  assert.notEqual(expected[0], start, 'new local graphs shift the shared road-node offsets');
  assert.equal(person.node, expected[0]);
  assert.deepEqual(Array.from(person.route), expected);
  assert.equal(person.target, expected[1]);
  assert.equal(person.t, 0.4);
  assert.equal(person.x, x);
  assert.equal(person.y, y);
});

test('people walk from one townscape into the next and never step onto water', () => {
  const context = world([5]), c = centre(context, 8);
  const a = entry('a', 8, c.x - 30, c.y, 6), b = entry('b', 8, c.x + 10, c.y, 6);
  call(context, 'syncPeople', [a, b]);
  const graph = context.townWorld.graph, groupA = context.townWalkers.get('a');
  let state = 11;
  const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const partB = new Set(context.townWorld.parts.get('b').destinations);
  let visitedOther = false;
  for (let step = 0; step < 6000; step++) {
    for (const person of groupA.people) {
      stepWalker(person, graph, 0.1, groupA.pick, rand);
      if (partB.has(person.node)) visitedOther = true;
      assert.equal(call(context, 'isWaterAt', person.x, person.y), false, 'never on water');
      assert.ok(Number.isFinite(person.x) && Number.isFinite(person.y));
    }
  }
  assert.ok(visitedOther, 'people of one townscape reached the other');
  assert.equal(groupA.people.length, 40, 'nobody despawned');
});

test('the playback uses the shared network for walking and keeps link roads off water', () => {
  assert.match(slice('peopleTick'), /stepWalker\(person, townWorld\.graph, dt, group\.pick, Math\.random, group\.visitRoute, group\.onArrival, walkerPlanRoute\)/);
  assert.match(slice('planEntryLinks'), /allow: \(a, b\) => !segmentTouchesWater\(a, b\)/);
  assert.match(slice('planEntryLinks'), /const localRivers = rivers\.filter/);
  assert.match(slice('planEntryLinks'), /plan\.rivers = localRivers/);
  assert.match(slice('syncTownscapes'), /townPlan = plan;/);
  assert.match(slice('townPointBlocked'), /isWaterAt\(x, y\)/);
  assert.match(slice('stopPeople'), /townWorld = null;/);
  assert.match(playback, /import \{ planTownLinks, segmentIntersection, nearestOnSegment, waterfrontLayout, bridgeRoadGaps, deckEdgeAllowed \} from '\.\/anthroprocenia-townlinks\.js';/);
});
test('new adjacent-tile road plans are traversable in the real combined walking network', () => {
  const context = world([]), ca = centre(context, 8), cb = centre(context, 9);
  const a = entry('side-a', 8, ca.x - 20, ca.y), b = entry('side-b', 9, cb.x - 20, cb.y);
  const towns = [a, b].map((home, i) => ({
    id: home.pathKey, tile: home.item.index, x: home.center.x, y: home.center.y, radius: 20,
    tileCenter: i ? cb : ca, neighbors: [i ? 8 : 9], nodes: home.walkGraph.nodes, roads: [], water: [],
  }));
  const plan = links.planTownLinks({ towns, width: 0.1, allow: (p, q) => !context.segmentTouchesWater(p, q) });
  const built = context.buildTownWorld([a, b], plan);
  const route = graphRoute(built.graph, built.parts.get(a.pathKey).destinations[0], built.parts.get(b.pathKey).destinations[1]);
  assert.ok(route, 'a walker can actually follow the new side connection between homes');
  for (let i = 1; i < route.length; i++) assert.equal(context.segmentTouchesWater(built.graph.nodes[route[i - 1]], built.graph.nodes[route[i]]), false);
});
test('walking follows a bent road around water rather than shortcutting straight between its towns', () => {
  const context = world([5]), ca = centre(context, 4), cb = centre(context, 6), bottom = centre(context, 9);
  const a = entry('left', 4, ca.x - 20, ca.y), b = entry('right', 6, cb.x - 20, cb.y);
  const from = a.walkGraph.nodes[4], to = b.walkGraph.nodes[1];
  const plan = { rivers: [], water: [], bridges: [], roads: [{
    towns: ['left', 'right'], pts: [from, { x: from.x, y: bottom.y }, { x: to.x, y: bottom.y }, to],
  }] };
  assert.equal(context.segmentTouchesWater(from, to), true);
  const built = context.buildTownWorld([a, b], plan);
  const route = graphRoute(built.graph, built.parts.get('left').destinations[0], built.parts.get('right').destinations[1]);
  assert.ok(route);
  assert.ok(route.some(id => built.graph.nodes[id].y === bottom.y));
  for (let i = 1; i < route.length; i++) assert.equal(context.segmentTouchesWater(built.graph.nodes[route[i - 1]], built.graph.nodes[route[i]]), false);
});

test('link roads that would cross water are not built', () => {
  const towns = [
    { id: 'a', x: 0, y: 0, radius: 10, nodes: [{ x: 8, y: 0 }, { x: -8, y: 0 }], roads: [], water: [] },
    { id: 'b', x: 15, y: 0, radius: 10, nodes: [{ x: 7, y: 0 }, { x: 23, y: 0 }], roads: [], water: [] },
  ];
  assert.equal(links.planTownLinks({ towns, width: 1 }).roads.length, 1);
  const none = links.planTownLinks({ towns, width: 1, allow: () => false });
  assert.equal(none.roads.length, 0);
  assert.equal(none.linksByTown.get('a').length, 0);
  assert.equal(none.bridges.length, 0);
  const bridge = links.bridgeAt({ x: 0, y: 0 }, { x: 1, y: 0 }, 2, 1);
  assert.ok(bridge.reach >= 2, 'a bridge records how far along the river it reaches');
});
