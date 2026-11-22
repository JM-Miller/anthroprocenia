import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';
const { CivilizationTimeline, LiveTimelineFeed, familyEvents, groupTimelineEvents } = await loadModule('anthroprocenia-timeline.js');
const territory = (plot, owner) => plot * 1024 + (owner + 1) * 8;
test('combined history shares one world model, covers every recorded civilization, and does not duplicate wars or invent contacts', () => {
  const model = new CivilizationTimeline(null), date = turn => [0, turn + 1, turn ? 0 : 1, '4999 BCE'];
  const identity = (id, name) => [id, 'Leader', name, name, 0, 0, name, '', 'Chiefdom'];
  const extra = { buildingName: () => 'Granary' };
  model.observe(0, date(0), { s: 1, terr: [territory(0, 0), territory(1, 1)], set: [[0, 'Rome', 1, 'Town'], [1, 'Carthage', 1, 'Town']], bld: [[1, [1]]] },
    { idd: [identity(0, 'Romans'), identity(1, 'Carthaginians'), identity(2, 'Gauls')], soc: [[0, [], false, false], [1, [], false, false]], rel: [[0, 1, 0]], met: [0] }, x => x, () => 'War of the Plains', extra);
  const before = model.clone();
  const observe = timeline => timeline.observe(1, date(1), { bld: [[0, [1]], [1, []]], set: [[1, 'Carthage', 2, 'Town']], terr: [territory(2, 1)] },
    { soc: [[0, [1], false, false], [1, [2], true, false]], rel: [[0, 1, 4], [1, 2, 0]], met: [0, 1, 2] }, x => 'Technology ' + x, () => 'War of the Plains', extra);
  observe(model);
  const text = model.events.map(e => e.text).join('\n');
  for (const pattern of [/Rome \(Romans\)/, /Carthage \(Carthaginians\)/, /Romans developed their Granary infrastructure/, /Carthaginians lost part of their Granary infrastructure/, /Romans mastered Technology 1/, /Carthaginians mastered Technology 2/, /Carthaginians began a celebration/]) assert.match(text, pattern);
  assert.equal(model.events.filter(e => /War of the Plains/.test(e.text)).length, 1);
  assert.equal(model.events.filter(e => /first contact/.test(e.text)).length, 1, 'only a recorded new relationship proves third-party first contact');
  assert.equal(before.tileCounts.get(1), 1); assert.equal(before.societies.get(1).discoveries.size, 0);
  observe(before);
  assert.deepEqual(before.events, model.events, 'provisional observation clones do not contaminate the committed model');
});
test('recorded milestones include construction, wonders, growth, yields, pillaging, contact, celebrations, crises and suzerainty', () => {
  const model = new CivilizationTimeline(0), date = turn => [0, turn + 1, turn ? 0 : 1, `${4000 - turn} BCE`];
  const name = id => 'Discovery ' + id, war = () => 'War';
  const extra = suzerains => ({ suzerains, buildingName: () => 'Granary', wonderName: () => 'Pyramids' });
  model.observe(0, date(0), { s: 1, terr: [territory(0, 0)], set: [[0, 'York', 1, 'Town', [5]]], bld: [[0, [1]]], won: [], dmg: [] },
    { met: [0], soc: [[0, [], false, false]] }, name, war, extra([]));
  const initial = model.clone();
  model.observe(1, date(1), { terr: [territory(1, 0)], set: [[0, 'York', 2, 'City', [22]]], bld: [[0, [1, 2]]], won: [[0, 0, 1]], dmg: [[0, [2]]] },
    { met: [0, 1], soc: [[0, [1], true, true]], rel: [[0, 1, 1]] }, name, war, extra([[5, 0]]));
  const text = model.events.map(e => e.text).join('\n');
  for (const pattern of [/expanded their territory/, /population grew/, /became City/, /food-related workforce changed/, /developed their Granary infrastructure/, /completed Pyramids/, /suffered pillaging/, /first contact/, /began a celebration/, /entered an Age crisis/, /became suzerain/, /became friendly/]) assert.match(text, pattern);
  assert.ok(model.events.every(event => event.details && !event.details.startsWith('Source:')), 'each milestone has its own narrative description');
  assert.ok(new Set(model.events.map(event => event.details)).size > 10, 'descriptions vary with the observed event');
  assert.equal(initial.events.length, 1); assert.equal(initial.tileCount, 1);
  for (const event of model.events.filter(event => /population|became City|harvests|infrastructure|Pyramids|pillaging/.test(event.text))) assert.deepEqual(event.plots, [0]);
  assert.deepEqual(model.events.find(event => /expanded their territory/.test(event.text)).plots, [1]);
  for (const event of model.events.filter(event => /first contact|celebration|crisis|suzerain|friendly|mastered/.test(event.text))) assert.deepEqual(event.plots, [], 'nonlocal events never invent plot locations');
  assert.deepEqual(initial.buildings.get(0), [1]); assert.equal(initial.wonders.size, 0);
});
test('date groups retain every same-date event in order, never merging distinct undated events', () => {
  const events = [
    { turn: 0, date: '4000 BCE', text: 'Founded', plots: [8] },
    { turn: 0, date: '4000 BCE', text: 'Contact' },
    { turn: 1, date: '3999 BCE', text: 'Construction', details: 'Full narrative' },
    { text: 'Unknown date' }, { text: 'Another unknown date' },
  ];
  const groups = groupTimelineEvents(events);
  assert.equal(groups.length, 4); assert.deepEqual(groups[0].events, events.slice(0, 2));
  assert.equal(groups[1].events[0], events[2]); assert.notEqual(groups[2].key, groups[3].key);
});

test('occupation narratives name the country and exact hires or losses, following workers rather than yield direction', () => {
  const model = new CivilizationTimeline(0), date = turn => [0, turn + 1, turn === 0 ? 1 : 0, '1 AD'];
  const counts = [[100], [250], [80]];
  const extra = { occupationCounts: (plot, turn) => counts[turn] };
  for (const [turn, yieldValue] of [5, 8, 3.5].entries()) {
    model.observe(turn, date(turn), { s: turn === 0 ? 1 : 0, terr: turn === 0 ? [territory(0, 0)] : [],
      set: [[0, 'York', 2, 'City', [yieldValue]]] }, turn === 0 ? { idd: [[0, 'Leader', 'Romans', 'Roman']] } : null,
      String, () => 'War', extra);
  }
  const details = model.events.filter(event => /new farmers|lost.*farmers/.test(event.text)).map(event => event.details);
  assert.equal(details.length, 2);
  assert.match(details[0], /York \(Romans\) hired 150 new farmers/);
  assert.match(details[1], /York \(Romans\) lost 170 farmers/);
  assert.match(details[0], /\(\+3 Food\)/);
  assert.match(details[1], /\(-4\.5 Food\)/);
  assert.ok(details.every(detail => !/\byields?:? [538]\b/i.test(detail)));
});

test('science hires use simulated counts in summaries and details, omit zero changes, and read each workforce once per settlement', () => {
  for (const owner of [0, null]) {
    const model = new CivilizationTimeline(owner), calls = [];
    const counts = [[100, 100, 100, 100, 100, 100, 100], [100, 90, 150, 600, 200, 300, 400]];
    const extra = {
      occupationCounts(plot, turn) { calls.push([plot, turn]); return counts[turn]; },
      civilizationName(identity, id) { assert.equal(id, 0); return 'Roman Republic'; },
    };
    model.observe(0, [0, 1, 1, '4000 BCE'], { s: 1, terr: [territory(0, 0)], set: [[0, 'Roma', 1, 'City', Array(7).fill(2)]] },
      { idd: [[0, 'Leader', 'Romans', 'Roman']] }, String, () => 'War', extra);
    model.observe(1, [0, 2, 0, '3999 BCE'], { set: [[0, 'Roma', 1, 'City', Array(7).fill(3)]] },
      null, String, () => 'War', extra);
    assert.deepEqual(calls, [[0, 0], [0, 1]], 'not two full snapshot lookups per changed yield');
    const hiring = model.events.find(event => /scholars/.test(event.text));
    assert.equal(hiring.text, 'In 3999 BCE (Turn 2) Roma (Roman Republic) hired 500 new scholars.');
    assert.match(hiring.details, /Roma \(Roman Republic\) hired 500 new scholars/);
    assert.match(hiring.details, /\(\+1 Science\)/);
    assert.doesNotMatch(hiring.details, /simulated occupation counts, not changes/i);
    assert.deepEqual(hiring.plots, [0]);
    assert.ok(model.events.some(event => /lost 10 artisans/.test(event.text)), 'yield gains cannot imply hiring when workers declined');
    assert.ok(!model.events.some(event => /farmers/.test(event.text)), 'no zero-person hiring notices');
    assert.ok(model.events.every(event => !/increased.*science|from 2 to 3/.test(event.text + event.details)));
  }
});
test('territorial narratives describe the lands that actually changed in deltas and snapshots without inventing geography', () => {
  for (const owner of [0, null]) {
    const model = new CivilizationTimeline(owner), frame = turn => [0, turn + 1, turn === 0 ? 1 : 0, '4000 BCE'];
    const extra = { placeName: plot => plot < 2 ? 'Europe' : plot < 4 ? 'Asia' : '' };
    const players = { idd: [[0, 'Leader', 'The Southern Gauls', 'Gallic'], [1, 'Leader', 'The Spanish', 'Spanish']] };
    model.observe(0, frame(0), { s: 1, terr: [territory(0, 0), territory(2, 1)] }, players, String, () => 'War', extra);
    model.observe(1, frame(1), { terr: [territory(1, 0), territory(3, 0)] }, null, String, () => 'War', extra);
    const expansion = model.events.find(event => /Southern Gauls expanded/.test(event.text));
    assert.match(expansion.text, /in Asia and Europe/);
    assert.match(expansion.details, /New lands in Asia and Europe came under The Southern Gauls rule/);
    assert.doesNotMatch(expansion.text, /tiles|total|gained \d/);
    const before = model.clone();
    model.observe(2, frame(2), { s: 1, terr: [territory(3, 0), territory(2, 1)] }, players, String, () => 'War', extra);
    assert.match(model.events.at(-1).text, /Southern Gauls saw their borders recede in Europe/);
    assert.equal(before.territory.get(0), 0, 'snapshot changes cannot mutate provisional checkpoints');
    model.observe(3, frame(3), { terr: [territory(8, 0)] }, null, String, () => 'War', extra);
    assert.match(model.events.at(-1).text, /expanded their territory\.$/);
    assert.doesNotMatch(model.events.at(-1).text, /Europe|Asia|unknown|undefined/);
    const count = model.events.length;
    model.observe(4, frame(4), { s: 1, terr: [territory(3, 0), territory(8, 0), territory(2, 1)] }, players, String, () => 'War', extra);
    assert.equal(model.events.length, count, 'unchanged snapshots do not invent expansion events');
  }
});
test('live event feed suppresses old history and replay, deduplicates provisional records, and retains every event in a fast skip', () => {
  const feed = new LiveTimelineFeed();
  const event = (turn, text) => ({ turn, text });
  feed.accept([event(0, 'old')], 0); assert.equal(feed.take(), null);
  feed.accept([event(0, 'old'), event(0, 'new')], 0); assert.equal(feed.take().text, 'new');
  feed.accept([event(0, 'old'), event(0, 'new')], 0); assert.equal(feed.take(), null);
  const events = Array.from({ length: 1000 }, (_, i) => event(i + 1, 'Event ' + i));
  feed.accept(events, 1000);
  for (const expected of events) assert.equal(feed.take(), expected);
  assert.equal(feed.take(), null); assert.equal(feed.pending.length, 0);
  feed.accept([event(1, 'past')], 1); assert.equal(feed.take(), null);
});

test('live feed seeks recent records rather than scanning a long completed history', () => {
  const feed = new LiveTimelineFeed(), history = Array.from({ length: 100000 }, (_, turn) => ({ turn, text: `Event ${turn}` }));
  let reads = 0;
  const events = new Proxy(history, { get(target, key) { if (/^\d+$/.test(String(key))) reads++; return target[key]; } });
  feed.accept(events, 99999);
  assert.equal(feed.take(), null);
  assert.ok(reads < 32, `${reads} history entries read for baseline`);
  reads = 0;
  history.push({ turn: 99999, text: 'New hires' });
  feed.accept(events, 99999);
  assert.equal(feed.take().text, 'New hires'); assert.equal(feed.take(), null);
  assert.ok(reads < 32, `${reads} history entries read for a provisional update`);
});
test('family milestones use recorded lifespans, include both parents and widowhood, and omit future or posthumous adulthood', () => {
  const members = [{ id: 'a', born: 0 }, { id: 'b', born: 1, parents: ['a'] },
    { id: 'c', born: 0, deathYear: 10, spouse: 'a' }];
  const events = familyEvents(members, member => member.id, [0, 20], [[0, 1, 1, '100 BCE'], [0, 21, 0, '80 BCE']]);
  const text = events.map(e => e.text).join('\n');
  assert.match(text, /a became a parent of b/); assert.match(text, /a was widowed/);
  assert.match(text, /b reached adulthood/); assert.doesNotMatch(text, /c reached adulthood|turned sixty/);
});
