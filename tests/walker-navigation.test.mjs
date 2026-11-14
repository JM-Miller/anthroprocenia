import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const people = await loadModule('anthroprocenia-people.js');
const commands = await loadModule('anthroprocenia-commands.js');
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
function context(names, state) {
  const ctx = vm.createContext({ ...town, ...people, ...commands, ...panel, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const element = () => ({
  style: {}, attrs: {}, children: [], events: {}, textContent: '', classList: { add() {} },
  get firstChild() { return this.children[0]; },
  setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
  appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
  addEventListener(name, fn) { this.events[name] = fn; }, querySelectorAll() { return []; },
});
const event = (extra = {}) => ({ button: 0, clientX: 0, clientY: 0, preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...extra });

test('family viewport fits the full layout, zooms around the pointer and keeps a reachable edge after extreme panning', () => {
  const state = { width: 1000, height: 800, size: 400, zoom: 1, x: 0, y: 0 };
  const content = element(), ctx = context(['familyViewport'], { familyState: state, els: { familyBody: element(), familyContent: content, familyZoom: element() }, ps: n => n });
  ctx.familyViewport(true);
  assert.equal(state.zoom, 0.38);
  const anchor = { x: 230, y: 190 }, before = { x: (anchor.x - state.x) / state.zoom, y: (anchor.y - state.y) / state.zoom };
  ctx.familyViewport(false, 2, anchor);
  assert.ok(Math.abs((anchor.x - state.x) / state.zoom - before.x) < 1e-8);
  assert.ok(Math.abs((anchor.y - state.y) / state.zoom - before.y) < 1e-8);
  ctx.familyViewport(false, 100000);
  assert.equal(state.zoom, 4);
  state.x = 1e9; state.y = -1e9; ctx.familyViewport();
  assert.equal(state.x, 368); assert.equal(state.y, 32 - 800 * 4);
  assert.match(content.style.transform, /^translate\(.+\) scale\(4\)$/);
});

test('safe irregular walking bends differ by person, respect obstacles, conserve travel distance and finish at exact graph nodes', () => {
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], adj: [[1], [0, 2], [1]], bendLimit: 1, bendAllowed: () => true };
  const make = id => ({ id, node: 0, x: 0, y: 0, route: [0, 1, 2], leg: 0, t: 0, wait: 0, speed: 10 });
  const a = make(1), b = make(2);
  town.stepWalker(a, graph, 0.25, () => 0, () => 0);
  town.stepWalker(b, graph, 0.25, () => 0, () => 0);
  assert.ok(a.y > 0.3 && b.y < 0);
  assert.ok(Math.abs(Math.hypot(a.x, a.y) - 2.5) < 1e-8, 'bending does not increase walking speed');
  town.stepWalker(a, graph, 100, () => 0, () => 0);
  assert.deepEqual([a.node, a.x, a.y, a.t], [2, 20, 0, 0]);
  const circle = { x: 5, y: 0.8, r: 0.7 };
  const blocked = make(1);
  town.stepWalker(blocked, { ...graph, bendAllowed: (a, b) => town.walkEdgeCost(a, b, { circles: [circle] }) <= Math.hypot(b.x - a.x, b.y - a.y) * 1.001 }, 0.25, () => 0, () => 0);
  assert.equal(blocked.y, 0, 'a tree prevents the proposed bend');
  const creek = { x1: 5, y1: -10, x2: 5, y2: 10, clear: 1 };
  const road = { x1: 0, y1: 0, x2: 10, y2: 0, clear: 0.1 }, crossing = make(1);
  town.stepWalker(crossing, { ...graph, bendAllowed: (a, b) => town.walkCreekAllowed(a, b, [creek], [road]) }, 0.5, () => 0, () => 0);
  assert.equal(crossing.y, 0, 'irregular movement cannot wander off the only road across a creek');
});

function visitFixture() {
  const building = { sourceIndex: 1, form: 'temple', group: 'sacred', name: 'Temple of Dawn' };
  const entry = { item: { owner: 1 }, final: [building] }, group = { entry, owner: 1 };
  const graph = {
    nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }, { x: 10, y: 0 }],
    adj: [[1], [0, 2, 4], [1, 3], [2], [1]], doorForms: new Map([[4, 'temple']]), roadEnds: [],
    visits: new Map([[1, [{ entry, building, door: 4 }]]]),
  };
  const ctx = context(['walkerVisitRoute', 'personActionText'], {
    townWorld: { graph }, walkerTrade: () => 'clergy', Math: Object.assign(Object.create(Math), { random: () => 0 }),
    itemOwner: item => item.owner, popEraNow: () => ({ age: 0 }),
    personProfileFor: () => ({ occupation: 'Priest' }), popActivityContext: () => ({ occupation: 'Priest' }),
  });
  return { ctx, graph, group, building };
}
test('occupational visits stop at a compatible door on the existing route and resume the original destination once', () => {
  const { ctx, graph, group } = visitFixture();
  const walker = { id: 0, key: 'h#0', node: 0, home: 0, x: 0, y: 0, wait: 0, speed: 100 };
  let visits = 0, picks = 0;
  const step = dt => town.stepWalker(walker, graph, dt, () => { picks++; return 3; }, () => 0, (w, r, t) => { visits++; return ctx.walkerVisitRoute(group, w, r, t); });
  step(0);
  assert.deepEqual(Array.from(walker.route), [0, 1, 4]);
  assert.equal(walker.resumeTarget, 3);
  assert.match(ctx.personActionText({ group, person: { ...walker, wait: 0 } }, {}), /^Traveling to Temple of Dawn: Lead Prayers$/);
  walker.wait = 0; step(1); step(0);
  assert.equal(walker.inside, true);
  assert.equal(walker.target, 3);
  assert.equal(walker.resumeTarget, undefined);
  assert.equal(ctx.personActionText({ group, person: walker }, {}), 'Lead Prayers at Temple of Dawn');
  assert.deepEqual(Array.from(walker.route), [4, 1, 2, 3]);
  assert.equal(picks, 1); assert.equal(visits, 1, 'resuming cannot insert another endless stop');
  walker.wait = 0; step(1);
  assert.equal(walker.node, 3);
  assert.equal(walker.x, 30);
});

test('automatic visits exclude incompatible trades, other owners, commands and companions already traveling together', () => {
  const { ctx, graph, group, building } = visitFixture(), person = { node: 0 };
  ctx.walkerTrade = () => 'stone';
  assert.equal(ctx.walkerVisitRoute(group, person, [0, 1, 2, 3], 3), null);
  ctx.walkerTrade = () => 'clergy';
  group.owner = 2;
  assert.equal(ctx.walkerVisitRoute(group, person, [0, 1, 2, 3], 3), null);
  group.owner = 1;
  assert.equal(ctx.walkerVisitRoute(group, { ...person, groupTravel: 'leader' }, [0, 1, 2, 3], 3), null);
  assert.equal(ctx.walkerVisitRoute(group, { ...person, cmd: {} }, [0, 1, 2, 3], 3), null);
  assert.equal(ctx.walkerVisitRoute(group, person, [0, 1, 4], 4), null, 'does not insert the destination a second time');
  assert.equal(building.name, 'Temple of Dawn');
  assert.doesNotMatch(slice('walkerVisitRoute'), /cmdExecute|resolveCommand|cmdOweYield/, 'ambient work never grants command yields');
});

test('companions favor living relatives and same-unit housemates, but exclude distant, indoor and commanded walkers', () => {
  const person = { id: 0, key: 'h#0', node: 0, x: 0, y: 0, residence: 2, speed: 1 };
  const peer = (id, residence = 9) => ({ id, key: `h#${id}`, node: 0, target: 2, route: [0, 1, 2], leg: 0, x: 1, y: 0, residence, speed: 1, wait: 0 });
  const unrelated = peer(2, 2), relative = peer(1), persons = [person, unrelated, relative];
  const group = { nodeId: 'h', entry: { item: { kind: 'building' } }, people: persons, byId: new Map(persons.map(p => [p.id, p])) };
  const members = new Map([
    ['0:0', { id: '0:0', index: 0, spouse: '1:0', parents: [] }],
    ['1:0', { id: '1:0', index: 1, spouse: '0:0', parents: [] }],
  ]);
  const ctx = context(['walkerTravelCompanion'], {
    hexW: 100, FAMILY_COHORT_SIZE: 8, popState: { nodeIndex: new Map([['h', {}]]) }, popFamilyData: () => ({ members }),
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
  });
  const graph = { nodes: [{}, {}, {}] };
  assert.equal(ctx.walkerTravelCompanion(group, person, graph), relative);
  assert.equal(person.groupTravel, relative.key);
  assert.ok(person.speed >= relative.speed * 0.97 && person.speed <= relative.speed * 1.03);
  group.entry.item.kind = 'unit'; members.clear();
  assert.equal(ctx.walkerTravelCompanion(group, person, graph), unrelated);
  unrelated.groupPace = 1; unrelated.speed = 2;
  ctx.walkerTravelCompanion(group, person, graph);
  assert.ok(person.speed <= 1.03, 'joining chains of companions cannot repeatedly multiply their speed');
  unrelated.cmd = {}; relative.inside = true;
  assert.equal(ctx.walkerTravelCompanion(group, person, graph), null);
  unrelated.cmd = null; unrelated.x = 50;
  assert.equal(ctx.walkerTravelCompanion(group, person, graph), null);
});

test('map and Population action text share command states, visits and modeled offscreen activities; row refreshes are throttled', () => {
  const { ctx, graph, group } = visitFixture(), person = { id: 0, cmd: { label: 'Lead Prayers', place: 'Temple' } };
  group.nodeId = 'h'; group.byId = new Map([[0, person]]);
  const node = { id: 'h' }, span = element();
  span.attrs = { 'data-action-node': 'h', 'data-action-index': '0' };
  const live = context(['personActionText', 'popCurrentAction', 'popRefreshActions'], {
    townWorld: { graph }, townWalkers: new Map([['town', group]]), popState: { open: true, nodeIndex: new Map([['h', node]]) },
    leadState: { open: false }, familyState: { open: false }, popOffscreenAction: () => 'Modeled: Lead Prayers at Temple',
    popPerson: () => ({}), popEraNow: () => ({ age: 0 }), els: { popRows: { querySelectorAll: () => [span] } },
  });
  assert.equal(live.popCurrentAction(node, 0), 'Traveling to Temple: Lead Prayers');
  live.popRefreshActions(1000);
  assert.match(span.textContent, /^Action: Traveling/);
  person.cmd.blocked = true; live.popRefreshActions(1100);
  assert.match(span.textContent, /^Action: Traveling/);
  live.popRefreshActions(1800);
  assert.match(span.textContent, /^Action: Blocked/);
  person.cmd.blocked = false; person.cmd.arrived = true;
  assert.equal(live.popCurrentAction(node, 0), 'Command at Temple: Lead Prayers');
  assert.match(live.popCurrentAction(node, 1), /Modeled: Lead Prayers/);
  assert.match(slice('popPersonTipText'), /Action:.*popCurrentAction/);
  assert.match(slice('personTipText'), /Action:.*escHtml\(action\)/);
});

function commandFixture() {
  const action = commands.familyActions('clergy').find(a => a.id === 'pray'), row = { action, family: 'clergy', leader: false };
  const state = { rows: new Map([['pray', row]]), selected: '', hovered: 'pray', target: null, targetsAt: 0, highlights: null };
  const walker = { person: { key: 'h#0', x: 0, y: 0 }, group: { owner: 1, entry: { item: { kind: 'building' } } } };
  const body = element(), rowEl = element(); rowEl.setAttribute('data-command-row', 'pray');
  const ctx = context(['cmdPanelEligible', 'cmdPanelDoers', 'cmdPanelPaintRows', 'cmdClearPanelCommand', 'cmdPanelTargetPath', 'cmdRefreshPanelTargets', 'onCmdPanelTargetDown', 'onCmdPanelKey'], {
    cmdPanelState: state, cmdState: { chosen: new Set(['h#0']) }, els: { cmdPanel: { querySelectorAll: () => [rowEl] } },
    mapVisible: true, cmdLiveTurn: () => true, peopleActive: () => true, gameOverlayActive: () => false,
    nowMs: () => 1000, ps: n => n, hexW: 100, viewZoom: 1, viewAspectY: 1, MAP_DEPTH: 0, CMD_ARROW_COLOR: '#7fe3ff',
    mapToScreen: (x, y) => ({ x, y }), measureArea: () => ({ x: 0, y: 0, w: 100, h: 100 }),
    cmdChosenWalkers: () => [walker], cmdFamilyOf: () => 'clergy', cmdIsLeader: () => false,
    cmdInReach: (person, target) => target.x < 80, cmdOwnPeople: owner => owner === 1,
    tileAtMapPoint: x => x < 80 ? 0 : 5, neighborsByIndex: {},
    townHits: [{ polys: [
      { group: 'sacred', box: { x0: 10, x1: 20, y0: 10, y1: 20 }, poly: [[10, 10], [20, 10], [20, 20], [10, 20]] },
      { group: 'house', box: { x0: 30, x1: 40, y0: 10, y1: 20 }, poly: [[30, 10], [40, 10], [40, 20], [30, 20]] },
      { group: 'sacred', box: { x0: 90, x1: 100, y0: 10, y1: 20 }, poly: [[90, 10], [100, 10], [100, 20], [90, 20]] },
    ] }], townTreePoints: [], townWalkers: new Map(),
    document: { body, createElementNS: () => element() }, sizeScreenSvg() {}, cmdHideArrows() {},
    cmdPanelHoverTarget() {}, overControlPanels: () => false, popPanelContains: () => false,
    pointInRect: (x, y, r) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h,
    cmdReady: () => true, cmdConsumeInput() {}, cmdTargetAt: () => ({ kind: 'building', cls: 'sacred', x: 15, y: 15 }),
  });
  return { ctx, state, row, rowEl, body };
}
test('command hover highlights only matching in-range on-screen targets and clears immediately on leave unless selected', () => {
  const { ctx, state, rowEl } = commandFixture();
  let profiles = 0;
  ctx.cmdFamilyOf = () => { profiles++; return 'clergy'; };
  ctx.cmdPanelPaintRows(); assert.match(rowEl.style.background, /127,227,255/);
  ctx.cmdRefreshPanelTargets(true);
  assert.equal(profiles, 1, 'profile matching is once per selected walker, not once per candidate building');
  assert.equal(state.highlights.firstChild.attrs.d, 'M10.0,10.0L20.0,10.0L20.0,20.0L10.0,20.0Z');
  state.hovered = ''; ctx.cmdPanelPaintRows(); ctx.cmdRefreshPanelTargets(true);
  assert.equal(state.highlights.style.display, 'none'); assert.equal(rowEl.style.background, 'transparent');
  state.selected = 'pray'; ctx.cmdPanelPaintRows(); ctx.cmdRefreshPanelTargets(true);
  assert.equal(state.highlights.style.display, 'block'); assert.equal(rowEl.attrs['aria-pressed'], 'true');
  ctx.gameOverlayActive = () => true; ctx.cmdRefreshPanelTargets(true);
  assert.equal(state.selected, ''); assert.equal(state.highlights.style.display, 'none');
});

test('left and right target clicks issue the selected command once with only its eligible walkers, then clear it', () => {
  for (const button of [0, 2]) {
    const { ctx, state, body } = commandFixture(), calls = [];
    ctx.cmdExecute = (action, menu) => calls.push({ action, menu });
    state.selected = 'pray';
    const click = event({ button, target: body, clientX: 15, clientY: 15 });
    ctx.onCmdPanelTargetDown(click);
    assert.ok(click.prevented && click.stopped);
    assert.equal(calls.length, 1); assert.equal(calls[0].action.id, 'pray');
    if (button === 2) assert.ok(ctx.cmdState.rightStamp > 0, 'consume the native context-menu tail too');
    assert.deepEqual(Array.from(calls[0].action.who), [0]);
    assert.equal(state.selected, ''); assert.equal(state.hovered, '');
    ctx.onCmdPanelTargetDown(click);
    assert.equal(calls.length, 1);
  }
});

test('invalid targets do not issue commands, Escape cancels, and route previews filter by the selected occupation group', () => {
  const { ctx, state, body } = commandFixture();
  let issued = 0; ctx.cmdExecute = () => issued++;
  ctx.cmdTargetAt = () => ({ kind: 'tree', x: 15, y: 15 });
  state.selected = 'pray';
  ctx.onCmdPanelTargetDown(event({ button: 2, target: body, clientX: 15, clientY: 15 }));
  assert.equal(issued, 0); assert.equal(state.selected, 'pray');
  ctx.onCmdPanelKey(event({ key: 'Escape' }));
  assert.equal(state.selected, '');
  const preview = context(['cmdArrowTarget', 'cmdPanelHoverTarget'], {
    cmdPanelState: { selected: 'pray', pointer: { x: 15, y: 15 }, rows: new Map([['pray', {}]]) }, cmdState: {},
    cmdTargetAt: () => ({ key: 'b1' }), cmdPanelDoers: () => [{}], overControlPanels: () => false, popPanelContains: () => false,
    pointInRect: () => true, measureArea: () => ({}), cmdDrawArrows: () => {},
  });
  preview.cmdPanelHoverTarget();
  assert.equal(preview.cmdArrowTarget().key, 'b1');
  preview.cmdPanelDoers = () => [];
  preview.cmdPanelHoverTarget();
  assert.equal(preview.cmdArrowTarget(), null);
  assert.match(slice('cmdDrawArrows'), /cmdPanelDoers\(cmdPanelState.rows.get\(cmdPanelState.selected\), target\)/);
});
