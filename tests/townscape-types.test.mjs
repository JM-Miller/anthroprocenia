import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
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

test('buildings, wonders, improvements and units each get a layout style of their own', () => {
  assert.equal(town.townTypeStyle('', 'town'), null);
  const a = town.townTypeStyle('BUILDING_GRANARY', 'town'), b = town.townTypeStyle('BUILDING_AQUEDUCT', 'town');
  assert.deepEqual(town.townTypeStyle('BUILDING_GRANARY', 'town'), a, 'the same type always looks the same');
  assert.notEqual(a.archetype, b.archetype);
  assert.equal(b.archetype, 'waterworks');
  assert.equal(town.townTypeStyle('UNIT_GALLEY', 'camp').archetype, 'naval');
  assert.equal(town.townTypeStyle('UNIT_ARMY_COMMANDER', 'camp').archetype, 'commander');
  const variants = new Set(['BUILDING_LIBRARY', 'BUILDING_ACADEMY', 'BUILDING_MARKET', 'WONDER_PYRAMIDS', 'IMPROVEMENT_FARM', 'IMPROVEMENT_MINE'].map(k => town.townTypeStyle(k, 'town').variant));
  assert.ok(variants.size >= 5);
  const plain = town.generateTownscape({ seed: 5, civKey: 'CIVILIZATION_ROME', population: 300 });
  const typed = town.generateTownscape({ seed: 5, civKey: 'CIVILIZATION_ROME', population: 300, typeKey: 'BUILDING_AQUEDUCT' });
  assert.notDeepEqual(plain, typed);
});

test('mini-decorations: plants, bushes and rocks in clumps without pink flowers, the same every time', () => {
  const decos = town.townDecorations(42, 200);
  assert.equal(decos.length, 200);
  assert.deepEqual(town.townDecorations(42, 200), decos);
  assert.ok(decos.every(d => Math.hypot(d.x, d.y) < 1.3));
  const groups = new Set(decos.map(d => town.decorationPath(d, 0, 0, 1)[0]));
  for (const g of groups) assert.ok(town.DECO_GROUPS.includes(g), g);
  assert.ok(groups.size >= 3);
  assert.ok(decos.every(d => d.kind !== 'flower'));
  assert.ok(!town.DECO_GROUPS.includes('decoFlowers'));
  assert.equal(town.townDecorations(1, 50000).length, 12000, 'capped');
});

test('decorations follow townscape visibility independently of the crowd split', () => {
  const context = vm.createContext({ mapVisible: false, townscapeActive: () => true, walkerCrowdsActive: () => true });
  vm.runInContext(slice('townDecoActive'), context);
  assert.equal(context.townDecoActive(), true);
  context.townscapeActive = () => false;
  assert.equal(context.townDecoActive(), false);
});

test('Territory goes off when the townscapes show, can be ticked back on, and returns when they go', () => {
  const box = { value: 'true', setAttribute(k, v) { this.value = v; } };
  const context = vm.createContext({ showTerritory: true, els: { mapToggleCheckboxes: { territory: box } }, markBgDirty: () => {} });
  vm.runInContext(`${slice('syncTownTerritory')}\nvar territoryTownAuto = false, territoryTownSetting = false;`, context);
  const run = code => vm.runInContext(code, context);
  run('syncTownTerritory(true)');
  assert.deepEqual([context.showTerritory, box.value], [false, 'false']);
  run('syncTownTerritory(false)');
  assert.deepEqual([context.showTerritory, box.value], [true, 'true']);
  // the player ticks it back on while the townscapes show: it stays on, and nothing changes when they go
  run('syncTownTerritory(true)');
  context.showTerritory = true; run('territoryTownAuto = false');
  run('syncTownTerritory(false)');
  assert.equal(context.showTerritory, true);
  assert.match(playback, /if \(!territoryTownSetting\) territoryTownAuto = false;/);
});
