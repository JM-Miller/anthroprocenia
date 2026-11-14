import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
const packed = owner => owner * 8;
function scene(kind, own = true) {
  const ctx = vm.createContext({
    basePos: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 0, y: 100 }, { x: 150, y: 25 }, { x: 50, y: 25 }, { x: 150, y: 175 }, { x: 50, y: 175 }],
    neighborsByIndex: [[1, 2, 3, 4, 5, 6]], terrain: [kind, 4, 4, 10, 4, 10, 4],
    hexW: 100, hexH: 100, layoutCols: 20, showTerritory: true,
    EDGE_VERTS: [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]],
    readMapFeatureMarkers: () => new Map(), terrainCss: () => 'terrain',
    dimCss: color => 'dim:' + color,
  });
  vm.runInContext(['sharedTerritoryClaim', 'territoryClip', 'clipTerritoryPolygon', 'splitTerritoryFill', 'stateFillPush', 'hexVert', 'pushGroup'].map(slice).join('\n'), ctx);
  const frame = new Map([[1, packed(0)], [2, packed(1)], [3, packed(0)], [4, packed(1)]]);
  if (own) frame.set(0, packed(0));
  ctx.cellKeyFill = (i, map) => map.has(i) && ctx.showTerritory ? { key: 'F' + ((map.get(i) >> 3) & 63), fill: 'civ' + ((map.get(i) >> 3) & 63) } : { key: 'T', fill: 'terrain' };
  return { ctx, frame };
}
function area(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 2) { const j = (i + 2) % points.length; sum += points[i] * points[j + 1] - points[j] * points[i + 1]; }
  return Math.abs(sum) / 2;
}
function sharedSide(a, b) {
  for (let i = 0; i < a.length; i += 2) {
    const next = (i + 2) % a.length, ax = a[i], ay = a[i + 1], dx = a[next] - ax, dy = a[next + 1] - ay;
    const length = Math.hypot(dx, dy);
    if (length < 1e-8) continue;
    for (let j = 0; j < b.length; j += 2) {
      const end = (j + 2) % b.length;
      if (Math.abs(dx * (b[j + 1] - ay) - dy * (b[j] - ax)) > length * 1e-7
          || Math.abs(dx * (b[end + 1] - ay) - dy * (b[end] - ax)) > length * 1e-7) continue;
      const p = ((b[j] - ax) * dx + (b[j + 1] - ay) * dy) / length;
      const q = ((b[end] - ax) * dx + (b[end + 1] - ay) * dy) / length;
      if (Math.min(length, Math.max(p, q)) - Math.max(0, Math.min(p, q)) > 1e-6) return true;
    }
  }
  return false;
}
function gridScene(kind, wrap = false, neutral = false) {
  const { ctx } = scene(kind), width = 8, height = 7, frame = new Map(), markers = new Map();
  ctx.basePos = []; ctx.terrain = []; ctx.neighborsByIndex = []; ctx.layoutCols = width;
  ctx.readMapFeatureMarkers = () => markers;
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const i = row * width + col;
    ctx.basePos[i] = { x: col * 100 + (row & 1) * 50, y: row * 75 };
    const feature = row > 0 && row < height - 1 && [0, 3, 4, 7].includes(col);
    ctx.terrain[i] = feature && kind !== 'minorRiver' ? kind : 4;
    if (feature && kind === 'minorRiver') markers.set(i, 5);
    if (!(neutral && col === 3 && row > 0 && row < height - 1)) frame.set(i, packed(col < 4 ? 0 : 1));
    const at = (x, y) => y < 0 || y >= height || (!wrap && (x < 0 || x >= width)) ? -1 : y * width + (x + width) % width;
    const east = col + (row & 1), west = east - 1;
    ctx.neighborsByIndex[i] = [at(col + 1, row), at(col - 1, row), at(east, row - 1), at(west, row - 1), at(east, row + 1), at(west, row + 1)];
  }
  return { ctx, frame, width, wrap };
}
function fragments({ ctx, frame }) {
  const nodes = [];
  for (let tile = 0; tile < ctx.basePos.length; tile++) {
    const base = new Map(), top = new Map(), clip = ctx.territoryClip(tile, frame, null);
    ctx.stateFillPush(tile, frame, null, base, top);
    const layers = clip && clip.shared ? [top] : [base, top];
    for (const layer of layers) for (const [color, shapes] of layer) {
      if (!color.startsWith('civ')) continue;
      for (const shape of shapes) {
        const polygon = typeof shape === 'number' ? Array.from({ length: 6 }, (_, k) => Array.from(ctx.hexVert(shape, k))).flat() : Array.from(shape);
        nodes.push({ tile, color, polygon, anchor: !clip });
      }
    }
  }
  return nodes;
}
function unanchoredFragments(scene) {
  const nodes = fragments(scene), graph = nodes.map(() => []), { ctx, width, wrap } = scene;
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const first = nodes[a], second = nodes[b];
    if (first.color !== second.color || (first.tile !== second.tile && !ctx.neighborsByIndex[first.tile].includes(second.tile))) continue;
    const shifts = wrap ? [-width * ctx.hexW, 0, width * ctx.hexW] : [0];
    if (!shifts.some(shift => sharedSide(first.polygon, second.polygon.map((value, i) => value + (i % 2 === 0 ? shift : 0))))) continue;
    graph[a].push(b); graph[b].push(a);
  }
  const connected = new Set(), queue = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].anchor) { connected.add(i); queue.push(i); }
  for (let at = 0; at < queue.length; at++) for (const next of graph[queue[at]]) {
    if (!connected.has(next)) { connected.add(next); queue.push(next); }
  }
  return nodes.filter((node, i) => !connected.has(i));
}
test('shared feature fragments reach their civilization through full polygon sides, not vertex-only chains', () => {
  for (const kind of [2, 10, 'minorRiver']) for (const wrap of [false, true]) for (const neutral of [false, true]) for (const junction of [false, true]) {
    const scene = gridScene(kind, wrap, neutral), before = [...scene.frame];
    if (junction) for (const [tile, value] of scene.frame) {
      if (value === packed(1) && tile >= scene.width * 3) scene.frame.set(tile, packed(2));
    }
    const ownership = junction ? [...scene.frame] : before;
    const unanchored = unanchoredFragments(scene);
    assert.equal(unanchored.length, 0, `${kind}, wrap ${wrap}, neutral ${neutral}, junction ${junction}: disconnected fragments on ${unanchored.map(node => node.tile).join(',')}`);
    for (let tile = 0; tile < scene.ctx.basePos.length; tile++) {
      if (!scene.ctx.territoryClip(tile, scene.frame, null)?.shared) continue;
      const base = new Map(), top = new Map();
      scene.ctx.stateFillPush(tile, scene.frame, null, base, top);
      const polygons = [...top.values()].flat();
      const coverage = polygons.reduce((sum, shape) => sum + (typeof shape === 'number' ? 7500 : area(shape)), 0);
      assert.ok(Math.abs(coverage - 7500) < 1e-8, 'shared partitions cover exactly one hex');
      assert.ok(polygons.length <= 7, 'connected geometry remains bounded to a core and six edge pieces');
    }
    assert.deepEqual([...scene.frame], ownership, 'rendering must not alter actual ownership');
  }
});
test('incremental territory redraw includes every changed partition after neighboring ownership changes', () => {
  const { ctx, frame } = gridScene(2, true), fill = ctx.stateFillPush, repainted = new Set();
  const drawing = (tile, map) => {
    const base = new Map(), top = new Map();
    fill(tile, map, null, base, top);
    return JSON.stringify([[...base], [...top]]);
  };
  Object.assign(ctx, {
    lastStateFrame: frame, lastStateVis: null, lastStateIdent: new Map(), lastStatePos: 0, lastStateSig: 'same',
    stateSignature: () => 'same', identColorsEqual: () => true, identityForPos: () => new Map(),
    stateLayer: { ctx: { clearRect() {} } }, bgLayer: { el: {} }, HB: { walks: 0 }, borderT: 1,
    showBorders: false, showWonders: false, paintFillTiers() {}, paintEdgeFringe() {},
    stateFillPush(tile, ...args) { repainted.add(tile); fill(tile, ...args); },
  });
  vm.runInContext(['withNeighbors', 'tryPartialState'].map(slice).join('\n'), ctx);
  for (const [changed, value] of frame) {
    const next = new Map(frame); next.set(changed, packed(value === packed(0) ? 1 : 0));
    repainted.clear();
    assert.equal(ctx.tryPartialState(next, null), true);
    for (const tile of frame.keys()) {
      if (drawing(tile, frame) !== drawing(tile, next)) assert.ok(repainted.has(tile), `tile ${tile} was left stale when ${changed} changed ownership`);
    }
  }
});
test('owned and unowned shared river/mountain tiles are completely filled, with an opaque separate base and both civ colors', () => {
  for (const kind of [2, 10]) for (const own of [false, true]) {
    const { ctx, frame } = scene(kind, own), base = new Map(), top = new Map();
    ctx.stateFillPush(0, frame, null, base, top);
    assert.deepEqual([...base.values()].flat(), [0], `opaque base: terrain ${kind}, owned ${own}`);
    const polygons = [...top.values()].flat();
    assert.ok(Math.abs(polygons.reduce((n, points) => n + area(points), 0) - 7500) < 1e-8, 'all partition areas cover exactly the hex');
    assert.ok(top.has('civ0')); assert.ok(top.has('civ1'));
    assert.ok(polygons.every(points => points.every(Number.isFinite)));
    assert.equal(frame.has(0), own, 'visual fill never changes actual ownership');
  }
});
test('neutral terrain, undiscovered neighbors and territory visibility do not acquire phantom ownership colors', () => {
  const { ctx, frame } = scene(10, false), base = new Map(), top = new Map();
  const vis = [2, 2, 0, 2, 0, 2, 2];
  ctx.stateFillPush(0, frame, vis, base, top);
  assert.equal(top.size, 0); assert.equal(base.get('terrain')[0], 0);
  ctx.showTerritory = false; ctx.stateFillPush(0, frame, null, new Map(), top);
  assert.equal(top.size, 0);
  ctx.showTerritory = true; ctx.terrain[0] = 4;
  assert.equal(ctx.territoryClip(0, frame, null), null, 'ordinary unowned tiles remain neutral');
});
test('shared-tile fog dimming covers the full base and all partitions consistently', () => {
  const { ctx, frame } = scene(2, false), base = new Map(), top = new Map();
  ctx.stateFillPush(0, frame, [1, 2, 2, 2, 2, 2, 2], base, top);
  assert.ok([...base.keys(), ...top.keys()].every(color => color.startsWith('dim:civ')));
});
