import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const read = file => readFile(new URL(`../anthroprocenia/ui/${file}`, import.meta.url), 'utf8');
const playback = await read('map/anthroprocenia-playback.js');
const recorder = await read('history/anthroprocenia-recorder.js');
const panel = await loadModule('anthroprocenia-population-panel.js');
const units = await loadModule('anthroprocenia-units.js');
const { personProfile, homePlan, personRecord } = await loadModule('anthroprocenia-people.js');
const { ageCategory } = await loadModule('anthroprocenia-demography.js');
const { buildPopulationTree, visibleRows, revealPerson, personRowIndex, centerScroll, personKey, PAGE_SIZE } = panel;
const { unitPopulationFactor, settlementDamageFactor, PILLAGED_FACTOR, iconPopulation } = units;

const slice = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  return source.slice(start, i + 1);
};

const entry = (tile, id, population) => ({
  civ: { id: 'o1', name: 'Rome' }, continent: { id: '3', name: 'Europe' }, tile: { index: tile, name: `T${tile}` },
  icon: { id, name: `Icon ${id}`, kind: 'building', population, owner: 1, category: 'farm', unit: null },
});

test('revealing a person opens every level above them and widens the pages to include them', () => {
  const entries = [];
  for (let tile = 0; tile < 130; tile++) entries.push(entry(tile, 'b1.0.0', 1000 - tile));
  entries.push(entry(500, 'b2.0.0', 400));
  const tree = buildPopulationTree(entries), expanded = new Set(), shown = new Map();
  const farTile = tree[0].children[0].children.find(t => t.tile === 129), group = farTile.children[0], icon = group.children[0];
  const node = revealPerson(tree, icon.id, 7, expanded, shown);
  assert.equal(node, icon);
  for (const id of [tree[0].id, tree[0].children[0].id, farTile.id, group.id, icon.id]) assert.ok(expanded.has(id), id);
  const rows = visibleRows(tree, expanded, shown);
  const at = personRowIndex(rows, icon.id, 7);
  assert.ok(at > 0, 'the person is among the visible rows even though they are on a later page');
  assert.ok(shown.get(tree[0].children[0].id) >= 130, 'the tile list was widened');
});

test('revealing the 200th person of an icon pages the people list', () => {
  const tree = buildPopulationTree([entry(1, 'b1.0.0', 500)]), expanded = new Set(), shown = new Map();
  const icon = tree[0].children[0].children[0].children[0].children[0];
  assert.equal(revealPerson(tree, icon.id, 199, expanded, shown), icon);
  assert.equal(shown.get(icon.id), Math.ceil(200 / PAGE_SIZE) * PAGE_SIZE);
  const rows = visibleRows(tree, expanded, shown);
  assert.ok(personRowIndex(rows, icon.id, 199) >= 0);
  assert.equal(revealPerson(tree, icon.id, 500, new Set(), new Map()), null, 'beyond the population');
  assert.equal(revealPerson(tree, 'c:o9|k:3|t:1|g:b1|i:b1.0.0', 0, new Set(), new Map()), null, 'unknown icon');
  assert.equal(personKey(icon.id, 3), `${icon.id}#3`);
});

test('a revealed person is found in either occupation sort', () => {
  const tree = buildPopulationTree([entry(1, 'b1.0.0', 500)]);
  const icon = tree[0].children[0].children[0].children[0].children[0];
  const plan = homePlan({ religion: '', age: 1, category: 'farm', form: '', unit: null }, icon.id, icon.total);
  const options = sort => ({ sort, plan: node => (node.id === icon.id ? plan : null), occupationLabel: t => t });
  for (const sort of ['occupation', 'groups']) {
    for (const index of [0, 137, 499]) {
      const expanded = new Set(), shown = new Map();
      assert.equal(revealPerson(tree, icon.id, index, expanded, shown, options(sort)), icon);
      const rows = visibleRows(tree, expanded, shown, options(sort));
      assert.ok(personRowIndex(rows, icon.id, index) >= 0, `${sort} ${index}`);
    }
  }
});

test('a revealed person is scrolled to the middle of the list', () => {
  assert.equal(centerScroll(0, 400, 26), 0);
  assert.equal(centerScroll(50, 400, 26), 50 * 26 - (400 - 26) / 2);
  assert.ok(centerScroll(50, 400, 26) < 50 * 26 && centerScroll(50, 400, 26) + 400 > 51 * 26);
});

test('a map dot and the panel row are the same person', () => {
  const owners = new Map([[1, { civKey: 'ABBASID', religion: 'Islam' }]]);
  const context = vm.createContext({
    ...panel, personProfile, homePlan, personRecord, ageCategory, JSON, Map, pos: 5,
    popState: { profiles: new Map(), plans: new Map(), era: { age: 1, lvl: 2 }, eraKey: '5|9|0', selectedPerson: '' },
    popModelKey: () => '5|9|0', townEraNow: () => ({ age: 0, lvl: 0 }), popOwnerContext: owner => owners.get(owner) || { civKey: '', religion: '' },
    popLife: () => null, err: () => {}, popLeaderRole: () => '', popLeaderHousehold: () => false, cmdNoteLeader: () => {}, nearestSettlement: () => null,
  });
  vm.runInContext(['popEraNow', 'popHomePlan', 'lifeSeed', 'popProfile', 'popPerson'].map(name => slice(playback, name)).join('\n'), context);
  const node = { id: 'c:o1|k:3|t:77|g:b4|i:b4.0.2', total: 40, icon: { owner: 1, category: 'farm', unit: null } };
  const row = vm.runInContext('popPerson', context)(node, 3);
  context.popState.profiles.clear();
  const dot = vm.runInContext('popProfile', context)(node.id, 3, 1, { category: 'farm', unit: null }, 40);
  assert.equal(JSON.stringify(dot), JSON.stringify(row));
  const plan = homePlan({ religion: 'Islam', age: 1, category: 'farm', form: '', unit: null, turn: 5 }, node.id, 40);
  const direct = personProfile({ civKey: 'ABBASID', religion: 'Islam', age: 1, lvl: 2, seed: `${node.id}#3`, category: 'farm', form: '', unit: null, plan, index: 3 });
  assert.equal(row.name, direct.name);
  assert.equal(row.occupation, direct.occupation);
  assert.deepEqual(row.traits, direct.traits);
  assert.notEqual(vm.runInContext('popProfile', context)(node.id, 4, 1, { category: 'farm', unit: null }, 40).name, row.name, 'person 4 is somebody else');
  // while the panel's model is for another turn the dots fall back to the current era
  context.popState.eraKey = 'stale';
  assert.equal(vm.runInContext('popEraNow', context)().age, 0);
  // With a life, the person has an age and an age category; a child is listed as their family trade's child.
  context.popState.eraKey = '5|9|0'; context.popState.profiles.clear();
  context.popLife = () => ({ state: { gen: 0, family: 0 }, years: 34, turn: 5 });
  const adult = vm.runInContext('popPerson', context)({ ...node, tile: 77 }, 3);
  assert.equal(adult.years, 34);
  assert.equal(adult.ageCategory, 'Adult');
  assert.equal(adult.name, row.name);
  context.popState.profiles.clear();
  context.popLife = () => ({ state: { gen: 0, family: 0 }, years: 2, turn: 5 });
  const infant = vm.runInContext('popPerson', context)({ ...node, tile: 77 }, 3);
  assert.equal(infant.ageCategory, 'Child');
  assert.equal(infant.occupation, 'Infant');
  for (const [years, expected] of [[12.999, 'Child'], [13, 'Youth'], [15.999, 'Youth'], [16, 'Adult']]) {
    context.popState.profiles.clear();
    context.popLife = () => ({ state: { gen: 0, family: 0 }, years, turn: 5 });
    const profile = vm.runInContext('popPerson', context)({ ...node, tile: 77 }, 3);
    assert.equal(profile.ageCategory, expected);
    assert.equal(profile.years, Math.floor(years));
    assert.equal(profile.name, row.name);
  }
  context.popState.profiles.clear();
  context.popLife = () => ({ state: { gen: 0, family: 0 }, years: 0, turn: 5 });
  const recruit = vm.runInContext('popPerson', context)({ ...node, tile: 77, icon: { ...node.icon, unit: { sub: 'melee' } } }, 3);
  assert.equal(recruit.years, 16);
  assert.equal(recruit.ageCategory, 'Adult');
  context.popState.profiles.clear();
  context.popLife = () => ({ state: { gen: 2, family: 1 }, years: 20, turn: 5 });
  const later = vm.runInContext('popPerson', context)({ ...node, tile: 77 }, 3);
  assert.notEqual(later.name, row.name, 'a later generation in the slot is someone else');
});

test('map items are keyed exactly like the panel\'s tree', () => {
  const context = vm.createContext({
    ...panel, popTileOwner: () => 2, popPlaceInfo: () => ({ continent: { id: '3', name: 'Europe' } }),
    manifest: { buildingTypes: [0, 1, 2, 3, [4, 'Farm', 1]] }, unitTypeName: () => 'Warrior', wonderNameByIdx: () => 'Pyramids',
    pos: 4, unitLineageId: (row, t) => `7.${row}@${t}`,
  });
  vm.runInContext(['popIconId', 'popIconGroup', 'popIconKey'].map(name => slice(playback, name)).join('\n'), context);
  const key = vm.runInContext('popIconKey', context);
  const building = { kind: 'building', index: 77, typeIndex: 4, dot: 2, n: 1 };
  assert.equal(key(building).nodeId, 'c:o2|k:3|t:77|g:b4|i:b4.1.2');
  assert.equal(key(building).owner, 2);
  const unit = { kind: 'unit', index: 8, owner: 5, row: 12, type: 1 };
  assert.equal(key(unit).nodeId, 'c:o5|k:3|t:8|g:ut1|i:u7.12@4', 'units are known by their lineage on the viewed turn');
  assert.equal(key({ kind: 'wonder', index: 9, typeIndex: 3 }).nodeId, 'c:o2|k:3|t:9|g:w3|i:w3');
  const group = vm.runInContext('popIconGroup', context);
  assert.deepEqual(JSON.parse(JSON.stringify(group(building))), { id: 'b4', name: 'Farm' });
  const tree = buildPopulationTree([{ civ: { id: 'o2', name: 'x' }, continent: { id: '3', name: 'Europe' }, tile: { index: 77, name: 't' }, icon: { id: 'b4.1.2', name: 'n', kind: 'building', population: 9, owner: 2, category: 'farm', unit: null, group: group(building) } }]);
  assert.equal(tree[0].children[0].children[0].children[0].label, 'Farm', 'Home Locations are listed under their kind of icon');
  assert.equal(tree[0].children[0].children[0].children[0].children[0].id, key(building).nodeId, 'the panel node id');
});

test('wounds cost people, strength bonuses add them, pillaging costs a quarter, and damaged settlements lose some', () => {
  assert.equal(unitPopulationFactor(100, 0), 1);
  assert.equal(unitPopulationFactor(50, 0), 0.5);
  assert.equal(unitPopulationFactor(100, 50), 1.5);
  assert.equal(unitPopulationFactor(50, 100), 1);
  assert.equal(unitPopulationFactor(0, 0), 0.02);
  assert.equal(unitPopulationFactor(undefined, undefined), 1);
  assert.equal(unitPopulationFactor(400, -20), 1, 'clamped');
  assert.equal(PILLAGED_FACTOR, 0.25);
  assert.equal(settlementDamageFactor(0, 10), 1);
  assert.equal(settlementDamageFactor(10, 10), 0.5);
  assert.equal(settlementDamageFactor(5, 10), 0.75);
  assert.equal(settlementDamageFactor(3, 0), 1);
  const full = iconPopulation(1e9, 1000, 'seed', 1), half = iconPopulation(1e9, 1000, 'seed', unitPopulationFactor(50, 0));
  assert.ok(Math.abs(half / full - 0.5) < 0.01);
});

test('population follows health, strength, pillage and settlement damage through populationForItem', () => {
  const state = { damaged: new Map(), settlementDamage: new Map() };
  const context = vm.createContext({
    ...units, Map, Math, Number,
    originSettlement: () => ({ population: 50, index: 5 }), estimatedWorldPopulation: () => 1e9, currentMapYear: () => 0, entityCountForPos: () => 1000,
    damagedForPos: () => state.damaged, settlementDamageFor: index => state.settlementDamage.get(index) ?? 1,
    populationClassFor: item => (item.kind === 'building' ? state.classOf(item) : item.kind),
    cmdPopulationDelta: () => 0, popIconId: item => `u0.${item.row}`,
  });
  state.classOf = () => 'urban';
  vm.runInContext(['populationForItem', 'isPillagedItem'].map(name => slice(playback, name)).join('\n'), context);
  const pop = vm.runInContext('populationForItem', context);
  const unit = health => ({ kind: 'unit', index: 3, type: 2, row: 0, health, bonus: 0 });
  assert.ok(Math.abs(pop(unit(50)) / pop(unit(100)) - 0.5) < 0.01, 'a half-health unit has half the people');
  assert.ok(pop(unit(10)) < pop(unit(50)));
  assert.ok(Math.abs(pop({ ...unit(100), bonus: 40 }) / pop(unit(100)) - 1.4) < 0.01, 'a 40% strength bonus adds 40%');
  const farm = { kind: 'building', index: 9, typeIndex: 4, dot: 1, n: 0 }, other = { ...farm, typeIndex: 5 };
  const whole = pop(farm), otherWhole = pop(other);
  state.damaged.set(9, [4]);
  assert.ok(Math.abs(pop(farm) / whole - 0.25) < 0.02, 'a pillaged constructible keeps a quarter');
  assert.ok(Math.abs(pop(other) / otherWhole - 1) < 0.01, 'only the pillaged type is affected');
  state.damaged.clear();
  // Where an icon is decides its share: a settlement's centre holds far more people than an improvement in the fields.
  state.classOf = () => 'center';
  const center = pop(farm);
  state.classOf = () => 'improvement';
  const field = pop(farm);
  state.classOf = () => 'urban';
  assert.ok(center / field > 15, `centre ${center} vs improvement ${field}`);
  assert.ok(whole / field > 8 && center > whole);
  state.settlementDamage.set(5, 0.75);
  assert.ok(Math.abs(pop(farm) / whole - 0.75) < 0.02, 'a damaged settlement loses some of everything built for it');
  const specialists = { kind: 'specialist', index: 5 };
  state.settlementDamage.clear();
  const before = pop(specialists);
  state.settlementDamage.set(5, 0.5);
  assert.ok(Math.abs(pop(specialists) / before - 0.5) < 0.02, 'and so do its specialists');
});

test('the recorder saves pillaged constructibles and unit strength bonuses', () => {
  assert.match(recorder, /if \(con\.damaged\)/);
  assert.match(recorder, /dmg = damagedDelta\(snapshot\)/);
  assert.match(recorder, /JSON\.stringify\(\{ t: turn, s: snapshot \? 1 : 0, terr, bld, dmg, set, vis, won \}\)/);
  assert.match(recorder, /prevDamaged = baseDamaged/);
  assert.match(recorder, /baseDamaged = prevDamaged/);
  assert.match(recorder, /result\.s = bonus/);
  assert.match(playback, /rec\.dmg/);
  assert.match(playback, /r\.s\[i \+ 1\]/);
});

test('unit strength bonus is read from the unit\'s current strength against its type\'s base', () => {
  const stats = { Combat: 20, RangedCombat: 0, Bombard: 0 };
  const context = vm.createContext({ Map, Math, GameInfo: { Units: { lookup: () => ({ UnitType: 'UNIT_X' }) }, Unit_Stats: { lookup: () => stats } } });
  vm.runInContext(`const baseStrengthCache = new Map(); ${slice(recorder, 'unitStrengthBonusPercent')}`, context);
  const bonus = vm.runInContext('unitStrengthBonusPercent', context);
  const unit = (melee, ranged = 0) => ({ type: 1, Combat: { getMeleeStrength: () => melee, rangedStrength: ranged, bombardStrength: 0 } });
  assert.equal(bonus(unit(20)), 0);
  assert.equal(bonus(unit(15)), 0, 'weakened units get no bonus');
  assert.equal(bonus(unit(30)), 50);
  assert.equal(bonus(unit(5, 30)), 50, 'ranged strength counts too');
  assert.equal(bonus(unit(1000)), 300, 'capped');
  assert.equal(bonus({ type: 1 }), 0);
  assert.equal(bonus(null), 0);
});

test('the walking people are drawn in screen pixels on their own layer, and clicks and selection are wired up', () => {
  const layer = slice(playback, 'ensurePeopleLayer');
  assert.match(layer, /document\.body\.appendChild\(peopleSvg\)/);
  assert.doesNotMatch(layer, /townLayer/);
  const tick = slice(playback, 'peopleTick');
  assert.match(tick, /walkerScreenPoint\(person\)/);
  assert.match(slice(playback, 'walkerScreenPoint'), /mapToScreen\(point\.x, point\.y\)/);
  assert.match(tick, /const radius = walkerDotRadius\(\)/);
  assert.match(slice(playback, 'walkerDotRadius'), /Math\.max\(1\.6, ps\(1\.6\),/);
  assert.match(tick, /popState\.selectedPerson/);
  assert.match(slice(playback, 'syncPeople'), /ensurePeopleLayer\(\)/);
  assert.match(slice(playback, 'onMapDragStart'), /personAt\(e\.clientX, e\.clientY\)[\s\S]*selectPersonFromMap\(person\)/);
  assert.match(slice(playback, 'onPopPress'), /row\.type === 'person'\) popSelectPerson/);
  assert.match(slice(playback, 'createWalkers'), /Math\.min\(MAX_TOWN_PEOPLE, /);
  assert.match(slice(playback, 'personTipText'), /Home: /);
  assert.match(slice(playback, 'personTipText'), /Traits: /);
  assert.match(slice(playback, 'personSpot'), /if \(person\.fade < 0\.35\) return null/, 'people indoors have no dot to point at');
});

test('picking a person on the map opens the panel, selects and focuses them', () => {
  const calls = [];
  const tree = buildPopulationTree([entry(1, 'b1.0.0', 80)]);
  const icon = tree[0].children[0].children[0].children[0].children[0];
  const context = vm.createContext({
    ...panel, tree, calls,
    popState: { open: false, tree, expanded: new Set(), shown: new Map(), rows: [], selectedId: 'x', selectedTile: -1, selectedKind: '', selectedPerson: '', focusPerson: '', builtKey: 'k', sortMode: 'default' },
    togglePopulationPanel() { context.popState.open = true; calls.push('open'); }, popRefreshModel() { calls.push('refresh'); }, popModelKey: () => 'k',
    popSortOptions: () => ({ sort: 'default' }),
    popClearSearch() { context.popState.search = ''; },
    cmdLiveTurn: () => true, cmdOwnPeople: () => true, cmdCommandsLeft: () => 1,
    cmdState: { chosen: new Set() }, cmdToggleChosen(key) { context.cmdState.chosen.add(key); },
    leadState: { open: false },
    popRecomputeRows() { context.popState.rows = visibleRows(context.popState.tree, context.popState.expanded, context.popState.shown); calls.push('rows'); },
    updateSelectionIndicator() { calls.push('arrow'); }, popRender() { calls.push('render'); },
  });
  vm.runInContext(['popSelectPerson', 'popClearHomeFilter', 'selectPersonFromMap'].map(name => slice(playback, name)).join('\n'), context);
  const hit = { group: { nodeId: icon.id }, person: { id: 12 } };
  assert.equal(vm.runInContext('selectPersonFromMap', context)(hit), true);
  const state = context.popState;
  assert.equal(state.open, true);
  assert.equal(state.selectedPerson, `${icon.id}#12`);
  assert.equal(state.focusPerson, `${icon.id}#12`);
  assert.ok(context.cmdState.chosen.has(`${icon.id}#12`), 'the clicked walker is ready for commands');
  context.selectPersonFromMap(hit);
  assert.ok(context.cmdState.chosen.has(`${icon.id}#12`), 'clicking again does not unpick the walker');
  assert.equal(state.selectedId, '', 'the person, not the icon header, is selected');
  assert.equal(state.selectedTile, 1);
  assert.ok(personRowIndex(state.rows, icon.id, 12) >= 0);
  assert.ok(calls.includes('arrow') && calls.includes('render'));
  assert.equal(vm.runInContext('selectPersonFromMap', context)({ group: { nodeId: icon.id }, person: { id: 999 } }), false, 'a dot beyond the icon\'s population');
  assert.equal(vm.runInContext('selectPersonFromMap', context)({ group: { nodeId: 'c:none|k:1|t:1|i:x' }, person: { id: 0 } }), false);
});

test('the Population Panel arrow can point at a moving person dot', () => {
  assert.match(playback, /makeTileArrow\('population'[\s\S]*personSpot\(popState\.selectedPerson\)/);
  const follow = slice(playback, 'followArrowAbove');
  assert.match(follow, /arrow\.aboveSpot/);
  assert.match(follow, /arrow\.spotFn\(\)/);
  assert.match(slice(playback, 'updateTileArrow'), /spot \? \{ x: left, y: top \}/);
  assert.match(playback, /arrow\.aboveIndex >= 0 \|\| arrow\.aboveSpot/);
  assert.match(slice(playback, 'peopleTick'), /populationArrow\.aboveSpot/);
});
