import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const root = new URL('../anthroprocenia/', import.meta.url);
const helper = await readFile(new URL('maps/oversized-dimensions.js', root), 'utf8');
const sql = await readFile(new URL('config/OversizedMaps.sql', root), 'utf8');
const mapNames = ['continents', 'pangaea', 'fractal', 'archipelago', 'shattered-seas', 'shuffle', 'terra-incognita', 'donut'];
const original = name => `{base-standard}maps/${name}-voronoi.js`;
const wrapper = name => `{anthroprocenia_map_history}maps/${name}-voronoi.js`;

function dimensionsContext(regular = {}, square = {}) {
  const handlers = [], errors = [], warnings = [];
  const ctx = vm.createContext({
    MapDims: regular, SquareMapDims: square,
    engine: { on(event, handler) { assert.equal(event, 'RequestMapInitData'); handlers.push(handler); } },
    console: { error: message => errors.push(message), warn: message => warnings.push(message) },
  });
  vm.runInContext(helper.replace(/^import .*;\r?\n/m, '').replace(/^export /gm, ''), ctx);
  return { ctx, handlers, errors, warnings };
}

test('all eight native Voronoi entry points register dimensions before importing their native generator', async () => {
  const manifest = await readFile(new URL('anthroprocenia.modinfo', root), 'utf8');
  for (const name of mapNames) {
    const text = await readFile(new URL(`maps/${name}-voronoi.js`, root), 'utf8');
    assert.equal(text.replace(/\r\n/g, '\n').trim(), `import './oversized-dimensions.js';\nimport '/base-standard/maps/${name}-voronoi.js';`);
    assert.ok(manifest.includes(`<Item>maps/${name}-voronoi.js</Item>`));
    assert.ok(sql.includes(original(name)) && sql.includes(wrapper(name)));
    const { ctx, handlers } = dimensionsContext();
    const sizes = name === 'donut' ? ctx.SquareMapDims : ctx.MapDims;
    handlers.push(params => {
      const dims = sizes[params.mapSize];
      params.width = dims.x;
      params.height = dims.y;
    });
    for (const [mapSize, width, height] of [[5, 180, 94], [6, 252, 130]]) {
      const params = { mapSize, width, height };
      for (const handler of handlers) handler(params);
      assert.deepEqual(params, { mapSize, width, height });
    }
  }
});

test('compatibility preserves native/provider sizes and fills regular and square tables independently', () => {
  const native = { x: 74, y: 46 }, supplied = { x: 180, y: 94 };
  const regular = { 1: native, 5: supplied }, square = { 1: { x: 58, y: 58 } };
  const { ctx } = dimensionsContext(regular, square);
  ctx.registerMapDimensions({ mapSize: 1, width: 999, height: 999 });
  assert.equal(regular[1], native);
  assert.equal(square[1].x, 58);
  ctx.registerMapDimensions({ mapSize: 5, width: 180, height: 94 });
  assert.equal(regular[5], supplied, 'never overwrite another provider');
  assert.deepEqual(JSON.parse(JSON.stringify(square[5])), { x: 180, y: 94 });
  ctx.registerMapDimensions({ mapSize: 5, width: 1, height: 1 });
  assert.equal(regular[5], supplied);
  assert.equal(square[5].x, 180);
});

test('map bootstrap logs module loading and successful dimension registration without per-tile spam', () => {
  const { ctx, warnings } = dimensionsContext();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /compatibility loaded.*awaiting RequestMapInitData/);
  ctx.registerMapDimensions({ mapSize: 5, width: 180, height: 94 });
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /size=5, 180x94/);
  ctx.registerMapDimensions({ mapSize: 5, width: 180, height: 94 });
  assert.equal(warnings.length, 2);
});
test('invalid unknown-size dimensions stop initialization explicitly without leaving partial entries', () => {
  for (const params of [
    { mapSize: 5, width: 0, height: 94 }, { mapSize: 5, width: 180, height: -1 },
    { mapSize: 5, width: 180.5, height: 94 }, { mapSize: 5, width: Infinity, height: 94 },
    { mapSize: 5, width: Number.MAX_SAFE_INTEGER, height: 94 }, { width: 180, height: 94 },
  ]) {
    const { ctx, errors } = dimensionsContext();
    assert.throws(() => ctx.registerMapDimensions(params), /Invalid map initialization/);
    assert.equal(errors.length, 1);
    assert.equal(Object.keys(ctx.MapDims).length, 0);
    assert.equal(Object.keys(ctx.SquareMapDims).length, 0);
  }
});

test('shell remapping preserves all map options, constraints, labels and non-native providers', () => {
  const db = new DatabaseSync(':memory:');
  const keyed = ['Parameters', 'DomainOverrides', 'DomainValues', 'DomainValueUnions', 'DomainValueFilters', 'ConfigurationUpdates'];
  const criteria = ['ParameterCriteria', 'ParameterDependencies', 'ParameterQueryCriteria', 'ParameterQueryDependencies', 'QueryCriteria'];
  const mapped = ['MapLeaders', 'DomainOverridesByMap', 'SupportedValuesByMap', 'UnSupportedValuesByMap', 'MapStartPositions'];
  try {
    db.exec(`CREATE TABLE Maps(File TEXT PRIMARY KEY,Name TEXT,SortIndex INTEGER);
      CREATE TABLE MapRestrictions(MapFile TEXT PRIMARY KEY,LimitPlatforms INTEGER);`);
    for (const table of keyed) db.exec(`CREATE TABLE ${table}(Key1 TEXT,Key2 TEXT,ParameterID TEXT,DefaultValue TEXT,Value TEXT,SourceGroup TEXT,SourceKey TEXT,SourceValue TEXT,TargetGroup TEXT,TargetKey TEXT,TargetValue TEXT)`);
    for (const table of criteria) db.exec(`CREATE TABLE ${table}(ConfigurationGroup TEXT,ConfigurationKey TEXT,ConfigurationValue TEXT)`);
    for (const table of mapped) db.exec(`CREATE TABLE ${table}(Map TEXT,Domain TEXT,Value TEXT)`);
    for (const name of mapNames) {
      const from = original(name);
      db.prepare('INSERT INTO Maps VALUES (?,?,?)').run(from, name, mapNames.indexOf(name));
      db.prepare("INSERT INTO Parameters(ParameterID,DefaultValue) VALUES ('Map',?)").run(from);
      for (const table of keyed) db.prepare(`INSERT INTO ${table}(Key1,Key2,Value,SourceGroup,SourceKey,SourceValue,TargetGroup,TargetKey,TargetValue) VALUES ('Map',?,?,'Map','Script',?,'Map','Script',?)`).run(from, from, from, from);
      for (const table of criteria) db.prepare(`INSERT INTO ${table} VALUES ('Map','Script',?)`).run(from);
      for (const table of mapped) db.prepare(`INSERT INTO ${table} VALUES (?,'test','preserved')`).run(from);
      db.prepare('INSERT INTO MapRestrictions VALUES (?,1)').run(from);
    }
    const external = '{ged-ynamp}maps/giant-earth-map/giant-earth-map.js';
    db.prepare('INSERT INTO Maps VALUES (?,?,100)').run(external, 'Giant Earth');
    db.prepare("INSERT INTO Parameters(Key1,Key2,ParameterID,DefaultValue) VALUES ('Unrelated',?,'Other',?)").run(original('continents'), original('continents'));
    db.exec(sql);
    db.exec(sql);
    const choices = db.prepare('SELECT * FROM Maps').all();
    assert.equal(choices.length, 9);
    assert.ok(choices.some(row => row.File === external && row.Name === 'Giant Earth'));
    for (const name of mapNames) {
      const to = wrapper(name);
      const entry = choices.find(row => row.File === to);
      assert.equal(entry.Name, name);
      assert.equal(entry.SortIndex, mapNames.indexOf(name));
      assert.ok(db.prepare("SELECT 1 FROM Parameters WHERE ParameterID='Map' AND DefaultValue=?").get(to));
      for (const table of keyed) assert.ok(db.prepare(`SELECT 1 FROM ${table} WHERE Key1='Map' AND Key2=?`).get(to), table);
      for (const table of ['DomainValues', 'DomainValueFilters']) assert.ok(db.prepare(`SELECT 1 FROM ${table} WHERE Value=?`).get(to));
      assert.ok(db.prepare('SELECT 1 FROM ConfigurationUpdates WHERE SourceValue=? AND TargetValue=?').get(to, to));
      for (const table of criteria) assert.ok(db.prepare(`SELECT 1 FROM ${table} WHERE ConfigurationValue=?`).get(to), table);
      for (const table of mapped) assert.equal(db.prepare(`SELECT Value FROM ${table} WHERE Map=?`).get(to).Value, 'preserved', table);
      assert.equal(db.prepare('SELECT LimitPlatforms FROM MapRestrictions WHERE MapFile=?').get(to).LimitPlatforms, 1);
    }
    assert.equal(db.prepare("SELECT Key2,DefaultValue FROM Parameters WHERE ParameterID='Other'").get().DefaultValue, original('continents'));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_temp_master WHERE name='AnthroMapWrappers'").get().n, 0);
  } finally { db.close(); }
});
