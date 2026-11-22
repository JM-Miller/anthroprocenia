import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const { switchLocalCivilization, CivSwitchPicker, syncCivSwitchPauseMenu } = await loadModule('anthroprocenia-civ-switch.js');
function session() {
  let state = { multiplayer: false, hotseat: false, autoplay: false, local: 0, observer: 0, humans: [0], alive: [0, 1, 2], turn: 7 };
  const calls = [];
  return {
    calls, get: () => state, set: value => { state = { ...state, ...value }; },
    api: { setAsLocalPlayer(id) { calls.push(id); state = { ...state, local: id, observer: id, humans: [id] }; } },
  };
}
test('native takeover changes the human civilization without autoplay, turn advancement or a second handoff', async () => {
  const native = session();
  await switchLocalCivilization(2, native.api, native.get);
  assert.deepEqual(native.calls, [2]);
  assert.deepEqual(native.get(), { multiplayer: false, hotseat: false, autoplay: false, local: 2, observer: 2, humans: [2], alive: [0, 1, 2], turn: 7 });
});
test('takeover rejects unsafe sessions and invalid, eliminated, minor or already-controlled targets before calling native code', async () => {
  for (const change of [{ multiplayer: true }, { multiplayer: undefined }, { hotseat: true }, { autoplay: true }, { observer: 2 }, { humans: [] }]) {
    const native = session(); native.set(change);
    await assert.rejects(() => switchLocalCivilization(1, native.api, native.get));
    assert.deepEqual(native.calls, []);
  }
  for (const target of [0, -1, 3, 1.5, '1', null]) {
    const native = session();
    await assert.rejects(() => switchLocalCivilization(target, native.api, native.get));
    assert.deepEqual(native.calls, []);
  }
  await assert.rejects(() => switchLocalCivilization(1, {}, session().get), /unavailable/);
});
test('a no-op, observer-only change or partially completed handoff reports failure without speculative rollback', async () => {
  for (const change of [{}, { observer: 1 }, { local: 1, observer: 1 }, { local: 1, observer: 1, humans: [0, 1] }, { local: 1, observer: 1, humans: [1], turn: 8 }]) {
    const native = session(); let calls = 0;
    await assert.rejects(() => switchLocalCivilization(1, { setAsLocalPlayer() { calls++; native.set(change); } }, native.get), /not confirmed/);
    assert.equal(calls, 1);
  }
});
test('takeover waits for delayed native human-slot and local-player updates', async () => {
  const native = session();
  await switchLocalCivilization(1, { setAsLocalPlayer(id) {
    native.set({ observer: id });
    setTimeout(() => native.set({ local: id, humans: [id] }), 30);
  } }, native.get);
  assert.equal(native.get().local, 1);
});
function element() {
  const classes = new Set();
  return {
    style: {}, children: [], events: {}, attrs: {}, textContent: '',
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { this.attrs[name] = value; },
    focus() { this.focused = true; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.events[name] = callback; },
    contains(child) { return this === child || this.children.includes(child); },
    get firstElementChild() { return this.children[0]; },
    getBoundingClientRect() { return { left: 16, right: 54, top: 16, bottom: 54 }; },
  };
}
function pickerFixture() {
  const native = session(), body = element(), events = [], errors = [];
  let target = 1;
  const picker = new CivSwitchPicker({
    document: { body, createElement: element }, scale: n => n, getApi: () => native.api, getSession: native.get,
    map: { enter: () => events.push('enter'), leave: () => events.push('restore'),
      targetAt: (x, y) => x < 0 || y < 0 ? null : target, highlight: id => events.push(['highlight', id]) },
    resume: () => events.push('resume'), returnToPause: () => events.push('pause'),
    label: id => `Civilization ${id}`, reportError: message => errors.push(message),
  });
  const event = (button, target) => ({ button, target, clientX: 100, clientY: 100, preventDefault() {}, stopImmediatePropagation() {} });
  return { picker, native, body, events, errors, event, setTarget: value => { target = value; } };
}
test('picker hides UI, highlights only changed targets, and restores map settings on right-click and X cancellation', () => {
  for (const cancel of ['right', 'close', 'keyboard']) {
    const { picker, native, body, events, event } = pickerFixture();
    const hud = element(), map = element();
    map.classList.add('anthro-map-render-layer'); body.appendChild(hud); body.appendChild(map);
    picker.begin();
    assert.equal(body.classList.contains('anthroprocenia-civ-picking'), true);
    assert.equal(hud.classList.contains('anthroprocenia-civ-picker-hidden'), true);
    assert.equal(map.classList.contains('anthroprocenia-civ-picker-hidden'), false);
    assert.equal(picker.root.classList.contains('anthroprocenia-civ-picker-hidden'), false);
    assert.equal(picker.root.focused, true);
    picker.hover(100, 100); picker.hover(101, 100);
    assert.deepEqual(events.filter(Array.isArray), [['highlight', 1]]);
    if (cancel === 'keyboard') picker.input('cancel', true, 0, 0);
    else picker.root.events.mouseup(event(cancel === 'right' ? 2 : 0, cancel === 'close' ? picker.root.firstElementChild : picker.root));
    assert.equal(picker.active, false);
    assert.equal(body.classList.contains('anthroprocenia-civ-picking'), false);
    assert.equal(hud.classList.contains('anthroprocenia-civ-picker-hidden'), false);
    assert.deepEqual(events.slice(-2), ['restore', 'pause']);
    assert.deepEqual(native.calls, []);
  }
});
test('native left-click switches once and suppresses duplicate release input without reopening pause', async () => {
  const { picker, native, events } = pickerFixture();
  picker.begin();
  assert.equal(picker.input('mousebutton-left', false, 100, 100), true);
  assert.deepEqual(native.calls, []);
  picker.input('mousebutton-left', true, 100, 100);
  picker.input('mousebutton-left', true, 100, 100);
  await new Promise(setImmediate);
  assert.deepEqual(native.calls, [1]);
  assert.equal(picker.active, false);
  assert.equal(events.at(-1), 'restore');
  assert.equal(events.includes('pause'), false);
});
test('empty map clicks do not switch and native failures remain visible in the picker', async () => {
  const { picker, native, errors, setTarget } = pickerFixture();
  picker.begin(); setTarget(null); await picker.choose(100, 100);
  assert.equal(picker.active, true); assert.deepEqual(native.calls, []);
  setTarget(1); native.api.setAsLocalPlayer = () => { throw new Error('native refused'); };
  await picker.choose(100, 100);
  assert.equal(picker.active, true);
  assert.match(picker.error.textContent, /native refused/);
  assert.match(errors[0], /native refused/);
});
test('failed map setup restores the UI and returns to pause instead of trapping input', () => {
  const { picker, body, events, errors } = pickerFixture();
  picker.map.enter = () => { throw new Error('map unavailable'); };
  picker.begin();
  assert.equal(picker.active, false);
  assert.equal(body.classList.contains('anthroprocenia-civ-picking'), false);
  assert.deepEqual(events.slice(-2), ['restore', 'pause']);
  assert.match(errors[0], /map unavailable/);
});

function pauseMenuFixture(captions) {
  function node(caption = '') {
    const item = element();
    item.textContent = caption;
    item.getAttribute = key => item.attrs[key] ?? null;
    item.appendChild = child => item.insertBefore(child, null);
    item.insertBefore = (child, before) => {
      if (child.parentElement) child.parentElement.children.splice(child.parentElement.children.indexOf(child), 1);
      item.children.splice(before ? item.children.indexOf(before) : item.children.length, 0, child);
      child.parentElement = item;
    };
    Object.defineProperty(item, 'nextElementSibling', { get() {
      return item.parentElement?.children[item.parentElement.children.indexOf(item) + 1] || null;
    } });
    const descendants = () => item.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    item.querySelectorAll = selector => descendants().filter(child => selector === '*' || child.classList.contains('pause-menu-button'));
    item.querySelector = selector => descendants().find(child => selector === '#' + child.id) || null;
    return item;
  }
  const container = node();
  for (const caption of captions) {
    const button = node(caption);
    button.classList.add('pause-menu-button');
    container.appendChild(button);
  }
  return { container, document: { createElement: () => node() }, node };
}

test('pause menu inserts once between localized Retire and Restart without changing native order or handlers', () => {
  for (const reverse of [false, true]) {
    const labels = ['Neustart', 'Aufgeben'];
    if (reverse) labels.reverse();
    const { container, document } = pauseMenuFixture(['Fortsetzen', ...labels, 'Optionen', 'Beenden']);
    const original = [...container.children], activations = [];
    const localize = key => ({ LOC_PAUSE_MENU_RESTART: 'Neustart', LOC_PAUSE_MENU_RETIRE: 'Aufgeben' })[key] || key;
    const sync = () => syncCivSwitchPauseMenu(container, document, localize, () => activations.push('switch'));
    const button = sync();
    for (let i = 0; i < 5; i++) assert.equal(sync(), button);
    assert.deepEqual(container.children, [original[0], original[1], button, ...original.slice(2)]);
    button.events['action-activate']();
    assert.deepEqual(activations, ['switch']);
    assert.ok(container.children.every(row => row.classList.contains('anthroprocenia-pause-row')));
    assert.equal(button.classList.contains('pause-menu-button'), true);
  }
});

test('pause menu handles a tooltip-wrapped disabled Restart and repairs placement after native replacement', () => {
  const { container, document, node } = pauseMenuFixture(['Resume', 'Restart', 'Retire', 'Options']);
  const localize = key => ({ LOC_PAUSE_MENU_RESTART: 'Restart', LOC_PAUSE_MENU_RETIRE: 'Retire' })[key] || key;
  const restart = container.children[1], wrapper = node();
  container.insertBefore(wrapper, restart);
  wrapper.appendChild(restart);
  const button = syncCivSwitchPauseMenu(container, document, localize, () => {});
  assert.equal(container.children.indexOf(button), container.children.indexOf(wrapper) + 1);
  assert.equal(wrapper.classList.contains('anthroprocenia-pause-row'), true);
  container.appendChild(button);
  syncCivSwitchPauseMenu(container, document, localize, () => {});
  assert.equal(container.children.indexOf(button), container.children.indexOf(wrapper) + 1);
  assert.equal(container.children.filter(item => item === button).length, 1);
});
