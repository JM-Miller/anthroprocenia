import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
test('Giant tile capture reads districts once and avoids duplicate location engine calls without changing occupation or visibility', () => {
  const w = 180, h = 94, n = w * h;
  let districts = 0, owners = 0, revealed = 0, centers = 0;
  const district = i => i % 7 === 0 ? { type: i % 2, owner: i % 63, controllingPlayer: i % 11 === 0 ? 62 : i % 63 } : null;
  const ctx = vm.createContext({
    mapW: w, mapH: h, PlayerIds: { NO_PLAYER: -1 }, DistrictTypes: { CITY_CENTER: 0, URBAN: 1 },
    Districts: { getAtLocation({ x, y }) { districts++; return district(y * w + x); } },
    GameplayMap: {
      getLocationFromIndex() { assert.fail('unnecessary engine location lookup'); },
      getOwner(x, y) { owners++; return (y * w + x) % 5 === 0 ? -1 : (y * w + x) % 63; },
      getRevealedState(obs, x, y) { assert.equal(obs, 3); revealed++; return (y * w + x) % 3 + 10; },
    },
    GameContext: { localObserverID: 3 }, RevealedStates: { VISIBLE: 12, HIDDEN: 10 },
    markCenters: cls => { centers++; cls[n - 1] = 4; }, err: e => assert.fail(e),
  });
  vm.runInContext(['createCaptureReads', 'tileClass', 'districtOccupier', 'readTiles', 'localObserverId', 'readVisibility'].map(slice).join('\n'), ctx);
  const { owner, cls } = ctx.readTiles(), vis = ctx.readVisibility();
  for (let i = 0; i < n; i++) {
    const d = district(i), occupied = d && d.owner !== d.controllingPlayer;
    const expectedOwner = occupied ? d.controllingPlayer : i % 5 === 0 ? -1 : i % 63;
    assert.equal(owner[i], expectedOwner);
    if (i !== n - 1) assert.equal(cls[i], expectedOwner < 0 ? 0 : d ? d.type === 0 ? 2 : 1 : 0);
    assert.equal(vis[i], i % 3);
  }
  assert.equal(cls[n - 1], 4);
  assert.equal(districts, n);
  assert.equal(owners, n); assert.equal(revealed, n); assert.equal(centers, 1);
});
test('63-player society capture reads each progression handle once, with identical discovery IDs', () => {
  let techReads = 0, cultureReads = 0;
  const nodes = Array.from({ length: 100 }, (_, i) => `NODE_${i % 2 ? 'CIVIC' : 'TECH'}_${i}`);
  const ctx = vm.createContext({
    MAX_PLAYER_ID: 63, PEOPLE_PROGRESSION_NODES: nodes, Game: {},
    Players: { get: id => id === 63 ? null : ({
      isMajor: true,
      get Techs() { techReads++; return { isNodeUnlocked: node => Number(node.split('_').at(-1)) < id }; },
      get Culture() { cultureReads++; return { isNodeUnlocked: node => Number(node.split('_').at(-1)) < id }; },
      Happiness: { isInGoldenAge: () => id % 2 === 0 },
    }) }, err: e => assert.fail(e),
  });
  vm.runInContext(slice('readSociety'), ctx);
  const rows = JSON.parse(JSON.stringify(ctx.readSociety()));
  assert.equal(rows.length, 63);
  for (let id = 0; id < 63; id++) assert.deepEqual(rows[id], [id, Array.from({ length: id }, (_, i) => i), id % 2 === 0, null]);
  assert.equal(techReads, 63); assert.equal(cultureReads, 63);
});

test('63-major captures share city and constructible reads, then refresh after razing on the next capture', () => {
  let collections = 0, cities = 0, definitions = 0;
  const states = Array.from({ length: 64 }, (_, pid) => ({
    constructibles: pid < 63 ? [
      ...Array.from({ length: 100 }, (_, i) => ({
        type: i % 2 ? 'BUILDING' : 'IMPROVEMENT', location: { x: pid * 1000 + i + 10 }, damaged: i === 1,
      })),
      { type: 'WONDER', location: { x: pid * 1000 + 120 } },
    ] : [
      { type: 'VILLAGE', location: { x: 63010 } },
      { type: 'UNKNOWN', location: { x: 63011 } },
    ],
    cities: pid < 63 ? [{ location: { x: pid * 1000 }, name: `City ${pid}`, population: pid + 1,
      isTown: pid % 2 === 0, isCapital: pid === 0 }] : [],
  }));
  const types = {
    BUILDING: { ConstructibleClass: 'BUILDING' },
    IMPROVEMENT: { ConstructibleClass: 'IMPROVEMENT' },
    WONDER: { ConstructibleClass: 'WONDER' },
    VILLAGE: { ConstructibleClass: 'IMPROVEMENT', ConstructibleType: 'IMPROVEMENT_VILLAGE' },
  };
  const ctx = vm.createContext({
    MAX_PLAYER_ID: 63,
    Players: { get: pid => ({
      isMajor: pid < 63, isIndependent: pid === 63, civilizationFullName: 'Village',
      Constructibles: { getConstructibles() { collections++; return states[pid].constructibles; } },
      Cities: { getCities() { cities++; return states[pid].cities; } },
    }) },
    GameInfo: { Constructibles: { lookup(type) { definitions++; return types[type]; } } },
    GameplayMap: { getIndexFromLocation: loc => loc.x },
    Locale: { compose: text => text }, err: error => assert.fail(error),
    buildingTypeIndex: type => ({ BUILDING: 0, IMPROVEMENT: 1, VILLAGE: 2 })[type],
    wonderTypeIndex: () => 0, settlementType: city => city.isTown ? 'Town' : 'City',
    cityYields: city => [city.population], cityDefenseHealth: () => [50, 100],
  });
  vm.runInContext(['createCaptureReads', 'markCenters', 'readBuildings', 'readWonders', 'readSettlements']
    .map(slice).join('\n') + '\nlet lastReadDamaged;', ctx);
  const capture = () => vm.runInContext(`(() => {
    const reads = createCaptureReads(), cls = new Int8Array(64000);
    markCenters(cls, reads);
    const buildings = readBuildings(reads), settlements = readSettlements(reads), wonders = readWonders(reads);
    return { cls, buildings, settlements, wonders, damaged: lastReadDamaged };
  })()`, ctx);
  const first = capture();
  assert.equal(collections, 64, 'one native constructible collection per player, not 129');
  assert.equal(cities, 64, 'one native city collection per player, not 127');
  assert.equal(definitions, 5, 'resolve repeated constructible types once, including missing definitions');
  assert.equal(first.buildings.size, 6301);
  assert.equal(first.wonders.size, 63);
  assert.equal(first.settlements.size, 64);
  assert.equal(first.damaged.size, 63);
  assert.deepEqual([...first.buildings.get(11)], [0]);
  assert.deepEqual([...first.damaged.get(11)], [0]);
  assert.deepEqual([...first.wonders.get(120)], [0, 0]);
  assert.deepEqual([...first.settlements.get(0)].slice(0, 3), ['City 0', 1, 'Town']);
  assert.deepEqual([...first.settlements.get(63010)].slice(0, 3), ['Village', 0, 'Village']);
  assert.equal(first.cls[0], 3);
  assert.equal(first.cls[1000], 2);
  assert.equal(first.cls[63010], 2);
  states[0].constructibles = []; states[0].cities = []; states[63].constructibles = [];
  collections = 0; cities = 0; definitions = 0;
  const second = capture();
  assert.equal(collections, 64); assert.equal(cities, 64); assert.equal(definitions, 3);
  assert.equal(second.buildings.size, 6200);
  assert.equal(second.wonders.size, 62);
  assert.equal(second.settlements.size, 62);
  assert.equal(second.damaged.size, 62);
  assert.equal(second.cls[0], 0); assert.equal(second.cls[63010], 0);
  assert.ok(!second.buildings.has(11) && !second.wonders.has(120) && !second.settlements.has(0));
});
