import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
function slice(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, end = source.indexOf('{', start);
  for (; end < source.length; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}' && --depth === 0) break;
  }
  return source.slice(start, end + 1);
}
test('UI hit testing handles document/body engine targets and preserves map click suppression', () => {
  const button = { tagName: 'FXS-BUTTON' }, map = { classList: { contains: c => c === 'anthro-map-render-layer' } };
  let hit = button, overlay = false;
  const ctx = vm.createContext({
    window: {}, Cursor: { position: { x: 10, y: 20 } }, MAP_CHROME_CLASS: 'chrome',
    gameOverlayActive: () => overlay,
    document: { body: {}, documentElement: {}, elementFromPoint: () => hit },
  });
  vm.runInContext(slice('mapUiInput'), ctx);
  for (const target of [undefined, ctx.window, ctx.document, ctx.document.body, ctx.document.documentElement])
    assert.equal(ctx.mapUiInput({ target }), true);
  hit = map;
  assert.equal(ctx.mapUiInput({ target: ctx.document }), false);
  assert.equal(ctx.mapUiInput({ target: { parentNode: button, tagName: 'SPAN' } }), true);
  overlay = true; assert.equal(ctx.mapUiInput({ target: map }), true);
  assert.match(slice('onCmdConsumedClick'), /mapUiInput\(event\)/);
  assert.match(slice('onCmdPressOutside'), /mapUiInput\(e\)/);
  assert.match(slice('mapGamepadAction'), /mapUiInput\(event\)/);
});
test('native mod buttons accept DOM, keyboard and engine activation exactly once per gesture', () => {
  let now = 1000, actions = 0;
  const button = { style: {}, events: {}, setAttribute() {}, classList: { add() {} },
    addEventListener(name, fn) { this.events[name] = fn; } };
  const ctx = vm.createContext({
    document: { createElement: () => button }, UNIFY_PS_CHROME: false, ps: n => n,
    Date: { now: () => now }, err: e => assert.fail(e),
  });
  vm.runInContext(slice('mkFxsBtn'), ctx);
  ctx.mkFxsBtn('Menu', () => actions++);
  const event = type => ({ type, preventDefault() {}, stopPropagation() {} });
  button.events.click(event('click')); button.events['action-activate'](event('action-activate'));
  button.__gamepadActivate();
  assert.equal(actions, 1);
  now += 400;
  button.events.keydown({ ...event('keydown'), key: 'Enter' }); assert.equal(actions, 2);
  now += 400;
  button.events.keydown({ ...event('keydown'), key: 'Enter', repeat: true }); assert.equal(actions, 2);
});
test('hard crowd hiding clears malformed stale paths before graph rebuilds or simulation can fail', () => {
  const paths = Array.from({ length: 3 }, (_, i) => ({
    style: {}, mapShape: i === 0 ? null : 'old', attrs: { d: 'stale' }, setAttribute(k, v) { this.attrs[k] = v; },
  }));
  const ctx = vm.createContext({
    peopleActive: () => true, walkerCrowdsActive: () => false, peopleClumpPaths: paths,
    peopleSvg: null,
    peopleClumpMarkers: [{}], peopleClumpHidden: new Set(['person']),
  });
  vm.runInContext(slice('syncCrowdVisibility'), ctx);
  assert.equal(ctx.syncCrowdVisibility(), false);
  assert.ok(paths.every(p => p.style.display === 'none' && p.attrs.d === '' && p.mapShape === null));
  assert.equal(ctx.peopleClumpMarkers.length, 0); assert.equal(ctx.peopleClumpHidden.size, 0);
  assert.match(slice('peopleTick'), /^\S[\s\S]*?\{\s*peopleLoop = 0;\s*syncCrowdVisibility\(\)/);
  assert.ok(slice('applyMapView').indexOf('syncCrowdVisibility()') < slice('applyMapView').indexOf('syncTownscapes('));
  assert.match(slice('clumpAt'), /!walkerCrowdsActive\(\)/);
});
