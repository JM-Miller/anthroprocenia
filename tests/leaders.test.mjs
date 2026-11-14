import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const c = await loadModule('anthroprocenia-commands.js');
const p = await loadModule('anthroprocenia-people.js');
const panel = await loadModule('anthroprocenia-population-panel.js');

const role = (home, index, extra = {}) => p.leaderRole({ home, index, gender: 'male', ageCategory: 'Adult', ...extra });

test('leaders: the royal family at the palace, governors at urban centres, officers in units', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => role('palace', i)), ['King', 'Prince Consort', 'Crown Prince', 'Prince', 'Prince', '']);
  assert.equal(role('palace', 0, { gender: 'female' }), 'Queen');
  assert.deepEqual([0, 1, 2].map(i => role('center', i)), ['Governor', 'Deputy Governor', '']);
  assert.deepEqual([0, 1, 2, 3].map(i => role('unit', i, { unit: { sub: 'commander' } })), ['Commander', "Commander's Scribe", "Commander's Aide", '']);
  assert.deepEqual([0, 1, 2].map(i => role('unit', i, { unit: { sub: 'melee' }, civKey: 'CIVILIZATION_ROME' })), ['Centurion', 'Optio', '']);
  assert.deepEqual([0, 1].map(i => role('unit', i, { unit: { sub: 'melee' }, civKey: 'CIVILIZATION_EGYPT' })), ['Captain', 'Sergeant']);
  assert.equal(role('unit', 0, { unit: { sub: 'naval' }, civKey: 'CIVILIZATION_ROME' }), "Ship's Captain");
  for (const sub of ['settler', 'builder', 'merchant', 'scout', 'religious']) assert.equal(role('unit', 0, { unit: { sub } }), '', sub);
  assert.equal(role('unit', 0, { unit: null }), '');
  assert.equal(role('', 0), '');
});

test('children lead nowhere, except the heir at the palace', () => {
  const child = { ageCategory: 'Child' };
  assert.equal(role('palace', 2, child), 'Crown Prince');
  assert.equal(role('palace', 0, child), '');
  assert.equal(role('center', 0, child), '');
  assert.equal(role('unit', 0, { ...child, unit: { sub: 'commander' } }), '');
});

test('leaders act as courtiers, scholars or soldiers', () => {
  assert.deepEqual(['Queen', 'Governor', "Commander's Scribe", 'Commander', 'Centurion', "Ship's Captain", 'Sergeant'].map(p.leaderFamily),
    ['court', 'court', 'learned', 'soldier', 'soldier', 'soldier', 'soldier']);
});

test('the Leaders Panel lists only people with roles, palace first', () => {
  const icon = (id, total, home) => ({ kind: 'icon', id, total, home });
  const tree = [{ kind: 'civ', children: [{ kind: 'tile', children: [icon('farm', 9, ''), icon('unit', 4, 'unit'), icon('palace', 8, 'palace')] }] }];
  const rows = panel.leaderRows(tree, node => node.home, (node, i) => (node.home === 'palace' ? (i < 5 ? `R${i}` : '') : i < 2 ? `O${i}` : ''), { order: { palace: 0, center: 1, unit: 2 } });
  assert.deepEqual(rows.map(r => `${r.node.id}:${r.index}:${r.role}`), ['palace:0:R0', 'palace:1:R1', 'palace:2:R2', 'palace:3:R3', 'palace:4:R4', 'unit:0:O0', 'unit:1:O1']);
  assert.equal(panel.leaderRows(tree, n => n.home, () => 'X', { perHome: 2, max: 3 }).length, 3);
  assert.deepEqual(panel.leaderRows(tree, () => '', () => 'X'), []);
});

test('leaders get three commands a turn, their own actions, and much better odds', () => {
  assert.deepEqual([c.commandsPerTurn(true), c.commandsPerTurn(false)], [3, 1]);
  const plain = c.familyActions('soldier').map(a => a.id), led = c.familyActions('soldier', true).map(a => a.id);
  for (const id of c.LEADER_ACTION_IDS) { assert.ok(!plain.includes(id), id); assert.ok(led.includes(id), id); }
  const action = c.familyActions('farm')[0];
  const without = c.commandChance(action, 1, 0, 0, 0), withOne = c.commandChance(action, 1, 0, 0, 1);
  assert.ok(withOne >= without + 0.19, `${without} -> ${withOne}`);
  const menu = c.commandMenu([{ family: 'court', leader: true }, { family: 'court' }], { kind: 'building', cls: 'civic', central: true });
  const court = menu.find(m => m.id === 'court');
  assert.deepEqual([court.who, court.leaders], [[0], 1]);
});
test('leaders and their families never receive ordinary work or contextual occupational actions', () => {
  const ids = new Set(c.LEADER_ACTION_IDS);
  for (const family of c.WORK_FAMILY_KEYS) for (const leader of [false, true]) {
    const context = { leaderHousehold: !leader, leader, ageCategory: 'Adult', occupation: 'Supply runner',
      war: true, celebration: true, shortage: true, recovery: true, crisis: true, alliance: true };
    const actions = c.familyActions(family, leader, context);
    assert.equal(actions.length, ids.size);
    assert.ok(actions.every(action => ids.has(action.id)));
    assert.ok(c.ambientActions(family, context).every(action => ids.has(action.id)));
  }
  const child = c.familyActions('farm', false, { leaderHousehold: true, ageCategory: 'Child', celebration: true });
  assert.ok(child.every(action => /Family|Household/.test(action.label)));
  assert.deepEqual(c.familyActions('farm', true, { ageCategory: 'Infant' }), []);
  assert.ok(c.familyActions('soldier', true, { ageCategory: 'Elder' }).every(action => action.risk === 0));
});

test('success chances are low: never above 60% without a leader, 80% with', () => {
  for (const family of c.WORK_FAMILY_KEYS) {
    for (const action of c.familyActions(family, true)) {
      assert.ok(action.chance <= 0.3, `${family}/${action.id} ${action.chance}`);
      assert.ok(c.commandChance(action, 50, 50, 0, 0) <= 0.6);
      assert.ok(c.commandChance(action, 50, 50, 0, 3) <= 0.8);
      assert.ok(c.commandChance(action, 1, 0, 50, 0) >= 0.02);
    }
  }
});

test('Unit Health is a yield every trade can work for, aimed at units', () => {
  assert.ok(c.YIELDS.includes('health'));
  assert.equal(c.GAME_YIELDS.health, undefined, 'health is not paid into the treasury');
  for (const family of c.WORK_FAMILY_KEYS) assert.ok(c.familyActions(family).some(a => a.yield === 'health'), family);
  const inspect = c.familyActions('soldier', true).find(a => a.id === 'inspect');
  assert.equal(c.actionFits(inspect, { kind: 'walker', enemy: false, unit: true }), true);
  assert.equal(c.actionFits(inspect, { kind: 'walker', enemy: false, unit: false }), false);
  assert.equal(c.actionFits(inspect, { kind: 'walker', enemy: true, unit: true, battling: true }), false);
});

test('there are many more commands than before', () => {
  const total = c.WORK_FAMILY_KEYS.reduce((sum, family) => sum + c.familyActions(family).length, 0);
  assert.ok(total >= 200, String(total));
  for (const family of c.WORK_FAMILY_KEYS) assert.ok(c.familyActions(family).length >= 10, family);
});

test('only a risky action that fails wounds the unit', () => {
  const risky = c.familyActions('soldier').find(a => a.risk > 0), safe = c.familyActions('farm').find(a => !a.risk);
  let failedWounds = 0, wonWounds = 0;
  for (let i = 0; i < 300; i++) {
    const r = c.resolveCommand({ action: risky, count: 1, allies: 0, enemies: 2, seed: `w${i}` });
    if (r.success) wonWounds += r.wound; else if (r.wound > 0) failedWounds++;
    assert.equal(c.resolveCommand({ action: safe, count: 1, seed: `s${i}` }).wound, 0);
  }
  assert.equal(wonWounds, 0);
  assert.ok(failedWounds > 100, String(failedWounds));
});
