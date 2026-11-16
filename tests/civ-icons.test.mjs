import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const { CIV_ICON_CHOICES, countryIconChoice, countryIconAssignments } = await loadModule('anthroprocenia-civ-icons.js');
const { CivIconUi, civUiArtwork, civilizationFromIconSource } = await loadModule('anthroprocenia-civ-icon-ui.js');
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
function element() {
  return { style: {}, attrs: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value; },
    appendChild(child) { this.children.push(child); },
  };
}

function nativeElement(icon = '', candidate = false) {
  return {
    nodeType: 1, candidate, parentElement: null, parentNode: null, children: [], attrs: {},
    style: { backgroundImage: icon, maskImage: '', webkitMaskImage: '',
      getPropertyValue(property) { return this[property] || ''; } },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return key === 'style' ? JSON.stringify(this.style) : this.attrs[key] || null; },
    matches() { return this.candidate || /^CIVILIZATION_/.test(this.attrs['data-icon-id'] || ''); },
    appendChild(child) {
      if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
      child.parentNode = child.parentElement = this;
      this.children.push(child);
    },
    getRootNode() { return { host: null }; },
    querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => child.matches()); },
  };
}

function uiFixture(resolveArtwork, diplomacyMode = () => false) {
  const observed = new Set();
  let observer, resolves = 0;
  const ui = new CivIconUi({
    document: { body: nativeElement(), createElementNS: () => nativeElement() },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe(node) { observed.add(node); }
    },
    scopeMode: node => node.mode || 'normal',
    diplomacyMode,
    resolveArtwork: (type, node) => { resolves++; return resolveArtwork(type, node); },
    typeForUrl: url => url === 'blp:registered-roman-symbol' ? 'CIVILIZATION_ROME' : null,
    computedStyle: node => node.style,
    reportError: message => assert.fail(message),
  });
  return { ui, observed, observer, resolves: () => resolves };
}

test('native UI uses owner-specific choices and the lowest-numbered country for civilization-only displays', () => {
  const countries = new Map([[9, 'CIVILIZATION_ROME'], [2, 'ROME'], [0, 'GREECE']]);
  const choices = new Map([[9, CIV_ICON_CHOICES.ROME[3]], [2, CIV_ICON_CHOICES.ROME[1]], [0, null]]);
  assert.equal(civUiArtwork('rome', 9, countries, choices, 42), choices.get(9));
  assert.equal(civUiArtwork('CIVILIZATION_ROME', undefined, countries, choices, 42), choices.get(2));
  assert.equal(civUiArtwork('ROME', 0, countries, choices, 42), null, 'owner-specific native choice wins over a stale civilization source');
  assert.equal(civUiArtwork('GREECE', 9, countries, choices, 42), choices.get(9), 'map owner artwork wins over a stale UI civilization source');
  assert.equal(civUiArtwork('GREECE', 0, countries, choices, 42), null, 'native fifth choice is preserved');
  assert.equal(civUiArtwork('ROME', undefined, countries, choices, undefined), null, 'no game seed means native artwork');
});

test('custom diplomacy icons shrink to three quarters without resizing ribbons or native artwork', () => {
  const fixture = uiFixture(() => CIV_ICON_CHOICES.ROME[0], node => !!node.diplomacy);
  const node = nativeElement("url('blp:civ_sym_rome')");
  node.diplomacy = true;
  fixture.ui.sync(node);
  const svg = node.children[0];
  assert.equal(svg.style.transform, 'scale(0.75)');
  assert.equal(svg.style.transformOrigin, '50% 50%');
  assert.equal(node.style.transform, undefined, 'the host and native artwork retain their original dimensions');
  node.diplomacy = false;
  fixture.ui.sync(node);
  assert.equal(svg.style.transform, '', 'reused non-diplomacy slots restore full-size custom art');
});

test('native civilization glyphs are replaced without replacing leader, unit, building or resource icons', () => {
  const fixture = uiFixture(() => CIV_ICON_CHOICES.ROME[0]);
  const node = nativeElement('url("blp:registered-roman-symbol")');
  node.attrs.title = 'Roman country';
  node.style.fxsBackgroundImageTint = '#ffaa33';
  fixture.ui.sync(node);
  const svg = node.children[0];
  assert.equal(svg.children[0].getAttribute('d'), CIV_ICON_CHOICES.ROME[0].path);
  assert.equal(svg.style.color, '#ffaa33');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.match(svg.style.cssText, /pointer-events:none/);
  assert.equal(node.getAttribute('title'), 'Roman country');
  for (const image of ['leader_augustus', 'unit_warrior', 'building_barracks', 'resource_iron']) {
    const unrelated = nativeElement(`url('blp:${image}')`);
    fixture.ui.sync(unrelated);
    assert.equal(unrelated.children.length, 0);
    assert.equal(fixture.observed.has(unrelated), false);
  }
  assert.equal(civilizationFromIconSource("url('blp:civ_sym_unknown.png')"), null);
  assert.equal(civilizationFromIconSource("url('blp:dip_cs_citystate')"), null);
});

test('native UI slots reuse SVG, follow player and civilization changes, and restore native artwork', () => {
  const fixture = uiFixture((type, node) => node.choice);
  const node = nativeElement("url('blp:civ_sym_rome.png')");
  node.choice = CIV_ICON_CHOICES.ROME[0];
  fixture.ui.sync(node);
  const svg = node.children[0];
  node.choice = CIV_ICON_CHOICES.ROME[2];
  fixture.ui.sync(node);
  assert.equal(node.children.length, 1);
  assert.equal(svg.children[0].getAttribute('d'), node.choice.path);
  node.style.backgroundImage = "url('blp:civ_sym_greece')";
  node.choice = CIV_ICON_CHOICES.GREECE[0];
  fixture.observer.callback([{ target: node }]);
  assert.equal(svg.children[0].getAttribute('d'), node.choice.path);
  node.choice = null;
  fixture.ui.sync(node);
  assert.equal(node.style.backgroundImage, "url('blp:civ_sym_greece')");
  assert.equal(svg.style.display, 'none');
  node.choice = CIV_ICON_CHOICES.GREECE[1];
  fixture.ui.sync(node);
  node.mode = 'save-load';
  fixture.ui.sync(node);
  assert.equal(node.style.backgroundImage, "url('blp:civ_sym_greece')");
  assert.equal(svg.style.display, 'none');
  node.mode = 'normal';
  fixture.ui.sync(node);
  assert.equal(svg.style.display, 'block');
  node.attrs['data-icon-id'] = 'UNIT_WARRIOR';
  fixture.ui.sync(node);
  assert.equal(svg.style.display, 'none', 'a reused non-civilization role restores immediately');
  node.style.backgroundImage = "url('blp:unit_warrior')";
  fixture.observer.callback([{ target: node }]);
  assert.equal(node.style.backgroundImage, "url('blp:unit_warrior')");
  assert.equal(svg.style.display, 'none');
});

test('native icon mutation handling skips its own writes and observes only glyph styles', () => {
  const fixture = uiFixture(() => CIV_ICON_CHOICES.ROME[1]);
  const node = nativeElement("url('blp:civ_sym_rome')");
  fixture.ui.sync(node);
  fixture.observer.callback([{ target: node }, { target: node }]);
  assert.equal(fixture.resolves(), 1, 'own mutations do not rescan or rewrite');
  assert.equal(fixture.observed.size, 1);
  assert.equal(fixture.ui.owns(node.children[0]), true);
  assert.equal(fixture.ui.owns(node.children[0].children[0]), true);
  node.style.fxsBackgroundImageTint = '#112233';
  fixture.observer.callback([{ target: node }, { target: node }]);
  assert.equal(fixture.resolves(), 2, 'native changes are processed once per glyph');
  assert.equal(node.children[0].style.color, '#112233');
});

test('CSS-variable civilization icons follow changes in native endgame context', () => {
  const fixture = uiFixture(type => CIV_ICON_CHOICES[type.replace('CIVILIZATION_', '')][0]);
  const parent = nativeElement();
  parent.style['--civ-symbol'] = "url('blp:civ_sym_rome')";
  const node = nativeElement('', true);
  parent.appendChild(node);
  fixture.ui.sync(node);
  assert.equal(node.children[0].children[0].getAttribute('d'), CIV_ICON_CHOICES.ROME[0].path);
  parent.style['--civ-symbol'] = "url('blp:civ_sym_greece')";
  fixture.observer.callback([{ target: parent }]);
  assert.equal(node.children[0].children[0].getAttribute('d'), CIV_ICON_CHOICES.GREECE[0].path);
  assert.equal(fixture.observed.has(parent), true);
  assert.equal(fixture.observed.has(fixture.ui.document.body), false);
});

test('native UI player resolution follows reused player IDs, shadow hosts and contested district ownership', () => {
  const ctx = vm.createContext({
    ComponentID: { fromString: () => ({ owner: 7 }) },
    Districts: { get: () => ({ controllingPlayer: 9 }) },
    GameContext: { localPlayerID: 0, localObserverID: 7 },
    DiplomacyManager: { selectedPlayerID: 2 },
  });
  vm.runInContext(slice('civUiIconOwner'), ctx);
  const parent = nativeElement(), node = nativeElement();
  parent.attrs['data-player-id'] = '7';
  parent.appendChild(node);
  assert.equal(ctx.civUiIconOwner(node), 7);
  parent.attrs['data-player-id'] = '9';
  assert.equal(ctx.civUiIconOwner(node), 9);
  node.parentElement = null;
  node.getRootNode = () => ({ host: parent });
  assert.equal(ctx.civUiIconOwner(node), 9);
  delete parent.attrs['data-player-id'];
  parent.attrs['data-district-id'] = 'district-component';
  assert.equal(ctx.civUiIconOwner(node), 9, 'controlling country overrides original district owner');
  ctx.Districts.get = () => ({ controllingPlayer: -1 });
  assert.equal(ctx.civUiIconOwner(node), 7);
  delete parent.attrs['data-district-id'];
  parent.matches = selector => selector.includes('#panel-diplomacy-actions__civ-symbol');
  assert.equal(ctx.civUiIconOwner(node), 2);
});

test('every supported civilization can select four distinct silhouettes or its original emblem', () => {
  const artworkOwners = new Map();
  for (const [civ, choices] of Object.entries(CIV_ICON_CHOICES)) {
    const selected = new Set();
    for (let seed = 0; seed < 256; seed++) selected.add(countryIconChoice(`CIVILIZATION_${civ}`, seed));
    assert.deepEqual(selected, new Set([null, ...choices]), civ);
    assert.equal(new Set(choices.map(choice => choice.path)).size, 4, civ);
    for (const choice of choices) {
      assert.equal(artworkOwners.has(choice.path), false, `${civ} reuses artwork from ${artworkOwners.get(choice.path)}`);
      artworkOwners.set(choice.path, civ);
      assert.match(choice.path, /^M/);
      assert.doesNotMatch(choice.path, /NaN|Infinity|undefined|<|>/);
      assert.ok(choice.path.length < 4096 && (choice.path.match(/[MLHVQCTSAZ]/gi) || []).length < 512);
    }
    assert.equal(countryIconChoice(civ.toLowerCase(), 42), countryIconChoice(`CIVILIZATION_${civ}`, 42));
  }
  assert.equal(countryIconChoice('CIVILIZATION_CUSTOM_TEST', 42), null, 'unknown civs keep their engine emblem');
});

test('adjacent same-culture countries get distinct stable alternate icons with native fifth-choice overflow', () => {
  const civilizations = new Map(Array.from({ length: 5 }, (_, owner) => [owner, owner % 2 ? 'ROME' : 'CIVILIZATION_ROME']));
  const neighbors = new Map([...civilizations.keys()].map(owner => [owner, new Set([...civilizations.keys()].filter(other => other !== owner))]));
  const choices = countryIconAssignments(civilizations, neighbors, 42);
  assert.equal(new Set(choices.values()).size, 5);
  assert.equal([...choices.values()].filter(choice => choice === null).length, 1);
  assert.deepEqual(countryIconAssignments(new Map([...civilizations].reverse()), neighbors, 42), choices);
  const triangle = new Map([...civilizations].slice(0, 3));
  const alternatives = countryIconAssignments(triangle, neighbors, 42);
  assert.equal(new Set(alternatives.values()).size, 3);
  assert.ok([...alternatives.values()].every(choice => CIV_ICON_CHOICES.ROME.includes(choice)));
  const single = new Map([[7, 'ROME'], [8, 'EGYPT']]);
  assert.equal(countryIconAssignments(single, new Map(), 42).get(7), countryIconChoice('ROME', 42));
  civilizations.set(5, 'ROME');
  for (const adjacent of neighbors.values()) adjacent.add(5);
  neighbors.set(5, new Set([0, 1, 2, 3, 4]));
  assert.throws(() => countryIconAssignments(civilizations, neighbors, 42), /five emblems/);
});

test('full-frame icon assignments are cached and use border adjacency rather than visible territory or camera state', () => {
  const identities = new Map([[0, [0, 0, 0, 0, 0, 'ROME']], [4, [0, 0, 0, 0, 0, 'ROME']]]);
  const frame = new Map([[0, 0], [1, 4 << 3]]);
  let calls = 0;
  const ctx = vm.createContext({
    civIconLayout: null, neighborsByIndex: [[1], [0]], isWaterTile: () => false,
    ownerMeta: () => ({ kind: 'major' }),
    countryIconAssignments(...args) { calls++; return countryIconAssignments(...args); },
  });
  vm.runInContext(slice('countryIconsForFrame'), ctx);
  const first = ctx.countryIconsForFrame(frame, identities, 42);
  assert.notEqual(first.get(0), first.get(4));
  ctx.fogMode = true; ctx.mapPanX = 5000;
  assert.equal(ctx.countryIconsForFrame(frame, identities, 42), first);
  assert.equal(calls, 1);
  ctx.civIconLayout = null;
  assert.deepEqual(ctx.countryIconsForFrame(frame, identities, 42), first);
});

test('a game icon seed persists, restores on loading and never depends on governments or replay position', () => {
  let stored = null, randomCalls = 0;
  const ctx = vm.createContext({
    civIconSeed: null, Math: { random: () => { randomCalls++; return 0.125; }, floor: Math.floor }, Number,
    viewRead: () => stored,
    viewQueue: { enqueue(key, produce, delay) {
      assert.equal(key, 'civicons'); assert.equal(delay, 0); stored = JSON.parse(produce());
    } },
    err: message => assert.fail(message),
  });
  vm.runInContext(slice('countryIconSeed'), ctx);
  const seed = ctx.countryIconSeed(), choices = Object.keys(CIV_ICON_CHOICES).map(civ => countryIconChoice(civ, seed));
  for (const government of ['Republic', 'Empire', 'Kingdom']) {
    ctx.government = government; ctx.pos = 123;
    assert.equal(ctx.countryIconSeed(), seed);
  }
  ctx.civIconSeed = null;
  assert.equal(ctx.countryIconSeed(), seed);
  assert.deepEqual(Object.keys(CIV_ICON_CHOICES).map(civ => countryIconChoice(civ, ctx.countryIconSeed())), choices);
  assert.equal(randomCalls, 1, 'reloading a save does not reroll');
  stored = null; ctx.civIconSeed = null; ctx.countryIconSeed();
  assert.equal(randomCalls, 2, 'a new game chooses its own seed');
});

test('country icons reuse SVG nodes, restore the native mask and obey the icons checkbox without enabling labels', () => {
  const native = { kind: 'major' }, slots = [];
  let selection = CIV_ICON_CHOICES.ROME[0], nativeCalls = 0, seedCalls = 0, created = 0;
  const ctx = vm.createContext({
    countryDom: { el: element() }, civIconDom: { el: element() }, countryLabelSlots: slots,
    document: { createElement: element, createElementNS: () => { created++; return element(); } },
    showCountryLabels: false, showCivIcons: true, showBorders: false, frames: [0], hexW: 20,
    countryTerritories: () => new Map([[0, [{ x: 32, y: 32, index: 0 }]]]),
    countryLabelComponents: (frame, tiles) => [tiles],
    majorCountryNames: () => new Map([[0, 'Roman Republic']]), identityForPos: () => new Map([[0, ['', '', '', '', '', 'CIVILIZATION_ROME']]]),
    ownerMeta: () => native, drawCivBorderLabels() {}, placeBorderLabels() {},
    countryLabelGeometry: () => ({ x: 32, y: 32, angle: 0 }), labelTier: () => 1, townLabelScale: () => 1,
    countryIconTile: () => ({ x: 32, y: 32, maxIconSize: 20 }), ownerColors: () => ({ secondaryCss: '#ffcc00' }),
    countryIconSeed: () => { seedCalls++; return 42; }, countryIconsForFrame: () => new Map([[0, selection]]),
    civSymbolFor: () => { nativeCalls++; return 'native-roman-icon'; },
  });
  vm.runInContext(['countryLabelSlot', 'drawCountryLabelLayer'].map(slice).join('\n'), ctx);
  ctx.drawCountryLabelLayer(new Map(), null);
  const slot = slots[0];
  assert.equal(slot.alternatePath.attrs.d, selection.path);
  assert.equal(slot.alternatePath.attrs.fill, '#ffcc00');
  assert.equal(slot.icon.style.maskImage, 'none');
  assert.equal(slot.icon.style.backgroundColor, 'transparent');
  assert.equal(slot.icon.style.opacity, '1'); assert.equal(slot.el.style.opacity, '0');
  assert.equal(nativeCalls, 0, 'alternative art does not register an engine image');
  selection = CIV_ICON_CHOICES.ROME[1];
  ctx.drawCountryLabelLayer(new Map(), null);
  assert.equal(slot.alternatePath.attrs.d, selection.path);
  assert.equal(created, 2, 'one SVG and one path per reusable country slot');
  selection = null;
  ctx.drawCountryLabelLayer(new Map(), null);
  assert.equal(slot.alternateSvg.style.display, 'none');
  assert.equal(slot.icon.style.maskImage, 'url("native-roman-icon")');
  assert.equal(slot.icon.style.backgroundColor, '#ffcc00');
  ctx.showCivIcons = false;
  const calls = seedCalls; ctx.drawCountryLabelLayer(new Map(), null);
  assert.equal(slot.icon.style.opacity, '0');
  assert.equal(seedCalls, calls);
});
