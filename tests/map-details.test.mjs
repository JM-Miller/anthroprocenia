import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { loadModule } from './load.mjs';
const { captureMapDetails, mapDetailPaths, FOG_FRONTIER_BANDS } = await loadModule('anthroprocenia-map-details.js');
const positions = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
const neighbors = [[1, -1, -1, -1, -1, -1], [2, 0, -1, -1, -1, -1], [-1, 1, -1, -1, -1, -1]];
const vertices = [[50, 0], [100, 25], [100, 75], [50, 100], [0, 75], [0, 25]];
const vertex = (i, k) => [positions[i].x + vertices[k][0], vertices[k][1]];
test('capture preserves actual cliff neighbors, hills, and names of otherwise unknown features', () => {
  const map = { getLocationFromIndex: x => ({ x, y: 0 }), getTerrainType: x => x, getFeatureType: x => x,
    isCliffCrossing: (x, y, d) => (x === 0 && d === 0) || (x === 1 && d === 1),
    getAdjacentPlotLocation: ({ x }, d) => ({ x: x + (d === 0 ? 1 : -1), y: 0 }), getIndexFromXY: x => x };
  const info = { Terrains: { lookup: x => ({ TerrainType: x === 2 ? 'TERRAIN_HILLS' : 'TERRAIN_FLAT' }) },
    Features: { lookup: x => x === 1 ? { FeatureType: 'FEATURE_NEW_MODDED_LANDMARK', Name: 'New landmark' } : null } };
  assert.deepEqual(captureMapDetails(map, info, 3, 1, x => x), { cliffs: [[0, 1]], hills: [2], labels: [[1, 'New landmark']] });
  assert.throws(() => captureMapDetails({}, info, 3, 1, x => x), /requires/);
});
test('edge-aligned cliff and hill shapes respect natural visibility, with separate unseen and current-sight contours', () => {
  const details = { cliffs: [[0, 1]], hills: [2] };
  const paths = mapDetailPaths(details, positions, neighbors, vertex, null, [0, 1, 2], true, true);
  assert.match(paths.cliffs, /^M100.75,25.00L100.75,75.00/);
  assert.equal((paths.cliffs.match(/Z/g) || []).length, 1, 'a closed edge fringe, not an open line');
  assert.equal((paths.cliffFaces.match(/Z/g) || []).length, 2);
  assert.equal((paths.hills.match(/Q/g) || []).length, 9);
  for (const match of paths.hills.matchAll(/M([\d.-]+),[\d.-]+Q[\d.-]+,[\d.-]+ ([\d.-]+),[\d.-]+/g)) {
    assert.ok(Math.abs(Number(match[2]) - Number(match[1]) - 11) < 0.02, 'each hill is 11% of tile width, down from 32%');
  }
  assert.ok(paths.unseen); assert.ok(paths.sight);
  const fog = mapDetailPaths(details, positions, neighbors, vertex, [0, 1, 2], [0, 1, 2], false, false);
  for (const key of ['cliffs', 'cliffFaces', 'hills', 'unseen', 'sight']) assert.equal(fog[key], '');
  const hidden = mapDetailPaths(details, positions, neighbors, vertex, [0, 1, 0], null, true, false);
  for (const key of ['cliffs', 'cliffFaces', 'hills']) assert.equal(hidden[key], '');
});
test('feature detail geometry stays within the native vector ceilings on very large maps', () => {
  const details = { cliffs: Array.from({ length: 20_000 }, () => [0, 1]), hills: Array(20_000).fill(2) };
  const result = mapDetailPaths(details, positions, neighbors, vertex, null, [0, 1, 2], true, true);
  assert.equal(result.limited, true);
  for (const kind of ['cliffs', 'cliffFaces', 'hills', 'unseen', 'sight']) {
    assert.ok(result[kind].length <= 262144);
    assert.ok((result[kind].match(/[MLQZ]/g) || []).length <= 8192);
  }
});
test('frontier budgets count every painted gradient band, and distant edges are culled before drawing', () => {
  const positions = Array.from({ length: 20000 }, (_, i) => ({ x: i * 100, y: 0 }));
  const neighbors = positions.map((_, i) => [i + 1 < positions.length ? i + 1 : -1, i - 1, -1, -1, -1, -1]);
  const vertex = (i, k) => [i * 100 + vertices[k][0], vertices[k][1]];
  const visibility = positions.map((_, i) => i % 3);
  const all = mapDetailPaths(null, positions, neighbors, vertex, null, visibility, false, true);
  const commands = paths => ((paths.unseen + paths.sight).match(/[ML]/g) || []).length * FOG_FRONTIER_BANDS.length;
  assert.equal(all.limited, true); assert.ok(commands(all) <= 8192);
  assert.ok((all.unseen.length + all.sight.length) * FOG_FRONTIER_BANDS.length <= 262144);
  const view = { x0: 999900, x1: 1000100, y0: 0, y1: 100 };
  const nearby = mapDetailPaths(null, positions, neighbors, vertex, null, visibility, false, true, view);
  assert.equal(nearby.limited, false); assert.ok(commands(nearby) > 0 && commands(nearby) < 100);
  for (const point of (nearby.unseen + nearby.sight).matchAll(/[ML]([\d.]+),[\d.]+/g)) {
    assert.ok(Number(point[1]) >= view.x0 && Number(point[1]) <= view.x1);
  }
});
test('map details retain filled cliff decorations and gray gradient bands, and explicitly hide disabled natural features and frontiers', async () => {
  const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
  const layer = { children: [], appendChild(path) { this.children.push(path); } };
  const ctx = vm.createContext({
    riverDom: { el: layer }, basePos: positions, neighborsByIndex: neighbors, hexVert: vertex, mapDetailPaths, FOG_FRONTIER_BANDS,
    mapDetailsState: { data: { cliffs: [[0, 1]], hills: [2] }, paths: {}, limited: false },
    pos: 0, manifest: { rev: 1 }, hexW: 100, hexH: 100, colShift: 0,
    showNaturalFeatures: true, fogMode: false, showFogFootprint: true, visForPos: () => [0, 1, 2],
    mapVisible: true, townVisible: false, townscapeActive: () => ctx.townVisible, decorViewRect: () => null,
    document: { createElementNS: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) },
  });
  vm.runInContext(source.slice(source.indexOf('function syncMapDetailVisibility()'), source.indexOf('let fogLocked =')), ctx);
  ctx.drawMapDetails(null);
  const paths = ctx.mapDetailsState.paths;
  assert.equal(paths.cliffs.attrs.stroke, 'none'); assert.equal(paths.cliffs.attrs.fill, '#797367');
  assert.equal(paths.cliffFaces.attrs.fill, '#a39b89'); assert.equal(layer.children.length, 15);
  for (const kind of ['unseen', 'sight']) {
    for (let n = 0; n < 6; n++) {
      const path = paths[kind + n];
      assert.ok(path.attrs.d); assert.equal(path.style.display, 'block');
      assert.equal(path.attrs['stroke-dasharray'], undefined);
      assert.equal(path.attrs.stroke, kind === 'unseen' ? '#303236' : '#c4c5c7');
      if (n) {
        assert.ok(Number(path.attrs['stroke-width']) < Number(paths[kind + (n - 1)].attrs['stroke-width']));
        assert.ok(Number(path.attrs['stroke-opacity']) > Number(paths[kind + (n - 1)].attrs['stroke-opacity']));
      }
    }
  }
  ctx.showNaturalFeatures = false; ctx.drawMapDetails(null);
  for (const kind of ['cliffs', 'cliffFaces', 'hills']) assert.equal(paths[kind].style.display, 'none');
  assert.equal(paths.unseen0.style.display, 'block', 'Revealed terrain is independent of Natural features');
  ctx.showFogFootprint = false; ctx.drawMapDetails(null);
  assert.ok(layer.children.every(path => path.style.display === 'none'));
  ctx.showNaturalFeatures = true; ctx.showFogFootprint = true; ctx.drawMapDetails(null);
  assert.ok(layer.children.every(path => path.style.display === 'block'));
  ctx.townVisible = true; ctx.syncMapDetailVisibility();
  for (const kind of ['cliffs', 'cliffFaces', 'hills']) assert.equal(paths[kind].style.display, 'none', 'hide immediately at townscape zoom');
  assert.equal(paths.unseen0.style.display, 'block', 'frontiers are not natural-feature glyphs');
  ctx.drawMapDetails(null); assert.equal(paths.hills.attrs.d, '');
  ctx.townVisible = false; ctx.drawMapDetails(null);
  for (const kind of ['cliffs', 'cliffFaces', 'hills']) assert.equal(paths[kind].style.display, 'block');
  ctx.fogMode = true; ctx.drawMapDetails([0, 1, 2]);
  for (const kind of ['unseen', 'sight']) for (let n = 0; n < 6; n++) assert.equal(paths[kind + n].style.display, 'none');
  assert.equal(layer.children.length, 15, 'no per-edge or per-update gradient nodes');
});
test('detail recording helper is at intact recorder module scope', async () => {
  const source = await readFile(new URL('../anthroprocenia/ui/history/anthroprocenia-recorder.js', import.meta.url), 'utf8');
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '-e', "new (require('node:vm').SourceTextModule)(require('node:fs').readFileSync(0,'utf8'));"],
    { input: source + '\nexport { captureMapDetailSnapshot };', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
