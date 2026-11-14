import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const links = await loadModule('anthroprocenia-townlinks.js');
const town = await loadModule('anthroprocenia-townscape.js');
const crowds = await loadModule('anthroprocenia-crowds.js');
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
function context(names, state = {}) {
  const ctx = vm.createContext({ ...town, ...links, ...crowds, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
const road = (a, b, home = 'home') => ({ pts: [{ x: a, y: 0 }, { x: b, y: 0 }], towns: [home] });
const roadBanks = () => [road(-2, -0.3), road(0.3, 2)];
const wet = (x, y) => Math.abs(x) < 0.25 && Math.abs(y) < 3;

test('only nearby facing road ends across water receive deterministic deck-and-rail bridges', () => {
  const options = { width: 0.15, maxSpan: 1, isWet: wet };
  const first = links.bridgeRoadGaps(roadBanks(), options);
  assert.equal(first.bridges.length, 1);
  assert.equal(first.roads.length, 1);
  assert.deepEqual(first.roads[0].towns, ['home']);
  const bridge = first.bridges[0];
  assert.equal(bridge.rails.length, 2);
  assert.equal(town.validBuildingPolygon(bridge.poly), true);
  assert.ok(town.pointInPolygon(0, 0, bridge.poly));
  assert.deepEqual(links.bridgeRoadGaps(roadBanks(), options), first);
  assert.equal(links.bridgeRoadGaps(roadBanks(), { ...options, isWet: () => false }).bridges.length, 0);
  assert.equal(links.bridgeRoadGaps(roadBanks(), { ...options, clear: () => false }).bridges.length, 0);
  assert.equal(links.bridgeRoadGaps(roadBanks(), { ...options, maxSpan: 0.5 }).bridges.length, 0);
  const perpendicular = roadBanks();
  perpendicular[1].pts[1] = { x: 0.3, y: 2 };
  assert.equal(links.bridgeRoadGaps(perpendicular, options).bridges.length, 0, 'roads must point toward each other');
  const farBanks = [road(-20, -10), road(10, 20)];
  assert.equal(links.bridgeRoadGaps(farBanks, options).bridges.length, 0, 'no open-sea bridges');
  const many = Array.from({ length: 10 }, (_, i) => roadBanks().map(r => ({ ...r, pts: r.pts.map(p => ({ ...p, y: i * 5 })) }))).flat();
  assert.equal(links.bridgeRoadGaps(many, { ...options, isWet: x => Math.abs(x) < 0.25, limit: 3 }).bridges.length, 3);
});

function creekScene() {
  const ctx = context(['townDryRoads', 'townBridgeRoads', 'linePath', 'segmentTouchesWater', 'walkEdgeAllowed',
    'townWalkCrossings', 'buildTownWorld', 'walkGraphFor', 'buildWalkGraph', 'townPointBlocked'], {
    hexW: 100, hexH: 100, mapPxW: 1000, basePos: [{ x: 0, y: 0 }], neighborsByIndex: [[]], terrain: [5],
    isWaterAt: () => false, townKey: 'bridges', townSpots: () => [],
  });
  const entry = { pathKey: 'home', center: { x: 0, y: 0 }, radius: 1, item: { index: 0 }, final: [],
    shapes: { streets: [[[-0.5, 0], [0.5, 0]]], nodes: [[-0.5, 0], [0.5, 0]], edges: [[0, 1]],
      water: [[[0, -2], [0, 2]]], pools: [] },
    obstacles: { circles: [], segments: [], roads: [] } };
  const plan = { roads: [], water: [], rivers: [], bridges: [] };
  ctx.townDryRoads([entry], plan);
  return { ctx, entry, plan };
}

test('real road clipping, bridge decoration and walking graph reconnect local streets over creeks', () => {
  const { ctx, entry, plan } = creekScene();
  assert.equal(entry.dryMinorRoads.length, 2);
  const before = ctx.buildTownWorld([entry], plan);
  assert.equal(town.graphRoute(before.graph, 0, 1), null);
  ctx.townBridgeRoads([entry], plan);
  assert.equal(plan.bridges.length, 1);
  assert.ok(entry.linkRoads.some(r => r.kind === 'bridge'));
  const built = ctx.buildTownWorld([entry], plan);
  const route = town.graphRoute(built.graph, 0, 1);
  assert.ok(route, 'the same graph used by walkers actually crosses the bridge');
  assert.equal(built.graph.edgeAllowed({ x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }), false, 'a nearby bridge does not permit crossing elsewhere');
  const walker = { node: 0, x: -0.5, y: 0, route, leg: 0, t: 0, wait: 0, fade: 1, speed: 0.1 };
  for (let i = 0; i < 120; i++) town.stepWalker(walker, built.graph, 0.1, () => 1, () => 0);
  assert.equal(walker.node, 1);
  assert.equal(walker.x, 0.5);
  assert.equal(walker.y, 0);
  assert.ok(slice('syncTownscapes').indexOf('townBridgeRoads(entries, plan)') < slice('syncTownscapes').indexOf('townBuildingGround(entries, plan)'));
});

test('additional bridges join skewed opposing road banks but never perpendicular streets or dry gaps', () => {
  const roads = [
    { pts: [{ x: -0.5, y: -0.4 }, { x: -0.2, y: 0 }], towns: ['home'] },
    { pts: [{ x: 0.2, y: 0 }, { x: 0.5, y: 0.4 }], towns: ['home'] },
  ];
  const options = { width: 0.01, maxSpan: 1, isWet: x => Math.abs(x) < 0.15 };
  assert.equal(links.bridgeRoadGaps(roads, options).bridges.length, 0);
  const widerAngle = { ...options, minFacing: 0.7 };
  // 45-degree banks are eligible; 90-degree banks are not.
  roads[0].pts[0].y = -0.3; roads[1].pts[1].y = 0.3;
  const built = links.bridgeRoadGaps(roads, widerAngle);
  assert.equal(built.bridges.length, 1);
  assert.equal(built.roads[0].kind, 'bridge');
  assert.deepEqual(links.bridgeRoadGaps(roads, widerAngle), built);
  assert.equal(links.bridgeRoadGaps(roads, { ...widerAngle, isWet: () => false }).bridges.length, 0);
  roads[1].pts[1] = { x: 0.2, y: 1 };
  assert.equal(links.bridgeRoadGaps(roads, widerAngle).bridges.length, 0);
  assert.match(slice('townBridgeRoads'), /limit: 256, minFacing: 0\.7/);
});

test('bridge decks permit actual water-tile crossing only inside their narrow footprint, including commanded walkers', () => {
  const ctx = context(['segmentTouchesWater', 'walkEdgeAllowed'], { isWaterAt: wet, hexW: 100 });
  const plan = links.bridgeRoadGaps(roadBanks(), { width: 0.15, maxSpan: 1, isWet: wet });
  const a = { x: -0.5, y: 0 }, b = { x: 0.5, y: 0 };
  assert.equal(ctx.walkEdgeAllowed(a, b, [], []), false);
  assert.equal(ctx.walkEdgeAllowed(a, b, [], plan.bridges), true);
  assert.equal(ctx.walkEdgeAllowed({ x: -0.5, y: 0.2 }, { x: 0.5, y: 0.2 }, [], plan.bridges), false);
  assert.equal(ctx.walkEdgeAllowed({ x: -0.5, y: 0 }, { x: 0.5, y: 0.3 }, [], plan.bridges), false);
  const graph = { nodes: [a, b], adj: [[1], [0]], edgeAllowed: (a, b) => ctx.walkEdgeAllowed(a, b, [], plan.bridges) };
  const walker = { node: 0, ...a, speed: 0.1, cmd: { route: [0, 1], x: b.x, y: b.y } };
  for (let i = 0; i < 110; i++) town.stepCommanded(walker, graph, 0.1);
  assert.equal(walker.cmd.arrived, true);
  assert.equal(walker.x, b.x);
  assert.equal(walker.cmd.blocked, undefined);
});

test('townscape pools reject ordinary walking edges and accept only actual bridge deck crossings', () => {
  const { ctx, entry, plan } = creekScene();
  entry.shapes.water = [];
  entry.shapes.pools = [[[-0.2, -0.5], [0.2, -0.5], [0.2, 0.5], [-0.2, 0.5]]];
  ctx.townDryRoads([entry], plan);
  const a = { x: -0.5, y: 0 }, b = { x: 0.5, y: 0 };
  assert.equal(ctx.buildTownWorld([entry], plan).graph.edgeAllowed(a, b), false);
  ctx.townBridgeRoads([entry], plan);
  assert.equal(plan.bridges.length, 1);
  const graph = ctx.buildTownWorld([entry], plan).graph;
  assert.equal(graph.edgeAllowed(a, b), true);
  assert.equal(graph.edgeAllowed({ x: -0.5, y: 0.3 }, { x: 0.5, y: 0.3 }), false);
  assert.equal(graph.edgeAllowed({ x: 0, y: 0.2 }, { x: 0, y: 0.3 }), false, 'no walking inside an unbridged pool');
});

test('bridge planning respects tree obstacles and reserves its roadway in building and decoration geometry', () => {
  const { ctx, entry, plan } = creekScene();
  entry.obstacles.circles.push({ x: 0, y: 0, r: 0.1 });
  ctx.townBridgeRoads([entry], plan);
  assert.equal(plan.bridges.length, 0);
  entry.obstacles.circles.length = 0;
  ctx.townBridgeRoads([entry], plan);
  assert.equal(plan.bridges.length, 1);
  const ground = context(['townBuildingGround'], { hexW: 100 }).townBuildingGround([entry], plan);
  assert.equal(ground.clear([[-0.01, -0.01], [0.01, -0.01], [0.01, 0.01], [-0.01, 0.01]], 0), false);
  assert.match(slice('townDecorationIndex'), /plan\.bridges/);
});

test('each crowd path contains exactly one distinct polygon per member and reuses cached templates', () => {
  for (const military of [false, true]) for (let count = 2; count <= 64; count++) {
    const shape = crowds.crowdDotPath(count, 1.6, military);
    assert.equal(shape.d.split('M').length - 1, count);
    assert.equal(shape.d.split('Z').length - 1, count);
    assert.equal(new Set(shape.d.split('M').slice(1)).size, count);
    assert.ok(shape.radius > 1.6);
    assert.equal(crowds.crowdDotPath(count, 1.6, military), shape);
  }
});

test('retained crowd SVG paths batch by color, never numeric circles or per-person nodes', () => {
  let writes = 0;
  const root = { children: [], appendChild(el) { this.children.push(el); } };
  const ctx = context(['syncCrowdDots', 'syncWalkerDots', 'syncCrowdVisibility'], {
    ...crowds, hexH: 100, viewZoom: 120, window: { innerHeight: 1000 },
    peopleActive: () => true, walkerCrowdsActive: () => true,
    peopleSvg: null,
    viewAspectY: 1,
    ps: n => n, peopleClumpPaths: [], townPeople: root,
    document: { createElementNS: (ns, tag) => ({ tag, attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; writes++; } }) },
  });
  const markers = [{ x: 10, y: 20, members: Array(32), clump: { military: false } },
    { x: 80, y: 20, members: Array(64), clump: { military: true } }];
  ctx.syncCrowdDots(markers, 1.6);
  assert.equal(root.children.length, 2);
  assert.ok(root.children.every(el => el.tag === 'path' && !el.attrs['font-size']));
  assert.equal(root.children[0].attrs.d.split('M').length - 1, 32);
  assert.equal(root.children[1].attrs.d.split('M').length - 1, 64);
  const initial = writes;
  for (let frame = 0; frame < 100; frame++) ctx.syncCrowdDots(markers, 1.6);
  assert.equal(writes, initial, 'unchanged frames perform zero crowd DOM writes');
  markers[0].x++;
  ctx.syncCrowdDots(markers, 1.6);
  assert.equal(writes, initial + 1, 'movement updates one batch, not per-person elements');
  ctx.syncCrowdDots([], 1.6);
  assert.ok(root.children.every(el => el.attrs.d === ''), 'coarse-to-close transition clears retained crowd paths');
  ctx.syncCrowdDots(markers, 1.6);
  assert.equal(root.children.length, 2);
  assert.match(slice('clumpAt'), /marker\.radius/);
  assert.doesNotMatch(slice('peopleTick'), /peopleCounts|font-size|dot\.count/);
});

test('7,200 isolated crowds render in two color batches without dropping members or hit radii', t => {
  const root = { children: [], appendChild(el) { this.children.push(el); } };
  const ctx = context(['syncCrowdDots', 'syncWalkerDots', 'syncCrowdVisibility'], {
    ...crowds, ps: n => n, viewAspectY: 0.5, peopleSvg: null,
    hexH: 100, viewZoom: 240, window: { innerHeight: 1000 },
    peopleActive: () => true, walkerCrowdsActive: () => true,
    peopleClumpPaths: [], townPeople: root,
    document: { createElementNS: () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } }) },
  });
  const markers = Array.from({ length: 7200 }, (_, i) => ({
    x: i % 120, y: Math.floor(i / 120), members: [i], clump: { military: i % 2 === 0 },
  }));
  ctx.syncCrowdDots(markers, 6);
  assert.equal(root.children.length, 2, 'was one native SVG element per isolated crowd');
  assert.equal(root.children.reduce((sum, path) => sum + (path.attrs.d.match(/Z/g) || []).length, 0), 7200);
  assert.deepEqual(new Set(root.children.map(path => path.attrs.fill)), new Set(['#ffd76a', 'rgb(255,246,214)']));
  assert.ok(markers.every(marker => marker.radius === 8), 'individual crowd picking still covers the full dot');
  ctx.syncCrowdDots([], 6);
  assert.ok(root.children.every(path => path.attrs.d === ''));
  t.diagnostic('7,200 isolated crowd elements reduced to 2; all 7,200 member polygons retained');
});

test('7,200 individual walkers retain position, scale and fade with bounded reusable SVG batches', () => {
  const paths = [], root = { children: [], appendChild(el) { this.children.push(el); } };
  const ctx = context(['syncWalkerDots'], {
    ...crowds, peopleDotPaths: paths, townPeople: root,
    document: { createElementNS: () => ({ attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; } }) },
  });
  const dots = Array.from({ length: 7200 }, (_, i) => ({
    x: i % 120, y: Math.floor(i / 120), radius: 6, fade: (i % 15 + 1) / 15,
  }));
  ctx.syncWalkerDots(dots);
  assert.equal(root.children.length, 15);
  assert.equal(paths.reduce((sum, path) => sum + (path.attrs.d.match(/Z/g) || []).length, 0), 7200);
  assert.equal(new Set(paths.map(path => path.attrs.opacity)).size, 15);
  for (let i = 0; i < 10; i++) {
    ctx.syncWalkerDots([]);
    assert.ok(paths.every(path => path.attrs.d === ''), 'old batches clear even when the new view has no dots');
    ctx.syncWalkerDots(dots.slice(0, 5));
    assert.equal(root.children.length, 15, 'bounded pool survives repeated pan/reset cycles');
  }
});

test('walking graph cache invalidates subpixel road changes rather than rounding them to whole map pixels', () => {
  let builds = 0;
  const ctx = context(['walkGraphFor'], { buildWalkGraph: () => ({ serial: ++builds }) });
  const entry = { final: [{ sourceIndex: 0 }], linkRoads: [road(0.01, 0.02)] };
  const first = ctx.walkGraphFor(entry);
  assert.equal(ctx.walkGraphFor(entry), first);
  entry.linkRoads[0].pts[0].x += 0.001;
  assert.notEqual(ctx.walkGraphFor(entry), first);
  assert.equal(builds, 2);
});

test('town layout entries invalidate on actual geometry changes, not icon display size', () => {
  let builds = 0;
  const ctx = context(['townscapeCached'], {
    pos: 0, frames: [0], detailD: 4, hexW: 20, hexH: 23, mapPxW: 1000,
    townEntryCache: new Map(), townscapeFor: () => ({ serial: ++builds }),
  });
  const p = { x: 1, y: 1, s: 1, item: { kind: 'building', index: 0, typeIndex: 0 } };
  const first = ctx.townscapeCached(p);
  p.s = 5;
  assert.equal(ctx.townscapeCached(p), first, 'zooming an icon cannot rebuild its town');
  ctx.hexW = 40;
  assert.notEqual(ctx.townscapeCached(p), first);
  const resized = ctx.townscapeCached(p);
  ctx.detailD = 8;
  assert.notEqual(ctx.townscapeCached(p), resized);
});
