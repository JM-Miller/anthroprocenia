import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/geography/anthroprocenia-geography.js', import.meta.url), 'utf8');
function world(mapName = 'LOC_MAP_EARTH_NAME', options = {}) {
  const width = options.width || 4, height = options.height || 4;
  const tile = options.tile || ((x, y) => ({ water: x !== 1 || y !== 1 }));
  const names = new Map([['name5:region2:land:5', 'The Isle of Antarticaian']]);
  const errors = [];
  const ctx = vm.createContext({
    LensManager: { registerLensLayer() {} }, GameEvents: { PlayerTurnStarted: { add() {} } },
    console: { error: message => errors.push(message), warn: message => errors.push(message) },
    window: { AnthroproceniaNames: {
      remember(key, name) { if (!names.has(key) && name) names.set(key, name); return names.has(key) ? names.get(key) : name; },
      get: key => names.get(key), set(key, name) { names.set(key, name); return name; },
    } },
    Configuration: { getGame: () => ({ gameSeed: 123 }), getMap: () => ({ mapName }) },
    Locale: { compose: value => value }, RiverTypes: { NO_RIVER: -1 },
    DirectionTypes: { DIRECTION_NORTHEAST: 0, DIRECTION_EAST: 1, DIRECTION_SOUTHEAST: 2,
      DIRECTION_SOUTHWEST: 3, DIRECTION_WEST: 4, DIRECTION_NORTHWEST: 5 },
    GameInfo: { Continents: { lookup: () => ({ Description: 'Antartica' }) }, Terrains: { lookup: index => ({ TerrainType: index === 1 ? 'TERRAIN_OCEAN' : 'TERRAIN_COAST' }) } },
    GameplayMap: {
      getGridWidth: () => width, getGridHeight: () => height,
      getIndexFromXY: (x, y) => y * width + x, getLocationFromIndex: index => ({ x: index % width, y: Math.floor(index / width) }),
      getAdjacentPlotLocation(plot, direction) {
        const offsets = [[plot.y & 1 ? 1 : 0, 1], [1, 0], [plot.y & 1 ? 1 : 0, -1],
          [plot.y & 1 ? 0 : -1, -1], [-1, 0], [plot.y & 1 ? 0 : -1, 1]];
        const [dx, dy] = offsets[direction];
        return { x: (plot.x + dx + width) % width, y: plot.y + dy };
      },
      isWater: (x, y) => !!tile(x, y).water, isNavigableRiver: () => false, getRiverType: () => -1,
      isRiver: (x, y) => !!tile(x, y).river, getRiverName: (x, y) => tile(x, y).riverName || '',
      isLake: (x, y) => !!tile(x, y).lake, isMountain: (x, y) => !!tile(x, y).mountain,
      getTerrainType: (x, y) => tile(x, y).deep ? 1 : 0,
      getContinentType: () => 0, getOwner: () => -1,
    },
  });
  vm.runInContext(source.replace(/^import LensManager.*\r?\n/, ''), ctx);
  return { ctx, errors };
}
function giantContext(ctx) {
  ctx.GameInfo.RegionPosition = [
    { MapName: 'GiantEarth', Region: 'NORTH_AFRICA', X: 0, Y: 10, Width: 50, Height: 60 },
    { MapName: 'GiantEarth', Region: 'CENTRAL_ASIA', X: 50, Y: 10, Width: 130, Height: 84 },
  ];
  ctx.Database = { makeHash: value => value };
  ctx.GameTutorial = { getProperty: () => ({ schemaVersion: 1, status: 'ready',
    mapName: 'GiantEarth', sourceMapName: 'GiantEarth', sourceWidth: 180, sourceHeight: 94,
    sourceStartX: 0, sourceEndX: 179, sourceStartY: 0, sourceEndY: 93,
    liveWidth: 180, liveHeight: 94, livePlayableStartX: 0, livePlayableEndX: 179,
  }) };
}
test('Giant Earth required islands and peninsulas retain exact real names at their own source locations', () => {
  const places = [
    ['Britain', 10, 76], ['Ireland', 4, 75], ['Antarctica', 45, 0],
    ['Greenland', 176, 88], ['Iceland', 2, 84], ['Madagascar', 37, 17],
    ['Borneo', 83, 31], ['Sumatra', 75, 30], ['Java', 83, 25],
    ['Philippines', 89, 40], ['Hawaiian Islands', 115, 52], ['New Zealand', 111, 7],
    ['Australia', 95, 15], ['Taiwan', 87, 49], ['Sri Lanka', 63, 33],
    ['Cyprus', 32, 53], ['Sardinia', 18, 56], ['Sicily', 21, 53],
  ];
  const land = new Set(places.map(([, x, y]) => y * 180 + x));
  for (let x = 89; x <= 100; x++) for (let y = 10; y <= 20; y++) land.add(y * 180 + x);
  const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
    tile: (x, y) => ({ water: !land.has(y * 180 + x), deep: true }),
  });
  giantContext(ctx);
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  for (const [name, x, y] of places) {
    const region = data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x));
    assert.equal(region.name, name, `${name} at ${x},${y}`);
    assert.equal(region.nativeEarthName, true);
    assert.equal(region.requiredEarthName, true);
  }
  const regionAt = ctx.earthRegionLookup('LOC_MAP_GIANT_EARTH_NAME', 180, 94);
  for (const [name, x, y] of [['Italia', 20, 60], ['Anatolia', 35, 56], ['Scandinavia', 23, 82], ['Korea', 90, 62]]) {
    assert.equal(regionAt({ x, y }), name);
  }
  assert.ok(data.regions.concat(data.features).every(entry => entry.nativeEarthName));
  assert.ok(data.regions.concat(data.features).every(entry => !/Misty|Fabled|Isle of|near Vala/.test(entry.name)));
  assert.deepEqual(errors, []);
});
test('Earth mountains join across a one-tile gap, use actual range names, and never invent unmatched ranges or lakes', () => {
  const mountainTiles = new Set([64 * 180 + 18, 64 * 180 + 20, 64 * 180 + 24, 20 * 180 + 10, 20 * 180 + 11]);
  const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
    tile: (x, y) => ({ water: x !== 10 && !mountainTiles.has(y * 180 + x),
      mountain: mountainTiles.has(y * 180 + x), lake: x === 130 && y === 20, deep: true }),
  });
  giantContext(ctx);
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  const alps = data.features.find(feature => feature.name === 'Alps');
  assert.ok(alps.tiles.includes(64 * 180 + 18) && alps.tiles.includes(64 * 180 + 20));
  assert.ok(!alps.tiles.includes(64 * 180 + 24), 'a wider gap does not join the range');
  assert.equal(data.features.some(feature => feature.tiles.includes(20 * 180 + 10) && feature.type === 'mountains'), false);
  assert.equal(data.features.some(feature => feature.type === 'lake'), false, 'unmapped real-world lake is not assigned a fantasy name');
  assert.deepEqual(errors, []);
});
test('all bottom-row Earth land components form one Antarctica without absorbing intervening ocean', () => {
  const land = new Set([0, 1, 180, 90, 91, 179, 300]);
  const { ctx } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
    tile: (x, y) => ({ water: !land.has(y * 180 + x), deep: true }),
  });
  giantContext(ctx);
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  const south = data.regions.filter(region => !region.water && region.tiles.some(index => index < 180));
  assert.equal(south.length, 1);
  assert.equal(south[0].name, 'Antarctica');
  assert.equal(south[0].island, true);
  assert.ok(south[0].tiles.includes(180), 'attached land above the bottom row remains in Antarctica');
  assert.ok(!south[0].tiles.includes(45), 'ocean gaps remain water');
});
test('tiny islands join only through an ocean-enclosed coastal network without larger islands or mainland', () => {
  const run = (large = false, inland = false) => world('LOC_MAP_CONTINENTS_NAME', { width: 24, height: 14,
    tile: (x, y) => ({ water: !((y === 6 && [6, 10].includes(x)) ||
      large && y === 6 && x >= 14 && x <= 17),
      deep: !(y >= 5 && y <= 7 && x >= 5 && x <= 18), lake: inland && x === 8 && y === 6 }),
  }).ctx.window.AnthroproceniaGeography.getMapData();
  const data = run(), chain = data.features.find(feature => feature.type === 'archipelago');
  assert.ok(chain);
  assert.deepEqual(new Set(chain.tiles), new Set([6 * 24 + 6, 6 * 24 + 10]));
  assert.equal(data.regionForTile.get(6 * 24 + 6), data.regionForTile.get(6 * 24 + 10));
  assert.equal(run(true).features.some(feature => feature.type === 'archipelago'), false);
  assert.equal(run(false, true).features.some(feature => feature.type === 'archipelago'), false);
});
test('Giant Earth fixed landmarks survive missing optional atlas metadata, and coastal Pacific chains retain real names', () => {
  const { ctx } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
    tile: (x, y) => ({ water: !((x === 4 && y === 75) || (y === 27 && [116, 120].includes(x))),
      deep: !(x >= 115 && x <= 121 && y >= 26 && y <= 28) }),
  });
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  assert.equal(data.regions.find(region => region.tiles.includes(75 * 180 + 4)).name, 'Ireland');
  const chain = data.features.find(feature => feature.type === 'archipelago');
  assert.equal(chain.name, 'Melanesia');
  assert.equal(chain.nativeEarthName, true);
  assert.equal(data.regions.find(region => region.tiles.includes(27 * 180 + 116)).name, 'Melanesia');
});
test('real Earth continent fallback preserves Antarctica without island morphology or stale saved-name overrides', () => {
  const { ctx, errors } = world();
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  const land = data.regions.find(region => region.tiles.includes(5));
  assert.equal(land.name, 'Antarctica');
  assert.equal(land.nativeEarthName, true);
  for (const feature of data.features.filter(feature => feature.type === 'island' || feature.type === 'archipelago')) {
    assert.equal(feature.name, 'Antarctica');
    assert.equal(feature.nativeEarthName, true);
  }
  assert.deepEqual(errors, []);
});
test('new stock Earth landmarks are projection-guarded and random or generated maps keep procedural naming', () => {
  const { ctx } = world();
  const lookup = ctx.stockEarthRegionLookup('LOC_MAP_EARTH_NAME', 106, 66);
  assert.equal(lookup({ x: 25, y: 37 }), 'Caribbean');
  assert.equal(lookup({ x: 91, y: 11 }), 'Australia');
  assert.equal(lookup({ x: 72, y: 37 }), 'Indus Valley');
  assert.equal(ctx.stockEarthRegionLookup('LOC_MAP_EARTH_NAME', 105, 66), null);
  assert.equal(ctx.stockEarthRegionLookup('LOC_MAP_RANDOM_EARTH_NAME', 106, 66), null);
  for (const mapName of ['LOC_MAP_RANDOM_EARTH_NAME', 'LOC_MAP_CONTINENTS_NAME']) {
    const data = world(mapName).ctx.window.AnthroproceniaGeography.getMapData();
    assert.notEqual(data.regions.find(region => region.tiles.includes(5)).nativeEarthName, true);
  }
});

test('water and island names use the matching Earth projection and wrapped crop coordinates', () => {
  const { ctx } = world();
  const stock = ctx.earthWaterLookup(ctx.stockEarthRegionLookup('LOC_MAP_EARTH_NAME', 106, 66));
  assert.equal(stock({ x: 57, y: 31 }, 'river'), 'Nile');
  assert.equal(stock({ x: 56, y: 21 }, 'lake'), 'Lake Victoria');
  assert.equal(stock({ x: 25, y: 34 }, 'sea'), 'Caribbean Sea');
  assert.equal(stock({ x: 0, y: 36 }, 'island'), 'Hawaiian Islands');
  assert.equal(stock({ x: 1, y: 36 }, 'ocean'), 'Pacific Ocean');
  assert.equal(stock({ x: 23, y: 20 }, 'ocean'), 'Pacific Ocean', 'the west coast of South America is not Atlantic');
  assert.equal(stock({ x: 60, y: 46 }, 'ocean'), 'Black Sea', 'deep-water terrain inside a sea retains its sea name');
  assert.equal(stock({ x: 50, y: 2 }, 'ocean'), 'Southern Ocean');
  assert.equal(stock({ x: 50, y: 65 }, 'ocean'), 'Arctic Ocean');
  assert.equal(stock({ x: 8, y: 10 }, 'lake'), '', 'a remote lake is not mislabeled as the nearest distant real lake');
  ctx.GameInfo.RegionPosition = [
    { MapName: 'GiantEarth', Region: 'NORTH_AFRICA', X: 0, Y: 20, Width: 50, Height: 35 },
    { MapName: 'GreatestEarthMap', Region: 'NORTH_AFRICA', X: 35, Y: 20, Width: 35, Height: 20 },
  ];
  let context;
  ctx.Database = { makeHash: value => value };
  ctx.GameTutorial = { getProperty: () => context };
  const full = (mapName, width, height) => ({ schemaVersion: 1, status: 'ready', mapName, sourceMapName: mapName,
    sourceWidth: width, sourceHeight: height, sourceStartX: 0, sourceEndX: width - 1, sourceStartY: 0, sourceEndY: height - 1,
    liveWidth: width, liveHeight: height, livePlayableStartX: 0, livePlayableEndX: width - 1 });
  context = full('GiantEarth', 180, 94);
  const giant = ctx.earthWaterLookup(ctx.earthRegionLookup('LOC_MAP_GIANT_EARTH_NAME', 180, 94));
  assert.equal(giant({ x: 31, y: 42 }, 'river'), 'Nile');
  assert.equal(giant({ x: 155, y: 20 }, 'ocean'), 'Pacific Ocean');
  context = full('GreatestEarthMap', 104, 64);
  const greatest = ctx.earthWaterLookup(ctx.earthRegionLookup('LOC_MAP_GREATEST_EARTH_NAME', 104, 64));
  assert.equal(greatest({ x: 58, y: 34 }, 'river'), 'Nile');
  context = { ...full('GiantEarth', 180, 94), mapName: 'MassiveOldWorld', sourceStartX: 20, sourceEndX: 39,
    sourceStartY: 40, sourceEndY: 49, liveWidth: 20, liveHeight: 10, livePlayableEndX: 19 };
  const cropped = ctx.earthRegionLookup('LOC_MAP_REGIONAL_EARTH_NAME', 20, 10);
  assert.equal(ctx.earthWaterLookup(cropped)({ x: 11, y: 2 }, 'river'), 'Nile');
  context = { ...context, sourceStartX: 174, sourceEndX: 13 };
  const wrapped = ctx.earthRegionLookup('LOC_MAP_REGIONAL_EARTH_NAME', 20, 10);
  assert.equal(wrapped.sourcePlot({ x: 10, y: 2 }).x, 4);
  context = { ...full('GreatestEarthMap', 104, 66) };
  assert.equal(ctx.earthRegionLookup('LOC_MAP_GREATEST_EARTH_NAME', 104, 66), null, 'an incompatible atlas height must not assign names');
});
test('Giant Earth mainland atlas regions survive more islands than the procedural region budget', () => {
  const width = 180, height = 94;
  const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width, height,
    tile: (x, y) => ({ water: !((x >= 2 && x <= 88 && y >= 24 && y <= 67) ||
      (x >= 96 && x <= 174 && x % 3 === 0 && y >= 3 && y <= 90 && y % 3 === 0)) }),
  });
  ctx.GameInfo.RegionPosition = [
    { MapName: 'GiantEarth', Region: 'NORTH_AFRICA', X: 2, Y: 24, Width: 41, Height: 44 },
    { MapName: 'GiantEarth', Region: 'CENTRAL_ASIA', X: 43, Y: 24, Width: 46, Height: 44 },
  ];
  ctx.Database = { makeHash: value => value };
  ctx.GameTutorial = { getProperty: () => ({ schemaVersion: 1, status: 'ready',
    mapName: 'GiantEarth', sourceMapName: 'GiantEarth', sourceWidth: width, sourceHeight: height,
    sourceStartX: 0, sourceEndX: width - 1, sourceStartY: 0, sourceEndY: height - 1,
    liveWidth: width, liveHeight: height, livePlayableStartX: 0, livePlayableEndX: width - 1,
  }) };
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  assert.ok(data.regions.filter(region => region.island).length > 100, 'islands alone exhaust the old region budget');
  const land = data.regions.filter(region => !region.water && !region.island);
  assert.ok(land.some(region => region.name === 'North Africa'));
  assert.ok(land.some(region => region.name === 'Central Asia'));
  assert.ok(land.every(region => region.nativeEarthName));
  assert.equal(land.reduce((sum, region) => sum + region.tiles.length, 0), 87 * 44);
  assert.equal(data.regionForTile.size, width * height, 'land, island and water tiles all retain a region');
  for (const region of land) for (const index of region.tiles) {
    assert.equal(region.name, ctx.giantEarthLandName(data.locations.get(index)) ||
      (index % width < 43 ? 'North Africa' : 'Central Asia'), 'each label covers only its actual atlas location');
  }
  assert.deepEqual(errors, []);
});

test('war names include the real regions on both sides of the involved border', () => {
  const { ctx } = world();
  const data = { regionForTile: new Map([[1, 'a'], [2, 'b'], [3, 'a']]),
    regions: [{ id: 'a', name: 'Gaul' }, { id: 'b', name: 'Italy' }] };
  assert.equal(ctx.warRegionName(1, 2, data), 'Gaul and Italy');
  assert.equal(ctx.rememberWarName('border-war:1:2:Gaul and Italy', ctx.warRegionName(1, 2, data)), 'War of Gaul and Italy');
  assert.equal(ctx.warRegionName(1, 3, data), 'Gaul', 'one region is not repeated');
});
test('procedural subregions form a complete connected nonoverlapping partition and name all geographic kinds', () => {
  const options = { width: 30, height: 20, tile: (x, y) => ({
    water: x >= 22 && !(x === 24 && y === 3),
    deep: x >= 26, lake: x >= 14 && x <= 16 && y >= 12 && y <= 14,
    mountain: y === 5 && x >= 2 && x <= 9,
    river: y === 10 && x >= 3 && x <= 21, riverName: y === 10 ? 'Willow' : '',
  }) };
  const { ctx, errors } = world('LOC_MAP_CONTINENTS_NAME', options);
  const data = ctx.window.AnthroproceniaGeography.getMapData(), seen = new Set();
  assert.ok(data.regions.filter(region => !region.water && !region.island).length > 20);
  for (const region of data.regions) {
    assert.ok(region.name.trim());
    const remaining = new Set(region.tiles), queue = [region.tiles[0]];
    remaining.delete(queue[0]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const neighbor of ctx.neighborsOf(data.locations.get(queue[cursor]))) {
        if (remaining.delete(neighbor.index)) queue.push(neighbor.index);
      }
    }
    assert.equal(remaining.size, 0, `${region.name} is connected`);
    for (const index of region.tiles) {
      assert.equal(seen.has(index), false, `tile ${index} belongs to exactly one subregion`);
      seen.add(index); assert.equal(data.regionForTile.get(index), region.id);
    }
  }
  assert.equal(seen.size, 600); assert.equal(data.regionForTile.size, 600);
  assert.equal(new Set(data.regions.map(region => region.name.toLowerCase())).size, data.regions.length, 'subregion names are unique');
  for (const type of ['island', 'ocean', 'lake', 'river', 'mountains']) {
    assert.ok(data.features.some(feature => feature.type === type && feature.name.trim()), `${type} is named`);
  }
  assert.ok(data.features.some(feature => ['sea', 'gulf'].includes(feature.type)));
  const island = data.features.find(feature => feature.type === 'island');
  assert.equal(island.name, data.regions.find(region => region.id === data.regionForTile.get(island.center)).name);
  const again = world('LOC_MAP_CONTINENTS_NAME', options).ctx.window.AnthroproceniaGeography.getMapData();
  assert.equal(JSON.stringify(data.regions), JSON.stringify(again.regions), 'partition and names are stable across reloads');
  assert.deepEqual(errors, []);
});

test('native direction order produces the correct hex boundary edges, including map seams', () => {
  const { ctx } = world('LOC_MAP_CONTINENTS_NAME', { width: 10, height: 8, tile: () => ({}) });
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  for (const index of [0, 10, 14, 25, 39, 79]) {
    const x = index % 10, y = Math.floor(index / 10), east = y & 1 ? 1 : 0;
    const expected = [[x + 1, y], [x - 1, y], [x + east, y + 1],
      [x + east - 1, y + 1], [x + east, y - 1], [x + east - 1, y - 1]];
    const actual = ctx.neighborsOf({ x, y });
    for (let direction = 0; direction < 6; direction++) {
      const [nx, ny] = expected[direction], neighbor = actual.find(n => n.direction === direction);
      if (ny < 0 || ny >= 8) { assert.equal(neighbor, undefined); continue; }
      assert.equal(neighbor.index, ny * 10 + (nx + 10) % 10, `tile ${index}, boundary direction ${direction}`);
      assert.equal(neighbor.wrapped, nx < 0 || nx >= 10);
    }
  }
  for (const region of data.regions) for (const edge of region.boundary) {
    const neighbor = ctx.neighborsOf(data.locations.get(edge.index)).find(n => n.direction === edge.direction);
    assert.ok(!neighbor || neighbor.wrapped || data.regionForTile.get(neighbor.index) !== region.id);
  }
});

test('partition covers every tile exactly once with connected regions on wrapped, winding and all-water maps', () => {
  const width = 24, height = 14;
  const adjacent = index => {
    const x = index % width, y = Math.floor(index / width), east = y & 1 ? 1 : 0;
    return [[x + 1, y], [x - 1, y], [x + east, y + 1], [x + east - 1, y + 1],
      [x + east, y - 1], [x + east - 1, y - 1]]
      .filter(([, ny]) => ny >= 0 && ny < height).map(([nx, ny]) => ny * width + (nx + width) % width);
  };
  for (const tile of [
    () => ({}),
    (x, y) => ({ water: true, deep: x > 10, lake: x === 4 && y === 4 }),
    (x, y) => ({ water: x > 2 && x < 21 && (y % 4 !== 0 || x % 6 === 0),
      lake: x === 1 && y === 6, river: x === 22, deep: y % 4 === 2 }),
  ]) {
    const { ctx, errors } = world('LOC_MAP_CONTINENTS_NAME', { width, height, tile });
    const data = ctx.window.AnthroproceniaGeography.getMapData(), seen = new Set();
    for (const region of data.regions) {
      const remaining = new Set(region.tiles), queue = [region.tiles[0]];
      assert.ok(queue[0] !== undefined);
      remaining.delete(queue[0]);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        for (const neighbor of adjacent(queue[cursor])) if (remaining.delete(neighbor)) queue.push(neighbor);
      }
      assert.equal(remaining.size, 0, `${region.id} is graph-connected`);
      for (const index of region.tiles) {
        assert.ok(!seen.has(index), `tile ${index} is not duplicated`);
        seen.add(index); assert.equal(data.regionForTile.get(index), region.id);
      }
    }
    assert.equal(seen.size, width * height); assert.equal(data.regionForTile.size, width * height);
    assert.deepEqual(errors, []);
    const disconnected = [{ tiles: [0, 1, 100, 101], water: false, continent: 0 }];
    const normalized = ctx.fitRegionCount(disconnected, data.locations, 1);
    assert.equal(normalized.length, 2, 'never force detached pieces into one region just to meet a region count');
    assert.throws(() => ctx.splitRegionTiles([0, 100], data.locations), /disconnected/,
      'an unreachable tile is never assigned by straight-line distance');
  }
});
