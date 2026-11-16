import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const links = await loadModule('anthroprocenia-townlinks.js');
const town = await loadModule('anthroprocenia-townscape.js');
const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const { segmentIntersection, nearestOnSegment, nearestOnPolyline, outermostNode, bridgeAt, planTownLinks } = links;
const { stepWalker, graphRoute, WALKER_FADE_SECONDS, generateTownscape } = town;

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

const ring = (x, y, radius) => Array.from({ length: 8 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 4) * radius * 0.8, y: y + Math.sin(i * Math.PI / 4) * radius * 0.8 }));
const townAt = (id, x, y, radius = 10, extra = {}) => ({ id, x, y, radius, nodes: ring(x, y, radius), roads: [], water: [], ...extra });

test('segments intersect where they cross and nowhere else', () => {
  const hit = segmentIntersection(0, 0, 10, 10, 0, 10, 10, 0);
  assert.ok(Math.abs(hit.x - 5) < 1e-9 && Math.abs(hit.y - 5) < 1e-9 && Math.abs(hit.t - 0.5) < 1e-9);
  assert.equal(segmentIntersection(0, 0, 10, 0, 0, 1, 10, 1), null, 'parallel');
  assert.equal(segmentIntersection(0, 0, 4, 4, 6, 0, 6, 10), null, 'extended lines would cross, the segments do not');
});

test('nearest points on segments and polylines', () => {
  assert.deepEqual({ ...nearestOnSegment(5, 3, 0, 0, 10, 0) }, { x: 5, y: 0, t: 0.5, d: 3 });
  assert.equal(nearestOnSegment(-4, 0, 0, 0, 10, 0).x, 0, 'clamped to the end');
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const hit = nearestOnPolyline(12, 6, line);
  assert.equal(hit.x, 10); assert.equal(hit.y, 6); assert.equal(hit.index, 1);
  assert.equal(nearestOnPolyline(0, 0, []), null);
  assert.equal(outermostNode([{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: -9, y: 0 }], { x: 0, y: 0 }, 1, 0).x, 5);
});

test('a bridge spans the river along the road, with a rail on each side', () => {
  const bridge = bridgeAt({ x: 50, y: 50 }, { x: 1, y: 0 }, 2, 1);
  const xs = bridge.poly.map(p => p[0]), ys = bridge.poly.map(p => p[1]);
  assert.ok(Math.min(...xs) < 48 && Math.max(...xs) > 52, 'longer than the river is wide');
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 1 + 1e-9, 'as wide as the road');
  assert.equal(bridge.rails.length, 2);
  assert.ok(bridge.rails.every(rail => rail.length === 2));
});

test('dense bridge preparation yields before work and preserves the complete synchronous result', () => {
  const roads = Array.from({ length: 120 }, (_, i) => {
    const y = i * 0.0001;
    return { pts: [{ x: -2, y }, { x: -1, y }], towns: [i] };
  });
  roads.push({ pts: [{ x: 2, y: 0 }, { x: 1, y: 0 }], towns: ['right'] });
  let queries = 0;
  const options = { width: 0.1, maxSpan: 3, isWet: x => { queries++; return Math.abs(x) < 0.8; } };
  const steps = links.bridgeRoadGaps(roads, { ...options, incremental: true });
  assert.equal(queries, 0);
  assert.equal(steps.next().done, false);
  assert.equal(queries, 0, 'initial call leaves input and painting unblocked');
  let result, yields = 1;
  do { result = steps.next(); yields++; } while (!result.done);
  assert.ok(yields > roads.length * 2, 'dense candidate comparisons also yield');
  assert.ok(result.value.bridges.length > 0);
  assert.deepEqual(result.value, links.bridgeRoadGaps(roads, options));
  const failing = links.bridgeRoadGaps(roads, { ...options, incremental: true, isWet() { throw new Error('wet lookup failed'); } });
  failing.next();
  assert.throws(() => failing.next(), /wet lookup failed/);
});

test('adjacent townscapes are joined by a road between their gates', () => {
  const towns = [townAt('a', 0, 0), townAt('b', 15, 0)];
  const plan = planTownLinks({ towns, width: 1 });
  assert.equal(plan.roads.length, 1);
  const [road] = plan.roads, [from, to] = road.pts;
  assert.ok(from.x > 0 && to.x < 15, 'the road runs from the facing side of one to the facing side of the other');
  assert.deepEqual([...road.towns].sort(), ['a', 'b']);
  assert.equal(plan.linksByTown.get('a').length, 1);
  assert.equal(plan.linksByTown.get('b').length, 1);
  assert.deepEqual(plan.linksByTown.get('a')[0].pts, road.pts, 'the people of each can walk it');
});

test('blocked town pairs are checked once while the remaining dry component still connects', () => {
  const towns = Array.from({ length: 12 }, (_, i) => townAt(String(i), i * 10, 0, 1, { tile: 0 }));
  const checks = new Map();
  const plan = planTownLinks({
    towns, width: 0.1, minGap: 100,
    allow(a, b) {
      const i = Math.round(a.x / 10), j = Math.round(b.x / 10), key = [i, j].sort((a, b) => a - b).join('|');
      checks.set(key, (checks.get(key) || 0) + 1);
      return i !== 0 && j !== 0;
    },
  });
  assert.deepEqual(plan.disconnectedTiles, [0], 'water-separated town remains explicitly disconnected');
  assert.equal(plan.roads.length, towns.length - 2, 'the dry towns still form a connected component');
  const blocked = [...checks].filter(([key]) => key.startsWith('0|'));
  assert.equal(blocked.length, towns.length - 1);
  assert.ok(blocked.every(([, count]) => count === 1), 'reverse and later component passes do not resample the same rejected crossing');
});

test('townscapes that overlap or are far apart are not joined, and each joins only its nearest few', () => {
  assert.equal(planTownLinks({ towns: [townAt('a', 0, 0), townAt('b', 3, 0)], width: 1 }).roads.length, 0, 'overlapping');
  assert.equal(planTownLinks({ towns: [townAt('a', 0, 0), townAt('b', 80, 0)], width: 1 }).roads.length, 0, 'far apart');
  const crowd = [townAt('c', 0, 0)];
  for (let i = 0; i < 8; i++) crowd.push(townAt(`n${i}`, Math.cos(i * Math.PI / 4) * 16, Math.sin(i * Math.PI / 4) * 16));
  const plan = planTownLinks({ towns: crowd, width: 1, maxNeighbors: 3 });
  assert.ok(plan.linksByTown.get('c').length <= 3);
  for (const list of plan.linksByTown.values()) assert.ok(list.length <= 3 + 0);
});

test('a river between two townscapes gets a bridge where the new road crosses it', () => {
  const rivers = [{ x1: 7.5, y1: -20, x2: 7.5, y2: 20, clear: 0.6 }];
  const plan = planTownLinks({ towns: [townAt('a', 0, 0), townAt('b', 15, 0)], rivers, width: 1 });
  assert.equal(plan.roads.length, 1);
  assert.equal(plan.bridges.length, 1);
  assert.ok(Math.abs(plan.bridges[0].x - 7.5) < 1e-9);
  const dry = planTownLinks({ towns: [townAt('a', 0, 0), townAt('b', 15, 0)], rivers: [{ x1: 7.5, y1: 30, x2: 7.5, y2: 60, clear: 0.6 }], width: 1 });
  assert.equal(dry.bridges.length, 0, 'no bridge when no river is crossed');
});

test('a townscape joins the map\'s road that passes it, and a bridge carries it over a river', () => {
  const road = [{ x: 11, y: -30 }, { x: 11, y: 30 }];
  const plan = planTownLinks({ towns: [townAt('a', 0, 0, 10, { roads: [road] })], rivers: [{ x1: 9.5, y1: -10, x2: 9.5, y2: 10, clear: 0.5 }], width: 1 });
  assert.equal(plan.roads.length, 1);
  assert.equal(plan.roads[0].kind, 'map');
  const end = plan.roads[0].pts[1];
  assert.ok(Math.abs(end.x - 11) < 1e-9, 'it ends on the map road');
  assert.equal(plan.bridges.length, 1);
  assert.equal(planTownLinks({ towns: [townAt('a', 0, 0, 10, { roads: [[{ x: 60, y: -30 }, { x: 60, y: 30 }]] })], width: 1 }).roads.length, 0, 'a distant road is not joined');
});

test('streams join the map\'s rivers and the streams of adjacent townscapes', () => {
  const stream = (x, y) => [{ x: x - 4, y }, { x: x + 4, y }];
  const rivers = [{ x1: -30, y1: 5, x2: 30, y2: 5, clear: 0.5 }];
  const plan = planTownLinks({ towns: [townAt('a', 0, 0, 10, { water: [stream(0, 0)] }), townAt('b', 15, 0, 10, { water: [stream(15, 0)] })], rivers, width: 1 });
  assert.ok(plan.water.some(w => w.kind === 'river'), 'to the map\'s river');
  const between = plan.water.find(w => w.kind === 'town');
  assert.ok(between, 'between the townscapes');
  assert.deepEqual([...between.towns].sort(), ['a', 'b']);
  const near = Math.min(...between.pts.map(p => p.x));
  assert.ok(near >= 3.9 && Math.max(...between.pts.map(p => p.x)) <= 11.1, 'from the nearest ends');
  const distant = planTownLinks({ towns: [townAt('a', 0, 0, 10, { water: [stream(0, 0)] })], rivers: [{ x1: -30, y1: 90, x2: 30, y2: 90, clear: 0.5 }], width: 1 });
  assert.ok(distant.water.length > 0, 'streams now reach a river beyond the old neighbour cutoff');
  assert.ok(distant.water.some(line => line.pts.some(p => p.y === 90)));
});

test('links work on real generated townscapes', () => {
  const make = (id, x, y) => {
    const shapes = generateTownscape({ seed: id.length * 31 + x, civKey: 'ROME', population: 2e5, kind: 'town', age: 0, lvl: 1 });
    const r = 20;
    return { id, x, y, radius: r, nodes: shapes.nodes.map(([nx, ny]) => ({ x: x + nx * r, y: y + ny * r })), roads: [], water: shapes.water.map(line => line.map(([wx, wy]) => ({ x: x + wx * r, y: y + wy * r }))) };
  };
  const plan = planTownLinks({ towns: [make('a', 0, 0), make('b', 38, 0), make('c', 19, 33)], rivers: [{ x1: 19, y1: -30, x2: 19, y2: 60, clear: 0.7 }], width: 0.7 });
  assert.ok(plan.roads.length >= 2);
  for (const road of plan.roads) for (const p of road.pts) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  assert.ok(plan.bridges.length >= 1);
});

test('people go into buildings and tents and come out again, fading as they do', () => {
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]], doorForms: new Map([[1, 'tent']]) };
  let state = 3;
  const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const walker = { node: 0, x: 0, y: 0, route: [0, 1], leg: 0, t: 0, wait: 0, speed: 5 };
  const seen = [];
  stepWalker(walker, graph, 1, () => 0, rand);
  stepWalker(walker, graph, 1, () => 0, rand);   // arrives at the door
  stepWalker(walker, graph, 0, () => 0, rand);
  assert.equal(walker.node, 1);
  assert.equal(walker.inside, true, 'goes inside at a door');
  assert.ok(walker.wait >= 2 * WALKER_FADE_SECONDS + 1);
  let min = 1, hidden = 0, previous = walker.fade, reappeared = false;
  for (let step = 0; step < 600 && walker.inside !== false; step++) {
    stepWalker(walker, graph, 0.05, () => 0, rand);
    seen.push(walker.fade);
    if (walker.fade < min) min = walker.fade;
    if (walker.fade === 0) hidden++;
    if (hidden && walker.fade > previous) reappeared = true;
    previous = walker.fade;
  }
  assert.equal(min, 0, 'fully out of sight inside');
  assert.ok(hidden > 0 && reappeared, 'comes out again');
  assert.ok(seen.every(f => f >= 0 && f <= 1));
  stepWalker(walker, graph, 0.05, () => 0, rand);
  assert.equal(walker.fade, 1);
  assert.equal(walker.inside, false);
});

test('people stay in plain sight at street corners and road ends, and graphs without doors work as before', () => {
  const plain = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]], doorForms: new Map([[0, 'rect']]) };
  const walker = { node: 0, x: 0, y: 0, route: [0, 1], leg: 0, t: 0, wait: 0, speed: 20 };
  for (let i = 0; i < 12; i++) stepWalker(walker, plain, 0.05, () => 0, () => 0.5);
  assert.equal(walker.node, 1);
  assert.equal(walker.inside, false);
  assert.equal(walker.fade, 1);
  const old = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]] };
  const walker2 = { node: 0, x: 0, y: 0, route: [0, 1], leg: 0, t: 0, wait: 0, speed: 2 };
  stepWalker(walker2, old, 1, () => 0, Math.random);
  assert.ok(Math.abs(walker2.x - 2) < 1e-9);
  assert.equal(walker2.fade, 1);
});

test('the playback draws the links, hides people indoors and walks them along the link roads', () => {
  assert.match(playback, /import \{ planTownLinks, segmentIntersection, nearestOnSegment, waterfrontLayout, bridgeRoadGaps, deckEdgeAllowed \} from '\.\/anthroprocenia-townlinks\.js';/);
  const sync = slice('syncTownscapes');
  assert.match(sync, /const plan = planEntryLinks\(entries\);/);
  assert.match(sync, /joined\.links \+= /);
  assert.match(sync, /joined\.linkWater \+= /);
  assert.match(sync, /joined\.bridges \+= polygonPath\(bridge\.poly\)/);
  assert.match(sync, /joined\.bridgeRails \+= /);
  assert.match(sync, /\.\.\.townRoadWidths\(hexW\)/, 'all street and link widths use the scaled road widths');
  assert.match(sync, /linkWater: thin \* 0\.9, bridges: thin \* 0\.5 \/ 20, bridgeRails: thin \* 0\.7 \/ 20/, 'water keeps its width while bridge outlines shrink');
  for (const name of ['links', 'linkWater', 'bridges', 'bridgeRails']) assert.match(slice('ensureTownscapeLayer'), new RegExp(`\\['${name}', \\{`));
  assert.match(slice('buildWalkGraph'), /entry\.obstacles\.roads\.concat\(entry\.linkRoads \|\| \[\]\)/);
  assert.match(slice('planEntryLinks'), /entry\.linkRoads = plan\.linksByTown\.get\(entry\.pathKey\)/);
  const tick = slice('peopleTick');
  assert.match(tick, /person\.fade < 0\.04\) continue;/);
  assert.match(tick, /fade: hit\.person\.fade/);
  assert.match(slice('syncWalkerDots'), /setAttribute\('opacity', String\(batch\.opacity\)\)/);
  assert.match(slice('personAt'), /if \(person\.fade < 0\.35\) continue;/);
  assert.match(slice('newWalker'), /inside: indoors, exiting: false/);
});

test('planEntryLinks turns visible townscape entries into links and gives each its roads', () => {
  const context = vm.createContext({
    ...links, hexW: 100, hexH: 115, mapPxW: 0, roadLines: new Map(), riverTileSegs: new Map(), basePos: [], Math, Map, Set, Array, Object,
    townLinkTile: () => 0, neighborsByIndex: [], iconPoints: [], fogMode: false,
    townPointBlocked: () => false, segmentTouchesWater: () => false, townTileWalls: () => [],
  });
  vm.runInContext(slice('planEntryLinks'), context);
  const shapes = generateTownscape({ seed: 9, civKey: 'ROME', population: 2e5, kind: 'town', age: 0, lvl: 1 });
  const entry = (key, x) => ({ item: { index: 0 }, pathKey: key, center: { x, y: 0 }, radius: 30, shapes, obstacles: { circles: [], roads: [], segments: [{ x1: x - 25, y1: -50, x2: x - 25, y2: 50, clear: 1 }] } });
  const a = entry('a', 0), b = entry('b', 55);
  const plan = vm.runInContext('planEntryLinks', context)([a, b]);
  assert.ok(plan.roads.length >= 1);
  assert.ok(a.linkRoads.length >= 1 && b.linkRoads.length >= 1);
  assert.equal(JSON.stringify(a.linkRoads.map(r => r.pts)), JSON.stringify(plan.roads.filter(r => r.towns.includes('a')).map(r => r.pts)));
  assert.ok(Array.isArray(graphRoute({ nodes: [{}, {}], adj: [[1], [0]] }, 0, 1)));
});

test('all same-tile towns form a connected network beyond the old distance and degree limits', () => {
  const towns = Array.from({ length: 8 }, (_, i) => townAt(`t${i}`, i * 100, 0, 10, { tile: 0 }));
  const plan = planTownLinks({ towns, width: 1, maxNeighbors: 0 });
  const reached = new Set(['t0']);
  for (let pass = 0; pass < towns.length; pass++) for (const road of plan.roads) {
    if (road.towns.some(id => reached.has(id))) for (const id of road.towns) reached.add(id);
  }
  assert.equal(reached.size, towns.length);
  assert.equal(plan.disconnectedTiles.length, 0);
});

test('tile connectivity revisits components and does not strand a bridge between two local clusters', () => {
  const xs = [0, 100, 1, 101, 2, 102];
  const towns = xs.map(x => townAt(String(x), x, 0, 0.01, { tile: 0, nodes: [{ x, y: 0 }] }));
  const edges = new Set(['0,1', '0,2', '1,2', '100,101', '100,102', '101,102', '0,100']);
  const plan = planTownLinks({ towns, width: 0.01, allow: (a, b) => edges.has([a.x, b.x].sort((a, b) => a - b).join(',')) });
  assert.equal(plan.disconnectedTiles.length, 0);
  assert.ok(plan.roads.some(road => road.towns.includes('0') && road.towns.includes('100')));
});

test('each town along a tile side links to the facing adjacent tile, not the opposite side', () => {
  const towns = [
    townAt('east-north', 20, -10, 5), townAt('east-south', 20, 10, 5), townAt('west', -20, 0, 5),
    townAt('neighbor-north', 80, -10, 5), townAt('neighbor-south', 80, 10, 5),
  ];
  towns.forEach((town, i) => Object.assign(town, { tile: i < 3 ? 0 : 1, tileCenter: { x: i < 3 ? 0 : 100, y: 0 }, neighbors: [i < 3 ? 1 : 0] }));
  const plan = planTownLinks({ towns, width: 1 });
  const sides = plan.roads.filter(road => road.kind === 'tile-side');
  for (const id of ['east-north', 'east-south', 'neighbor-north', 'neighbor-south']) assert.ok(sides.some(road => road.towns.includes(id)), id);
  assert.ok(sides.every(road => !road.towns.includes('west')));
});

test('nearby major roads supply the connection spine; rejected water crossings do not leave partial links', () => {
  const towns = [townAt('a', 0, 0, 10, { tile: 0 }), townAt('b', 100, 0, 10, { tile: 0 })];
  const mapRoads = [[{ x: -20, y: 12 }, { x: 120, y: 12 }]];
  const plan = planTownLinks({ towns, mapRoads, width: 1 });
  assert.ok(plan.roads.some(road => road.kind === 'major-connection' && road.pts.every(point => point.y === 12)));
  assert.ok(!plan.roads.some(road => road.kind === 'tile'));
  const blocked = planTownLinks({ towns, mapRoads, width: 1, allow: (a, b) => a.x === b.x });
  assert.equal(blocked.roads.length, 0);
  assert.deepEqual([...blocked.disconnectedTiles], [0]);
});

test('unloaded nearby towns supply compact road endpoints even with no visible roofs', () => {
  const ctx = vm.createContext({
    ...links, hexW: 100, hexH: 115, mapPxW: 1000, roadLines: new Map(), riverTileSegs: new Map(),
    basePos: [{ x: 0, y: 0 }, { x: 100, y: 0 }], neighborsByIndex: [[1], [0]], townLinkTile: () => 0,
    iconPoints: [{ x: 10, y: 50, item: { index: 0, kind: 'building' } }, { x: 130, y: 50, item: { index: 1, kind: 'building' } }],
    fogMode: false, segmentTouchesWater: () => false, townTileWalls: () => [],
    err: message => assert.fail(message),
  });
  vm.runInContext(slice('planEntryLinks'), ctx);
  const plan = ctx.planEntryLinks([]);
  assert.ok(plan.roads.some(road => road.kind === 'tile-side'));
});

test('town link planning reads only indexed scene tiles and passes only reachable rivers', () => {
  class IndexedMap extends Map {
    reads = [];
    get(tile) { this.reads.push(tile); return super.get(tile); }
    values() { assert.fail('must not scan the world'); }
    [Symbol.iterator]() { assert.fail('must not scan the world'); }
  }
  const road = { pts: [{ x: 5, y: 50 }, { x: 210, y: 90 }, { x: 135, y: 50 }], half: 1 };
  const roads = new IndexedMap([[0, [road]], [1, [road]]]);
  const rivers = new IndexedMap([[1, [
    { x1: -20, y1: -10, x2: -20, y2: 10, hw: 1 },
    { x1: 0, y1: 1000, x2: 0, y2: 1100, hw: 1 },
  ]]]);
  for (let tile = 2; tile < 20000; tile++) {
    roads.set(tile, [road]);
    rivers.set(tile, rivers.get(1));
  }
  rivers.reads.length = 0;
  rivers.set(2, [{ x1: -50, y1: 20, x2: -50, y2: 50, hw: 1 }]);
  let inputs;
  const ctx = vm.createContext({
    ...links, hexW: 100, hexH: 100, mapPxW: 1000,
    roadLines: roads, riverTileSegs: rivers,
    basePos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], neighborsByIndex: [[1], [0, 2], [1]],
    townLinkTile: () => 0,
    iconPoints: [{ x: 10, y: 50, item: { index: 0, kind: 'building' } }, { x: 130, y: 50, item: { index: 1, kind: 'building' } }],
    fogMode: false, segmentTouchesWater: () => false, townTileWalls: () => [],
    planTownLinks: options => { inputs = options; return links.planTownLinks(options); },
    err: () => {},
  });
  vm.runInContext(slice('planEntryLinks'), ctx);
  const plan = ctx.planEntryLinks([]);
  assert.deepEqual(roads.reads, [0, 1]);
  assert.deepEqual(rivers.reads, [0, 1, 2], 'river context includes the indexed road endpoint neighbor');
  assert.equal(inputs.mapRoads.length, 1, 'shared indexed road is deduplicated');
  assert.equal(inputs.rivers.length, 2, 'off-scene river is excluded but road-bend crossings are retained');
  assert.equal(plan.rivers.length, 2);
  assert.ok(plan.bridges.length >= 2, 'rivers beyond roof bounds still have bridge crossings');
  assert.ok(plan.roads.length, 'local roads and neighboring terminals are retained');
});

test('townscapes are drawn opaque, with thin streets, link roads and creeks', () => {
  const context = vm.createContext({ Number, Math });
  vm.runInContext(slice('opaqueTownColor'), context);
  const opaque = vm.runInContext('opaqueTownColor', context);
  assert.equal(opaque('rgba(200,100,50,1)'), 'rgb(200,100,50)');
  assert.equal(opaque('rgba(178,182,158,0.5)'), 'rgb(128,132,108)', 'blended over the ground colour');
  assert.equal(opaque('none'), 'none');
  assert.match(slice('ensureTownscapeLayer'), /key === 'highlight' \? attrs\[name\] : opaqueTownColor\(attrs\[name\]\)/, 'everything but the hover highlight');
  const widths = /const widths = \{([^}]*)\}/.exec(slice('syncTownscapes'))[1];
  const factor = name => Number(new RegExp(`\\b${name}: thin \\* ([\\d.]+)`).exec(widths)[1]);
  assert.match(widths, /\.\.\.townRoadWidths\(hexW\)/);
  for (const name of ['water', 'linkWater']) assert.ok(factor(name) <= 0.9, `${name} is thin`);
});

test('main squares have no background and roads have fully opaque higher-contrast colors without changing widths', () => {
  const layer = { style: {}, classList: { add() {} }, appendChild() {} };
  const ctx = vm.createContext({
    townLayer: null, townDecorationLayer: null, townPaths: null, DECO_GROUPS: town.DECO_GROUPS, MAP_DEPTH: 0,
    document: {
      createElementNS: (ns, tag) => tag === 'svg' ? layer : { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
      body: { appendChild() {} },
    },
  });
  vm.runInContext(slice('opaqueTownColor') + '\n' + slice('ensureTownscapeLayer'), ctx);
  ctx.ensureTownscapeLayer();
  assert.equal(ctx.townPaths.plazas.attrs.fill, 'none');
  assert.equal(ctx.townPaths.plazas.attrs.stroke, 'none');
  for (const name of ['streets', 'accessRoads', 'mainStreets', 'links', 'bridges', 'bridgeRails']) {
    assert.match(ctx.townPaths[name].attrs.stroke, /^#[0-9a-f]{6}$/i);
    for (const attr of ['opacity', 'stroke-opacity', 'fill-opacity']) assert.equal(ctx.townPaths[name].attrs[attr], '1');
    if (name !== 'bridges') assert.equal(ctx.townPaths[name].attrs.fill, 'none');
  }
  assert.equal(ctx.townPaths.streets.attrs.stroke, '#d0bb90');
  assert.equal(ctx.townPaths.accessRoads.attrs.stroke, '#f0d8a4', 'building-entrance approaches use a brighter opaque color');
  assert.equal(ctx.townPaths.mainStreets.attrs.stroke, '#e4cea2');
  assert.equal(ctx.townPaths.bridges.attrs.fill, '#b59a6c');
  assert.match(slice('syncTownscapes'), /\.\.\.townRoadWidths\(hexW\)/, 'the v39 physical road widths remain unchanged');
});