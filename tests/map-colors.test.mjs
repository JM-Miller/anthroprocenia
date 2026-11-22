import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const { CivColorUi } = await loadModule('anthroprocenia-civ-icon-ui.js');
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
function fixture() {
  let kind = 'major', nativeCalls = 0;
  const identities = new Map(Array.from({ length: 64 }, (_, owner) => [owner, ['leader', 'Rome', 'Roman', 255, 16711680, 'CIVILIZATION_ROME']]));
  const ctx = vm.createContext({
    pos: 0, ownerColorCache: new Map(), identityForPos: () => identities,
    ownerMeta: () => ({ kind, dotType: '#123456' }),
    UI: { Player: {
      getPrimaryColorValueAsHex() { nativeCalls++; return 255; },
      getSecondaryColorValueAsHex() { nativeCalls++; return 16711680; },
    } },
  });
  vm.runInContext(source.slice(source.indexOf('const PALETTE ='), source.indexOf('// Dual player colors.')), ctx);
  vm.runInContext(['ownerColors', 'unitColor', 'playerBorderColor'].map(slice).join('\n'), ctx);
  return { ctx, identities, nativeCalls: () => nativeCalls, setKind: value => { kind = value; } };
}
function lab(rgb) {
  const [r, g, b] = Array.from(rgb, value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const f = value => value > 216 / 24389 ? Math.cbrt(value) : value * 24389 / 27 / 116 + 16 / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test('all 63 default countries have distinct, perceptually spaced map colors even when their native civ colors match', t => {
  const { ctx, identities, nativeCalls } = fixture(), before = JSON.stringify([...identities]);
  const colors = Array.from({ length: 63 }, (_, owner) => ctx.ownerColors(owner));
  assert.equal(new Set(colors.map(color => color.primaryCss)).size, 63);
  assert.equal(new Set(colors.map(color => color.secondaryCss)).size, 63);
  let primaryMinimum = Infinity, secondaryMinimum = Infinity;
  const primary = colors.map(color => lab(color.primary)), secondary = colors.map(color => lab(color.secondary));
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
    primaryMinimum = Math.min(primaryMinimum, distance(primary[i], primary[j]));
    secondaryMinimum = Math.min(secondaryMinimum, distance(secondary[i], secondary[j]));
  }
  assert.ok(primaryMinimum >= 20, `primary CIE76 separation ${primaryMinimum}`);
  assert.ok(secondaryMinimum >= 12, `secondary CIE76 separation ${secondaryMinimum}`);
  for (let owner = 0; owner < 63; owner++) {
    assert.equal(ctx.unitColor(owner), colors[owner].primaryCss);
    assert.equal(ctx.playerBorderColor(owner), colors[owner].secondaryCss);
    assert.equal(ctx.ownerColors(owner), colors[owner], 'repeat draws reuse the cached colors');
  }
  ctx.pos = 123; ctx.ownerColorCache.clear();
  assert.deepEqual(Array.from({ length: 63 }, (_, owner) => ctx.ownerColors(owner).primaryCss), colors.map(color => color.primaryCss));
  assert.equal(JSON.stringify([...identities]), before, 'recorded/native identity colors remain unchanged');
  assert.equal(nativeCalls(), 0, 'default major slots do not depend on native color availability');
  t.diagnostic(`63 colors: minimum CIE76 primary ${primaryMinimum.toFixed(2)}, secondary ${secondaryMinimum.toFixed(2)}`);
});

test('independent powers and barbarians retain their existing map styling and native identity colors', () => {
  const { ctx, setKind } = fixture();
  setKind('citystate');
  assert.deepEqual(Array.from(ctx.ownerColors(0).primary), [255, 0, 0]);
  assert.deepEqual(Array.from(ctx.ownerColors(0).secondary), [0, 0, 255]);
  assert.equal(ctx.unitColor(0), '#ffffff');
  assert.equal(ctx.playerBorderColor(0), '#123456');
  setKind('village');
  assert.equal(ctx.unitColor(0), '#e23b3b');
  assert.equal(ctx.playerBorderColor(0), '#5a1010');
});

test('a scene-wipe watchdog cannot discard the first-meet diplomacy hub handoff', () => {
  for (const watchdog of [false, true]) {
    const errors = [], calls = [];
    const manager = {
      requestSceneWipe(source, onCovered) { this.covered = onCovered; return source; },
      endSceneWipe() { this.covered = null; return 'ended'; },
    };
    const ctx = vm.createContext({ LeaderModelManager: manager, err: message => errors.push(message) });
    vm.runInContext(slice('installDiplomacySceneHandoff'), ctx);
    ctx.installDiplomacySceneHandoff();
    assert.equal(manager.requestSceneWipe('first-meet-to-hub', () => calls.push('hub')), 'first-meet-to-hub');
    const delayedCallback = manager.covered;
    if (!watchdog) delayedCallback();
    assert.equal(manager.endSceneWipe(), 'ended');
    delayedCallback(); manager.endSceneWipe();
    assert.deepEqual(calls, ['hub'], 'native and watchdog paths must not replay the handoff');
    assert.equal(errors.length, watchdog ? 1 : 0);
    manager.requestSceneWipe('other-scene', () => calls.push('other'));
    manager.endSceneWipe();
    assert.deepEqual(calls, ['hub'], 'unrelated transition cancellation retains native behavior');
  }
  const manager = {}, ctx = vm.createContext({ LeaderModelManager: manager });
  vm.runInContext(slice('installDiplomacySceneHandoff'), ctx);
  ctx.installDiplomacySceneHandoff();
  assert.deepEqual(manager, {}, 'the base-game manager without scene wipes is untouched');
});
test('Classic diplomacy transitions advance without animation frames and coalesce duplicate frame updates', () => {
  const timers = [], errors = [], calls = [];
  let time = 0, updates = 0;
  const manager = {
    stepSceneWipe() {},
    requestSceneWipe(source, callback) { this.transitionPhase = 'in'; this.covered = callback; return source; },
    clearLeaderModels() { this.isClosing = true; this.closeStarted = time; return 'closing'; },
    onUpdate(timestamp) {
      updates++;
      if (this.transitionPhase && timestamp >= 300) {
        this.transitionPhase = '';
        this.covered();
      }
      if (this.isClosing && timestamp - this.closeStarted >= 1000) this.isClosing = false;
      return 'updated';
    },
  };
  const ctx = vm.createContext({ LeaderModelManager: manager, performance: { now: () => time },
    setTimeout: (callback, delay) => { assert.equal(delay, 100); timers.push(callback); }, err: message => errors.push(message) });
  vm.runInContext(slice('installDiplomacyTransitionPump'), ctx);
  ctx.installDiplomacyTransitionPump();
  assert.equal(manager.requestSceneWipe('first-meet-to-hub', () => calls.push('hub')), 'first-meet-to-hub');
  assert.equal(manager.onUpdate(0), 'updated'); manager.onUpdate(0);
  assert.equal(updates, 1, 'several native RAF chains may not repeat work within the same frame');
  while (timers.length) { time += 100; timers.shift()(); }
  assert.deepEqual(calls, ['hub']); assert.equal(time, 300);
  assert.equal(manager.clearLeaderModels(), 'closing');
  while (timers.length) { time += 100; timers.shift()(); }
  assert.equal(manager.isClosing, false, 'the native close deadline runs even when RAF does not');
  assert.deepEqual(errors, []);
});
test('a failed or indefinitely pending native diplomacy transition reports once and stops fallback work', () => {
  for (const fail of [false, true]) {
    const timers = [], errors = [];
    let time = 0;
    const manager = {
      stepSceneWipe() {}, requestSceneWipe() { this.transitionPhase = 'wait'; },
      onUpdate() { if (fail) throw new Error('model unavailable'); },
    };
    const ctx = vm.createContext({ LeaderModelManager: manager, performance: { now: () => time },
      setTimeout: callback => timers.push(callback), err: message => errors.push(message) });
    vm.runInContext(slice('installDiplomacyTransitionPump'), ctx); ctx.installDiplomacyTransitionPump();
    manager.requestSceneWipe();
    while (timers.length) { time += 100; timers.shift()(); }
    assert.equal(errors.length, 1);
    assert.match(errors[0], fail ? /model unavailable/ : /10 seconds/);
    assert.ok(time <= 10000);
    assert.equal(manager.transitionPhase, 'wait', 'do not force completion or manufacture native success');
    if (!fail) {
      manager.onUpdate(time + 1); assert.equal(timers.length, 0, 'a stalled scene cannot start endless fallback loops');
      manager.transitionPhase = ''; manager.onUpdate(time + 2);
      manager.requestSceneWipe(); assert.equal(timers.length, 1, 'a later independent transition may retry');
    }
  }
  const update = () => {}, manager = { onUpdate: update };
  const ctx = vm.createContext({ LeaderModelManager: manager });
  vm.runInContext(slice('installDiplomacyTransitionPump'), ctx); ctx.installDiplomacyTransitionPump();
  assert.equal(manager.onUpdate, update, 'native managers without Classic scene wipes are untouched');
});
test('diplomacy hides hanging banners in every scene while preserving models, fallback handles and cached reuse', () => {
  const { ctx } = fixture(), calls = [], originalParams = { tintColor1: 255, tintColor2: 65535,
    angle: 45, scale: 1.8, foreground: true, initialState: 'SPAWN_Delay12', triggerCallbacks: true };
  class Group {
    addModel(asset, location, params, extra) {
      const model = asset === 'CIVILIZATION_FAIL_BANNER_GAME_ASSET' ? null : {
        asset, params, alpha: 1, setAlpha(value) { this.alpha = value; },
      };
      calls.push({ group: this, asset, location, params, extra, model });
      return model;
    }
  }
  const left = new Group(), right = new Group(), location = { x: 1 }, marker = {};
  const create = (group, fallback = false) => {
    group.addModel('LEADER_LIGHTING_SCENE_DEFAULT_LEFT', location, originalParams, marker);
    group.addModel('LEADER_TEST_GAME_ASSET', location, originalParams, marker);
    return group.addModel(fallback ? 'CIVILIZATION_FAIL_BANNER_GAME_ASSET' : 'CIVILIZATION_TEST_BANNER_GAME_ASSET', location, originalParams, marker)
      || group.addModel('CIVILIZATION_DEFAULT_BANNER_GAME_ASSET', location, originalParams, marker);
  };
  const manager = {
    leaderModelGroupLeft: left, leaderModelGroupRight: right, cached: null,
    showLeaderModels() { this.leader3DBannerLeft = create(this.leaderModelGroupLeft, true); this.leader3DBannerRight = create(this.leaderModelGroupRight); return marker; },
    showLeftLeaderModel() { return this.leader3DBannerLeft = create(this.leaderModelGroupLeft); },
    showRightLeaderModel(owner) {
      if (this.cached === owner) return this.leader3DBannerRight;
      this.cached = owner;
      return this.leader3DBannerRight = create(this.leaderModelGroupRight);
    },
  };
  const sequences = ['showRightIndLeaderModel', 'showLeadersFirstMeet', 'showLeadersDeclareWar',
    'showLeadersAcceptPeace', 'showLeadersRejectPeace', 'showLeadersDefeat'];
  for (const method of sequences) manager[method] = () => manager.leader3DBannerRight = create(right);
  ctx.LeaderModelManager = manager;
  ctx.err = message => assert.fail(message);
  vm.runInContext('let diplomacyBannersInstalled = false;\n' + slice('installDiplomacyBannerVisibility'), ctx);
  ctx.installDiplomacyBannerVisibility();
  const wrapped = manager.showLeaderModels; ctx.installDiplomacyBannerVisibility();
  assert.equal(manager.showLeaderModels, wrapped, 'installation is idempotent');
  assert.equal(manager.showLeaderModels(0, 1), marker);
  for (const method of sequences) assert.equal(manager[method]().alpha, 0, method);
  for (const call of calls) {
    assert.equal(call.location, location); assert.equal(call.extra, marker);
    assert.equal(call.params, originalParams);
    if (call.model) assert.equal(call.model.alpha, call.asset.endsWith('_BANNER_GAME_ASSET') ? 0 : 1, call.asset);
  }
  assert.equal(originalParams.tintColor1, 255, 'native options are not mutated');
  for (const group of [left, right]) {
    assert.equal(group.addModel, Group.prototype.addModel);
    assert.equal(Object.hasOwn(group, 'addModel'), false, 'native group methods are restored without shadow properties');
  }
  calls.length = 0;
  assert.equal(manager.showLeftLeaderModel(63).alpha, 0, 'independent-power hanging cloth is hidden too');
  manager.showRightLeaderModel(2);
  const before = calls.length, reused = manager.leader3DBannerRight;
  assert.equal(manager.showRightLeaderModel(2), reused); assert.equal(calls.length, before, 'native cached-model reuse is preserved');
  assert.equal(reused.alpha, 0);
});

test('diplomacy banner visibility preserves model groups and propagates native creation failures', () => {
  const { ctx } = fixture(), failure = new Error('native creation failed'), add = () => ({});
  const left = { addModel: add }, right = { addModel: add };
  ctx.LeaderModelManager = {
    leaderModelGroupLeft: left, leaderModelGroupRight: right,
    showLeaderModels() { throw failure; }, showLeftLeaderModel() {}, showRightLeaderModel() {},
  };
  for (const method of ['showRightIndLeaderModel', 'showLeadersFirstMeet', 'showLeadersDeclareWar',
    'showLeadersAcceptPeace', 'showLeadersRejectPeace', 'showLeadersDefeat']) ctx.LeaderModelManager[method] = () => {};
  ctx.err = message => assert.fail(message);
  vm.runInContext('let diplomacyBannersInstalled = false;\n' + slice('installDiplomacyBannerVisibility'), ctx);
  ctx.installDiplomacyBannerVisibility();
  assert.throws(() => ctx.LeaderModelManager.showLeaderModels(0, 1), error => error === failure);
  assert.equal(left.addModel, add); assert.equal(right.addModel, add);
});

function colorElement(owner, leader = false) {
  const values = new Map(), priorities = new Map(), attrs = new Map(), classes = new Set();
  return {
    nodeType: 1, owner, leader, mode: 'normal',
    style: {
      get cssText() { return [...values].map(([key, value]) => `${key}:${value}${priorities.get(key) ? ' !important' : ''};`).join(''); },
      getPropertyValue: key => values.get(key) || '',
      getPropertyPriority: key => priorities.get(key) || '',
      setProperty(key, value, priority = '') { values.set(key, value); priorities.set(key, priority); },
      removeProperty(key) { values.delete(key); priorities.delete(key); },
    },
    classList: {
      contains: key => classes.has(key),
      toggle(key, on) { if (on) classes.add(key); else classes.delete(key); },
    },
    matches: selector => selector.split(',').some(part => part.trim() === 'leader-icon' ? leader :
      ['[data-player-id]', '[player-id]'].includes(part.trim()) && owner !== undefined),
    getAttribute: key => key === 'style' ? JSON.stringify([...values, ...priorities]) : attrs.get(key) ?? null,
    setAttribute(key, value) { attrs.set(key, value); },
    removeAttribute(key) { attrs.delete(key); },
  };
}
function colorUiFixture(ctx, resolveOwner = node => node.owner) {
  let observer, resolves = 0;
  const observed = new Set();
  const ui = new CivColorUi({
    MutationObserver: class {
      constructor(callback) { observer = { callback }; }
      observe(node) { observed.add(node); }
    },
    scopeMode: node => node.mode, resolveOwner,
    resolveColors: owner => {
      resolves++;
      if (!Number.isInteger(owner) || owner < 0 || owner >= 63) return null;
      const pair = ctx.ownerColors(owner);
      return { ...pair, variants: { isPrimaryLighter: true,
        primaryColor: { moreColor: pair.primaryCss, textColor: '#ffffff', accentColor: pair.secondaryCss },
        secondaryColor: { moreColor: pair.secondaryCss, textColor: '#ffffff', accentColor: pair.primaryCss } } };
    },
    reportError: message => assert.fail(message),
  });
  return { ui, observer, observed, resolves: () => resolves };
}

test('native leader/civ identity colors exactly match all 63 Map View pairs, including reused slots', () => {
  const { ctx } = fixture(), { ui } = colorUiFixture(ctx), node = colorElement(0, true);
  node.setAttribute('bg-color', 'purple');
  node.setAttribute('fg-color', 'white');
  for (let owner = 0; owner < 63; owner++) {
    node.owner = owner;
    ui.sync(node);
    const colors = ctx.ownerColors(owner);
    assert.equal(node.style.getPropertyValue('--player-color-primary'), colors.primaryCss);
    assert.equal(node.style.getPropertyValue('--player-color-secondary'), colors.secondaryCss);
    assert.equal(node.getAttribute('bg-color'), colors.primaryCss);
    assert.equal(node.getAttribute('fg-color'), 'white', 'readable native foregrounds are preserved');
    assert.equal(node.style.getPropertyPriority('--player-color-primary'), 'important');
  }
});

test('native recolors are reapplied without self-mutation loops and restore native/minor/save-load styling', () => {
  const { ctx } = fixture(), manager = colorUiFixture(ctx), node = colorElement(0, true);
  node.style.setProperty('--player-color-primary', 'purple');
  node.style.setProperty('--player-color-secondary', 'gold', 'important');
  node.setAttribute('bg-color', 'purple');
  manager.ui.sync(node);
  const resolves = manager.resolves();
  manager.observer.callback([{ target: node }, { target: node }]);
  assert.equal(manager.resolves(), resolves, 'own style mutations do not rescan or resolve again');
  node.style.setProperty('--player-color-primary', 'violet');
  node.setAttribute('bg-color', 'violet');
  manager.observer.callback([{ target: node }]);
  assert.equal(node.style.getPropertyValue('--player-color-primary'), ctx.ownerColors(0).primaryCss);
  assert.equal(node.getAttribute('bg-color'), ctx.ownerColors(0).primaryCss);
  node.mode = 'save-load';
  manager.ui.sync(node);
  assert.equal(node.style.getPropertyValue('--player-color-primary'), 'violet', 'latest native source is retained');
  assert.equal(node.style.getPropertyPriority('--player-color-primary'), '');
  assert.equal(node.style.getPropertyValue('--player-color-secondary'), 'gold');
  assert.equal(node.style.getPropertyPriority('--player-color-secondary'), 'important');
  assert.equal(node.getAttribute('bg-color'), 'violet');
  assert.equal(node.style.getPropertyValue('--player-color-primary-text'), '');
  node.mode = 'normal'; manager.ui.sync(node);
  node.owner = 63; manager.ui.sync(node);
  assert.equal(node.style.getPropertyValue('--player-color-primary'), 'violet', 'independent owners restore native styling');
  const unrelated = colorElement(undefined);
  manager.ui.sync(unrelated);
  assert.equal(manager.observed.has(unrelated), false, 'neutral controls are never watched or recolored');
});

test('Gameface styles without getPropertyPriority apply Map View colors and restore native priorities', () => {
  const { ctx } = fixture(), manager = colorUiFixture(ctx), node = colorElement(2, true);
  node.style.setProperty('--player-color-primary', 'purple', 'important');
  node.style.setProperty('--player-color-secondary', 'gold');
  node.setAttribute('bg-color', 'purple');
  delete node.style.getPropertyPriority;
  manager.ui.sync(node);
  assert.equal(node.style.getPropertyValue('--player-color-primary'), ctx.ownerColors(2).primaryCss);
  assert.equal(node.getAttribute('bg-color'), ctx.ownerColors(2).primaryCss);
  const resolves = manager.resolves();
  manager.observer.callback([{ target: node }]);
  assert.equal(manager.resolves(), resolves);
  node.style.setProperty('--player-color-secondary', 'violet', 'important');
  manager.observer.callback([{ target: node }]);
  assert.equal(node.style.getPropertyValue('--player-color-secondary'), ctx.ownerColors(2).secondaryCss);
  node.mode = 'save-load'; manager.ui.sync(node);
  assert.match(node.style.cssText, /--player-color-primary:purple !important;/);
  assert.match(node.style.cssText, /--player-color-secondary:violet !important;/);
  assert.equal(node.getAttribute('bg-color'), 'purple');
});

test('actual diplomacy panels and deferred frame tints follow local and selected map colors without recoloring neutral frames', () => {
  const { ctx } = fixture();
  ctx.GameContext = { localPlayerID: 0 };
  ctx.DiplomacyManager = { selectedPlayerID: 2 };
  vm.runInContext(slice('civUiIconOwner'), ctx);
  const manager = colorUiFixture(ctx, node => ctx.civUiIconOwner(node));
  const node = (tag, parentElement = null, identity = '') => {
    const element = colorElement(undefined);
    element.parentElement = parentElement;
    element.matches = selector => selector.split(',').some(part => part.trim() === tag || identity && part.trim() === identity);
    return element;
  };
  const local = node('panel-player-diplomacy-actions'), other = node('panel-other-player-diplomacy-actions');
  const localTint = node('div', local, '.subsystem-frame__diplo-tint');
  const otherTint = node('div', other, '.subsystem-frame__diplo-tint');
  const localSymbol = node('div', local, '#panel-diplomacy-actions__civ-symbol');
  const shadowTint = node('div', null, '.subsystem-frame__diplo-tint');
  shadowTint.getRootNode = () => ({ host: other });
  for (const element of [local, other, localTint, otherTint, localSymbol, shadowTint]) manager.ui.sync(element);
  for (const element of [local, localTint, localSymbol]) {
    assert.equal(element.style.getPropertyValue('--player-color-primary'), ctx.ownerColors(0).primaryCss);
  }
  for (const element of [other, otherTint, shadowTint]) {
    assert.equal(element.style.getPropertyValue('--player-color-primary'), ctx.ownerColors(2).primaryCss);
  }
  assert.equal(localTint.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(0).primaryCss);
  assert.equal(otherTint.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(2).primaryCss);
  assert.equal(local.style.getPropertyValue('fxs-background-image-tint'), '', 'only the native frame tint surface is tinted');
  delete otherTint.style.getPropertyPriority;
  otherTint.style.setProperty('fxs-background-image-tint', 'violet', 'important');
  manager.observer.callback([{ target: otherTint }]);
  assert.equal(otherTint.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(2).primaryCss);
  const resolves = manager.resolves();
  manager.observer.callback([{ target: otherTint }]);
  assert.equal(manager.resolves(), resolves, 'our tint writes cannot feed a mutation loop');
  ctx.DiplomacyManager.selectedPlayerID = 5;
  manager.ui.sync(otherTint); manager.ui.sync(localTint);
  assert.equal(otherTint.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(5).primaryCss);
  assert.equal(localTint.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(0).primaryCss);
  ctx.DiplomacyManager.selectedPlayerID = 63; manager.ui.sync(otherTint);
  assert.match(otherTint.style.cssText, /fxs-background-image-tint:violet !important;/);
  localTint.mode = 'save-load'; manager.ui.sync(localTint);
  assert.equal(localTint.style.getPropertyValue('fxs-background-image-tint'), '');
  const neutral = node('div');
  neutral.style.setProperty('fxs-background-image-tint', 'purple');
  manager.ui.sync(neutral);
  assert.equal(manager.observed.has(neutral), false);
  assert.equal(neutral.style.getPropertyValue('fxs-background-image-tint'), 'purple');
});

test('native UI installation derives contrast variants from Map View RGB values and caches them per major player', () => {
  const { ctx } = fixture(), inputs = [];
  const body = colorElement(undefined), ribbon = colorElement(1), minor = colorElement(63);
  body.matches = selector => selector.includes('body');
  body.childNodes = [ribbon, minor]; ribbon.childNodes = []; minor.childNodes = [];
  minor.style.setProperty('--player-color-primary', 'purple');
  ctx.UI.Color = { createPlayerColorVariants(input) {
    inputs.push(input);
    return { isPrimaryLighter: true,
      primaryColor: { moreColor: '#ffaaaa', textColor: '#ffffff', accentColor: '#ff8888' },
      secondaryColor: { moreColor: '#aa5555', textColor: '#ffffff', accentColor: '#ffaaaa' } };
  } };
  Object.assign(ctx, {
    document: { body }, GameContext: { localPlayerID: 0 },
    Players: { get: owner => ({ isMajor: owner >= 0 && owner < 63 }) },
    CivColorUi, CivIconUi: class { owns() { return false; } sync() {} },
    MutationObserver: class { observe() {} },
    civUiObserver: null, civUiRescan: null, CIV_UI_ATTRIBUTES: [],
    civUiReplacements: () => [{}], civUiMode: () => 'normal', isMapDom: () => false,
    civUiIconOwner: node => node.owner, civUiDiplomacyMode: () => false, nativeWarUiReplacements: () => [],
    scheduleCivUiRescan() {}, err: message => assert.fail(message),
  });
  vm.runInContext(slice('installCivNameUiOverrides'), ctx);
  ctx.installCivNameUiOverrides();
  for (const [owner, node] of [[0, body], [1, ribbon]]) {
    const pair = ctx.ownerColors(owner);
    assert.equal(node.style.getPropertyValue('--player-color-primary'), pair.primaryCss);
    assert.equal(node.style.getPropertyValue('--player-color-secondary'), pair.secondaryCss);
    assert.deepEqual(Object.values(inputs[owner].primaryColor), [...pair.primary, 1]);
    assert.deepEqual(Object.values(inputs[owner].secondaryColor), [...pair.secondary, 1]);
  }
  assert.equal(minor.style.getPropertyValue('--player-color-primary'), 'purple');
  ctx.civUiRescan();
  assert.equal(inputs.length, 2, 'rescans reuse variants and never generate major-player colors for independents');
});

test('native unit flag glyph tint follows every unit owner without recoloring health/frame surfaces', () => {
  const { ctx } = fixture();
  ctx.GameContext = { localPlayerID: 0 };
  ctx.ComponentID = { fromString: value => ({ owner: Number(value.split(':')[0]) }) };
  vm.runInContext(slice('civUiIconOwner'), ctx);
  let notify;
  const colors = new CivColorUi({
    MutationObserver: class { constructor(fn) { notify = fn; } observe() {} },
    scopeMode: node => node.mode, resolveOwner: node => ctx.civUiIconOwner(node),
    resolveColors: () => null,
    resolveUnitColor: owner => ctx.ownerColors(owner).secondaryCss,
    reportError: assert.fail,
  });
  const flag = colorElement(undefined), glyph = colorElement(undefined), health = colorElement(undefined);
  flag.setAttribute('unit-id', '1:7'); glyph.parentElement = health.parentElement = flag;
  glyph.matches = selector => selector.split(',').some(part => part.trim() === '.unit-flag__icon');
  for (const node of [glyph, health, flag]) node.style.setProperty('fxs-background-image-tint', '#eeeeee');
  colors.sync(glyph); colors.sync(health); colors.sync(flag);
  assert.equal(glyph.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(1).secondaryCss);
  assert.equal(health.style.getPropertyValue('fxs-background-image-tint'), '#eeeeee');
  assert.equal(flag.style.getPropertyValue('fxs-background-image-tint'), '#eeeeee');
  assert.equal(glyph.style.getPropertyValue('--player-color-primary'), '', 'only the glyph tint changes');
  glyph.style.setProperty('fxs-background-image-tint', '#cccccc');
  notify([{ target: glyph }]);
  assert.equal(glyph.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(1).secondaryCss);
  flag.setAttribute('unit-id', '0:8'); colors.sync(glyph);
  assert.equal(glyph.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(0).secondaryCss, 'local units also use their contrasting owner color');
  flag.setAttribute('unit-id', '2:9'); colors.sync(glyph);
  assert.equal(glyph.style.getPropertyValue('fxs-background-image-tint'), ctx.ownerColors(2).secondaryCss);
  glyph.mode = 'save-load'; colors.sync(glyph);
  assert.equal(glyph.style.getPropertyValue('fxs-background-image-tint'), '#cccccc');
});
