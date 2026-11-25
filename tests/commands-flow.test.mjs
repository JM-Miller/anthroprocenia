import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule } from './load.mjs';

const town = await loadModule('anthroprocenia-townscape.js');
const demo = await loadModule('anthroprocenia-demography.js');
const root = new URL('../anthroprocenia/', import.meta.url);
const playback = await readFile(new URL('ui/map/anthroprocenia-playback.js', root), 'utf8');
const modinfo = await readFile(new URL('anthroprocenia.modinfo', root), 'utf8');
const vm = await import('node:vm');
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

// 0 - 1 - 2 - 3 in a line, plus a cheap detour 0 - 4 - 3 and an island 5.
const graph = {
  nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 5 }, { x: 99, y: 99 }],
  adj: [[1, 4], [0, 2], [1, 3], [2, 4], [0, 3], []],
};

test('routeTree gives every reachable node its route to the goal, and null where there is none', () => {
  const tree = town.routeTree(graph, 3);
  assert.deepEqual(town.routeFromTree(tree, 0), [0, 4, 3]);
  assert.deepEqual(town.routeFromTree(tree, 1), [1, 2, 3]);
  assert.deepEqual(town.routeFromTree(tree, 3), [3]);
  assert.equal(town.routeFromTree(tree, 5), null);
  assert.equal(town.routeFromTree(tree, -1), null);
  // with costs, the walker takes the long way round an expensive edge
  const costly = { ...graph, cost: [[1, 50], [1, 1], [1, 1], [1, 50], [50, 50], []] };
  assert.deepEqual(town.routeFromTree(town.routeTree(costly, 3), 0), [0, 1, 2, 3]);
});

test('stepCommanded walks the route in sight, then stays at its target', () => {
  const walker = { x: 0, y: 0, node: 0, speed: 10, inside: true, fade: 0, wait: 3, cmd: { route: [0, 1, 2], leg: 0, t: 0, x: 21, y: 1 } };
  town.stepCommanded(walker, graph, 0.5);
  assert.equal(walker.inside, false);
  assert.equal(walker.fade, 1);
  assert.ok(walker.x > 0 && walker.x < 10);
  assert.ok(!walker.cmd.arrived);
  for (let i = 0; i < 20; i++) town.stepCommanded(walker, graph, 0.5);
  assert.equal(walker.cmd.arrived, true);
  assert.deepEqual([walker.x, walker.y, walker.node], [21, 1, 2]);
  town.stepCommanded(walker, graph, 5);
  assert.deepEqual([walker.x, walker.y], [21, 1]);
  // with no way along the network they still walk there, never appear there
  const lost = { x: 3, y: 3, speed: 10, cmd: { route: null, x: 7, y: 8 } };
  town.stepCommanded(lost, graph, 0.1);
  assert.ok(!lost.cmd.arrived);
  assert.ok(lost.x > 3 && lost.x < 7 && lost.y > 3 && lost.y < 8, `${lost.x},${lost.y}`);
  for (let i = 0; i < 20; i++) town.stepCommanded(lost, graph, 0.1);
  assert.deepEqual([lost.x, lost.y, lost.cmd.arrived], [7, 8, true]);
});

test('a commanded walker covers ground at walking pace', () => {
  const walker = { x: 0, y: 0, node: 0, speed: 10, cmd: { route: [0, 1, 2, 3], x: 30, y: 0 } };
  let steps = 0;
  while (!walker.cmd.arrived && steps < 1000) { town.stepCommanded(walker, graph, 0.1); steps++; }
  const expected = 30 / (10 * town.COMMAND_PACE) / 0.1;
  assert.ok(Math.abs(steps - expected) <= 2, `${steps} steps, about ${expected} expected`);
});

test('a death a command brought about ends the life on that turn whatever the odds', () => {
  const state = demo.startLife(42, -1000);
  const before = state.gen;
  demo.stepLife(state, 42, 5, -990, 10, null, 'battle');
  assert.equal(state.gen, before + 1);
  assert.deepEqual([state.lastDeath.turn, state.lastDeath.cause], [5, 'battle']);
  const calm = demo.startLife(42, -1000);
  demo.stepLife(calm, 42, 5, calm.born + 1, 1, null, '');
  assert.equal(calm.lastDeath, null);
});

test('the command system is wired into the map view', () => {
  for (const hook of [
    "window.addEventListener('mousedown', onCmdRightDown, true)",
    "window.addEventListener('mouseup', onCmdRightUp, true)",
    "window.addEventListener('mousedown', onCmdPressOutside, true)",
    "event.detail.name === 'mousebutton-right' && cmdRightActive()",
    'cmdResetState();',
    'stepCommanded(person, townWorld.graph, dt)',
    'cmdTickPerson(',
    'cmdSelectBox(',
    'cmdCheckHtml(',
    'cmdDeathsFor(key)',
    'cmdPopulationDelta(item)',
  ]) assert.ok(playback.includes(hook), hook);
  // a commanded walker stays put even while the others are unpaused
  assert.match(playback, /if \(person\.cmd\) \{[\s\S]{0,240}stepCommanded\(person[\s\S]{0,800}\} else if \(!popState\.peoplePaused && dt > 0\) stepWalker\(/);
});

test('yields are paid from the map view itself when the turn ends (no gameplay script)', () => {
  assert.ok(!/ScenarioScripts/.test(modinfo), 'ScenarioScripts never ran, so the modinfo no longer lists it');
  for (const file of ['anthroprocenia-commands.js', 'anthroprocenia-linenames.js']) assert.ok(modinfo.includes(`ui/map/${file}`), file);
  assert.match(playback, /engine\.on\('LocalPlayerTurnEnd', \(\) => \{ try \{ cmdPayYields\('turn end'\)/);
  assert.match(playback, /engine\.on\('LocalPlayerTurnBegin', \(\) => \{ try \{ cmdPayYields\('turn begin', true\)/);
  assert.match(playback, /Players\.grantYield\(player, YieldTypes\[key\], amount\)/);
});

function payContext(opts = {}) {
  const store = new Map(), grants = [], damage = new Map([['0:7', 40]]);
  const health = id => ({ get damage() { return damage.get(id); }, maxDamage: 100, changeDamage: n => damage.set(id, damage.get(id) + n) });
  const context = vm.createContext({
    Math, Number, String, JSON, Object, Array, console: { warn: () => {}, error: () => {} }, TAG: '[T]',
    GAME_YIELDS: { food: 'YIELD_FOOD', gold: 'YIELD_GOLD', influence: 'YIELD_DIPLOMACY', science: 'YIELD_SCIENCE' },
    YieldTypes: { YIELD_FOOD: 0, YIELD_GOLD: 2, YIELD_DIPLOMACY: 6, YIELD_SCIENCE: 3 },
    Players: opts.noGrant ? { getAlive: () => [], get: () => ({ Treasury: { changeGoldBalance: n => grants.push(['treasury', n]) } }) } : { getAlive: () => opts.players || [], grantYield: (p, y, n) => {
      if (opts.fail && opts.fail(p, y)) throw new Error('test payment failure');
      grants.push([p, y, n]);
    } },
    Units: { get: id => (`${id.owner}:${id.id}` === '0:7' ? { Health: health('0:7') } : null) },
    Game: { turn: 12 }, cmdState: { yreq: null }, cmdLocalPlayer: () => 0, err: () => {},
    Configuration: { getGame: () => ({ isAnyMultiplayer: !!opts.multiplayer, isHotseat: !!opts.hotseat }) },
    CMD_MULTIPLAYER_TIP: 'Synchronized commands unavailable',
    viewRead: key => (store.has(key) ? JSON.parse(store.get(key)) : null),
    viewSave: (key, produce) => store.set(key, JSON.stringify(produce())),
  });
  vm.runInContext(['cmdGameplayAllowed', 'cmdGameTurn', 'cmdYieldQueue', 'cmdSaveYieldQueue', 'cmdOweYield', 'cmdOweRivalYields', 'cmdPayYield', 'cmdHealUnit', 'cmdPayYields'].map(slice).join('\n') + '\nlet cmdPayLogged = false;', context);
  return { context, grants, damage, store, run: code => vm.runInContext(code, context) };
}

test('what commands earn is owed until the turn ends, then paid in once with Players.grantYield', () => {
  const t = payContext();
  t.run("cmdOweYield('gold', 3); cmdOweYield('gold', 2); cmdOweYield('science', 4); cmdOweYield('health', 15, { owner: 0, id: 7, type: 1 }); cmdOweYield('health', -5, { owner: 0, id: 7, type: 1 })");
  assert.deepEqual(t.grants, [], 'nothing is paid before the turn ends');
  assert.deepEqual(JSON.parse(t.store.get('yreq')).due, { gold: 5, science: 4 }, 'the queue is saved with the game');
  t.run("cmdPayYields('turn end')");
  assert.deepEqual(t.grants, [[0, 2, 5], [0, 3, 4]]);
  assert.equal(t.damage.get('0:7'), 30, 'the unit is healed by what is owed it, less its wounds');
  t.run("cmdPayYields('turn end'); cmdPayYields('turn begin', true)");
  assert.equal(t.grants.length, 2, 'never paid twice');
  assert.equal(JSON.parse(t.store.get('yreq')).paid, true);
});
test('multiplayer and hotseat cannot queue, grant, heal or settle saved single-player rewards', () => {
  for (const opts of [{ multiplayer: true }, { hotseat: true }]) {
    const t = payContext(opts);
    assert.throws(() => t.run("cmdOweYield('gold', 3)"), /Synchronized commands unavailable/);
    assert.equal(t.run("cmdPayYield(0, 'gold', 3)"), false);
    assert.equal(t.run('cmdHealUnit(0, 7, 1, 15)'), false);
    t.context.cmdState.yreq = { v: 2, p: 0, turn: 11, due: { gold: 8 }, units: [[0, 7, 1, 10]], paid: false };
    t.run("cmdPayYields('turn begin', true)");
    assert.deepEqual(t.grants, []);
    assert.equal(t.damage.get('0:7'), 40);
    assert.equal(t.context.cmdState.yreq.paid, false);
  }
});

test('a queue left unpaid is paid at the next turn, and Gold falls back to the treasury', () => {
  const t = payContext({ noGrant: true });
  t.run("cmdOweYield('gold', 6)");
  t.run("cmdPayYields('turn begin', true)");
  assert.deepEqual(t.grants, [], 'this turn\'s queue waits for the end of the turn');
  t.context.Game.turn = 13;
  t.context.cmdState.yreq = null;   // as after a reload
  t.run("cmdPayYields('turn begin', true)");
  assert.deepEqual(t.grants, [['treasury', 6]]);
  // owing something on a new turn first settles an earlier unpaid queue
  t.run("cmdOweYield('gold', 1)");
  t.context.Game.turn = 14;
  t.run("cmdOweYield('gold', 2)");
  assert.deepEqual(t.grants, [['treasury', 6], ['treasury', 1]]);
  assert.deepEqual(JSON.parse(t.store.get('yreq')), { v: 2, p: 0, turn: 14, due: { gold: 2 }, units: [], paid: false, carry: {}, carryUnits: [], rivals: {}, rivalCarry: {} });
});

test('leaders can be given three commands a turn, everyone else one, and the dead none', () => {
  const acted = new Map([['a#0', [1, 2, 0]], ['a#1', [1, 2, 0, 2]], ['a#2', [1, 2, 1, 1]]]);
  const context = vm.createContext({ Math, Array, Map, cmdActed: () => acted, commandsPerTurn: leader => (leader ? 3 : 1) });
  vm.runInContext(['cmdActedSpot', 'cmdActedCount', 'cmdNoteLeader', 'cmdLeaderRole', 'cmdCommandsLeft'].map(slice).join('\n') + '\nconst cmdLeaders = new Map();', context);
  const run = code => vm.runInContext(code, context);
  assert.equal(run("cmdCommandsLeft('a#0')"), 0, 'an old [x, y, dead] entry counts as one command');
  assert.equal(run("cmdCommandsLeft('a#9')"), 1);
  run("cmdNoteLeader('a#1', 'Centurion'); cmdNoteLeader('a#9', 'Queen'); cmdNoteLeader('a#2', 'King')");
  assert.deepEqual([run("cmdCommandsLeft('a#1')"), run("cmdCommandsLeft('a#9')"), run("cmdCommandsLeft('a#2')")], [1, 3, 0]);
  run("cmdNoteLeader('a#9', '')");
  assert.equal(run("cmdCommandsLeft('a#9')"), 1);
  assert.deepEqual(JSON.parse(JSON.stringify(run("cmdActedSpot([4, 5, 1, 3])"))), { x: 4, y: 5, dead: true, label: '', place: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(run("cmdActedSpot([4, 5, 0, 3, 'Teach', 'Library'])"))), { x: 4, y: 5, dead: false, label: 'Teach', place: 'Library' });
  assert.equal(run('cmdActedSpot(null)'), null);
});

test('commands reach only the tile a walker stands on and the tiles next to it', () => {
  const context = vm.createContext({ tileAtMapPoint: (x, y) => Math.floor(x / 10), neighborsByIndex: { 5: [4, 6] } });
  vm.runInContext(slice('cmdInReach'), context);
  const reach = (px, tx) => vm.runInContext('cmdInReach', context)({ x: px, y: 0 }, { x: tx, y: 0 });
  assert.deepEqual([reach(55, 51), reach(45, 51), reach(65, 51), reach(35, 51), reach(75, 51)], [true, true, true, false, false]);
  assert.equal(vm.runInContext('cmdInReach', context)({ x: 1, y: 0 }, null), false);
});

test('the Leaders Panel, the Command Panel and a commanded walker\'s walk are wired in', () => {
  for (const hook of ['buildLeadersUi()', 'syncCommandPanel()', 'positionLeadersUi(top, popLeft, width)', 'leaderRows(popState.tree', 'cmdNoteLeader(key, profile.role)',
    'cmdInReach(w.person, target)', 'leaders,', 'cmdHealthRecipient(target, doers)', 'route: cmdRouteTo(person.node, x, y)']) assert.ok(playback.includes(hook), hook);
  assert.ok(!playback.includes('cmdGrantYield'), 'the old pay-in path is gone');
});

test('only whole yields are paid; the fractions carry over into the next turn\'s queue', () => {
  const t = payContext();
  t.run("cmdOweYield('gold', 0.4); cmdOweYield('gold', 0.45); cmdOweYield('gold', 0.4); cmdOweYield('science', 0.3); cmdOweYield('health', 2.5, { owner: 0, id: 7, type: 1 })");
  t.run("cmdPayYields('turn end')");
  assert.deepEqual(t.grants, [[0, 2, 1]], 'one Gold of 1.25 is paid; the Science is too small yet');
  assert.equal(t.damage.get('0:7'), 38, 'two hit points healed');
  const saved = JSON.parse(t.store.get('yreq'));
  assert.deepEqual([saved.carry, saved.carryUnits], [{ gold: 0.25, science: 0.3 }, [[0, 7, 1, 0.5]]]);
  t.context.Game.turn = 13;
  t.run("cmdOweYield('science', 0.8)");
  assert.deepEqual(JSON.parse(t.store.get('yreq')).due, { gold: 0.25, science: 1.1 }, 'the new turn starts from what was carried');
  t.run("cmdPayYields('turn end')");
  assert.deepEqual(t.grants, [[0, 2, 1], [0, 3, 1]]);
});

test('every AI major gets each civilization yield equal to total walker gains, persisted and paid once', () => {
  const t = payContext({ players: [
    { id: 0, isMajor: true, isHuman: true },
    { id: 1, isMajor: true, isHuman: false },
    { id: 2, isMajor: true, isHuman: false },
    { id: 3, isMajor: false, isHuman: false },
    { id: 4, isMajor: true, isHuman: true },
  ] });
  t.run("cmdOweYield('gold', 1.125); cmdOweYield('science', 0.875); cmdOweYield('health', 5, { owner: 0, id: 7, type: 1 })");
  const saved = JSON.parse(t.store.get('yreq'));
  assert.deepEqual(saved.rivals, { 1: { food: 2, gold: 2, influence: 2, science: 2 }, 2: { food: 2, gold: 2, influence: 2, science: 2 } });
  assert.deepEqual(t.grants, []);
  t.context.cmdState.yreq = null;
  t.run("cmdPayYields('turn end'); cmdPayYields('turn end')");
  for (const player of [1, 2]) {
    assert.deepEqual(t.grants.filter(g => g[0] === player), [[player, 0, 2], [player, 2, 2], [player, 6, 2], [player, 3, 2]]);
  }
  assert.equal(t.grants.some(g => g[0] === 3 || g[0] === 4), false);
  assert.equal(t.damage.get('0:7'), 35);
});

test('tiny rewards and rival bonuses retain thousandths without re-bonusing carried fractions', () => {
  const t = payContext({ players: [{ id: 1, isMajor: true, isHuman: false }] });
  t.run("cmdOweYield('gold', 0.001); cmdPayYields('turn end')");
  assert.equal(JSON.parse(t.store.get('yreq')).carry.gold, 0.001);
  t.context.Game.turn++;
  t.run("cmdOweYield('gold', 0.999); cmdPayYields('turn end')");
  assert.deepEqual(t.grants, [[0, 2, 1], [1, 0, 1], [1, 2, 1], [1, 6, 1], [1, 3, 1]]);
});

test('failed payments retry only the unpaid amounts, including across turn changes', () => {
  let fail = true;
  const t = payContext({ players: [{ id: 1, isMajor: true, isHuman: false }], fail: (p, y) => fail && p === 1 && y === 3 });
  t.run("cmdOweYield('gold', 1.125); cmdPayYields('turn end')");
  const saved = JSON.parse(t.store.get('yreq'));
  assert.equal(saved.paid, false);
  assert.deepEqual(saved.due, {});
  assert.deepEqual(saved.rivals, { 1: { science: 1 } });
  t.context.Game.turn++;
  t.run("cmdOweYield('gold', 0.875)");
  fail = false;
  t.run("cmdPayYields('turn end'); cmdPayYields('turn end')");
  const sum = (p, y) => t.grants.filter(g => g[0] === p && g[1] === y).reduce((s, g) => s + g[2], 0);
  assert.equal(sum(0, 2), 2);
  for (const y of [0, 2, 6, 3]) assert.equal(sum(1, y), 2);
});

test('old paid version-2 queues do not repay their historical due amounts', () => {
  const t = payContext();
  t.context.cmdState.yreq = { v: 2, p: 0, turn: 11, due: { gold: 9 }, units: [], paid: true, carry: { gold: 0.001 }, carryUnits: [] };
  t.run("cmdOweYield('gold', 0.999); cmdPayYields('turn end')");
  assert.deepEqual(t.grants, [[0, 2, 1]]);
});

test('unpaid healing and its carried fraction recombine for the same unit on a new turn', () => {
  const t = payContext();
  t.context.cmdState.yreq = { v: 2, p: 0, turn: 11, due: {}, units: [[0, 7, 1, 1]], paid: false, carry: {}, carryUnits: [[0, 7, 1, 0.6]] };
  const getUnit = t.context.Units.get;
  t.context.Units.get = () => null;
  t.run("cmdOweYield('health', 0.4, { owner: 0, id: 7, type: 1 })");
  assert.deepEqual(JSON.parse(t.store.get('yreq')).units, [[0, 7, 1, 2]]);
  t.context.Units.get = getUnit;
  t.run("cmdPayYields('turn end')");
  assert.equal(t.damage.get('0:7'), 38);
});
