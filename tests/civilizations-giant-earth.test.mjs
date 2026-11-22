import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const root = new URL('../anthroprocenia/', import.meta.url);
const sql = await readFile(new URL('data/civilizations-giant-earth.sql', root), 'utf8');
const content = JSON.parse(await readFile(new URL('../tools/civilizations.json', root), 'utf8'));
for (const era of ['antiquity', 'exploration', 'modern']) {
  content.push(...JSON.parse(await readFile(new URL(`../tools/civilizations-${era}-additions.json`, root), 'utf8')));
}
const civs = content.map(({ key }) => `CIVILIZATION_ANTHRO_${key}`);
const startCount = civ => civ === 'CIVILIZATION_ANTHRO_TAHITI' ? 2 :
  civ === 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION' ? 4 : 5;
const hexDistance = (a, b) => {
  const q = a.X - (a.Y - (a.Y & 1)) / 2 - b.X + (b.Y - (b.Y & 1)) / 2;
  const r = a.Y - b.Y;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
};
const ynamp = process.env.YNAMP_PATH || (process.env.LOCALAPPDATA &&
  join(process.env.LOCALAPPDATA, 'Firaxis Games', "Sid Meier's Civilization VII", 'Mods', 'ynamp', 'modules'));
const hasYnamp = ynamp && existsSync(join(ynamp, 'data', 'tables.sql'));

function database(schema = `CREATE TABLE StartPosition (
  MapName TEXT, MapScript TEXT, Civilization TEXT, Leader TEXT,
  DisabledByCivilization TEXT, DisabledByLeader TEXT, AlternateStart BOOLEAN,
  UnlockRadius INT, UnlockIgnoreCoast BOOLEAN, UnlockDisabled BOOLEAN,
  X INT DEFAULT 0, Y INT DEFAULT 0
);`) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  return db;
}

test('every expansion civilization retains its primary and nearby alternate starts on reload', async t => {
  const db = database();
  t.after(() => db.close());
  const insert = db.prepare('INSERT INTO StartPosition (MapName, Civilization, X, Y) VALUES (?, ?, ?, ?)');
  const preserved = [
    ['GiantEarth', 'CIVILIZATION_WAGADU_JEC', 9, 43],
    ['GiantEarth', 'CIVILIZATION_ROME', 20, 57],
    ['GreatestEarthMap', civs[0], 43, 53],
    ['GreatestEarthMap', 'CIVILIZATION_ANTHRO_IBERIA', 44, 37],
    ['GiantEarth', 'CIVILIZATION_ANTHRO_UNRELATED', 5, 5],
  ];
  for (const row of preserved) insert.run(...row);
  for (const civ of civs) insert.run('GiantEarth', civ, 0, 0);
  db.exec(sql);
  db.exec(sql);
  const own = db.prepare("SELECT Civilization, X, Y, AlternateStart FROM StartPosition WHERE MapName='GiantEarth' AND Civilization IN (" +
    civs.map(() => '?').join(',') + ')').all(...civs);
  const nativeData = await readFile(new URL('data/civilizations.sql', root), 'utf8');
  const nativeCivs = [...nativeData.matchAll(/INSERT INTO "Civilizations" [^\n]+VALUES \('(CIVILIZATION_ANTHRO_[A-Z_]+)'/g)]
    .map(match => match[1]);
  assert.deepEqual(new Set(civs), new Set(nativeCivs), 'cover the complete shipped civilization catalog');
  assert.deepEqual(new Set(own.map(row => row.Civilization)), new Set(civs));
  const primaries = own.filter(row => !row.AlternateStart);
  assert.equal(primaries.length, civs.length, 'one primary per civilization, even on reload');
  assert.equal(new Set(primaries.map(row => `${row.X},${row.Y}`)).size, civs.length, 'distinct primaries');
  for (const civ of civs) {
    const points = own.filter(row => row.Civilization === civ);
    assert.equal(points.length, startCount(civ), `${civ}: expected candidate count`);
    assert.equal(points.filter(row => !row.AlternateStart).length, 1);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      const d = hexDistance(points[i], points[j]);
      assert.ok(d >= 2 && d <= 4, `${civ}: every pair is 2-4 hex tiles apart, got ${d}`);
    }
  }
  const point = civ => {
    const { Civilization, X, Y } = primaries.find(row => row.Civilization === civ);
    return { Civilization, X, Y };
  };
  assert.deepEqual(point('CIVILIZATION_ANTHRO_TAINO'),
    { Civilization: 'CIVILIZATION_ANTHRO_TAINO', X: 161, Y: 39 });
  assert.deepEqual(point('CIVILIZATION_ANTHRO_IBERIA'),
    { Civilization: 'CIVILIZATION_ANTHRO_IBERIA', X: 10, Y: 57 });
  assert.ok(own.every(row => Number.isInteger(row.X) && row.X >= 0 && row.X < 180 &&
    Number.isInteger(row.Y) && row.Y >= 0 && row.Y < 94));
  for (const row of preserved) assert.equal(db.prepare(
    'SELECT COUNT(*) AS n FROM StartPosition WHERE MapName=? AND Civilization=? AND X=? AND Y=?'
  ).get(...row).n, 1, `preserve ${row[0]} ${row[1]}`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM StartPosition').get().n,
    civs.reduce((sum, civ) => sum + startCount(civ), 0) + preserved.length);
});

test('YnAMP compatibility is optional and loads after its table definitions', async () => {
  const manifest = (await readFile(new URL('anthroprocenia.modinfo', root), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const group = manifest.match(/<ActionGroup\b[^>]*id="civilizations-giant-earth"[\s\S]*?<\/ActionGroup>/)?.[0];
  assert.ok(group);
  assert.match(group, /scope="game"/);
  assert.match(group, /criteria="ynamp"/);
  assert.match(group, /<UpdateDatabase>\s*<Item>data\/civilizations-giant-earth\.sql<\/Item>\s*<\/UpdateDatabase>/);
  assert.ok(Number(group.match(/<LoadOrder>(-?\d+)<\/LoadOrder>/)?.[1]) > 0);
  assert.match(manifest, /<Criteria id="ynamp">\s*<ModInUse>ged-ynamp<\/ModInUse>\s*<\/Criteria>/);
  assert.doesNotMatch(manifest.match(/<Dependencies>[\s\S]*?<\/Dependencies>/)?.[0] || '', /ged-ynamp/);
});

test('installed YnAMP consumes the homeland starts on real, settleable terrain', {
  skip: !hasYnamp && 'Install YnAMP or set YNAMP_PATH to its modules directory for the native-grid check',
}, async t => {
  const db = database(await readFile(join(ynamp, 'data', 'tables.sql'), 'utf8'));
  t.after(() => db.close());
  db.exec(sql);
  const starts = db.prepare('SELECT * FROM StartPosition').all();
  const terrainContext = vm.createContext({ console: { log() {} } });
  const mapRoot = join(ynamp, 'maps', 'giant-earth-map');
  vm.runInContext((await readFile(join(mapRoot, 'giant-earth-data.js'), 'utf8')).replace(/^export /gm, ''), terrainContext);
  const terrain = terrainContext.GetMap();
  const cityData = await readFile(join(mapRoot, 'giant-earth-city.xml'), 'utf8');
  const cityMarkers = [...cityData.matchAll(/<Replace\b[^>]*\/>/g)].map(([row]) =>
    Object.fromEntries([...row.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
  const homelandCities = {
    THRACE: 'PLOVDIV', SCYTHIA: 'KHERSON', NORDIC: 'ODENSE', PICTISH: 'INVERNESS',
    ZIMBABWE: 'MASVINGO', BYZANTIUM: 'ISTANBUL', AYUTTHAYA: 'AYUTTHAYA', AZTEC: 'MEXICO_CITY',
    MOHAWK: 'USA_ALBANY', FRANKS: 'AACHEN', SELJUK: 'ANKARA', RUS: 'KIEV',
    LOMBARDS: 'MILAN', TIMURIDS: 'SAMARKAND', VENICE: 'VENICE', ALMOHADS: 'MARRAKECH',
    KHWARAZMIANS: 'URGENCH', PAPAL_STATES: 'ROME', ASHANTI: 'KUMASI', WAFDIST_EGYPT: 'CAIRO',
    SERBIA: 'BEOGRAD', INDONESIA: 'JAKARTA', PORTUGAL: 'LISBOA', HUNGARY: 'BUDAPEST',
    TAHITI: 'TAHITI', GRAN_COLOMBIA: 'BOGOTA', VATICAN: 'ROME', BERBER: 'ERFOUD',
    SWEDEN: 'STOCKHOLM', AFGHANISTAN: 'KABUL', KAZAKH: 'TURKISTAN', SCOTLAND: 'EDINBURGH',
    DOMINICAN: 'SANTO_DOMINGO', HAITI: 'PORT_PRINCE', BRAZIL: 'RIO_DE_JANEIRO',
  };
  const context = vm.createContext({ GameInfo: { StartPosition: starts } });
  vm.runInContext((await readFile(join(ynamp, 'maps', 'earth-map-context.js'), 'utf8')).replace(/^export /gm, ''), context);
  const candidates = context.buildTSLCandidateMap();
  const continents = {
    BRITONS: 'BRITTANIA', SUEBI: 'GERMANIA', XIONGNU: 'CENTRAL_ASIA', CARALANS: 'SOUTH_AMERICA',
    WAGADU: 'SAHARA', JAVANESE: 'SOUTH_EAST_ASIA', SLAVIC: 'EUROPE', TAINO: 'SOUTH_AMERICA',
    TAINO_EXPLORATION: 'CARIBBEANIA', IBERIA: 'IBERIA',
    THRACE: 'BALKANIA', SCYTHIA: 'EUROPE', NORDIC: 'SCANDINAVIA', PICTISH: 'BRITTANIA',
    ZIMBABWE: 'SOUTH_AFRICA', BYZANTIUM: 'BALKANIA', AYUTTHAYA: 'SOUTH_EAST_ASIA',
    AZTEC: 'MESO_AMERICA', MOHAWK: 'NORTH_AMERICA', LAKHOTA: 'NORTH_AMERICA', NAVAJO: 'NORTH_AMERICA', FRANKS: 'FRANCIA', SELJUK: 'ANATOLIA',
    RUS: 'EUROPE', LOMBARDS: 'ITALIA', TIMURIDS: 'KAZAKHSTANIA', VENICE: 'ITALIA',
    ALMOHADS: 'SAHARA', KHWARAZMIANS: 'KAZAKHSTANIA', PAPAL_STATES: 'ITALIA', ASHANTI: 'AFRICA',
    WAFDIST_EGYPT: 'SAHARA', SERBIA: 'BALKANIA', INDONESIA: 'SOUTH_EAST_ASIA', PORTUGAL: 'IBERIA',
    HUNGARY: 'BALKANIA', TAHITI: 'MELANESIA', GRAN_COLOMBIA: 'SOUTH_AMERICA', VATICAN: 'ITALIA',
    BERBER: 'SAHARA', SWEDEN: 'SCANDINAVIA', AFGHANISTAN: 'KAZAKHSTANIA', KAZAKH: 'KAZAKHSTANIA',
    SCOTLAND: 'BRITTANIA', DOMINICAN: 'CARIBBEANIA', HAITI: 'CARIBBEANIA', BRAZIL: 'SOUTH_AMERICA',
  };
  assert.deepEqual(new Set(starts.map(row => row.Civilization)), new Set(civs));
  for (const row of starts) {
    const key = row.Civilization.replace('CIVILIZATION_ANTHRO_', '');
    const tile = terrain[row.X]?.[row.Y];
    assert.ok(tile, `${row.Civilization}: source tile exists`);
    assert.doesNotMatch(tile[0], /COAST|OCEAN|MOUNTAIN|SNOW|TUNDRA/, `${row.Civilization}: playable land`);
    assert.equal(tile[2], `CONTINENT_${continents[key]}`, `${row.Civilization}: correct geographic region`);
    if (!row.AlternateStart && homelandCities[key]) {
      assert.ok(cityMarkers.some(marker => marker.MapName === 'GiantEarth' &&
        marker.CityLocaleName === `LOC_CITY_NAME_${homelandCities[key]}` &&
        Math.abs(Number(marker.X) - row.X) + Math.abs(Number(marker.Y) - row.Y) <= 1),
      `${row.Civilization}: within one tile of the homeland's native city marker`);
    }
    assert.equal(candidates[row.Civilization]?.length, startCount(row.Civilization),
      `${row.Civilization}: all starts recognized by the real YnAMP collector`);
    assert.ok(candidates[row.Civilization].some(point => point.X === row.X && point.Y === row.Y));
    if (!row.AlternateStart) {
      assert.equal(candidates[row.Civilization][0].X, row.X, 'primary remains first');
      assert.equal(candidates[row.Civilization][0].Y, row.Y, 'primary remains first');
    }
  }
});
