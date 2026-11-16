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
