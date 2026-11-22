import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const root = new URL('../', import.meta.url);
const content = JSON.parse(await readFile(new URL('tools/civilizations.json', root), 'utf8'));
for (const era of ['antiquity', 'exploration', 'modern']) {
  content.push(...JSON.parse(await readFile(new URL(`tools/civilizations-${era}-additions.json`, root), 'utf8')));
}
const { syncCivilizationUnitPortrait, civilizationBackgroundTexture } = await loadModule('anthroprocenia-civilization-art.js');
const { CIV_ICON_CHOICES } = await loadModule('anthroprocenia-civ-icons.js');
const { cultureOf, NAME_CULTURES, generatedGiven } = await loadModule('anthroprocenia-namegen.js');
const base = process.env.CIV7_BASE_PATH || String.raw`C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII\Base`;

test('native cards and reactive menu stages display original art without tiling or changing other civilizations', async () => {
  const styles = [];
  const source = await readFile(new URL('anthroprocenia/ui/map/anthroprocenia-civilization-backgrounds.js', root), 'utf8');
  let replacement;
  const nativeLayer = { factory: () => props => props, overridePriority: 3 };
  const effects = [];
  vm.runInNewContext(source.replace(/^import .+;\n/gm, ''), {
    document: { createElement: tag => {
      assert.ok(['style', 'div'].includes(tag)); return { style: {} };
    },
      head: { appendChild: style => styles.push(style.textContent) } },
    civilizationBackgroundTexture,
    ComponentRegistry: { get: name => { assert.equal(name, 'CreateGameStage'); return nativeLayer; },
      register: (name, factory, priority) => {
        assert.equal(name, 'CreateGameStage'); assert.equal(priority, 4); replacement = factory;
      } },
    createRenderEffect: effect => { effects.push(effect); effect(); },
  });
  assert.equal(styles.length, 1);
  for (const { key } of content) for (const layout of ['card', 'panel']) {
    const path = `fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_${key.toLowerCase()}.png`;
    assert.ok(styles[0].includes(`.img-bg-${layout}-anthro_${key.toLowerCase()}, [style*="bg-${layout}-anthro_${key.toLowerCase()}"]`));
    assert.ok(styles[0].includes(`background-image: url("${path}") !important;`));
    assert.equal(civilizationBackgroundTexture(`bg-${layout}-anthro_${key.toLowerCase()}`), path);
    assert.equal(civilizationBackgroundTexture(`blp:bg-${layout}-anthro_${key.toLowerCase()}.png`), path);
  }
  assert.equal(styles[0].split('\n').length, content.length * 3, 'only expansion background and emblem lookups are redirected');
  for (const { key } of content) {
    const rule = styles[0].split('\n').find(rule => rule.startsWith(`.img-civ_sym_anthro_${key.toLowerCase()},`));
    assert.ok(rule.includes(`/civilizations/${key.toLowerCase()}.png`));
    assert.ok(rule.includes('background-size: contain !important;'));
    assert.ok(!rule.includes('/scenes/'), 'native filename-based emblems never show scene art');
  }
  assert.ok(styles[0].split('\n').filter(rule => rule.startsWith('.img-bg-'))
    .every(rule => rule.includes('background-size: cover !important;')));
  assert.ok(styles[0].split('\n').every(rule => rule.includes('background-repeat: no-repeat !important;')));
  const props = { backgroundImage: 'bg-panel-anthro_britons', backgroundOpacity: 0.4 };
  const [background, native] = replacement(props);
  assert.match(background.style.cssText, /width:100%;height:100%/, 'Gameface backdrop has explicit dimensions');
  assert.equal(native, props, 'native stage props and controls remain intact');
  assert.match(background.style.backgroundImage, /scenes\/scene_anthro_britons.png/);
  assert.equal(background.style.opacity, '0.4');
  props.backgroundImage = 'bg-panel-anthro_taino';
  effects[0]();
  assert.match(background.style.backgroundImage, /scenes\/scene_anthro_taino.png/, 'art follows reused reactive stages');
  props.backgroundImage = 'bg-panel-egypt';
  effects[0]();
  assert.equal(background.style.display, 'none', 'switching back restores native art');
  assert.equal(background.style.backgroundImage, '');
  for (const value of [null, undefined, 'bg-panel-egypt', 'bg-panel-anthro_unknown', 'shell-line-divider']) {
    assert.equal(civilizationBackgroundTexture(value), value);
  }
});

test('existing custom civs retain alternate emblems and all custom civs have supported naming families', () => {
  for (const { key } of content.slice(0, 8)) {
    assert.equal(CIV_ICON_CHOICES['ANTHRO_' + key]?.length, 4, key);
  }
  assert.equal(CIV_ICON_CHOICES.ANTHRO_TAINO_EXPLORATION?.length, 4);
  for (const { key } of content) {
    const family = cultureOf('ANTHRO' + key);
    assert.notEqual(family, 'generic', key);
    assert.ok(NAME_CULTURES.includes(family), key);
    assert.ok(generatedGiven(family, false, key));
    assert.ok(generatedGiven(family, true, key));
  }
});

test('all unique-unit tiers redirect live portraits to native models without affecting other units', () => {
  for (const civ of content) for (const [index, donor] of [...(civ.models || civ.donors), civ.age === 'MODERN' ? 'EXPLORER' : 'SCOUT'].entries()) {
    const unitType = `UNIT_ANTHRO_${civ.key}_${index + 1}`;
    const actions = { component: { portraitImage: { style: { backgroundImage: `url("live:/${unitType}")` } } } };
    const calls = [], definitions = { lookup: () => ({ UnitType: unitType }) };
    const world = { requestPortrait: (...args) => calls.push(args) };
    syncCivilizationUnitPortrait(actions, { type: 42 }, definitions, world);
    syncCivilizationUnitPortrait(actions, { type: 42 }, definitions, world);
    assert.deepEqual(calls, [[`UNIT_${donor}`, `UNIT_${donor}`, 'UnitPortraitsBG_UNIQUE']]);
    assert.equal(actions.component.portraitImage.style.backgroundImage, `url("live:/UNIT_${donor}")`);
  }
  syncCivilizationUnitPortrait({ component: { portraitImage: { style: {} } } }, { type: 1 },
    { lookup: () => ({ UnitType: 'UNIT_WARRIOR' }) }, { requestPortrait() { assert.fail('native unit unchanged'); } });
});

test('GoTurks retain compatible internal identities but use early Turkic names instead of the Xiongnu palette', () => {
  const civ = content.find(civ => civ.key === 'XIONGNU');
  assert.equal(civ.name, 'GoTurks');
  assert.equal(cultureOf('ANTHRO_XIONGNU'), 'gokturk');
  assert.equal(cultureOf('ANTHRO_GOTURKS'), 'gokturk');
  const male = new Set(['Bumin', 'Istemi', 'Mugan', 'Taspar', 'Bilge', 'Tonyukuk', 'Kul Tigin']);
  const female = new Set(['Elbilge', 'Qutlug Sebag']);
  for (let seed = 0; seed < 40; seed++) {
    assert.ok(male.has(generatedGiven(cultureOf('ANTHRO_XIONGNU'), false, seed)));
    assert.ok(female.has(generatedGiven(cultureOf('ANTHRO_XIONGNU'), true, seed)));
  }
  assert.ok(civ.cities.includes('Otuken') && civ.cities.includes('Suyab'));
  assert.doesNotMatch(JSON.stringify({ ...civ, key: undefined, note: undefined }), /Xiongnu|Chanyu|Heqin/);
});

test('starter and land-privateer portraits use their native model donors without repeated requests', () => {
  const donors = { LATCHED_REED_OARBOAT: 'GALLEY', CLUBMAN: 'WARRIOR', STONE_THROWER: 'SLINGER',
    RAIDER: 'SPEARMAN', HIGHWAYMEN: 'SWORDSMAN', PARTISAN: 'RIFLEMAN' };
  for (const [key, donor] of Object.entries(donors)) {
    const actions = { component: { portraitImage: { style: { backgroundImage: '' } } } };
    const calls = [], definitions = { lookup: () => ({ UnitType: 'UNIT_ANTHRO_' + key }) };
    const world = { requestPortrait: (...args) => calls.push(args) };
    syncCivilizationUnitPortrait(actions, { type: 42 }, definitions, world);
    syncCivilizationUnitPortrait(actions, { type: 42 }, definitions, world);
    assert.deepEqual(calls, [[`UNIT_${donor}`, `UNIT_${donor}`, 'UnitPortraitsBG_UNIQUE']]);
    assert.equal(actions.component.portraitImage.style.backgroundImage, `url("live:/UNIT_${donor}")`);
  }
});

for (const age of ['antiquity', 'exploration', 'modern']) test(`native ${age} schema accepts isolated Age definitions and every unique has art`, {
  skip: !existsSync(base) && 'Set CIV7_BASE_PATH to the installed Base directory for native schema checks',
}, () => {
  const result = spawnSync('python', [fileURLToPath(new URL('tests/civilizations-native.py', root)), base, age],
    { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(`all ${content.length} selectable civs`));
});
