import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/narration/anthroprocenia-narrator.js', import.meta.url), 'utf8');

async function setup(status = 'playing', earlyAudio, earlyStop = false) {
  const requests = [], cleanups = [], timers = [], events = new Map(), factories = new Map(), errors = [];
  const scripts = { leaders: { LEADER_AMINA: 'Amina. An original introduction.' },
    civilizations: { CIVILIZATION_ROME: 'Rome. An original introduction.' } };
  const bridge = { bridge: 'test-bridge', ready: true, updated: Date.now(), states: {} };
  for (const name of ['Model3d', 'CivDetails', 'Activatable']) {
    factories.set(name, { factory: () => props => props, overridePriority: 0 });
  }
  const body = { nodeType: 1, matches: () => false, querySelectorAll: () => [] };
  let mutation;
  class XHR {
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(data) {
      const payload = data ? JSON.parse(data) : undefined;
      requests.push({ url: this.url, payload });
      this.status = 200;
      const result = this.url.endsWith('connection.json') ? bridge
        : this.url.endsWith('scripts.json') ? scripts
          : {};
      this.responseText = JSON.stringify(result);
      queueMicrotask(() => this.onload());
    }
  }
  const nativeAudio = [], finished = [];
  const nativeSounds = [], Sound = { play: tag => nativeSounds.push(tag) };
  const UI = { sendAudioEvent: tag => nativeAudio.push(tag),
    sendAudioEventWithFinishedCallback: tag => nativeAudio.push(tag) };
  const context = vm.createContext({
    ComponentRegistry: {
      get: name => factories.get(name),
      register: (name, factory, overridePriority) => factories.set(name, { factory: () => factory, overridePriority }),
    },
    componentRegistered() {},
    createRenderEffect: callback => callback(),
    createSignal: initial => {
      let value = initial;
      return [() => value, next => { value = next; }];
    },
    onCleanup: callback => cleanups.push(callback),
    useCivSelectModelContext: () => ({ viewCiv: () => ({ civID: 'CIVILIZATION_ROME' }) }),
    WorldUI: { hash: () => 42 },
    UI,
    Sound,
    Locale: { compose: key => ({ LOC_TECH_POTTERY_NAME: 'Pottery', LOC_NODE_ANTHRO_TEST_NAME: 'Stonecutting',
      LOC_NODE_ANTHRO_TEST_DESCRIPTION: 'Unlocks a stone workshop.' })[key] || key },
    GameInfo: { TypeQuotes: [{ Type: 'NODE_TECH_AQ_POTTERY', QuoteAudio: 'VO_Quote_Pottery' },
      { Type: 'NODE_TECH_ANTHRO_TEST', QuoteAudio: 'VO_Quote_Anthro_Test' }],
      ProgressionTreeNodes: { lookup: key => ({ NODE_TECH_AQ_POTTERY: { Name: 'LOC_TECH_POTTERY_NAME' },
        NODE_TECH_ANTHRO_TEST: { Name: 'LOC_NODE_ANTHRO_TEST_NAME' } })[key] },
      LoadingInfo_Leaders: [{ LeaderType: 'LEADER_AMINA', Audio: 'VO_Loading2_AMINA' }],
      LoadingInfo_Civilizations: [{ CivilizationType: 'CIVILIZATION_ROME', Audio: 'VO_Loading2_ROME' }] },
    document: { body, addEventListener: (name, callback) => events.set(name, callback) },
    window: { addEventListener() {} },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    XMLHttpRequest: XHR,
    setTimeout: (callback, duration) => { timers.push({ callback, duration }); return timers.length; },
    clearTimeout() {},
    console: { warn(message) {
      if (!message.startsWith('[ANTHRO-NARRATION] ')) return;
      const payload = JSON.parse(message.slice('[ANTHRO-NARRATION] '.length));
      requests.push({ action: payload.action, payload });
      bridge.states[payload.client] = { request: payload.request,
        status: payload.action === 'ping' ? 'ready' : status, duration: 10 };
    }, error: message => errors.push(message) },
    engine: { whenReady: Promise.resolve(), on() {}, trigger: (...args) => finished.push(args) },
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, ''), context);
  if (earlyAudio) UI.sendAudioEventWithFinishedCallback(earlyAudio);
  if (earlyStop) Sound.play('Stop_Quote');
  await new Promise(setImmediate);
  return { requests, cleanups, timers, events, factories, errors, UI, Sound, nativeSounds, nativeAudio, finished, mutation, body };
}

test('loading voice events wait for native-bridge readiness instead of racing the original narrator', async () => {
  const state = await setup('playing', 'VO_Loading2_AMINA');
  assert.deepEqual(state.nativeAudio, []);
  assert.equal(state.requests.filter(request => request.action === 'speak').length, 1);
});
test('native discovery voices use original new narration and mod discoveries select their prerecorded description', async () => {
  const state = await setup();
  state.UI.sendAudioEvent('VO_Quote_Pottery');
  await new Promise(setImmediate);
  assert.equal(state.nativeAudio.length, 0);
  assert.match(state.requests.filter(request => request.action === 'speak').at(-1).payload.text, /^Pottery\. Knowledge/);
  state.UI.sendAudioEvent('Stop_Quote');
  assert.equal(state.requests.filter(request => request.action === 'stop').length, 1);
  assert.deepEqual(state.nativeAudio, ['Stop_Quote']);
  state.UI.sendAudioEvent('VO_Quote_Anthro_Test');
  await new Promise(setImmediate);
  const narration = state.requests.filter(request => request.action === 'speak').at(-1).payload;
  assert.equal(narration.tag, 'LOC_NODE_ANTHRO_TEST_DESCRIPTION');
  assert.equal(narration.text, 'Stonecutting. Unlocks a stone workshop.');
  state.Sound.play('Stop_Quote');
  assert.deepEqual(state.nativeSounds, ['Stop_Quote']);
  assert.equal(state.requests.filter(request => request.action === 'stop').length, 2);
});
test('native quote dismissal before bridge initialization prevents delayed replacement playback', async () => {
  const state = await setup('playing', 'VO_Quote_Pottery', true);
  assert.equal(state.requests.filter(request => request.action === 'speak').length, 0);
  assert.deepEqual(state.nativeSounds, ['Stop_Quote']);
  assert.deepEqual(state.nativeAudio, []);
});

test('native scene nodes without DOM selector methods do not interrupt popup tracking', async () => {
  const state = await setup();
  assert.doesNotThrow(() => state.mutation([{ addedNodes: [{ nodeType: 1 }], target: state.body }]));
});

test('loading introductions replace mapped voices, preserve other audio, and return native completion callbacks', async () => {
  const state = await setup();
  state.UI.sendAudioEventWithFinishedCallback('VO_Loading2_AMINA');
  state.UI.sendAudioEvent('music-main-menu');
  await new Promise(setImmediate);
  assert.deepEqual(state.nativeAudio, ['music-main-menu']);
  assert.equal(state.requests.find(request => request.action === 'speak').payload.tag, 'ANTHRO_NARRATOR_LEADER_AMINA');
  state.timers.at(-1).callback();
  assert.deepEqual(state.finished, [['AudioEventReturned', 'VO_Loading2_AMINA']]);
});

test('successful leader replacement keeps native voice animation idle until the new clip finishes', async () => {
  const state = await setup();
  const triggers = [];
  const props = { model: 'LEADER_AMINA_GAME_ASSET', state: 'VO_CharSelect', onTrigger: hash => triggers.push(hash) };
  const wrapped = state.factories.get('Model3d').factory()(props);
  assert.equal(wrapped.state, 'IDLE_CharSelect');
  wrapped.onTrigger(42);
  assert.deepEqual(triggers, [], 'native idle animation must not end the new narration');
  await new Promise(setImmediate);
  const speech = state.requests.filter(request => request.action === 'speak');
  assert.equal(speech.length, 1);
  assert.equal(speech[0].payload.tag, 'ANTHRO_NARRATOR_LEADER_AMINA');
  assert.ok(state.requests.filter(request => request.url).every(request => request.url.startsWith('fs://')));
  assert.deepEqual(triggers, [42]);
  assert.equal(state.timers.at(-1).duration, 10100);
  state.timers.at(-1).callback();
  assert.deepEqual(triggers, [42, 42]);
  assert.equal(props.state, 'VO_CharSelect', 'native input props remain unchanged');
});

test('transport failure restores native narration without changing unrelated model animations', async () => {
  const state = await setup('unavailable');
  const factory = state.factories.get('Model3d').factory();
  const wrapped = factory({ model: 'LEADER_AMINA_GAME_ASSET', state: 'VO_CharSelect' });
  await new Promise(setImmediate);
  assert.equal(wrapped.state, 'VO_CharSelect');
  assert.equal(factory({ model: 'UNIT_WARRIOR', state: 'ATTACK' }).state, 'ATTACK');
});

test('civilization details narrate the viewed civilization and cancel on dismissal', async () => {
  const state = await setup();
  state.factories.get('CivDetails').factory()({});
  await new Promise(setImmediate);
  assert.equal(state.requests.find(request => request.action === 'speak').payload.tag, 'ANTHRO_NARRATOR_CIVILIZATION_ROME');
  state.cleanups.at(-1)();
  await new Promise(setImmediate);
  assert.equal(state.requests.at(-1).action, 'stop');
});

test('narrative choices speak only after hover and stop when the pointer leaves', async () => {
  const state = await setup();
  const choice = { textContent: 'Choose carefully.', isConnected: true,
    closest: () => undefined, getClientRects: () => [{}], contains: node => node === choice };
  const target = { closest: () => choice };
  assert.equal(state.events.has('focusin'), false, 'focus must not narrate choice text');
  state.events.get('mouseover')({ target });
  assert.equal(state.requests.some(request => request.action === 'speak'), false);
  assert.equal(state.timers.at(-1).duration, 200);
  state.timers.at(-1).callback();
  await new Promise(setImmediate);
  assert.equal(state.requests.find(request => request.action === 'speak').payload.text, 'Choose carefully.');
  state.events.get('mouseout')({ relatedTarget: null });
  await new Promise(setImmediate);
  assert.equal(state.requests.at(-1).action, 'stop');
});
