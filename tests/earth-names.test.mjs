import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/geography/anthroprocenia-geography.js', import.meta.url), 'utf8');
function world(mapName = 'LOC_MAP_EARTH_NAME') {
  const names = new Map([['name5:region2:land:5', 'The Isle of Antarticaian']]);
  const errors = [];
  const ctx = vm.createContext({
    LensManager: { registerLensLayer() {} }, GameEvents: { PlayerTurnStarted: { add() {} } },
    console: { error: message => errors.push(message), warn: message => errors.push(message) },
    window: { AnthroproceniaNames: {
      remember(key, name) { if (!names.has(key)) names.set(key, name); return names.get(key); },
      get: key => names.get(key), set(key, name) { names.set(key, name); return name; },
    } },
    Configuration: { getGame: () => ({ gameSeed: 123 }), getMap: () => ({ mapName }) },
    Locale: { compose: value => value }, RiverTypes: { NO_RIVER: -1 },
    GameInfo: { Continents: { lookup: () => ({ Description: 'Antartica' }) }, Terrains: { lookup: () => ({ TerrainType: 'TERRAIN_COAST' }) } },
    GameplayMap: {
      getGridWidth: () => 4, getGridHeight: () => 4,
      getIndexFromXY: (x, y) => y * 4 + x, getLocationFromIndex: index => ({ x: index % 4, y: Math.floor(index / 4) }),
      getAdjacentPlotLocation(plot, direction) {
        const offsets = [[1, 0], [-1, 0], [plot.y & 1 ? 1 : 0, 1], [plot.y & 1 ? 0 : -1, 1],
          [plot.y & 1 ? 1 : 0, -1], [plot.y & 1 ? 0 : -1, -1]];
        const [dx, dy] = offsets[direction];
        return { x: (plot.x + dx + 4) % 4, y: plot.y + dy };
      },
      isWater: (x, y) => x !== 1 || y !== 1, isNavigableRiver: () => false, getRiverType: () => -1,
      isRiver: () => false, isLake: () => false, isMountain: () => false, getTerrainType: () => 0,
      getContinentType: () => 0, getOwner: () => -1,
    },
  });
  vm.runInContext(source.replace(/^import LensManager.*\r?\n/, ''), ctx);
  return { ctx, errors };
}
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
