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
  slice('const DEFAULT_POLITY_TEMPLATES', 'function rememberCountryName'),
  slice('const CIV_SINGULAR_POLITY_NAMES', 'const CONTINENT_DEMONYMS'),
  slice('function pluralizeCivAdjective', 'const CIV_UI_MAIN_MENU_SELECTOR'),
  'this.countryName = countryName; this.normalizeCountryName = normalizeCountryName; this.templates = CIV_POLITY_TEMPLATES;',
].join('\n');
const context = {
  normalizedCivKey: value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
  nativeCivName: identity => identity[1],
  eraNameForCiv: () => null,
  replayEraKey: () => '',
  continentDemonym: name => name,
};
runInNewContext(source, context);
const identity = (civ, adjective, government) => ['', civ, adjective, 0, 0, civ.toUpperCase(), '', government];
const name = (civ, adjective, government, cities, capital = 'Capital') =>
  context.countryName(identity(civ, adjective, government), cities, null, '', capital, 5);

test('civilizations without a government use their historical pre-state names', () => {
  assert.equal(name('Rome', 'Roman', '', 3, 'Rome'), 'The Latin League');
  assert.equal(name('Gaul', 'Gallic', '', 3), 'The Gallic Tribes');
  assert.equal(name('Rome', 'Roman', 'Chiefdom', 5, 'Rome'), 'The Latin League');
});

test('a small only city is still named after its capital', () => {
  assert.equal(context.countryName(identity('Rome', 'Roman', ''), 1, null, '', 'Rome', 2), 'Rome');
});

test('Empire is used only by a despotism with more than three settlements', () => {
  assert.equal(name('Rome', 'Roman', 'Despotism', 4, 'Rome'), 'The Roman Empire');
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

test('a large oligarchy is a confederation rather than an empire', () => {
  assert.equal(name('Egypt', 'Egyptian', 'Oligarchy', 5), 'The Egyptian Two Lands');
  assert.equal(name('Maya', 'Mayan', 'Monarchy', 5), 'The Mayan Kingdom');
});
test('duplicate polities have stable grammatical variants, including collective Gauls without changing empire eligibility', () => {
  const labels = ['Asian', 'African', 'European', 'Northern', 'Southern', 'Eastern', 'Western'].map(region => {
    const args = [identity('Gaul', 'Gallic', 'Monarchy'), 3, { kind: 'region', region }, '', '', 5];
    const label = context.countryName(...args);
    assert.equal(context.countryName(...args), label);
    assert.ok(!/Empire/.test(label));
    return label;
  });
  assert.ok(labels.some(label => /^The Kingdom of the .* Gauls$/.test(label)));
  assert.ok(labels.some(label => /^The .*-Gallic Kingdom$/.test(label)));
});

test('country labels merge overlapping tribal titles and collapse duplicate articles and equivalent government suffixes', () => {
  const cases = [
    ['The Southern Gallic Confederacies', 'The Southern Gallic Confederacy'],
    ['The confederacies of the Gauls', 'The Confederacy of the Gauls'],
    ['The Asian Gallic Confederacies Tribes', 'The Asian Gallic Tribal Confederacy'],
    ['The The Kingdom of the Gauls', 'The Kingdom of the Gauls'],
    ['The the The Kingdom of the the Gauls', 'The Kingdom of the Gauls'],
    ['The Gallic Tribal Confederacy Tribes', 'The Gallic Tribal Confederacy'],
    ['The Gallic Confederation Confederacy', 'The Gallic Confederation'],
    ['The Roman Kingdom Monarchy', 'The Roman Kingdom'],
    ['The Roman Republic Classical Republic', 'The Roman Classical Republic'],
    ['The Roman Empire Empires', 'The Roman Empire'],
    ['The Kingdom of the Gauls Kingdom', 'The Kingdom of the Gauls'],
    ['The Kingdom of the Gauls', 'The Kingdom of the Gauls'],
    ['The Democratic Republic of the Congo', 'The Democratic Republic of the Congo'],
    ['Baden Baden', 'Baden Baden'],
    ['The Hague', 'The Hague'],
  ];
  for (const [before, after] of cases) assert.equal(context.normalizeCountryName(before), after, before);
  assert.equal(name('Gaul', 'The Asian Gallic Confederacies', 'Tribes', 4), 'The Asian Gallic Tribal Confederacy');
  assert.equal(name('Unknown', 'The Kingdom of the Gauls', 'Monarchy', 3), 'The Kingdom of the Gauls');
});

test('corrected country naming uses a new cache identity rather than returning previously saved duplicated labels', () => {
  const saved = new Map([['country4:old', 'The Southern Gallic Confederacies']]);
  const cacheContext = { ...context, rememberName: (key, value) => {
    assert.ok(key.startsWith('country5:'));
    if (!saved.has(key)) saved.set(key, value);
    return saved.get(key);
  } };
  runInNewContext(source + '\n' + slice('function rememberCountryName', 'const CIV_SINGULAR_POLITY_NAMES') + '\nthis.rememberCountryName = rememberCountryName;', cacheContext);
  assert.equal(cacheContext.rememberCountryName(0, identity('Gaul', 'The Asian Gallic Confederacies', 'Tribes'), 4, null, '', '', 5), 'The Asian Gallic Tribal Confederacy');
  assert.equal(name('Gaul', 'Gallic', 'Confederacies', 4), 'The Gallic Confederacy');
  assert.equal(name('Silla', 'Korean', '', 4), 'The Samhan Confederacy');
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

