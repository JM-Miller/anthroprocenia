import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const demography = await loadModule('anthroprocenia-demography.js');
const { personBaseId } = await loadModule('anthroprocenia-population-panel.js');
const { parseGameYear } = await loadModule('anthroprocenia-units.js');
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

// 60 turns, 10 calendar years each; a settlement at tile 5 grows on turn 20 and its tile 6 is pillaged on turn 30, where a
// badly wounded unit also stands from turn 30 on.
function world() {
  const frames = Array.from({ length: 60 }, (_, t) => [0, 0, 0, `${4000 - t * 10} BCE`]);
  const turns = frames.map((_, t) => ({ s: t === 0 ? 1 : 0, set: t === 0 ? [[5, 'Roma', 4, 1, [8]]] : t === 20 ? [[5, 'Roma', 6, 1, [12]]] : [], dmg: t === 30 ? [[6, [1]]] : [] }));
  const context = vm.createContext({
    Math, Map, Set, Array, Number, String, Object, JSON, Int8Array,
    ...demography, lifeMix: demography.mix, parseGameYear,
    frames, pos: 59, manifest: { ages: [[0], [40]] }, neighborsByIndex: { 6: [5, 7], 5: [6] }, basePos: [], curFrame: new Map(),
    readTurnCached: t => turns[t], readUnitsTurn: t => (t >= 30 ? [[6, 1, 0, 10]] : []),
    nearestSettlement: () => ({ index: 5 }),
    cmdDeathsFor: () => null, personBaseId,
    popState: { homes: new Map(), changes: new Map() },
    lifeTimeline: { frames: 0, years: [], settled: new Map(), settlements: new Map(), pillaged: new Map(), damaged: new Map(), lastYear: null, wounds: new Map(), homes: new Map(), lives: new Map() },
  });
  vm.runInContext(['resetLifeTimeline', 'lifeTimelineNow', 'lifeWounds', 'lifeEraAt', 'lifeHomeHazards', 'lifeHomeOf', 'popLife', 'popNodeChange', 'lifeHomeGrowth', 'popChangeFor'].map(slice).join('\n'), context);
  return context;
}

test('the recorded turns give life-years, settlement growth and pillaging by turn', () => {
  const context = world();
  const tl = vm.runInContext('lifeTimelineNow()', context);
  assert.equal(tl.frames, 60);
  assert.equal(tl.years[0], 0);
  assert.equal(tl.years[59], 59 * 4, 'ten calendar years a turn age people by four');
  assert.deepEqual(JSON.parse(JSON.stringify(tl.settled.get(5))), [[0, 4, 8], [20, 6, 12]]);
  assert.deepEqual(JSON.parse(JSON.stringify(tl.pillaged.get(6))), [[30, 1]]);
  const hazards = vm.runInContext('lifeHomeHazards(6, 5, 59)', context);
  assert.equal(hazards.length, 60);
  assert.ok(hazards[20].growing && !hazards[19].growing, 'the home grows on turn 20');
  assert.ok(hazards[30].pillage > 0 && hazards[29].pillage === 0, 'pillaged on turn 30');
  assert.ok(hazards[31].battle > 0 && hazards[29].battle === 0, 'battle from turn 30');
  assert.equal(vm.runInContext('lifeEraAt(50)', context), 1);
});
test('realistic replay frames age people by fractional calendar durations, not whole years per season/month', () => {
  const ctx = world();
  ctx.frames = [
    [0, 4400, 1, '400 CE', 1], [1, 1, 1, 'Spring 400 CE', 0.25],
    [1, 2, 0, 'Summer 400 CE', 0.25], [2, 1, 1, 'January 1750 CE', 1 / 12],
    [2, 2, 0, 'February 1750 CE', 1 / 12], [2, 14, 0, 'February 1751 CE', 1 / 12],
  ];
  const tl = ctx.lifeTimelineNow();
  assert.ok(Math.abs(tl.years[2] - 0.5) < 1e-12);
  assert.ok(Math.abs(tl.years[4] - 2 / 3) < 1e-12);
  assert.ok(Math.abs(tl.years[5] - 5 / 3) < 1e-12, 'skipped in-age turns still age people by the elapsed months');
});

test('a slot\'s life is the same whether reached turn by turn or all at once, and scrubbing back restarts it', () => {
  const a = world(), b = world();
  for (let t = 0; t <= 59; t++) { a.pos = t; vm.runInContext('popLife("n", 3, 6, 1)', a); }
  const stepped = vm.runInContext('popLife("n", 3, 6, 1)', a), direct = vm.runInContext('popLife("n", 3, 6, 1)', b);
  assert.equal(JSON.stringify(stepped.state), JSON.stringify(direct.state));
  assert.ok(stepped.years >= 0);
  b.pos = 10;
  const early = vm.runInContext('popLife("n", 3, 6, 1)', b);
  assert.equal(early.turn, 10);
  assert.ok(early.state.turn === 10);
  // Over sixty turns (240 life-years) everyone in a slot has died at least once.
  let generations = 0;
  for (let i = 0; i < 50; i++) generations += vm.runInContext(`popLife("n", ${i}, 6, 1)`, a).state.gen;
  assert.ok(generations >= 100, `${generations}`);
});

test('icon nodes estimate their births and deaths; upper levels add them up', () => {
  const context = world();
  context.pos = 30;
  const icon = { id: 'i', kind: 'icon', tile: 6, total: 5000, icon: { owner: 1 } };
  const occupation = { id: 'i|o', kind: 'occupation', total: 1000, home: icon };
  const tile = { id: 't', kind: 'tile', children: [icon] };
  const change = vm.runInContext('popChangeFor', context);
  const war = change(icon);
  assert.ok(war.deaths > 0 && war.births >= 0);
  assert.equal(change(occupation).deaths, Math.round(war.deaths / 5));
  assert.deepEqual(JSON.parse(JSON.stringify(change(tile))), JSON.parse(JSON.stringify(war)));
  const calm = world();
  calm.pos = 10;
  assert.ok(vm.runInContext('popChangeFor', calm)({ ...icon }).deaths < war.deaths, 'more die in war and pillaging');
  calm.pos = 20; calm.popState.changes.clear();
  const growth = vm.runInContext('popChangeFor', calm)({ ...icon });
  calm.pos = 19; calm.popState.changes.clear();
  assert.ok(growth.births > vm.runInContext('popChangeFor', calm)({ ...icon }).births, 'more are born as the city grows');
});
