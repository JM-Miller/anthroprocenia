import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const demo = await loadModule('anthroprocenia-demography.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const timeline = await loadModule('anthroprocenia-timeline.js');
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
  const ctx = vm.createContext({ ...panel, ...demo, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const life = (born, extra = {}) => ({ gen: 0, family: 0, parent: null, born, since: 0, kind: 'initial', history: [], ...extra });
const rows = states => states.map((state, index) => ({ index, state }));
const plain = data => JSON.parse(JSON.stringify([...data.members]));
test('family timeline narrates births, marriages, deaths, arrivals and observed career moves in date order', () => {
  const members = [
    { id: '0:0', born: -30, married: -10, spouse: '1:0', deathYear: 2, cause: 'disease' },
    { id: '1:0', born: -28, married: -10, spouse: '0:0', kind: 'moved', since: 1 },
    { id: '2:0', born: 0 },
  ];
  const frames = [[0, 1, 1, '4999 BCE'], [0, 2, 0, '4998 BCE'], [0, 3, 0, '4997 BCE']];
  const events = timeline.familyEvents(members, member => `Person ${member.id}`, [0, 1, 2], frames,
    [{ id: '0:0', turn: 1, text: 'changed occupations to Farmer and moved to Chicago.' }, { id: '9:0', turn: 1, text: 'must not appear' }]);
  assert.equal(events.length, 8);
  assert.ok(events.some(event => /Person 1:0 was widowed/.test(event.text)));
  assert.match(events[0].text, /^In 5029 BCE Person 0:0 was born/);
  assert.equal(events.filter(event => /married/.test(event.text)).length, 1);
  assert.ok(events.some(event => event.text === 'In 4998 BCE Person 0:0 changed occupations to Farmer and moved to Chicago.'));
  assert.ok(events.some(event => /4997 BCE.*died of disease/.test(event.text)));
  assert.ok(events.every((event, i) => !i || event.year >= events[i - 1].year));
  assert.equal(timeline.familyEventDate(-1, [0], [[0, 1, 1, '1 CE']]), '1 BCE');
  assert.equal(timeline.familyEventDate(0, [0], [[0, 1, 1, 'Spring 400 CE']]), 'Spring 400 CE');
});

test('civilization timeline follows delta ownership, wars, peace and discoveries without inventing initial transitions', () => {
  const model = new timeline.CivilizationTimeline(0);
  const packed = (plot, owner) => plot * 1024 + (owner + 1) * 8 + 2;
  const frame = turn => [0, turn + 1, turn === 0 ? 1 : 0, `${4999 - turn} BCE`];
  const identity = (id, name) => [id, 'Leader', name, name, 0, 0, name];
  model.observe(0, frame(0), { s: 1, terr: [packed(1, 0), packed(2, 1)], set: [[1, 'New York City', 1, 'City'], [2, 'Madrid', 1, 'City']] },
    { idd: [identity(0, 'The Americans'), identity(1, 'The Spanish')], rel: [[0, 1, 0]], soc: [[0, [0]]] }, id => `Tech ${id}`, () => 'The War of the Plains');
  const base = model.clone();
  model.observe(1, frame(1), { terr: [packed(2, 0)], set: [] },
    { rel: [[0, 1, 4]], soc: [[0, [0, 1]]] }, id => `Tech ${id}`, () => 'The War of the Plains');
  model.observe(2, frame(2), { terr: [], set: [[1, 'New York', 2, 'City']] },
    { rel: [[0, 1, 0]] }, id => `Tech ${id}`, () => 'War');
  assert.ok(model.events.some(event => event.text === 'In 4999 BCE New York City was founded.'));
  assert.ok(model.events.some(event => event.text === 'In 4998 BCE The War of the Plains began between The Americans and The Spanish.'));
  assert.ok(model.events.some(event => /Madrid came under The Americans control/.test(event.text)));
  assert.ok(model.events.some(event => /mastered Tech 1/.test(event.text)));
  assert.ok(model.events.some(event => /war between.*ended/.test(event.text)));
  assert.ok(model.events.some(event => /New York City was renamed New York/.test(event.text)));
  assert.equal(base.events.length, 1, 'provisional processing cannot mutate its checkpoint');
  assert.equal(base.settlements.get(2).owner, 1);
  const old = new timeline.CivilizationTimeline(0);
  old.observe(0, [0, 50, 1, '4900 BCE'], { s: 1, terr: [packed(1, 0)], set: [[1, 'York', 1, 'City']] },
    { rel: [[0, 1, 4]] }, () => '', () => '');
  assert.match(old.events[0].text, /was first recorded/);
  assert.match(old.events[1].text, /were already at war/);
});

test('family observation history persists real changes, ignores replay scrubbing and excludes unrelated generations', () => {
  const node = { id: 'home', tile: 0, total: 1, label: 'Home', icon: { owner: 0 } };
  const saves = new Map(), frames = [[0, 1], [0, 2]];
  let occupation = 'Farmer', place = 'Boston';
  const ctx = context(['popFamilyObservations'], {
    familyState: { index: 0 }, familyObservations: new Map(), frames, pos: 0,
    viewRead: key => saves.get(key), viewSave: (key, produce) => saves.set(key, JSON.parse(JSON.stringify(produce()))),
    nearestSettlement: () => ({ index: 0 }), settlementsForPos: () => new Map([[0, [place]]]),
    popPerson: () => ({ occupation, life: { state: { gen: 0 } } }),
  });
  const rows = [{ id: '0:0', index: 0, gen: 0 }];
  assert.equal(ctx.popFamilyObservations(node, rows).length, 0, 'historical frames do not write observations');
  ctx.pos = 1; ctx.popFamilyObservations(node, rows);
  frames.push([0, 3]); ctx.pos = 2; occupation = 'Trader'; place = 'Chicago';
  const events = ctx.popFamilyObservations(node, rows);
  assert.equal(events.length, 1); assert.match(events[0].text, /changed occupations to Trader and moved to Chicago/);
  ctx.popFamilyObservations(node, rows); assert.equal(events.length, 1, 'redraw does not duplicate changes');
  ctx.familyObservations.clear(); assert.equal(ctx.popFamilyObservations(node, rows).length, 1, 'reload uses the saved history');
  ctx.pos = 0; assert.equal(ctx.popFamilyObservations(node, rows).length, 0, 'past view never reveals future events');
});

test('civilization timeline refresh replaces a provisional frame and resets when scrubbing backward', () => {
  const frames = [[0, 1, 1, '4999 BCE'], [0, 2, 0, '4998 BCE']];
  const records = [{ s: 1, terr: [10], set: [[0, 'York', 1, 'City']] }, { set: [[0, 'New York', 1, 'City']] }];
  const ctx = context(['civTimelineEvents'], {
    CivilizationTimeline: timeline.CivilizationTimeline, cmdLocalPlayer: () => 0,
    civTimelineState: { model: null, next: 0 }, frames, pos: 1, PEOPLE_PROGRESSION_NODES: [],
    readTurnCached: turn => records[turn], readPlayersRec: () => null, civTimelineWarName: () => 'War', civTimelineExtras: () => ({}),
  });
  assert.equal(ctx.civTimelineEvents().length, 2);
  records[1].set = [[0, 'Chicago', 1, 'City']];
  const refreshed = ctx.civTimelineEvents();
  assert.equal(refreshed.length, 2); assert.match(refreshed[1].text, /renamed Chicago/);
  ctx.pos = 0;
  assert.equal(ctx.civTimelineEvents().length, 1, 'future events disappear on rewind');
  ctx.pos = 1;
  assert.equal(ctx.civTimelineEvents().length, 2, 'forward processing does not duplicate events');
});

test('civilization timeline UI pages, escapes event text and hides while a game overlay is open', () => {
  const element = () => ({
    style: {}, events: {}, attrs: {}, children: [], classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(name, fn) { this.events[name] = fn; },
    append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
  });
  test('timeline ruler has a labeled tick for each event and escapes detailed tooltip attributes', () => {
    const ctx = context(['timelineRowsHtml', 'escHtml'], { ps: n => n });
    const html = ctx.timelineRowsHtml([{ date: '4999 BCE', turn: 4, text: 'In 4999 BCE "Timothy" was born.', details: 'Family: <McGee> & relatives' }]);
    assert.equal((html.match(/role="listitem"/g) || []).length, 1);
    assert.match(html, /border-top:2px solid/);
    assert.match(html, /4999 BCE/);
    assert.match(html, /&quot;Timothy&quot;/);
    assert.match(html, /&lt;McGee&gt; &amp; relatives/);
    assert.match(html, /Recorded turn 5/);
  });
  test('leadership section names follow the recorded government on replay', () => {
    const identity = [];
    const ctx = context(['leadHomeName'], { identityForPos: () => new Map([[0, identity]]), LEAD_HOME_NAMES: { center: 'Governors', unit: 'Officers' } });
    for (const [government, expected] of [['Chiefdom', "Chief's Council"], ['Classical Republic', 'Lead Senators'], ['Despotism', 'Noble Family Heads'], ['Monarchy', 'Royal Court']]) {
      identity[7] = government; assert.equal(ctx.leadHomeName('palace', 0), expected);
    }
    assert.equal(ctx.leadHomeName('unit', 0), 'Officers');
  });
  const state = { open: true, events: [], start: 0 };
  const ctx = context(['buildCivTimelineUi', 'syncCivTimeline', 'timelineRowsHtml'], {
    document: { createElement: element, body: element() }, addPanelMinimize() {}, MAP_CHROME_CLASS: 'chrome',
    civTimelineState: state, els: {}, ps: n => n, manifest: { rev: 1 }, frames: [[]], pos: 0,
    cmdLocalPlayer: () => 0, civTimelineEvents: () => Array.from({ length: 85 }, (_, i) => ({ text: `Event <${i}>` })),
    escHtml: text => text.replace(/</g, '&lt;').replace(/>/g, '&gt;'), measureArea: () => ({ y: 0 }),
    window: { innerWidth: 1920, innerHeight: 1080 },
  });
  ctx.syncCivTimeline(true);
  assert.equal(ctx.els.civTimelinePage.textContent, '1-40 / 85');
  assert.match(ctx.els.civTimelineRows.innerHTML, /Event &lt;0&gt;/);
  const next = ctx.els.civTimelinePanel.children[2].children[1];
  next.events.click({ stopPropagation() {} });
  assert.equal(ctx.els.civTimelinePage.textContent, '41-80 / 85');
  next.events.click({ stopPropagation() {} });
  assert.equal(ctx.els.civTimelinePage.textContent, '81-85 / 85');
  next.events.click({ stopPropagation() {} });
  assert.equal(ctx.els.civTimelinePage.textContent, '81-85 / 85', 'next stays on the last complete page boundary');
  ctx.syncCivTimeline(false); assert.equal(ctx.els.civTimelinePanel.style.display, 'none');
  ctx.syncCivTimeline(true); assert.equal(ctx.els.civTimelinePanel.style.display, 'flex');
  ctx.els.civTimelinePanel.children[0].children[1].events.click({ stopPropagation() {} });
  assert.equal(state.open, false); assert.equal(ctx.els.civTimelinePanel.style.display, 'none');
});

test('leader household restriction follows actual family links rather than everyone in the palace cohort', () => {
  const data = demo.simulateFamilies(rows([life(-40), life(-38), life(-10), life(-2, { kind: 'moved' })]), 0, [0]);
  const ctx = context(['popLeaderHousehold', 'popFamilyRows'], {
    popLeaderHome: () => 'palace', popLeaderRole: (traits, index) => index === 0 ? 'King' : '',
    popFamilyData: () => data, lifeTimelineNow: () => ({ years: [0] }), pos: 0,
  });
  const profile = { life: { state: { gen: 0 } } }, traits = { iconId: 'palace' };
  assert.equal(ctx.popLeaderHousehold('home', 1, 0, traits, 4, 0, profile, ''), true);
  assert.equal(ctx.popLeaderHousehold('home', 2, 0, traits, 4, 0, profile, ''), true);
  assert.equal(ctx.popLeaderHousehold('home', 3, 0, traits, 4, 0, profile, ''), false);
  assert.equal(ctx.popLeaderHousehold('home', 8, 0, traits, 10000000, 0, profile, ''), false);
});

test('modeled spouses are reciprocal adults, and existing children link back to both parents', () => {
  const input = rows([life(-40), life(-38), life(-10), life(-8)]);
  const original = JSON.stringify(input);
  const data = demo.simulateFamilies(input, 0, [0]);
  const [a, b, child, sibling] = input.map((_, i) => data.members.get(`${i}:0`));
  assert.equal(a.spouse, b.id);
  assert.equal(b.spouse, a.id);
  assert.ok(a.married - a.born >= 18 && b.married - b.born >= 18);
  assert.deepEqual(child.parents, [a.id, b.id]);
  assert.deepEqual(sibling.parents, [a.id, b.id]);
  assert.deepEqual(a.children, [child.id, sibling.id]);
  assert.deepEqual(b.children, a.children);
  assert.equal(child.spouse, null);
  assert.equal(JSON.stringify(input), original, 'simulation does not mutate life records');
  assert.deepEqual(plain(demo.simulateFamilies(JSON.parse(original), 0, [0])), plain(data), 'reload reconstructs exact relationship IDs');
  const future = demo.simulateFamilies(input, 30, [0]);
  assert.equal(future.members.get(child.id).spouse, null, 'siblings never marry as they become adults');
  assert.equal(future.members.get(sibling.id).spouse, null);
});

test('marriage and parentage obey arrival, death, age and generation boundaries', () => {
  const deceased = life(-40, { deathYear: -5, deathTurn: 1 });
  const child = life(-2, { kind: 'born' });
  const data = demo.simulateFamilies(rows([deceased, life(-38), child, life(-1, { kind: 'moved', since: 1 })]), 0, [-10, -1]);
  assert.equal(data.members.get('1:0').spouse, '0:0', 'a dead spouse remains in the retained marriage');
  assert.equal(data.members.get('2:0').parents.length, 0, 'no conception assigned after a parent died');
  assert.equal(data.members.get('3:0').parents.length, 0, 'newcomers do not acquire invented local parents');
  const lateArrival = demo.simulateFamilies(rows([life(-40, { kind: 'moved', since: 1 }), life(-38), life(-10)]), 0, [-30, -1]);
  assert.equal(lateArrival.members.get('0:0').married, -1);
  assert.equal(lateArrival.members.get('2:0').parents.length, 0, 'no child assigned before a partner moved in');
  const replacement = life(-2, { gen: 1, family: 1, kind: 'moved', since: 1, history: [deceased] });
  const later = demo.simulateFamilies(rows([replacement, life(-38)]), 0, [-10, -2]);
  assert.equal(later.members.get('0:1').spouse, null, 'marriages do not transfer to a replacement generation');
  assert.equal(later.members.get('0:0').spouse, '1:0');
  assert.deepEqual(demo.simulateFamilies(rows([life(10)]), 0, [0]).members.size, 0, 'future births are not exposed');
});

test('home family work remains bounded with millions of people and caches by turn and cohort', () => {
  let calls = 0;
  const node = { id: 'home', total: 10000000, tile: 4, icon: { owner: 1 } };
  const ctx = context(['popFamilyData'], {
    familyCache: new Map(), pos: 0, popState: { builtKey: '0' },
    popLife: (id, index) => { calls++; return { state: life(-40 + index % 8 * 5) }; },
    lifeTimelineNow: () => ({ years: [0, 2] }),
  });
  const first = ctx.popFamilyData(node, 9999990);
  assert.equal(calls, demo.FAMILY_COHORT_SIZE);
  assert.ok(first.members.size <= demo.FAMILY_COHORT_SIZE);
  assert.equal(ctx.popFamilyData(node, 9999991), first);
  assert.equal(calls, demo.FAMILY_COHORT_SIZE);
  ctx.pos = 1;
  assert.notEqual(ctx.popFamilyData(node, 9999990), first);
  assert.equal(calls, demo.FAMILY_COHORT_SIZE * 2);
  ctx.popState.familyVersion = 1;
  ctx.popFamilyData(node, 9999990);
  assert.equal(calls, demo.FAMILY_COHORT_SIZE * 3, 'same-turn deaths and model refreshes invalidate family data');
});

test('Population family summaries and tree rows expose spouses, both parents and children', () => {
  const data = demo.simulateFamilies(rows([life(-40), life(-38), life(-10)]), 0, [0]);
  const ctx = context(['popFamilyRows', 'popFamilySummary'], {
    popFamilyData: () => data, popPerson: () => ({ life: { state: { gen: 0 } } }),
    popFamilyMemberName: (node, member) => `Name ${member.index}`,
  });
  const family = ctx.popFamilyRows(data, '2:0');
  assert.equal(family[0].relation, 'Selected');
  assert.deepEqual(Array.from(family.slice(1).map(p => p.relation)), ['Parent', 'Parent']);
  const parent = ctx.popFamilyRows(data, '0:0');
  assert.ok(parent.some(p => p.relation === 'Spouse' && p.index === 1));
  assert.ok(parent.some(p => p.relation === 'Child' && p.index === 2));
  assert.equal(ctx.popFamilySummary({}, 0), 'Married: Name 1 | Children: 1');
  data.members.get('1:0').deathYear = 1;
  assert.match(ctx.popFamilySummary({}, 0), /^Widowed:/);
  assert.match(slice('popPersonRowHtml'), /popFamilySummary\(row.node, row.index\)/);
});

test('Leader tabs separate own, met and all civilizations using the viewed turn contact record', () => {
  const own = { node: { icon: { owner: 1 } } }, met = { node: { icon: { owner: 2 } } }, unknown = { node: { icon: { owner: 3 } } };
  const ctx = context(['leadRefresh', 'leadSectionRows'], {
    leadState: { tab: 'own', builtKey: '', start: 17 }, popState: { builtKey: 'turn1', tree: [] },
    cmdLocalPlayer: () => 1, cmdOwnPeople: owner => owner === 1,
    popModelKey: () => 'turn1', popRefreshModel() {}, leaderRows: () => [unknown, met, own],
    LEAD_HOME_ORDER: {}, LEAD_ROWS_SHOWN: 18, pos: 0, readPlayersRec: () => ({ met: [1, 2] }),
  });
  ctx.leadRefresh(true);
  assert.deepEqual(Array.from(ctx.leadState.rows), [own]);
  ctx.leadState.tab = 'met'; ctx.leadRefresh(false);
  assert.deepEqual(Array.from(ctx.leadState.rows), [met]);
  assert.equal(ctx.leadState.start, 0);
  ctx.leadState.tab = 'all'; ctx.leadRefresh(false);
  assert.deepEqual(Array.from(ctx.leadState.rows), [own, unknown, met]);
  ctx.leadState.tab = 'met'; ctx.readPlayersRec = () => null; ctx.leadRefresh(true);
  assert.equal(ctx.leadState.rows.length, 0, 'old recordings do not claim unknown contacts were met');
  ctx.readPlayersRec = () => ({ met: [1, 3] }); ctx.popState.builtKey = 'turn2'; ctx.leadRefresh(false);
  assert.deepEqual(Array.from(ctx.leadState.rows), [unknown], 'historical contact changes update the tab');
});

function cameraContext() {
  const node = { id: 'home', tile: 0, total: 4 };
  const frames = [], messages = [];
  const ctx = context(['popCameraCenter', 'popGoToPerson', 'popTickCameraTrip', 'popStopCameraTrip'], {
    popCameraTrip: { trip: null, timer: 0, press: null }, mapVisible: true, mapDrag: null,
    viewZoom: 32, mapPanX: 0, mapPanY: 0, viewAspectY: 0.6,
    mapX: 20, mapY: 40, mapPxW: 1000, mapPxH: 800, layoutCols: 10, colShift: 0, hexW: 100,
    DEFAULT_VIEW_ZOOM: 2, MIN_VIEW_ZOOM: 0.01, maxViewZoom: () => 128, pos: 5, clock: 0, active: true,
    measureArea: () => ({ x: 10, y: 30, w: 800, h: 600 }), gameOverlayActive: () => false,
    popCameraSpot: () => ({ x: 800, y: 600 }), popPerson: () => ({ life: { state: { gen: 2 } } }),
    popStopFollow() { ctx.unfollowed = true; }, stopHeldView() {}, popSelectPerson() {},
    peopleActive: () => ctx.active, nowMs: () => ctx.clock,
    scheduleGameCameraSync() {}, clearTimeout() {}, setTimeout: () => 1,
    applyMapView() { frames.push({ zoom: ctx.viewZoom, ...ctx.popCameraCenter() }); },
    cmdToast: lines => messages.push(...lines), err: e => assert.fail(e),
  });
  return { ctx, node, frames, messages };
}

test('person camera trip slowly zooms out, pans and reaches maximum zoom centered on its live destination', () => {
  const { ctx, node, frames } = cameraContext();
  const origin = ctx.popCameraCenter();
  assert.equal(ctx.popGoToPerson(node, 0, 2), true);
  assert.equal(ctx.unfollowed, true);
  ctx.clock = 600; ctx.popTickCameraTrip();
  assert.ok(ctx.viewZoom < 32 && ctx.viewZoom > 2);
  assert.ok(Math.abs(ctx.popCameraCenter().x - origin.x) < 1e-8, 'zoom out holds the starting center');
  ctx.clock = 2300; ctx.popTickCameraTrip();
  assert.equal(ctx.viewZoom, 2);
  assert.ok(ctx.popCameraCenter().x > origin.x && ctx.popCameraCenter().x < 800);
  ctx.clock = 4300; ctx.popTickCameraTrip();
  assert.ok(ctx.viewZoom > 2 && ctx.viewZoom < 128);
  ctx.popCameraSpot = () => ({ x: 810, y: 620 });
  ctx.clock = 5800; ctx.popTickCameraTrip();
  assert.equal(ctx.viewZoom, 128);
  assert.ok(Math.abs(ctx.popCameraCenter().x - 810) < 1e-8);
  assert.ok(Math.abs(ctx.popCameraCenter().y - 620) < 1e-8);
  assert.equal(ctx.popCameraTrip.trip, null);
  assert.equal(ctx.popCameraTrip.timer, 0);
  assert.equal(frames.length, 5);
});

test('camera trips cancel on manual navigation, a second trip, death, overlays, turn changes or map closure', () => {
  for (const change of [ctx => { ctx.mapVisible = false; }, ctx => { ctx.mapDrag = {}; }, ctx => { ctx.pos++; },
    ctx => { ctx.gameOverlayActive = () => true; }, ctx => { ctx.popPerson = () => ({ life: { state: { gen: 3 } } }); }]) {
    const { ctx, node } = cameraContext();
    ctx.popGoToPerson(node, 0);
    change(ctx); ctx.clock = 500; ctx.popTickCameraTrip();
    assert.equal(ctx.popCameraTrip.trip, null);
    assert.equal(ctx.popCameraTrip.timer, 0);
  }
  const { ctx, node, messages } = cameraContext();
  assert.equal(ctx.popGoToPerson(node, 0, 1), false);
  assert.match(messages[0], /not living/);
  ctx.popGoToPerson(node, 0);
  ctx.clock = 500; ctx.popGoToPerson(node, 1);
  assert.equal(ctx.popCameraTrip.trip.index, 1);
  assert.equal(ctx.popCameraTrip.trip.at, 500);
  for (const fn of ['panMap', 'changeMapZoom', 'popToggleFollow']) assert.match(slice(fn), /popStopCameraTrip\(\)/);
});

test('camera destination uses the occupied roof center, outdoor walker, home roof, then tile', () => {
  const node = { id: 'home', tile: 0, total: 4 };
  const building = { sourceIndex: 2, box: { x0: 20, x1: 40, y0: 10, y1: 30 } };
  const ctx = context(['popCameraSpot'], {
    personBuildingSpot: (key, center) => { assert.equal(center, true); return { x: 3, y: 4 }; },
    personSpot: () => ({ x: 5, y: 6 }), townWorld: null, basePos: [{ x: 100, y: 200 }], hexW: 20, hexH: 10,
    popIconKey: () => ({ nodeId: 'home' }), townHousingFor: () => ({ sourceOf: () => 2 }),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popCameraSpot(node, 0))), { x: 3, y: 4 });
  ctx.personBuildingSpot = () => null;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popCameraSpot(node, 0))), { x: 5, y: 6 });
  ctx.personSpot = () => null;
  ctx.townWorld = { parts: new Map([['town', { entry: { item: {}, final: [building] } }]]) };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popCameraSpot(node, 0))), { x: 30, y: 20 });
  ctx.townWorld = null;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.popCameraSpot(node, 0))), { x: 110, y: 205 });
});

test('double-press tracking survives row rendering, deduplicates mouseup/click and excludes action controls', () => {
  let clock = 1000, trips = 0;
  const ctx = context(['popPersonDoublePress'], {
    popCameraTrip: { press: null }, Date: { now: () => clock },
    popGoToPerson: () => { trips++; }, popActionTarget: (target, key) => target.action === key, popPinStatus: () => '',
  });
  const row = { type: 'person', node: { id: 'home' }, index: 0 };
  const event = { target: {}, preventDefault() {}, stopPropagation() {} };
  assert.equal(ctx.popPersonDoublePress(event, row), false);
  clock += 2; assert.equal(ctx.popPersonDoublePress(event, row), false, 'synthetic click after mouseup is not a double click');
  clock += 180; assert.equal(ctx.popPersonDoublePress(event, { ...row }), true);
  assert.equal(trips, 1);
  clock += 500; ctx.popPersonDoublePress(event, row);
  clock += 100; assert.equal(ctx.popPersonDoublePress(event, { ...row, index: 1 }), false);
  assert.equal(trips, 1, 'two different people do not count as a double click');
  event.target.action = 'data-pop-family';
  clock += 100; assert.equal(ctx.popPersonDoublePress(event, row), false);
  assert.equal(trips, 1);
  assert.match(slice('buildFamilyUi'), /addEventListener\('dblclick'/);
});

test('a double-click still targets the original person when selecting a search result relocates the row', () => {
  let clock = 1000, destination;
  const ctx = context(['popPersonDoublePress'], {
    popCameraTrip: { press: null }, Date: { now: () => clock },
    popGoToPerson: (node, index) => { destination = [node.id, index]; }, popActionTarget: () => false, popPinStatus: () => '',
  });
  const event = { target: {}, clientX: 500, clientY: 400, preventDefault() {}, stopPropagation() {} };
  ctx.popPersonDoublePress(event, { type: 'person', node: { id: 'home' }, index: 2, result: true });
  clock += 150;
  assert.equal(ctx.popPersonDoublePress(event, { type: 'node', node: { id: 'other' } }), true);
  assert.deepEqual(destination, ['home', 2]);
});

test('zoom-out keeps the occupied destination and bounded walking scene until zoom-in resumes', () => {
  const { ctx, node } = cameraContext();
  ctx.popGoToPerson(node, 0);
  ctx.active = false;
  ctx.popCameraSpot = () => ({ x: 1, y: 2 });
  ctx.clock = 2300; ctx.popTickCameraTrip();
  assert.equal(ctx.popCameraTrip.trip.destination.x, 800, 'hiding the walker does not send an indoor visitor back home');
  const world = {}, walkers = new Map([['town', {}]]);
  const stopped = context(['stopPeople'], {
    peopleLoop: 0, townWalkers: walkers, townWorld: world, peopleSvg: { style: {} },
    clearPeopleVisuals: () => { stopped.peopleSvg.style.display = 'none'; },
    walkerClumps: { clear() {} }, closeClumpPicker() {}, peopleClumpMarkers: [], peopleClumpHidden: new Set(), clumpsAt: 0,
    popCameraTrip: { trip: { pos: 5 } }, pos: 5, mapVisible: true, gameOverlayActive: () => false,
  });
  stopped.stopPeople();
  assert.equal(stopped.townWorld, world);
  assert.equal(walkers.size, 1);
  assert.equal(stopped.peopleSvg.style.display, 'none');
  stopped.popCameraTrip.trip = null;
  stopped.stopPeople();
  assert.equal(stopped.townWorld, null);
  assert.equal(walkers.size, 0);
});

test('the Family Tree double-click handler passes the clicked relative and generation, not the focused ancestor', () => {
  const element = () => ({
    style: {}, events: {}, attrs: {}, children: [], classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(name, fn) { this.events[name] = fn; }, append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
  });
  const node = { id: 'home' };
  let destination;
  const ctx = context(['buildFamilyUi'], {
    addPanelMinimize() {},
    document: { createElement: element, body: element() }, window: { addEventListener() {} }, ps: n => n, MAP_CHROME_CLASS: 'chrome', els: {},
    familyState: { nodeId: 'home' }, popState: { nodeIndex: new Map([['home', node]]) },
    popFollowFamilyPerson: (node, index, gen) => { destination = [node.id, index, gen]; },
  });
  ctx.buildFamilyUi();
  const row = element(); row.setAttribute('data-family-index', '3'); row.setAttribute('data-family-gen', '2');
  row.parentNode = ctx.els.familyBody;
  ctx.els.familyBody.events.dblclick({ target: row, button: 0, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(destination, ['home', 3, 2]);
});

test('actual Leader tab controls switch filters, reset scrolling and expose their selected state', () => {
  const element = () => ({
    style: {}, events: {}, attrs: {}, children: [], classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(name, fn) { this.events[name] = fn; }, append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
  });
  let refreshed = '';
  const ctx = context(['buildLeadersUi', 'leadRender', 'leadSectionRows', 'panelActionIcon', 'setPanelButtonLabel'], {
    addPanelMinimize() {},
    document: { createElement: element, body: element() }, ps: n => n, MAP_CHROME_CLASS: 'chrome', els: {},
    leadState: { open: true, tab: 'own', start: 5, rows: [] }, LEAD_ROWS_SHOWN: 18,
    leadCrownIcon: element, onLeadPress() {}, popSetHoverRow() {}, pos: 0, escHtml: String,
    popPinnedRows: () => [], readPlayersRec: () => ({ met: [1, 2] }), leadRefresh() { refreshed = ctx.leadState.tab; }, popSyncPersonHighlights() {},
  });
  ctx.buildLeadersUi();
  assert.deepEqual(Array.from(ctx.els.leadTabs, tab => tab.attrs['aria-label']), ['Your civ', 'Met civs', 'All civs']);
  assert.ok(ctx.els.leadTabs.every(tab => /<svg/.test(tab.innerHTML)));
  ctx.leadRender();
  assert.equal(ctx.els.leadTabs[0].attrs['aria-selected'], 'true');
  ctx.els.leadTabs[1].events.click({ stopPropagation() {} });
  assert.equal(refreshed, 'met');
  assert.equal(ctx.leadState.start, 0);
  assert.equal(ctx.els.leadTabs[0].attrs['aria-selected'], 'false');
  assert.equal(ctx.els.leadTabs[1].attrs['aria-selected'], 'true');
  ctx.readPlayersRec = () => null;
  ctx.leadRender();
  assert.match(ctx.els.leadRows.innerHTML, /Contact history is unavailable/);
});

test('traditional family layout pairs spouses, branches to siblings and keeps parents above children without overlapping boxes', () => {
  const data = demo.simulateFamilies(rows([life(-40), life(-38), life(-10), life(-8)]), 0, [0]);
  const members = [...data.members.values()], layout = demo.familyTreeLayout(members);
  const box = id => layout.boxes.find(b => b.id === id);
  assert.equal(layout.boxes.length, members.length);
  assert.equal(box('0:0').y, box('1:0').y, 'spouses share a row');
  assert.equal(box('2:0').y, box('3:0').y, 'siblings share the next row');
  assert.ok(box('0:0').y + box('0:0').height < box('2:0').y);
  assert.ok(layout.links.some(link => link.kind === 'marriage' && link.points[0][1] === link.points[1][1]));
  assert.ok(layout.links.some(link => link.kind === 'children' && link.points[0][0] !== link.points[1][0]), 'shared sibling branch');
  for (const a of layout.boxes) for (const b of layout.boxes) if (a !== b) {
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  assert.deepEqual(demo.familyTreeLayout(members), layout);
  assert.equal(demo.familyTreeLayout([]).boxes.length, 0);
  assert.equal(demo.familyTreeLayout([members[0]]).boxes.length, 1, 'missing relatives do not invent boxes');
});

test('multigeneration family layout retains every member once, separates generations and handles single parents', () => {
  const input = [
    { id: 'a', spouse: 'b', parents: [], born: 0 },
    { id: 'b', spouse: 'a', parents: [], born: 1 },
    { id: 'c', spouse: 'd', parents: ['a', 'b'], born: 20 },
    { id: 'd', spouse: 'c', parents: [], born: 21 },
    { id: 'e', spouse: null, parents: ['c', 'd'], born: 40 },
    { id: 'f', spouse: null, parents: ['e'], born: 60 },
  ];
  const layout = demo.familyTreeLayout(input), byId = new Map(layout.boxes.map(b => [b.id, b]));
  assert.equal(byId.size, input.length);
  for (const member of input) for (const parent of member.parents) assert.ok(byId.get(parent).y < byId.get(member.id).y);
  for (const link of layout.links) assert.ok(link.points.every(point => point.every(Number.isFinite)));
  assert.throws(() => demo.familyTreeLayout([{ id: 'a', parents: ['b'], born: 0 }, { id: 'b', parents: ['a'], born: 1 }]), /cyclic/);
});

test('family layout draws reversed spouses across their gap and tolerates conflicting marriage generations', () => {
  const spouses = [
    { id: 'b', spouse: 'a', parents: [], born: 1 },
    { id: 'a', spouse: 'b', parents: [], born: 0 },
  ];
  const layout = demo.familyTreeLayout(spouses);
  const marriage = layout.links.find(link => link.kind === 'marriage');
  assert.equal(marriage.points[1][0] - marriage.points[0][0], 28);
  const family = [
    { id: 'a', spouse: 'd', parents: [], born: 0 },
    { id: 'b', spouse: 'c', parents: ['a'], born: 20 },
    { id: 'c', spouse: 'b', parents: [], born: 1 },
    { id: 'd', spouse: 'a', parents: ['c'], born: 21 },
  ];
  const result = demo.familyTreeLayout(family), boxes = new Map(result.boxes.map(box => [box.id, box]));
  assert.equal(boxes.size, family.length);
  assert.equal(result.links.filter(link => link.kind === 'marriage').length, 2);
  for (const member of family) for (const parent of member.parents) assert.ok(boxes.get(parent).y < boxes.get(member.id).y);
});

test('changing Population sorting clears shared hover before rebuilding rows', () => {
  const calls = [];
  const ctx = context(['popSetSortMode'], {
    popState: {}, els: {}, popSetHoverRow: row => calls.push(row),
    popRecomputeRows: () => calls.push('rows'), popRender: () => calls.push('render'),
    updateSelectionIndicator() {},
  });
  ctx.popSetSortMode('occupation');
  assert.deepEqual(calls, [null, 'rows', 'render']);
});

test('hover updates duplicate Population rows, leader rows and family boxes in place with one shared effect', () => {
  const element = (key, gen, extra = {}) => ({
    style: {}, attrs: { 'data-person-key': key, 'data-person-gen': String(gen), 'data-person-background': 'base', 'data-person-edge': 'edge', ...extra },
    getAttribute(key) { return this.attrs[key] ?? null; },
  });
  const population = [element('home#0', 2), element('home#0', 2), element('home#1', 2)];
  const leader = element('home#0', 2), box = element('home#0', 2), deceased = element('home#0', 1, { 'data-person-living': 'false' });
  const root = nodes => ({ querySelectorAll: selector => selector === '[data-person-key]' ? nodes : [] });
  const node = { id: 'home' };
  let arrows = 0;
  const ctx = context(['popSetHoverRow', 'popHoverIdentity', 'popSyncPersonHighlights', 'popSetMapHover'], {
    popState: { open: false, hoverRow: null, mapHover: null },
    els: { popRows: root(population), leadRows: root([leader]), familyBody: root([box, deceased]) },
    popPerson: () => ({ life: { state: { gen: 2 } } }),
    POP_MAP_HOVER: { background: 'gold', edge: 'yellow' }, ps: n => n, updateSelectionIndicator() { arrows++; },
  });
  ctx.popSetHoverRow({ type: 'person', node, index: 0 });
  for (const el of [population[0], population[1], leader, box]) {
    assert.equal(el.style.background, 'gold');
    assert.equal(el.style.borderLeftColor, 'yellow');
  }
  assert.equal(population[2].style.background, 'base');
  assert.equal(deceased.style.background, 'base', 'past generations do not highlight their replacement');
  ctx.popSetHoverRow(null);
  for (const el of [population[0], population[1], leader, box]) assert.equal(el.style.background, 'base');
  ctx.popSetMapHover({ person: 'home#0', home: 'home', tile: 1 });
  for (const el of [population[0], population[1], leader, box]) assert.equal(el.style.background, 'gold', 'walker hover uses the identical effect');
  assert.equal(deceased.style.background, 'base');
  ctx.popSetMapHover(null);
  ctx.popSetHoverRow({ type: 'person', node, index: 0, gen: 1 });
  assert.equal(deceased.style.background, 'gold');
  assert.equal(leader.style.background, 'base', 'hovering deceased family highlights only that generation');
  assert.ok(arrows >= 3);
});

test('family double-click starts follow once and never toggles the same person off or follows a replacement', () => {
  let followed = false, calls = 0, notices = 0;
  const ctx = context(['popFollowFamilyPerson'], {
    popPerson: () => ({ life: { state: { gen: 2 } } }), popFollowMatches: () => followed,
    popToggleFollow() { calls++; followed = true; }, cmdToast() { notices++; },
  });
  const node = { total: 3 };
  assert.equal(ctx.popFollowFamilyPerson(node, 1, 2), true);
  assert.equal(calls, 1);
  assert.equal(ctx.popFollowFamilyPerson(node, 1, 2), true);
  assert.equal(calls, 1);
  assert.equal(ctx.popFollowFamilyPerson(node, 1, 1), false);
  assert.equal(calls, 1);
  assert.equal(notices, 1);
});

test('leadership section collapse is keyed by civilization and role group and keeps its header available for expansion', () => {
  const ownCourt = { node: { id: 'court', icon: { owner: 1 } }, index: 0, home: 'palace' };
  const ownGovernor = { node: { id: 'gov', icon: { owner: 1 } }, index: 0, home: 'center' };
  const foreignCourt = { node: { id: 'other', icon: { owner: 2 } }, index: 0, home: 'palace' };
  const header = { getAttribute: key => key === 'data-lead-section' ? '1:palace' : null, parentNode: null };
  const ctx = context(['leadSectionRows', 'onLeadPress'], {
    leadState: { rows: [ownCourt, ownGovernor, foreignCourt], expanded: new Set(), start: 0, stamp: 0 },
    LEAD_ROWS_SHOWN: 18, els: {}, popSetHoverRow() {}, leadRender() {},
  });
  assert.equal(ctx.leadSectionRows().length, 3, 'all groups start collapsed');
  assert.ok(ctx.leadSectionRows().every(row => row.type === 'section' && row.collapsed));
  ctx.onLeadPress({ target: header, button: 0 });
  let visible = ctx.leadSectionRows();
  assert.equal(visible.length, 4);
  assert.ok(visible.some(row => row.type === 'section' && row.id === '1:palace' && !row.collapsed));
  assert.ok(visible.some(row => row.type === 'person' && row.index === 0));
  assert.ok(!visible.some(row => row.type === 'person' && row.index === 2), 'same role in another civ stays collapsed');
  ctx.leadState.stamp = 0;
  ctx.onLeadPress({ target: header, button: 0 });
  assert.equal(ctx.leadSectionRows().length, 3);
});
