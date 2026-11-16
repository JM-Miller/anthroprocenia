import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadModule as load } from './load.mjs';
const { personProfile, faithFlavor, eraLabel, PEOPLE_CIVS, civNameLists, personRecord, personName, personTraits, homePlan, occupationGroupLabel, occupationYieldIndex, PERSONALITY_TRAITS, NAME_LISTS_VERSION } = await load('anthroprocenia-people.js');
const { packPerson, unpackPerson, NAME_ID_LIMIT, TRAIT_ID_LIMIT } = await load('anthroprocenia-persist.js');
const { SITE_CIV_KEYS } = await load('anthroprocenia-sites.js');

const base = { civKey: 'ROME', religion: '', age: 0, lvl: 1, seed: 's1', category: 'farm', form: 'rect', unit: null };

test('yield-related occupation shares increase and decrease, including negative yields, without creating people', () => {
  const count = (plan, yieldIndex) => plan.groups.filter(group => occupationYieldIndex(group.title) === yieldIndex).reduce((sum, group) => sum + group.count, 0);
  for (let yieldIndex = 0; yieldIndex < 7; yieldIndex++) {
    const plans = [-10, 0, 30].map(value => {
      const yields = Array(7).fill(0); yields[yieldIndex] = value;
      return homePlan({ ...base, form: '', category: 'generic', yields, turn: 5 }, 'same-home', 1_000_000);
    });
    assert.ok(count(plans[0], yieldIndex) < count(plans[1], yieldIndex));
    assert.ok(count(plans[1], yieldIndex) < count(plans[2], yieldIndex));
    for (const plan of plans) assert.equal(plan.groups.reduce((sum, group) => sum + group.count, 0), 1_000_000);
  }
  const military = { ...base, unit: { sub: 'infantry', base: 'Warrior' } };
  assert.deepEqual(homePlan(military, 'army', 10000).groups, homePlan({ ...military, yields: [100, 100, 100] }, 'army', 10000).groups);
});

test('every civilization has names for its people', () => {
  for (const civ of SITE_CIV_KEYS) assert.ok(PEOPLE_CIVS.includes(civ), civ);
  for (const civ of [...PEOPLE_CIVS, 'UNKNOWN', '']) {
    for (let i = 0; i < 12; i++) {
      const p = personProfile({ ...base, civKey: civ, seed: `${civ}${i}` });
      assert.ok(p.name.length > 2 && !/undefined|null/.test(p.name + p.occupation), `${civ}: ${p.name} / ${p.occupation}`);
      assert.ok(p.occupation.length > 2);
    }
  }
});

test('people are deterministic and varied', () => {
  assert.deepEqual(personProfile(base), personProfile(base));
  const names = new Set();
  for (let i = 0; i < 60; i++) names.add(personProfile({ ...base, seed: `p${i}` }).name);
  assert.ok(names.size > 40);
});

test('names follow the civilization\'s culture and naming order', () => {
  const sample = (civKey, n, extra = {}) => Array.from({ length: n }, (_, i) => personProfile({ ...base, civKey, age: 1, seed: `${civKey}${i}`, ...extra }).name);
  const rome = sample('ROME', 120);
  assert.ok(rome.some(name => /^(Marcus|Gaius|Lucius|Quintus|Titus|Publius|Aulus|Decimus|Julia|Livia|Cornelia|Claudia|Octavia|Valeria|Flavia|Aurelia) /.test(name)), 'hand-written Roman names');
  assert.ok(rome.some(name => name.split(' ').length === 3), 'three-part Roman names');
  const han = sample('HAN', 120);
  assert.ok(han.some(name => /^(Liu|Zhao|Wang|Li|Chen|Zhang|Wei|Xiao|Cao|Han) /.test(name)), 'family name first');
  assert.ok(han.every(name => name.split(' ').length >= 2));
  const iceland = personProfile({ ...base, civKey: 'ICELAND', age: 1, seed: 'i' }).name;
  assert.match(iceland, /(sson|sdottir)$/);
  const modern = [];
  for (let i = 0; i < 30; i++) modern.push(personProfile({ ...base, civKey: 'AMERICA', age: 2, seed: `a${i}` }).name);
  assert.ok(modern.some(name => /^\w+ [A-Z]\. \w+/.test(name)), 'modern middle initials');
  const ancient = [];
  for (let i = 0; i < 60; i++) ancient.push(personProfile({ ...base, civKey: 'GREECE', age: 0, seed: `g${i}` }).name);
  assert.ok(ancient.some(name => /the (Elder|Younger|Tall|Red|Wise|Swift|Stout|Fair)$/.test(name)), 'antiquity epithets');
});

test('every culture has its own typical ways of writing a full name', () => {
  const sample = (civKey, n = 200) => Array.from({ length: n }, (_, i) => personProfile({ ...base, civKey, age: 1, seed: `${civKey}${i}` }).name);
  assert.ok(sample('ABBASID').some(name => /\b(ibn|bint) /.test(name)), 'Arabic patronymics');
  assert.ok(sample('RUSSIA').some(name => /(ovich|ovna) /.test(name)), 'Russian patronymics');
  assert.ok(sample('GREECE').some(name => /son of|daughter of/.test(name)), 'Greek patronymics');
  assert.ok(sample('SPAIN').some(name => / de [A-Z]/.test(name)), 'Spanish place names');
  assert.ok(sample('PRUSSIA').some(name => / von [A-Z]/.test(name)), 'Prussian von names');
  assert.ok(sample('NORMAN').some(name => / de [A-Z]/.test(name)), 'Norman de names');
});

test('names are varied, well formed and different between cultures', () => {
  const distinct = {};
  for (const civ of PEOPLE_CIVS) {
    const names = new Set();
    for (let i = 0; i < 300; i++) {
      const name = personProfile({ ...base, civKey: civ, age: i % 3, seed: `${civ}-${i}` }).name;
      assert.ok(/^\S+( \S+)+$/.test(name) && !/undefined|null|NaN|--|\s\s/.test(name) && /^[A-Z]/.test(name), `${civ}: "${name}"`);
      names.add(name);
    }
    distinct[civ] = names.size;
    assert.ok(names.size > 200, `${civ}: only ${names.size} distinct names in 300`);
  }
  const rome = new Set(), japan = new Set();
  for (let i = 0; i < 200; i++) { rome.add(personProfile({ ...base, civKey: 'ROME', seed: `x${i}` }).name); japan.add(personProfile({ ...base, civKey: 'HEIAN', seed: `x${i}` }).name); }
  assert.equal([...rome].filter(name => japan.has(name)).length, 0);
});

test('civilization determines names while faith shapes the clergy', () => {
  assert.equal(faithFlavor('Islam').key, 'islam');
  assert.equal(faithFlavor('Christianity').key, 'christian');
  assert.equal(faithFlavor('Buddhism').key, 'buddhist');
  assert.equal(faithFlavor('The Odin Faith').key, 'norse');
  assert.equal(faithFlavor('A Made-Up Cult'), null);
  for (let i = 0; i < 80; i++) {
    const opts = { ...base, civKey: 'ROME', age: 1, seed: `x${i}` };
    assert.equal(personProfile({ ...opts, religion: 'Islam' }).name, personProfile({ ...opts, religion: 'Christianity' }).name);
  }
  const clergy = new Set();
  for (let i = 0; i < 60; i++) clergy.add(personProfile({ ...base, religion: 'Islam', category: 'shrine', form: 'dome', age: 1, seed: `c${i}` }).occupation);
  assert.ok(clergy.has('Imam') || clergy.has('Muezzin') || clergy.has('Qadi'));
  assert.equal(personProfile({ ...base, religion: 'Islam' }).faith, 'Islam');
});

test('occupation follows the improvement, building and unit the person is part of', () => {
  const collect = (extra, n = 80) => { const s = new Set(); for (let i = 0; i < n; i++) s.add(personProfile({ ...base, seed: `o${i}`, ...extra }).occupation); return s; };
  assert.ok([...collect({ category: 'farm', form: 'rect' })].some(o => ['Farmer', 'Field hand', 'Reaper', 'Shepherd'].includes(o)));
  assert.ok([...collect({ category: 'mine', form: 'hut' })].some(o => ['Miner', 'Smelter', 'Prospector'].includes(o)));
  assert.ok([...collect({ category: 'farm', form: 'temple' })].some(o => ['Priest', 'Priestess', 'Temple keeper', 'Acolyte'].includes(o)), 'a temple has temple staff whatever the icon');
  assert.ok([...collect({ category: 'farm', form: 'factory', age: 2 })].some(o => ['Machinist', 'Welder', 'Mechanic', 'Foreman'].includes(o)));
  assert.ok([...collect({ category: 'farm', form: 'castle', age: 1 })].some(o => ['Soldier', 'Sentry', 'Gunner', 'Pikeman'].includes(o)));
  assert.ok([...collect({ form: 'skyscraper', age: 2 })].some(o => ['Clerk', 'Accountant', 'Typist', 'Manager', 'Engineer'].includes(o)));
  assert.ok(collect({ age: 0 }).size > 3);
  const antiquity = collect({ category: 'workshop', form: 'hut', age: 0 }), modern = collect({ category: 'workshop', form: 'hut', age: 2 });
  assert.ok([...antiquity].some(o => ['Smith', 'Potter', 'Tanner', 'Weaver'].includes(o)));
  assert.ok([...modern].some(o => ['Machinist', 'Welder', 'Mechanic', 'Foreman'].includes(o)));
  const unit = collect({ unit: { sub: 'ranged', base: 'Slinger' }, form: 'tent' });
  assert.ok(unit.has('Slinger'));
  assert.ok(collect({ unit: { sub: 'ranged', base: 'Slinger' }, form: 'command' }, 60).has('Officer') || collect({ unit: { sub: 'ranged', base: 'Slinger' }, form: 'command' }, 60).has('Captain'));
  assert.ok([...collect({ unit: { sub: 'infantry', base: 'Swordsman' }, form: 'wagon' }, 60)].some(o => ['Quartermaster', 'Teamster', 'Camp follower', 'Cook'].includes(o)));
  assert.ok([...collect({ unit: { sub: 'settler', base: 'Settler' }, form: 'tent' })].some(o => ['Colonist', 'Settler', 'Pioneer'].includes(o)));
  assert.ok([...collect({ unit: { sub: 'naval', base: 'Galley' }, form: 'tent' })].some(o => ['Sailor', 'Marine', 'Helmsman', 'Gunner'].includes(o)));
});

test('era labels read early, middle and late in each age', () => {
  assert.equal(eraLabel(0, 0), 'Early Antiquity');
  assert.equal(eraLabel(0, 2), 'Late Antiquity');
  assert.equal(eraLabel(1, 1), 'Middle Exploration');
  assert.equal(eraLabel(2, 0), 'Early Modern');
});

test('each civilization has first and last name lists, with hand-written names first and baked ones after', () => {
  for (const civ of ['ROME', 'HAN', 'ICELAND', 'MAYA', 'NOT_A_CIV']) {
    const lists = civNameLists(civ);
    assert.equal(lists.first.length, lists.female.length);
    assert.ok(lists.last.length > lists.handFamily && lists.handFamily > 0, civ);
    assert.ok(lists.pools.male[1].length > 0 && lists.pools.female[1].length > 0, `${civ} has baked given names`);
    assert.equal(new Set(lists.last).size, lists.last.length, `${civ} family names are unique`);
    assert.ok(lists.first.length < NAME_ID_LIMIT && lists.last.length < NAME_ID_LIMIT, 'ids fit the saved format');
    assert.strictEqual(civNameLists(civ), lists, 'built once');
  }
  assert.equal(civNameLists('NOT_A_CIV').key.startsWith('GENERIC:'), true);
  assert.ok(PERSONALITY_TRAITS.length <= TRAIT_ID_LIMIT && new Set(PERSONALITY_TRAITS).size === PERSONALITY_TRAITS.length);
  assert.ok(Number.isInteger(NAME_LISTS_VERSION));
});

test('a person is ids: first and last name and two different traits, and the name is rebuilt from them', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const record = personRecord({ civKey: 'ROME', religion: i % 2 ? 'Christianity' : '', seed: `s${i}` });
    const lists = civNameLists('ROME');
    assert.ok(record.first >= 0 && record.first < lists.first.length && record.last >= 0 && record.last < lists.last.length);
    assert.notEqual(record.traits[0], record.traits[1]);
    assert.equal(personTraits(record).length, 2);
    assert.deepEqual(unpackPerson(packPerson(record)), record, 'a stored person loads back the same');
    const name = personName('ROME', record, 1);
    assert.equal(personName('ROME', unpackPerson(packPerson(record)), 1), name);
    assert.ok(/\S+ \S+/.test(name) && !/undefined/.test(name));
    seen.add(name);
  }
  assert.ok(seen.size > 250, `${seen.size} different names`);
  const ice = personRecord({ civKey: 'ICELAND', religion: '', seed: 'x' });
  assert.match(personName('ICELAND', ice, 1), /(sson|sdottir)$/);
  const p = personProfile({ civKey: 'ROME', religion: '', age: 1, lvl: 1, seed: 'q', category: 'farm', form: '', unit: null });
  assert.deepEqual(personProfile({ civKey: 'ROME', religion: '', age: 1, lvl: 1, seed: 'other', category: 'farm', form: '', unit: null, record: p.record }).name, p.name, 'a stored record names the same person');
});

test('a home\'s occupations: groups add up, and the shuffle maps every person to one slot and back', () => {
  const opts = { religion: 'Hinduism', age: 1, category: 'farm', form: '', unit: null };
  for (const population of [0, 1, 2, 3, 97, 1000, 5_000_000]) {
    const plan = homePlan(opts, `home${population}`, population);
    assert.equal(plan.total, population);
    assert.equal(plan.groups.reduce((sum, g) => sum + g.count, 0), population);
    let start = 0;
    for (const g of plan.groups) { assert.equal(g.start, start); assert.ok(g.count > 0); start += g.count; }
    assert.deepEqual(plan.groups.map(g => g.title), plan.groups.map(g => g.title).slice().sort(), 'alphabetical');
    const sample = population <= 1000 ? Array.from({ length: population }, (_, i) => i) : [0, 1, 2, 12345, 2_500_000, population - 1];
    const slots = new Set();
    for (const i of sample) {
      const slot = plan.slotOf(i);
      assert.ok(slot >= 0 && slot < population);
      assert.equal(plan.personAt(slot), i);
      const g = plan.groups[plan.groupOf(i)];
      assert.ok(slot >= g.start && slot < g.start + g.count);
      assert.equal(plan.occupationOf(i), g.title);
      slots.add(slot);
    }
    assert.equal(slots.size, sample.length, 'no two people share a slot');
  }
  assert.equal(homePlan(opts, 'x', 10).slotOf(10), -1);
  const units = homePlan({ religion: '', age: 0, category: 'generic', form: '', unit: { sub: 'naval', base: 'Galley' } }, 'u', 40);
  assert.ok(units.groups.every(g => ['Sailor', 'Marine', 'Helmsman', 'Gunner'].includes(g.title)));
  const p = personProfile({ civKey: 'ROME', religion: '', age: 1, lvl: 1, seed: 'h#3', category: 'farm', form: '', unit: null, plan: homePlan(opts, 'h', 50), index: 3 });
  const title = homePlan(opts, 'h', 50).occupationOf(3);
  assert.ok(p.occupation === title || occupationGroupLabel(title).split(' / ').includes(p.occupation));
});

test('a home\'s occupations stay with each person as the home grows, and a few people change trade each turn', () => {
  const opts = { religion: '', age: 1, category: 'farm', form: '', unit: null, turn: 40 };
  const small = homePlan(opts, 'steady', 2000), big = homePlan(opts, 'steady', 50_000);
  for (let i = 0; i < 2000; i++) assert.equal(small.occupationOf(i), big.occupationOf(i), `person ${i} keeps their trade`);
  let changed = 0;
  const later = homePlan({ ...opts, turn: 41 }, 'steady', 50_000);
  for (let i = 0; i < 50_000; i++) if (later.occupationOf(i) !== big.occupationOf(i)) changed++;
  assert.ok(changed > 0 && changed < 50_000 * 0.06, `some but few change trade (${changed})`);
});
