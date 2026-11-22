import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const { navigableRiverCourses, riverEndpoints, riverDelta, visibleRiverDeltas } = await loadModule('anthroprocenia-river-deltas.js');
const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  let depth = 0, end = source.indexOf('{', start);
  assert.ok(start >= 0, name);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
const segment = (x1, x2, extra = {}) => ({ x1, y1: 0, x2, y2: 0, hw: 1, tile: 0, ...extra });

test('river endpoint topology deduplicates reversed tile records and excludes internal joints and clipping boundaries', () => {
  const edges = [segment(0, 10), segment(10, 0), segment(10, 20), segment(20, 30, { suppressEnd: true })];
  const ends = riverEndpoints(edges);
  assert.deepEqual(ends.map(e => e.x), [0]);
  assert.equal(ends[0].dx, -1);
  const seam = riverEndpoints([segment(95, 105), segment(5, 15)], 100);
  assert.deepEqual(seam.map(e => e.x), [95, 15]);
  assert.equal(seam[0].dx, -1);
});

test('delta branches meander deterministically, overlap the old cap, taper to points, and reserve their complete water corridors', () => {
  const end = { x: 20, y: 15, dx: 1, dy: 0, hw: 1, tile: 0 };
  const delta = riverDelta(end, 100);
  assert.deepEqual(delta, riverDelta(end, 100));
  assert.equal(delta.polygons.length, 3);
  assert.equal(delta.segments.length, 24);
  const middle = delta.polygons[1];
  assert.ok(middle[0][0] < end.x - end.hw, 'trunk covers the old rounded cap');
  assert.equal(middle[8][1], end.y, 'branch tip has zero width');
  assert.ok(delta.segments.slice(8, 16).some(s => Math.abs(s.y2 - end.y) > 0.1), 'not a straight wedge');
  for (const poly of delta.polygons) for (const [x, y] of poly) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= delta.box.x0 && x <= delta.box.x1 && y >= delta.box.y0 && y <= delta.box.y1);
  }
  assert.ok(delta.segments.every(s => s.hw > 0));
});

test('viewport culling wraps whole delta polygons without inventing endpoints at viewport edges', () => {
  const delta = riverDelta({ x: 99, y: 10, dx: 1, dy: 0, hw: 1 }, 10);
  const wrapped = visibleRiverDeltas([delta], { x0: 0, x1: 10, y0: 0, y1: 20 }, 100);
  assert.equal(wrapped.length, 1); assert.equal(wrapped[0].shift, -100);
  assert.equal(visibleRiverDeltas([delta], { x0: 0, x1: 10, y0: 40, y1: 50 }, 100).length, 0);
  assert.equal(visibleRiverDeltas([delta], { x0: 40, x1: 50, y0: 0, y1: 20 }, 100).length, 0);
});

test('merged navigable rivers have a meandering trunk, secondary forks and four tapered delta mouths', () => {
  const endpoint = { x: 20, y: 15, dx: 1, dy: 0, hw: 1, tile: 0, navigable: true };
  const delta = riverDelta(endpoint, 100);
  assert.deepEqual(delta, riverDelta(endpoint, 100));
  assert.equal(delta.polygons.length, 7, 'one trunk, two primary channels and four secondary channels');
  assert.equal(delta.segments.length, 56);
  assert.equal(riverEndpoints(delta.segments).length, 5, 'one attached root and four downstream tips, not seven disconnected fans');
  for (let branch = 0; branch < 7; branch++) {
    const samples = delta.segments.slice(branch * 8, (branch + 1) * 8);
    const start = samples[0], end = samples[7], dx = end.x2 - start.x1, dy = end.y2 - start.y1;
    const bend = Math.max(...samples.map(s => Math.abs(dx * (s.y2 - start.y1) - dy * (s.x2 - start.x1)) / Math.hypot(dx, dy)));
    assert.ok(bend > 0.05, 'each distributary meanders rather than forming a straight fan');
  }
  for (const polygon of delta.polygons) for (const [x, y] of polygon) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= delta.box.x0 && x <= delta.box.x1 && y >= delta.box.y0 && y <= delta.box.y1);
  }
  assert.ok(delta.segments.every(segment => segment.hw > 0), 'all new channels reserve collision water');
});

function fixture() {
  const element = () => ({ attrs: {}, style: {}, children: [],
    setAttribute(key, value) { this.attrs[key] = value; }, appendChild(path) { this.children.push(path); } });
  const ctx = vm.createContext({
    navigableRiverCourses, riverEndpoints, riverDelta, visibleRiverDeltas, showRivers: true,
    riverDom: { el: element() }, riverPath: element(), minorRiverPath: element(), coastRiverPath: element(),
    oceanRiverPath: element(), lakeRiverPath: element(), riverTwins: new Map(), riverPathKey: '',
    terrain: [10, 10, 1], basePos: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
    neighborsByIndex: [[1, -1, -1, -1, -1, -1], [2, 0, -1, -1, -1, -1], [-1, 1, -1, -1, -1, -1]], hexW: 100, hexH: 100, mapPxW: 300, mapPxH: 100,
    cityCenterSet: () => new Set(), readMapFeatureMarkers: () => new Map(), pos: 0, dotR: 0, MARKER_GAP: 0, colShift: 0,
    layoutRand: () => 0.2, syncMapSvgViewport() {}, dimCss: css => `dim:${css}`,
    TERRAIN_RGB: { 0: [0, 0, 100], 1: [0, 100, 200], 9: [0, 150, 200] },
    townscapeActive: () => ctx.active, active: true, townViewKey: () => `${ctx.active}|${ctx.mapPanX}`,
    viewZoom: 10, viewAspectY: 1, mapX: 1350, mapY: 450, mapPanX: 0, mapPanY: 0,
    window: { innerWidth: 3000, innerHeight: 1000 }, document: { createElementNS: element },
  });
  vm.runInContext("let riverTileSegs = new Map(), cityTiles, riverEdges, riverEdgeHw;\nlet riverDeltas = [], riverDeltaPaths = new Map(), riverDeltaViewKey = '';\n" +
    ['polygonPath', 'syncRiverVisibility', 'syncRiverDeltas', 'drawRiverLayer'].map(slice).join('\n'), ctx);
  return ctx;
}

test('river visibility hides normal, fogged and delta paths across cache hits and geometry rebuilds', () => {
  const ctx = fixture();
  ctx.drawRiverLayer(null, {});
  ctx.showRivers = false; ctx.syncRiverDeltas();
  assert.equal(ctx.riverPath.style.display, 'none');
  assert.ok([...ctx.riverTwins.values()].every(path => path.style.display === 'none'));
  ctx.pos++; ctx.drawRiverLayer([1, 1, 1], {}); ctx.syncRiverDeltas();
  assert.ok(ctx.riverDom.el.children.every(path => path.style.display === 'none'));
  ctx.showRivers = true; ctx.syncRiverDeltas();
  assert.equal(ctx.riverPath.style.display, '');
  assert.ok([...ctx.riverTwins.values()].every(path => path.style.display === ''));
});

test('actual river rendering adds both inland and sea deltas only at townscape scale, preserves fog and original line caps, and indexes new water', () => {
  const ctx = fixture();
  ctx.drawRiverLayer(null, {});
  const deltas = vm.runInContext('riverDeltas', ctx);
  assert.equal(deltas.length, 2, 'one inland end and one sea end; no delta at the coastline join');
  const d = ctx.riverDom.el.children.at(-1);
  assert.equal(d.attrs.stroke, 'none');
  assert.equal(deltas[0].x, 0, 'the inland endpoint is on the map seam');
  assert.ok(deltas.every(delta => delta.navigable && delta.polygons.length === 7));
  assert.equal((d.attrs.d.match(/Z/g) || []).length, 21, 'seven joined branches each for the sea end and both visible seam copies');
  assert.ok((d.attrs.d.match(/[MLZ]/g) || []).length <= 8192);
  assert.ok(d.attrs.d.length <= 262144);
  assert.ok(vm.runInContext('riverTileSegs.get(2).length', ctx) >= 24, 'new sea branches reserve collision water');
  const original = ctx.riverPath.attrs.d;
  ctx.active = false; ctx.syncRiverDeltas();
  assert.equal(d.style.display, 'none');
  assert.equal(ctx.riverPath.attrs.d, original, 'distant river appearance is unchanged');
  ctx.active = true; ctx.pos++; ctx.drawRiverLayer([1, 1, 1], {});
  assert.ok(ctx.riverDom.el.children.some(path => path.attrs.fill === 'dim:rgb(0,100,200)' && path.attrs.d));
  ctx.pos++; ctx.drawRiverLayer([2, 2, 0], {});
  assert.equal(vm.runInContext('riverDeltas.length', ctx), 1, 'fog boundary is not a physical river mouth');
  ctx.terrain = [10, 1, 1]; ctx.pos++; ctx.drawRiverLayer([2, 0, 0], {});
  assert.equal(vm.runInContext('riverDeltas.length', ctx), 0, 'an isolated visible tile beside hidden water has no invented mouths');
});

test('joined tile-edge rivers visibly meander without moving their shared endpoints or exceeding a modest bend', () => {
  const ctx = fixture();
  ctx.basePos = ctx.basePos.map(point => ({ ...point, x: point.x + 100 }));
  ctx.mapPxW = 600;
  ctx.drawRiverLayer(null, {});
  const courses = navigableRiverCourses(ctx.terrain, ctx.neighborsByIndex, ctx.basePos, ctx.hexW, ctx.hexH, ctx.mapPxW)
    .segments.filter(course => !course.water);
  const lines = [...ctx.riverPath.attrs.d.matchAll(/M([^,ML]+),([^ML]+)L([^,ML]+),([^ML]+)/g)]
    .map(match => match.slice(1).map(Number));
  assert.equal(lines.length, courses.length * 8);
  courses.forEach((course, index) => {
    const samples = lines.slice(index * 8, (index + 1) * 8);
    assert.ok(Math.hypot(samples[0][0] - course.from[0], samples[0][1] - course.from[1]) < 1e-8);
    assert.ok(Math.hypot(samples[7][2] - course.to[0], samples[7][3] - course.to[1]) < 1e-8);
    const dx = course.to[0] - course.from[0], dy = course.to[1] - course.from[1], length = Math.hypot(dx, dy);
    const deviation = Math.max(...samples.map(([x, y]) =>
      Math.abs(dx * (y - course.from[1]) - dy * (x - course.from[0])) / length));
    assert.ok(deviation > 1.5 && deviation <= 4, `moderate meander on a 100px tile, got ${deviation}`);
  });
});

test('touching navigable tiles form joined tile-edge courses without a mesh, including a wrapped outlet', () => {
  const terrain = [10, 10, 10, 1], positions = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 75 }, { x: 200, y: 0 }];
  const neighbors = [[1, -1, -1, -1, 2, -1], [3, 0, -1, -1, -1, 2], [-1, -1, 1, 0, -1, -1], [-1, 1, -1, -1, -1, -1]];
  const check = (positions, width) => {
    const result = navigableRiverCourses(terrain, neighbors, positions, 100, 100, width);
    const parent = new Map(), key = ([x, y]) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
    const root = key => { if (!parent.has(key)) parent.set(key, key); return parent.get(key) === key ? key : root(parent.get(key)); };
    for (const edge of result.segments) {
      const a = root(key(edge.from)), b = root(key(edge.to));
      assert.notEqual(a, b, 'no closed navigable-river nets');
      parent.set(a, b);
      if (!edge.water) {
        let dx = edge.to[0] - edge.from[0];
        if (width) dx -= Math.round(dx / width) * width;
        const dy = edge.to[1] - edge.from[1];
        assert.ok(Math.abs(dx) < 0.001 || Math.abs(Math.abs(dy / dx) - 0.5) < 0.001, 'channels follow shared hex edges, not tile-centre diagonals');
      }
    }
    assert.equal(new Set([...parent.keys()].map(root)).size, 1, 'branches join the same physical course');
    assert.equal(result.anchors.size, 3);
    assert.equal(result.segments.filter(edge => edge.water).length, 1, 'one joined mouth, not a fan to every water neighbour');
    return result;
  };
  check(positions, 400);
  check(positions.map(point => ({ ...point, x: (point.x + 300) % 400 })), 400);
});
