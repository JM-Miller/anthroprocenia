import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/setup/anthroprocenia-oversized-players.js', import.meta.url), 'utf8');
const context = vm.createContext({
  engine: { call() {} },
  Network: { startGame() {} },
});
vm.runInContext(source.replace(/^import .*;\r?\n/m, '').replace(/^export /gm, ''), context);
const plan = (players, seed = '123') => JSON.parse(JSON.stringify(context.planOversizedLeaders(players, seed)));
const leaders = ['LEADER_A', 'LEADER_B', 'LEADER_C'];
const players = count => Array.from({ length: count }, (_, id) => ({ id, leader: 'RANDOM', leaders }));

test('ordinary player counts retain native random leader resolution', () => {
  assert.deepEqual(plan(players(3)), []);
});

test('overflow uses every available leader before balanced repeats and is seed deterministic', () => {
  const assignments = plan(players(63));
  assert.equal(assignments.length, 63);
  assert.equal(new Set(assignments.slice(0, 3).map(player => player.leader)).size, 3);
  for (const leader of leaders) assert.equal(assignments.filter(player => player.leader === leader).length, 21);
  assert.deepEqual(plan(players(63)), assignments);
  assert.notDeepEqual(plan(players(63), '456'), assignments);
});

test('manual choices and per-player ownership restrictions are preserved', () => {
  const slots = players(5);
  slots[0].leader = 'LEADER_A';
  slots[1].leaders = ['LEADER_B'];
  const assignments = plan(slots);
  assert.equal(assignments.some(player => player.id === 0), false);
  assert.equal(assignments.find(player => player.id === 1).leader, 'LEADER_B');
  slots[1].leaders = [];
  assert.throws(() => plan(slots), /No available leaders for player 1/);
});

function runtime(host = true) {
  const slots = players(5);
  const calls = [];
  const assignments = [];
  const setup = vm.createContext({
    UI: { isInGame: () => false },
    Configuration: {
      getMap: () => ({ maxMajorPlayers: slots.length }),
      getPlayer: () => ({ slotStatus: 1 }),
    },
    SlotStatus: { SS_TAKEN: 0, SS_COMPUTER: 1 },
    GameSetupDomainValueInvalidReason: { Valid: 0 },
    GameSetup: {
      findPlayerParameter: id => ({
        value: { value: slots[id].leader },
        domain: { possibleValues: leaders.map(value => ({ value, invalidReason: 0 })) },
      }),
      findGameParameter: () => ({ value: { value: '123' } }),
      setPlayerParameterValue(id, key, value) {
        slots[id].leader = value;
        assignments.push(id);
      },
    },
    console: { warn() {} },
    engine: { call(...args) { calls.push(args); return 'started'; } },
    Network: {
      startGame() { calls.push(['network']); return 'network-started'; },
      getHostPlayerId: () => host ? 0 : 1,
    },
    GameContext: { localPlayerID: 0 },
  });
  vm.runInContext(source.replace(/^export /gm, ''), setup);
  return { setup, calls, assignments };
}

test('shared engine launch resolves overflow before starting, without affecting other calls', () => {
  const { setup, calls, assignments } = runtime();
  assert.equal(setup.engine.call('unrelated', 7), 'started');
  assert.equal(assignments.length, 0);
  assert.equal(setup.engine.call('startGame'), 'started');
  assert.equal(assignments.length, 5);
  assert.deepEqual(calls, [['unrelated', 7], ['startGame']]);
});

test('network clients do not resolve leader choices; only the host does', () => {
  for (const host of [false, true]) {
    const { setup, assignments } = runtime(host);
    assert.equal(setup.Network.startGame(), 'network-started');
    assert.equal(assignments.length, host ? 5 : 0);
  }
});

test('rejected native assignments prevent launching instead of silently continuing', () => {
  const { setup, calls } = runtime();
  setup.GameSetup.setPlayerParameterValue = () => {};
  assert.throws(() => setup.engine.call('startGame'), /Leader assignment rejected/);
  assert.equal(calls.length, 0);
});
