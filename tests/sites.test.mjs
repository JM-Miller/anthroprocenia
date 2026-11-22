import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadModule as load } from './load.mjs';
const { siteNamesForTile, siteCategory, SITE_CIV_KEYS } = await load('anthroprocenia-sites.js');
const { siteLabelFontPx, unwrapPathPoints, pathTurnLabels } = await load('anthroprocenia-placement.js');

const GAME_CIVS = ['ABBASID', 'AKSUM', 'AMERICA', 'ASSYRIA', 'BABYLON', 'BUGANDA', 'BULGARIA', 'CARTHAGE', 'CHOLA', 'DAIVIET', 'EGYPT', 'ENGLAND',
  'FRENCHEMPIRE', 'GAUL', 'GORYEO', 'GREATBRITAIN', 'GREECE', 'HAN', 'HAWAII', 'HEIAN', 'ICELAND', 'INCA', 'JOSEON', 'KHMER', 'MAJAPAHIT', 'MAURYA',
  'MAYA', 'MEIJI', 'MEXICO', 'MING', 'MISSISSIPPIAN', 'MONGOLIA', 'MUGHAL', 'NEPAL', 'NORMAN', 'OTTOMANS', 'PERSIA', 'PIRATEREPUBLIC', 'PRUSSIA',
  'QAJAR', 'QING', 'ROME', 'RUSSIA', 'SENGOKU', 'SHAWNEE', 'SIAM', 'SILLA', 'SONGHAI', 'SPAIN', 'TONGA'];

const farm = { typeKey: 'IMPROVEMENT_FARM', base: 'Farm', resource: 'Wheat', count: 10 };
const homes = { typeKey: 'BUILDING_TENEMENT', base: 'Tenement', resource: 'Wheat', count: 10 };

test('every in-game civilization has its own site-name database', () => {
  for (const civ of GAME_CIVS) assert.ok(SITE_CIV_KEYS.includes(civ), civ);
});

test('site names are culture-specific, deterministic and unique on a tile', () => {
  for (const civ of [...GAME_CIVS, 'CITYSTATE', 'UNKNOWNCIV', '']) {
    const first = siteNamesForTile(civ, 1234, [farm, homes]), again = siteNamesForTile(civ, 1234, [farm, homes]);
    assert.deepEqual(first, again);
    const all = first.flat();
    assert.equal(all.length, 20);
    assert.equal(new Set(all).size, 20, `${civ} repeats a name`);
    for (const name of all) assert.ok(name.length > 4 && !/[{}]/.test(name) && !/\s{2}/.test(name), `${civ}: ${name}`);
  }
  assert.notDeepEqual(siteNamesForTile('ROME', 1, [farm]), siteNamesForTile('ROME', 2, [farm]));
  assert.notDeepEqual(siteNamesForTile('ROME', 1, [farm]), siteNamesForTile('GAUL', 1, [farm]));
});

test('Roman farms use Roman names and the tile\'s resource', () => {
  const families = /Julii|Brutii|Cornelii|Fabii|Claudii|Aemilii|Valerii|Antonii|Flavii|Domitii|Cassii|Livii|Sergii|Tullii|Aurelii/;
  let roman = 0, total = 0, wheat = 0;
  for (let tile = 0; tile < 40; tile++) {
    for (const name of siteNamesForTile('ROME', tile, [farm])[0]) { total++; if (families.test(name)) roman++; if (/Wheat/.test(name)) wheat++; }
  }
  assert.ok(roman / total > 0.3, `${roman}/${total} use a hand-written Roman lineage`);
  assert.ok(wheat / total > 0.4);
  const names = siteNamesForTile('ROME', 77, [farm])[0];
  assert.ok(names.some(name => /^The \w+ Wheat (Farm|Field)$/.test(name)) || names.some(name => /Wheat/.test(name)), names.join(' / '));
});

test('names are far more varied than the hand-written lists alone', () => {
  for (const civ of ['ROME', 'HAN', 'ABBASID', 'INCA', 'ENGLAND', 'ICELAND']) {
    const seen = new Set();
    for (let tile = 0; tile < 60; tile++) for (const name of siteNamesForTile(civ, tile, [farm])[0]) seen.add(name);
    assert.ok(seen.size > 450, `${civ}: ${seen.size} distinct names out of 600`);
  }
  const names = new Set();
  for (let tile = 0; tile < 80; tile++) for (const name of siteNamesForTile('ENGLAND', tile, [farm])[0]) names.add(name);
  assert.ok([...names].some(name => /^(Upper|Lower|Old|New|Great|Little) /.test(name) || /(Upper|Lower|Old|New|Great|Little)/.test(name)), 'English modifiers');
  assert.ok([...names].some(name => /^The .+ of \w+$/.test(name) || /^\w+ .*(Farm|Field|Acres|Steading)/.test(name)), 'place-named sites');
});

test('a site without a resource drops the resource word', () => {
  const [names] = siteNamesForTile('ROME', 5, [{ typeKey: 'IMPROVEMENT_FARM', base: 'Farm', resource: '', count: 6 }]);
  for (const name of names) assert.ok(!/undefined|null|\s\s/.test(name) && name === name.trim(), name);
});

test('constructible types map to sensible site categories', () => {
  assert.equal(siteCategory('IMPROVEMENT_FARM'), 'farm');
  assert.equal(siteCategory('IMPROVEMENT_TERRACE_FARM'), 'farm');
  assert.equal(siteCategory('IMPROVEMENT_MINE'), 'mine');
  assert.equal(siteCategory('BUILDING_GRANARY'), 'granary');
  assert.equal(siteCategory('BUILDING_LIBRARY'), 'hall');
  assert.equal(siteCategory('BUILDING_TEMPLE'), 'shrine');
  assert.equal(siteCategory('BUILDING_HARBOR'), 'harbor');
  assert.equal(siteCategory('IMPROVEMENT_FISHING_BOAT'), 'fishing');
  assert.equal(siteCategory('WONDER_PYRAMIDS'), 'wonder');
  assert.equal(siteCategory('BUILDING_SOMETHING_NEW'), 'generic');
});

test('label text shrinks as the player zooms in and never drops below a legible floor', () => {
  const font = 3.1;
  assert.ok(Math.abs(siteLabelFontPx(2, font) - font * 2) < 1e-9);
  let previous = Infinity;
  for (const zoom of [4.5, 6, 10, 20, 50, 200, 480]) {
    const px = siteLabelFontPx(zoom, font);
    assert.ok(px <= previous + 1e-9, `${zoom}`);
    assert.ok(px >= 9 - 1e-9);
    previous = px;
  }
  assert.ok(siteLabelFontPx(480, font) < siteLabelFontPx(5, font));
});

test('path preview unwraps map seams and labels only changes from the previous movement turn', () => {
  const points = unwrapPathPoints([{ x: 990 }, { x: 1010 }, { x: 10 }, { x: 30 }], 1000);
  assert.deepEqual(points.map(p => p.x), [990, 1010, 1010, 1030]);
  const labels = pathTurnLabels([5, 6, 7, 8, 9], [0, 1, 1, 2, 2]);
  assert.deepEqual(labels, [{ i: 1, turn: 1 }, { i: 3, turn: 2 }]);
  assert.deepEqual(pathTurnLabels([5, 6, 7], [0, 0, 0]), []);
  assert.deepEqual(pathTurnLabels([5, 6, 7, 8], [0, 0, 1, 1]), [{ i: 2, turn: 1 }]);
  assert.deepEqual(pathTurnLabels([5, 6, 7], [0, NaN, 2]), [{ i: 2, turn: 2 }]);
  assert.deepEqual(pathTurnLabels([5], undefined), []);
});
