import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async file => {
  const source = await readFile(new URL(`../anthroprocenia/ui/map/${file}`, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const persist = await load('anthroprocenia-persist.js');
const { generateTownscape, TOWNSCAPE_CIVS } = await load('anthroprocenia-townscape.js');
const { encodeShapes, decodeShapes, packPoints, unpackPoints, encodeMask, decodeMask, encodePlacement, decodePlacement, encodePanelFrame, decodePanelFrame, trackRecord, createWriteQueue, COORD_SCALE } = persist;

const close = (a, b, message) => assert.ok(Math.abs(a - b) <= 1 / COORD_SCALE, message || `${a} vs ${b}`);
const closePoly = (a, b) => { assert.equal(a.length, b.length); a.forEach((p, i) => { close(p[0], b[i][0]); close(p[1], b[i][1]); }); };

test('points survive packing within a fraction of a pixel', () => {
  const pts = [[0, 0], [0.123456, -0.98765], [1.5, 1.5], [-1.5, 0.0004]];
  closePoly(unpackPoints(packPoints(pts)), pts);
  assert.deepEqual(unpackPoints(packPoints([])), []);
});

test('every kind of generated townscape round-trips', () => {
  let checked = 0;
  for (const civKey of [...TOWNSCAPE_CIVS.slice(0, 12), 'UNKNOWN']) {
    for (const kind of ['town', 'camp', 'battle']) {
      for (const [age, lvl, population] of [[0, 0, 40], [1, 1, 900], [2, 2, 40000]]) {
        const shapes = generateTownscape({ seed: 17 + checked, civKey, population, kind, coast: checked % 2 === 0, river: checked % 3 === 0, age, lvl });
        const text = JSON.stringify(encodeShapes(shapes)), back = decodeShapes(JSON.parse(text));
        assert.equal(back.buildings.length, shapes.buildings.length, `${civKey} ${kind}`);
        shapes.buildings.forEach((b, i) => {
          assert.equal(back.buildings[i].form, b.form); assert.equal(back.buildings[i].cls, b.cls);
          closePoly(back.buildings[i].poly, b.poly);
          assert.equal(back.buildings[i].parts.length, b.parts.length); assert.equal(back.buildings[i].detail.length, b.detail.length);
          b.parts.forEach((part, k) => closePoly(back.buildings[i].parts[k], part));
          b.detail.forEach((line, k) => closePoly(back.buildings[i].detail[k], line));
        });
        for (const key of ['streets', 'mainStreets', 'walls', 'fires', 'accents', 'water', 'pools', 'fields', 'parks', 'plazas', 'tents']) {
          assert.equal(back[key].length, shapes[key].length, key);
          shapes[key].forEach((poly, i) => closePoly(back[key][i], poly));
        }
        closePoly(back.nodes, shapes.nodes);
        assert.deepEqual(back.edges, shapes.edges);
        assert.equal(back.people, shapes.people);
        checked++;
      }
    }
  }
  assert.ok(checked > 100);
});

test('a saved townscape is far smaller than a naive JSON copy', () => {
  const shapes = generateTownscape({ seed: 5, civKey: 'ROME', population: 5000, kind: 'town', coast: false, river: false, age: 1, lvl: 1 });
  assert.ok(JSON.stringify(encodeShapes(shapes)).length < JSON.stringify(shapes).length * 0.6);
});

test('bad saved layouts are rejected rather than thrown', () => {
  assert.equal(decodeShapes(null), null);
  assert.equal(decodeShapes({ v: 2 }), null);
  assert.equal(decodePanelFrame({ v: 1, r: 'nope', s: [] }), null);
  assert.equal(decodePanelFrame(null), null);
});

test('masks of kept buildings round-trip for any length', () => {
  for (const n of [0, 1, 3, 4, 5, 17, 64]) {
    const flags = Array.from({ length: n }, (_, i) => (i * 7 + n) % 3 !== 0);
    assert.deepEqual(decodeMask(encodeMask(flags), n), flags, `n=${n}`);
  }
  assert.equal(decodeMask('ab', 40), null, 'a too-short mask is rejected');
  assert.equal(decodeMask(undefined, 4), null);
});

test('a saved placement is reused only while it still fits the layout, size and map', () => {
  const placement = { geoKey: 'town|1|ROME', radiusHex: 0.4321, signature: '12.00|4|T5', buildings: [true, false, true], tents: [], fields: [true], parks: [false, false] };
  const record = JSON.parse(JSON.stringify(encodePlacement(placement)));
  const counts = [3, 0, 1, 2];
  const back = decodePlacement(record, 'town|1|ROME', 0.4321, '12.00|4|T5', counts);
  assert.deepEqual(back, { buildings: placement.buildings, tents: [], fields: [true], parks: [false, false] });
  assert.equal(decodePlacement(record, 'town|2|ROME', 0.4321, '12.00|4|T5', counts), null, 'another layout');
  assert.equal(decodePlacement(record, 'town|1|ROME', 0.5, '12.00|4|T5', counts), null, 'another size');
  assert.equal(decodePlacement(record, 'town|1|ROME', 0.4321, '12.00|4|T6', counts), null, 'another turn or map layout');
  assert.equal(decodePlacement(record, 'town|1|ROME', 0.4321, '12.00|4|T5', [4, 0, 1, 2]), null, 'regenerated with a different building count');
  assert.equal(decodePlacement(null, 'a', 1, 's', counts), null);
});

const entry = (civ, continent, tile, id, population, extra = {}) => ({
  civ: { id: civ, name: `The ${civ} Folk` }, continent: { id: continent, name: `Land ${continent}` }, tile: { index: tile, name: `Town (${tile}, 1)` },
  icon: { id, name: `The Brutii ${id}`, kind: 'building', population, owner: 1, category: 'farm', unit: null, ...extra },
});

test('the people panel record round-trips, and shares repeated names', () => {
  const entries = [
    entry('o1', 'k1', 10, 'b3.0.0', 120), entry('o1', 'k1', 10, 'b3.0.1', 121), entry('o1', 'k2', 20, 'u4', 55, { kind: 'unit', category: 'generic', unit: { sub: 'infantry', base: 'Warrior' } }),
    entry('none', 'sea', 30, 'w1', 9, { kind: 'wonder', category: 'wonder', owner: -1 }), entry('o2', 'k1', 40, 'sp', 7, { kind: 'specialist', category: 'specialist', owner: 2 }),
  ];
  const meta = { signature: 'sig', owners: [[1, 'ROME', 'Roman Pantheon'], [2, 'GAUL', '']], era: [1, 2] };
  const text = JSON.stringify(encodePanelFrame(entries, meta)), back = decodePanelFrame(JSON.parse(text));
  assert.equal(back.signature, 'sig');
  assert.deepEqual(back.owners, meta.owners);
  assert.deepEqual(back.era, [1, 2]);
  assert.deepEqual(back.entries, entries);
  assert.equal((text.match(/The o1 Folk/g) || []).length, 1, 'a civilization name is stored once, not once per icon');
});

test('Home Location groups round-trip, and records written before them still load', () => {
  const entries = [entry('o1', 'k1', 10, 'b3.0.0', 120, { group: { id: 'b3', name: 'Farm' } }), entry('o1', 'k1', 10, 'u4', 5, { kind: 'unit', group: { id: 'ut2', name: 'Warrior' } })];
  const data = JSON.parse(JSON.stringify(encodePanelFrame(entries, { signature: 's', owners: [], era: [0, 1] })));
  assert.equal(data.v, 2);
  assert.deepEqual(decodePanelFrame(data).entries, entries);
  const old = { ...data, v: 1, r: data.r.map(row => row.slice(0, 11)) };
  assert.deepEqual(decodePanelFrame(old).entries, entries.map(e => { const icon = { ...e.icon }; delete icon.group; return { ...e, icon }; }));
});

test('a person is four ids packed into a few characters', () => {
  const { packPerson, unpackPerson, NAME_ID_LIMIT, TRAIT_ID_LIMIT } = persist;
  for (const record of [{ first: 0, last: 0, traits: [0, 1] }, { first: 4095, last: 4095, traits: [63, 62] }, { first: 17, last: 230, traits: [5, 41] }]) {
    const packed = packPerson(record);
    assert.ok(Number.isSafeInteger(packed) && packed < NAME_ID_LIMIT * NAME_ID_LIMIT * TRAIT_ID_LIMIT * TRAIT_ID_LIMIT);
    assert.ok(packed.toString(36).length <= 7);
    assert.deepEqual(unpackPerson(packed), record);
  }
  assert.deepEqual(unpackPerson(packPerson({ first: -3, last: 9999, traits: [99] })), { first: 0, last: 4095, traits: [63, 0] }, 'out of range ids are clamped');
});

test('people are saved as id lists under their tile and Home Location', () => {
  const { encodePeople, decodePeople } = persist;
  const homes = [
    { tile: 10, home: 'b3.0.0', people: Array.from({ length: 500 }, (_, i) => ({ first: i % 300, last: (i * 7) % 900, traits: [i % 48, (i + 5) % 48] })) },
    { tile: 11, home: 'u4', people: [] },
  ];
  const text = JSON.stringify(encodePeople(homes, 1));
  assert.deepEqual(decodePeople(JSON.parse(text), 1), homes);
  assert.ok(text.length / 500 < 8, `${(text.length / 500).toFixed(1)} chars per person`);
  assert.equal(decodePeople(JSON.parse(text), 2), null, 'ids written against other name lists are not trusted');
  assert.equal(decodePeople({ v: 1, n: 1, h: [[1, 'x', 5]] }, 1), null);
  assert.equal(decodePeople(null, 1), null);
});

test('a large panel record stays compact', () => {
  const entries = [];
  for (let i = 0; i < 3000; i++) entries.push(entry(`o${i % 6}`, `k${i % 4}`, i % 200, `b${i % 9}.0.${i % 10}`, 100 + (i % 50), { name: `The Brutii Wheat Farm ${i}` }));
  const text = JSON.stringify(encodePanelFrame(entries, { signature: 's', owners: [], era: [0, 0] }));
  assert.ok(text.length / entries.length < 90, `${Math.round(text.length / entries.length)} chars per icon`);
});

test('only the newest turns of records are kept', () => {
  const index = [];
  const evicted = [];
  for (let i = 0; i < 10; i++) evicted.push(...trackRecord(index, `pop${i}a`, 4));
  assert.deepEqual(index, ['pop6a', 'pop7a', 'pop8a', 'pop9a']);
  assert.deepEqual(evicted, ['pop0a', 'pop1a', 'pop2a', 'pop3a', 'pop4a', 'pop5a']);
  assert.deepEqual(trackRecord(index, 'pop7a', 4), [], 're-saving a turn moves it to the newest, not a duplicate');
  assert.deepEqual(index, ['pop6a', 'pop8a', 'pop9a', 'pop7a']);
});

test('writes are delayed, coalesced, produced when due, and spread one per tick', () => {
  let clock = 0, nextId = 1;
  const timers = new Map(), written = [];
  const queue = createWriteQueue((k, v) => written.push([k, v]), {
    delay: 1000, now: () => clock,
    schedule: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: clock + ms }); return id; },
    cancel: id => timers.delete(id),
  });
  let produced = 0;
  const advance = ms => {
    const end = clock + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); clock = Math.max(clock, due[1].at); due[1].fn();
    }
    clock = end;
  };
  queue.enqueue('a', () => { produced++; return 'one'; });
  queue.enqueue('a', () => { produced++; return 'two'; });
  queue.enqueue('b', () => 'bee');
  queue.enqueue('c', () => null);
  assert.equal(queue.size, 3);
  advance(500);
  assert.deepEqual(written, []);
  advance(600);
  assert.equal(written.length, 3 - 1, 'a null value is skipped');
  assert.deepEqual(written.find(w => w[0] === 'a'), ['a', 'two']);
  assert.equal(produced, 1, 'the superseded write was never produced');
  assert.equal(queue.size, 0);

  written.length = 0;
  queue.enqueue('x', () => 'x1'); queue.enqueue('y', () => 'y1'); queue.enqueue('z', () => 'z1');
  advance(1001);
  assert.ok(written.length >= 1);
  const afterFirstTick = written.length;
  advance(100000);
  assert.equal(written.length, 3);
  assert.ok(afterFirstTick <= 3);

  written.length = 0;
  queue.enqueue('k', () => 'kv'); queue.enqueue('m', () => { queue.enqueue('n', () => 'nv', 0); return 'mv'; });
  queue.flush();
  assert.deepEqual(written.map(w => w[0]).sort(), ['k', 'm', 'n'], 'flush also runs writes queued by writes');
  assert.equal(queue.size, 0);
  queue.enqueue('q', () => 'qv'); queue.clear();
  advance(100000);
  assert.ok(!written.some(w => w[0] === 'q'));
});

test('a failing write is reported and does not stop the others', () => {
  const written = [], errors = [];
  const queue = createWriteQueue((k, v) => { if (k === 'bad') throw new Error('full'); written.push(k); }, { delay: 0 });
  queue.onError = (key, e) => errors.push([key, e.message]);
  queue.enqueue('bad', () => 'x'); queue.enqueue('good', () => 'y');
  queue.flush();
  assert.deepEqual(written, ['good']);
  assert.deepEqual(errors, [['bad', 'full']]);
});
