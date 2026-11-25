import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const { createReplayStore, replayStorageScope } = await loadModule('anthroprocenia-storage.js');
const prefix = 'CivAnthroprocenia__';
function fixture() {
  const values = new Map(), writes = [];
  const game = { isAnyMultiplayer: true, getValue: key => values.get(key), setValue: (key, value) => { values.set(key, value); writes.push([key, value]); } };
  const config = { getGame: () => game, editGame: () => game };
  return { values, writes, game, store: id => createReplayStore(() => config, () => ({ localObserverID: id })) };
}

test('two clients retain independent fog, replay manifests, names and command queues in one save', () => {
  const f = fixture(), a = f.store(1), b = f.store(2);
  for (const key of ['meta_index', 'turns_t0', 'label_names', 'view_yreq', 'view_cmda', 'view_twlib']) {
    a.write(prefix + key, 'player one'); b.write(prefix + key, 'player two');
    assert.equal(a.read(prefix + key), 'player one');
    assert.equal(b.read(prefix + key), 'player two');
    assert.equal(f.store(1).read(prefix + key), 'player one', 'reload retains observer ownership');
    a.write(prefix + key, '');
    assert.equal(b.read(prefix + key), 'player two', 'clearing one history cannot clear another');
  }
});

test('ambiguous multiplayer legacy data is never adopted; single-player saves remain compatible', () => {
  const f = fixture(), store = f.store(3), key = prefix + 'turns_t0';
  f.values.set(key, 'another observer');
  f.values.set('CivRewind__turns_t0', 'legacy observer');
  assert.equal(store.read(key), undefined);
  f.game.isAnyMultiplayer = false;
  assert.equal(store.read(key), 'another observer');
  f.values.set(key, '');
  assert.equal(store.read(key), 'legacy observer');
});

test('unknown multiplayer state and invalid observers fail closed before any storage writes', () => {
  const f = fixture(), store = f.store(-1);
  assert.throws(() => store.write(prefix + 'meta_index', 'x'), /observer is unavailable/);
  assert.throws(() => replayStorageScope({}, { localObserverID: 0 }), /Multiplayer status/);
  f.game.isAnyMultiplayer = false; f.game.isHotseat = true;
  assert.throws(() => store.read(prefix + 'meta_index'), /observer is unavailable/);
  assert.deepEqual(f.writes, []);
});

test('unchanged frame payloads avoid all native writes; failed writes can be retried and cache reset permits reload', () => {
  const f = fixture(), store = f.store(0);
  const keys = ['turns_t0', 'units_u0', 'suze_s0', 'players_p0', 'meta_index'];
  for (let pass = 0; pass < 100; pass++) for (const key of keys) store.write(prefix + key, key);
  assert.equal(f.writes.length, 5, '495 redundant native configuration writes eliminated');
  store.clear(); store.write(prefix + 'meta_index', 'meta_index');
  assert.equal(f.writes.length, 6);
  const nativeSet = f.game.setValue;
  f.game.setValue = () => { throw new Error('write failed'); };
  assert.throws(() => store.write(prefix + 'meta_index', 'changed'), /write failed/);
  f.game.setValue = nativeSet;
  store.write(prefix + 'meta_index', 'changed');
  assert.equal(f.writes.length, 7);
});

test('identical nonempty pinned deltas do not invalidate playback, but changed payloads and new frames do', async () => {
  const source = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
  const start = source.indexOf('function capturePayloadChanged('), end = source.indexOf('\n}', start) + 2;
  const ctx = vm.createContext({});
  vm.runInContext('let lastPayloadGi = -1, lastCapturePayloads = [];\n' + source.slice(start, end), ctx);
  const payloads = ['{"terr":[1234]}', '{"u":[4321]}', '{"s":[]}', '{"idd":[[0,"Rome"]]}'];
  assert.equal(ctx.capturePayloadChanged(1, payloads), true);
  assert.equal(ctx.capturePayloadChanged(1, [...payloads]), false);
  assert.equal(ctx.capturePayloadChanged(1, [...payloads.slice(0, 3), '{"met":[0,1]}']), true);
  assert.equal(ctx.capturePayloadChanged(2, payloads), true);
});

test('queued view writes cannot cross an observer handoff, and the previous observer scene closes', async () => {
  const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  const writes = [], closed = [];
  const ctx = vm.createContext({
    viewDataScope: 'observer1__', replayStore: { scope: () => 'observer1__' },
    window: { AnthroproceniaViewStore: { write: (key, value) => { writes.push([key, value]); return true; } } },
    createWriteQueue: write => { ctx.write = write; return {}; },
    closePanel: showMini => closed.push(showMini),
    resetViewData: () => { ctx.viewDataScope = null; },
    prebuilt: true, lastRecordingFp: 'old', curFrame: {}, manifest: {}, frames: [1], builtFrameCount: 'old',
    err: message => assert.fail(message),
  });
  const start = source.indexOf('const viewQueue = createWriteQueue('), end = source.indexOf('\nviewQueue.onError', start);
  const handoffStart = source.indexOf('function invalidateReplayObserver('), handoffEnd = source.indexOf('\n}', handoffStart) + 2;
  vm.runInContext(source.slice(start, end) + '\n' + source.slice(handoffStart, handoffEnd), ctx);
  ctx.write('idx', 'one');
  ctx.invalidateReplayObserver(); assert.deepEqual(closed, []);
  ctx.replayStore.scope = () => 'observer2__';
  assert.throws(() => ctx.write('idx', 'old queued data'), /observer changed/);
  assert.deepEqual(writes, [['idx', 'one']]);
  ctx.invalidateReplayObserver();
  assert.deepEqual(closed, [false], 'do not briefly show the old minimap during hotseat handoff');
  assert.equal(ctx.prebuilt, false);
  assert.equal(ctx.curFrame, null);
  assert.equal(ctx.manifest, null);
  assert.equal(ctx.frames.length, 0);
  assert.equal(ctx.viewDataScope, 'observer2__');
});

test('actual captures retain pinned deltas, avoid duplicate writes/rebuilds and advance resolved frames', async () => {
  const source = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
  const f = fixture(), store = f.store(0);
  let owner = 0, staticReads = 0;
  const ctx = vm.createContext({
    Date, Game: { age: 0, turn: 1 }, manifest: { frames: [], ages: [] }, recordedAges: new Set(),
    OBJ_TURNS: 'turns', OBJ_UNITS: 'units', OBJ_SUZE: 'suze', OBJ_PLAYERS: 'players',
    createCaptureReads: () => ({}), currentRealisticDate: () => '', currentAgeName: () => 'Antiquity',
    readTiles: () => ({ owner: new Int16Array([owner]), cls: new Int8Array([1]) }),
    packTerr: (i, owner, cls) => i * 1024 + (owner + 1) * 8 + cls,
    buildingsDelta: () => [[0, [1]]], damagedDelta: () => [], settlementsDelta: () => [],
    readVisibility: () => [2], visibilityDelta: () => [2], wondersDelta: () => [],
    readUnits: () => ({ u: [10] }), readSuzerain: () => [], identityDelta: () => [[0, 'Rome']],
    readSociety: () => [], relationshipsDelta: () => [], ensureVictoryTypes() {},
    readVictoryPoints: () => [], readMet: () => [0],
    getCatalog: () => ({ getObject: id => ({ write: (key, value) => store.write(prefix + id + '_' + key, value) }) }),
    saveManifest: () => store.write(prefix + 'meta_index', JSON.stringify(ctx.manifest)),
    captureTerrain: () => staticReads++, captureMapFeatures: () => staticReads++,
    captureMapDetailSnapshot: () => staticReads++, captureResources: () => staticReads++,
    window: { dispatchEvent() {} }, Event: class {}, console, log() {}, err: message => assert.fail(message),
    prevOwner: null, prevCls: null, prevVis: null, baseOwner: null, baseCls: null, baseVis: null,
    lastRecordedGi: -1, lastTurnRecorded: -1, lastPayloadGi: -1, lastCapturePayloads: [],
  });
  for (const name of ['prevBuildings', 'prevSettlements', 'prevWonders', 'prevDamaged', 'prevIdentity', 'prevRelationships',
    'baseBuildings', 'baseSettlements', 'baseWonders', 'baseDamaged', 'baseIdentity', 'baseRelationships', 'lastUnitPlot', 'baseUnitPlot']) ctx[name] = new Map();
  ctx.frameIndex = (age, turn) => {
    for (const row of ctx.manifest.frames) ctx.recordedAges.add(row[0]);
    return ctx.manifest.frames.findIndex(row => row[0] === age && row[1] === turn);
  };
  vm.runInContext(source.slice(source.indexOf('function record('), source.indexOf('// --- lifecycle')), ctx);
  ctx.record(0, true);
  assert.equal(staticReads, 4);
  const firstWrites = f.writes.length, firstRevision = ctx.manifest.rev;
  for (let i = 0; i < 20; i++) ctx.record(0, false);
  assert.equal(f.writes.length, firstWrites);
  assert.equal(ctx.manifest.rev, firstRevision);
  assert.equal(staticReads, 4);
  owner = 1;
  ctx.record(1, false);
  const delta = JSON.parse(store.read(prefix + 'turns_t1'));
  assert.equal(delta.s, 0);
  assert.deepEqual(delta.terr, [17]);
  const secondWrites = f.writes.length, secondRevision = ctx.manifest.rev;
  ctx.record(1, false);
  assert.equal(f.writes.length, secondWrites);
  assert.equal(ctx.manifest.rev, secondRevision);
  assert.deepEqual(JSON.parse(store.read(prefix + 'turns_t1')).terr, [17]);
  ctx.record(2, false);
  assert.equal(ctx.manifest.frames.length, 3);
  assert.equal(ctx.lastTurnRecorded, 2);
});
