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
  vm.runInContext(['tileClass', 'districtOccupier', 'readTiles', 'localObserverId', 'readVisibility'].map(slice).join('\n'), ctx);
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
