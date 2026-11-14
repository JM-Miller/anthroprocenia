import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const { nearestNodeLookup } = await loadModule('anthroprocenia-townscape.js');
test('street lookup returns the same exact nearest node as a full scan, including ties and empty sets', () => {
  const nodes = Array.from({ length: 2500 }, (_, i) => ({ x: i % 50, y: Math.floor(i / 50) }));
  nodes.push({ ...nodes[0] });
  const indices = nodes.map((_, i) => i), nearest = nearestNodeLookup(nodes, indices);
  const saved = indices.slice();
  for (let i = 0; i < 300; i++) {
    const x = (i * 13.371) % 70 - 10, y = (i * 7.151) % 70 - 10;
    let best = -1, distance = Infinity;
    for (const id of indices) {
      const d = (nodes[id].x - x) ** 2 + (nodes[id].y - y) ** 2;
      if (d < distance) { distance = d; best = id; }
    }
    assert.equal(nearest(x, y), best);
  }
  assert.equal(nearest(0, 0), 0);
  assert.equal(nearest(0.5, 0.5), 0);
  assert.equal(nearestNodeLookup(nodes, [])(1, 1), -1);
  assert.equal(nearestNodeLookup(nodes, [2500])(0, 0), 2500);
  assert.deepEqual(indices, saved);
});
test('dense same-tile street lookup avoids the all-pairs coordinate scan', () => {
  let reads = 0;
  const nodes = Array.from({ length: 10000 }, (_, i) => ({
    get x() { reads++; return i % 100; },
    get y() { reads++; return Math.floor(i / 100); },
  }));
  const nearest = nearestNodeLookup(nodes, nodes.map((_, i) => i));
  reads = 0;
  for (let i = 0; i < 2000; i++) nearest((i * 17.13) % 100, (i * 7.19) % 100);
  assert.ok(reads < 300000, `${reads} coordinate reads; brute force requires 40 million`);
});
