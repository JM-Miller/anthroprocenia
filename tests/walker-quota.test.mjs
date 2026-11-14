import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const { stepWalker, visibleQuota, WALKER_FADE_SECONDS, VISIBLE_MIN_FRACTION, VISIBLE_MAX_FRACTION } = await loadModule('anthroprocenia-townscape.js');

function seeded(seed) {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
}
// A small street graph: a ring of 12 nodes, 8 of which are doors.
function ringGraph() {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos(i / 12 * Math.PI * 2) * 10, y: Math.sin(i / 12 * Math.PI * 2) * 10 }));
  const adj = nodes.map((_, i) => [(i + 1) % 12, (i + 11) % 12]);
  return { nodes, adj, doorForms: new Map([0, 1, 3, 4, 6, 7, 9, 10].map(i => [i, 'rect'])) };
}
function crowd(count, rand) {
  const graph = ringGraph(), quota = visibleQuota(count), people = [];
  const outside = new Set(Array.from({ length: count }, (_, i) => i).slice(0, quota.visible));
  const doors = [...graph.doorForms.keys()];
  for (let i = 0; i < count; i++) {
    const node = doors[Math.floor(rand() * doors.length)], indoors = !outside.has(i), wait = indoors ? WALKER_FADE_SECONDS + rand() * 5 : rand() * 3;
    people.push({ node, x: graph.nodes[node].x, y: graph.nodes[node].y, route: null, leg: 0, t: 0, wait, waitTotal: indoors ? wait + WALKER_FADE_SECONDS : wait, inside: indoors, exiting: false, fade: indoors ? 0 : 1, quota, speed: 4 + rand() * 3 });
  }
  const pick = () => doors[Math.floor(rand() * doors.length)];
  quota.people = people;
  return { graph, quota, people, pick };
}

test('the visible share is always between 30% and 60% (a lone person is always shown)', () => {
  assert.deepEqual(visibleQuota(10), { count: 10, min: 3, max: 6, visible: 5 });
  assert.deepEqual(visibleQuota(60), { count: 60, min: 18, max: 36, visible: 27 });
  assert.deepEqual(visibleQuota(1), { count: 1, min: 1, max: 1, visible: 1 });
  assert.deepEqual(visibleQuota(2), { count: 2, min: 1, max: 1, visible: 1 });
  for (let n = 1; n <= 200; n++) {
    const q = visibleQuota(n);
    assert.ok(q.visible >= q.min && q.visible <= q.max && q.max >= q.min, `n=${n}`);
    if (n >= 3) assert.ok(q.min / n >= VISIBLE_MIN_FRACTION - 1e-9 && q.max / n <= VISIBLE_MAX_FRACTION + 1e-9, `n=${n} ${q.min}-${q.max}`);
  }
});

test('while townscape people go in and out of doors, 30-60% of them stay in sight at every moment', () => {
  for (const count of [3, 5, 8, 13, 24, 40, 60]) {
    const rand = seeded(count * 7 + 1), { graph, quota, people, pick } = crowd(count, rand);
    let fewest = Infinity, most = -Infinity, entered = 0, left = 0, wasInside = people.map(p => p.inside);
    for (let step = 0; step < 4000; step++) {
      for (const person of people) stepWalker(person, graph, 0.1, pick, rand);
      const inSight = people.filter(p => !p.inside || p.exiting).length;
      assert.equal(inSight, quota.visible, `count=${count} step=${step}: the quota tracks who is in sight`);
      assert.ok(inSight >= quota.min && inSight <= quota.max, `count=${count} step=${step}: ${inSight} in sight, allowed ${quota.min}-${quota.max}`);
      fewest = Math.min(fewest, inSight / count); most = Math.max(most, inSight / count);
      people.forEach((p, i) => { if (p.inside && !wasInside[i]) entered++; if (!p.inside && wasInside[i]) left++; wasInside[i] = p.inside; });
      for (const p of people) assert.ok(p.fade >= 0 && p.fade <= 1 && Number.isFinite(p.x));
    }
    assert.ok(fewest >= 0.3 - 1e-9 && most <= 0.6 + 1e-9, `count=${count}: ${fewest.toFixed(2)}..${most.toFixed(2)}`);
    assert.ok(entered > count && left > count, `count=${count}: people kept going in (${entered}) and out (${left})`);
  }
});

test('people indoors really are out of sight and those coming out fade in', () => {
  const rand = seeded(99), { graph, people, pick } = crowd(20, rand);
  let hidden = 0, partial = 0;
  for (let step = 0; step < 1500; step++) {
    for (const person of people) stepWalker(person, graph, 0.1, pick, rand);
    for (const person of people) { if (person.fade === 0) hidden++; else if (person.fade < 1) partial++; }
  }
  assert.ok(hidden > 1000, `${hidden} person-steps fully indoors`);
  assert.ok(partial > 100, `${partial} person-steps fading`);
});

test('a townscape of one or two people never hides them all', () => {
  for (const count of [1, 2]) {
    const rand = seeded(5), { graph, people, pick } = crowd(count, rand);
    for (let step = 0; step < 2000; step++) {
      for (const person of people) stepWalker(person, graph, 0.1, pick, rand);
      assert.ok(people.some(p => !p.inside || p.exiting), `count=${count}`);
    }
  }
});
