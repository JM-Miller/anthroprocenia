import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './load.mjs';

const { regionRows, RegionsPanel } = await loadModule('anthroprocenia-regions-panel.js');
test('region statistics aggregate people, settlements and each territorial civilization without hidden-tile leaks', () => {
  const geography = { regions: [{ id: 0, name: 'Italia' }, { id: 1, name: 'Sicily', island: true }, { id: 2, name: 'Hidden' }, { id: 3, name: 'Sea', water: true }],
    regionForTile: new Map([[0, 0], [1, 0], [2, 0], [3, 1], [4, 2], [5, 3]]) };
  const frame = new Map([[0, 4], [1, 9], [2, 1], [3, 1], [4, 9]]);
  const settlements = new Map([[0, ['Roma', 8]], [2, ['Secret city', 20]], [3, ['Syracuse', 3]], [4, ['Hidden capital', 10]]]);
  const tree = [{ children: [{ kind: 'tile', tile: 0, total: 100 }, { children: [
    { kind: 'tile', tile: 0, total: 20 }, { kind: 'tile', tile: 1, total: 30 }, { kind: 'tile', tile: 2, total: 500 },
  ] }] }];
  const rows = regionRows(geography, frame, settlements, tree, [2, 1, 0, 2, 0, 2], owner => ['Roman Republic', 'The Greek Kingdom'][owner]);
  assert.deepEqual(rows.map(row => row.name), ['Italia', 'Sea', 'Sicily']);
  const italy = rows[0];
  assert.equal(italy.tiles, 2); assert.equal(italy.population, 150);
  assert.deepEqual(italy.settlements, [{ name: 'Roma', citizens: 8 }]);
  assert.deepEqual(italy.owners, [{ name: 'Roman Republic', tiles: 1 }, { name: 'The Greek Kingdom', tiles: 1 }]);
  assert.equal(rows[1].type, 'Water'); assert.equal(rows[1].population, 0); assert.equal(rows[1].owners.length, 0);
  assert.equal(rows[2].type, 'Island');
  assert.equal(regionRows(geography, frame, settlements, tree, [], () => assert.fail('unknown territory must not resolve owners')).length, 0);
  assert.equal(regionRows(geography, frame, settlements, tree, null, owner => String(owner)).length, 4);
});

test('same-named disconnected regions share one row with combined known statistics and all highlight targets', () => {
  const geography = {
    regions: [{ id: 10, name: 'New Zealand', island: true }, { id: 11, name: 'New Zealand', island: true },
      { id: 12, name: 'New Zealand', island: true }, { id: 13, name: 'Italia' }],
    regionForTile: new Map([[0, 10], [1, 11], [2, 12], [3, 13]]),
  };
  const frame = new Map([[0, 1], [1, 1], [2, 9], [3, 9]]);
  const settlements = new Map([[0, ['Wellington', 4]], [1, ['Auckland', 6]], [2, ['Hidden town', 12]]]);
  const tree = [{ children: [100, 200, 10000, 50].map((total, tile) => ({ kind: 'tile', tile, total })) }];
  const rows = regionRows(geography, frame, settlements, tree, [2, 1, 0, 2], owner => ['Roman Republic', 'The Greek Kingdom'][owner]);
  assert.deepEqual(rows.map(row => row.name), ['Italia', 'New Zealand']);
  const group = rows[1];
  assert.deepEqual(group.regionIds, [10, 11, 12]);
  assert.equal(group.tiles, 2); assert.equal(group.population, 300);
  assert.deepEqual(group.settlements.map(city => city.name), ['Auckland', 'Wellington']);
  assert.deepEqual(group.owners, [{ name: 'Roman Republic', tiles: 2 }]);
  assert.equal(group.type, 'Island');
});

test('all exact matching region names share one panel row without merging physical partitions', () => {
  const geography = {
    regions: [{ id: 'a', name: 'Central Asia' }, { id: 'b', name: 'Central Asia' },
      { id: 'c', name: 'Pacific Ocean', water: true }, { id: 'd', name: 'Pacific Ocean', water: true }],
    regionForTile: new Map([[0, 'a'], [1, 'b'], [2, 'c'], [3, 'd']]),
  };
  const rows = regionRows(geography, new Map(), new Map(), [], null, () => '');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.regionIds), [['a', 'b'], ['c', 'd']]);
  assert.ok(rows.every(row => row.tiles === 2));
  assert.equal(geography.regions.length, 4);
});

test('rivers, mountains and continents aggregate unique known tiles and preserve feature highlight targets', () => {
  const geography = {
    regions: [{ id: 'water', name: 'Nile', water: true, tiles: [0, 1] }],
    regionForTile: new Map([[0, 'water'], [1, 'water']]),
    features: [{ id: 'river', name: 'Nile', type: 'river', tiles: [1, 2, 2, 3] },
      { id: 'range', name: 'Atlas', type: 'mountains', tiles: [2, 3] },
      { id: 'secret', name: 'Unknown range', type: 'mountains', tiles: [3] }],
    continents: [{ id: 'continent:0', name: 'Africa', tiles: [0, 1, 2, 3] }],
  };
  const rows = regionRows(geography, new Map([[0, 1], [1, 1], [2, 1], [3, 9]]),
    new Map([[2, ['Memphis', 5]], [3, ['Secret city', 9]]]),
    [0, 1, 2, 3].map(tile => ({ kind: 'tile', tile, total: 10 })), [2, 1, 2, 0],
    owner => { assert.equal(owner, 0); return 'Roman Republic'; });
  assert.deepEqual(rows.map(row => row.name), ['Africa', 'Atlas', 'Nile']);
  const nile = rows[2];
  assert.equal(nile.tiles, 3); assert.equal(nile.population, 30);
  assert.deepEqual(nile.tileIndices, [0, 1, 2]);
  assert.deepEqual(nile.regionIds, ['water']); assert.deepEqual(nile.featureIds, ['river']);
  assert.deepEqual(nile.types, ['Water', 'River']);
  assert.deepEqual(nile.settlements, [{ name: 'Memphis', citizens: 5 }]);
  assert.deepEqual(nile.owners, [{ name: 'Roman Republic', tiles: 3 }]);
  assert.equal(rows[0].type, 'Continent'); assert.deepEqual(rows[0].continentIds, ['continent:0']);
  assert.equal(rows[1].type, 'Mountains'); assert.equal(rows[1].tiles, 1);
});

function element() {
  return { style: {}, attrs: {}, children: [], events: {}, value: '', classList: { add() {} },
    setAttribute(key, value) { this.attrs[key] = value; }, appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    addEventListener(type, fn) { (this.events[type] || (this.events[type] = [])).push(fn); },
  };
}
function fire(element, type, extra = {}) {
  for (const fn of element.events[type] || []) fn({ type, button: 0, preventDefault() {}, stopPropagation() {}, ...extra });
}
test('sub-regions retain independent fog-safe statistics, nesting, highlighting and scroll through updates and expansion', t => {
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const geography = {
    regions: [{ id: 'parent', name: 'Elysium', tiles: [0, 1, 2] }],
    subregions: [{ id: 'west', parentId: 'parent', name: 'Western Elysium', tiles: [0] },
      { id: 'east', parentId: 'parent', name: 'Eastern Elysium', tiles: [1, 2] }],
    regionForTile: new Map([[0, 'parent'], [1, 'parent'], [2, 'parent']]),
  };
  const rows = regionRows(geography, new Map([[0, 1], [1, 9], [2, 9]]),
    new Map([[1, ['Easton', 4]], [2, ['Hidden', 9]]]),
    [100, 200, 999].map((total, tile) => ({ kind: 'tile', tile, total })), [2, 2, 0], owner => ['A', 'B'][owner]);
  const parent = rows.find(row => row.id === 'parent'), east = rows.find(row => row.id === 'east');
  assert.equal(parent.population, 300);
  assert.equal(east.population, 200); assert.equal(east.parentId, 'parent');
  assert.deepEqual(east.tileIndices, [1]); assert.deepEqual(east.regionIds, []);
  assert.deepEqual(east.settlements, [{ name: 'Easton', citizens: 4 }]);
  const panel = new RegionsPanel({ document: { body: element(), createElement: element }, scale: n => n, className: 'chrome', onHighlight() {} });
  panel.update(rows);
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), ['parent']);
  panel.list.scrollTop = 80;
  fire(panel.slots[0].expand, 'click');
  assert.equal(panel.list.scrollTop, 80);
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), ['parent', 'east', 'west']);
  fire(panel.slots[1].button, 'click'); assert.equal(panel.selected, 'east');
  panel.update(rows); assert.equal(panel.list.scrollTop, 80); assert.equal(panel.selected, 'east');
  time += 400; fire(panel.slots[0].expand, 'click');
  assert.equal(panel.list.scrollTop, 80); assert.equal(panel.selected, 'east');
  panel.search.value = 'Easton'; fire(panel.search, 'input');
  assert.equal(panel.list.scrollTop, 0);
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), ['parent', 'east']);
  assert.equal(panel.slots.length, 3);
});

test('regions panel toolbar placement, hover/selection precedence, paging and lifecycle reuse bounded row slots', t => {
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const changes = [], body = element(), panel = new RegionsPanel({
    document: { body, createElement: element }, scale: n => n, className: 'chrome', onHighlight: id => changes.push(id),
  });
  const anchor = { getBoundingClientRect: () => ({ left: 500, top: 20, bottom: 56 }) }, area = { x: 0, y: 0, w: 1000, h: 800 };
  panel.sync(true, anchor, area);
  assert.equal(panel.button.style.left, '456px'); assert.equal(panel.button.style.top, '20px');
  const rows = Array.from({ length: 95 }, (_, id) => ({ id, name: `Region ${id}`, type: 'Region', tiles: 10, population: 1000,
    settlements: [{ name: id === 50 ? 'Syracuse' : 'Town', citizens: 4 }], owners: [{ name: 'Roman Republic', tiles: 10 }] }));
  panel.update(rows); fire(panel.button, 'mouseup'); fire(panel.button, 'click');
  assert.equal(panel.open, true, 'mouseup plus click toggles once'); assert.equal(panel.panel.style.display, 'flex');
  assert.equal(panel.slots.length, 40);
  assert.match(panel.slots[0].lines[1].textContent, /population: 1,000/);
  assert.match(panel.slots[0].lines[2].textContent, /Town \(4 citizens\)/);
  assert.match(panel.slots[0].lines[3].textContent, /Roman Republic \(10 tiles\)/);
  fire(panel.slots[0].button, 'mouseenter'); assert.equal(panel.highlight, 0);
  panel.update(rows); assert.equal(panel.highlight, 0, 'refreshing statistics preserves hover on the same retained row');
  fire(panel.slots[0].button, 'click'); fire(panel.slots[0].button, 'mouseleave');
  assert.equal(panel.highlight, 0, 'selection survives leaving its row');
  fire(panel.slots[1].button, 'mouseenter'); assert.equal(panel.highlight, 1);
  fire(panel.slots[1].button, 'mouseleave'); assert.equal(panel.highlight, 0, 'leaving another hovered row restores selection');
  fire(panel.slots[1].button, 'mouseenter');
  const beforeSelection = changes.length;
  time += 400; fire(panel.slots[1].button, 'click');
  assert.equal(changes.length, beforeSelection + 1, 'selecting the already-hovered row immediately refreshes persistent map shading');
  time += 400; fire(panel.slots[0].button, 'click'); fire(panel.slots[1].button, 'mouseleave');
  time += 400; fire(panel.slots[0].button, 'click'); assert.equal(panel.highlight, null, 'clicking a selected row deselects it');
  fire(panel.slots[1].button, 'focus'); assert.equal(panel.highlight, 1);
  fire(panel.slots[1].button, 'keydown', { key: 'Enter' }); fire(panel.slots[1].button, 'blur');
  assert.equal(panel.highlight, 1, 'keyboard focus and activation support the same selection');
  panel.sync(false); assert.equal(panel.highlight, null); assert.equal(panel.panel.style.display, 'none');
  panel.sync(true, anchor, area); assert.equal(panel.highlight, 1);
  fire(panel.next, 'click'); assert.equal(panel.slots[0].row.id, 40); assert.equal(panel.slots.length, 40);
  panel.search.value = 'Syracuse'; fire(panel.search, 'input');
  assert.equal(panel.slots[0].row.id, 50); assert.equal(panel.slots.filter(slot => slot.row).length, 1);
  assert.match(panel.slots[0].button.attrs.title, /Syracuse/);
  assert.doesNotMatch(panel.slots[0].button.attrs['aria-label'], /Region 0;/, 'reused row tooltips and accessible names follow the current region');
  assert.equal(panel.selected, 1, 'filtering does not silently change a selection');
  panel.update(rows.filter(row => row.id !== 1), 'Unavailable');
  assert.equal(panel.selected, null); assert.equal(panel.highlight, null);
  assert.match(panel.slots[0].lines[1].textContent, /Unavailable/);
  time += 400; fire(panel.close, 'click'); assert.equal(panel.open, false); assert.equal(panel.panel.style.display, 'none');
  panel.reset(); assert.equal(panel.rows.length, 0); assert.equal(panel.search.value, ''); assert.equal(body.children.length, 2);
  assert.ok(changes.includes(0) && changes.includes(1) && changes.includes(null));
});

test('region-type toggles compose with search, reset paging and preserve selection without retaining stale hover', t => {
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const panel = new RegionsPanel({
    document: { body: element(), createElement: element }, scale: n => n, className: 'chrome', onHighlight() {},
  });
  panel.sync(true, { getBoundingClientRect: () => ({ left: 500, top: 20, bottom: 56 }) }, { x: 0, y: 0, w: 1000, h: 800 });
  panel.setOpen(true);
  const rows = Array.from({ length: 95 }, (_, id) => ({ id, name: `Place ${id}`,
    type: ['Region', 'Island', 'Water'][id % 3], tiles: 10, population: 100,
    settlements: [{ name: id === 4 || id === 5 ? 'Port' : 'Town', citizens: 2 }], owners: [] }));
  panel.update(rows);
  fire(panel.slots[0].button, 'click');
  fire(panel.next, 'click'); assert.equal(panel.page, 1);
  fire(panel.slots[0].button, 'mouseenter'); assert.equal(panel.highlight, 40);
  const toggle = type => {
    time += 400;
    fire(panel.typeButtons.find(entry => entry.type === type).button, 'click');
  };
  toggle('Island');
  assert.equal(panel.page, 0);
  assert.equal(panel.hover, null); assert.equal(panel.highlight, 0);
  assert.equal(panel.selected, 0);
  assert.ok(panel.slots.filter(slot => slot.row).every(slot => slot.row.type !== 'Island'));
  assert.match(panel.counter.textContent, /of 63$/);
  assert.equal(panel.typeButtons[1].button.attrs['aria-pressed'], 'false');
  panel.search.value = 'Port'; fire(panel.search, 'input');
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), [5]);
  toggle('Water');
  assert.equal(panel.slots.filter(slot => slot.row).length, 0);
  assert.equal(panel.counter.textContent, '0-0 of 0');
  assert.match(panel.status.textContent, /No regions match/);
  toggle('Region');
  for (const type of ['Mountains', 'River', 'Continent', 'Sub-region']) toggle(type);
  assert.equal(panel.types.size, 0);
  toggle('Island');
  assert.equal(panel.slots[0].row.id, 4, 're-enabling a type still honors the search');
  assert.equal(panel.slots.length, 40, 'filtering reuses the bounded row pool');
  panel.reset();
  assert.deepEqual([...panel.types], ['Region', 'Island', 'Water', 'Mountains', 'River', 'Continent', 'Sub-region']);
  assert.ok(panel.typeButtons.every(({ button }) => button.attrs['aria-pressed'] === 'true'));
  panel.update(rows);
  assert.match(panel.counter.textContent, /of 95$/);
});

test('mountain, river and continent filters compose with search and mixed-type names', () => {
  const panel = new RegionsPanel({
    document: { body: element(), createElement: element }, scale: n => n, className: 'chrome', onHighlight() {},
  });
  panel.update([
    { id: 'nile', name: 'Nile', type: 'Water', types: ['Water', 'River'], continent: 'Asia' },
    { id: 'alps', name: 'Alps', type: 'Mountains', continent: 'Asia' }, { id: 'asia', name: 'Asia', type: 'Continent' },
  ].map(row => ({ ...row, tiles: 2, population: 0, settlements: [], owners: [] })));
  const toggle = type => fire(panel.typeButtons.find(entry => entry.type === type).button, 'click');
  fire(panel.slots[0].button, 'click');
  toggle('Water');
  assert.equal(panel.slots.filter(slot => slot.row).length, 3, 'a river stays included when water is disabled');
  toggle('River');
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), ['asia', 'alps']);
  toggle('Mountains');
  assert.deepEqual(panel.slots.filter(slot => slot.row).map(slot => slot.row.id), ['asia']);
  panel.search.value = 'Alps'; fire(panel.search, 'input');
  assert.equal(panel.slots.filter(slot => slot.row).length, 0);
  toggle('Continent');
  assert.equal(panel.slots.filter(slot => slot.row).length, 0);
});

test('continent sections expand, order children by population, compose with filters and keep a bounded slot pool', t => {
  let time = 1000;
  t.mock.method(Date, 'now', () => time);
  const panel = new RegionsPanel({
    document: { body: element(), createElement: element }, scale: n => n, className: 'chrome', onHighlight() {},
  });
  const row = (id, name, population, continent, type = 'Region') =>
    ({ id, name, population, continent, type, tiles: 1, settlements: [], owners: [] });
  panel.update([row('europe', 'Europe', 100, 'Europe', 'Continent'),
    row('asia', 'Asia', 200, 'Asia', 'Continent'),
    row('low', 'A low population', 10, 'Asia'), row('high', 'Z high population', 100, 'Asia'),
    row('italy', 'Italia', 100, 'Europe'), row('sea', 'Pacific Ocean', 0, null, 'Water')]);
  const ids = () => panel.slots.filter(slot => slot.row).map(slot => slot.row.id);
  assert.deepEqual(ids(), ['asia', 'europe', 'geography:unassigned']);
  assert.equal(panel.slots[0].button.attrs['aria-expanded'], 'false');
  fire(panel.slots[0].button, 'keydown', { key: 'Enter' });
  assert.deepEqual(ids(), ['asia', 'high', 'low', 'europe', 'geography:unassigned']);
  assert.equal(panel.slots[0].button.attrs['aria-expanded'], 'true');
  assert.equal(panel.selected, null, 'expanding a continent does not select it as an area');
  fire(panel.typeButtons.find(entry => entry.type === 'Continent').button, 'click');
  assert.deepEqual(ids(), ['asia', 'high', 'low', 'europe', 'geography:unassigned'],
    'continent headings remain available as navigation when their standalone filter is off');
  time += 400; fire(panel.slots[0].button, 'click');
  assert.deepEqual(ids(), ['asia', 'europe', 'geography:unassigned']);
  panel.search.value = 'Italia'; fire(panel.search, 'input');
  assert.deepEqual(ids(), ['europe', 'italy'], 'search exposes matching children under their continent');
  time += 400; fire(panel.slots[0].button, 'click');
  assert.deepEqual(ids(), ['europe'], 'search-expanded sections can still be collapsed manually');
  time += 400; fire(panel.slots[0].button, 'click');
  assert.deepEqual(ids(), ['europe', 'italy']);
  panel.reset(); assert.equal(panel.expanded.size, 0);
  panel.update([row('asia', 'Asia', 200, 'Asia', 'Continent'),
    ...Array.from({ length: 95 }, (_, id) => row(id, `Area ${id}`, id, 'Asia'))]);
  time += 400; fire(panel.slots[0].button, 'click');
  assert.equal(panel.slots.length, 40);
  assert.equal(panel.slots[1].row.id, 94);
  fire(panel.next, 'click'); assert.equal(panel.slots[0].row.id, 55);
  assert.equal(panel.slots.length, 40);
});

test('continent membership uses only known tiles and groups cross-continent features once by largest known share', () => {
  const geography = {
    regions: [{ id: 'land', name: 'Italia', tiles: [0] }, { id: 'sea', name: 'Sea', water: true, tiles: [4] }],
    regionForTile: new Map([[0, 'land'], [4, 'sea']]),
    continents: [{ id: 'europe', name: 'Europe', tiles: [0, 1] }, { id: 'asia', name: 'Asia', tiles: [2, 3] }],
    features: [{ id: 'river', name: 'River', type: 'river', tiles: [1, 2, 3] }],
  };
  const rows = regionRows(geography, new Map(), new Map(), [], [2, 2, 2, 0, 2], () => '');
  assert.equal(rows.find(row => row.id === 'land').continent, 'Europe');
  assert.equal(rows.find(row => row.id === 'sea').continent, null);
  assert.equal(rows.filter(row => row.id === 'river').length, 1);
  assert.equal(rows.find(row => row.id === 'river').continent, 'Asia', 'ties are stable by continent name');
  const hidden = regionRows(geography, new Map(), new Map(), [], [2, 2, 0, 0, 2], () => '');
  assert.equal(hidden.find(row => row.id === 'river').continent, 'Europe', 'unseen Asian tiles cannot affect grouping');
});
