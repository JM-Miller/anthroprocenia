import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const panel = await loadModule('anthroprocenia-population-panel.js');
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

function lineageContext(turns, neighbors = {}) {
  const context = vm.createContext({ Number, Map, Set, Array, readUnitsTurn: t => turns[t] || [], neighborsByIndex: neighbors, pos: 0 });
  vm.runInContext(['unitLineage', 'matchUnitLineage', 'unitLineageId'].map(slice).join('\n') + '\nconst unitLineageCache = [];', context);
  return context;
}

test('units keep their id from turn to turn as they march, upgrade and stack up', () => {
  // unit records: [tile, owner, type, health, fromPlot]
  const turns = [
    [[10, 1, 0, 100, -1], [10, 1, 1, 100, -1], [20, 2, 0, 100, -1]],
    // the warrior marches 10 -> 11 (rows reordered), the archer stays, owner 2's unit is gone, a new one appears
    [[10, 1, 1, 100, -1], [11, 1, 0, 100, 10], [30, 2, 0, 100, -1]],
    // the warrior upgrades in place; the archer moves without its fromPlot recorded (old recordings) to the tile next door
    [[11, 1, 5, 100, 11], [12, 1, 1, 100, -1]],
  ];
  const context = lineageContext(turns, { 10: [11, 12], 11: [10, 12], 12: [10, 11] });
  const ids = t => [...vm.runInContext(`unitLineage(${t})`, context)];
  assert.deepEqual(ids(0), ['0.0', '0.1', '0.2']);
  assert.deepEqual(ids(1), ['0.1', '0.0', '1.2'], 'the archer and the warrior keep theirs; a new unit gets a new one');
  assert.deepEqual(ids(2), ['0.0', '0.1'], 'an upgrade and a step next door keep theirs too');
  context.pos = 2;
  assert.equal(vm.runInContext('unitLineageId(1)', context), '0.1');
  assert.equal(vm.runInContext('unitLineageId(7, 1)', context), '1.7', 'a row that is not there is its own');
});

test('the people of a unit are known by the unit, not the tile it stands on', () => {
  const a = 'c:o1|k:3|t:10|g:ut0|i:u0.4', b = 'c:o1|k:5|t:11|g:ut2|i:u0.4';
  assert.equal(panel.personBaseId(a), 'c:o1|i:u0.4');
  assert.equal(panel.personBaseId(a), panel.personBaseId(b));
  const farm = 'c:o1|k:3|t:10|g:b4|i:b4.0.1';
  assert.equal(panel.personBaseId(farm), farm, 'buildings stay put and keep their whole id');
  assert.equal(panel.stablePersonKey(`${b}#3`), 'c:o1|i:u0.4#3');
  assert.equal(panel.stablePersonKey(`${farm}#3`), `${farm}#3`);
  assert.equal(panel.stablePersonKey('plain'), 'plain');
});

test('a pinned soldier stays pinned when their unit moves on, and the moved pin is saved', () => {
  const store = new Map(), saves = [];
  const oldId = 'c:o1|k:3|t:10|g:ut0|i:u0.4', newId = 'c:o1|k:3|t:11|g:ut0|i:u0.4', farm = 'c:o1|k:3|t:10|g:b4|i:b4.0.1';
  store.set('pins', JSON.stringify([
    { key: `${oldId}#2`, nodeId: oldId, index: 2, tile: 10, gen: 0, name: 'Gaius', occupation: 'Soldier', home: 'The Legion', turn: 3 },
    { key: `${farm}#1`, nodeId: farm, index: 1, tile: 10, gen: 0, name: 'Livia', occupation: 'Farmer', home: 'Farm', turn: 3 },
    { key: 'c:o1|k:3|t:9|g:ut0|i:u0.9#0', nodeId: 'c:o1|k:3|t:9|g:ut0|i:u0.9', index: 0, tile: 9, gen: 0, name: 'Gone', occupation: 'Soldier', home: 'x', turn: 3 },
  ]));
  const unitNode = { kind: 'icon', id: newId, tile: 11, total: 5 }, farmNode = { kind: 'icon', id: farm, tile: 10, total: 4 };
  const context = vm.createContext({
    ...panel, Array, Map, Set, Number, JSON, playing: false, MAX_PINS: 40, popFollow: { person: null },
    viewRead: key => (store.has(key) ? JSON.parse(store.get(key)) : null),
    viewSave: (key, produce) => { saves.push(key); store.set(key, JSON.stringify(produce())); },
    popState: { pins: null, pinKeys: null, nodeIndex: null, pinsDirty: false, tree: [{ kind: 'civ', children: [unitNode, farmNode] }] },
  });
  vm.runInContext(['popPins', 'popIsPinned', 'popSavePins', 'popKeptWalking', 'popPinnedRows', 'popRebindPin', 'popIndexNodes'].map(slice).join('\n'), context);
  const rows = vm.runInContext('popPinnedRows()', context);
  assert.deepEqual(rows.map(r => r.node && r.node.id), [newId, farm, null], 'the soldier is found on the unit\'s new tile');
  assert.ok(vm.runInContext(`popIsPinned(${JSON.stringify(`${newId}#2`)})`, context), 'their walker on the new tile is pinned');
  assert.ok(!vm.runInContext(`popIsPinned(${JSON.stringify(`${oldId}#2`)})`, context));
  const saved = JSON.parse(store.get('pins'));
  assert.deepEqual([saved[0].nodeId, saved[0].key, saved[0].tile, saved[0].name], [newId, `${newId}#2`, 11, 'Gaius'], 'the move is saved with the game');
  assert.equal(saved[2].nodeId, 'c:o1|k:3|t:9|g:ut0|i:u0.9', 'a unit no longer there keeps its pin as it was');
  saves.length = 0;
  vm.runInContext('popPinnedRows()', context);
  assert.deepEqual(saves, [], 'nothing to save when nothing moved');
});

test('the panel names each country as the map does with the fog off, then with the fog on in parentheses', () => {
  const calls = [];
  const context = vm.createContext({
    Map, curFrame: new Map([[1, 8]]), basePos: [{}], popState: { errorLogged: false }, err: () => {},
    visForPos: () => 'fog',
    countryTerritories: (frame, vis) => vis,
    majorCountryNames: (frame, vis) => { calls.push(vis); return vis ? new Map([[1, 'The Gallics']]) : new Map([[1, 'The South American Gallic Kingdom'], [2, 'Rome'], [3, 'The Huns']]); },
  });
  vm.runInContext(['popCountryNames', 'popNameCountries'].map(slice).join('\n'), context);
  const names = vm.runInContext('popCountryNames', context)(new Map([['o3', 'The Hunnic Horde']]));
  assert.deepEqual([...names], [['o1', 'The South American Gallic Kingdom (The Gallics)'], ['o2', 'Rome'], ['o3', 'The Huns (The Hunnic Horde)']]);
  assert.deepEqual(calls, [null, 'fog']);
  const civ = { id: 'o1', name: 'The Gallics' }, other = { id: 'o9', name: 'Carthage' };
  const entries = [{ civ }, { civ }, { civ: other }];
  vm.runInContext('popNameCountries', context)(entries);
  assert.equal(entries[0].civ.name, 'The South American Gallic Kingdom (The Gallics)');
  assert.equal(entries[0].civ, entries[1].civ, 'one renamed civ shared by all its entries');
  assert.equal(civ.name, 'The Gallics', 'the saved record is left as it was');
  assert.equal(entries[2].civ, other, 'city-states and others keep their names');
});
