import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = file => readFile(new URL(`../anthroprocenia/ui/map/${file}`, import.meta.url), 'utf8');
const load = async file => import(`data:text/javascript;base64,${Buffer.from(await read(file)).toString('base64')}`);
const persist = await load('anthroprocenia-persist.js');
const town = await load('anthroprocenia-townscape.js');
const playback = await read('anthroprocenia-playback.js');
const playbackRecorder = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');

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

// A tiny stand-in for the game's config store: values are strings, writes go through the same bridge the recorder exposes.
function makeWorld(store) {
  const counters = { generated: 0, blockedTests: 0 };
  const written = [];
  const timers = [];
  const context = vm.createContext({
    ...persist, ...town, JSON, Math, Number, String, Map, Set, Array, Object, Date, console,
    window: { AnthroproceniaViewStore: { write: (key, value) => { store.set(key, value); written.push(key); return true; } } },
    getCatalog: () => ({ getObject: () => ({ read: key => store.get(key) || null }) }),
    err: message => { throw new Error(message); },
    replayStore: { scope: () => '' },
    OBJ_VIEW: 'view', playing: false, pos: 7, frames: Array.from({ length: 8 }, (_, i) => [0, i, 1, `T${i}`]), manifest: { rev: 3, w: 180, h: 94 },
    hexW: 20, detailD: 4,
    buildingsForPos: () => new Map([[1, [1]]]), settlementsForPos: () => new Map(), wondersForPos: () => new Map(), readUnitsTurn: () => [],
    itemOwner: () => 1, identityForPos: () => new Map([[1, ['', '', '', 0, 0, 'ROME']]]), normalizedCivKey: v => v,
    unitInBattle: () => false, populationForItem: () => 900, townEraNow: () => ({ age: 1, lvl: 1 }),
    neighborsByIndex: [[], []], terrain: [8, 8], hashString: s => s.length * 31 + 7,
    generateTownscape: opts => { counters.generated++; return town.generateTownscape(opts); },
    townObstacles: () => ({ circles: [], segments: [], roads: [] }),
    townWaterfront: () => ({ decks: [], buildings: [] }),
    polygonBlocked: poly => { counters.blockedTests++; return poly[0][0] % 3 < 1; },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  vm.runInContext(`
    const townShapeCache = new Map(), townPathCache = new Map();
    const viewData = { index: null, lib: null, twKey: '', twPlace: null, sigKey: '', sig: '', errorLogged: false };
    let viewDataScope = '';
    const viewQueue = createWriteQueue((key, value) => { if (!window.AnthroproceniaViewStore.write(key, value)) throw new Error('store'); }, { delay: 3000 });
    viewQueue.onError = (key, e) => { throw e; };
  `, context);
  vm.runInContext(['viewRead', 'viewIndex', 'viewSave', 'viewFrameSignature', 'twLibrary', 'twLibGet', 'twLibPut', 'twPlacements', 'twRememberPlacement', 'townscapeFor', 'polygonPath', 'mapScaleMetrics'].map(slice).join('\n'), context);
  return { context, counters, written };
}
const item = { kind: 'building', index: 1, typeIndex: 4, dot: 2 };
const point = { item, x: 100, y: 100, s: 1 };
const summary = entry => ({ polys: entry.polys.map(p => [p.group, p.form, p.poly.map(v => v.map(n => Math.round(n * 100) / 100))]), fields: entry.paths.fields, parks: entry.paths.parks });

test('waterfront roofs remain selectable buildings even when water excludes ordinary building placement', () => {
  const world = makeWorld(new Map());
  const poly = [[10, 10], [11, 10], [11, 11], [10, 11]];
  world.context.polygonBlocked = () => true;
  world.context.townWaterfront = () => ({ decks: [poly], buildings: [{ poly, detail: [] }] });
  const entry = vm.runInContext('townscapeFor', world.context)(point);
  assert.equal(entry.polys.length, 1);
  assert.equal(entry.polys[0].form, 'dock');
  assert.equal(entry.polys[0].sourceIndex, 'dock0');
  assert.equal(entry.polys[0].group, 'store');
  assert.equal(entry.waterfront.decks.length, 1);
});

test('a townscape\'s layout and placements are saved, then retrieved after a reload without being redone', () => {
  const store = new Map();
  const first = makeWorld(store);
  const entry = vm.runInContext('townscapeFor', first.context)(point);
  assert.equal(first.counters.generated, 1);
  assert.ok(first.counters.blockedTests > 0 && entry.polys.length > 0);

  vm.runInContext('viewQueue.flush()', first.context);
  assert.ok(first.written.includes('twlib') && first.written.includes('tw7') && first.written.includes('idx'), first.written.join());
  assert.ok(store.get('tw7').length < 2000 && store.get('twlib').length > 100);
  assert.deepEqual(JSON.parse(store.get('idx')), ['tw7']);

  // a new session, same save
  const second = makeWorld(store);
  const again = vm.runInContext('townscapeFor', second.context)(point);
  assert.equal(second.counters.generated, 0, 'the layout came from the saved library');
  assert.equal(second.counters.blockedTests, 0, 'the saved placements were used');
  assert.equal(JSON.stringify(summary(again)), JSON.stringify(summary(entry)));
  vm.runInContext('viewQueue.flush()', second.context);
  assert.deepEqual(second.written, [], 'nothing needed saving again');
});

test('placements are not reused for another turn, another map zoom or another size', () => {
  const store = new Map();
  const first = makeWorld(store);
  vm.runInContext('townscapeFor', first.context)(point);
  vm.runInContext('viewQueue.flush()', first.context);

  const otherTurn = makeWorld(store);
  otherTurn.context.pos = 6;
  vm.runInContext('townscapeFor', otherTurn.context)(point);
  assert.equal(otherTurn.counters.generated, 0, 'the layout is shared between turns');
  assert.ok(otherTurn.counters.blockedTests > 0, 'but placements are worked out for the new turn');

  const otherZoom = makeWorld(store);
  otherZoom.context.hexW = 30;
  vm.runInContext('townscapeFor', otherZoom.context)(point);
  assert.ok(otherZoom.counters.blockedTests > 0);

  const changedWorld = makeWorld(store);
  changedWorld.context.buildingsForPos = () => new Map([[1, [1]], [2, [3]]]);
  vm.runInContext('townscapeFor', changedWorld.context)(point);
  assert.ok(changedWorld.counters.blockedTests > 0, 'the recorded world for that turn changed');
});

test('nothing is saved while the replay is playing, and old turns are evicted', () => {
  const store = new Map();
  const playingWorld = makeWorld(store);
  playingWorld.context.playing = true;
  vm.runInContext('townscapeFor', playingWorld.context)(point);
  vm.runInContext('viewQueue.flush()', playingWorld.context);
  assert.ok(!playingWorld.written.includes('tw7'), 'placements are not saved while playing');

  const world = makeWorld(store);
  for (let turn = 0; turn < persist.MAX_STORED_FRAMES + 5; turn++) {
    world.context.pos = turn % 8; world.context.frames = Array.from({ length: 200 }, (_, i) => [0, i, 1, `T${i}`]); world.context.pos = turn;
    vm.runInContext('townscapeFor', world.context)(point);
    vm.runInContext('viewQueue.flush()', world.context);
  }
  const index = JSON.parse(store.get('idx'));
  assert.equal(index.length, persist.MAX_STORED_FRAMES);
  assert.equal(store.get('tw0'), '', 'the oldest turn\'s record was blanked');
  assert.ok(store.get(`tw${persist.MAX_STORED_FRAMES + 4}`).length > 2);
});

test('saving is wired into the game: bridge, save hook, reset on a new game, background panel save', () => {
  const recorder = playbackRecorder;
  assert.match(recorder, /AnthroproceniaViewStore/);
  assert.match(recorder, /'twlib'/);
  assert.match(recorder, /anthroprocenia-view-data-cleared/);
  assert.match(playback, /engine\.on\('StartSaveRequest', \(\) => \{ try \{ viewQueue\.flush\(\)/);
  assert.match(playback, /engine\.on\('LoadComplete', resetViewData\)/);
  assert.match(playback, /engine\.on\('GameStarted', resetViewData\)/);
  assert.match(slice('syncPopulationUi'), /popBackgroundSave\(\)/);
  assert.match(slice('townscapeFor'), /twLibGet\(geoKey\)/);
  assert.match(slice('townscapeFor'), /decodePlacement\(/);
});

test('dense layout libraries are bounded before delayed writes, even while replay saving is disabled', () => {
  const world = makeWorld(new Map()), ctx = world.context;
  ctx.playing = true;
  const shapes = town.generateTownscape({ seed: 7, civKey: 'ROME', population: 100000, kind: 'town', age: 2, lvl: 3 });
  assert.equal(shapes.buildings.length, 1000);
  for (let i = 0; i < 80; i++) {
    ctx.twLibPut(`dense-${i}`, shapes);
    const lib = vm.runInContext('viewData.lib', ctx);
    assert.ok(lib.size <= persist.MAX_LIBRARY_ENTRIES);
    assert.ok(lib.size === 1 || JSON.stringify([...lib]).length <= persist.MAX_RECORD_CHARS * 0.9);
  }
  assert.equal(world.written.length, 0, 'memory bounds do not depend on saving or flushing');
  assert.ok(ctx.twLibGet('dense-79'));
  const lib = vm.runInContext('viewData.lib', ctx);
  assert.ok(!lib.has('dense-0'));
});

test('panning across 120 dense homes retains only one decoded scene and a bounded encoded library', () => {
  const world = makeWorld(new Map()), ctx = world.context;
  ctx.playing = true; ctx.hexH = 115; ctx.mapPxW = 100000;
  ctx.populationForItem = () => 100000;
  ctx.hashString = text => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  vm.runInContext('const townEntryCache = new Map();', ctx);
  vm.runInContext(slice('townscapeCached'), ctx);
  for (let i = 0; i < 120; i++) {
    const entry = ctx.townscapeCached({ item: { ...item, typeIndex: i, dot: 0 }, x: i * 10, y: 0 });
    assert.equal(entry.shapes.buildings.length, 1000);
    assert.ok(entry.polys.length <= 1000, 'offscreen caches retain unsplit roofs, not four copies of every footprint');
    assert.ok(vm.runInContext('townEntryCache.size <= 24 && townShapeCache.size <= 24 && townPathCache.size <= 24', ctx));
  }
  assert.equal(world.counters.generated, 120);
});
