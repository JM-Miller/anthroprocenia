import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const town = await loadModule('anthroprocenia-townscape.js');
const crowds = await loadModule('anthroprocenia-crowds.js');
const ui = await loadModule('anthroprocenia-ui.js');

test('actual autonomous and commanded walkers travel 4.4 feet per second, cavalry twice that, at every map scale', () => {
  for (const hexW of [10, 100, 1000]) for (const sub of ['', 'infantry', 'cavalry']) {
    const graph = { nodes: [{ x: 0, y: 0 }, { x: hexW, y: 0 }], doorBuildings: new Map(), doorForms: new Map(), adj: [[1], [0]] };
    const ctx = context(['newWalker', 'walkerBaseSpeed', 'mapScaleMetrics'], {
      hexW, townHousingFor: () => ({ sourceOf: () => 0 }), popIsPinned: () => false,
    });
    const person = ctx.newWalker({ destinations: [0, 1], entry: { pathKey: 'home' }, nodeId: 'home', unitSub: sub }, { offset: 0 }, graph, 0, false, null);
    Object.assign(person, { node: 0, x: 0, y: 0, wait: 0, route: [0, 1], leg: 0, t: 0 });
    town.stepWalker(person, graph, 1, () => 1, () => 0.9);
    const expected = sub === 'cavalry' ? 8.8 : 4.4;
    assert.ok(Math.abs(person.x / hexW * 100 * 5280 - expected) < 1e-8);
    Object.assign(person, { node: 0, x: 0, y: 0, cmd: { route: [0, 1] } });
    town.stepCommanded(person, graph, 1);
    assert.ok(Math.abs(person.x / hexW * 100 * 5280 - expected) < 1e-8);
  }
});
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
function context(names, state) {
  const ctx = vm.createContext({ ...ui, historyControlsExpanded: false, toggleMapHistory() {}, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
class Element {
  constructor() { this.style = {}; this.attrs = {}; this.children = []; this.events = {}; this.classList = { add() {} }; }
  setAttribute(name, value) { this.attrs[name] = value; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
  get firstChild() { return this.children[0]; }
  addEventListener(name, callback) { this.events[name] = callback; }
  click() { this.events.click({ preventDefault() {}, stopPropagation() {} }); }
  contains(child) { return this === child || this.children.includes(child); }
}
function controlsContext() {
  let time = 0;
  return context(['buildWalkerControls', 'syncWalkerSpeed', 'popSyncPauseButton'], {
    els: { popPause: new Element() }, popState: { peoplePaused: false, walkerSpeed: 5 }, ps: n => n,
    document: { body: new Element(), createElement: () => new Element(), createElementNS: () => new Element() },
    MAP_CHROME_CLASS: 'anthro-map-chrome', Date: { now: () => (time += 400) },
  });
}

test('walkers default to 1x, including missing saved/session speed values', () => {
  assert.match(source, /peoplePaused: false, walkerSpeed: 1,/);
  const ctx = controlsContext();
  delete ctx.popState.walkerSpeed;
  ctx.buildWalkerControls();
  assert.equal(ctx.els.walkerSpeed.attrs['aria-label'], 'Walker speed 1x');
  ctx.els.walkerSpeed.click();
  assert.equal(ctx.popState.walkerSpeed, 2);
  for (const fn of ['peopleTick', 'popRefreshActions', 'syncWalkerSpeed']) {
    assert.match(slice(fn), /popState\.walkerSpeed \|\| 1/);
  }
});

test('walker dots have a 0.0003-mile minimum diameter and maximum zoom derives from that scale', () => {
  const ctx = context(['walkerDotRadius', 'maxViewZoom', 'mapScaleMetrics'], {
    hexW: 12, viewZoom: 1, ps: n => n, TILE_MILES: 100, WALKER_MIN_DIAMETER_MILES: 0.0003,
  });
  assert.match(source, /WALKER_MIN_DIAMETER_MILES = 0\.0003/);
  for (const tileWidth of [0.1, 12, 70, 1000]) for (const uiScale of [0.5, 1, 2]) {
    ctx.hexW = tileWidth;
    ctx.ps = n => n * uiScale;
    const max = ctx.maxViewZoom();
    assert.ok(Number.isFinite(max) && max > 0);
    for (const fraction of [0.0001, 0.1, 0.5, 1]) {
      ctx.viewZoom = max * fraction;
      const diameter = 2 * ctx.walkerDotRadius();
      const miles = diameter / (tileWidth * ctx.viewZoom) * 100;
      assert.ok(miles >= 0.0003 - 1e-12, `${tileWidth}, ${uiScale}, ${fraction}: ${miles}`);
    }
    assert.ok(Math.abs(2 * ctx.walkerDotRadius() - Math.max(12, 12 * uiScale)) < 1e-10);
    assert.ok(Math.abs(2 * ctx.walkerDotRadius() / (tileWidth * max) * 100 - 0.0003) < 1e-12);
    assert.equal(ctx.walkerDotRadius(max), ctx.walkerDotRadius(), 'screen circles remain round under a tilted map');
  }
  const paths = [1, 0.5, 0.04].map(fade => crowds.individualDotPaths([{ x: 10, y: 10, radius: 6, fade }])[0]);
  assert.ok(paths.every(path => path.d === paths[0].d), 'fading changes opacity, never shrinks the physical diameter');
  const points = [...paths[0].d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
  assert.equal(Math.max(...points.map(p => +p[1])) - Math.min(...points.map(p => +p[1])), 12);
  assert.equal(Math.max(...points.map(p => +p[2])) - Math.min(...points.map(p => +p[2])), 12);
});

test('walker hit tests and command highlights cover the scaled dot at maximum zoom', () => {
  const person = { x: 100, y: 100, fade: 1 }, group = { people: [] };
  group.people.push(person);
  const ctx = context(['personAt', 'cmdPanelTargetPath'], {
    townElementVisibility: { walkerDots: true, walkerHats: true }, peopleSvg: null, walkerCrowdsActive: () => false,
    peopleActive: () => true, clumpAt: () => null, walkerDotRadius: () => 12, ps: n => n * 2,
    townWalkers: new Map([['home', group]]), peopleClumpHidden: new Set(), walkerScreenPoint: p => p,
    measureArea: () => ({ x: 0, y: 0, w: 400, h: 400 }), mapToScreen: (x, y) => ({ x, y }),
    hexW: 12, viewZoom: 1000, viewAspectY: 0.1,
  });
  assert.equal(ctx.personAt(115, 100).person, person);
  assert.equal(ctx.personAt(117, 100), null);
  assert.match(ctx.cmdPanelTargetPath({ kind: 'walker', x: 100, y: 100 }), /a16,16 /);
});

test('walker speed cycles 5,1,2,3,4,5 and pause stays synchronized with the Population Panel', () => {
  const ctx = controlsContext();
  ctx.buildWalkerControls();
  const { walkerSpeed, walkerPause, popPause } = ctx.els;
  assert.equal(walkerSpeed.attrs['aria-label'], 'Walker speed 5x');
  const originalGlyph = walkerSpeed.speedLabel.firstChild.attrs.d;
  for (const value of [1, 2, 3, 4, 5]) {
    walkerSpeed.click();
    assert.equal(ctx.popState.walkerSpeed, value);
    assert.equal(walkerSpeed.attrs['aria-label'], `Walker speed ${value}x`);
    assert.match(walkerSpeed.speedLabel.firstChild.attrs.d, /M16 6 L22 13 M22 6 L16 13$/);
    assert.match(walkerSpeed.attrs.title, new RegExp(`speed ${value}x`));
    assert.equal(ctx.popState.peoplePaused, false);
  }
  assert.equal(walkerSpeed.speedLabel.firstChild.attrs.d, originalGlyph, '5x restores the original vector label');
  walkerPause.click();
  assert.equal(ctx.popState.peoplePaused, true);
  assert.equal(walkerPause.attrs['aria-label'], 'Resume walkers');
  assert.equal(popPause.attrs['aria-label'], 'Resume walkers');
  assert.equal(walkerPause.firstChild.children.length, 1);
  ctx.popState.peoplePaused = false; ctx.popSyncPauseButton();
  assert.equal(walkerPause.firstChild.children.length, 2);
  assert.equal(popPause.firstChild.children.length, 2);
  ctx.buildWalkerControls();
  assert.equal(ctx.document.body.children.length, 6, 'repeated UI sync never duplicates controls, including History and Skip Ahead');
});

test('walker speed lettering has explicit nonshrinking dimensions at every UI scale', () => {
  for (const scale of [0.5, 1, 2]) {
    const ctx = controlsContext();
    ctx.ps = n => n * scale;
    ctx.buildWalkerControls();
    const label = ctx.els.walkerSpeed.speedLabel;
    assert.equal(label.attrs.width, String(24 * scale));
    assert.equal(label.attrs.height, String(16 * scale));
    assert.match(label.style.cssText, /flex:0 0 auto/);
    assert.match(label.style.cssText, /pointer-events:none/);
    assert.equal(label.attrs.viewBox, '0 0 24 16');
    assert.equal(label.firstChild.attrs.fill, 'none');
    assert.equal(label.firstChild.attrs['stroke-width'], '1.8');
  }
});

test('the actual people tick scales autonomous and commanded walking in real seconds and preserves pause semantics', () => {
  const run = (speed, paused = false, resume = false) => {
    let now = 100;
    const ambient = { key: 'a', x: 0, fade: 0 }, commanded = { key: 'b', x: 0, fade: 0, cmd: {} };
    const circle = { setAttribute() {} };
    const ctx = context(['peopleTick', 'syncCrowdVisibility'], {
      townInterturn: { active: false },
      townRender: { pending: false },
      peopleActive: () => true, townLayer: {}, peopleSvg: { style: {} }, townWorld: { graph: {} }, peopleLast: 0,
      peopleCameraKey: () => 'camera', peopleViewKey: 'camera',
      nowMs: () => now, window: { innerWidth: 1000, innerHeight: 600 }, peopleSizeKey: '1000x600',
      popState: { walkerSpeed: speed, peoplePaused: paused }, ps: n => n, walkerDotRadius: () => 1.6, clumpTime: 0, clumpsAt: 100,
      hexH: 100, viewZoom: 5, CLUMP_SPLIT_SCREENS: 12, walkerScreenPoint() {},
      walkerCrowdsActive: () => true,
      walkerClumps: { coarse: true, graph: null, sync() {}, markers: () => [] },
      cmdLiveTurn: () => false, cmdState: {}, townWalkers: new Map([['home', { people: [ambient, commanded] }]]),
      cmdTickPerson() {}, stepCommanded: (p, graph, dt) => { p.x += 10 * dt; },
      stepWalker: (p, graph, dt) => { p.x += 10 * dt; }, cmdShowCompletedReward() {}, walkerPlanRoute() {},
      MAX_PEOPLE: 7200, peopleClumpMarkers: [], peopleClumpHidden: new Set(), peopleClumpPaths: [], syncWalkerDots() {}, syncCrowdDots() {}, syncWalkerHeadwear() {},
      cmdPickRings: [], cmdPanelState: {}, peopleRingUnder: circle, peopleRing: circle,
      populationArrow: {}, popRefreshBuilding() {}, popRefreshActions() {}, clumpPicker: {},
      requestAnimationFrame: () => 1,
    });
    ctx.peopleTick();
    if (resume) {
      const command = commanded.cmd;
      for (let i = 0; i < 10; i++) { now += 1000; ctx.peopleTick(); }
      assert.equal(commanded.x, 0, 'queued command stays still throughout the pause');
      assert.equal(commanded.cmd, command, 'pause retains the assigned command');
      ctx.popState.peoplePaused = false;
      now += 100; ctx.peopleTick();
    }
    return { ambient: ambient.x, commanded: commanded.x, clock: ctx.clumpTime };
  };
  for (const speed of [1, 2, 3, 4, 5]) {
    const result = run(speed);
    assert.ok(Math.abs(result.ambient - speed) < 1e-12);
    assert.ok(Math.abs(result.commanded - speed) < 1e-12);
    assert.ok(Math.abs(result.clock - 0.1 * speed) < 1e-12);
  }
  const paused = run(3, true);
  assert.equal(paused.ambient, 0);
  assert.equal(paused.commanded, 0);
  assert.equal(paused.clock, 0);
  const resumed = run(3, true, true);
  assert.ok(Math.abs(resumed.commanded - 3) < 1e-12, 'resume advances only the current frame, not the paused interval');
  assert.ok(Math.abs(resumed.ambient - 3) < 1e-12);
});

test('townscapes require a tile strictly larger than both viewport dimensions, respecting aspect ratio', () => {
  const ctx = context(['townscapeActive'], {
    mapVisible: true, iconModeActive: () => true, hexW: 100, hexH: 80, viewZoom: 10,
    viewAspectY: 1, window: { innerWidth: 1000, innerHeight: 600 },
  });
  assert.equal(ctx.townscapeActive(), false, 'exact width is not enough');
  ctx.viewZoom = 10.001;
  assert.equal(ctx.townscapeActive(), true, 'no extra three-screen threshold');
  ctx.window.innerHeight = 1200;
  assert.equal(ctx.townscapeActive(), false, 'width alone is insufficient in portrait orientation');
  ctx.viewAspectY = 2;
  assert.equal(ctx.townscapeActive(), true);
  ctx.window.innerHeight = ctx.hexH * ctx.viewZoom * ctx.viewAspectY;
  assert.equal(ctx.townscapeActive(), false, 'exact height is not enough');
  ctx.window.innerHeight = 600; ctx.mapVisible = false;
  assert.equal(ctx.townscapeActive(), false);
  ctx.mapVisible = true; ctx.iconModeActive = () => false;
  assert.equal(ctx.townscapeActive(), false);
});

test('offscreen activity clocks use the same speed multiplier and stop while paused', () => {
  for (const speed of [1, 2, 3, 4, 5]) {
    const ctx = context(['popRefreshActions'], {
      popState: { walkerSpeed: speed, activityTime: 0, actionsAt: 100 }, els: {}, leadState: {}, familyState: {},
    });
    ctx.popRefreshActions(1100);
    assert.equal(ctx.popState.activityTime, 1000 * speed);
    ctx.popState.peoplePaused = true;
    ctx.popRefreshActions(2100);
    assert.equal(ctx.popState.activityTime, 1000 * speed);
  }
});

test('walker controls hide behind menus, do not capture map targets, and do not clear a selected person', () => {
  const els = { panel: new Element(), popBtn: new Element(), leadBtn: new Element(),
    walkerPause: new Element(), walkerSpeed: new Element() };
  let overlay = false, deselected = false;
  const ctx = context(['syncPopulationUi', 'overControlPanels', 'popPanelContains', 'onPopOffClick'], {
    els, popState: { selectedPerson: 'a' }, mapVisible: true, leadState: {}, clumpPicker: {}, skipAheadView: null, syncCivNotices() {},
    buildWalkerControls() {}, gameOverlayActive: () => overlay, syncCommandPanel() {}, syncFamilyPanel() {}, syncCivTimeline() {}, syncTownCompass() {},
    positionPopulationUi() {}, popRefreshActions() {}, nowMs: () => 1, playing: false, popBackgroundSave() {},
    pointInRect: (x, y, r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom,
    popInside: () => false, popDeselect: () => { deselected = true; },
  });
  els.walkerSpeed.getBoundingClientRect = () => ({ left: 10, right: 46, top: 10, bottom: 46 });
  els.walkerPause.getBoundingClientRect = () => ({ left: 50, right: 86, top: 10, bottom: 46 });
  for (const el of [els.panel, els.popBtn, els.leadBtn]) el.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0 });
  ctx.syncPopulationUi();
  assert.equal(els.walkerSpeed.style.display, 'flex');
  assert.equal(ctx.overControlPanels(20, 20), true);
  assert.equal(ctx.popPanelContains(60, 20), true);
  ctx.onPopOffClick({ button: 0, target: els.walkerSpeed });
  assert.equal(deselected, false);
  overlay = true; ctx.syncPopulationUi();
  assert.equal(els.walkerSpeed.style.display, 'none');
  assert.equal(els.walkerPause.style.display, 'none');
  assert.equal(ctx.overControlPanels(20, 20), false);
  overlay = false; ctx.mapVisible = false; ctx.syncPopulationUi();
  assert.equal(els.walkerSpeed.style.display, 'none');
});

test('a centered seven-button toolbar puts History between Leaders and walker pause and clears map UI obstacles', () => {
  const button = () => ({ offsetWidth: 36, style: {} });
  const els = { popBtn: button(), leadBtn: button(), historyButton: button(), walkerPause: button(), walkerSpeed: button(), civTimelineButton: button(), skipAheadButton: button(), popPanel: button() };
  const ctx = context(['positionPopulationUi', 'positionLeadersUi', 'popButtonTop'], {
    els, ps: n => n, window: { innerWidth: 1000, innerHeight: 600 }, popState: {}, leadState: {},
    measureArea: () => ({ x: 0, y: 0 }), popButtonObstacles: () => [{ left: 550, right: 600, top: 0, bottom: 60 }],
  });
  ctx.positionPopulationUi();
  const buttons = [els.popBtn, els.leadBtn, els.historyButton, els.walkerPause, els.walkerSpeed, els.civTimelineButton, els.skipAheadButton];
  assert.equal(buttons[0].style.top, '66px', 'an obstacle under the new speed button moves the whole toolbar down');
  assert.equal((parseFloat(buttons[0].style.left) + parseFloat(buttons[6].style.left) + 36) / 2, 500);
  for (let i = 1; i < buttons.length; i++) {
    assert.equal(parseFloat(buttons[i].style.left) - parseFloat(buttons[i - 1].style.left), 44);
    assert.equal(buttons[i].style.top, buttons[0].style.top);
  }
});

test('miniature townscape paths retain distinct road, creek and vegetation coordinates at 10-mile scale', () => {
  const radius = 20 * town.townRadiusHex(1000000, { age: 2, lvl: 1 }, 'town');
  const paths = town.townscapePaths({ streets: [[[0, 0], [0.001, 0]]], water: [[[0, 0], [0, 0.001]]] }, 0, 0, radius);
  assert.equal(paths.streets, 'M0,0L0.001,0');
  assert.equal(paths.water, 'M0,0L0,0.001');
  const ctx = context(['townDecoPaths', 'townDecoPathSteps'], { DECO_GROUPS: town.DECO_GROUPS, DECORATION_STROKE_FEET: town.DECORATION_STROKE_FEET, decorationPath: town.decorationPath });
  const result = ctx.townDecoPaths([{ x: 0, y: 0, pad: 1, unit: 0.01, deco: { kind: 'bush', size: 1, a: 0 } }],
    { x0: -1, x1: 1, y0: -1, y1: 1 });
  const vertices = result.decoBushes.match(/-?\d*\.?\d+,-?\d*\.?\d+/g);
  assert.ok(new Set(vertices).size >= 4, '20x smaller vegetation must not round into points or lines');
});

test('town decoration physical sizes stay fixed across town sizes while positions follow the layout', () => {
  const ctx = context(['townDecoPlacements', 'mapScaleMetrics'], {
    hexW: 100, isWaterAt: () => false, townDecorations: () => [{ kind: 'bench', x: 0.1, y: 0.2, size: 1 }],
    hashString: () => 1, decorationTouchesWater: () => false,
  });
  const index = { blocks: () => false, circle() {} };
  const place = radius => ctx.townDecoPlacements({ center: { x: 0, y: 0 }, radius, pathKey: 'town' }, index)[0];
  const a = place(25), b = place(5);
  assert.equal(b.unit, a.unit);
  assert.equal(a.unit * 100 * 5280 / ctx.hexW, 1, 'one map unit conversion per foot');
  assert.equal(b.x / a.x, 0.2);
  assert.equal(b.y / a.y, 0.2);
});
