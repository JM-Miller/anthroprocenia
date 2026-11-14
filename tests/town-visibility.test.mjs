import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const town = await loadModule('anthroprocenia-townscape.js');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
function element() {
  return { style: {}, attrs: {}, children: [], events: {}, scrollLeft: 0,
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, fn) { this.events[name] = fn; } };
}
function fixture() {
  const ctx = vm.createContext({ ...town, townPaths: {}, townPeople: element(),
    peopleSvg: { headwearLayer: element() }, document: { createElement: element }, ps: n => n });
  vm.runInContext(source.slice(source.indexOf('const TOWN_ROOF_PATHS ='), source.indexOf('let showNaturalFeatures =')), ctx);
  vm.runInContext(['syncTownElementVisibility', 'visibilityToggleGrid', 'personAt', 'clumpAt', 'townBuildingAt', 'townHomeAt'].map(slice).join('\n'), ctx);
  ctx.options = vm.runInContext('TOWN_ELEMENT_OPTIONS', ctx);
  ctx.visibility = vm.runInContext('townElementVisibility', ctx);
  for (const [, , paths] of ctx.options) for (const name of paths) ctx.townPaths[name] = element();
  return ctx;
}
test('townscape element switches hide independently and survive repeated SVG visibility updates without removing geometry', () => {
  const ctx = fixture();
  for (const [name, , paths] of ctx.options) {
    ctx.visibility[name] = false;
    for (const path of Object.values(ctx.townPaths)) path.style.visibility = 'visible';
    ctx.syncTownElementVisibility();
    for (const [other, , otherPaths] of ctx.options) for (const path of otherPaths) {
      assert.equal(ctx.townPaths[path].style.display, other === name ? 'none' : '', `${name}: ${path}`);
    }
    assert.equal(ctx.townPeople.style.display, name === 'walkerDots' ? 'none' : '');
    assert.equal(ctx.peopleSvg.headwearLayer.style.display, name === 'walkerHats' ? 'none' : '');
    for (const path of Object.values(ctx.townPaths)) assert.deepEqual(path.attrs, {});
    ctx.visibility[name] = true; ctx.syncTownElementVisibility();
    for (const path of paths) assert.equal(ctx.townPaths[path].style.display, '');
  }
});
test('hidden roofs and walkers are not invisible click targets, while visible hats can still select people', () => {
  const ctx = fixture();
  ctx.visibility.townRoofs = false;
  assert.equal(ctx.townBuildingAt(0, 0), null);
  assert.equal(ctx.townHomeAt(0, 0), null);
  ctx.visibility.walkerDots = false; ctx.visibility.walkerHats = false;
  ctx.peopleActive = () => true; ctx.walkerCrowdsActive = () => false;
  assert.equal(ctx.clumpAt(0, 0), null);
  assert.equal(ctx.personAt(0, 0), null);
  const person = { fade: 1 };
  ctx.peopleSvg.headwearPeople = new Set([person]);
  ctx.visibility.walkerHats = true; ctx.peopleClumpHidden = new Set();
  ctx.walkerDotRadius = () => 3; ctx.walkerScreenPoint = () => ({ x: 50, y: 50 });
  ctx.townWalkers = new Map([['home', { people: [person] }]]);
  assert.equal(ctx.personAt(50, 39.5).person, person);
  assert.equal(ctx.personAt(50, 50), null, 'the hidden dot is not clickable');
  ctx.peopleSvg.headwearPeople.clear();
  assert.equal(ctx.personAt(50, 39.5), null, 'hats omitted by the display budget are not invisible click targets');
});
test('visibility grid has a horizontal overflow viewport and translates wheel input without bubbling to the map', () => {
  const ctx = fixture();
  const columns = Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => ({ ...element(), lastElementChild: element() })));
  const grid = ctx.visibilityToggleGrid(columns);
  assert.match(grid.style.cssText, /overflow-x:auto/);
  assert.match(grid.children[0].style.cssText, /flex-wrap:nowrap/);
  assert.match(grid.children[0].style.cssText, /width:1320px/);
  let stopped = 0, prevented = 0;
  grid.events.wheel({ deltaX: 0, deltaY: 120, preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  grid.events.wheel({ deltaX: -45, deltaY: 100, preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
  assert.equal(grid.scrollLeft, 75);
  assert.equal(stopped, 2); assert.equal(prevented, 2);
});
