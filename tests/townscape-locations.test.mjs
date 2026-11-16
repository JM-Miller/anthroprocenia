import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const links = await loadModule('anthroprocenia-townlinks.js');
const names = await loadModule('anthroprocenia-linenames.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const { DECO_GROUPS } = await loadModule('anthroprocenia-townscape.js');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
}
function context(functions, state) {
  const ctx = vm.createContext({ lastMapInputTs: 0, ...state });
  if (!functions.includes('townHousingFor')) functions = ['townHousingFor', ...functions];
  vm.runInContext(functions.map(slice).join('\n'), ctx);
  return ctx;
}
const line = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y2 }];
const town = (id, x = 0, extra = {}) => ({ id, x, y: 0, radius: 10, nodes: [], roads: [], water: [], ...extra });

test('major streets connect from both ends beyond the old gap to map roads, never across forbidden water', () => {
  const street = line(-5, 0, 5, 0), west = line(-60, -20, -60, 20), east = line(60, -20, 60, 20);
  const opts = { towns: [town('a', 0, { mainStreets: [street] })], mapRoads: [west, east], width: 0.1 };
  const plan = links.planTownLinks(opts);
  assert.equal(plan.roads.length, 2);
  assert.ok(plan.roads.some(r => r.pts.some(p => p.x === -60)));
  assert.ok(plan.roads.some(r => r.pts.some(p => p.x === 60)));
  assert.equal(plan.linksByTown.get('a').length, 2, 'new roads are wired into the shared walker graph');
  const blocked = links.planTownLinks({ ...opts, allow: () => false });
  assert.equal(blocked.roads.length, 0);
});

test('major streets and creeks connect townscapes beyond the former neighbour distance', () => {
  const towns = [
    town('a', 0, { mainStreets: [line(-5, 0, 5, 0)], water: [line(-5, 5, 5, 5)] }),
    town('b', 80, { mainStreets: [line(75, 0, 85, 0)], water: [line(75, 5, 85, 5)] }),
  ];
  const plan = links.planTownLinks({ towns, width: 0.1 });
  for (const lines of [plan.roads, plan.water]) {
    assert.ok(lines.length > 0);
    assert.ok(lines.some(l => l.towns.includes('a') && l.towns.includes('b')));
    assert.ok(lines.every(l => l.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
  }
});

test('closed waterways connect to external rivers and new roads crossing townscape creeks have bridges', () => {
  const closed = [...line(-5, 5, 5, 5), { x: 5, y: 8 }, { x: -5, y: 5 }];
  const plan = links.planTownLinks({
    towns: [town('a', 0, { mainStreets: [line(0, -5, 0, 0)], water: [closed] })],
    mapRoads: [line(-10, 15, 10, 15)],
    rivers: [{ x1: 50, y1: -10, x2: 50, y2: 10, clear: 1 }], width: 0.1,
  });
  assert.ok(plan.water.some(l => l.pts.some(p => p.x === 50)), 'closed moat joins an external river too');
  assert.ok(plan.bridges.some(b => Math.abs(b.x) < 1e-8 && b.y >= 5 && b.y <= 8));
  const alone = links.planTownLinks({ towns: [town('a', 0, { mainStreets: [line(-5, 0, 5, 0)] })] });
  assert.equal(alone.roads.length, 0, 'no fabricated destination when no other road or town exists');
});

test('the playback supplies indexed nearby roads and navigable river geometry to the link planner', () => {
  let captured;
  const riverTileSegs = new Map([[10, [{ x1: 0, y1: -2, x2: 0, y2: 2, hw: 3 }]]]);
  const road = { pts: [...line(60, -20, 60, 20), { x: 90, y: 42 }] };
  const ctx = context(['planEntryLinks'], {
    hexW: 20, hexH: 24, mapPxW: 500, basePos: { 10: { x: 80, y: 30 } },
    townLinkTile: () => 10, neighborsByIndex: { 10: [1, 2] }, iconPoints: [], fogMode: false,
    riverTileSegs, roadLines: new Map([[1, [road]], [2, [road]]]),
    townPointBlocked: () => false, segmentTouchesWater: () => false, townTileWalls: () => [],
    planTownLinks: opts => { captured = opts; return links.planTownLinks(opts); },
  });
  const entry = { item: { index: 10 }, pathKey: 'a', center: { x: 0, y: 0 }, radius: 10,
    shapes: { nodes: [], mainStreets: [[[-0.5, 0], [0.5, 0]]], streets: [], water: [[[-0.5, 0.5], [0.5, 0.5]]] },
    obstacles: { segments: [], roads: [] } };
  const plan = ctx.planEntryLinks([entry]);
  assert.equal(captured.mapRoads.length, 1, 'map roads are deduplicated');
  assert.equal(captured.rivers.length, 1);
  assert.equal(captured.rivers[0].clear, 3, 'includes wide navigable river segments');
  assert.ok(plan.roads.some(r => r.pts.some(p => p.x === 60)));
  assert.ok(plan.water.some(r => r.pts.some(p => p.x === 90)));
  assert.ok(entry.linkRoads.length > 0);
});

function namedEntry(population = 11) {
  const building = (x, y, w) => ({ group: 'house', box: { x0: x, y0: y, x1: x + w, y1: y + w }, poly: [[x, y], [x + w, y], [x + w, y + w], [x, y + w]] });
  const final = [building(0, 0, 2), building(3, 0, 1), building(5, 0, 1)].map((b, sourceIndex) => ({ ...b, sourceIndex }));
  return { pathKey: 'a', item: {}, center: { x: 10, y: 20 }, radius: 10, population, kind: 'town', civKey: 'CIVILIZATION_ROME',
    shapes: { mainStreets: [[[-1, 0], [1, 0]]], streets: [[[-1, 0.5], [1, 0.5]], [[-1, 0.7], [1, 0.7]]], water: [[[-1, 0.9], [1, 0.9]]] },
    final, polys: final };
}
test('every home gets a title, every minor line a name, and estimated building populations sum to the home total', () => {
  const ctx = context(['townLineSpec', 'buildTownLabelSpecs'], { ...names, ...panel, itemHomeName: () => 'Roma', popState: {} });
  for (const population of [0, 2, 11, 10000000]) {
    const entry = namedEntry(population);
    const specs = ctx.buildTownLabelSpecs([entry], { roads: [], water: [] });
    const title = specs.find(s => s.kind === 'home');
    assert.equal(title.text, 'Roma');
    assert.equal(title.rank, 0);
    assert.ok(title.pts[0].y <= Math.min(...entry.final.map(b => b.box.y0)));
    assert.equal(specs.filter(s => s.kind === 'street').length, 2);
    assert.equal(specs.filter(s => s.kind === 'creek').length, 1);
    assert.equal(entry.final.reduce((n, b) => n + b.population, 0), population);
    assert.ok(entry.final.every(b => b.name && Number.isInteger(b.population)));
  }
});

test('home grounds and individual buildings have distinct population tooltips, with person hits retaining priority', () => {
  const entry = namedEntry(), hit = { item: {}, entry };
  entry.homeName = 'Roma';
  const ctx = context(['townHomeAt', 'townLocationTipText'], {
    ...panel,
    townElementVisibility: { townRoofs: true }, townLayer: { style: { display: 'block' } }, cmdMapPoint: (x, y) => ({ x, y }), townHits: [hit],
    formatCount: n => String(n), itemHomeName: () => 'Roma', itemTipText: () => 'Recorded Home', populationForItem: () => 11,
  });
  assert.equal(ctx.townHomeAt(10, 20), hit, 'empty grounds inside the home are hoverable');
  assert.equal(ctx.townHomeAt(100, 200), null);
  assert.match(ctx.townLocationTipText(hit), /Home Location: Roma\[N\]Population: 11/);
  hit.building = entry.final[0]; hit.building.name = 'Domus Lucia';
  assert.match(ctx.townLocationTipText(hit), /Domus Lucia\[N\]Lives here: 9/);
  assert.match(ctx.townLocationTipText(hit), /Home population: 11/);
  ctx.populationForItem = () => 14;
  assert.match(ctx.townLocationTipText(hit), /Lives here: 10/);
  assert.match(ctx.townLocationTipText(hit), /Home population: 14/, 'reflects population changes without a geometry rebuild');
  ctx.townLayer.style.display = 'none';
  assert.equal(ctx.townHomeAt(10, 20), null);
  const hover = slice('onMapHoverInner');
  assert.ok(hover.indexOf('if (personHit)') < hover.indexOf('townHomeAt(x, y)'));
  assert.match(hover, /townLocationTipText\(target\)/);
  assert.match(slice('popRowTip'), /Population: \$\{formatThousands\(row.node.total\)\}/);
});

test('all building fills and roof details render above ground elements, fires and battle accents', () => {
  const layer = () => ({ children: [], style: {}, classList: { add() {} }, appendChild(child) { this.children.push(child); } });
  const ctx = context(['ensureTownscapeLayer'], {
    townLayer: null, townDecorationLayer: null, townPaths: null, DECO_GROUPS, MAP_DEPTH: 0, opaqueTownColor: x => x,
    document: { createElementNS: (ns, tag) => tag === 'svg' ? layer() : { setAttribute() {} }, body: { appendChild() {} } },
  });
  ctx.ensureTownscapeLayer();
  const keys = Object.keys(ctx.townPaths), buildings = ['house', 'store', 'civic', 'sacred', 'industry', 'military', 'tents', 'battleBuildings'];
  const ground = ['fields', 'parks', 'plazas', 'pools', 'water', 'streets', 'mainStreets', 'links', 'linkWater', 'walls', 'fires', 'battleAccents', 'decoPlants', 'decoFurniture'];
  for (const building of buildings) for (const name of ground) assert.ok(keys.indexOf(building) > keys.indexOf(name), `${building} over ${name}`);
  assert.ok(keys.indexOf('tentDetail') > keys.indexOf('tents'));
  assert.ok(keys.indexOf('detail') > keys.indexOf('battleBuildings'));
  for (const name of DECO_GROUPS) {
    assert.ok(ctx.townDecorationLayer.children.includes(ctx.townPaths[name]));
    assert.ok(!ctx.townLayer.children.includes(ctx.townPaths[name]));
  }
  assert.match(ctx.townDecorationLayer.style.cssText, /z-index:100032/);
  assert.match(ctx.townLayer.style.cssText, /z-index:100033/);
});

test('home titles do not need a long line, and more than 200 readable minor-road names can be displayed', () => {
  const specs = [];
  for (let i = 0; i < 250; i++) {
    const y = 40 + i * 18;
    specs.push({ text: `Lane ${i}`, kind: 'street', pts: [{ x: 50, y }, { x: 400, y }], cum: [0, 350], total: 350, rank: 2 });
  }
  specs.push({ text: 'Roma', kind: 'home', pts: [{ x: 200, y: 20 }, { x: 200, y: 20 }], cum: [0, 0], total: 0, rank: 0 });
  const slots = [], layer = { style: {}, appendChild() {} };
  const ctx = context(['lineSpecPointAt', 'syncTownLabels'], {
    showTownLabels: true, showSettlements: true, showBuildingLabels: true, showRiverNames: true, townLabelVisible: () => true,
    ensureTownLabelLayer: () => {}, townLabelLayer: layer, townLabelSlots: slots,
    townLabelPan: {},
    townLabelSpecKey: 'same', townKey: 'same', townLabelSpecs: specs, townFeatureSpecs: [], townFeatureKey: '',
    buildFeatureLabelSpecs: () => [], pos: 0, hexW: 10, hexH: 10,
    viewZoom: 1, viewAspectY: 1, MAX_TOWN_LABELS: 600, TOWN_LABEL_STYLE: { street: [9, '#fff', '500', 'normal'], home: [13, '#fff', '700', 'normal'] },
    window: { innerWidth: 800, innerHeight: 5000 }, ps: n => n, mapToScreen: (x, y) => ({ x, y }),
    document: { createElement: () => ({ style: {} }) },
  });
  ctx.syncTownLabels([], 0, 800, 0, 5000);
  assert.ok(slots.length > 200);
  const title = slots.find(s => s.text === 'Roma');
  assert.ok(title);
  assert.match(title.transform, /rotate\(0.0deg\)/);
  assert.match(title.transform, /200.0px,8.0px/);
});
