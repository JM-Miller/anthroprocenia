import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../anthroprocenia/', import.meta.url);
const sql = await readFile(new URL('config/SetupDefaults.sql', root), 'utf8');
const defaults = {
  AgeCountdownTimer: 'AGE_COUNTDOWN_LENGTH_NONE',
  AgeLength: 'AGE_LENGTH_LONG',
  DisasterIntensity: 'REALISM_SETTING_HEAVY',
  EnableScoreVictory: 0,
  NoCivUnlocks: 0,
  Age: 'AGE_ANTIQUITY',
  GameStartCivSelectionMode: 'GAME_START_CIV_SELECTION_MODE_APEX',
  AgeTransitionCivSelectionMode: 'AGE_TRANSITION_CIV_SELECTION_MODE_SWITCHING',
  LeaderAssociatedCivSelectionMode: 'LEADER_ASSOCIATED_CIV_SELECTION_MODE_HISTORICAL',
  NWPlacementMode: 'YNAMP_NW_PLACEMENT_REAL_ONLY',
};

for (const giant of [false, true]) test(`new-game defaults apply across setup variants, Giant ${giant ? 'available' : 'absent'}`, () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE Parameters(Key1 TEXT,Key2 TEXT,ParameterID TEXT,Domain TEXT,DefaultValue,ReadOnly INTEGER DEFAULT 0);
      CREATE TABLE Maps(Domain TEXT DEFAULT 'StandardMaps',File TEXT PRIMARY KEY);
      CREATE TABLE MapSizes(Domain TEXT,MapSizeType TEXT,DefaultPlayers INTEGER DEFAULT 6,MaxPlayers INTEGER DEFAULT 10,MaxHumans INTEGER DEFAULT 5);
      INSERT INTO MapSizes(Domain,MapSizeType) VALUES ('StandardMapSizes','MAPSIZE_SMALL'),('CustomMapSizes','MAPSIZE_SMALL');`);
    const insert = db.prepare('INSERT INTO Parameters(Key1,ParameterID,Domain,DefaultValue) VALUES (?,?,?,?)');
    for (const mode of ['SP', 'MP']) {
      for (const id of Object.keys(defaults)) insert.run(mode, id, 'native', 'original');
      insert.run(mode, 'MapSize', 'StandardMapSizes', 'MAPSIZE_SMALL');
      insert.run(mode, 'MapSize', 'CustomMapSizes', 'MAPSIZE_SMALL');
      insert.run(mode, 'Map', 'StandardMaps', 'continents.js');
      insert.run(mode, 'Map', 'CustomMaps', 'custom.js');
      insert.run(mode, 'Unrelated', 'native', 'unchanged');
    }
    if (giant) db.exec("INSERT INTO MapSizes(Domain,MapSizeType) VALUES ('StandardMapSizes','MAPSIZE_GIANT')");
    if (giant) db.exec("INSERT INTO Maps(File) VALUES ('{ged-ynamp}maps/giant-earth-map/giant-earth-map.js')");
    db.exec(sql);
    db.exec(sql);
    for (const row of db.prepare('SELECT * FROM Parameters').all()) {
      const expected = row.ParameterID === 'MapSize'
        ? giant && row.Domain === 'StandardMapSizes' ? 'MAPSIZE_GIANT' : 'MAPSIZE_SMALL'
        : row.ParameterID === 'Map' ? row.Domain === 'CustomMaps' ? 'custom.js'
          : giant ? '{ged-ynamp}maps/giant-earth-map/giant-earth-map.js' : 'continents.js'
        : defaults[row.ParameterID] ?? 'unchanged';
      assert.equal(row.DefaultValue, expected, `${row.Key1} ${row.ParameterID} ${row.Domain}`);
      assert.equal(row.ReadOnly, 0, 'these are defaults, not locked choices');
    }
    const sizes = db.prepare('SELECT * FROM MapSizes').all();
    assert.equal(sizes.length, giant ? 3 : 2, 'smaller and custom-domain sizes remain selectable');
    for (const row of sizes) {
      assert.equal(row.DefaultPlayers, row.MapSizeType === 'MAPSIZE_GIANT' ? 63 : 6);
      assert.equal(row.MaxPlayers, row.MapSizeType === 'MAPSIZE_GIANT' ? 63 : 10);
      assert.equal(row.MaxHumans, 5);
    }
  } finally { db.close(); }
});

test('all map domains retain smaller sizes and their player limits while oversized defaults remain 63', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE Parameters(ParameterID TEXT,Domain TEXT,DefaultValue TEXT);
      CREATE TABLE MapSizes(Domain TEXT,MapSizeType TEXT,DefaultPlayers INTEGER,MaxPlayers INTEGER,MaxHumans INTEGER);
      CREATE TABLE Maps(Domain TEXT DEFAULT 'StandardMaps',File TEXT);
      INSERT INTO Maps(File) VALUES ('giant-earth-map.js');`);
    const insert = db.prepare('INSERT INTO MapSizes VALUES (?,?,6,?,5)');
    const oversized = ['MAPSIZE_GIANT', 'MAPSIZE_GIANT_EARTH', 'MAPSIZE_LUDICROUS', 'MAPSIZE_ANTHRO_COLOSSAL'];
    const smaller = ['MAPSIZE_TINY', 'MAPSIZE_SMALL', 'MAPSIZE_STANDARD', 'MAPSIZE_LARGE', 'MAPSIZE_HUGE',
      'MAPSIZE_MASSIVE', 'MAPSIZE_GREATEST_EARTH'];
    for (const domain of ['StandardMapSizes', 'DistantLandsMapSizes', 'CustomMapSizes']) {
      for (const type of [...oversized, ...smaller]) {
        insert.run(domain, type, type === 'MAPSIZE_LUDICROUS' ? 100 : 10);
      }
    }
    db.exec(sql);
    db.exec(sql);
    const rows = db.prepare('SELECT * FROM MapSizes').all();
    assert.equal(rows.length, 3 * (oversized.length + smaller.length));
    for (const row of rows) {
      assert.equal(row.DefaultPlayers, oversized.includes(row.MapSizeType) ? 63 : 6);
      assert.equal(row.MaxPlayers, row.MapSizeType === 'MAPSIZE_LUDICROUS' ? 100 : oversized.includes(row.MapSizeType) ? 63 : 10);
      assert.equal(row.MaxHumans, 5);
    }
    assert.ok(rows.filter(row => row.MapSizeType === 'MAPSIZE_LUDICROUS').every(row => row.MaxPlayers === 100));
    assert.equal(db.prepare('SELECT File FROM Maps').get().File, 'giant-earth-map.js', 'Giant Earth script is not removed');
  } finally { db.close(); }
});

test('setup defaults load after optional map providers in the shell, not into saved gameplay', async () => {
  const manifest = await readFile(new URL('anthroprocenia.modinfo', root), 'utf8');
  assert.match(manifest, /<References>[\s\S]*?<Mod id="ged-ynamp"\s*\/>/);
  assert.match(manifest, /<ActionGroup[^>]*scope="shell"[^>]*>[\s\S]*?<LoadOrder>1000<\/LoadOrder>[\s\S]*?<Item>config\/SetupDefaults.sql<\/Item>/);
  assert.equal((manifest.match(/<Item>config\/SetupDefaults.sql<\/Item>/g) || []).length, 1);
});
