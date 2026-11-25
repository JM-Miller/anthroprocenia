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
test('procedural continents get distinct invented names while every Earth map keeps native names', () => {
  const { ctx } = world('LOC_MAP_FRACTAL_NAME');
  const names = Array.from({ length: 64 }, (_, id) => ctx.continentNameForMap(id, 'Africa'));
  assert.equal(new Set(names).size, 64);
  assert.ok(names.every(name => /^[A-Za-z]+$/.test(name) && !/Africa|Asia|Europe|America|Antarctica|Australia|Oceania/.test(name)));
  assert.equal(ctx.continentNameForMap(3, 'Africa'), names[3]);
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  assert.ok(data.continents.every(continent => !/Antartica|Antarctica/.test(continent.name)));
  for (const mapName of ['LOC_MAP_EARTH_NAME', 'LOC_MAP_GIANT_EARTH_NAME', 'LOC_MAP_RANDOM_EARTH_NAME']) {
    const earth = world(mapName).ctx;
    assert.equal(earth.continentNameForMap(3, 'Africa'), 'Africa');
    assert.equal(earth.continentNameForMap(3, 'Antartica'), 'Antarctica');
  }
});

test('generated geographic duplicates use only locational qualifiers, including crowded maps and stale saved names', () => {
  const { ctx } = world('LOC_MAP_FRACTAL_NAME');
  const used = new Set();
  for (let n = 0; n < 150; n++) {
    const name = ctx.uniqueGeographicName('The Vallerian Isle', used);
    assert.ok(!used.has(name));
    assert.doesNotMatch(name, /Misty|Windswept|Hidden|Rocky|Shimmering|Fabled|Remote|Distant/);
    used.add(name);
  }
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  assert.ok(data.regions.concat(data.features.filter(feature => feature.type === 'mountains' || feature.type === 'island'))
    .every(entry => !/Misty|Windswept|Hidden|Rocky|Shimmering|Fabled|Remote|Ashen|Bright|Storm/.test(entry.name)));
});
test('procedural geographic names retire descriptive words, use Mount for singleton peaks and justify nearby directional pairs', () => {
  const { ctx } = world('LOC_MAP_FRACTAL_NAME', { width: 32, height: 16,
    tile: (x, y) => ({ mountain: x === 8 && y === 8, river: x === 5 && y === 5, riverName: 'The Misty Elysium River' }) });
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  assert.ok(data.features.some(feature => feature.type === 'mountains' && /^Mount [A-Za-z]+$/.test(feature.name)));
  assert.ok(data.features.some(feature => feature.type === 'river' && !/Misty/.test(feature.name)));
  const pair = [{ id: 'mountains:0', type: 'mountains', name: 'The Elysium Mountains', center: 0, tiles: [0] },
    { id: 'mountains:1', type: 'mountains', name: 'The Elysium Mountains', center: 1, tiles: [1] }];
  ctx.validateGeographicNames(pair, new Map([[0, { x: 3, y: 2 }], [1, { x: 7, y: 2 }]]), 32);
  assert.deepEqual(pair.map(row => row.name), ['The Western Elysium Mountains', 'The Eastern Elysium Mountains']);
  const far = pair.map((row, i) => ({ ...row, id: `mountains:${i}`, name: 'The Elysium Mountains' }));
  ctx.validateGeographicNames(far, new Map([[0, { x: 0, y: 0 }], [1, { x: 15, y: 15 }]]), 32);
  assert.ok(far.every(row => !/Eastern|Western|Northern|Southern|Central|Coastal/.test(row.name)));
  assert.equal(new Set(far.map(row => row.name)).size, 2);
});
test('sub-regions deterministically partition each parent into connected, bounded children without altering parent membership', () => {
  const { ctx } = world('LOC_MAP_FRACTAL_NAME', { width: 32, height: 16, tile: () => ({}) });
  const data = ctx.window.AnthroproceniaGeography.getMapData();
  const tiles = Array.from({ length: 4 }, (_, y) => Array.from({ length: 8 }, (_, x) => y * 32 + x + 4)).flat();
  const parent = { id: 'land:4', name: 'Elysium', tiles };
  const result = ctx.buildSubregions([parent], data.locations);
  assert.equal(result.subregions.length, 4);
  assert.equal(result.subregionForTile.size, tiles.length);
  assert.deepEqual([...result.subregions.flatMap(row => [...row.tiles])].sort((a, b) => a - b), tiles.slice().sort((a, b) => a - b));
  for (const child of result.subregions) {
    assert.equal(child.parentId, parent.id);
    const remaining = new Set(child.tiles), queue = [child.tiles[0]]; remaining.delete(queue[0]);
    for (const index of queue) for (const neighbor of ctx.neighborsOf(data.locations.get(index))) if (remaining.delete(neighbor.index)) queue.push(neighbor.index);
    assert.equal(remaining.size, 0); assert.ok(child.boundary.length);
    for (const index of child.tiles) for (let direction = 0; direction < 6; direction++) {
      if (!ctx.neighborsOf(data.locations.get(index)).some(neighbor => neighbor.direction === direction)) {
        assert.ok(child.boundary.some(edge => edge.index === index && edge.direction === direction), 'subregions outline the map edge');
      }
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.buildSubregions([parent], data.locations).subregions)),
    JSON.parse(JSON.stringify(result.subregions)));
  assert.equal(ctx.buildSubregions([{ ...parent, tiles: [4, 5] }], data.locations).subregions.length, 0);
});
test('Giant Earth required islands and peninsulas retain exact real names at their own source locations', () => {
  const places = [
    ['Britain', 10, 76], ['Ireland', 4, 75], ['Antarctica', 45, 0],
    ['Greenland', 176, 88], ['Iceland', 2, 84], ['Madagascar', 37, 17],
    ['Borneo', 83, 31], ['Sumatra', 75, 30], ['Java', 83, 25],
    ['Philippines', 89, 40], ['Hawaiian Islands', 115, 52], ['New Zealand', 111, 7],
    ['Eastern Australia', 95, 15], ['Western Australia', 91, 15], ['Taiwan', 87, 49], ['Sri Lanka', 63, 33],
    ['Cyprus', 32, 53], ['Sardinia', 18, 56], ['Sicily', 21, 53], ['Malta', 22, 51],
    ['Jamaica', 153, 46],
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
test('Italia absorbs every land-connected South Europe tile but not disconnected land or other continents', () => {
  const land = new Set(Array.from({ length: 10 }, (_, i) => 60 * 180 + 12 + i));
  land.add(60 * 180 + 10);
  land.add(61 * 180 + 12);
  land.add(56 * 180 + 17);
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !land.has(y * 180 + x), deep: true }),
    });
    ctx.GameplayMap.getContinentType = (x, y) => x < 19 && y !== 61 ? 1 : 0;
    ctx.GameInfo.Continents.lookup = id => ({ Description: id === 1 ? 'South Europe' : 'Europe' });
    if (atlas) giantContext(ctx);
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    const at = (x, y) => data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x));
    const italia = at(20, 60);
    for (let x = 12; x <= 21; x++) assert.equal(at(x, 60).id, italia.id, `${x},60; atlas=${atlas}`);
    assert.equal(italia.name, 'Italia');
    assert.equal(italia.requiredEarthName, true);
    assert.notEqual(at(10, 60).name, 'Italia', 'water breaks the South Europe connection');
    assert.notEqual(at(12, 61).name, 'Italia', 'adjacent other continents are not absorbed');
    assert.equal(at(17, 56).name, 'Sardinia', 'disconnected South Europe island keeps its name');
    assert.deepEqual(errors, []);
  }
});
test('India, Southeast Asia, the full Malayan Peninsula, Iberia and Jamaica retain required names with or without atlas metadata', () => {
  const places = [['Iberia', 7, 57], ['Iberia', 11, 59], ['India', 60, 52], ['India', 58, 41],
    ['India', 62, 38], ['India', 71, 53], ['Southeast Asia', 75, 40], ['Southeast Asia', 76, 47],
    ['Southeast Asia', 75, 38], ['Southeast Asia', 75, 39], ['Southeast Asia', 75, 40],
    ['The Malayan Peninsula', 73, 39], ['The Malayan Peninsula', 74, 38],
    ['The Malayan Peninsula', 73, 37], ['The Malayan Peninsula', 74, 36],
    ['The Malayan Peninsula', 74, 35], ['The Malayan Peninsula', 78, 32],
    ['Jamaica', 152, 46], ['Jamaica', 153, 46]];
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !((x >= 2 && x <= 82 && y >= 31 && y <= 70) || y === 46 && (x === 152 || x === 153)), deep: true }),
    });
    if (atlas) giantContext(ctx);
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    for (const [name, x, y] of places) {
      const region = data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x));
      assert.equal(region.name, name, `${name} at ${x},${y}; atlas=${atlas}`);
      assert.equal(region.requiredEarthName, true);
      assert.equal(region.island, name === 'Jamaica');
    }
    assert.equal(data.regionForTile.size, 180 * 94);
    assert.deepEqual(errors, []);
    if (atlas) {
      ctx.GameTutorial.getProperty = () => ({ schemaVersion: 1, status: 'ready',
        mapName: 'MassiveOldWorld', sourceMapName: 'GiantEarth', sourceWidth: 180, sourceHeight: 94,
        sourceStartX: 50, sourceEndX: 79, sourceStartY: 30, sourceEndY: 64,
        liveWidth: 30, liveHeight: 35, livePlayableStartX: 0, livePlayableEndX: 29,
      });
      const cropped = ctx.earthRegionLookup('LOC_MAP_REGIONAL_EARTH_NAME', 30, 35);
      assert.equal(cropped({ x: 10, y: 22 }), 'India');
      assert.equal(cropped({ x: 25, y: 10 }), 'Southeast Asia');
    }
  }
});
test('required European, North African and Malayan regions survive absent atlas data and retain distinct island names', () => {
  const places = [
    ['Central North Africa', 22, 47], ['Western Europe', 13, 67], ['Central Europe', 21, 71],
    ['Eastern Europe', 36, 74], ['The Balkans', 27, 63], ['The Malayan Peninsula', 76, 32],
    ['Corsica', 17, 59], ['The Balearic Isles', 13, 56], ['Britain', 10, 76],
    ['Ireland', 4, 75], ['Iberia', 11, 58], ['Sardinia', 18, 56], ['Southeast Asia', 75, 40],
  ];
  const islands = new Set(places.slice(6, 12).map(([, x, y]) => y * 180 + x));
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !(islands.has(y * 180 + x) ||
        x >= 2 && x <= 82 && y >= 31 && y <= 82 &&
        !(x >= 2 && x <= 12 && y >= 70) &&
        !(x >= 12 && x <= 18 && y >= 54 && y <= 60)), deep: true }),
    });
    if (atlas) giantContext(ctx);
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    for (const [name, x, y] of places) {
      const region = data.regions.find(entry => entry.id === data.regionForTile.get(y * 180 + x));
      assert.equal(region.name, name, `${name}; atlas=${atlas}`);
      assert.equal(region.requiredEarthName, true);
    }
    assert.deepEqual(errors, []);
  }
});
test('Earth mountains retain natural grouping and unmatched lakes use geographic descriptions, not invented proper names', () => {
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
  assert.equal(data.features.find(feature => feature.type === 'lake').name, 'Inland Waters of Central Asia');
  assert.deepEqual(errors, []);
});
test('Arabia and both Central African regions are mandatory at verified Giant Earth city locations', () => {
    const places = [
      ['Arabia', 36, 41], ['Arabia', 40, 43], ['Arabia', 38, 38], ['Arabia', 45, 43],
      ['Western Central Africa', 21, 26], ['Western Central Africa', 19, 28], ['Western Central Africa', 20, 32],
      ['Eastern Central Africa', 31, 30], ['Eastern Central Africa', 33, 28], ['Eastern Central Africa', 29, 28],
      ['Greece', 28, 56], ['Greece', 27, 54], ['Greece', 27, 55],
      ['Western North Africa', 14, 47], ['Eastern North Africa', 31, 45], ['Central North Africa', 22, 47],
    ];
    for (const atlas of [false, true]) {
      const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
        tile: (x, y) => ({ water: !(x >= 2 && x <= 82 && y >= 10 && y <= 82), deep: true }),
      });
      if (atlas) giantContext(ctx);
      const data = ctx.window.AnthroproceniaGeography.getMapData();
      for (const [name, x, y] of places) {
        const region = data.regions.find(entry => entry.id === data.regionForTile.get(y * 180 + x));
        assert.equal(region.name, name, `${name} at ${x},${y}; atlas=${atlas}`);
        assert.equal(region.requiredEarthName, true);
        assert.equal(region.island, false);
      }
      for (const [x, y] of [[40, 51], [36, 53]]) {
        assert.notEqual(ctx.giantEarthLandName({ x, y }), 'Arabia', 'Mesopotamia and Damascus are not Arabia');
      }
      for (const region of data.regions) {
        assert.ok(region.name.trim(), `${region.id} has a name`);
        if (region.island) continue;
        assert.equal(ctx.splitConnectedBy(region.tiles, data.locations, () => null).length, 1, `${region.name} is connected`);
      }
      assert.equal(data.regions.reduce((sum, region) => sum + region.tiles.length, 0), 180 * 94);
      assert.equal(data.regionForTile.size, 180 * 94);
      assert.deepEqual(errors, []);
    }
});
test('unmatched Earth islands and inland waters use containing real-world geography rather than blank or invented names', () => {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !(x === 126 && y === 30), lake: x === 130 && y === 20, deep: true }),
    });
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    const at = (x, y) => data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x));
    assert.equal(at(126, 30).name, 'Pacific Ocean Islands');
    assert.equal(at(130, 20).name, 'Inland Waters of Oceania');
    assert.ok(data.regions.every(region => region.name.trim() && !/Misty|Fabled|near Vala/.test(region.name)));
    assert.equal(ctx.earthLandRegionName({ x: 52, y: 76 }, ctx.fixedGiantEarthRegionLookup('LOC_MAP_GIANT_EARTH_NAME', 180, 94)), 'Western North Asia');
    assert.deepEqual(errors, []);
});
test('North American, Arctic and Siberian subdivisions are mandatory on mainland and offshore islands', () => {
  const places = [
    ['Western North America', 130, 65], ['Eastern North America', 153, 65],
    ['Western Arctic America', 128, 84], ['Eastern Arctic America', 154, 84],
    ['Western Siberia', 62, 80], ['Eastern Siberia', 92, 88],
    ['Western North Asia', 62, 75], ['Eastern North Asia', 92, 75],
  ];
  const islandTiles = new Set(places.map(([, x, y]) => y * 180 + x));
  for (const islands of [false, true]) for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: islands ? !islandTiles.has(y * 180 + x)
        : !((x >= 116 && x <= 166 && y >= 53 && y <= 91) || (x >= 49 && x <= 114 && y >= 65 && y <= 91)), deep: true }),
    });
    if (atlas) giantContext(ctx);
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    for (const [name, x, y] of places) {
      const region = data.regions.find(entry => entry.id === data.regionForTile.get(y * 180 + x));
      assert.equal(region.name, name, `${name}; islands=${islands}, atlas=${atlas}`);
      assert.equal(region.requiredEarthName, true);
      assert.equal(region.island, islands);
    }
    assert.deepEqual(errors, []);
  }
});
test('Giant Earth retires broad northern and central regions and places Siberia above the live tundra frontier', () => {
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !((x >= 2 && x <= 114 && y >= 10 && y <= 93) ||
        (x >= 116 && x <= 167 && y >= 48 && y <= 93)), deep: true }),
    });
    ctx.GameInfo.Biomes = { lookup: id => ({ BiomeType: id === 1 ? 'BIOME_TUNDRA' : 'BIOME_GRASSLAND' }) };
    ctx.GameplayMap.getBiomeType = (x, y) => y >= (x < 75 ? 77 : 84) ? 1 : 0;
    if (atlas) {
      giantContext(ctx);
      ctx.GameInfo.RegionPosition = [
        { MapName: 'GiantEarth', Region: 'NORTH_EUROPA', X: 0, Y: 70, Width: 50, Height: 24 },
        { MapName: 'GiantEarth', Region: 'CENTRAL_AFRICA', X: 0, Y: 10, Width: 50, Height: 60 },
        { MapName: 'GiantEarth', Region: 'NORTH_AMERICA', X: 116, Y: 40, Width: 64, Height: 54 },
        { MapName: 'GiantEarth', Region: 'NORTH_ASIA', X: 50, Y: 60, Width: 65, Height: 34 },
      ];
    }
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    assert.ok(data.regions.every(region => !['North Europe', 'Northern Europe', 'Central Africa', 'North America',
      'North Africa', 'West Asia', 'South Europe', 'Mediterranean', 'Siberia', 'North Asia'].includes(region.name)));
    const at = (x, y) => data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x)).name;
    for (const x of [52, 62, 72, 82, 92, 105]) {
      const edge = x < 75 ? 77 : 84;
      const side = x < 68 ? 'Western' : 'Eastern';
      assert.equal(at(x, edge - 1), `${side} North Asia`, `directly below tundra at ${x}; atlas=${atlas}`);
      for (let y = edge; y < 94; y++) assert.equal(at(x, y), `${side} Siberia`, `northern land at ${x},${y}; atlas=${atlas}`);
    }
    assert.equal(at(25, 84), 'Scandinavia'); assert.equal(at(40, 88), 'Western Siberia');
    assert.equal(at(19, 28), 'Western Central Africa'); assert.equal(at(31, 27), 'Eastern Central Africa');
    assert.equal(at(124, 56), 'Central America'); assert.equal(at(160, 76), 'Eastern North America');
    assert.equal(data.regionForTile.size, 180 * 94);
    for (const region of data.regions.filter(region => !region.island)) {
      assert.equal(ctx.splitConnectedBy(region.tiles, data.locations, () => null).length, 1);
    }
    assert.equal(data.continents.reduce((sum, continent) => sum + continent.tiles.length, 0),
      data.regions.filter(region => !region.water).reduce((sum, region) => sum + region.tiles.length, 0));
    assert.deepEqual(errors, []);
  }
});
test('Giant Earth expands Greece modestly, bounds America by tundra and Baja while retaining Florida, and splits mainland Australia', () => {
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !((x >= 116 && x < 168 && y >= 48) ||
        (x >= 84 && x <= 104 && y >= 7 && y <= 25) ||
        (x >= 99 && x <= 100 && y >= 4 && y <= 5) ||
        (x >= 2 && x <= 49 && y >= 50 && y <= 70)), deep: true }),
    });
    const edge = x => x < 145 ? 76 : 78;
    ctx.GameInfo.Biomes = { lookup: id => ({ BiomeType: ['BIOME_GRASSLAND', 'BIOME_TUNDRA', 'BIOME_SNOW'][id] }) };
    ctx.GameplayMap.getBiomeType = (x, y) => y >= 90 ? 2 : y >= edge(x) ? 1 : 0;
    if (atlas) {
      giantContext(ctx);
      ctx.GameInfo.RegionPosition.push({ MapName: 'GiantEarth', Region: 'NORTH_AMERICA', X: 116, Y: 35, Width: 52, Height: 59 });
    }
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    const regionAt = (x, y) => data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x));
    const at = (x, y) => regionAt(x, y).name;
    assert.equal(at(27, 60), 'Greece'); assert.equal(at(27, 63), 'The Balkans');
    assert.equal(at(35, 56), 'Anatolia');
    for (const x of [124, 140, 141, 142, 144, 145, 160]) {
      assert.equal(at(x, edge(x) - 1), `${x < 144 ? 'Western' : 'Eastern'} North America`);
      for (let y = edge(x); y < 94; y++) {
        assert.equal(at(x, y), `${x < 142 ? 'Western' : 'Eastern'} Arctic America`, `${x},${y}; atlas=${atlas}`);
      }
    }
    assert.equal(at(131, 58), 'Western North America');
    for (const [x, y] of [[131, 57], [132, 54], [140, 55]]) assert.equal(at(x, y), 'Central America');
    for (const [x, y] of [[150, 53], [151, 56], [152, 57]]) assert.equal(at(x, y), 'Eastern North America');
    assert.equal(at(94, 15), 'Western Australia'); assert.equal(at(95, 15), 'Eastern Australia');
    assert.equal(at(99, 4), 'Eastern Australia', 'Tasmania remains in the eastern division');
    assert.equal(regionAt(94, 15).island, false); assert.equal(regionAt(95, 15).island, false);
    assert.ok(data.regions.filter(region => !region.water).every(region => region.name !== 'Australia'));
    assert.equal(data.regionForTile.size, 180 * 94);
    assert.deepEqual(errors, []);
  }
});

test('Giant Earth keeps Alaska, the lowered Central American boundary and Panama in their requested regions', () => {
  const places = [
    ['Western Arctic America', 106, 74], ['Western Arctic America', 109, 73],
    ['Western Arctic America', 112, 74], ['Western Arctic America', 113, 79],
    ['Western Arctic America', 114, 84], ['Western Arctic America', 118, 82],
    ['Western Arctic America', 120, 84], ['Western Arctic America', 127, 74],
    ['Western Arctic America', 129, 75], ['Western Arctic America', 130, 76],
    ['Eastern Siberia', 107, 83], ['Eastern Siberia', 110, 84],
    ['Western North America', 129, 78],
    ['Western North America', 140, 56], ['Western North America', 140, 57],
    ['Central America', 140, 55], ['Central America', 132, 57],
    ['Western North America', 132, 58], ['Eastern North America', 150, 53],
    ['Central America', 149, 41], ['Central America', 150, 40],
    ['South America', 153, 39], ['South America', 156, 37],
  ];
  const land = new Set(places.map(([, x, y]) => y * 180 + x));
  for (const atlas of [false, true]) {
    const { ctx, errors } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
      tile: (x, y) => ({ water: !(land.has(y * 180 + x) || x >= 116 && x < 168 && y >= 37), deep: true }),
    });
    if (atlas) {
      giantContext(ctx);
      ctx.GameInfo.RegionPosition.push(
        { MapName: 'GiantEarth', Region: 'CENTRAL_AMERICA', X: 129, Y: 38, Width: 37, Height: 16 },
        { MapName: 'GiantEarth', Region: 'NORTH_AMERICA', X: 127, Y: 54, Width: 43, Height: 18 },
        { MapName: 'GiantEarth', Region: 'SOUTH_AMERICA_WEST', X: 143, Y: 12, Width: 18, Height: 26 });
    }
    const data = ctx.window.AnthroproceniaGeography.getMapData();
    for (const [name, x, y] of places) {
      assert.equal(data.regions.find(region => region.id === data.regionForTile.get(y * 180 + x)).name,
        atlas && x === 156 && y === 37 ? 'Western South America' : name, `${x},${y}; atlas=${atlas}`);
    }
    assert.deepEqual(errors, []);
  }
});

test('retired Giant Earth land regions merge without renaming the Mediterranean Sea or named peninsulas', () => {
  const { ctx } = world();
  for (const [old, plot, expected] of [
    ['West Asia', { x: 47, y: 50 }, 'Middle East'],
    ['South Europe', { x: 15, y: 60 }, 'Central North Africa'],
    ['North Africa', { x: 22, y: 47 }, 'Central North Africa'],
    ['Mediterranean', { x: 14, y: 50 }, 'Western North Africa'],
    ['Mediterranean', { x: 22, y: 50 }, 'Central North Africa'],
    ['Mediterranean', { x: 30, y: 50 }, 'Eastern North Africa'],
    ['Mediterranean', { x: 15, y: 60 }, 'Western Europe'],
    ['Mediterranean', { x: 24, y: 60 }, 'Central Europe'],
    ['Mediterranean', { x: 32, y: 60 }, 'Eastern Europe'],
    ['Mediterranean Sea', { x: 22, y: 54 }, 'Mediterranean Sea'],
    ['Italia', { x: 22, y: 58 }, 'Italia'],
  ]) assert.equal(ctx.mergedGiantEarthRegionName(old, plot, new Map()), expected);
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
  assert.ok(land.some(region => region.name === 'Central North Africa'));
  assert.ok(land.some(region => region.name === 'Central Asia'));
  assert.ok(land.every(region => region.nativeEarthName));
  assert.equal(land.reduce((sum, region) => sum + region.tiles.length, 0), 87 * 44);
  assert.equal(data.regionForTile.size, width * height, 'land, island and water tiles all retain a region');
  for (const region of land) for (const index of region.tiles) {
    assert.equal(region.name, ctx.giantEarthLandName(data.locations.get(index)) ||
      (index % width < 43 ? 'Central North Africa' : 'Central Asia'), 'each label covers only its actual atlas location');
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

test('Earth river city landmarks use the source projection, reject ambiguous city keys, and preserve native fallback names', () => {
  const { ctx } = world('LOC_MAP_GIANT_EARTH_NAME', { width: 180, height: 94,
    tile: (x, y) => ({ river: (x === 115 && y === 5) || (x === 31 && y === 42),
      riverName: x === 115 ? 'Named Tributary River' : 'Unrelated Native Name' }),
  });
  giantContext(ctx);
  ctx.GameInfo.CityMap = [
    { MapName: 'GiantEarth', CityLocaleName: 'LOC_CITY_NAME_LONDON', X: 12, Y: 72 },
    { MapName: 'StockEarth', CityLocaleName: 'LOC_CITY_NAME_LONDON', X: 115, Y: 5 },
    { MapName: 'GiantEarth', CityLocaleName: 'LOC_CITY_NAME_SANTIAGO', X: 140, Y: 15 },
    { MapName: 'GiantEarth', CityLocaleName: 'LOC_CITY_NAME_SANTIAGO', X: 5, Y: 63 },
  ];
  const lookup = ctx.earthWaterLookup(ctx.earthRegionLookup('LOC_MAP_GIANT_EARTH_NAME', 180, 94));
  assert.equal(lookup({ x: 12, y: 72 }, 'river'), 'Thames');
  assert.equal(lookup({ x: 140, y: 15 }, 'river'), '', 'distant cities sharing one key cannot both identify one river');
  assert.equal(lookup({ x: 115, y: 5 }, 'river'), '', 'other map projections do not supply anchors');
  const rivers = ctx.window.AnthroproceniaGeography.getMapData().features.filter(feature => feature.type === 'river');
  assert.ok(rivers.some(feature => feature.name === 'Named Tributary River'), 'unmapped native river names are not discarded or regenerated');
  assert.ok(rivers.some(feature => feature.name === 'Nile'), 'verified Earth locations override unrelated native assignments');
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
    for (const kind of [{ island: true }, { archipelago: true }]) {
      const naturalGroup = ctx.fitRegionCount([{ ...disconnected[0], ...kind }], data.locations, 1);
      assert.equal(naturalGroup.length, 1, 'natural island groups may remain disconnected');
      assert.deepEqual(Array.from(naturalGroup[0].tiles), disconnected[0].tiles);
    }
  }
});
