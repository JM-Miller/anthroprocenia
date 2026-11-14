import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const calendar = await loadModule('anthroprocenia-calendar.js');
const demo = await loadModule('anthroprocenia-demography.js');
const root = new URL('../anthroprocenia/', import.meta.url);
const sql = await readFile(new URL('data/realistic-calendar.sql', root), 'utf8');
const recorder = await readFile(new URL('ui/history/anthroprocenia-recorder.js', root), 'utf8');
test('realistic calendar action groups load for every age', async () => {
  const manifest = await readFile(new URL('anthroprocenia.modinfo', root), 'utf8');
  const active = manifest.replace(/<!--[\s\S]*?-->/g, '');
  for (const age of ['antiquity', 'exploration', 'modern']) {
    assert.ok(manifest.includes(`id="realistic-${age}"`), 'preserved action wiring');
    assert.ok(active.includes(`id="realistic-${age}"`), 'loaded into gameplay');
    assert.match(await readFile(new URL(`data/calendar-${age}.sql`, root), 'utf8'), /INSERT/);
  }
  assert.ok(active.includes('<Item>data/realistic-calendar.sql</Item>'));
  assert.ok(active.includes('<Item>config/RealisticSpeed.sql</Item>'), 'retain the existing speed-choice restriction');
  assert.match(sql, /ANTHRO_REALISTIC_CALENDAR/);
});

test('native games do not get realistic dates or fractional life-year metadata', async () => {
  const ctx = vm.createContext({
    GameInfo: { GlobalParameters: { lookup: () => undefined } },
  });
  const source = await readFile(new URL('ui/map/anthroprocenia-calendar.js', root), 'utf8');
  vm.runInContext(source.replace(/^export /gm, ''), ctx);
  assert.equal(ctx.realisticCalendarEnabled(), false);
  assert.equal(ctx.currentRealisticDate(50), null);
  assert.match(recorder, /if \(realistic\) manifest\.frames\[gi\]\.push/);
});
function slice(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
test('realistic dates include annual BCE/CE, four seasons, and twelve full months without year zero', () => {
  for (const [age, turn, date] of [
    ['AGE_ANTIQUITY', 0, '4000 BCE'], ['AGE_ANTIQUITY', 1, '4000 BCE'],
    ['AGE_ANTIQUITY', 4000, '1 BCE'], ['AGE_ANTIQUITY', 4001, '1 CE'], ['AGE_ANTIQUITY', 4400, '400 CE'],
    ['AGE_EXPLORATION', 1, 'Spring 400 CE'], ['AGE_EXPLORATION', 2, 'Summer 400 CE'],
    ['AGE_EXPLORATION', 3, 'Autumn 400 CE'], ['AGE_EXPLORATION', 4, 'Winter 400 CE'],
    ['AGE_EXPLORATION', 5400, 'Winter 1749 CE'],
    ['AGE_MODERN', 1, 'January 1750 CE'], ['AGE_MODERN', 2, 'February 1750 CE'],
    ['AGE_MODERN', 12, 'December 1750 CE'], ['AGE_MODERN', 13, 'January 1751 CE'],
    ['AGE_MODERN', 2400, 'December 1949 CE'],
  ]) assert.equal(calendar.realisticDate(age, turn), date);
  assert.throws(() => calendar.realisticDate('unknown', 1), /Invalid/);
  assert.throws(() => calendar.realisticDate('AGE_MODERN', NaN), /Invalid/);
});

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE GlobalParameters(Name TEXT PRIMARY KEY,Value TEXT);
    CREATE TABLE GameSpeeds(GameSpeedType TEXT PRIMARY KEY,Name TEXT,Description TEXT,CostMultiplier INTEGER DEFAULT 100);
    CREATE TABLE GameSpeed_Turns(Age TEXT,GameSpeedType TEXT,MonthIncrement INTEGER,TurnsPerIncrement INTEGER);
    CREATE TABLE AgeProgressions(AgeProgressionType TEXT PRIMARY KEY,AgeType TEXT,EndsAge INTEGER,MaxPoints_Abbreviated INTEGER,MaxPoints_Standard INTEGER,MaxPoints_Long INTEGER);
    CREATE TABLE AgeProgressionTurns(AgeProgressionTurnType TEXT,AgeProgressionType TEXT,Points INTEGER,GameSpeedScaling INTEGER);
    CREATE TABLE AgeProgressionEvents(AgeProgressionEventType TEXT,AgeProgressionType TEXT,Points INTEGER,GameSpeedScaling INTEGER);
    CREATE TABLE AgeProgressionEventMapSizeOverrides(AgeProgressionEventType TEXT,Points INTEGER);
    CREATE TABLE ProgressionTrees(ProgressionTreeType TEXT PRIMARY KEY,SystemType TEXT,CostProgressionModel TEXT,CostProgressionParam1 INTEGER);
    CREATE TABLE ProgressionTreeNodes(ProgressionTreeNodeType TEXT PRIMARY KEY,ProgressionTree TEXT,Cost INTEGER,RepeatableCostProgressionModel TEXT,RepeatableCostProgressionParam1 INTEGER);
    CREATE TABLE ProgressionTreePrereqs(Node TEXT,PrereqNode TEXT);
    INSERT INTO GameSpeeds(GameSpeedType,Name) VALUES ('GAMESPEED_STANDARD','Standard'),('GAMESPEED_ONLINE','Online');
    INSERT INTO ProgressionTrees VALUES ('science','SYSTEM_TECH','NO_COST_PROGRESSION',500),('culture','SYSTEM_CULTURE','COST_PROGRESSION_PREVIOUS_COPIES',100),('other','SYSTEM_OTHER','NO_COST_PROGRESSION',0);
    INSERT INTO ProgressionTreeNodes VALUES ('tech','science',140,'COST_PROGRESSION_PREVIOUS_COPIES',280),
      ('civic','culture',70,'NO_COST_PROGRESSION',500),('other','other',10,'NO_COST_PROGRESSION',0);
  `);
  return db;
}
for (const [age, file, turns, months] of [
  ['AGE_ANTIQUITY', 'antiquity', 4400, 12], ['AGE_EXPLORATION', 'exploration', 5400, 3], ['AGE_MODERN', 'modern', 2400, 1],
]) test(`${age} SQL fixes the turn budget and scales only research/civics/celebrations`, async () => {
  const db = database();
  try {
    db.prepare('INSERT INTO AgeProgressions VALUES (?,?,1,120,140,160)').run('end', age);
    db.prepare('INSERT INTO AgeProgressions VALUES (?,?,0,10,20,30)').run('other', age);
    db.exec(`INSERT INTO AgeProgressionTurns VALUES ('AGE_PROGRESSION_PER_TURN_BASE','end',1,1),('extra','end',3,1),('other','other',2,1);
      INSERT INTO AgeProgressionEvents VALUES ('milestone','end',5,1),('other','other',2,1);
      INSERT INTO AgeProgressionEventMapSizeOverrides VALUES ('milestone',8),('other',2);
      INSERT INTO GlobalParameters VALUES ('GOLDEN_AGE_HAPPINESS_CURVE_C','80');`);
    db.exec(await readFile(new URL(`data/calendar-${file}.sql`, root), 'utf8'));
    db.exec(sql);
    const timer = db.prepare("SELECT * FROM AgeProgressions WHERE AgeProgressionType='end'").get();
    assert.deepEqual([timer.MaxPoints_Abbreviated, timer.MaxPoints_Standard, timer.MaxPoints_Long], [turns, turns, turns]);
    assert.deepEqual([...Object.values(db.prepare("SELECT MonthIncrement,TurnsPerIncrement FROM GameSpeed_Turns WHERE Age=?").get(age))], [months, turns]);
    assert.equal(db.prepare("SELECT SUM(Points) n FROM AgeProgressionTurns WHERE AgeProgressionType='end'").get().n, 1);
    assert.equal(db.prepare("SELECT Points FROM AgeProgressionEvents WHERE AgeProgressionEventType='milestone'").get().Points, 0);
    assert.equal(db.prepare("SELECT Points FROM AgeProgressionEventMapSizeOverrides WHERE AgeProgressionEventType='milestone'").get().Points, 0);
    assert.equal(db.prepare("SELECT Points FROM AgeProgressionEvents WHERE AgeProgressionEventType='other'").get().Points, 2);
    assert.equal(db.prepare("SELECT Cost FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType='tech'").get().Cost, turns);
    assert.equal(db.prepare("SELECT RepeatableCostProgressionParam1 n FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType='tech'").get().n, turns * 2);
    assert.equal(db.prepare("SELECT RepeatableCostProgressionParam1 n FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType='civic'").get().n, 500);
    assert.equal(db.prepare("SELECT Cost FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType='other'").get().Cost, 10);
    assert.equal(db.prepare("SELECT CostMultiplier FROM GameSpeeds WHERE GameSpeedType='GAMESPEED_STANDARD'").get().CostMultiplier, 100);
    const param = name => Number(db.prepare('SELECT Value FROM GlobalParameters WHERE Name=?').get(name).Value);
    assert.equal(param('GOLDEN_AGE_DURATION_IN_TURNS'), Math.round(6 * turns / 140));
    assert.ok(Math.abs(param('GOLDEN_AGE_HAPPINESS_CURVE_C') - 80 * turns / 140) < 1e-8);
    assert.ok(Math.abs(param('GOLDEN_AGE_HAPPINESS_CURVE_B') - turns) < 1e-8);
  } finally { db.close(); }
});
test('Agriculture and Chiefdom cost one tenth of the previous scaled cost without changing successor tiers', async () => {
  const db = database();
  try {
    db.exec(`INSERT INTO ProgressionTreeNodes(ProgressionTreeNodeType,ProgressionTree,Cost) VALUES
      ('NODE_TECH_AQ_AGRICULTURE','science',1),('pottery','science',70),('sailing','science',70),
      ('NODE_CIVIC_AQ_MAIN_CHIEFDOM','culture',90),('mysticism','culture',125),('discipline','culture',125);
      INSERT INTO ProgressionTreePrereqs VALUES ('pottery','NODE_TECH_AQ_AGRICULTURE'),('sailing','NODE_TECH_AQ_AGRICULTURE'),
      ('mysticism','NODE_CIVIC_AQ_MAIN_CHIEFDOM'),('discipline','NODE_CIVIC_AQ_MAIN_CHIEFDOM');`);
    db.exec(await readFile(new URL('data/calendar-antiquity.sql', root), 'utf8'));
    db.exec(sql);
    const cost = id => db.prepare('SELECT Cost FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=?').get(id).Cost;
    assert.equal(cost('NODE_TECH_AQ_AGRICULTURE'), 220);
    assert.equal(cost('NODE_CIVIC_AQ_MAIN_CHIEFDOM'), 393);
    assert.equal(cost('pottery'), 2200);
    assert.equal(cost('mysticism'), 3929);
  } finally { db.close(); }
});
test('shell setup offers only Realistic and resets both single-player and multiplayer defaults', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE GameSpeeds(Domain TEXT,GameSpeedType TEXT,Name TEXT,Description TEXT);
      CREATE TABLE Parameters(Key1 TEXT,ParameterID TEXT,DefaultValue TEXT);
      INSERT INTO GameSpeeds VALUES ('StandardGameSpeeds','GAMESPEED_STANDARD','Standard',''),('StandardGameSpeeds','GAMESPEED_ONLINE','Online','');
      INSERT INTO Parameters VALUES ('SP','GameSpeeds','GAMESPEED_STANDARD'),('MP','GameSpeeds','GAMESPEED_ONLINE');`);
    db.exec(await readFile(new URL('config/RealisticSpeed.sql', root), 'utf8'));
    const speeds = db.prepare('SELECT GameSpeedType,Name FROM GameSpeeds').all();
    assert.equal(speeds.length, 1);
    assert.equal(speeds[0].Name, 'LOC_ANTHRO_REALISTIC_SPEED');
    assert.ok(db.prepare('SELECT DefaultValue FROM Parameters').all().every(row => row.DefaultValue === 'GAMESPEED_STANDARD'));
  } finally { db.close(); }
});
test('recorder lookup indexes long histories incrementally and invalidates when histories are replaced or cleared', () => {
  const frames = Array.from({ length: 12600 }, (_, i) => [0, i, 0, '']);
  const ctx = vm.createContext({ manifest: { frames } });
  vm.runInContext(`let indexedFrames=null,indexedLength=0; const frameIndices=new Map(),recordedAges=new Set(); ${slice(recorder, 'frameIndex')}`, ctx);
  assert.equal(ctx.frameIndex(0, 12599), 12599);
  assert.equal(vm.runInContext('indexedLength', ctx), frames.length);
  frames.push([1, 1, 1, '']);
  assert.equal(ctx.frameIndex(1, 1), 12600);
  assert.equal(ctx.frameIndex(1, 2), -1);
  ctx.manifest.frames = [[2, 1, 1, '']];
  assert.equal(ctx.frameIndex(0, 12599), -1);
  assert.equal(ctx.frameIndex(2, 1), 0);
  ctx.manifest.frames.length = 0;
  assert.equal(ctx.frameIndex(2, 1), -1);
});
test('AI turns and closed map views skip provisional scans while visible local turns still schedule them', () => {
  let active = false, calls = 0;
  let visible = false;
  const ctx = vm.createContext({
    Players: { get: () => ({ isTurnActive: active }) }, GameContext: { localPlayerID: 0 },
    started: true, midTurnTimer: null, MID_TURN_RECORD_DELAY_MS: 1000, setTimeout: () => ++calls,
    window: { AnthroproceniaReplay: { isVisible: () => visible } },
  });
  vm.runInContext(['localRecordingTurn', 'scheduleMidTurnRecord'].map(name => slice(recorder, name)).join('\n'), ctx);
  ctx.scheduleMidTurnRecord(); assert.equal(calls, 0);
  active = true; ctx.scheduleMidTurnRecord(); assert.equal(calls, 0);
  visible = true; ctx.scheduleMidTurnRecord(); assert.equal(calls, 1);
  ctx.scheduleMidTurnRecord(); assert.equal(calls, 1, 'events coalesce');
  assert.match(slice(recorder, 'record'), /currentRealisticDate\(turn\)/, 'the recorded turn, not Game.turn, supplies its label');
});
test('fractional life-years reduce time-based disease while battle and pillage remain event-based', () => {
  const input = { size: 10, prevSize: 10, era: 0, outbreak: 1, wounds: [[0, 0.5]], pillagedHere: true };
  const annual = demo.homeHazard(input), monthly = demo.homeHazard({ ...input, years: 1 / 12 });
  assert.ok(Math.abs(monthly.disease * 12 - annual.disease) < 1e-12);
  assert.equal(monthly.battle, annual.battle);
  assert.equal(monthly.pillage, annual.pillage);
});
test('calendar HUD handles delayed body creation and age/turn events without replacing the native date API', async () => {
  const hud = await readFile(new URL('ui/history/anthroprocenia-calendar-hud.js', root), 'utf8');
  const tasks = [], events = {}, ready = {}, element = { textContent: 'native' };
  let observed = false, listener;
  const nativeDate = () => 'native date';
  const ctx = vm.createContext({
    Game: { turn: 1, getTurnDate: nativeDate }, engine: { on: (name, fn) => { events[name] = fn; } },
    document: { body: null, querySelectorAll: () => [element], addEventListener: (name, fn) => { ready[name] = fn; } },
    MutationObserver: class {
      constructor(fn) { listener = fn; }
      observe() { observed = true; }
    },
    currentRealisticDate: turn => calendar.realisticDate('AGE_MODERN', turn),
    realisticCalendarEnabled: () => true,
    setTimeout: fn => tasks.push(fn), console: { error: e => assert.fail(e) },
  });
  vm.runInContext(hud.replace(/^import[^\n]+\n/, ''), ctx);
  assert.equal(observed, false);
  ctx.document.body = {}; ready.DOMContentLoaded(); assert.equal(observed, true);
  while (tasks.length) tasks.shift()();
  assert.equal(element.textContent, 'January 1750 CE');
  ctx.Game.turn = 12; events.LocalPlayerTurnBegin(); events.GameAgeChanged();
  assert.equal(tasks.length, 1, 'HUD refreshes coalesce');
  tasks.shift()(); assert.equal(element.textContent, 'December 1750 CE');
  element.textContent = 'native again';
  listener([{ type: 'childList', addedNodes: [], target: { nodeType: 1, matches: () => true } }]);
  tasks.shift()(); assert.equal(element.textContent, 'December 1750 CE');
  assert.equal(ctx.Game.getTurnDate, nativeDate);
  listener([{ type: 'childList', addedNodes: [{ nodeType: 1 }, { nodeType: 3 }], target: { nodeType: 1 } }]);
  assert.equal(tasks.length, 0, 'native UI wrappers without Element methods are safe');
  listener([{ type: 'childList', addedNodes: [{ nodeType: 1, querySelector: () => element }], target: { nodeType: 1 } }]);
  assert.equal(tasks.length, 1, 'descendant date elements still trigger updates without matches');
});

test('inactive calendar never observes map DOM mutations and can activate on a later game load', async () => {
  const hud = await readFile(new URL('ui/history/anthroprocenia-calendar-hud.js', root), 'utf8');
  let enabled = false, observations = 0;
  const tasks = [], events = {};
  const ctx = vm.createContext({
    Game: { turn: 1 }, engine: { on: (name, fn) => { events[name] = fn; } },
    document: { body: {}, querySelectorAll: () => [] },
    MutationObserver: class { observe() { observations++; } },
    realisticCalendarEnabled: () => enabled, currentRealisticDate: () => null,
    setTimeout: fn => tasks.push(fn), console: { error: e => assert.fail(e) },
  });
  vm.runInContext(hud.replace(/^import[^\n]+\n/, ''), ctx);
  while (tasks.length) tasks.shift()();
  events.LoadComplete();
  assert.equal(observations, 0);
  while (tasks.length) tasks.shift()();
  enabled = true; events.GameStarted(); events.LoadComplete();
  assert.equal(observations, 1);
});
