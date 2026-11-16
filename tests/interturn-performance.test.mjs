import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const recorder = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
function slice(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}

test('movement captures run without a debounce delay, coalesce event bursts and retain resolved-turn bookkeeping', () => {
  const callbacks = [], captures = [];
  const ctx = vm.createContext({
    started: true, lastTurnRecorded: 6, Game: { age: 0, turn: 8 },
    localRecordingTurn: () => true, frameIndex: () => 1, window: { AnthroproceniaReplay: { isVisible: () => true } },
    setTimeout: (callback, delay) => { assert.equal(delay, 0); callbacks.push(callback); return callbacks.length; },
    record: turn => { captures.push(turn); ctx.lastTurnRecorded = turn; },
    err: message => assert.fail(message),
  });
  vm.runInContext(recorder.slice(recorder.indexOf('const MID_TURN_RECORD_DELAY_MS'), recorder.indexOf('window.AnthroproceniaRequestCapture')), ctx);
  ctx.scheduleMidTurnRecord(); ctx.scheduleMidTurnRecord();
  assert.equal(callbacks.length, 1); callbacks.shift()();
  assert.deepEqual(captures, [8]); assert.equal(ctx.lastTurnRecorded, 6);
  ctx.scheduleMidTurnRecord(); callbacks.shift()();
  assert.deepEqual(captures, [8, 8]);
});

test('recorded defense health is bounded and a missing native API reports once without losing settlements', () => {
  const errors = [], districts = { getDistrictHealth: () => 25, getDistrictMaxHealth: () => 100 };
  const ctx = vm.createContext({ Players: { get: () => ({ Districts: districts }) }, err: message => errors.push(message) });
  vm.runInContext("let cityDefenseApiWarned = false;\n" + slice(recorder, 'cityDefenseHealth'), ctx);
  const city = { owner: 0, location: { x: 1, y: 1 } };
  assert.deepEqual([...ctx.cityDefenseHealth(city)], [25, 100]);
  districts.getDistrictHealth = () => 150;
  assert.deepEqual([...ctx.cityDefenseHealth(city)], [100, 100]);
  districts.getDistrictHealth = undefined;
  assert.equal(ctx.cityDefenseHealth(city), null); assert.equal(ctx.cityDefenseHealth(city), null);
  assert.equal(errors.length, 1);
});
test('AI processing stops decorative simulation and scene rebuilds without destroying the walking scene', () => {
  const world = {}, scene = {}, tasks = [];
  let redraws = 0;
  const ctx = vm.createContext({
    townInterturn: { active: true, timer: 0 }, mapVisible: true,
    lastMapInputTs: 0, syncToLatestCapture: () => false,
    townRender: { pending: false }, syncTownVisibility() {}, syncRiverDeltas() {},
    setTimeout: fn => { tasks.push(fn); return tasks.length; }, redraw: () => redraws++,
    peopleLoop: 1, syncCrowdVisibility() {}, peopleActive: () => true,
    townLayer: scene, peopleSvg: {}, townWorld: world, peopleLast: 0, nowMs: () => 123,
    stopPeople: () => assert.fail('must retain walkers across AI processing'),
    syncMapLabelVisibility() {}, terrainMarkerPaths: new Map(), unitDom: {}, dotDom: {}, wonDom: {},
    townscapeActive: () => true, bgLayer: { el: {} }, columnShiftMarkersStale: false, fogMarkersStale: false,
    ensureTownscapeLayer: () => assert.fail('must not rebuild decorative scene between turns'),
  });
  vm.runInContext(['setTownInterturn', 'peopleTick', 'syncTownscapes'].map(name => slice(playback, name)).join('\n'), ctx);
  ctx.peopleTick(); ctx.syncTownscapes();
  assert.equal(ctx.peopleLoop, 0);
  assert.equal(ctx.peopleLast, 123);
  assert.equal(ctx.townWorld, world); assert.equal(ctx.townLayer, scene);
  assert.equal(tasks.length, 0, 'no busy animation or polling loop during AI processing');
  ctx.setTownInterturn(false); ctx.setTownInterturn(false);
  assert.equal(tasks.length, 1, 'resume rebuilds coalesce and yield to native turn activation');
  tasks.shift()();
  assert.equal(redraws, 1);
  ctx.setTownInterturn(false); ctx.setTownInterturn(true);
  tasks.shift()();
  assert.equal(redraws, 1, 'a stale callback cannot restart the scene during another interturn');
  assert.match(playback, /engine.on\('LocalPlayerTurnEnd', \(\) => setTownInterturn\(true\)\)/);
  assert.match(playback, /engine.on\('LocalPlayerTurnBegin', \(\) => setTownInterturn\(false\)\)/);
});
test('age end, victory and local defeat resume replay animation without waiting for another local turn', () => {
  const handlers = new Map(), states = [];
  const ctx = vm.createContext({
    engine: { on: (name, fn) => handlers.set(name, fn) },
    GameContext: { localPlayerID: 7 }, setTownInterturn: active => states.push(active),
  });
  vm.runInContext(playback.slice(playback.indexOf("engine.on('LocalPlayerTurnEnd'"), playback.indexOf('let townLayer =')), ctx);
  handlers.get('PlayerDefeat')({ player: 3 });
  assert.deepEqual(states, [], 'a rival defeat must not restart work during AI turns');
  handlers.get('PlayerDefeat')({ playerId: 7 });
  handlers.get('GameAgeEnded')();
  handlers.get('TeamVictory')();
  assert.deepEqual(states, [false, false, false]);
});
test('pending provisional capture is canceled at turn begin while the resolved previous turn is still recorded', () => {
  const calls = [], canceled = [];
  const ctx = vm.createContext({
    started: true, midTurnTimer: 9, clearTimeout: id => canceled.push(id),
    Game: { turn: 8 }, lastTurnRecorded: 6, record: (turn, snap) => calls.push([turn, snap]),
    err: e => assert.fail(e),
  });
  vm.runInContext(slice(recorder, 'onTurnBegin'), ctx);
  ctx.onTurnBegin();
  assert.deepEqual(canceled, [9]);
  assert.deepEqual(calls, [[7, false]]);
  assert.equal(ctx.midTurnTimer, 0);
});
test('provisional scan rechecks view visibility when its delayed timer fires', () => {
  const tasks = [];
  let visible = true, captures = 0;
  const ctx = vm.createContext({
    started: true, midTurnTimer: 0, MID_TURN_RECORD_DELAY_MS: 1000,
    localRecordingTurn: () => true, window: { AnthroproceniaReplay: { isVisible: () => visible } },
    setTimeout: fn => { tasks.push(fn); return 1; }, Game: { turn: 8, age: 0 },
    frameIndex: () => 0, lastTurnRecorded: 6, record: () => captures++, err: e => assert.fail(e),
  });
  vm.runInContext(slice(recorder, 'scheduleMidTurnRecord'), ctx);
  ctx.scheduleMidTurnRecord();
  visible = false; tasks.shift()();
  assert.equal(captures, 0);
  visible = true; ctx.scheduleMidTurnRecord(); tasks.shift()();
  assert.equal(captures, 1);
  assert.equal(ctx.lastTurnRecorded, 6);
});
