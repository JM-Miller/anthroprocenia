import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const ui = await loadModule('anthroprocenia-ui.js');
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
function context(names, state = {}) {
  const ctx = vm.createContext({ ...town, ...ui, toggleMapHistory() {}, historyControlsExpanded: false, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const event = extra => ({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...extra });
function element(tag) {
  return { tag, attrs: {}, events: {}, style: {}, children: [], classList: { add() {} },
    getBoundingClientRect: () => ({ left: -100, right: -80, top: -100, bottom: -80 }),
    get firstChild() { return this.children[0]; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.events[k] = fn; },
    appendChild(child) { this.children.push(child); }, removeChild(child) { this.children.splice(this.children.indexOf(child), 1); } };
}
test('Gameface controls display speed on a div and accept DOM releases, engine releases and keyboard without double toggles', () => {
  let now = 1000;
  const ctx = context(['buildWalkerControls', 'syncWalkerSpeed', 'popSyncPauseButton', 'walkerControlAt', 'mapGamepadAction'], {
    els: {}, popState: { walkerSpeed: 5, peoplePaused: false }, ps: n => n, MAP_CHROME_CLASS: 'chrome',
    Date: { now: () => now }, document: { body: element('body'), createElement: element, createElementNS: (ns, tag) => element(tag) },
    mapVisible: true, LeaderModelManager: { isLeaderShowing: false }, gameOverlayActive: () => false,
    settlementExpansionActive: () => false, mapPlotSelectionActive: () => false,
    Cursor: { position: { x: 10, y: 10 } }, InputActionStatuses: { START: 1, FINISH: 2 },
    pointInRect: (x, y, box) => x >= box.left && x < box.right && y >= box.top && y < box.bottom,
  });
  ctx.buildWalkerControls();
  const { walkerSpeed: speed, walkerPause: pause } = ctx.els;
  assert.equal(speed.tag, 'div');
  assert.equal(speed.attrs.role, 'button');
  assert.equal(speed.speedLabel.tag, 'svg');
  assert.equal(speed.speedLabel.attrs.viewBox, '0 0 24 16');
  assert.equal(speed.speedLabel.attrs.width, '24');
  assert.equal(speed.speedLabel.attrs.height, '16');
  assert.equal(speed.speedLabel.attrs['aria-hidden'], 'true');
  const labels = new Map([[5, speed.speedLabel.firstChild.attrs.d]]);
  const checkSpeed = value => {
    assert.equal(speed.attrs['aria-label'], `Walker speed ${value}x`);
    const d = speed.speedLabel.firstChild.attrs.d;
    assert.match(d, /M16 6 L22 13 M22 6 L16 13$/, 'visible x glyph accompanies every digit');
    assert.ok(!d.includes('undefined'));
    labels.set(value, d);
  };
  checkSpeed(5);
  speed.style.display = pause.style.display = 'flex';
  speed.getBoundingClientRect = () => ({ left: 0, right: 36, top: 0, bottom: 36 });
  pause.getBoundingClientRect = () => ({ left: 40, right: 76, top: 0, bottom: 36 });
  speed.events.mouseup(event({ type: 'mouseup', button: 0 }));
  speed.events.click(event({ type: 'click', button: 0 }));
  ctx.mapGamepadAction(event({ detail: { name: 'mousebutton-left', status: 2 } }));
  assert.equal(ctx.popState.walkerSpeed, 1, 'one action for the DOM mouseup/click and engine FINISH triplet');
  checkSpeed(1);
  now += 400;
  ctx.mapGamepadAction(event({ detail: { name: 'mousebutton-left', status: 1 } }));
  assert.equal(ctx.popState.walkerSpeed, 1);
  ctx.mapGamepadAction(event({ detail: { name: 'mousebutton-left', status: 2 } }));
  checkSpeed(2);
  now += 400;
  speed.events.keydown(event({ type: 'keydown', key: ' ', repeat: false }));
  checkSpeed(3);
  now += 400;
  speed.events.keydown(event({ type: 'keydown', key: ' ', repeat: true }));
  speed.events.mouseup(event({ type: 'mouseup', button: 2 }));
  assert.equal(ctx.popState.walkerSpeed, 3, 'keyboard repeats and right clicks cannot toggle speed');
  now += 400;
  speed.events.mouseup(event({ type: 'mouseup', button: 0 }));
  checkSpeed(4);
  now += 400;
  speed.events.mouseup(event({ type: 'mouseup', button: 0 }));
  checkSpeed(5);
  assert.equal(labels.size, 5);
  assert.equal(new Set(labels.values()).size, 5, 'every speed draws its own visible digit');
  assert.equal(speed.children.length, 1, 'speed changes reuse a single label');
  assert.equal(speed.speedLabel.firstChild.attrs.stroke, '#cfe3ff');
  ctx.Cursor.position.x = 50;
  ctx.mapGamepadAction(event({ detail: { name: 'mousebutton-left', status: 2 } }));
  assert.equal(ctx.popState.peoplePaused, true);
  assert.equal(pause.attrs['aria-label'], 'Resume walkers');
  now += 400;
  pause.events.mouseup(event({ type: 'mouseup', button: 0 }));
  assert.equal(ctx.popState.peoplePaused, false);
  assert.equal(pause.attrs['aria-label'], 'Pause walkers');
});

test('doors are on roof boundaries, and people physically walk off the road before entering', () => {
  const poly = square(3, 1, 1), entry = { pathKey: 'town', center: { x: 3, y: 0 }, radius: 5,
    shapes: { nodes: [[-0.6, 0], [0.6, 0]], edges: [[0, 1]] },
    final: [{ sourceIndex: 0, poly, box: town.polygonBounds(poly), form: 'rect' }],
    obstacles: { circles: [], segments: [], roads: [] } };
  const ctx = context(['buildWalkGraph'], { townPointBlocked: () => false, townSpots: () => [], hexW: 100 });
  const graph = ctx.buildWalkGraph(entry), door = [...graph.doorForms.keys()][0];
  assert.equal(graph.nodes[door].y, 1, 'door is at the building, not a duplicate street point');
  const street = graph.adj[door][0];
  assert.equal(graph.nodes[street].y, 0);
  const person = { node: street, ...graph.nodes[street], route: [street, door], leg: 0, t: 0, wait: 0, speed: 1, fade: 1 };
  town.stepWalker(person, graph, 0.5, () => street, () => 0);
  assert.ok(person.y > 0 && person.y < 1);
  town.stepWalker(person, graph, 10, () => street, () => 0);
  assert.equal(person.node, door);
  town.stepWalker(person, graph, 0, () => street, () => 0);
  assert.equal(person.inside, true);
  assert.equal(person.y, 1);
});

test('square positions remain safe off-road stops while decorations stay scenery', () => {
  const placements = [{ deco: { kind: 'well' }, x: 0.3, y: 0.3, pad: 0.01, unit: 0.01 },
    { deco: { kind: 'bench' }, x: -0.3, y: 0.3, pad: 0.01, unit: 0.01 },
    { deco: { kind: 'barrel' }, x: 0.2, y: 0.3, pad: 0.01, unit: 0.01 }];
  const ctx = context(['prepareTownLeisure', 'buildWalkGraph'], {
    townDecorationIndex: () => ({}), townDecoPlacements: () => placements, townPointBlocked: () => false,
    townSpots: entry => entry.leisureSpots, hexW: 100,
  });
  const entry = { pathKey: 'town', center: { x: 0, y: 0 }, radius: 1, final: [],
    shapes: { nodes: [[-0.5, 0], [0.5, 0]], edges: [[0, 1]], plazas: [square(-0.5, -0.5, 1)] },
    obstacles: { circles: [], segments: [], roads: [] } };
  ctx.prepareTownLeisure([entry], {});
  assert.equal(entry.decorations, undefined, 'opening a scene does not allocate offscreen decoration placements');
  assert.ok(entry.leisureSpots.some(s => s.kind === 'square'));
  assert.ok(!entry.leisureSpots.some(s => s.kind === 'decoration'), 'decorations remain drawn but are not visit destinations');
  assert.ok(entry.leisureSpots.length <= 24);
  const graph = ctx.buildWalkGraph(entry), targets = [...graph.spots.keys()];
  assert.ok(targets.length > 0);
  assert.ok([...graph.spots.values()].every(s => s.kind === 'square'));
  const from = targets.find(node => graph.nodes[node].y < 0), to = targets.find(node => graph.nodes[node].y > 0);
  assert.ok(graph.adj[from].includes(to), 'walkers meander directly across open squares, not back via roads every time');
  for (const node of targets) assert.ok(town.graphRoute(graph, 0, node));
  const person = { node: from, ...graph.nodes[from], route: town.graphRoute(graph, from, to), leg: 0, t: 0, speed: 1, wait: 0 };
  town.stepWalker(person, graph, 10, () => to, () => 0);
  assert.equal(person.node, to);
  assert.ok(person.y > 0);
});

test('casual walkers pause mid-leg without moving, resume the same route, and formations and runners are exempt', () => {
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]], casualPauses: true };
  const make = extra => ({ node: 0, x: 5, y: 0, route: [0, 1], leg: 0, t: 0.5, speed: 1, wait: 0, trip: 1, ...extra });
  const person = make();
  town.stepWalker(person, graph, 0.1, () => 1, () => 0);
  assert.equal(person.strollPause, 0.8);
  assert.equal(person.x, 5);
  town.stepWalker(person, graph, 0.8, () => 1, () => 0);
  assert.equal(person.x, 5);
  town.stepWalker(person, graph, 0.1, () => 1, () => 0);
  assert.ok(person.x > 5);
  assert.equal(person.pauseTrip, 1, 'one casual pause at most per trip');
  for (const extra of [{ clump: {} }, { runnerDuty: {} }]) {
    const worker = make(extra);
    town.stepWalker(worker, graph, 0.1, () => 1, () => 0);
    assert.ok(worker.x > 5);
    assert.equal(worker.strollPause, undefined);
  }
});

test('people approach stationary neighbours, including person zero, then both pause to talk', () => {
  const person = { id: 1, node: 0, x: -0.1, y: 0, wait: 0 }, peer = { id: 0, node: 1, x: 0.1, y: 0, wait: 6 };
  const graph = { nodes: [{ x: -0.1, y: 0 }, { x: 0.1, y: 0 }], spots: new Map() };
  const group = { people: [peer, person], byId: new Map([[0, peer], [1, person]]), entry: { radius: 1 }, spots: [] };
  const ctx = context(['walkerLeisureDestination', 'walkerActivityArrival'], {
    Math: Object.assign(Object.create(Math), { random: () => 0 }), personProfileFor: () => ({}),
  });
  assert.equal(ctx.walkerLeisureDestination(group, person, graph), 1);
  assert.equal(person.activity.social, 0);
  person.node = 1; person.x = 0.1;
  ctx.walkerActivityArrival(group, person);
  assert.equal(peer.wait, person.activity.duration);
  assert.equal(peer.stayActivity.label, 'Chat with a neighbour');
  assert.equal(peer.stayActivity.outside, true);
});

test('new decoration types are deterministic shared-path furniture and obey existing footprint bounds', () => {
  const list = town.townDecorations(941, 12000), kinds = new Set(list.map(d => d.kind));
  for (const kind of ['table', 'cart', 'well', 'statue', 'stall', 'basket']) {
    assert.ok(kinds.has(kind), kind);
    const deco = list.find(d => d.kind === kind), [group, path] = town.decorationPath(deco, 0, 0, 1);
    assert.equal(group, 'decoFurniture');
    assert.ok(path.includes('M') && path.includes('Z'));
    for (const match of path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)) assert.ok(Math.hypot(+match[1], +match[2]) <= deco.size * 1.15 + 0.2);
  }
  assert.deepEqual(town.townDecorations(941, 12000), list);
});
