import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const commands = await loadModule('anthroprocenia-commands.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
}
function context(names, state) {
  const result = vm.createContext(state);
  vm.runInContext(names.map(slice).join('\n'), result);
  return result;
}

test('all successful command rewards are one tenth of the previous rewards, including health', () => {
  let checked = 0;
  for (const kind of commands.YIELDS) for (const count of [1, 20, 40, 1000]) for (const leaders of [0, 1]) {
    const action = { id: 'check', base: 3, yield: kind, chance: 0.25, risk: 0 };
    for (let seed = 0; seed < 100; seed++) {
      const actual = commands.resolveCommand({ action, count, allies: 2, leaders, seed });
      if (!actual.success) continue;
      const rand = commands.seededRandom(`${seed}|check|${count}`);
      rand();
      const full = 3 * (0.6 + 0.8 * rand()) * Math.sqrt(count) * 1.16 * (leaders ? 1.5 : 1);
      const old = Math.max(0.01, Math.round(full * commands.yieldShare(count, leaders) * 100) / 100);
      assert.ok(Math.abs(actual.amount * 10 - old) < 1e-8);
      checked++;
    }
  }
  assert.ok(checked > 100);
  assert.equal(commands.formatYield(0.001), '0.001');
  assert.deepEqual(commands.yieldTotals([{ yield: 'gold', amount: 0.001 }, { yield: 'gold', amount: 0.002 }]), { gold: 0.003 });
});

test('per-walker popup amounts add up exactly to the earned reward, even in a huge crowd', () => {
  const ctx = context(['cmdRewardShares'], {});
  for (const amount of [0.001, 0.017, 1.256, 20]) for (const count of [1, 3, 7200]) {
    const shares = ctx.cmdRewardShares(amount, count);
    assert.equal(shares.length, count);
    assert.equal(shares.reduce((sum, n) => sum + Math.round(n * 1000), 0), Math.round(amount * 1000));
    assert.ok(shares.every(n => n >= 0));
  }
});

test('reward popups start once on arrival, rise and fade slowly, then discard their DOM and timer', () => {
  let time = 0, timer = 0;
  const elements = [];
  const createElement = tag => {
    const el = { tag, style: {}, children: [], appendChild(child) { this.children.push(child); }, remove() { this.removed = true; } };
    elements.push(el);
    return el;
  };
  const ctx = context(['cmdShowCompletedReward', 'cmdShowYieldPopup', 'cmdTickYieldPopups', 'cmdClearYieldPopups'], {
    cmdYieldPopups: [], cmdYieldPopupTimer: 0, CMD_MAX_YIELD_POPUPS: 128, CMD_YIELD_POPUP_MS: 3600,
    mapVisible: true, peopleActive: () => true, gameOverlayActive: () => false,
    nowMs: () => time, ps: n => n, MAP_DEPTH: 0, mapToScreen: (x, y) => ({ x: x * 2, y: y * 2 }),
    document: { createElement, body: { appendChild() {} } },
    UI: { getIconURL: (type, group) => `${group}:${type}` },
    GAME_YIELDS: commands.GAME_YIELDS, YIELD_LABELS: commands.YIELD_LABELS, YIELD_COLORS: commands.YIELD_COLORS,
    formatYield: commands.formatYield, setTimeout: () => ++timer, clearTimeout: () => {},
  });
  const person = { x: 100, y: 200, cmd: {}, commandReward: { kind: 'food', amount: 0.013, turn: 1 } };
  ctx.cmdShowCompletedReward(person);
  assert.equal(elements.length, 0, 'not until the walk finishes');
  person.cmd.arrived = true;
  ctx.cmdShowCompletedReward(person);
  ctx.cmdShowCompletedReward(person);
  assert.equal(ctx.cmdYieldPopups.length, 1, 'never repeated');
  const popup = ctx.cmdYieldPopups[0].el;
  assert.equal(popup.children[0].src, 'YIELD:YIELD_FOOD');
  assert.equal(popup.children[1].textContent, '+0.013');
  assert.equal(popup.style.opacity, '1');
  const initialY = parseFloat(popup.style.top);
  time = 1800;
  person.x += 10;
  ctx.cmdTickYieldPopups();
  assert.equal(popup.style.left, '220px', 'the popup stays above its walker');
  assert.ok(parseFloat(popup.style.top) < initialY);
  assert.ok(+popup.style.opacity > 0 && +popup.style.opacity < 1);
  time = 3599;
  ctx.cmdTickYieldPopups();
  assert.ok(+popup.style.opacity < 0.001 && !popup.removed);
  time = 3600;
  ctx.cmdTickYieldPopups();
  assert.equal(popup.removed, true);
  assert.equal(ctx.cmdYieldPopups.length, 0);
  assert.equal(ctx.cmdYieldPopupTimer, 0);
  for (let i = 0; i < 140; i++) ctx.cmdShowYieldPopup(person, 'health', 1);
  assert.equal(ctx.cmdYieldPopups.length, 128, 'bounded even for mass commands');
  const remaining = ctx.cmdYieldPopups.map(p => p.el);
  ctx.mapVisible = false;
  ctx.cmdTickYieldPopups();
  assert.ok(remaining.every(el => el.removed));
  assert.equal(ctx.cmdYieldPopups.length, 0);
  assert.equal(ctx.cmdYieldPopupTimer, 0);
});

function followContext() {
  let refreshes = 0;
  const node = { id: 'home', tile: 2, total: 10 };
  const state = {
    popStopCameraTrip() {}, popFollow: { person: null, timer: 0 }, popState: { open: true, tree: [], nodeIndex: new Map([['home', node]]), pins: [], pinKeys: new Set() },
    pos: 0, MAX_PINS: 40, leadState: { open: false }, popRecomputeRows() {},
    mapVisible: true, mapDrag: null, mapPanX: 0, mapPanY: 0, hexW: 20, hexH: 20,
    basePos: { 2: { x: 20, y: 30 } }, gen: 1, spot: { x: 100, y: 200 },
    ps: n => n, personKey: panel.personKey, personBaseId: panel.personBaseId, stablePersonKey: panel.stablePersonKey,
    refreshPinnedWalkers: () => { refreshes++; }, popSelectPerson: () => {}, popRender: () => {},
    popPerson: () => ({ name: 'Ada', occupation: 'Farmer', life: { state: { gen: state.gen } } }),
    popPins: () => state.popState.pins,
    popIsPinned: key => state.popState.pinKeys.has(key),
    popTogglePin(n, i) { const key = `${n.id}#${i}`; state.popState.pins.push({ key, nodeId: n.id, index: i }); state.popState.pinKeys.add(key); },
    popRefreshModel: () => false, popIndexNodes: () => assert.fail('cached index expected'),
    personSpot: () => state.spot, gameOverlayActive: () => false,
    mapToScreen: (x, y) => ({ x, y }), measureArea: () => ({ x: 0, y: 0, w: 800, h: 600 }),
    requestViewApply: () => {}, clampMapPan: () => {}, setTimeout: () => 1, clearTimeout: () => {}, err: e => assert.fail(e),
  };
  const ctx = context(['popFollowMatches', 'popKeptWalking', 'popFollowButtonHtml', 'popStopFollow', 'popToggleFollow', 'popTickFollow'], state);
  return { ctx, node, state, refreshes: () => refreshes };
}

test('the button beside the pin saves the followed walker as a pin and keeps the walker centered', () => {
  const { ctx, node, state, refreshes } = followContext();
  assert.match(ctx.popFollowButtonHtml(node, 3), /title="Follow camera"/);
  ctx.popToggleFollow(node, 3);
  assert.equal(ctx.popFollow.person.key, 'home#3');
  assert.equal(ctx.popKeptWalking().length, 1, 'the followed walker is pinned without duplicate simulation entries');
  assert.ok(ctx.popIsPinned('home#3'));
  assert.equal(ctx.popFollowMatches('home', 3), true);
  assert.match(ctx.popFollowButtonHtml(node, 3), /aria-pressed="true"/);
  assert.deepEqual([ctx.mapPanX, ctx.mapPanY], [300, 100]);
  state.spot = null;
  ctx.mapPanX = 0; ctx.mapPanY = 0;
  ctx.popTickFollow();
  assert.deepEqual([ctx.mapPanX, ctx.mapPanY], [370, 260], 'falls back to the home tile without a visible walker');
  ctx.popToggleFollow(node, 3);
  assert.equal(ctx.popFollow.person, null);
  assert.equal(ctx.popFollow.timer, 0);
  assert.equal(ctx.popKeptWalking().length, 1, 'stopping the camera preserves the saved pin');
  assert.ok(refreshes() >= 2);
  assert.match(slice('popPersonRowHtml'), /\$\{popPinButtonHtml\(pinned\)\}\$\{popFollowButtonHtml\(row.node, row.index\)\}/);
  assert.match(slice('onPopPress'), /data-pop-follow/);
});

test('follow switches people and stops on death, missing homes, and map closure', () => {
  const { ctx, node, state } = followContext();
  ctx.popToggleFollow(node, 3);
  ctx.popToggleFollow(node, 4);
  assert.equal(ctx.popFollow.person.index, 4);
  state.gen = 2;
  ctx.popTickFollow();
  assert.equal(ctx.popFollow.person, null, 'never switches to the deceased person\'s replacement');
  ctx.popToggleFollow(node, 3);
  ctx.popState.nodeIndex.clear();
  ctx.popTickFollow();
  assert.equal(ctx.popFollow.person, null);
  ctx.popState.nodeIndex.set(node.id, node);
  ctx.popToggleFollow(node, 3);
  ctx.mapVisible = false;
  ctx.popTickFollow();
  assert.equal(ctx.popFollow.person, null);
  assert.equal(ctx.popFollow.timer, 0);
});

test('follow rebinds moving unit people and suspends camera motion under game overlays', () => {
  const { ctx, node } = followContext();
  node.id = 'c:o1|k:3|t:10|g:ut0|i:u0.4';
  ctx.popState.nodeIndex.set(node.id, node);
  ctx.popToggleFollow(node, 3);
  const moved = { ...node, id: node.id.replace('|t:10|', '|t:11|'), tile: 3 };
  ctx.popState.nodeIndex = new Map([['base:' + panel.personBaseId(node.id), moved]]);
  ctx.popTickFollow();
  assert.equal(ctx.popFollow.person.nodeId, moved.id);
  assert.equal(ctx.popFollowMatches(moved.id, 3), true);
  ctx.gameOverlayActive = () => true;
  ctx.mapPanX = 0; ctx.mapPanY = 0;
  ctx.popTickFollow();
  assert.deepEqual([ctx.mapPanX, ctx.mapPanY], [0, 0]);
});

test('following adds an outdoor walker beyond the normal crowd, then releases it without changing pins', () => {
  const group = { nodeId: 'home', entry: { population: 100 }, people: [], destinations: [0, 1] };
  const follow = { key: 'home#80', nodeId: 'home', index: 80 };
  const ctx = context(['syncPinnedWalkers'], {
    popPins: () => [], popIsPinned: () => false, popFollowMatches: () => true,
    popKeptWalking: () => [follow], personBaseId: panel.personBaseId,
    newWalker: (g, part, graph, id) => ({ id, key: `home#${id}` }),
  });
  ctx.syncPinnedWalkers(group, {}, {});
  assert.equal(group.people.length, 1);
  assert.equal(group.people[0].id, 80);
  assert.equal(group.people[0].pinned, true, 'uses the existing stay-outdoors behavior');
  ctx.popFollowMatches = () => false;
  ctx.popKeptWalking = () => [];
  ctx.syncPinnedWalkers(group, {}, {});
  assert.equal(group.people.length, 0);
});

test('command execution attaches only actually earned rewards and they survive route rebuilds', () => {
  const person = { key: 'home#0', node: 0, x: 5, y: 10 };
  const doer = { person, group: { entry: { item: {} } } };
  const ledger = { y: [], d: [], p: [] }, owed = [];
  let healthRecipient = null;
  const outcome = { amount: 0.013, yield: 'food', deaths: [], popDelta: 0, success: true, chance: 0.2, wound: 0 };
  const ctx = context(['cmdExecute', 'cmdRewardShares', 'cmdShowCompletedReward', 'cmdTickPerson'], {
    cmdConsumeInput: () => {}, cmdState: { menu: null, chosen: new Set() }, cmdCloseMenu: () => { ctx.cmdState.menu = null; },
    townWorld: {}, cmdLiveTurn: () => true, cmdCanCommand: () => true, cmdInReach: () => true,
    cmdPersonActions: () => [{ id: 'work', at: ['building'] }], actionFits: () => true,
    frames: [1], cmdNearby: () => ({ allies: 0, enemies: 0 }), cmdIsLeader: () => false,
    resolveCommand: () => outcome, cmdActedCount: () => 0, cmdActed: () => new Map(),
    cmdLedger: () => ledger, cmdRouteTo: () => [], hexW: 40, cmdCommandsLeft: () => 0,
    cmdOweYield: (...args) => owed.push(args), cmdHealthRecipient: () => healthRecipient,
    cmdSaveActed: () => {}, cmdSaveLedger: () => {}, popState: { open: false },
    YIELD_LABELS: commands.YIELD_LABELS, formatYield: commands.formatYield, yieldShare: () => 1,
    cmdToast: () => {}, cmdUpdateStatus: () => {}, cmdActedSpot: () => ({ x: 5, y: 10, dead: false }),
    cmdShowYieldPopup: (...args) => ctx.shown.push(args), shown: [],
  });
  const execute = () => {
    ctx.cmdState.menu = { target: { x: 20, y: 30, key: 'target' }, walkers: [doer] };
    ctx.cmdExecute({ id: 'work', who: [0], at: [], label: 'Work' });
  };
  execute();
  assert.deepEqual(owed, [['food', 0.013]]);
  assert.equal(person.commandReward.amount, 0.013);
  assert.equal(ctx.shown.length, 0);
  person.cmd = null;
  ctx.cmdTickPerson(person, new Map([['home#0', []]]), 0);
  person.cmd.arrived = true;
  ctx.cmdShowCompletedReward(person);
  assert.equal(ctx.shown.length, 1);
  assert.equal(ctx.shown[0][2], 0.013);
  outcome.yield = 'health';
  execute();
  assert.equal(person.commandReward, undefined, 'no healing recipient means no earned-yield popup');
  healthRecipient = { owner: 0, id: 1 };
  execute();
  assert.equal(person.commandReward.kind, 'health');
  ctx.cmdTickPerson(person, new Map(), 1);
  assert.equal(person.commandReward, undefined, 'stale turn feedback is discarded');
});
