import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const crowds = await loadModule('anthroprocenia-crowds.js');
const town = await loadModule('anthroprocenia-townscape.js');
const people = await loadModule('anthroprocenia-people.js');
test('occupation icons keep rare jobs above common hats within a bounded dense-view budget', () => {
  const walkers = Array.from({ length: 7200 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), fade: 1, radius: 2,
    occupation: i === 7199 ? 'Physician' : 'Farmer', role: i === 7198 ? 'Queen' : '' }));
  const batches = crowds.occupationIconPaths(walkers);
  assert.equal(batches.reduce((sum, batch) => sum + batch.count, 0), 512);
  assert.equal(batches[0].occupation, 'Farmer');
  assert.ok(batches.slice(1).some(batch => batch.occupation === 'Queen'));
  assert.ok(batches.slice(1).some(batch => batch.occupation === 'Physician'));
  assert.ok(new Set(batches.map(batch => batch.fill)).size >= 3);
  assert.ok(batches.reduce((sum, batch) => sum + (batch.d.match(/[MLZ]/g) || []).length, 0) <= 8192);
  assert.ok(batches.reduce((sum, batch) => sum + batch.d.length, 0) <= 262144);
  assert.equal(crowds.occupationIconPaths([{ ...walkers[0], fade: 0.1 }]).length, 0);
  assert.equal(crowds.occupationIconPaths([]).length, 0);
});
test('distant crowds draw one eighth of their dots and progressively restore the same formation positions', t => {
  const markers = Array.from({ length: 225 }, (_, i) => ({
    clump: { military: i % 2 === 0 }, members: Array(32), x: i * 10, y: 50, kind: 'ranks',
  }));
  const full = crowds.crowdScreenDots(markers, 2, 1, 2);
  let previous = 0;
  for (const screens of [1, 3, 6, 12, 24]) {
    const stride = crowds.crowdDotStride(screens), dots = crowds.crowdScreenDots(markers, 2, 1, 2, stride);
    assert.equal(dots.length, 7200 / stride);
    assert.ok(dots.length >= previous);
    assert.deepEqual(dots.slice(0, 32 / stride), full.slice(0, 32).filter((_, i) => i % stride === 0));
    previous = dots.length;
  }
  const distant = crowds.crowdScreenDots(markers, 2, 1, 2, crowds.crowdDotStride(1));
  const commands = dots => crowds.individualDotPaths(dots).reduce((sum, batch) => sum + (batch.d.match(/[MLZ]/g) || []).length, 0);
  assert.equal(commands(distant), 8100);
  assert.equal(commands(full), 64800);
  assert.equal(markers.reduce((sum, marker) => sum + marker.members.length, 0), 7200, 'simulation and group selections retain all members');
  t.diagnostic('7,200 simulated members: 900 distant dots, 8,100 vs 64,800 SVG commands (87.5% fewer)');
});
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
const project = person => ({ x: person.x, y: person.y });
function graph(count = 100) {
  return {
    nodes: Array.from({ length: count }, (_, i) => ({ x: i, y: 0 })),
    adj: Array.from({ length: count }, (_, i) => [i - 1, i + 1].filter(n => n >= 0 && n < count)),
    doorForms: new Map(), spots: new Map(), bendAllowed: () => true,
  };
}
function group(count = 64, military = false, id = 'home') {
  const members = Array.from({ length: count }, (_, i) => ({
    id: i, key: `${id}#${i}`, node: 0, target: 99, x: 0, y: 0, fade: 1, wait: 0, leg: 0, t: 0,
    speed: 1 + i % 3, baseSpeed: 1 + i % 3,
  }));
  return { people: members, byId: new Map(members.map(person => [person.id, person])), military, nodeId: id,
    entry: { pathKey: id, item: { owner: id } }, streetNodes: [99, 50, 25] };
}

test('256 nearby walkers share one actual route-tree search, and close zoom releases them without moving or replacing identities', () => {
  const world = graph(), home = group(256), clumps = new crowds.WalkerClumps();
  clumps.sync([home], world, { coarse: true, project });
  assert.equal(clumps.clumps.size, 8);
  let planned = 0;
  for (const person of home.people) {
    town.stepWalker(person, world, 0, p => clumps.destination(p), () => 0, null, null, (p, target) => {
      planned++; return clumps.route(p, target);
    });
    assert.deepEqual(person.route, Array.from({ length: 100 }, (_, i) => i));
  }
  assert.equal(planned, 256);
  assert.equal(clumps.routeBuilds, 1, 'one Dijkstra search, not 256 independent graph searches');
  const identities = home.people.map(person => ({ person, x: person.x, y: person.y, route: person.route }));
  clumps.sync([home], world, { coarse: false, project });
  assert.equal(clumps.clumps.size, 0);
  for (const old of identities) {
    assert.equal(old.person.clump, null);
    assert.equal(old.person.x, old.x); assert.equal(old.person.y, old.y); assert.equal(old.person.route, old.route);
    assert.equal(old.person.speed, old.person.baseSpeed);
  }
});

test('formations persist at close zoom, never mix units, and exclude pinned, commanded, selected and runner members', () => {
  const world = graph(), a = group(20, true, 'a'), b = group(20, true, 'b');
  a.people[0].pinned = true; a.people[1].cmd = {}; a.people[2].inside = true;
  a.people[3].runner = true; a.people[4].selected = true;
  const clumps = new crowds.WalkerClumps();
  clumps.sync([a, b], world, { coarse: false, project, exclude: person => person.runner || person.selected });
  assert.equal(clumps.clumps.size, 2);
  assert.ok(a.people.slice(0, 5).every(person => !person.clump));
  assert.ok(a.people.slice(5).every(person => person.clump.group === a));
  assert.ok(b.people.every(person => person.clump.group === b));
  assert.equal(clumps.markers(project).length, 0, 'close zoom draws individual formation ranks, not aggregate dots');
  b.people[0].cmd = {};
  clumps.sync([a, b], world, { coarse: false, project, exclude: person => person.runner || person.selected });
  assert.equal(b.people[0].clump, null, 'a new command immediately detaches its member');
});

test('coarse markers represent exact nearby membership and bounded counts, while formation offsets respect obstacles', () => {
  const world = graph(), home = group(40, true), clumps = new crowds.WalkerClumps();
  clumps.sync([home], world, { coarse: true, project });
  const markers = clumps.markers(project);
  assert.equal(markers.length, 1); assert.equal(markers[0].members.length, 40);
  const points = home.people.map(person => crowds.formationPoint(person, world, 0.1));
  assert.equal(new Set(points.map(point => `${point.x},${point.y}`)).size, 40, 'ranks and files have distinct slots');
  world.bendAllowed = () => false;
  assert.equal(crowds.formationPoint(home.people[0], world, 0.1), home.people[0], 'cannot place a slot through a tree, roof or unbridged creek');
  home.people[0].x = 100; home.people[1].inside = true; home.people[2].cmd = {};
  assert.equal(clumps.markers(project).reduce((sum, marker) => sum + marker.members.length, 0), 38);
});

test('graph rebuilds invalidate shared trees; disconnected members fall back to their own destinations', () => {
  const clumps = new crowds.WalkerClumps(), home = group(4), world = graph();
  clumps.sync([home], world, { coarse: true, project });
  clumps.destination(home.people[0]);
  const before = clumps.routeBuilds, replacement = graph();
  replacement.adj[0] = []; replacement.adj[1] = [2];
  clumps.sync([home], replacement, { coarse: true, project });
  assert.equal(clumps.graph, replacement);
  assert.equal(clumps.destination(home.people[0]), undefined);
  assert.equal(home.people[0].clump, null);
  assert.ok(clumps.routeBuilds > before);
  clumps.clear(); assert.equal(clumps.trees.size, 0); assert.equal(clumps.clumps.size, 0);
});

test('runner occupations belong to land military homes, have soldier workplaces, and retain normalized occupation shares', () => {
  for (const sub of ['infantry', 'ranged', 'cavalry', 'siege', 'armor', 'commander', 'scout']) {
    const options = people.occupationOptions({ age: 0, unit: { sub, base: 'Soldier' } });
    assert.equal(options.find(([title]) => title === 'Supply runner')[1], 0.04);
    assert.equal(options.find(([title]) => title === 'Message runner')[1], 0.04);
    assert.ok(Math.abs(options.reduce((sum, [, share]) => sum + share, 0) - 1) < 1e-10);
  }
  for (const sub of ['naval', 'air', 'merchant', 'settler', 'builder', 'civilian', 'religious', 'great']) {
    assert.equal(people.landMilitaryUnit({ sub }), false);
    assert.ok(people.occupationOptions({ unit: { sub } }).every(([title]) => !/runner/.test(title)));
  }
  for (const occupation of ['Supply runner', 'Message runner']) {
    assert.equal(people.workFamily(occupation), 'soldier');
    assert.ok(people.workplaceScore(people.workFamily(occupation), 'fort') > 1);
  }
});

test('runners choose the nearest reachable friendly encampment by safe path cost, excluding enemies and battle formations', () => {
  const world = graph(6);
  world.adj = [[1], [0, 2], [1, 3], [2], [], []];
  const make = (owner, kind = 'camp', cls = 'tents') => ({ building: { group: cls, name: `${owner}-${kind}` }, part: { entry: { item: { owner, kind: 'unit' }, kind } } });
  world.activityDoors = new Map([[0, make(1)], [1, make(2)], [2, make(1, 'battle')], [4, make(1)], [5, make(1)]]);
  const clumps = new crowds.WalkerClumps(); clumps.graph = world;
  const home = group(2, true); home.owner = 1; home.formationNode = 3;
  const person = home.people[0]; person.node = 3; person.occupation = 'Supply runner';
  const ctx = vm.createContext({ ...crowds, walkerClumps: clumps, itemOwner: item => item.owner, walkerRunnerRole: () => person.occupation, townscapePlaceName: () => 'Camp' });
  vm.runInContext(slice('walkerRunnerDestination'), ctx);
  assert.equal(ctx.walkerRunnerDestination(home, person, world), 0);
  assert.equal(person.activity.place, '1-camp');
  person.node = 0;
  assert.equal(ctx.walkerRunnerDestination(home, person, world), 3);
  assert.match(person.activity.label, /Deliver supplies to formation/);
  person.node = 3; person.occupation = 'Message runner';
  assert.equal(ctx.walkerRunnerDestination(home, person, world), 0);
  assert.match(person.activity.label, /dispatches/);
  world.activityDoors.clear(); home.runnerCamps = null;
  assert.equal(ctx.walkerRunnerDestination(home, person, world), 3);
  assert.match(person.activity.label, /Await a reachable friendly encampment/);
});

test('runner jobs physically travel to camp and back repeatedly, dwell at both ends, and share safe route trees', () => {
  for (const occupation of ['Supply runner', 'Message runner']) {
    const world = graph(4), clumps = new crowds.WalkerClumps();
    world.bendAllowed = () => false;
    world.doorForms.set(0, 'tent'); clumps.graph = world;
    const person = { node: 3, x: 3, y: 0, wait: 0, speed: 4, leg: 0, t: 0, fade: 1 }, arrivals = [];
    for (let tick = 0; tick < 500; tick++) {
      town.stepWalker(person, world, 0.1,
        p => crowds.runnerDestination(p, occupation, 3, { node: 0, name: 'Camp' }), () => 0,
        p => { if (!p.runnerDuty) assert.fail('runner routing must be assigned before considering occupational detours'); return null; },
        p => { if (p.activity && p.activity.node === p.node) arrivals.push([p.node, p.activity.label]); },
        (p, target) => clumps.route(p, target));
      assert.equal(person.y, 0);
      assert.ok(person.x >= 0 && person.x <= 3);
    }
    assert.deepEqual(arrivals.slice(0, 4).map(([node]) => node), [0, 3, 0, 3]);
    assert.ok(arrivals.every(([, action]) => /supplies|dispatches|orders/.test(action)));
    assert.equal(clumps.routeBuilds, 2, 'one shared tree per end of the supply/message route');
  }
});

function element() {
  return {
    style: {}, attrs: {}, children: [], events: {}, classList: { add() {} },
    get firstChild() { return this.children[0]; },
    setAttribute(key, value) { this.attrs[key] = value; }, append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); }, removeChild(item) { this.children.splice(this.children.indexOf(item), 1); },
    addEventListener(name, fn) { this.events[name] = fn; },
  };
}
test('group picker paginates individual identities, selects members, supports camera focus and hides behind game menus', () => {
  const home = group(40, true), clump = { group: home, members: home.people, military: true }, els = {};
  const node = { id: 'home' }, selected = [], focused = [], state = { clump: null };
  let overlay = false, time = 1000;
  const ctx = vm.createContext({
    els, clumpPicker: state, clumpsAt: 0, townWalkers: new Map([['home', home]]), popState: { nodeIndex: new Map([['home', node]]) },
    document: { createElement: element, body: element() }, window: { innerWidth: 1400, innerHeight: 900 }, ps: n => n,
    gameOverlayActive: () => overlay, peopleActive: () => true, popModelKey: () => 'turn',
    personProfileFor: ({ person }) => ({ name: `Person ${person.id}`, occupation: 'Soldier' }), personActionText: () => 'Maintain formation',
    walkerRunnerRole: () => '', nowMs: () => time, popSetHoverRow: () => {}, measureArea: () => ({ y: 0 }),
    selectPersonFromMap: hit => { selected.push(hit.person.key); ctx.popState.selectedPerson = hit.person.key; },
    popGoToPerson: (n, index) => focused.push([n.id, index]), POP_MAP_HOVER: { background: '#abc' },
  });
  vm.runInContext(['openClumpPicker', 'closeClumpPicker', 'syncClumpPicker', 'clumpMemberPress'].map(slice).join('\n'), ctx);
  ctx.openClumpPicker({ clump });
  assert.equal(els.clumpRows.children.length, 16);
  assert.equal(els.clumpTitle.textContent, 'Military Formation (40)');
  assert.equal(els.clumpPageInfo.textContent, '1 / 3');
  const event = type => ({ type, button: 0, preventDefault() {}, stopPropagation() {} });
  els.clumpRows.children[0].events.mouseup(event('mouseup'));
  els.clumpRows.children[0].events.click(event('click'));
  assert.deepEqual(selected, ['home#0'], 'native mouseup/click pair selects only once');
  time += 400;
  els.clumpRows.children[1].events.dblclick(event('dblclick'));
  assert.deepEqual(focused, [['home', 1]]);
  els.clumpPage.children[2].events.click(event('click'));
  assert.equal(els.clumpPageInfo.textContent, '2 / 3');
  assert.equal(state.rows[0].person.id, 16);
  assert.ok(els.clumpRows.children.every(row => row.attrs.title && row.attrs.role === 'button'));
  overlay = true; ctx.syncClumpPicker(); assert.equal(els.clumpPanel.style.display, 'none');
  overlay = false; ctx.syncClumpPicker(); assert.equal(els.clumpPanel.style.display, 'flex');
  ctx.popModelKey = () => 'next turn'; ctx.syncClumpPicker();
  assert.equal(state.clump, null); assert.equal(els.clumpPanel.style.display, 'none');
});

test('map input prioritizes group picking over individual, building, city and drag selection', () => {
  const down = slice('onMapDragStart'), hover = slice('onMapHoverInner');
  assert.ok(down.indexOf('openClumpPicker(clump)') < down.indexOf('selectPersonFromMap(person)'));
  assert.ok(hover.indexOf('const clump = clumpAt') < hover.indexOf('const personHit'));
  assert.match(slice('overControlPanels'), /els\.clumpPanel/);
  assert.match(slice('popPanelContains'), /els\.clumpPanel/);
  assert.match(slice('peopleTick'), /coarse = walkerCrowdsActive\(\)/);
  assert.match(slice('walkerCrowdsActive'), /CLUMP_SPLIT_SCREENS/);
  assert.match(slice('peopleTick'), /group\.onArrival, walkerPlanRoute/);
  assert.match(slice('stopPeople'), /walkerClumps\.clear/);
});
