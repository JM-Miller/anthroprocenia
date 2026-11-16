import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadModule as load } from './load.mjs';
const { unitNamesForTile, unitSubcategory, pluralize, estimatedWorldPopulation, parseGameYear, iconPopulation, formatCount } = await load('anthroprocenia-units.js');
const { SITE_CIV_KEYS } = await load('anthroprocenia-sites.js');
const { generateTownscape, townscapePaths, townscapeScale, townLayoutStyle, townscapeShapeCount, polygonsOverlap, polygonNearSegment, polygonNearCircle, pointInPolygon, polygonBounds } = await load('anthroprocenia-townscape.js');

test('unit types fall into sensible sub-categories', () => {
  assert.equal(unitSubcategory('UNIT_SLINGER', 0), 'ranged');
  assert.equal(unitSubcategory('UNIT_SWORDSMAN', 0), 'infantry');
  assert.equal(unitSubcategory('UNIT_HORSEMAN', 0), 'cavalry');
  assert.equal(unitSubcategory('UNIT_CATAPULT', 0), 'siege');
  assert.equal(unitSubcategory('UNIT_GALLEY', 1), 'naval');
  assert.equal(unitSubcategory('UNIT_FIGHTER', 3), 'air');
  assert.equal(unitSubcategory('UNIT_SETTLER', 2), 'settler');
  assert.equal(unitSubcategory('UNIT_MERCHANT', 2), 'merchant');
  assert.equal(unitSubcategory('UNIT_ARMY_COMMANDER', 0), 'commander');
  assert.equal(pluralize('Swordsman'), 'Swordsmen');
  assert.equal(pluralize('Slinger'), 'Slingers');
  assert.equal(pluralize('Cavalry'), 'Cavalries');
});

test('units are named for their origin city and formation, uniquely and deterministically', () => {
  const units = [
    { typeKey: 'UNIT_SWORDSMAN', base: 'Swordsman', category: 0 },
    { typeKey: 'UNIT_SLINGER', base: 'Slinger', category: 0 },
    { typeKey: 'UNIT_SLINGER', base: 'Slinger', category: 0 },
    { typeKey: 'UNIT_GALLEY', base: 'Galley', category: 1 },
  ];
  const names = unitNamesForTile('ROME', 90, units, 'Roma');
  assert.deepEqual(names, unitNamesForTile('ROME', 90, units, 'Roma'));
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, /Roma/, name);
  assert.match(names[0], /^(The (First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth) Roma |The Roma |Roma's )/);
});

test('Roman infantry and slingers are given Roman and plain unit formations over many tiles', () => {
  const infantry = [], slingers = [];
  for (let tile = 0; tile < 80; tile++) {
    infantry.push(...unitNamesForTile('ROME', tile, [{ typeKey: 'UNIT_SWORDSMAN', base: 'Swordsman', category: 0 }], 'Roma'));
    slingers.push(...unitNamesForTile('ROME', tile, [{ typeKey: 'UNIT_SLINGER', base: 'Slinger', category: 0 }], 'Roma'));
  }
  assert.ok(infantry.some(name => /Centuria/.test(name)));
  assert.ok(slingers.some(name => /Slingers/.test(name)));
  assert.ok(slingers.some(name => /Sagittarii/.test(name)));
  assert.ok(infantry.some(name => /^The Second Roma /.test(name)));
});

test('every civilization names its units, even without a city', () => {
  for (const civ of [...SITE_CIV_KEYS, 'CITYSTATE', '']) {
    for (const origin of ['Capital', '']) {
      const names = unitNamesForTile(civ, 7, [
        { typeKey: 'UNIT_WARRIOR', base: 'Warrior', category: 0 },
        { typeKey: 'UNIT_WARRIOR', base: 'Warrior', category: 0 },
        { typeKey: 'UNIT_SCOUT', base: 'Scout', category: 2 },
      ], origin);
      assert.equal(new Set(names).size, 3, `${civ}: ${names}`);
      for (const name of names) assert.ok(name.length > 3 && !/[{}]|undefined|\s\s|^'s/.test(name), `${civ}: ${name}`);
    }
  }
});

test('world population is estimated from the year and shared out among the map\'s entities', () => {
  assert.equal(estimatedWorldPopulation(-20000), 28e6);
  assert.equal(estimatedWorldPopulation(5000), 71.4e9);
  assert.ok(Math.abs(estimatedWorldPopulation(1) - 1400e6) < 1);
  const mid = estimatedWorldPopulation(-4000);
  assert.ok(mid > 35e6 && mid < 98e6);
  let previous = 0;
  for (const year of [-8000, -3000, 0, 1000, 1500, 1900, 2000, 2050]) {
    const value = estimatedWorldPopulation(year);
    assert.ok(value >= previous);
    previous = value;
  }
  const share = estimatedWorldPopulation(1) / 400;
  const values = new Set();
  for (let i = 0; i < 50; i++) {
    const value = iconPopulation(estimatedWorldPopulation(1), 400, `seed${i}`);
    assert.ok(Number.isInteger(value));
    assert.ok(Math.abs(value - share) <= share * 0.0151, `${value} vs ${share}`);
    values.add(value);
  }
  assert.ok(values.size > 25, 'values are slightly randomized');
  assert.equal(iconPopulation(1e9, 7, 'a'), iconPopulation(1e9, 7, 'a'));
  assert.equal(iconPopulation(1, 1000, 'a'), 1);
  assert.equal(formatCount(1234567.4), '1,234,567');
  assert.equal(formatCount(555), '555');
});

test('in-game dates are read as signed years', () => {
  assert.equal(parseGameYear('4000 BCE'), -4000);
  assert.equal(parseGameYear('4000 BC'), -4000);
  assert.equal(parseGameYear('1200 AD'), 1200);
  assert.equal(parseGameYear('AD 1,200'), 1200);
  assert.equal(parseGameYear('Spring 500 B.C.'), -500);
  assert.equal(parseGameYear('Early Dawn'), null);
  assert.equal(parseGameYear(''), null);
});

test('town layouts follow culture and population and stay near their disc', () => {
  assert.equal(townLayoutStyle('ROME'), 'grid');
  assert.equal(townLayoutStyle('ENGLAND'), 'radial');
  assert.equal(townLayoutStyle('PERSIA'), 'round');
  assert.equal(townLayoutStyle('TONGA'), 'organic');
  assert.ok(townscapeScale(100) < townscapeScale(10000) && townscapeScale(10000) < townscapeScale(5e6));
  for (const civ of [...SITE_CIV_KEYS, '']) {
    for (const kind of ['town', 'camp', 'battle']) {
      for (const population of [200, 40000, 8e6]) {
        for (const [age, lvl] of [[0, 0], [1, 2], [2, 1]]) {
          const opts = { seed: 99, civKey: civ, population, kind, coast: true, river: true, age, lvl };
          const shapes = generateTownscape(opts);
          assert.deepEqual(shapes, generateTownscape(opts));
          assert.ok(townscapeShapeCount(shapes) > 0 && townscapeShapeCount(shapes) < 2000, `${civ} ${kind} ${population}: ${townscapeShapeCount(shapes)}`);
          const polys = [];
          for (const key of Object.keys(shapes)) {
            if (key === 'nodes') { for (const point of shapes.nodes) polys.push([point]); continue; }
            if (!Array.isArray(shapes[key])) continue;
            for (const item of shapes[key]) {
              if (key === 'buildings') { polys.push(item.poly, ...item.parts, ...item.detail); continue; }
              if (key === 'edges') continue;
              polys.push(item);
            }
          }
          for (const poly of polys) for (const [x, y] of poly) assert.ok(Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) < 1.9, `${civ} ${kind} ${age}${lvl}`);
          for (const d of Object.values(townscapePaths(shapes, 10, 20, 5))) assert.ok(!/NaN|undefined/.test(d));
        }
      }
    }
  }
  const small = generateTownscape({ seed: 5, civKey: 'ROME', population: 200, kind: 'town' });
  const large = generateTownscape({ seed: 5, civKey: 'ROME', population: 8e6, kind: 'town' });
  assert.ok(large.buildings.length > small.buildings.length * 2);
});

test('townscapes have ten small buildings per lot around one large central building', () => {
  const area = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
  for (const civ of ['ROME', 'EGYPT', '']) {
    const town = generateTownscape({ seed: 11, civKey: civ, population: 2e5, kind: 'town', age: 0, lvl: 1 });
    assert.ok(town.buildings.length >= 41, `${civ}: ${town.buildings.length}`);
    const pieces = town.buildings.filter((b, i) => i > 0 && area(b.poly) < area(town.buildings[0].poly) / 8).length;
    assert.ok(pieces >= (town.buildings.length - 1) * 0.9, `${civ}: most buildings are the small ones (${pieces}/${town.buildings.length})`);
    const areas = town.buildings.map(b => area(b.poly)), sorted = areas.slice(1).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    assert.ok(areas[0] > median * 8, `${civ}: the central building (${areas[0]}) dwarfs the rest (${median})`);
    assert.ok(Math.hypot(...town.buildings[0].poly.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]).map(v => v / town.buildings[0].poly.length)) < 0.35, 'it stands near the middle');
  }
});

test('units are encampments unless they are in battle', () => {
  const camp = generateTownscape({ seed: 8, civKey: 'ROME', population: 5000, kind: 'camp' });
  assert.ok(camp.buildings.filter(b => b.form === 'tent').length >= 4 && camp.walls.length === 1 && camp.fires.length === 1);
  const nomad = generateTownscape({ seed: 8, civKey: 'MONGOLIA', population: 5000, kind: 'camp' });
  assert.ok(nomad.buildings.some(b => b.form === 'tent' && b.poly.length === 8));
  const fight = generateTownscape({ seed: 8, civKey: 'ROME', population: 5000, kind: 'battle' });
  assert.equal(fight.tents.length, 0);
  assert.ok(fight.buildings.length >= 4 && fight.accents.length > 6);
});

test('townscapes stay a manageable size', () => {
  for (const civ of [...SITE_CIV_KEYS, '']) {
    for (const age of [0, 1, 2]) {
      const big = generateTownscape({ seed: 3, civKey: civ, population: 8e6, kind: 'town', age, lvl: 2 });
      assert.ok(big.buildings.length <= 1100, `${civ}: ${big.buildings.length}`);
      const camp = generateTownscape({ seed: 3, civKey: civ, population: 8e6, kind: 'camp', age, lvl: 2 });
      const tents = camp.buildings.filter(b => b.form === 'tent');
      assert.ok(tents.length <= 16, `${civ}: ${tents.length}`);
    }
  }
});

test('collision helpers detect overlap, nearness to rivers and trees', () => {
  const square = (x, y, s) => [[x - s, y - s], [x + s, y - s], [x + s, y + s], [x - s, y + s]];
  assert.ok(polygonsOverlap(square(0, 0, 1), square(1.5, 0, 1)));
  assert.ok(!polygonsOverlap(square(0, 0, 1), square(3, 0, 1)));
  assert.ok(polygonsOverlap(square(0, 0, 1), square(2.2, 0, 1), 0.5));
  assert.ok(!polygonsOverlap(square(0, 0, 1), square(2.2, 0, 1), 0.1));
  const rotated = [[0, -1.5], [1.5, 0], [0, 1.5], [-1.5, 0]];
  assert.ok(polygonsOverlap(rotated, square(1.4, 1.4, 0.4)) === false);
  assert.ok(polygonNearSegment(square(0, 0, 1), -3, 0, 3, 0, 0));
  assert.ok(polygonNearSegment(square(0, 0, 1), -3, 1.4, 3, 1.4, 0.5));
  assert.ok(!polygonNearSegment(square(0, 0, 1), -3, 2.5, 3, 2.5, 0.5));
  assert.ok(polygonNearCircle(square(0, 0, 1), 1.3, 0, 0.4));
  assert.ok(!polygonNearCircle(square(0, 0, 1), 3, 0, 0.4));
  assert.ok(polygonNearCircle(square(0, 0, 1), 0, 0, 0.01));
  assert.ok(pointInPolygon(0.5, 0.5, square(0, 0, 1)) && !pointInPolygon(2, 0, square(0, 0, 1)));
  assert.deepEqual(polygonBounds(square(1, 2, 1)), { x0: 0, y0: 1, x1: 2, y1: 3 });
});

test('icon population scales with the origin city\'s size over 50', () => {
  const base = iconPopulation(1e9, 1000, 'seed');
  assert.equal(iconPopulation(1e9, 1000, 'seed', 1), base);
  assert.ok(Math.abs(iconPopulation(1e9, 1000, 'seed', 5) - base * 5) <= 5);
  assert.ok(Math.abs(iconPopulation(1e9, 1000, 'seed', 0.1) - base * 0.1) <= 1);
  assert.equal(iconPopulation(1e9, 1000, 'seed', 0), 1);
});
