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
test('63-player relationship capture uses one player/diplomacy lookup per slot, not per pair', () => {
  let lookups = 0, handles = 0;
  const errors = [], R = { PLAYER_RELATIONSHIP_UNKNOWN: 0, PLAYER_RELATIONSHIP_FRIENDLY: 1,
    PLAYER_RELATIONSHIP_HELPFUL: 2, PLAYER_RELATIONSHIP_UNFRIENDLY: 3, PLAYER_RELATIONSHIP_HOSTILE: 4 };
  const diplomacy = id => ({
    hasMet: other => (id + other) % 7 !== 0,
    isAtWarWith: other => (id + other) % 5 === 0,
    hasAllied: other => (id + other) % 11 === 0,
    getRelationshipEnum: other => (id + other) % 6,
  });
  const players = Array.from({ length: 64 }, (_, id) => ({
    isMajor: id < 63,
    get Diplomacy() { handles++; return diplomacy(id); },
  }));
  const ctx = vm.createContext({
    MAX_PLAYER_ID: 63, Players: { get(id) { lookups++; return players[id]; } },
    DiplomacyPlayerRelationships: R, err: message => errors.push(message),
  });
  vm.runInContext(slice('relationCode') + '\n' + slice('readRelationships'), ctx);
  const expected = new Map();
  for (let a = 0; a < 63; a++) for (let b = a + 1; b < 63; b++) {
    const total = a + b;
    if (total % 7 === 0) continue;
    let code;
    if (total % 5 === 0) code = 4;
    else if (total % 11 === 0) code = 3;
    else if (total % 6 === 0) continue;
    else code = total % 6 <= 2 ? 1 : total % 6 <= 4 ? 2 : 0;
    expected.set(`${a},${b}`, code);
  }
  assert.deepEqual(Array.from(ctx.readRelationships(), row => Array.from(row)), Array.from(expected));
  assert.equal(lookups, 64, 'formerly 64 + 1,953 per-pair player lookups');
  assert.equal(handles, 63, 'formerly 1,953 per-pair diplomacy lookups');
  assert.deepEqual(errors, []);
  players[1] = { isMajor: false };
  const next = ctx.readRelationships();
  assert.ok(![...next.keys()].some(key => key.split(',').includes('1')), 'fresh snapshot each capture');
  assert.equal(lookups, 128);
  players[0] = { isMajor: true, get Diplomacy() { throw new Error('unavailable'); } };
  const partial = ctx.readRelationships();
  assert.ok(partial.size > 0, 'one unavailable diplomacy interface must not discard other relationships');
  assert.ok(errors.some(message => /diplomacy 0.*unavailable/.test(message)));
});

test('missing diplomacy and unknown/unmet relationships remain untracked', () => {
  const ctx = vm.createContext({ err: message => assert.fail(message) });
  vm.runInContext(slice('relationCode'), ctx);
  assert.equal(ctx.relationCode(1, undefined), -1);
  assert.equal(ctx.relationCode(1, { hasMet: () => false }), -1);
  assert.equal(ctx.relationCode(1, {}), 0);
  assert.equal(ctx.relationCode(1, { isAtWarWith: () => true }), 4);
  assert.equal(ctx.relationCode(1, { hasAllied: () => true }), 3);
});
