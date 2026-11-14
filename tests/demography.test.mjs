import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const d = await loadModule('anthroprocenia-demography.js');
const { ageCategory, AGE_CATEGORIES, lifeYearsPerTurn, DEFAULT_LIFE_YEARS, seedNumber, homeHazard, deathChances, startLife, stepLife, expectedChange, DEATH_CAUSES } = d;

const calm = homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, wounds: [], outbreak: 0.99 });

test('ages fall into Child, Youth, Adult and Elder', () => {
  assert.deepEqual(AGE_CATEGORIES, ['Child', 'Youth', 'Adult', 'Elder']);
  assert.deepEqual([0, 14.9, 15, 24, 25, 59, 60, 90].map(ageCategory), ['Child', 'Child', 'Youth', 'Youth', 'Adult', 'Adult', 'Elder', 'Elder']);
  assert.equal(ageCategory('nonsense'), 'Child');
});

test('a turn ages people by its calendar years, between one and four', () => {
  assert.equal(lifeYearsPerTurn(1), 1);
  assert.equal(lifeYearsPerTurn(3), 3);
  assert.equal(lifeYearsPerTurn(50), 4);
  assert.equal(lifeYearsPerTurn(0.2), 1);
  assert.equal(lifeYearsPerTurn(NaN), DEFAULT_LIFE_YEARS);
  assert.equal(lifeYearsPerTurn(-5), DEFAULT_LIFE_YEARS);
});

test('hazards rise with outbreaks, battles and pillaging; births with food and growth', () => {
  const outbreak = homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, outbreak: 0 });
  assert.ok(outbreak.outbreak && outbreak.disease > calm.disease * 5);
  const battle = homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, wounds: [[0, 1], [1, 0.5]], outbreak: 0.99 });
  assert.ok(battle.battle > 0.25 && battle.battle <= 0.35);
  assert.equal(calm.battle, 0);
  const pillaged = homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, pillagedHere: true, outbreak: 0.99 });
  assert.ok(pillaged.pillage > homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, pillagedNear: true, outbreak: 0.99 }).pillage);
  const growing = homeHazard({ size: 6, prevSize: 5, food: 12, era: 1, outbreak: 0.99 });
  const starving = homeHazard({ size: 4, prevSize: 5, food: 0, era: 1, outbreak: 0.99 });
  assert.ok(growing.growing && !starving.growing);
  assert.ok(growing.birth > calm.birth && calm.birth > starving.birth);
  assert.ok(homeHazard({ size: 5, era: 0, outbreak: 0.99 }).disease > homeHazard({ size: 5, era: 2, outbreak: 0.99 }).disease, 'medicine improves by era');
});

test('the young and old are struck hardest by disease; adults by battle', () => {
  const h = { disease: 0.05, battle: 0.1, pillage: 0 };
  assert.ok(deathChances(h, 70, 2).disease > deathChances(h, 30, 2).disease);
  assert.ok(deathChances(h, 30, 2).battle > deathChances(h, 70, 2).battle);
  assert.ok(deathChances(h, 2, 2).infancy > 0 && deathChances(h, 10, 2).infancy === 0);
  assert.ok(deathChances({ disease: 1, battle: 1, pillage: 1 }, 30, 2).total <= 0.9);
});

test('lives are deterministic, grow older and end, and someone takes each place', () => {
  const run = (seed, turns, hazard) => {
    const s = startLife(seed, 0);
    for (let t = 1; t <= turns; t++) stepLife(s, seed, t, t * 2, 2, hazard);
    return s;
  };
  assert.deepEqual(run(seedNumber('a#1'), 80, calm), run(seedNumber('a#1'), 80, calm));
  const start = startLife(seedNumber('b#2'), 100);
  assert.ok(start.lifespan >= 45 && start.lifespan <= 85 && start.born <= 100 && start.born >= 100 - 85);
  // Over a long enough time everyone dies of something; each death moves the slot on a generation.
  const long = run(seedNumber('c#3'), 200, calm);
  assert.ok(long.gen >= 2, 'several generations');
  assert.ok(long.lastDeath && Object.values(DEATH_CAUSES).includes(long.lastDeath.cause));
  assert.ok(['born', 'moved'].includes(long.kind));
  if (long.kind === 'born') assert.equal(long.family, long.lastDeath.family, 'a child keeps the family name');
  else assert.equal(long.family, long.gen, 'a newcomer starts a family of their own');
  // Old age: a person past their lifespan dies on the next turn whatever the hazards.
  const old = startLife(seedNumber('d#4'), 0);
  old.born = -200;
  stepLife(old, seedNumber('d#4'), 1, 2, 2, null);
  assert.equal(old.lastDeath.cause, DEATH_CAUSES.age);
  assert.equal(old.since, 1);
});

test('war, pillaging and plague kill many more people than peace', () => {
  const deaths = hazard => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const seed = seedNumber(`slot#${i}`), s = startLife(seed, 0);
      s.born = -30; s.lifespan = 80;
      stepLife(s, seed, 1, 2, 2, hazard);
      if (s.gen) n++;
    }
    return n;
  };
  const war = homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, wounds: [[0, 1]], pillagedHere: true, outbreak: 0 });
  assert.ok(deaths(war) > deaths(calm) * 4, `${deaths(war)} vs ${deaths(calm)}`);
});

test('a home\'s births and deaths on a turn are estimated from its hazards and growth', () => {
  assert.deepEqual(expectedChange(0, calm, 2), { deaths: 0, births: 0 });
  assert.deepEqual(expectedChange(100, null, 2), { deaths: 0, births: 0 });
  const peace = expectedChange(10000, calm, 2), boom = expectedChange(10000, calm, 2, 0.1);
  assert.ok(peace.deaths > 0 && peace.births > 0 && peace.births <= peace.deaths);
  assert.ok(boom.births > peace.births + 900, 'city growth adds births');
  const war = expectedChange(10000, homeHazard({ size: 5, prevSize: 5, food: 5, era: 1, wounds: [[0, 1]], pillagedHere: true, outbreak: 0.99 }), 2);
  assert.ok(war.deaths > peace.deaths * 3);
});
