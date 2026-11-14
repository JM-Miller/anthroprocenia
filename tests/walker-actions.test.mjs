import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule } from './load.mjs';

const { walkerAction, workFamily } = await loadModule('anthroprocenia-people.js');
const { populationWeight, populationVariation, POPULATION_WEIGHTS } = await loadModule('anthroprocenia-units.js');
const { stepWalker, WALKER_FADE_SECONDS } = await loadModule('anthroprocenia-townscape.js');
const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');

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

test('a walking person\'s action follows where they are going, their trade, gender and the age', () => {
  const base = { occupation: 'Custodian', gender: 'female', age: 0, seed: 'p#1|1' };
  assert.equal(walkerAction({ ...base, purpose: 'home' }), 'Heading Home');
  assert.equal(walkerAction({ ...base, purpose: 'travel', place: 'Antium' }), 'Traveling to Antium');
  assert.equal(walkerAction({ ...base, purpose: 'travel', place: '' }), 'Traveling');
  // A custodian's errands and work among the trees are a custodian's.
  const errands = new Set(), trees = new Set();
  for (let i = 0; i < 300; i++) {
    errands.add(walkerAction({ ...base, purpose: 'errand', seed: `p#${i}|1` }));
    trees.add(walkerAction({ ...base, purpose: 'tree', seed: `p#${i}|2` }));
  }
  assert.ok(errands.has('Tending to Grounds') && errands.has('Buying Supplies'), [...errands].join(', '));
  assert.ok(trees.has('Tending to Grounds') || trees.has('Pruning Trees'));
  for (const text of [...errands, ...trees]) assert.doesNotMatch(text, /\{|\}/, 'no placeholder is left in');
  // Social errands use the person's pronoun.
  const his = new Set(), hers = new Set();
  for (let i = 0; i < 400; i++) {
    his.add(walkerAction({ ...base, gender: 'male', purpose: 'stroll', seed: `s${i}` }));
    hers.add(walkerAction({ ...base, purpose: 'stroll', seed: `s${i}` }));
  }
  assert.ok([...his].some(t => / His /.test(t)) && ![...his].some(t => / Her /.test(t)));
  assert.ok([...hers].some(t => / Her /.test(t)) && ![...hers].some(t => / His /.test(t)));
  // The age changes the wording (the same seed and choice).
  const byAge = [0, 1, 2].map(age => new Set(Array.from({ length: 300 }, (_, i) => walkerAction({ ...base, gender: 'male', age, purpose: 'stroll', seed: `s${i}` }))));
  assert.ok(byAge[0].has('Going to the Baths') && byAge[2].has('Going to the Cafe') && !byAge[2].has('Going to the Baths'));
  // A resource spot names the resource; a fisherman at the river fishes.
  const resource = new Set(Array.from({ length: 50 }, (_, i) => walkerAction({ occupation: 'Miner', gender: 'male', age: 1, purpose: 'resource', place: 'Iron', seed: `r${i}` })));
  assert.ok([...resource].every(t => t.includes('Iron')), [...resource].join(', '));
  const river = new Set(Array.from({ length: 80 }, (_, i) => walkerAction({ occupation: 'Fisherman', gender: 'male', age: 1, purpose: 'river', seed: `f${i}` })));
  assert.ok(river.has('Fishing'));
  assert.equal(walkerAction({ ...base, purpose: 'errand' }), walkerAction({ ...base, purpose: 'errand' }), 'the same trip reads the same');
});

test('occupations, including women\'s titles and unlisted ones, map to kinds of work', () => {
  assert.equal(workFamily('Custodian'), 'grounds');
  assert.equal(workFamily('Priestess'), 'clergy');
  assert.equal(workFamily('Maid'), 'court');
  assert.equal(workFamily('Imam'), 'clergy');
  assert.equal(workFamily('Legionary'), 'soldier');
  assert.equal(workFamily('Something else'), 'town');
});

test('most people live in towns and cities and few on the improvements, with a spread between homes', () => {
  assert.ok(populationWeight('center') > populationWeight('urban') && populationWeight('urban') > populationWeight('unit'));
  assert.ok(populationWeight('improvement') < populationWeight('unit'));
  assert.ok(populationWeight('specialist') > populationWeight('urban'));
  assert.equal(populationWeight('unknown'), 1);
  assert.equal(POPULATION_WEIGHTS.improvement, 0.2);
  const spread = Array.from({ length: 500 }, (_, i) => populationVariation(`icon${i}`));
  assert.ok(Math.min(...spread) >= 0.59 && Math.max(...spread) <= 1.7);
  assert.ok(Math.max(...spread) / Math.min(...spread) > 2.5, 'homes differ visibly');
  assert.equal(populationVariation('a'), populationVariation('a'));
  // The world's people are shared by weight, so the weights must also be how the entities are counted.
  const count = slice('entityCountForPos');
  assert.match(count, /populationWeight\('unit'\)/);
  assert.match(count, /populationWeight\(buildingPopulationClass\(typeIndex, index, settlements\)\)/);
  assert.match(count, /populationWeight\('specialist'\)/);
  assert.match(slice('buildingPopulationClass'), /type\[2\] === 1\) return 'improvement'/);
});

test('a walker remembers where each trip is heading and stays a while at a spot', () => {
  const graph = { nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }], adj: [[1], [0]], spots: new Map([[1, { kind: 'tree', name: '' }]]) };
  const seen = [];
  const walker = { node: 0, x: 0, y: 0, route: null, leg: 0, t: 0, wait: 0, speed: 100, fade: 1 };
  stepWalker(walker, graph, 0.1, w => { seen.push(w); return 1; }, () => 0);
  assert.equal(seen[0], walker, 'the destination is picked for this walker');
  assert.equal(walker.target, 1);
  assert.equal(walker.trip, 1);
  walker.wait = 0;
  stepWalker(walker, graph, 1, () => 0, () => 0);
  assert.equal(walker.node, 1, 'arrived at the spot');
  stepWalker(walker, graph, 0, () => 0, () => 0);
  assert.ok(walker.wait >= 4 - 1e-9, `lingers at the spot (${walker.wait}s)`);
  assert.equal(walker.trip, 2);
  assert.ok(WALKER_FADE_SECONDS > 0);
});

test('clicking a person never opens the city view, and a hovered building is not outlined', () => {
  const start = slice('onMapDragStart');
  assert.match(start, /personPress = \{ time: Date\.now\(\)/);
  assert.match(start, /selectPersonFromMap\(person\); \} catch \(error\) \{ err\(`person selection failed: \$\{error\}`\); \}\s*return;/);
  assert.match(slice('mapGamepadAction'), /mousebutton-left' && personClickActive\(Cursor\.position\)\) \{[\s\S]*?event\.preventDefault\(\); event\.stopImmediatePropagation\(\); return;/);
  assert.match(slice('selectMapCity'), /if \(personClickActive\(\{ x, y \}\)\) return false;/);
  assert.match(slice('onMapHoverInner'), /if \(building\) \{ hideIconRing\(\); setTownHighlight\(null\); \}/);
  assert.match(slice('personTipText'), /personActionText\(hit, p\)/);
});

test('people head out to the spots, home, along roads and to other townscapes', () => {
  const walkers = slice('createWalkers');
  assert.match(walkers, /walker\.home >= 0 && walker\.home !== walker\.node\) return walker\.home/);
  assert.match(walkers, /group\.spots\.length\) return group\.spots/);
  assert.match(slice('newWalker'), /homeLocal: home - part\.offset/);
  assert.match(slice('syncPeople'), /person\.home = doors.get/);
  const action = slice('personActionText');
  assert.match(action, /purpose = 'home'/);
  assert.match(action, /graph\.spots\.has\(target\)/);
  assert.match(action, /roadDestinationName\(/);
});
