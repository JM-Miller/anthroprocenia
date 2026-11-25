import { ComponentRegistry, componentRegistered } from '/core/ui-next/services/component-registry.js';
import { createRenderEffect, createSignal, onCleanup } from '/core/vendor/solid-js/dist/solid.js';
import { useCivSelectModelContext } from '/core/ui-next/screens/create-game/civ-select-model.js';

const base = 'fs://game/anthroprocenia/';
const [ready, setReady] = createSignal(false);
let connection, scripts, sequence = 0;
const client = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const pending = new Set();
let currentOwner;
let audioRequest = 0, finishInitialization;
let quoteOwner, quoteRequest = 0;
const initialization = new Promise(resolve => { finishInitialization = resolve; });
const bridgePrefix = '[ANTHRO-NARRATION] ';
const connectionURL = base + 'ui/narration/connection.json';

function jsonRequest(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    pending.add(xhr);
    xhr.open('GET', url, true);
    xhr.timeout = 50000;
    xhr.onload = () => {
      pending.delete(xhr);
      if (xhr.status !== 200 && !(xhr.status === 0 && xhr.responseText)) {
        reject(new Error('Narrator HTTP status ' + xhr.status + ': ' + url));
        return;
      }
      try { resolve(JSON.parse(xhr.responseText)); } catch (error) { reject(error); }
    };
    xhr.onerror = xhr.ontimeout = () => {
      pending.delete(xhr);
      reject(new Error('Offline narrator is unavailable.'));
    };
    xhr.onabort = () => { pending.delete(xhr); resolve({ status: 'cancelled' }); };
    xhr.send(null);
  });
}

function send(action, request, text = '', tag = '') {
  console.warn(bridgePrefix + JSON.stringify({ bridge: connection.bridge, client, request, action, text, tag }));
}

function stop(owner) {
  if (owner && owner !== currentOwner) return;
  currentOwner = undefined;
  if (!ready()) return;
  send('stop', ++sequence);
}

function speak(owner, text, tag = '') {
  if (!ready()) return Promise.resolve({ status: 'unavailable' });
  currentOwner = owner;
  return bridgeRequest('speak', text, tag);
}

function bridgeRequest(action, text = '', tag = '', timeout = 45000) {
  const request = ++sequence;
  send(action, request, text, tag);
  const deadline = Date.now() + timeout;
  return new Promise(resolve => {
    const poll = () => {
      if (request !== sequence) { resolve({ status: 'cancelled' }); return; }
      jsonRequest(connectionURL).then(state => {
        if (request !== sequence) { resolve({ status: 'cancelled' }); return; }
        if (!state.ready || state.bridge !== connection.bridge) {
          throw new Error('Offline narration bridge stopped responding.');
        }
        const result = state.states?.[client];
        if (result?.request === request && result.status !== 'pending') {
          if (result.status === 'error') throw new Error(result.message);
          resolve(result);
        } else if (Date.now() > deadline) {
          send('stop', ++sequence);
          throw new Error('Offline narration bridge timed out.');
        } else {
          setTimeout(poll, 250);
        }
      }).catch(error => {
        console.error('[Anthroprocenia narrator] ' + error.message);
        resolve({ status: request === sequence ? 'unavailable' : 'cancelled' });
  });
    };
    poll();
    });
}

const scriptFor = type => scripts?.leaders[type] || scripts?.civilizations[type];
const tagFor = type => 'ANTHRO_NARRATOR_' + type;
const patched = new WeakSet();

function loadingSubject(tag) {
  if (typeof GameInfo === 'undefined') return undefined;
  for (const [table, key] of [['LoadingInfo_Leaders', 'LeaderType'], ['LoadingInfo_Civilizations', 'CivilizationType']]) {
    const rows = GameInfo[table]?.filter(row => row.Audio === tag) || [];
    const subject = rows.find(row => !scripts || scriptFor(row[key]));
    if (subject) return subject[key];
  }
}

function discoverySubject(tag) {
  if (typeof GameInfo === 'undefined' || typeof Locale === 'undefined') return null;
  const quote = GameInfo.TypeQuotes?.filter(row => row.QuoteAudio === tag)?.[0];
  if (!quote) return null;
  const node = GameInfo.ProgressionTreeNodes?.lookup(quote.Type);
  const definition = node || GameInfo.Constructibles?.lookup(quote.Type) || GameInfo.Features?.lookup(quote.Type);
  if (!definition?.Name) throw new Error(`Narration subject is missing: ${quote.Type}`);
  const title = Locale.compose(definition.Name), key = definition.Name.replace(/_NAME$/, '_DESCRIPTION');
  const description = /^LOC_.*ANTHRO_/.test(key) ? Locale.compose(key) : '';
  if (description && description !== key) return { text: `${title}. ${description}`, tag: key };
  const text = node ? /^NODE_TECH_/.test(quote.Type)
    ? 'Knowledge becomes enduring power when discovery is put to work. Let this achievement serve the generations still to come.'
    : 'A society is shaped by the institutions it chooses to uphold. Let this new understanding strengthen the bonds among your people.'
    : 'A lasting achievement belongs not only to those who build it, but to those who preserve its place in the world.';
  return { text: `${title}. ${text}`, tag: '' };
}

function stopQuote(tag) {
  if (tag !== 'Stop_Quote') return;
  if (quoteRequest && quoteRequest === audioRequest) { ++audioRequest; quoteRequest = 0; }
  if (quoteOwner) { stop(quoteOwner); quoteOwner = undefined; }
}

if (typeof Sound !== 'undefined' && typeof Sound.play === 'function') {
  const original = Sound.play;
  Sound.play = function (...args) { stopQuote(args[0]); return original.apply(this, args); };
}

for (const name of ['sendAudioEvent', 'sendAudioEventWithFinishedCallback']) {
  if (typeof UI === 'undefined' || typeof UI[name] !== 'function') continue;
  const original = UI[name];
  UI[name] = function (...args) {
    stopQuote(args[0]);
    const type = loadingSubject(args[0]);
    let discovery;
    try { if (!type) discovery = discoverySubject(args[0]); }
    catch (error) {
      console.error('[Anthroprocenia narrator] ' + error.message + ' Native narration remains enabled.');
      return original.apply(this, args);
    }
    if (!type && !discovery) return original.apply(this, args);
    const request = ++audioRequest;
    if (discovery) quoteRequest = request;
    initialization.then(() => {
      if (request !== audioRequest) return;
      if (!ready() || type && !scriptFor(type)) { original.apply(this, args); return; }
      const owner = {};
      if (discovery) quoteOwner = owner;
      speak(owner, discovery ? discovery.text : scriptFor(type), discovery ? discovery.tag : tagFor(type)).then(result => {
        if (result.status === 'unavailable') original.apply(this, args);
        if (result.status === 'playing' && name === 'sendAudioEventWithFinishedCallback') {
          setTimeout(() => {
            if (currentOwner === owner) engine.trigger('AudioEventReturned', args[0]);
          }, result.duration * 1000 + 100);
        }
      });
    });
  };
}
engine.on('GameStarted', () => { ++audioRequest; stop(); });

createRenderEffect(() => {
  componentRegistered();
  for (const name of ['Model3d', 'CivDetails', 'Activatable']) {
    const registration = ComponentRegistry.get(name);
    const original = registration?.factory();
    if (!original || patched.has(original)) continue;
    const replacement = props => {
      if (name === 'Model3d') {
        const [fallback, setFallback] = createSignal(false);
        const animationEnd = WorldUI.hash('AnimationStateChange');
        let finishTimer;
        const type = () => typeof props.model === 'string' ? props.model.replace(/_GAME_ASSET$/, '') : '';
        createRenderEffect(() => {
          const selected = type();
          const shouldReplace = props.state === 'VO_CharSelect' && ready() && !!scriptFor(selected);
          setFallback(false);
          if (!shouldReplace) return;
          const owner = {};
          speak(owner, scriptFor(selected), tagFor(selected)).then(result => {
            if (type() === selected && props.state === 'VO_CharSelect' && result.status === 'unavailable') {
              setFallback(true);
            } else if (type() === selected && props.state === 'VO_CharSelect' && result.status === 'playing') {
              props.onTrigger?.(animationEnd);
              finishTimer = setTimeout(() => props.onTrigger?.(animationEnd), result.duration * 1000 + 100);
            }
          });
          onCleanup(() => { clearTimeout(finishTimer); stop(owner); });
        });
        return original(new Proxy(props, { get(target, key, receiver) {
          if (key === 'state' && target.state === 'VO_CharSelect' && ready() && scriptFor(type()) && !fallback()) {
            return 'IDLE_CharSelect';
          }
          if (key === 'onTrigger' && target.state === 'VO_CharSelect' && ready() && scriptFor(type()) && !fallback()) {
            return hash => { if (hash !== animationEnd) target.onTrigger?.(hash); };
          }
          return Reflect.get(target, key, receiver);
        } }));
      }
      const element = original(props);
      if (name === 'Activatable' && props.name === 'NarrativeRewardButton' && element?.nodeType === 1) {
        element.setAttribute('data-anthro-narration-choice', '');
      }
      if (name === 'CivDetails') {
        const model = useCivSelectModelContext();
        createRenderEffect(() => {
          const civ = model.viewCiv() ?? model.selectedCiv();
          if (!ready() || !civ || !scriptFor(civ.civID)) return;
          const owner = {};
          speak(owner, scriptFor(civ.civID), tagFor(civ.civID));
          onCleanup(() => stop(owner));
        });
      }
      return element;
    };
    patched.add(replacement);
    ComponentRegistry.register(name, replacement, (registration.overridePriority ?? 0) + 1);
  }
});

const rootsSelector = 'graphic-narrative-event, screen-narrative-event, screen-narrative-trial, .img-small-narrative-frame';
const choicesSelector = '[narrative-choice-key], [data-anthro-narration-choice]';
const bodySelector = '.narrative_model__text-container, .narrative-reg__text-container, .narrative-trial__text-container, .pt-3.pb-2.pr-9.pl-4.text-center';
const titleSelector = '.narrative_model__title-text, .narrative-reg__title-text, .narrative-trial__title-text';
const roots = new Map();
let hoverTimer, hovered, scanTimer;

function visible(element) {
  if (!element.isConnected || element.closest('[hidden], .hidden')) return false;
  const style = getComputedStyle(element);
  return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function scan() {
  scanTimer = undefined;
  for (const [root, state] of roots) {
    if (!visible(root)) {
      stop(state.owner);
      roots.delete(root);
      continue;
    }
    const body = root.querySelector(bodySelector)?.textContent?.trim();
    if (!body || state.text === body || !ready()) continue;
    state.text = body;
    const title = root.querySelector(titleSelector)?.textContent?.trim() || '';
    speak(state.owner, title ? title + '. ' + body : body);
  }
}

function track(element) {
  if (typeof element.querySelectorAll !== 'function') return;
  const tag = (element.tagName || '').toLowerCase();
  if ((['graphic-narrative-event', 'screen-narrative-event', 'screen-narrative-trial'].includes(tag) ||
      element.classList?.contains('img-small-narrative-frame')) && !roots.has(element)) {
    roots.set(element, { owner: {}, text: '' });
  }
  if (element.namespaceURI === 'http://www.w3.org/2000/svg' || element.id?.startsWith('anthro')) return;
  for (const root of element.querySelectorAll(rootsSelector)) {
    if (!roots.has(root)) roots.set(root, { owner: {}, text: '' });
  }
}

const observer = new MutationObserver(records => {
  let changed = false;
  for (const record of records) {
    for (const node of record.addedNodes) if (node.nodeType === 1) track(node);
    for (const root of roots.keys()) {
      if (!root.isConnected || root.contains(record.target) || record.target.contains?.(root)) changed = true;
    }
  }
  if (changed && !scanTimer) scanTimer = setTimeout(scan, 100);
});

function leaveChoice() {
  clearTimeout(hoverTimer);
  if (hovered) stop(hovered);
  hovered = undefined;
}

document.addEventListener('mouseover', event => {
  const choice = event.target?.closest?.(choicesSelector);
  if (!choice || choice === hovered || !visible(choice)) return;
  leaveChoice();
  hovered = choice;
  hoverTimer = setTimeout(() => {
    if (hovered === choice && visible(choice)) speak(choice, choice.textContent || '');
  }, 200);
}, true);
document.addEventListener('mouseout', event => {
  if (hovered && !hovered.contains(event.relatedTarget)) leaveChoice();
}, true);
document.addEventListener('click', event => {
  if (event.target?.closest?.(choicesSelector)) leaveChoice();
}, true);
window.addEventListener('unload', () => {
  leaveChoice();
  stop();
  observer.disconnect();
  for (const xhr of pending) xhr.abort();
});

engine.whenReady.then(async () => {
  try {
    connection = await jsonRequest(connectionURL);
    scripts = await jsonRequest(base + 'audio/narration/scripts.json');
    if (!connection.bridge || !connection.ready) {
      throw new Error('Start the offline narration companion, then restart Civ VII.');
    }
    const response = await bridgeRequest('ping', '', '', 5000);
    if (response.status !== 'ready') throw new Error('Offline narration companion did not acknowledge the native UI.');
    setReady(true);
    track(document.body);
    scan();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    console.warn('[Anthroprocenia narrator] British offline narrator connected.');
  } catch (error) {
    console.error('[Anthroprocenia narrator] ' + error.message + ' Native narration remains enabled.');
  } finally {
    finishInitialization();
  }
});
