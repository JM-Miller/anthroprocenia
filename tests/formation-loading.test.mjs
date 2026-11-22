import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const crowds = await loadModule('anthroprocenia-crowds.js');
const town = await loadModule('anthroprocenia-townscape.js');
const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const recorder = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
function slice(name, text = source) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, end = text.indexOf('{', start);
  for (; end < text.length; end++) {
    if (text[end] === '{') depth++;
    else if (text[end] === '}' && --depth === 0) break;
  }
  return text.slice(start, end + 1);
}
function context(names, state, text = source) {
  const ctx = vm.createContext(state);
  vm.runInContext(names.map(name => slice(name, text)).join('\n'), ctx);
  return ctx;
}
const makeGraph = () => ({ nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], adj: [[1], [0, 2], [1]], doorForms: new Map(), roadNodes: new Set([0, 1]), bendAllowed: () => true });
const makePerson = id => ({ id, node: 0, x: 0, y: 0, target: 2, route: [0, 1, 2], leg: 0, wait: 0, fade: 1, speed: 1 });
function makeGroup(sub, state = '', count = 32) {
  const people = Array.from({ length: count }, (_, id) => makePerson(id));
  return { people, byId: new Map(people.map(p => [p.id, p])), unitSub: sub, unitState: state,
    military: ['cavalry', 'infantry', 'ranged', 'siege'].includes(sub), battleReady: true, streetNodes: [2, 1] };
}
const extent = points => ({ width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
  height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) });

test('military formations require battle this turn and dissolve immediately at the next turn at both zoom levels', () => {
  for (const coarse of [false, true]) {
    const graph = makeGraph(), group = makeGroup('cavalry'), clumps = new crowds.WalkerClumps();
    group.battleReady = false;
    clumps.sync([group], graph, { coarse, project: p => p });
    assert.equal(clumps.clumps.size, 0);
    assert.equal(crowds.crowdFormation(group.people[0], group, graph), 'loose');
    group.battleReady = true;
    clumps.sync([group], graph, { coarse, project: p => p });
    assert.ok(clumps.clumps.size);
    assert.equal(crowds.crowdFormation(group.people[0], group, graph), 'wedge');
    group.battleReady = false;
    clumps.sync([group], graph, { coarse, project: p => p, time: 1 });
    assert.equal(clumps.clumps.size, 0);
    assert.ok(group.people.every(person => !person.clump));
    if (coarse) assert.ok(clumps.markers(p => p, [group]).every(marker => marker.kind === 'loose' && marker.clump.military));
  }
});

test('combat participation records both surviving units, roundtrips and does not spill into another turn or age', () => {
  const units = [{ owner: 0, location: { x: 0 } }, { owner: 1, location: { x: 1 } }, { owner: 1, location: { x: 2 } }];
  const saved = new Map(), ctx = context(['readUnits', 'recordUnitBattle'], {
    Game: { age: 0, turn: 7 }, unitCombatTurns: new Map(), unitFormationOperations: new Map(), lastUnitPlot: new Map(),
    frameIndex: (age, turn) => age === 0 && turn === 7 ? 0 : -1,
    OBJ_UNITS: 'units', getCatalog: () => ({ getObject: () => ({ read: key => saved.get(key) }) }),
    MAX_PLAYER_ID: 1, Players: { get: owner => ({ Units: { getUnitIds: () => units.flatMap((unit, id) => unit.owner === owner ? [{ id }] : []) } }) },
    Units: { get: id => units[id.id] }, GameplayMap: { getIndexFromLocation: loc => loc.x },
    unitStrengthBonusPercent: () => 0, unitFormationState: () => 0, unitTypeIndex: () => 0, unitHealthPercent: () => 100,
    packUnit: (plot, owner) => plot * 65536 + owner * 1024, readRoutes: () => [], scheduleMidTurnRecord() {},
    err: message => assert.fail(message),
  }, recorder);
  ctx.recordUnitBattle({ attacker: { id: 0 }, defender: { id: 1 } });
  const recorded = ctx.readUnits(7);
  assert.deepEqual(Array.from(recorded.b), [0, 1]);
  saved.set('u0', JSON.stringify(recorded)); ctx.unitCombatTurns.clear();
  assert.deepEqual(Array.from(ctx.readUnits(7).b), [0, 1], 'same-turn saved participation survives reload');
  ctx.Game.turn = 8;
  assert.equal(ctx.readUnits(8).b.length, 0);
  assert.deepEqual(Array.from(ctx.readUnits(7).b), [0, 1], 'turn-begin capture labels the prior completed turn correctly');
  ctx.Game.age = 1;
  assert.equal(ctx.readUnits(7).b.length, 0);
  const playback = context(['readUnitsTurn', 'unpackUnit', 'walkerFormationTraits'], {
    getCatalog: () => ({ getObject: () => ({ read: () => JSON.stringify(recorded) }) }), OBJ_UNITS: 'units',
    unitsCache: new Map(), routesCache: new Map(), pos: 0, popIconTraits: () => ({ unit: { sub: 'cavalry' } }), err: message => assert.fail(message),
  });
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 0 }).battleReady, true);
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 2 }).battleReady, false);
  delete recorded.b; playback.unitsCache.clear();
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 0 }).battleReady, false, 'old wounds or enemy adjacency never invent combat participation');
});

test('cavalry skeins form a filled pointed wedge, ranged/siege ranks are long and loose, and shield walls are compact', () => {
  const wedge = crowds.formationLayout(64, 'wedge'), line = crowds.formationLayout(64, 'line'), shield = crowds.formationLayout(64, 'shield');
  const rows = new Map();
  for (const p of wedge) rows.set(p.y, (rows.get(p.y) || 0) + 1);
  assert.deepEqual([...rows.values()], [1, 3, 5, 7, 9, 11, 13, 15]);
  const wide = extent(line), tight = extent(shield);
  assert.ok(wide.width / wide.height > 4);
  assert.ok(wide.width > tight.width * 2);
  assert.ok(wide.height > tight.height);
  assert.equal(new Set(shield.map(p => `${p.x},${p.y}`)).size, 64);
  for (const kind of ['wedge', 'line', 'shield', 'ranks', 'caravan', 'path', 'loose']) for (const count of [2, 3, 17, 32, 64]) {
    const points = crowds.formationLayout(count, kind), shape = crowds.crowdDotPath(count, 1.6, false, kind);
    assert.equal(points.length, count);
    assert.equal((shape.d.match(/Z/g) || []).length, count);
    assert.equal(new Set(points.map(p => `${p.x},${p.y}`)).size, count);
    assert.ok(Math.abs(points.reduce((sum, p) => sum + p.x, 0)) < 1e-8);
    assert.ok(Math.abs(points.reduce((sum, p) => sum + p.y, 0)) < 1e-8);
    assert.equal(crowds.formationLayout(count, kind), points);
    assert.equal(crowds.crowdDotPath(count, 1.6, false, kind), shape);
  }
});

test('formation selection follows subtype, recorded state, walking surface and actual movement', () => {
  const graph = makeGraph(), person = makePerson(0);
  for (const [sub, state, expected] of [['cavalry', 'moving', 'wedge'], ['ranged', '', 'line'], ['siege', '', 'line'],
    ['infantry', 'alert', 'shield'], ['infantry', 'sleeping', 'shield'], ['infantry', 'fortified', 'shield'],
    ['cavalry', 'sleeping', 'loose'], ['ranged', 'idle', 'loose'], ['infantry', 'holding', 'loose'], ['siege', 'healing', 'loose'],
    ['infantry', '', 'ranks'], ['merchant', '', 'caravan']]) {
    assert.equal(crowds.crowdFormation(person, makeGroup(sub, state), graph), expected);
  }
  const civilian = makeGroup('merchant');
  person.leg = 1; assert.equal(crowds.crowdFormation(person, civilian, graph), 'path');
  person.wait = 3; assert.equal(crowds.crowdFormation(person, civilian, graph), 'loose');
  person.wait = 0; person.strollPause = 1; assert.equal(crowds.crowdFormation(person, civilian, graph), 'loose');
  person.strollPause = 0; civilian.spots = [2];
  graph.spots = new Map([[2, { kind: 'square', name: 'Town square' }]]);
  const leisure = context(['walkerLeisureDestination'], { Math: Object.assign(Object.create(Math), { random: () => 0.2 }) });
  assert.equal(leisure.walkerLeisureDestination(civilian, person, graph), 2);
  assert.equal(person.activity.meandering, true);
  assert.equal(crowds.crowdFormation(person, civilian, graph), 'loose', 'moving square meanders remain loosely scattered, not organized path streams');
  const caravan = extent(crowds.formationLayout(32, 'caravan'));
  assert.ok(caravan.height > caravan.width * 10);
  const path = crowds.formationLayout(32, 'path');
  assert.ok(new Set(path.map(p => p.x)).size > 20, 'path crowds have deterministic lateral irregularity');
  const loose = extent(crowds.formationLayout(32, 'loose'));
  assert.ok(loose.width / loose.height > 0.6 && loose.width / loose.height < 1.5);
});

test('coarse crowd templates carry their formation kind and heading and do not mix road caravans with stationary dots', () => {
  const graph = makeGraph(), group = makeGroup('merchant'), clumps = new crowds.WalkerClumps();
  clumps.coarse = true; clumps.graph = graph;
  group.people[0].wait = 5; group.people[1].leg = 1;
  group.people[2].pinned = true; group.people[3].cmd = {};
  const markers = clumps.markers(p => p, [group]);
  assert.ok(markers.some(marker => marker.kind === 'caravan'));
  assert.ok(markers.every(marker => marker.members.every(p => !p.pinned && !p.cmd)));
  const moving = markers.find(marker => marker.kind === 'caravan');
  assert.deepEqual(moving.heading, { x: 10, y: 0 });
  assert.ok(moving.members.every(p => p.wait === 0 && p.leg === 0));
  const military = makeGroup('cavalry', 'moving', 64);
  const wedge = clumps.markers(p => p, [military]);
  assert.equal(wedge[0].kind, 'wedge');
  assert.equal(wedge.flatMap(marker => marker.members).length, 64);
});

test('close zoom retains civilian unit travel groups and safely places the same formation geometry without moving simulation nodes', () => {
  for (const [sub, state, kind] of [['merchant', '', 'caravan'], ['cavalry', '', 'wedge'], ['ranged', '', 'line'], ['infantry', 'alert', 'shield']]) {
    const graph = makeGraph(), group = makeGroup(sub, state), clumps = new crowds.WalkerClumps();
    clumps.sync([group], graph, { coarse: false, project: p => p });
    assert.ok(clumps.clumps.size);
    const person = group.people[5], original = { x: person.x, y: person.y };
    assert.equal(crowds.crowdFormation(person, group, graph), kind);
    const points = group.people.map(p => crowds.formationPoint(p, graph, 0.1));
    assert.equal(new Set(points.map(p => `${p.x},${p.y}`)).size, 32);
    assert.deepEqual({ x: person.x, y: person.y }, original);
    graph.bendAllowed = () => false;
    assert.equal(crowds.formationPoint(person, graph, 0.1), person, 'a formation cannot move its dot through a tree, roof or unbridged creek');
    graph.bendAllowed = () => true; person.runnerDuty = {};
    assert.equal(crowds.formationPoint(person, graph, 0.1), person);
    delete person.runnerDuty; person.cmd = {};
    assert.equal(crowds.formationPoint(person, graph, 0.1), person);
    clumps.sync([group], graph, { coarse: false, project: p => p });
    assert.equal(person.clump, null);
    assert.deepEqual(group.people.filter(p => p.clump).map(p => p.formationSlot), Array.from({ length: 31 }, (_, i) => i));
  }
});

test('sleeping/alert/fortified infantry hold their assembly instead of cycling through marching destinations', () => {
  const graph = makeGraph(), group = makeGroup('infantry', 'fortified'), clumps = new crowds.WalkerClumps();
  clumps.sync([group], graph, { coarse: false, project: p => p });
  const formation = [...clumps.clumps][0], goal = formation.goal;
  for (const person of group.people) { person.node = goal; person.route = null; }
  clumps.sync([group], graph, { coarse: false, project: p => p, time: 1 });
  clumps.sync([group], graph, { coarse: false, project: p => p, time: 30 });
  assert.equal(formation.goal, goal);
  clumps.destination(group.people[0]);
  assert.equal(group.people[0].activity.label, 'Hold shield wall');
  group.unitState = 'sleeping'; clumps.destination(group.people[0]);
  assert.equal(group.people[0].activity.label, 'Rest in shield wall');
});

test('recorded unit activity survives roundtrip and old unit records stay compatible without invented states', () => {
  const UnitActivityTypes = { SENTRY: 11, SLEEP: 12, OPERATION: 13, HOLD: 14, HEAL: 15, AWAKE: 16, NONE: 17 };
  const units = [11, 12, 13, 14, 15, 16, 99].map((activityType, id) => ({ activityType, owner: 1, location: { x: id }, type: 0 }));
  const ctx = context(['unitFormationState', 'readUnits', 'recordUnitFormationActivity'], {
    UnitActivityTypes, UnitOperationTypes: { FORTIFY: 100 }, unitFormationOperations: new Map(), lastUnitPlot: new Map(),
    Game: { age: 0, turn: 1 }, frameIndex: () => -1, unitCombatTurns: new Map(),
    MAX_PLAYER_ID: 1, Players: { get: pid => pid === 1 ? { Units: { getUnitIds: () => units.map((_, id) => ({ id })) } } : null },
    Units: { get: id => units[id.id] }, GameplayMap: { getIndexFromLocation: loc => loc.x },
    unitStrengthBonusPercent: () => 0, unitTypeIndex: () => 0, unitHealthPercent: () => 100,
    packUnit: (plot, owner, type) => plot * 65536 + owner * 1024 + type, readRoutes: () => [],
    scheduleMidTurnRecord() {}, err: message => { throw Error(message); },
  }, recorder);
  ctx.recordUnitFormationActivity({ unit: { id: 2 }, operationType: 100 });
  const recorded = ctx.readUnits();
  assert.deepEqual(Array.from(recorded.a), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  const playback = context(['unpackUnit', 'readUnitsTurn', 'walkerFormationTraits'], {
    OBJ_UNITS: 'units',
    unitsCache: new Map(), routesCache: new Map(), getCatalog: () => ({ getObject: () => ({ read: () => JSON.stringify(recorded) }) }),
    popIconTraits: () => ({ unit: { sub: 'infantry' } }), pos: 0, err: message => { throw Error(message); },
  });
  assert.equal(playback.readUnitsTurn(0)[2][6], 3);
  assert.equal(playback.readUnitsTurn(0)[0][7], '1:0');
  assert.equal(playback.readUnitsTurn(0)[2][7], '1:2', 'native identities survive recorder/playback roundtrip independently of unit type or location');
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 2 }).unitState, 'fortified');
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 1 }).unitState, 'sleeping');
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 6 }).unitState, '');
  delete recorded.a; delete recorded.i; playback.unitsCache.clear();
  assert.equal(playback.readUnitsTurn(0)[0][6], undefined);
  assert.equal(playback.readUnitsTurn(0)[0][7], undefined, 'old recordings never invent a native identity');
  assert.equal(playback.walkerFormationTraits({ kind: 'unit', row: 0 }).unitState, '');
  units[2].activityType = 16;
  assert.equal(ctx.unitFormationState(units[2], { id: 2 }, 1), 6, 'old fortify event does not override an awake unit');
  assert.match(recorder, /engine.on\('UnitActivityChanged', recordUnitFormationActivity\)/);
});

test('road nodes propagate from local and connecting roads into the shared walker graph', () => {
  assert.match(slice('buildWalkGraph'), /roadNodes.add\(id\)/);
  assert.match(slice('buildTownWorld'), /for \(const i of g.roadNodes \|\| \[\]\) graph.roadNodes.add\(i \+ offset\)/);
  const ctx = context(['buildWalkGraph'], { ...town, hexW: 100, townPointBlocked: () => false, townSpots: () => [] });
  const graph = ctx.buildWalkGraph({ center: { x: 0, y: 0 }, radius: 5, shapes: { nodes: [[0, 0], [1, 0]], edges: [[0, 1]] },
    obstacles: { circles: [], segments: [], roads: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] }, final: [] });
  assert.equal(graph.roadNodes.size, 2);
  const nodes = [...graph.roadNodes], person = { ...makePerson(0), route: nodes };
  assert.equal(crowds.crowdFormation(person, makeGroup('merchant'), graph), 'caravan');
});

test('batched crowd geometry rotates with movement and aspect ratio while retaining every member', () => {
  const paths = [], root = { appendChild() {} };
  const ctx = context(['syncCrowdDots', 'syncWalkerDots', 'syncCrowdVisibility'], { ...crowds, ps: n => n, viewAspectY: 0.5,
    hexH: 100, viewZoom: 240, window: { innerHeight: 1000 },
    peopleActive: () => true, walkerCrowdsActive: () => true,
    peopleSvg: null,
    peopleClumpPaths: paths, townPeople: root,
    document: { createElementNS: () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } }) } });
  const marker = { clump: { military: true }, kind: 'wedge', members: Array(32), x: 50, y: 60, heading: { x: 10, y: 10 } };
  ctx.syncCrowdDots([marker], 1.6);
  const shape = paths[0].attrs.d;
  const expected = crowds.crowdScreenDots([marker], 1.6, 0.5, 2);
  assert.ok(Math.abs(expected[0].angle * 180 / Math.PI - 116.565051) < 0.000001);
  assert.equal(shape, crowds.individualDotPaths(expected)[0].d);
  marker.heading = { x: 0, y: -10 }; ctx.syncCrowdDots([marker], 1.6);
  assert.notEqual(paths[0].attrs.d, shape);
  assert.equal(crowds.crowdScreenDots([marker], 1.6, 0.5, 2)[0].angle, 0);
  marker.kind = 'line'; ctx.syncCrowdDots([marker], 1.6);
  assert.notEqual(paths[0].attrs.d, shape);
  assert.equal((paths[0].attrs.d.match(/Z/g) || []).length, 32);
});

test('loading backdrop covers the entire game view only for the loading/error placard and is reused and removed on reveal or close', () => {
  const body = { children: [], appendChild(el) { this.children.push(el); } };
  const ctx = context(['showLoading', 'hideLoading'], {
    els: {}, ps: n => n, measureArea: () => ({ x: 100, y: 50, w: 800, h: 600 }),
    document: { body, createElement: () => ({ style: {}, setAttribute() {} }) },
  });
  test('diplomacy loading stays through native camera transitions, releases when ready and preserves newer errors', () => {
    const paints = [], manager = { cameraDollyQueued: true }, body = { appendChild() {} };
    let time = 0;
    const ctx = context(['showDiplomacyLoading', 'showLoading', 'hideLoading'], {
      mapVisible: true, diplomacyTransition: { token: 0 }, LeaderModelManager: manager, building: false, mapOpenPending: false,
      els: {}, ps: n => n, measureArea: () => ({ x: 0, y: 0, w: 800, h: 600 }),
      document: { body, createElement: () => ({ style: {}, setAttribute() {} }) },
      setTimeout: (fn, delay) => { assert.equal(delay, 100); paints.push(fn); },
      Date: { now: () => time }, err: () => {},
    });
    ctx.showDiplomacyLoading();
    assert.equal(ctx.els.loading.textContent, 'Loading...');
    assert.equal(ctx.els.loadingBackdrop.style.display, 'block');
    paints.shift()(); assert.equal(ctx.els.loadingBackdrop.style.display, 'block');
    manager.cameraDollyQueued = false; manager.isClosing = true;
    paints.shift()(); assert.equal(ctx.els.loadingBackdrop.style.display, 'block');
    manager.isClosing = false; paints.shift()();
    assert.equal(ctx.els.loading.style.display, 'none'); assert.equal(ctx.els.loadingBackdrop.style.display, 'none');
    manager.isLeaderShowing = true; manager.cameraDollyQueued = true;
    manager.leaderSequenceGate = { waitingForForegroundCameraId: 7 };
    ctx.showDiplomacyLoading(); paints.shift()();
    assert.equal(ctx.els.loadingBackdrop.style.display, 'none', 'native dialogue is not covered while its scene sequence is waiting');
    manager.isClosing = true;
    ctx.showDiplomacyLoading(); paints.shift()();
    assert.equal(ctx.els.loadingBackdrop.style.display, 'block', 'closing still shields the map until the scene clears');
    manager.isClosing = false; paints.shift()();
    assert.equal(ctx.els.loadingBackdrop.style.display, 'none');
    ctx.showDiplomacyLoading(); ctx.showLoading('Map failed');
    paints.shift()(); assert.equal(ctx.els.loading.textContent, 'Map failed'); assert.equal(ctx.els.loadingBackdrop.style.display, 'block');
    manager.isLeaderShowing = false; manager.isClosing = true;
    ctx.showDiplomacyLoading(); time = 10000; paints.shift()();
    assert.equal(ctx.els.loadingBackdrop.style.display, 'none', 'stalled animation frames cannot keep the cover indefinitely');
    ctx.mapVisible = false; ctx.hideLoading(); ctx.showDiplomacyLoading();
    assert.equal(paints.length, 0); assert.equal(ctx.els.loading.style.display, 'none');
  });
  ctx.showLoading();
  const { loading, loadingBackdrop } = ctx.els;
  assert.match(loadingBackdrop.style.cssText, /position:fixed;left:0;top:0;width:100%;height:100%;background:#000/);
  assert.ok(Number(loadingBackdrop.style.cssText.match(/z-index:(\d+)/)[1]) < Number(loading.style.cssText.match(/z-index:(\d+)/)[1]));
  assert.equal(loadingBackdrop.style.display, 'block');
  ctx.hideLoading(); assert.equal(loading.style.display, 'none'); assert.equal(loadingBackdrop.style.display, 'none');
  ctx.showLoading('Map failed'); assert.equal(loadingBackdrop.style.display, 'block'); assert.equal(loading.textContent, 'Map failed');
  assert.equal(body.children.length, 2);
  ctx.hideLoading(); assert.equal(loadingBackdrop.style.display, 'none');
  assert.match(slice('reveal'), /if \(!renderFailed\) hideLoading\(\)/);
  assert.match(slice('closePanel'), /hideLoading\(\)/);
});
