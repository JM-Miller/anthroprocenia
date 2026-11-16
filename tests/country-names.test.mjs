import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const start = playback.indexOf(from), end = playback.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing ${from}`);
  return playback.slice(start, end);
};
const source = [
  slice('const CIV_ENDONYMS', 'function ageEraKey'),
  slice('function eraNameForCiv', '// Culture-specific names'),
  slice('function hashString', '// `used`'),
  slice('const DEFAULT_POLITY_TEMPLATES', 'function rememberCountryName'),
  slice('const CIV_SINGULAR_POLITY_NAMES', 'const CONTINENT_DEMONYMS'),
  slice('function duplicateCivKey', 'function continentDemonym'),
  slice('function pluralizeCivAdjective', 'const CIV_UI_MAIN_MENU_SELECTOR'),
  'this.countryName = countryName; this.normalizeCountryName = normalizeCountryName; this.templates = CIV_POLITY_TEMPLATES;',
].join('\n');
const context = {
  replayEraKey: () => '',
  continentDemonym: name => name,
};
runInNewContext(source, context);
const identity = (civ, adjective, government) => ['', civ, adjective, 0, 0, civ.toUpperCase(), '', government];
const name = (civ, adjective, government, cities, capital = 'Capital') =>
  context.countryName(identity(civ, adjective, government), cities, null, '', capital, 5);

test('civilizations without a government use their historical pre-state names', () => {
  assert.equal(name('Rome', 'Roman', '', 3, 'Capital'), 'The Latin League');
  assert.equal(name('Gaul', 'Gallic', '', 3), 'The Gallic Tribes');
  assert.equal(name('Rome', 'Roman', 'Chiefdom', 5, 'Capital'), 'The Latin League');
});

test('a small only city is still named after its capital', () => {
  assert.equal(context.countryName(identity('Rome', 'Roman', ''), 1, null, '', 'Raven', 2), 'Raven');
});

test('Empire is used only by a despotism with more than three settlements', () => {
  assert.match(name('Rome', 'Roman', 'Despotism', 4, 'Rome'), /\b(Empire|Imperium|Hegemony|Dominion|Realm|Imperial Union)\b/);
  const governments = ['', 'Chiefdom', 'Despotism', 'Oligarchy', 'Monarchy', 'Classical Republic', 'Theocracy'];
  for (const civ of Object.keys(context.templates)) {
    for (const government of governments) {
      for (let cities = 1; cities <= 6; cities++) {
        const label = name(civ, civ, government, cities);
        if (/\bEmpire\b/i.test(label)) {
          assert.ok(/despot/i.test(government) && cities > 3, `${civ} ${government} ${cities}: ${label}`);
        }
      }
    }
  }
});

test('a large oligarchy and monarchy retain government-compatible titles rather than becoming empires', () => {
  assert.match(name('Egypt', 'Egyptian', 'Oligarchy', 5), /\b(Two Lands|League|Council|Commonwealth|Confederation|Compact|Patriciate|Assembly)\b/);
  assert.match(name('Maya', 'Mayan', 'Monarchy', 5), /\b(Kingdom|Realm|Crown|Crownlands|Principality|Duchy|Dominion)\b/);
});
test('duplicate polities have stable grammatical variants, including collective Gauls without changing empire eligibility', () => {
  const labels = ['Asian', 'African', 'European', 'Northern', 'Southern', 'Eastern', 'Western'].map((region, owner) => {
    const args = [identity('Gaul', 'Gallic', 'Monarchy'), 3, { kind: 'region', region }, '', '', 5, owner];
    const label = context.countryName(...args);
    assert.equal(context.countryName(...args), label);
    assert.ok(!/Empire/.test(label));
    return label;
  });
  assert.ok(new Set(labels.map(label => label.replace(/Asian|African|European|Northern|Southern|Eastern|Western/g, 'Location'))).size >= 2);
  for (let i = 0; i < labels.length; i++) {
    assert.ok(labels[i].includes(['Asian', 'African', 'European', 'Northern', 'Southern', 'Eastern', 'Western'][i]));
    assert.doesNotMatch(labels[i], /Gallics|Gaulishs|The The/i);
  }
});

test('country labels merge overlapping tribal titles and collapse duplicate articles and equivalent government suffixes', () => {
  const cases = [
    ['The Southern Gallic Confederacies', 'The Southern Gallic Confederacy'],
    ['The confederacies of the Gauls', 'The Confederacy of Gauls'],
    ['The Asian Gallic Confederacies Tribes', 'The Asian Gallic Tribal Confederacy'],
    ['The The Kingdom of the Gauls', 'The Kingdom of Gauls'],
    ['The the The Kingdom of the the Gauls', 'The Kingdom of Gauls'],
    ['The Gallic Tribal Confederacy Tribes', 'The Gallic Tribal Confederacy'],
    ['The Gallic Confederation Confederacy', 'The Gallic Confederation'],
    ['The Roman Kingdom Monarchy', 'The Roman Kingdom'],
    ['The Roman Republic Classical Republic', 'The Roman Classical Republic'],
    ['The Roman Empire Empires', 'The Roman Empire'],
    ['The Kingdom of the Gauls Kingdom', 'The Kingdom of Gauls'],
    ['The Kingdom of the Gauls', 'The Kingdom of Gauls'],
    ['The Democratic Republic of the Congo', 'The Democratic Republic of Congo'],
    ['Baden Baden', 'Baden'],
    ['The Northern Northern Republic Empire Council', 'The Northern Republic'],
    ['The Hague', 'The Hague'],
    ['The Maurya Tribal Alliance Tribal Alliance Tribal', 'The Maurya Tribal Alliance'],
    ['The Roman Empire Constitutional Republic Tribal Council', 'The Roman Empire'],
    ['The Roman Principate Kingdom Republic', 'The Roman Principate'],
  ];
  for (const [before, after] of cases) assert.equal(context.normalizeCountryName(before), after, before);
  assert.equal(name('Gaul', 'The Asian Gallic Confederacies', 'Tribes', 4), 'The Asian Gallic Tribal Confederacy');
  assert.equal(name('Unknown', 'The Kingdom of the Gauls', 'Monarchy', 3), 'The Kingdom of Gauls');
});

test('country names normalize in a UI engine without Unicode-property regex support', () => {
  const legacy = {};
  runInNewContext(`
    const nativeReplace = String.prototype.replace;
    String.prototype.replace = function (pattern, ...args) {
      if (pattern && /\\\\[pP]\\{/.test(pattern.source)) {
        throw new SyntaxError('Invalid property name in character class');
      }
      return nativeReplace.call(this, pattern, ...args);
    };
    ${source}
  `, legacy);
  assert.equal(legacy.normalizeCountryName('The Roman Roman Republic Empire'), 'The Roman Republic');
  assert.equal(legacy.countryName(identity('Gaul', 'Gallic', 'Monarchy'), 3, null, '', 'Capital', 5),
    name('Gaul', 'Gallic', 'Monarchy', 3));
  for (let i = 0; i < 50; i++) {
    assert.equal(legacy.normalizeCountryName('The The Gallic Kingdom Monarchy'), 'The Gallic Kingdom');
  }
});

test('compatible word cleanup preserves accented and non-Latin country names and apostrophes', () => {
  const cases = [
    ['The Montréal MONTRÉAL Republic', 'The Montréal Republic'],
    ['The Māori MĀORI Kingdom', 'The Māori Kingdom'],
    ["The O'Neill O'NEILL Kingdom", "The O'Neill Kingdom"],
    ['The Αθήνα ΑΘΉΝΑ Republic', 'The Αθήνα Republic'],
    ['The Київ КИЇВ Republic', 'The Київ Republic'],
    ['The مصر مصر Kingdom', 'The مصر Kingdom'],
    ['The 大漢 大漢 Empire', 'The 大漢 Empire'],
    ['The 63 63 Republic', 'The 63 Republic'],
    ['The Montréal, Montréal Republic', 'The Montréal, Republic'],
  ];
  for (const [before, after] of cases) assert.equal(context.normalizeCountryName(before), after, before);
});

test('relative qualifiers compare roots across government titles while preserving distinct capital roots', () => {
  const entry = (owner, civ, adj, government, capitalName = 'Rome', population = 5, cityCount = 3) => ({
    owner, identity: identity(civ, adj, government), cityCount,
    capital: { name: capitalName, population },
    continents: [{ id: '1', name: 'Europe', x: owner * 10, y: 0 }],
  });
  const contexts = entries => context.duplicateCivContexts(entries, '');
  const roman = entry(0, 'Rome', 'Roman', 'Classical Republic');
  const ravenian = entry(2, 'Rome', 'Roman', 'Monarchy', 'Raven');
  assert.equal(contexts([roman, ravenian]).size, 0, 'capital-derived names are already unique');
  assert.equal(contexts([roman, entry(1, 'Rome', 'Roman', 'Monarchy')]).size, 2, 'government titles do not distinguish a shared root');
  assert.equal(contexts([entry(0, 'Rome', 'Roman', 'Monarchy', 'Rome', 2, 1),
    entry(1, 'Rome', 'Roman', 'Monarchy', 'Raven', 2, 1)]).size, 0, 'distinct small capital states stay unqualified');
  const duplicate = entry(1, 'Rome', 'Roman', 'Classical Republic');
  const result = contexts([roman, duplicate, ravenian]);
  assert.equal(result.size, 2);
  assert.equal(result.has(2), false);
  assert.notDeepEqual(result.get(0), result.get(1));
  assert.equal(contexts([entry(0, 'Custom A', 'Shared', 'Monarchy', ''),
    entry(1, 'Custom B', 'Shared', 'Monarchy', '')]).size, 2, 'identical resulting names collide even across different civilization types');
});
test('fixed Han titles retain their forms with Western, Central and Eastern root qualifiers', () => {
  const entries = [1, 3, 5].map((cityCount, owner) => ({
    owner, identity: identity('Han', 'Han', 'Despotism'), cityCount,
    capital: { name: 'Capital', population: 5 }, continents: [{ id: '1', name: 'Asia', x: owner * 100, y: 0 }],
  }));
  const contexts = context.duplicateCivContexts(entries, '');
  const labels = entries.map(entry => context.countryName(entry.identity, entry.cityCount, contexts.get(entry.owner), '', 'Capital', 5));
  assert.deepEqual(labels, ['The Western Han', 'The Central Han Dynasty', 'Great Eastern Han']);
});

test('UI names consume native articles and Civilization suffixes without translating their generated output again', () => {
  const ctx = {
    CIV_POLITY_SUFFIX: '(?:Empire|Kingdom|Republic|Monarchy|Alliance|Council)',
    currentCivUiName: entry => ({ ROME: 'The Roman Republic', RAVEN: 'The Ravenian Kingdom' })[entry.type],
  };
  runInNewContext(slice('function insideParentheses', 'function installCivNameUiOverrides'), ctx);
  const replacements = [
    { type: 'ROME', term: 'Roman', original: 'Rome', adjective: true },
    { type: 'RAVEN', term: 'Raven', original: 'Raven', adjective: false },
    { type: 'ROME', term: 'Rome', original: 'Rome', adjective: false },
  ];
  for (const input of ['Roman Civilization', 'The Roman Civilization', 'the the Roman Civilization',
    'The Roman Republic Civilization', 'The Roman Republic', 'Rome Civilization', 'The Rome (Rome) Civilization']) {
    assert.equal(ctx.translateCivUiText(input, replacements), 'The Roman Republic', input);
  }
  assert.equal(ctx.translateCivUiText('Meet the Roman Civilization and the Raven Civilization.', replacements),
    'Meet The Roman Republic and The Ravenian Kingdom.');
  assert.equal(ctx.translateCivUiText('The treaty with Rome', replacements), 'The treaty with The Roman Republic',
    'an unrelated earlier article must not strip the country article');
  assert.equal(ctx.translateCivUiText('Roman (Rome)', replacements, true), 'Rome', 'save/load retains original civilization names');
  assert.equal(ctx.translateCivUiText('(Rome)', replacements), '(Rome)', 'parenthetical originals remain untouched');
  ctx.currentCivUiName = entry => entry.type === 'ROME' ? 'The Raven Republic' : 'The Ravenian Kingdom';
  assert.equal(ctx.translateCivUiText('Rome', replacements), 'The Raven Republic', 'replacement text is never fed to another civilization matcher');
  ctx.currentCivUiName = () => 'The Maurya Tribal Alliance';
  const maurya = [{ type: 'MAURYA', term: 'Maurya', original: 'Maurya', adjective: false }];
  for (const suffix of ['Tribal Alliance Tribal Alliance Tribal', 'Tribal Alliance', 'Republic Kingdom']) {
    assert.equal(ctx.translateCivUiText(`Asoka, World Renouncer of The Maurya ${suffix}`, maurya),
      'Asoka, World Renouncer of The Maurya Tribal Alliance');
  }
});

test('corrected country naming uses a new cache identity rather than returning previously saved duplicated labels', () => {
  const saved = new Map([['country4:old', 'The Southern Gallic Confederacies']]);
  const cacheContext = { ...context, rememberName: (key, value) => {
    assert.ok(key.startsWith('country11:'));
    if (!saved.has(key)) saved.set(key, value);
    return saved.get(key);
  } };
  runInNewContext(source + '\n' + slice('function rememberCountryName', 'const CIV_SINGULAR_POLITY_NAMES') + '\nthis.rememberCountryName = rememberCountryName;', cacheContext);
  assert.equal(cacheContext.rememberCountryName(0, identity('Gaul', 'The Asian Gallic Confederacies', 'Tribes'), 4, null, '', '', 5), 'The Asian Gallic Tribal Confederacy');
  assert.equal(name('Gaul', 'Gallic', 'Confederacies', 4), 'The Gallic Confederacy');
  assert.equal(name('Silla', 'Korean', '', 4), 'The Samhan Confederacy');
});

test('generated countries offer substantial format, qualifier and cultural-root variety without random or size jitter', () => {
  const labels = [], roots = new Set(), qualifiers = new Set(), formats = new Set();
  for (let owner = 0; owner < 128; owner++) {
    const id = identity('Rome', 'Roman', 'Monarchy');
    const args = [id, 4, null, '', '', 5, owner];
    const label = context.countryName(...args);
    labels.push(label);
    assert.equal(context.countryName(...args), label);
    assert.equal(context.countryName(id, 40, null, '', '', 30, owner), label, 'growth within the large-polity bucket is stable');
    assert.equal(context.countryName(['Successor', ...id.slice(1)], 4, null, '', '', 5, owner), label, 'leader changes do not reroll names');
    assert.doesNotMatch(label, /\b(The\s+The|Civilization|Empire|Northern|Southern|Eastern|Western)\b/i);
    const root = label.match(/\b(Roman|Latin|Latium|Roma)s?\b/);
    assert.ok(root, label); roots.add(root[1]);
    formats.add((label.match(/\b(Kingdom|Realm|Crownlands|Crown|Principality|Duchy|Dominion)\b/) || [])[0]);
    for (const word of ['Royal', 'Crowned', 'United', 'Sovereign', 'High', 'Grand', 'Illustrious', 'August', 'Great', 'Exalted', 'Serene']) {
      if (new RegExp(`\\b${word}\\b`).test(label)) qualifiers.add(word);
    }
  }
  assert.ok(new Set(labels).size >= 60, 'at least sixty actual distinct outputs for the same civilization/government');
  assert.ok(formats.size >= 7, 'at least seven government-compatible title forms are generated');
  assert.ok(qualifiers.size >= 9, 'at least nine descriptive qualifiers appear');
  assert.equal(roots.size, 4, 'both alternate native and adjective roots appear');
});

test('era and capital roots survive variation and all alternate names retain canonical shared-root disambiguation', () => {
  for (let owner = 0; owner < 32; owner++) {
    const roman = identity('Rome', 'Roman', 'Monarchy');
    const raven = context.countryName(roman, 4, null, '', 'Raven', 5, owner);
    assert.match(raven, /\b(Raven|Ravenian|Ravenians)\b/);
    assert.doesNotMatch(raven, /\b(Roma|Roman|Latin|Latium)\b/);
    const british = context.countryName(identity('Britain', 'British', 'Monarchy'), 4, null, 'EXPLORATION', 'Capital', 5, owner);
    assert.match(british, /\bWelsh\b/);
    assert.doesNotMatch(british, /\b(British|Britannia|Britannic|Britain)\b/);
    const entries = [0, 1].map(n => ({
      owner: n, identity: roman, cityCount: 4, capital: { name: 'Rome', population: 5 },
      continents: [{ id: '1', name: 'Europe', x: n * 10, y: 0 }],
    }));
    const contexts = context.duplicateCivContexts(entries, '');
    assert.equal(contexts.size, 2);
    const label = context.countryName(roman, 4, contexts.get(0), '', 'Capital', 5, owner);
    assert.match(label, /\bWestern\b/);
    assert.equal(context.duplicateCivKey(entries[0], ''), 'root:roman');
  }
  const custom = identity('Custom', 'Customian', 'Monarchy');
  assert.match(context.countryName(custom, 4, null, '', 'Capital', 5, 3), /\b(Custom|Customian|Customians)\b/);
});

test('roads beside a river run parallel to it instead of overlapping', () => {
  const geometry = {
    hexW: 40, hexH: 35, mapPxW: 4000,
    basePos: [{ x: 0, y: 0 }, { x: 36, y: 20 }],
    layoutRand: () => 0.3,
    tileObstacles: () => [],
    dodgeObstacles: points => points,
    riverEdges: new Set([1]), riverEdgeHw: new Map([[1, 2]]),
  };
  const code = [
    slice('function meanderEdgePoints', '// The shapes a tile carries'),
    slice('function routeEdgePoints', 'function polylinePath'),
    'this.routeEdgePoints = routeEdgePoints; this.meanderEdgePoints = meanderEdgePoints;',
  ].join('\n');
  runInNewContext(code, geometry);
  const river = geometry.meanderEdgePoints(0, 1, 1, 10);
  const road = geometry.routeEdgePoints(0, 1, false, 0.5);
  const distance = (p, line) => Math.min(...line.map(q => Math.hypot(p.x - q.x, p.y - q.y)));
  assert.ok(distance(road[5], river) >= 2.5, 'the road keeps clear of the river mid-link');
  assert.ok(Math.hypot(road[0].x - river[0].x, road[0].y - river[0].y) < 1e-9, 'the road still meets the river at tile centres');
  const away = geometry.routeEdgePoints(0, 1, false, 0.5);
  assert.deepEqual(away, road);
});

test('Rome and Roma override civilization, era, size exemptions and duplicate qualifiers', () => {
  for (const capital of ['Roma', 'Rome', 'rome', ' ROMA ']) {
    for (const government of ['Classical Republic', 'Monarchy', 'Oligarchy', 'Chiefdom', '']) {
      for (const cities of [1, 3, 4, 8]) {
        const label = context.countryName(identity('Gaul', 'Gallic', government), cities,
          { kind: 'region', region: 'Northern' }, 'MODERN', capital, 1, 33);
        assert.equal(label, /republic/i.test(government) ? 'Roman Republic' : cities < 4 ? 'The Roman Kingdom' : 'The Roman Empire');
      }
    }
  }
});

test('actual occupied region names sometimes replace north/south duplicate qualifiers', () => {
  const entries = Array.from({ length: 12 }, (_, owner) => ({
    owner, identity: identity('Gaul', 'Gallic', 'Monarchy'), cityCount: 3,
    capital: { name: '', population: 5 }, geographicName: 'Scandinavia',
    continents: [{ id: '1', name: 'Europe', x: 0, y: owner * 100 }],
  }));
  const regions = [...context.duplicateCivContexts(entries, '').values()].map(entry => entry.region);
  assert.ok(regions.includes('Scandinavia'));
  assert.ok(regions.some(region => /Northern|Southern/.test(region)));
  for (const entry of entries) delete entry.geographicName;
  assert.ok([...context.duplicateCivContexts(entries, '').values()].every(entry => !/Scandinavia/.test(entry.region)));
});

test('turn-start UI refresh uses the same full-map country name and owner seed, not an independent live reroll', () => {
  const id = identity('Rome', 'Roman', 'Classical Republic'), recorded = new Map([[7, id]]);
  const callbacks = [], frame = new Map([[0, (7 << 3) | 4]]), settlements = new Map([[0, ['Roma', 1, 'Capital']]]);
  const artwork = { name: 'Selected country emblem', path: 'M0 0L1 1Z' }, iconCalls = [];
  const ctx = { ...context, frames: [[0, 1]], manifest: { rev: 2, w: 10 }, building: false, pos: 88,
    readManifest: () => ({ rev: 2, frames: [[0, 1]] }), frameFor: () => frame, reconstructIdentity: () => recorded,
    reconstructSettlements: () => settlements, liveEraKey: () => 'ANTIQUITY', basePos: null,
    ownerMeta: () => ({ kind: 'major' }), countryRegionName: () => '', controlledCountryRegions: () => new Map(),
    territoryContinents: () => [], continentByTile: new Map(),
    mapLabelText: value => value, isWaterTile: () => false, Players: { get: () => ({ isMajor: true }) },
    countryIconSeed: () => 42,
    countryIconsForFrame: (latestFrame, latestIdentity, seed) => {
      assert.equal(latestFrame, frame); assert.equal(latestIdentity, recorded); assert.equal(seed, 42);
      iconCalls.push(latestIdentity.get(7)[5]);
      return new Map([[7, artwork]]);
    },
    civSymbolFor: () => 'native-symbol',
    rememberName: (key, value) => value, setTimeout: (callback, delay) => { assert.equal(delay, 0); callbacks.push(callback); return 1; },
    err: message => assert.fail(message) };
  const uiRefresh = slice('const liveCountryUiNames', '\ntry {');
  runInNewContext(source + '\n' + slice('function rememberCountryName', 'const CIV_SINGULAR_POLITY_NAMES')
    + '\n' + slice('function majorCountryNames', '\nfunction ')
    + '\n' + uiRefresh + '\nthis.scheduleCivUiRescan = scheduleCivUiRescan; this.names = liveCountryUiNames; this.iconCivs = liveCivUiCivilizations; this.icons = () => liveCivUiIconChoices; this.setRescan = callback => { civUiRescan = callback; };', ctx);
  ctx.territoryContinents = () => [];
  ctx.scheduleCivUiRescan(); ctx.scheduleCivUiRescan();
  assert.equal(callbacks.length, 1); callbacks.shift()();
  assert.equal(ctx.names.get('ROME'), 'Roman Republic'); assert.equal(ctx.pos, 88, 'historical playback does not change native current names');
  assert.equal(ctx.icons().get(7), artwork);
  assert.equal(ctx.iconCivs.get(7), 'ROME');
  const gallic = identity('Gaul', 'Gallic', 'Monarchy');
  recorded.set(7, gallic); settlements.set(0, ['Capital', 5, 'Capital']);
  for (let index = 1; index < 4; index++) { frame.set(index, (7 << 3) | 3); settlements.set(index, [`City ${index}`, 5, 'Town']); }
  ctx.scheduleCivUiRescan(); callbacks.shift()();
  assert.equal(ctx.names.get('GAUL'), context.countryName(gallic, 4, null, 'ANTIQUITY', 'Capital', 5, 7));
  assert.equal(ctx.names.has('ROME'), false);
  assert.equal(ctx.iconCivs.get(7), 'GAUL');
  assert.deepEqual(iconCalls, ['ROME', 'GAUL'], 'UI icons use the latest full-map frame, not playback position');
  const failures = [];
  let rescans = 0;
  ctx.err = message => failures.push(message);
  ctx.setRescan(() => rescans++);
  ctx.countryIconsForFrame = () => { throw new Error('emblem graph cannot be resolved'); };
  recorded.set(7, id); settlements.set(0, ['Roma', 1, 'Capital']);
  ctx.scheduleCivUiRescan(); callbacks.shift()();
  assert.equal(ctx.names.get('ROME'), 'Roman Republic');
  assert.equal(rescans, 1, 'an explicitly reported icon failure does not block updated country text');
  assert.match(failures[0], /civilization UI refresh failed:.*emblem graph/);
  ctx.readManifest = () => null;
  ctx.scheduleCivUiRescan(); callbacks.shift()();
  assert.equal(ctx.icons().size, 0, 'a game without a recording does not reuse previous-game emblem assignments');
  assert.equal(ctx.iconCivs.size, 0);
});

test('only completely and exclusively owned named regions supply optional country roots, including every detached piece', () => {
  const geography = { regions: [
    { name: 'Britain', tiles: [0, 1] }, { name: 'Ireland', tiles: [2, 3] },
    { name: 'New Zealand', tiles: [4] }, { name: 'New Zealand', tiles: [5] },
    { name: 'North Sea', water: true, tiles: [6] },
  ] };
  const ctx = { window: { AnthroproceniaGeography: { getMapData: () => geography } } };
  runInNewContext(slice('function controlledCountryRegions', 'function pluralizeCivAdjective'), ctx);
  const frame = new Map([[0, 8], [1, 8], [2, 8], [3, 16], [4, 8], [6, 8]]);
  assert.deepEqual(Array.from(ctx.controlledCountryRegions(frame).get(1)), ['Britain']);
  frame.set(5, 8);
  assert.deepEqual(Array.from(ctx.controlledCountryRegions(frame).get(1)), ['Britain', 'New Zealand']);
  const labels = Array.from({ length: 64 }, (_, owner) =>
    context.countryName(identity('Unknown', 'Test', 'Monarchy'), 4, null, '', '', 5, owner, ['Britain', 'New Zealand']));
  assert.ok(labels.some(label => label.includes('Britain')));
  assert.ok(labels.some(label => label.includes('New Zealand')));
  assert.ok(labels.some(label => !label.includes('Britain') && !label.includes('New Zealand')), 'regional roots are optional');
  assert.equal(context.countryName(identity('Unknown', 'Test', 'Monarchy'), 4, null, '', 'Roma', 5, 1, ['Britain']), 'The Roman Empire');
});

