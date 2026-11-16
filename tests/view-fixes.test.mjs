import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const { CivIconUi } = await loadModule('anthroprocenia-civ-icon-ui.js');

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-ui.js', import.meta.url), 'utf8');
const slice = name => {
  const start = playback.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = playback.indexOf('{', start);
  for (; i < playback.length; i++) {
    if (playback[i] === '{') depth++;
    else if (playback[i] === '}' && --depth === 0) break;
  }
  return playback.slice(start, i + 1);
};

test('while a leader scene (diplomacy) shows, every map layer and everything inside it is hidden', () => {
  const css = slice('ensureChromeOverlayStyle');
  assert.match(css, /body\.anthro-leader-scene \.anthro-map-render-layer, body\.anthro-leader-scene \.anthro-map-render-layer \* \{ visibility: hidden !important; \}/);
  assert.match(css, /body\.anthro-game-overlay \.\$\{MAP_CHROME_CLASS\} \{ display: none !important; \}/);
  // The labels are children that set visibility:visible for themselves, which a hidden parent alone does not override.
  assert.match(playback, /style\.cssText = '[^']*visibility:visible;/);
  assert.match(slice('syncOverlayState'), /document\.body\.classList\.toggle\('anthro-leader-scene', leader\)/);
  assert.match(slice('syncOverlayState'), /const leader = mapVisible && !!LeaderModelManager\.isLeaderShowing/);
});

test('every layer that can carry labels is a render layer, so the leader-scene rule reaches it', () => {
  const root = slice('ensureMapRoot');
  assert.match(root, /for \(const dom of \[wonDom, dotDom, terrainMarkerDom, riverDom, tradeRouteDom, routeDom, regionBorderDom, regionLabelDom, civIconDom, countryDom, settlementDom, geographicLabelDom\]\)/);
  assert.match(root, /d\.classList\.add\('anthro-map-render-layer'\)/);
  for (const layer of ['unitDom', 'iconDom']) assert.match(root, new RegExp(`if \\(!${layer}\\.el\\)[\\s\\S]*?classList\\.add\\('anthro-map-render-layer'\\)`));
});

test('the buildings\' decorative squares are left out while the townscapes show, and redrawn when that changes', () => {
  const draw = slice('drawUnitLayer');
  assert.match(draw, /const townscapeOn = townscapeActive\(\);/);
  assert.match(draw, /if \(townscapeOn && marker\.item && marker\.item\.kind !== 'resource'\) continue;/);
  // icon points (which the townscapes are built from) are recorded before the square is skipped
  assert.ok(draw.indexOf('iconPoints.push') < draw.indexOf("marker.item.kind !== 'resource') continue;"));
  assert.ok(draw.indexOf("marker.item.kind !== 'resource') continue;") < draw.indexOf('shapePaths(marker.shape'));
  assert.match(draw, /if \(townscapeOn && !marker\.item && marker\.kind === 'unit' && !marker\.decor && !marker\.natural\) continue;/, 'the decorative unit dots too');
  const view = slice('applyMapView');
  assert.match(view, /townNow = townscapeActive\(\)/);
  assert.match(view, /townNow !== townscapeShown/);
  assert.match(view, /townscapeShown = townNow;/);
  assert.match(playback, /^let townscapeShown = false;/m);
  assert.match(slice('syncTownscapes'), /unitDom.el.style.display = ''/);
  assert.match(slice('syncTownscapes'), /if \(townscapeActive\(\)\) for \(const slot of unitSlots\) if \(slot\) parkSlot\(slot\)/);
});

test('menu mutations enhance only owned controls and tolerate native nodes without Element APIs', () => {
  let notify, nativeQueries = 0;
  const attrs = {};
  const button = { nodeType: 1, tagName: 'BUTTON', textContent: 'Open', children: [],
    matches: () => true, closest: selector => selector.startsWith('button') ? button : root, querySelector: () => null,
    getAttribute: name => attrs[name], setAttribute: (name, value) => { attrs[name] = value; } };
  const root = { nodeType: 1, children: [button], parentElement: null,
    matches: () => false, closest: () => root, querySelectorAll: () => [button] };
  const menu = { nodeType: 1, children: Array(1000).fill({}), matches: () => false, closest: () => null,
    querySelectorAll(selector) { nativeQueries++; assert.notEqual(selector, 'button,[role="button"],fxs-button,fxs-activatable'); return []; } };
  const body = { nodeType: 1, children: [menu, root], matches: () => false, closest: () => null,
    querySelectorAll: selector => selector === 'button,[role="button"],fxs-button,fxs-activatable' ? [button] : [root] };
  root.parentElement = body;
  const ctx = vm.createContext({
    document: { body, head: { appendChild() {} }, getElementById: () => null, createElement: () => ({}) },
    MutationObserver: class { constructor(fn) { notify = fn; } observe() {} },
  });
  vm.runInContext(ui.replace(/\bexport /g, ''), ctx);
  ctx.installModUi(ctx.document, 'chrome', text => text);
  assert.equal(attrs.title, 'Open'); assert.equal(attrs['data-tooltip-content'], 'Open');
  notify([{ type: 'childList', target: body, addedNodes: [menu, { nodeType: 1 }] }]);
  assert.equal(nativeQueries, 1, 'one mod-root discovery, not scans of every native menu button');
  notify([{ type: 'childList', target: menu, addedNodes: Array(1000).fill({ nodeType: 3, parentElement: menu }) }]);
  assert.equal(nativeQueries, 1, 'native text changes cannot rescan the whole city/diplomacy panel');
  notify([{ type: 'attributes', target: { nodeType: 1 } }]);
  delete attrs.title;
  notify([{ type: 'childList', target: button, addedNodes: [{ nodeType: 3 }] }]);
  assert.equal(attrs.title, 'Open');
});

test('civilization-name observers cache batch work and avoid full-menu rescans on unrelated classes', () => {
  let notify, names = 0, patterns = 0, reads = 0, generated = 'The Roman Kingdom';
  const element = (parent = null) => {
    const attrs = {};
    return { nodeType: 1, childNodes: [], parentNode: parent, parentElement: parent, attrs,
      getAttribute(name) { reads++; return attrs[name] || null; }, setAttribute(name, value) { attrs[name] = value; },
      matches(selector) { return (attrs.class || '').includes(selector.includes('fxs-main-menu') ? 'main-menu' : 'save-load'); } };
  };
  const body = element(), menu = element(body);
  const texts = Array.from({ length: 250 }, () => {
    const row = element(menu), text = { nodeType: 3, nodeValue: 'The Roman Civilization', parentNode: row, parentElement: row };
    row.attrs.title = 'The Roman Civilization'; row.childNodes.push(text); menu.childNodes.push(row); return text;
  });
  body.childNodes.push(menu);
  const ctx = vm.createContext({
    document: { body }, civUiObserver: null, civUiRescan: null, CIV_UI_ATTRIBUTES: ['title'],
    CivIconUi, civUiDiplomacyMode: () => false, scheduleCivUiRescan() {},
    CIV_UI_MAIN_MENU_SELECTOR: 'fxs-main-menu', CIV_UI_SAVE_LOAD_SELECTOR: 'fxs-save-load-screen', CIV_POLITY_SUFFIX: '(?:Kingdom|Republic)',
    civUiReplacements: () => [{ type: 'ROME', term: 'Roman', original: 'Rome', adjective: true }, { type: 'ROME', term: 'Rome', original: 'Rome' }],
    currentCivUiName() { names++; return generated; }, err: message => assert.fail(message),
    RegExp: class extends RegExp { constructor(...args) { super(...args); patterns++; } },
    MutationObserver: class { constructor(fn) { notify = fn; } observe() {} },
  });
  vm.runInContext(['isMapDom', 'civUiMode', 'insideParentheses', 'translateCivUiText', 'installCivNameUiOverrides'].map(slice).join('\n'), ctx);
  ctx.installCivNameUiOverrides();
  assert.ok(texts.every(text => text.nodeValue === generated));
  assert.ok(texts.every(text => text.parentElement.attrs.title === generated));
  assert.equal(names, 1, 'one live civilization lookup per batch, not per text and attribute');
  assert.equal(patterns, 2, 'compile each replacement once');
  names = reads = 0;
  notify(texts.map(target => ({ type: 'characterData', target })));
  assert.equal(names, 0, 'self-generated mutations cannot query native civilization state again');
  for (const target of [body, menu]) {
    target.attrs.class = 'anthro-game-overlay diplomacy-open';
    notify([{ type: 'attributes', attributeName: 'class', target }]);
  }
  assert.equal(names, 0); assert.ok(reads < 20, 'unrelated body/menu classes must not walk every descendant');
  generated = 'The Roman Republic'; ctx.civUiRescan();
  assert.ok(texts.every(text => text.nodeValue === generated));
  assert.equal(names, 1); assert.equal(patterns, 2);
  menu.attrs.class = 'save-load';
  notify([{ type: 'attributes', attributeName: 'class', target: menu }]);
  assert.ok(texts.every(text => text.nodeValue === 'Rome'));
  menu.attrs.class = 'diplomacy';
  notify([{ type: 'attributes', attributeName: 'class', target: menu }]);
  assert.ok(texts.every(text => text.nodeValue === generated), 'leaving save/load restores generated names');
  texts[0].nodeValue = `${generated} Civilization`;
  notify([{ type: 'characterData', target: texts[0] }]);
  assert.equal(texts[0].nodeValue, generated, 'native suffix updates cannot leave Civilization or duplicate articles');
});
