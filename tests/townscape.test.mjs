import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-townscape.js', import.meta.url), 'utf8');
const m = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { generateTownscape, townEra, townRadiusHex, TOWNSCAPE_CIVS, graphRoute, stepWalker, townLayoutStyle } = m;

const forms = shapes => new Set(shapes.buildings.map(b => b.form));
const town = (civ, age, lvl, population = 3e5, seed = 4) => generateTownscape({ seed, civKey: civ, population, kind: 'town', age, lvl });

test('every in-game civilization has its own culture profile', () => {
  for (const civ of ['ABBASID', 'AKSUM', 'AMERICA', 'ASSYRIA', 'BABYLON', 'BUGANDA', 'BULGARIA', 'CARTHAGE', 'CHOLA', 'DAIVIET', 'EGYPT', 'ENGLAND',
    'FRENCHEMPIRE', 'GAUL', 'GORYEO', 'GREATBRITAIN', 'GREECE', 'HAN', 'HAWAII', 'HEIAN', 'ICELAND', 'INCA', 'JOSEON', 'KHMER', 'MAJAPAHIT', 'MAURYA',
    'MAYA', 'MEIJI', 'MEXICO', 'MING', 'MISSISSIPPIAN', 'MONGOLIA', 'MUGHAL', 'NEPAL', 'NORMAN', 'OTTOMANS', 'PERSIA', 'PIRATEREPUBLIC', 'PRUSSIA',
    'QAJAR', 'QING', 'ROME', 'RUSSIA', 'SENGOKU', 'SHAWNEE', 'SIAM', 'SILLA', 'SONGHAI', 'SPAIN', 'TONGA']) {
    assert.ok(TOWNSCAPE_CIVS.includes(civ), civ);
  }
});

test('cultures build their own signature monuments', () => {
  assert.ok(forms(town('MAYA', 0, 2)).has('pyramid'));
  assert.ok(forms(town('PERSIA', 0, 2)).has('dome'));
  assert.ok(forms(town('HAN', 0, 2)).has('pagoda'));
  assert.ok(forms(town('BABYLON', 0, 2)).has('ziggurat'));
  assert.ok(forms(town('KHMER', 0, 2)).has('temple'));
  assert.ok(forms(town('MAURYA', 0, 2)).has('stupa'));
  assert.ok(forms(town('NORMAN', 1, 1)).has('church'));
  assert.ok(forms(town('MISSISSIPPIAN', 0, 2)).has('mound'));
  assert.ok(forms(town('ROME', 0, 2)).has('amphitheatre'));
  assert.ok(forms(town('GREECE', 0, 2)).has('theatre'));
  assert.ok(town('ROME', 0, 2).accents.length > town('HAN', 0, 2).accents.length - 100);
  const styles = new Set(['ROME', 'ENGLAND', 'PERSIA', 'INCA', 'EGYPT', 'KHMER', 'MONGOLIA', 'GREECE'].map(civ => townLayoutStyle(civ)));
  assert.equal(styles.size, 8, 'street plans differ between cultures');
});

test('the age and how far into it the game is decide what has been built', () => {
  const early = town('ROME', 0, 0), late = town('ROME', 0, 2);
  assert.ok(!forms(early).has('temple') && !forms(early).has('amphitheatre'));
  assert.ok(forms(early).has('hut') || forms(early).has('shrine'));
  assert.ok(forms(late).has('temple') && forms(late).has('amphitheatre'));
  assert.ok(late.accents.length > early.accents.length, 'the late town has an aqueduct');
  const capital = (civKey, age, lvl) => generateTownscape({ seed: 4, civKey, population: 3e5, kind: 'town', age, lvl, typeKey: 'BUILDING_PALACE' });
  const earlyWalls = capital('ROME', 0, 0).walls, stone = capital('ROME', 0, 2).walls[0];
  assert.equal(earlyWalls.length, 0, 'bumpy palisade rings are removed');
  assert.ok(stone.length < 10, 'later stone walls remain');
  assert.ok(late.buildings.filter(b => b.form === 'tower').length >= 4, 'the stone wall has towers');
  const castle = town('NORMAN', 1, 0);
  assert.ok(forms(castle).has('castle'));
  assert.ok(capital('ENGLAND', 1, 2).walls.some(wall => wall.length === 13), 'late exploration palace gets a star fort');
  const modern = town('AMERICA', 2, 1, 2e6);
  assert.ok(forms(modern).has('factory') && forms(modern).has('skyscraper'));
  assert.equal(modern.walls.length, 0, 'no city walls in the modern age');
  assert.ok(modern.accents.length > 20 && modern.parks.length > 0, 'railway and parks');
  assert.ok(forms(town('ROME', 0, 1)).has('hut') === forms(town('ROME', 0, 1)).has('hut'));
  assert.deepEqual(townEra('EXPLORATION', 300), { age: 1, lvl: 2 });
  assert.deepEqual(townEra('ANTIQUITY', 149), { age: 0, lvl: 0 });
  assert.deepEqual(townEra('MODERN', 150), { age: 2, lvl: 1 });
  assert.deepEqual(townEra('', undefined), { age: 0, lvl: 0 });
});

test('all townscape kinds span 10 miles on a 100 mile tile regardless of population or era', () => {
  for (const pop of [300, 1e3, 1e4, 1e5, 1e6, 1e7]) for (const age of [0, 1, 2]) for (const kind of ['town', 'camp', 'battle']) {
    assert.equal(townRadiusHex(pop, { age, lvl: 1 }, kind) * 2 * 100, 10);
  }
});

test('every town has a street graph for people to walk', () => {
  for (const civ of TOWNSCAPE_CIVS) {
    for (const age of [0, 1, 2]) {
      const shapes = town(civ, age, 1, 1e5);
      assert.ok(shapes.nodes.length >= 4 && shapes.edges.length >= 3 && shapes.people >= 3, civ);
      for (const [a, b] of shapes.edges) assert.ok(a < shapes.nodes.length && b < shapes.nodes.length);
    }
  }
});

test('the playback builds a walk graph that joins roads, avoids rivers and trees, and gives buildings doors', async () => {
  const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  const start = playback.indexOf('function tileAtMapPoint(mx, my) {'), end = playback.indexOf('function peopleTick()', start);
  assert.ok(start > 0 && end > start);
  const { runInNewContext } = await import('node:vm');
  const context = { hexW: 40, terrain: null, townKey: 'k', townWorld: null, segmentIntersection: null, pointNearSegment: m.pointNearSegment, walkEdgeCost: m.walkEdgeCost, stepWalker, visibleQuota: m.visibleQuota, WALKER_FADE_SECONDS: m.WALKER_FADE_SECONDS, MAX_TOWN_PEOPLE: 60, Math, Set, Map, Array, Object, hashString: s => [...String(s)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7), popIconKey: () => ({ nodeId: 'c:o1|k:1|t:1|i:b1.0.0', owner: 1 }),
    DecorationIndex: m.DecorationIndex, nearestNodeLookup: m.nearestNodeLookup, walkCreekAllowed: m.walkCreekAllowed, walkerWorkNode: () => -1, buildingDoorPoint: m.buildingDoorPoint,
    pins: [], popPins: () => context.pins, popIsPinned: key => context.pins.some(p => p.key === key),
    landMilitaryUnit: () => false, popIconTraits: () => ({ unit: null }),
    popFollowMatches: () => false, popKeptWalking: () => context.pins };
  context.segmentIntersection = (await (await import('./load.mjs')).loadModule('anthroprocenia-townlinks.js')).segmentIntersection;
  context.buildingHousing = (await (await import('./load.mjs')).loadModule('anthroprocenia-population-panel.js')).buildingHousing;
  runInNewContext(playback.match(/function townHousingFor[\s\S]*?\n}/)[0] + '\n' + playback.slice(start, end) + '\nthis.buildWalkGraph = buildWalkGraph; this.createWalkers = createWalkers; this.buildTownWorld = buildTownWorld;', context);
  const shapes = generateTownscape({ seed: 2, civKey: 'ROME', population: 2e5, kind: 'town', age: 0, lvl: 1 });
  const center = { x: 1000, y: 1000 }, radius = 20;
  const abs = poly => poly.map(([x, y]) => [center.x + x * radius, center.y + y * radius]);
  const final = shapes.buildings.slice(0, 20).map((b, sourceIndex) => { const poly = abs(b.poly); return { sourceIndex, poly, box: m.polygonBounds(poly) }; });
  const road = { half: 0.5, pts: [{ x: 1000, y: 1000 + radius * 0.8 }, { x: 1000, y: 1000 + radius * 1.4 }, { x: 1000, y: 1000 + radius * 1.6 }] };
  const base = { pathKey: 'a', shapes, center, radius, final, polys: final, population: 5000, item: { index: 1 }, obstacles: { circles: [], segments: [], roads: [road] } };
  const open = context.buildWalkGraph(base);
  assert.ok(open.cost.length === open.adj.length && open.cost.every((list, i) => list.length === open.adj[i].length && list.every(c => c >= 0)), 'every edge has a walking cost');
  assert.ok(open.nodes.length > shapes.nodes.length, 'road points become nodes');
  assert.ok(open.destinations.length >= 2 && open.roadEnds.length === 1);
  const roadNode = open.nodes.length - 1;
  const fromTown = graphRoute(open, open.destinations[0], roadNode);
  assert.ok(fromTown, 'the road is reachable along streets');
  const trees = { ...base, obstacles: { circles: [{ x: center.x, y: center.y, r: radius * 0.4 }], segments: [], roads: [] } };
  const blocked = context.buildWalkGraph(trees);
  assert.ok(blocked.nodes.length < open.nodes.length);
  for (const point of blocked.nodes) assert.ok(Math.hypot(point.x - center.x, point.y - center.y) >= radius * 0.4 - 1e-6);
  const river = { ...base, obstacles: { circles: [], segments: [{ x1: 960, y1: 1000, x2: 1040, y2: 1000, clear: 2, road: false }], roads: [] } };
  for (const point of context.buildWalkGraph(river).nodes) assert.ok(Math.abs(point.y - 1000) > 2 - 1e-6);
  // Trees, riverbanks, resources and improvements around the town become spots people walk out to, beside (not on) them.
  const around = { ...base, obstacles: { circles: [{ x: center.x + radius * 1.2, y: center.y, r: 2, kind: 'forest' }, { x: center.x, y: center.y - radius * 1.2, r: 2, kind: 'improvement', name: 'Farm' }, { x: center.x - radius * 1.3, y: center.y, r: 2, kind: 'mountain' }],
    segments: [{ x1: center.x - radius, y1: center.y + radius * 1.3, x2: center.x + radius, y2: center.y + radius * 1.3, clear: 1, road: false }], roads: [road], resources: [{ x: center.x - radius * 0.9, y: center.y - radius * 0.9, name: 'Iron' }] } };
  const spotted = context.buildWalkGraph(around), kinds = [...spotted.spots.values()].map(s => s.kind).sort();
  assert.deepEqual(kinds, ['field', 'resource', 'river', 'tree'], 'one spot per tree, field, riverbank and resource; none for mountains');
  for (const [node, spot] of spotted.spots) {
    assert.ok(spotted.adj[node].length >= 1, `the ${spot.kind} spot is joined to the streets`);
    assert.ok(graphRoute(spotted, spotted.destinations[0], node), `the ${spot.kind} spot can be walked to`);
  }
  assert.equal([...spotted.spots.values()].find(s => s.kind === 'field').name, 'Farm');
  assert.equal([...spotted.spots.values()].find(s => s.kind === 'resource').name, 'Iron');
  const treeSpot = spotted.nodes[[...spotted.spots].find(([, s]) => s.kind === 'tree')[0]];
  assert.ok(Math.hypot(treeSpot.x - (center.x + radius * 1.2), treeSpot.y - center.y) > 2, 'the tree spot is beside the tree');
  const riverSpot = spotted.nodes[[...spotted.spots].find(([, s]) => s.kind === 'river')[0]];
  assert.ok(riverSpot.y < center.y + radius * 1.3 - 1, 'the river spot is on the bank facing the town');
  const spotWorld = context.buildTownWorld([around], null);
  assert.equal(spotWorld.graph.spots.size, 4);
  assert.equal(JSON.stringify([...spotWorld.parts.get('a').spots].sort()), JSON.stringify([...spotWorld.graph.spots.keys()].sort()));
  const world = context.buildTownWorld([base], null);
  context.townWorld = world;
  const walkers = context.createWalkers(base, world);
  assert.ok(walkers.people.length === 60 && walkers.people.every(p => Number.isFinite(p.x)), 'a big icon shows up to 60 of its people');
  assert.ok(walkers.quota.visible >= walkers.quota.min && walkers.quota.visible <= walkers.quota.max);
  assert.equal(walkers.people.filter(p => !p.inside).length, walkers.quota.visible, 'the quota counts the people in sight');
  assert.ok(Number.isInteger(walkers.pick()));
  // A pinned person always has a walker: one of the usual few is marked, and one beyond them gets an extra walker of their own.
  const nodeId = 'c:o1|k:1|t:1|i:b1.0.0';
  context.pins = [{ key: `${nodeId}#3`, nodeId, index: 3 }, { key: `${nodeId}#4000`, nodeId, index: 4000 }, { key: `${nodeId}#9000`, nodeId, index: 9000 }];
  const pinnedGroup = context.createWalkers(base, world);
  assert.equal(pinnedGroup.people.length, 61, 'one extra walker; the pin beyond the population has none');
  assert.ok(pinnedGroup.people.find(p => p.id === 3).pinned);
  const extra = pinnedGroup.people.find(p => p.id === 4000);
  assert.ok(extra && extra.extra && extra.pinned && !extra.inside);
  context.pins = [];
  context.townWalkers = new Map([['a', pinnedGroup]]);
  runInNewContext('syncPinnedWalkers(this.g, this.w.parts.get("a"), this.w.graph)', Object.assign(context, { g: pinnedGroup, w: world }));
  assert.equal(pinnedGroup.people.length, 60, 'unpinning lets the extra walker go');
  assert.ok(pinnedGroup.people.every(p => !p.pinned));
});

test('people are only calculated while the townscapes are visible', async () => {
  const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  assert.match(playback, /function peopleActive\(\) \{\s*return townscapeActive\(\);/);
  assert.match(playback, /function syncPeople\(entries, preparedWorld = null\) \{\s*if \(!peopleActive\(\)\) \{ stopPeople\(\); return; \}/);
  assert.match(playback, /if \(!peopleActive\(\) \|\| !townLayer \|\| !peopleSvg \|\| !townWorld\) \{ stopPeople\(\); return; \}/);
  assert.match(playback, /if \(unitIcon\) \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); selectMapUnitIcon\(unitIcon\.item,/);
  assert.match(playback, /homePopulation\(estimatedWorldPopulation\(currentMapYear\(\)\), entityCountForPos\(\), seed,/);
});

test('the townscape highlight is cleared whenever the hover handler does not keep it', async () => {
  const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  assert.match(playback, /function onMapHover\(e\) \{\s*townHoverKeep = false;[\s\S]*?finally \{ if \(!townHoverKeep\) \{ try \{ setTownHighlight\(null\); \}/);
  assert.match(playback, /townHoverKeep = true;/);
  assert.match(playback, /document\.addEventListener\('mouseleave', \(\) => \{ hideRegionHover\(true\); lastHoverPoint = null; try \{ setTownHighlight\(null\)/);
  assert.match(playback, /townLayer\.style\.display = 'block';\s*syncTownElementVisibility\(\);\s*syncTownCompass\(\);\s*revalidateTownHover\(\);/);
  // The extracted highlight logic behaves: set, keep, then clear.
  const start = playback.indexOf('function setTownHighlight(key) {'), end = playback.indexOf('function townBuildingAt', start);
  const { runInNewContext } = await import('node:vm');
  const attrs = {};
  const context = { townHighlightKey: null, townHits: [{ item: {}, key: 'a', d: 'M0,0Z' }], townPaths: { highlight: { setAttribute: (name, value) => { attrs[name] = value; } } }, lastHoverPoint: null,
    townBuildingAt: () => null, iconAt: () => null, submitTownGeometry: paths => { attrs.d = paths.highlight; } };
  runInNewContext(playback.slice(start, end) + '\nthis.setTownHighlight = setTownHighlight; this.revalidateTownHover = revalidateTownHover; this.state = () => townHighlightKey;', context);
  context.setTownHighlight('a');
  assert.equal(context.state(), 'a');
  assert.equal(attrs.d, 'M0,0Z');
  context.revalidateTownHover();
  assert.equal(context.state(), null, 'no cursor over it any more');
  assert.equal(attrs.d, '');
  context.setTownHighlight('a');
  context.lastHoverPoint = { x: 1, y: 1 };
  context.townBuildingAt = () => ({ key: 'a' });
  context.revalidateTownHover();
  assert.equal(context.state(), 'a', 'still under the cursor');
  context.setTownHighlight(null);
  assert.equal(context.state(), null);
});
function graphOf(shapes) {
  const nodes = shapes.nodes.map(([x, y]) => ({ x, y })), adj = nodes.map(() => []);
  for (const [a, b] of shapes.edges) { adj[a].push(b); adj[b].push(a); }
  return { nodes, adj };
}

test('people walk along the street graph from building to building', () => {
  for (const civ of ['ROME', 'ENGLAND', 'INCA', 'KHMER', 'EGYPT', 'AMERICA']) {
    const graph = graphOf(town(civ, 0, 1, 2e5));
    const reachable = graph.nodes.map((_, i) => graphRoute(graph, 0, i)).filter(Boolean).length;
    assert.ok(reachable >= graph.nodes.length * 0.9, `${civ}: ${reachable}/${graph.nodes.length}`);
    assert.deepEqual(graphRoute(graph, 2, 2), [2]);
    let state = 7;
    const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    const walker = { node: 0, x: graph.nodes[0].x, y: graph.nodes[0].y, route: null, leg: 0, t: 0, wait: 0, speed: 0.05 };
    const pick = () => Math.floor(rand() * graph.nodes.length);
    const visited = new Set([0]);
    for (let step = 0; step < 4000; step++) {
      stepWalker(walker, graph, 0.1, pick, rand);
      assert.ok(Number.isFinite(walker.x) && Number.isFinite(walker.y));
      assert.ok(Math.hypot(walker.x, walker.y) < 1.4, 'stays inside the town');
      visited.add(walker.node);
    }
    assert.ok(visited.size >= 3, `${civ} walked to several places`);
  }
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]] };
  const walker = { node: 0, x: 0, y: 0, route: [0, 1], leg: 0, t: 0, wait: 0, speed: 2 };
  stepWalker(walker, graph, 1, () => 0, Math.random);
  assert.ok(Math.abs(walker.x - 2) < 1e-9 && walker.y === 0, 'moves at its speed along the edge');
  assert.equal(graphRoute({ nodes: [{}, {}], adj: [[], []] }, 0, 1), null);
});

test('a pinned person never goes indoors, and one who is indoors comes straight out', () => {
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]], doorForms: new Map([[0, 1], [1, 1]]) };
  const quota = { visible: 1, min: 0, max: 5, people: [] };
  const walker = { node: 0, x: 0, y: 0, route: null, leg: 0, t: 0, wait: 0, speed: 1, quota, pinned: true };
  quota.people.push(walker);
  for (let step = 0; step < 400; step++) {
    stepWalker(walker, graph, 0.1, w => 1 - w.node, Math.random);
    assert.equal(walker.inside, false, 'stays outside at every door');
  }
  const indoors = { node: 0, x: 0, y: 0, route: null, leg: 0, t: 0, wait: 30, waitTotal: 30, inside: true, exiting: false, fade: 0, speed: 1, quota: { visible: 0, min: 0, max: 5 }, pinned: true };
  stepWalker(indoors, graph, 0.1, () => 1, Math.random);
  assert.equal(indoors.exiting, true);
  assert.equal(indoors.quota.visible, 1);
  for (let step = 0; step < 40 && indoors.inside; step++) stepWalker(indoors, graph, 0.1, () => 1, Math.random);
  assert.equal(indoors.inside, false, 'out within the fade time');
});

test('people go round trees, rivers and buildings when there is another way, and through them when there is not', () => {
  // A square: 0 - 1 - 2 straight along the top, or 0 - 3 - 4 - 2 the long way round underneath.
  const nodes = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }, { x: 20, y: 10 }];
  const adj = [[1, 3], [0, 2], [1, 4], [0, 4], [3, 2]];
  const tree = { circles: [{ x: 5, y: 0, r: 2 }] };
  const cost = adj.map((list, i) => list.map(j => m.walkEdgeCost(nodes[i], nodes[j], tree, i, j)));
  assert.equal(cost[0][0], 10 * m.AVOID_COST, 'the edge through the tree is dear');
  assert.equal(cost[0][1], 10);
  assert.deepEqual(graphRoute({ nodes, adj, cost }, 0, 2), [0, 3, 4, 2], 'round the tree');
  assert.deepEqual(graphRoute({ nodes, adj }, 0, 2), [0, 1, 2], 'without costs: fewest hops');
  const only = { nodes: nodes.slice(0, 3), adj: [[1], [0, 2], [1]] };
  only.cost = only.adj.map((list, i) => list.map(j => m.walkEdgeCost(nodes[i], nodes[j], tree, i, j)));
  assert.deepEqual(graphRoute(only, 0, 2), [0, 1, 2], 'through the tree when there is no other way');
  assert.equal(graphRoute({ nodes: [{}, {}], adj: [[], []], cost: [[], []] }, 0, 1), null);
  assert.deepEqual(graphRoute({ nodes: [{}], adj: [[]], cost: [[]] }, 0, 0), [0]);
  const river = { segments: [{ x1: 5, y1: -5, x2: 5, y2: 5, clear: 1 }] };
  assert.ok(m.walkEdgeCost(nodes[0], nodes[1], river) > 10, 'along or over a river');
  const house = [[4, -2], [6, -2], [6, 2], [4, 2]];
  const building = { buildings: [{ poly: house, box: m.polygonBounds(house), door: 1 }] };
  assert.equal(m.walkEdgeCost(nodes[0], nodes[2], building, 0, 2), 20 * m.AVOID_COST, 'across a building');
  assert.equal(m.walkEdgeCost(nodes[0], nodes[1], building, 0, 1), 10, 'to the building\'s own door');
});
