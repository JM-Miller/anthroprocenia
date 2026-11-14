import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const c = await loadModule('anthroprocenia-commands.js');
const n = await loadModule('anthroprocenia-linenames.js');
const p = await loadModule('anthroprocenia-people.js');

test('every work family has at least two yield actions', () => {
  for (const family of c.WORK_FAMILY_KEYS) {
    const actions = c.familyActions(family);
    const own = actions.filter(a => !['help', 'chat'].includes(a.id));
    assert.ok(own.length >= 2, family);
    for (const a of actions) assert.ok(c.YIELDS.includes(a.yield), `${family}.${a.id}`);
  }
  assert.deepEqual(c.familyActions('nonsense').map(a => a.id), c.familyActions('town').map(a => a.id));
});

test('people work families all have actions', () => {
  for (const family of ['grounds', 'farm', 'herd', 'hunt', 'wood', 'stone', 'water', 'soldier', 'clergy', 'learned', 'court', 'trade', 'craft', 'arts', 'labor', 'town']) {
    assert.ok(c.WORK_FAMILY_KEYS.includes(family), family);
  }
  assert.equal(typeof p.workFamily, 'function');
});

test('menus follow occupation and target', () => {
  const palace = { kind: 'building', cls: 'civic', central: true };
  const caretaker = c.commandMenu([{ family: 'grounds' }], palace);
  assert.ok(caretaker.some(a => a.label === 'Tend to Grounds'));
  const enemyFighting = { kind: 'walker', enemy: true, battling: true };
  assert.ok(c.commandMenu([{ family: 'soldier' }], enemyFighting).some(a => a.label === 'Attack'));
  assert.ok(!c.commandMenu([{ family: 'soldier' }], { kind: 'walker', enemy: true, battling: false }).some(a => a.id === 'attack'));
  assert.ok(!c.commandMenu([{ family: 'farm' }], enemyFighting).some(a => a.id === 'attack'));
  const both = c.commandMenu([{ family: 'grounds' }, { family: 'soldier' }], { kind: 'building', cls: 'sacred', central: false });
  const guard = both.find(a => a.id === 'guard'), help = both.find(a => a.id === 'help');
  assert.deepEqual(guard.who, [1]);
  assert.deepEqual(help.who, [0, 1]);
  assert.ok(c.commandMenu([{ family: 'wood' }], { kind: 'tree' }).some(a => a.id === 'fell'));
});

test('command outcomes are deterministic and shaped by helpers and enemies', () => {
  const attack = c.familyActions('soldier').find(a => a.id === 'attack');
  const a = c.resolveCommand({ action: attack, count: 3, allies: 1, enemies: 2, seed: 'x' });
  assert.deepEqual(a, c.resolveCommand({ action: attack, count: 3, allies: 1, enemies: 2, seed: 'x' }));
  const crowd = c.resolveCommand({ action: attack, count: 8, allies: 6, enemies: 0, seed: 'x' });
  const alone = c.resolveCommand({ action: attack, count: 1, allies: 0, enemies: 6, seed: 'x' });
  assert.ok(crowd.chance > alone.chance);
  let wins = 0, deaths = 0;
  for (let i = 0; i < 400; i++) {
    const r = c.resolveCommand({ action: attack, count: 2, allies: 0, enemies: 3, seed: i });
    if (r.success) { wins++; assert.ok(r.amount > 0); } else assert.equal(r.amount, 0);
    deaths += r.deaths.length;
    for (const d of r.deaths) assert.ok(d >= 0 && d < 2);
    assert.ok(r.popDelta <= 0 || r.yield === 'food' || r.yield === 'happiness');
  }
  // most things people try don't come off: an attack by two into three enemies rarely does
  assert.ok(wins > 0 && wins < 120, String(wins));
  assert.ok(deaths > 0);
  const tend = c.familyActions('grounds')[0];
  for (let i = 0; i < 50; i++) assert.equal(c.resolveCommand({ action: tend, count: 1, seed: i }).deaths.length, 0);
  assert.deepEqual(c.yieldTotals([{ yield: 'gold', amount: 2 }, { yield: 'gold', amount: 3 }, { yield: 'food', amount: 0 }]), { gold: 5 });
});

test('meandering paths keep their ends', () => {
  const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }];
  const m = c.meanderPath(pts, 's', 10);
  assert.deepEqual(m[0], { x: 0, y: 0 });
  assert.deepEqual(m[m.length - 1], { x: 100, y: 80 });
  assert.ok(m.length > pts.length);
  assert.ok(m.some(q => Math.abs(q.y) > 0.5 && q.x < 100));
  assert.deepEqual(c.meanderPath(pts, 's', 10), m);
});

test('townscape lines, buildings and features get culture-styled names', () => {
  const rome = n.townLineName('CIVILIZATION_ROME', 'Roma', 'main', 0);
  assert.match(rome, /Roma/);
  assert.equal(n.townLineName('CIVILIZATION_ROME', 'Roma', 'street', 3), n.townLineName('CIVILIZATION_ROME', 'Roma', 'street', 3));
  assert.notEqual(n.townLineName('CIVILIZATION_ROME', 'Roma', 'street', 1), n.townLineName('CIVILIZATION_ROME', 'Roma', 'street', 2) + 'x');
  for (const kind of n.LINE_KINDS) assert.ok(n.townLineName('CIVILIZATION_UNKNOWN', 'Town', kind, 1).length > 2, kind);
  for (const cls of n.BUILDING_CLASSES) assert.ok(n.townBuildingName('CIVILIZATION_ROME', 'Roma', cls, 1).length > 2, cls);
  assert.match(n.townBuildingName('CIVILIZATION_ROME', 'Roma', 'central', 0), /Roma/);
  assert.equal(n.localFeatureName('CIVILIZATION_ROME', 'river', 5, 'Tiber River'), 'Tiber River');
  assert.match(n.localFeatureName('CIVILIZATION_ROME', 'river', 5, 'Tiber'), /Tiber/);
  assert.ok(n.localFeatureName('', 'forest', 9, '').length > 3);
});

test('a few walkers bring in only a sliver of a yield; a leader or a crowd of forty brings in all of it', () => {
  assert.equal(c.FULL_CROWD, 40);
  assert.equal(c.yieldShare(1, 0), 0.02);
  assert.equal(c.yieldShare(5, 0), 0.02);
  assert.equal(c.yieldShare(20, 0), 0.25);
  assert.equal(c.yieldShare(40, 0), 1);
  assert.equal(c.yieldShare(400, 0), 1);
  assert.equal(c.yieldShare(1, 1), 1, 'a leader taking part');
  const gather = c.familyActions('grounds')[0];
  const one = [], crowd = [], led = [];
  for (let i = 0; i < 300; i++) {
    const a = c.resolveCommand({ action: gather, count: 1, seed: i }), b = c.resolveCommand({ action: gather, count: 40, seed: i }), l = c.resolveCommand({ action: gather, count: 1, leaders: 1, seed: i });
    if (a.success) one.push(a.amount);
    if (b.success) crowd.push(b.amount);
    if (l.success) led.push(l.amount);
  }
  const mean = list => list.reduce((s, x) => s + x, 0) / list.length;
  assert.ok(one.length && crowd.length && led.length);
  assert.ok(one.every(x => x > 0 && x < 1), 'one walker earns a fraction');
  assert.ok(mean(crowd) > mean(one) * 50, 'a great crowd earns many times more');
  assert.ok(mean(led) > mean(one) * 20, 'so does a leader');
  assert.deepEqual(c.yieldTotals([{ yield: 'gold', amount: 0.05 }, { yield: 'gold', amount: 0.01 }]), { gold: 0.06 });
  assert.deepEqual([c.formatYield(0.05), c.formatYield(2), c.formatYield(1.256), c.formatYield(undefined)], ['0.05', '2', '1.256', '0']);
});
