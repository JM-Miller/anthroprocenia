import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';
const { SkipAheadController, skipDuration, skipTargetTurn, createSkipAheadPanel, installSkipAheadDiplomacy } = await loadModule('anthroprocenia-skipahead.js');

function harness(overrides = {}) {
  const handlers = new Map(), calls = [], changes = [];
  const state = { turn: 100, age: 'AGE_ANTIQUITY', player: 3, observer: 3, multiplayer: false, canStart: true, ...overrides };
  const engine = {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    off(name, fn) { handlers.get(name)?.delete(fn); },
  };
  const emit = (name, data) => { for (const fn of [...(handlers.get(name) || [])]) fn(data); };
  const api = { isActive: false,
    setTurns(n) { calls.push(['turns', n]); },
    setReturnAsPlayer(n) { calls.push(['return', n]); },
    setObserveAsPlayer(n) { calls.push(['observe', n]); },
    setPause(n) { calls.push(['pause', n]); },
    setActive(n) { calls.push(['active', n]); this.isActive = n; if (!n) emit('AutoplayEnded'); },
  };
  const controller = new SkipAheadController({ engine, getApi: () => api, getState: () => state, onChange: s => changes.push(s) });
  return { controller, state, api, emit, calls, changes, handlers, engine };
}
test('duration converts whole years, seasons and months into actual turns and rejects invalid input', () => {
  assert.equal(skipDuration('turns', '', '50', 0, 0), 50);
  assert.equal(skipDuration('calendar', 'AGE_ANTIQUITY', 0, '50', '0'), 50);
  assert.equal(skipDuration('calendar', 'AGE_EXPLORATION', 0, '2', '3'), 11);
  assert.equal(skipDuration('calendar', 'AGE_MODERN', 0, '2', '11'), 35);
  for (const input of ['', '0', '-1', '1.2', 'NaN', 'Infinity', '1e3', '2147483648']) assert.throws(() => skipDuration('turns', '', input, 0, 0));
  assert.throws(() => skipDuration('calendar', 'AGE_EXPLORATION', 0, 1, 4));
  assert.throws(() => skipDuration('calendar', 'AGE_MODERN', 0, 0, 12));
  assert.throws(() => skipDuration('calendar', 'unknown', 0, 1, 0));
});
test('accelerated date and duration targets round forward to reachable simulation turns', () => {
  for (const factor of [2,3,4,5,6]) {
    assert.equal(skipDuration('calendar', 'AGE_MODERN', 0, 2, 11, factor), Math.ceil(35 / factor));
    assert.equal(skipTargetTurn('AGE_MODERN', '1751 CE', 5, factor), Math.ceil(17 / factor) + 1);
    assert.equal(skipTargetTurn('AGE_ANTIQUITY', '1 CE', 0, factor), Math.ceil(4000 / factor) + 1);
    assert.equal(skipDuration('turns', '', 50, 0, 0, factor), 50);
  }
  assert.throws(() => skipTargetTurn('AGE_MODERN', '1949 CE', 11, 6), /last turn/);
});
test('native simulation targets exactly fifty real turns and restores the original player and observer', () => {
  const h = harness();
  h.controller.begin(50);
  assert.deepEqual(h.calls, [['turns', 50], ['return', 3], ['observe', 3], ['pause', false], ['active', true]]);
  h.state.turn = 149; h.emit('TurnBegin');
  assert.equal(h.controller.active, true); assert.equal(h.controller.state.elapsed, 49);
  h.state.turn = 150; h.emit('TurnBegin');
  assert.equal(h.api.isActive, false); assert.equal(h.controller.state.phase, 'complete');
  assert.equal(h.controller.state.elapsed, 50);
  assert.ok([...h.handlers.values()].every(listeners => listeners.size === 0));
  h.state.turn = 151; h.emit('TurnBegin');
  assert.equal(h.controller.state.elapsed, 50);
});
test('pause and resume preserve the target; cancellation unpauses native autoplay and returns control once', () => {
  const h = harness(); h.controller.begin(50);
  h.state.turn = 105; h.emit('TurnBegin'); h.controller.togglePause();
  assert.equal(h.controller.state.paused, true);
  assert.equal(h.api.isActive, true); assert.equal(h.controller.state.requested, 50);
  h.controller.togglePause(); assert.equal(h.controller.state.paused, false);
  h.controller.togglePause(); h.controller.stop();
  assert.equal(h.controller.state.phase, 'stopped'); assert.equal(h.controller.state.elapsed, 5);
  assert.deepEqual(h.calls.slice(-2), [['pause', false], ['active', false]]);
  assert.equal(h.changes.filter(s => !s.active).length, 1);
});
test('diplomacy waits for paused autoplay ownership restoration and coalesces repeated requests', async () => {
  const h = harness(), opened = [], errors = [], waits = [];
  const manager = { raiseDiplomacyHub(player) { opened.push([this, player]); return 'native result'; } };
  installSkipAheadDiplomacy({ manager, getController: () => h.controller, getState: () => h.state,
    reportError: error => errors.push(error), wait: () => new Promise(resolve => waits.push(resolve)) });
  assert.equal(manager.raiseDiplomacyHub(4), 'native result');
  opened.length = 0;
  h.controller.begin(50); h.controller.togglePause(); h.state.player = -1;
  const pending = manager.raiseDiplomacyHub(4);
  assert.equal(h.api.isActive, false); assert.deepEqual(opened, []);
  manager.raiseDiplomacyHub(8);
  waits.shift()(); await Promise.resolve();
  assert.deepEqual(opened, [], 'AutoplayEnded alone does not confirm ownership');
  h.state.player = 3; waits.shift()(); await pending;
  assert.deepEqual(opened, [[manager, 8]]); assert.deepEqual(errors, []);
  assert.match(h.controller.state.message, /Stopped Skip Ahead to open diplomacy/);
});
test('diplomacy does not open with missing ownership, native stop failures or a changed Age', async () => {
  for (const failure of ['ownership', 'stop', 'age']) {
    const h = harness(), opened = [], errors = [];
    const manager = { raiseDiplomacyHub(player) { opened.push(player); } };
    installSkipAheadDiplomacy({ manager, getController: () => h.controller, getState: () => h.state,
      reportError: error => errors.push(error), wait: async () => {} });
    h.controller.begin(50); h.state.player = -1;
    if (failure === 'stop') h.api.setPause = () => { throw new Error('stop failed'); };
    if (failure === 'age') h.state.age = 'AGE_EXPLORATION';
    await manager.raiseDiplomacyHub(4);
    assert.deepEqual(opened, []); assert.equal(errors.length, 1);
    assert.match(errors[0], /Unable to open diplomacy/);
  }
});
test('Age endings, local defeat, victory and session changes stop rather than crossing player choices', () => {
  for (const name of ['GameAgeEnded', 'TeamVictory', 'LoadComplete', 'GameStarted', 'PlayerDefeat']) {
    const h = harness(); h.controller.begin(50); h.state.turn = 110;
    h.emit(name, { player: 3 });
    assert.equal(h.api.isActive, false, name); assert.equal(h.controller.state.phase, 'stopped');
    assert.equal(h.controller.state.elapsed, 10);
  }
  const h = harness(); h.controller.begin(50); h.emit('PlayerDefeat', { player: 9 });
  assert.equal(h.controller.active, true);
  h.state.age = 'AGE_EXPLORATION'; h.state.turn = 1; h.emit('TurnBegin');
  assert.equal(h.controller.state.phase, 'stopped'); assert.equal(h.controller.state.elapsed, 0);
});
test('native early endings and overshoots are never reported as successful fifty-turn skips', () => {
  for (const [turn, phase] of [[120, 'stopped'], [151, 'error']]) {
    const h = harness(); h.controller.begin(50); h.state.turn = turn; h.api.isActive = false; h.emit('AutoplayEnded');
    assert.equal(h.controller.state.phase, phase); assert.doesNotMatch(h.controller.state.message, /^Completed/);
  }
});
test('network games, hotseat, historical replay, observers and other autoplay sessions are not modified', () => {
  for (const invalid of [{ multiplayer: true }, { multiplayer: undefined }, { canStart: false }, { observer: 9 }, { player: -1 }, { turn: NaN }]) {
    const h = harness(invalid);
    assert.throws(() => h.controller.begin(50)); assert.deepEqual(h.calls, []);
  }
  const h = harness(); h.api.isActive = true;
  assert.throws(() => h.controller.begin(50), /already running/);
  assert.deepEqual(h.calls, []);
});
test('native API failures stop owned autoplay, clean listeners, and surface errors without fake advancement', () => {
  const h = harness(); h.api.setActive = function(active) { this.isActive = active; if (active) throw new Error('native failure'); };
  assert.throws(() => h.controller.begin(50), /native failure/);
  assert.equal(h.controller.state.phase, 'error'); assert.equal(h.api.isActive, false);
  assert.equal(h.controller.state.elapsed, 0); assert.equal(h.changes.filter(s => !s.active).length, 1);
  assert.ok([...h.handlers.values()].every(listeners => listeners.size === 0));
});
test('absolute target dates map exactly to BCE/CE years, seasons and months within the current Age', () => {
  for (const [age, year, part, turn] of [
    ['AGE_ANTIQUITY', '4000 BCE', 0, 1], ['AGE_ANTIQUITY', '-1', 0, 4000], ['AGE_ANTIQUITY', '1 CE', 0, 4001],
    ['AGE_ANTIQUITY', '400 CE', 0, 4400], ['AGE_EXPLORATION', '400', 0, 1], ['AGE_EXPLORATION', '401 CE', 3, 8],
    ['AGE_EXPLORATION', '1749 CE', 3, 5400], ['AGE_MODERN', '1750', 0, 1], ['AGE_MODERN', '1751 CE', 5, 18],
    ['AGE_MODERN', '1949', 11, 2400],
  ]) assert.equal(skipTargetTurn(age, year, part), turn);
  for (const [age, year, part] of [
    ['AGE_ANTIQUITY', '0', 0], ['AGE_ANTIQUITY', '1.5', 0], ['AGE_ANTIQUITY', '-1 BCE', 0],
    ['AGE_ANTIQUITY', '401 CE', 0], ['AGE_EXPLORATION', '399', 0], ['AGE_EXPLORATION', '400', 4],
    ['AGE_MODERN', '1950', 0], ['AGE_MODERN', '1800', -1], ['AGE_MODERN', '1800', 12], ['unknown', '1800', 0],
  ]) assert.throws(() => skipTargetTurn(age, year, part));
});
function panelHarness(overrides = {}) {
  const h = harness({ realistic: true, turn: 1, ...overrides }), errors = [], finished = [], listeners = new Map();
  const element = () => ({ style: {}, attrs: {}, children: [], events: new Map(), textContent: '', value: '',
    classList: { add() {} }, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(fn); },
    getBoundingClientRect: () => ({ left: 0, width: 200 }), focus() {},
  });
  const document = { body: element(), createElement: element, createElementNS: element,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); } };
  const panel = createSkipAheadPanel({ document, scale: n => n, getBounds: () => ({ width: 1000, height: 800 }),
    getState: () => h.state, engine: h.engine, getApi: () => h.api, getOverlayActive: () => false,
    reportError: message => errors.push(message), onFinished: state => finished.push(state) });
  const all = (root = document.body) => [root, ...root.children.flatMap(child => all(child))];
  const byId = id => all().find(el => el.id === id);
  const byLabel = label => all().find(el => el.getAttribute('aria-label') === label || el.textContent === label);
  const fire = (el, type, extra = {}) => {
    const event = { type, button: 0, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const fn of el.events.get(type) || []) fn(event);
  };
  panel.toggle();
  return { ...h, panel, document, errors, finished, listeners, byId, byLabel, fire };
}
test('target-year input and season slider synchronize, begin exact native autoplay and minimize without losing pause or Stop', () => {
  const h = panelHarness({ age: 'AGE_EXPLORATION' }), input = h.byId('anthro-skip-custom-year'), season = h.byId('anthro-skip-target-part');
  input.value = '401 CE'; h.fire(input, 'input'); h.fire(season, 'keydown', { key: 'End' });
  assert.equal(season.getAttribute('aria-valuetext'), 'Winter');
  assert.equal(input.value, '401 CE');
  assert.equal(h.byId('anthro-skip-target-year').getAttribute('aria-valuetext'), '401 CE (Turn 8)');
  assert.ok(h.panel.element.children[1].children.some(element => element.textContent === 'Target: Winter 401 CE (Turn 8). 7 real turns.'));
  h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
  assert.equal(h.panel.controller.state.requested, 7);
  assert.equal(h.panel.element.children[1].style.display, 'none');
  assert.equal(h.byLabel('Restore Skip Ahead').getAttribute('aria-expanded'), 'false');
  assert.equal(h.byLabel('Stop').style.display, 'block');
  assert.equal(h.panel.pauseElement.style.display, 'flex'); assert.equal(input.disabled, true);
  h.fire(h.panel.pauseElement, 'keydown', { key: 'Enter' }); assert.equal(h.panel.controller.state.paused, true);
  h.fire(h.byLabel('Stop'), 'keydown', { key: 'Enter' });
  assert.equal(h.panel.controller.state.phase, 'stopped'); assert.equal(input.disabled, false);
  assert.equal(h.panel.pauseElement.style.display, 'none'); assert.equal(h.finished.length, 1);
  assert.deepEqual(h.errors, []);
});
test('month and year sliders support keyboard and dragging; invalid or past custom dates cannot start autoplay', () => {
  const h = panelHarness({ age: 'AGE_MODERN' }), input = h.byId('anthro-skip-custom-year'), year = h.byId('anthro-skip-target-year'), month = h.byId('anthro-skip-target-part');
  input.value = '1751 CE'; h.fire(input, 'input'); h.fire(month, 'keydown', { key: 'End' });
  assert.equal(month.getAttribute('aria-label'), 'Month'); assert.equal(month.getAttribute('aria-valuetext'), 'December');
  h.fire(year, 'keydown', { key: 'ArrowRight' }); assert.equal(input.value, '1752 CE');
  h.fire(month, 'mousedown', { clientX: 0 });
  assert.equal(month.getAttribute('aria-valuetext'), 'January');
  for (const fn of h.listeners.get('mousemove')) fn({ clientX: 200, buttons: 1, preventDefault() {}, stopPropagation() {} });
  assert.equal(month.getAttribute('aria-valuetext'), 'December');
  for (const value of ['0', '1740 CE', '1950 CE', '1750.5', 'not a year']) {
    input.value = value; h.fire(input, 'input');
    assert.equal(h.byLabel('Begin Autoplay').getAttribute('aria-disabled'), 'true');
    h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
    assert.equal(h.api.isActive, false);
  }
  input.value = '1751 CE'; h.fire(input, 'input');
  h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
  assert.equal(h.panel.controller.state.requested, 23);
  h.state.turn = 24; h.emit('TurnBegin');
  assert.equal(h.panel.controller.state.phase, 'complete'); assert.equal(input.disabled, false);
  assert.equal(h.byLabel('Begin Autoplay').getAttribute('aria-disabled'), 'true', 'the completed target cannot run again');
  assert.ok(!h.errors.some(message => /later than/.test(message)), 'successful completion does not report a past-date error');
});
test('accelerated panel sliders and custom years display reachable dates and request actual engine turns', () => {
  const previous = globalThis.GameInfo;
  try {
    for (const factor of [2,3,4,5,6]) {
      globalThis.GameInfo = { GlobalParameters: { lookup: name => name === 'ANTHRO_REALISTIC_SPEED_FACTOR' ? { Value: String(factor) } : undefined } };
      const h = panelHarness({ age: 'AGE_MODERN' }), input = h.byId('anthro-skip-custom-year'), month = h.byId('anthro-skip-target-part');
      h.fire(month, 'keydown', { key: 'Home' });
      input.value = '1751 CE'; h.fire(input, 'input');
      h.fire(month, 'keydown', { key: 'Home' });
      assert.equal(input.value, '1751 CE');
      const expectedMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      assert.equal(month.getAttribute('aria-valuetext'), expectedMonths[(Math.ceil(12 / factor) * factor) % 12]);
      h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
      assert.equal(h.panel.controller.state.requested, Math.ceil(12 / factor));
      h.state.turn = 1 + Math.ceil(12 / factor); h.emit('TurnBegin');
      assert.equal(h.panel.controller.state.phase, 'complete');
      assert.deepEqual(h.errors, []);
    }
  } finally {
    if (previous === undefined) delete globalThis.GameInfo;
    else globalThis.GameInfo = previous;
  }
});
test('annual targets hide the part slider and BCE/CE transitions skip year zero', () => {
  const h = panelHarness({ turn: 4000 }), year = h.byId('anthro-skip-target-year'), input = h.byId('anthro-skip-custom-year');
  assert.equal(h.byId('anthro-skip-target-part').getAttribute('aria-disabled'), 'true');
  h.fire(year, 'keydown', { key: 'Home' }); assert.equal(input.value, '1 CE');
  h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
  assert.equal(h.panel.controller.state.requested, 1);
});
test('native failures restore the minimized panel and show an explicit error instead of hiding it in the collapsed body', () => {
  const h = panelHarness();
  h.fire(h.byLabel('Begin Autoplay'), 'keydown', { key: 'Enter' });
  assert.equal(h.panel.element.children[1].style.display, 'none');
  h.api.setPause = () => { throw new Error('pause failed'); };
  h.fire(h.panel.pauseElement, 'keydown', { key: 'Enter' });
  assert.equal(h.panel.controller.state.phase, 'error');
  assert.equal(h.panel.element.children[1].style.display, 'block');
  assert.equal(h.byLabel('Minimize Skip Ahead').getAttribute('aria-expanded'), 'true');
  assert.ok(h.errors.some(message => /pause failed/.test(message)));
  assert.equal(h.api.isActive, false);
});
