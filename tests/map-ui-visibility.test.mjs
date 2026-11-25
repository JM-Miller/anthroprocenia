import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadModule } from './load.mjs';

const source = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const crowds = await loadModule('anthroprocenia-crowds.js');
const ui = await loadModule('anthroprocenia-ui.js');
const timeline = await loadModule('anthroprocenia-timeline.js');
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
  state = { routeVis: null, ...state };
  if (names.includes('placeIcons')) names = [...names, 'syncIconGlyph', 'visibleTownscapeIconKeys', 'townscapeIconKey'];
  if (names.includes('syncMapScale')) names = [...names, 'mapScaleForView'];
  if (names.includes('worldTimelineRowsHtml')) names = [...names, 'datedTimelineRowsHtml'];
  if (names.includes('buildWorldTimelineUi')) names = [...names, 'activateTimelineEvent', 'expandTimelineEvent'];
  const ctx = vm.createContext({ ...ui, ...timeline, showUnitDots: true, showBuildingDots: true, townscapeActive: () => false, GameContext: { localPlayerID: 0 }, document: { createElement: element }, highlightChronicleEvent() {}, playing: false, syncHistoryFocus() {}, lastMapInputTs: 0, syncWorldScrollbar() {}, syncWorldTimelineHighlights() {}, cmdConsumeInput() {}, historyControlsExpanded: false, townElementVisibility: { walkerDots: true, walkerHats: true }, ...state });
  vm.runInContext(names.map(slice).join('\n'), ctx);
  return ctx;
}
function element() {
  const classes = new Set();
  return { style: {}, attrs: {}, children: [], events: {},
    getBoundingClientRect: () => ({ width: 360, height: 30 }),
    classList: { add: (...names) => names.forEach(name => classes.add(name)), toggle: (name, on) => on ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(child) {
      if (child.parentNode) {
        const index = child.parentNode.children.indexOf(child);
        if (index >= 0) child.parentNode.children.splice(index, 1);
      }
      this.children.push(child); child.parentNode = this; return child;
    },
    get lastChild() { return this.children.at(-1); },
    insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); },
    addEventListener(type, fn) { this.events[type] = fn; },
  };
}
const event = (type, extra = {}) => ({ type, button: 0, preventDefault() {}, stopPropagation() {}, ...extra });
test('ornate loading status reports real jobs without intercepting input and disappears when idle or behind menus', () => {
  const ctx = context(['syncMapLoadingStatus'], {
    document: { createElement: element, body: element() }, els: {}, mapVisible: true, mapOpenPending: false,
    gameOverlayActive: () => false, LeaderModelManager: { isLeaderShowing: false }, building: false,
    scatterJob: null, scatterContinueTimer: 0, townRender: { accessJob: { phase: 'building footprints' }, decoJob: {}, walkJob: {} },
    geographyRefreshTimer: 0, unitHighlightState: { job: { key: 'destinations|unit' } }, ps: n => n,
    measureArea: () => ({ x: 0, y: 0, w: 1000, h: 800 }), arrowControlRects: () => [
      { left: 200, right: 800, top: 700, bottom: 800 }, { left: 400, right: 600, top: 650, bottom: 690 }],
  });
  ctx.syncMapLoadingStatus();
  const slot = ctx.els.mapLoadingStatus;
  assert.match(slot.text.textContent, /building footprints.*Decorations.*Walking network.*Unit destinations/);
  assert.match(slot.el.style.cssText, /pointer-events:none/);
  assert.equal(slot.text.style.pointerEvents, 'none');
  assert.equal(slot.el.attrs.role, 'status'); assert.equal(slot.el.attrs['aria-live'], 'polite');
  assert.equal(slot.el.classList.contains('anthro-history-ui'), true);
  assert.equal(slot.el.style.left, '500px');
  assert.equal(slot.el.style.top, '608px', 'bottom-centered text clears stacked overlapping controls');
  ctx.syncMapLoadingStatus();
  assert.equal(ctx.document.body.children.length, 1, 'status reuses its retained DOM');
  ctx.gameOverlayActive = () => true; ctx.syncMapLoadingStatus();
  assert.equal(slot.el.style.display, 'none', 'loading does not overlay diplomacy');
  ctx.gameOverlayActive = () => false; ctx.townRender = {}; ctx.unitHighlightState.job = null;
  ctx.syncMapLoadingStatus(); assert.equal(slot.el.style.display, 'none');
  ctx.unitHighlightState.job = { key: 'geometry|unit' }; ctx.syncMapLoadingStatus();
  assert.match(slot.text.textContent, /Unit lens geometry/);
  ctx.mapVisible = false; ctx.syncMapLoadingStatus(); assert.equal(slot.el.style.display, 'none');
});

test('rendered townscapes hide their circles while unrendered anchors stay selectable and restore when roofs hide', () => {
  const slots = [], hits = [];
  const ctx = context(['placeIcons', 'mapToScreen', 'townscapeReady'], {
    iconDom: { el: element() }, iconPoints: [{ x: 500, y: 500, s: 0.001, item: { kind: 'building' } }],
    iconHits: hits, flagHits: [], unitFlagPoints: [], iconSlots: slots, MAX_ICON_SLOTS: 500,
    columnShiftMarkersStale: false, fogMarkersStale: false,
    mapPxW: 1000, mapPxH: 1000, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
    viewZoom: 204, viewAspectY: 1, window: { innerWidth: 1000, innerHeight: 1000 },
    iconModeActive: () => true, flagsActive: () => false, townscapeActive: () => true,
    townRender: { geometryRetained: true, layoutKey: 'layout' }, townLayer: { style: { display: 'block' } }, townZoomKey: () => 'layout',
    townHits: [], townElementVisibility: { townRoofs: true },
    itemIconCss: () => 'url("building.png")', syncUnitIconHealth() {},
    iconSlot(index) { return slots[index] || (slots[index] = { el: element(), shown: false }); },
  });

  ctx.placeIcons();
  assert.equal(ctx.iconDom.el.style.display, 'block');
  assert.equal(slots[0].el.style.display, 'block');
  assert.equal(slots[0].el.style.width, '16px');
  assert.equal(slots[0].el.style.backgroundImage, 'url("building.png")');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].r * ctx.viewZoom * 2, 16);
  const point = ctx.iconPoints[0];
  ctx.townHits = [{ entry: { item: { ...point.item }, center: { x: point.x, y: point.y }, final: [{}] } }];
  ctx.placeIcons();
  assert.equal(slots[0].el.style.display, 'none', 'rebuilt marker objects match the rendered town by stable identity');
  assert.equal(hits.length, 0);
  ctx.townRender.accessJob = { roofEntries: [ctx.townHits[0].entry] };
  ctx.townHits = []; ctx.placeIcons();
  assert.equal(hits.length, 0, 'partial roofs also replace their circle');
  ctx.townRender.accessJob.roofEntries[0].final = []; ctx.placeIcons();
  assert.equal(hits.length, 1, 'towns without accepted roofs retain a fallback circle');
  ctx.townRender.accessJob.roofEntries[0].final = [{}];
  ctx.townElementVisibility.townRoofs = false; ctx.placeIcons();
  assert.equal(hits.length, 1, 'disabling roofs restores the fallback interaction');
  ctx.townElementVisibility.townRoofs = true;
  ctx.townRender.accessJob = null;
  ctx.iconPoints[0].s = 1;
  ctx.townRender.geometryRetained = false; ctx.placeIcons();
  assert.equal(slots[0].el.style.width, '204px', 'zoom eligibility alone cannot shrink a pending townscape');
  ctx.townRender.geometryRetained = true; ctx.placeIcons();
  assert.equal(slots[0].el.style.width, '20.400000000000002px');
  ctx.townLayer.style.display = 'none'; ctx.placeIcons();
  assert.equal(slots[0].el.style.width, '204px', 'hidden old geometry cannot shrink replacement icons');
});

test('Units hides and restores both icon-mode circles and zoomed-out flags without hiding other icons', () => {
  const slots = [];
  const unit = { kind: 'unit', owner: 0 }, building = { kind: 'building' };
  const ctx = context(['placeIcons', 'flagsActive'], {
    iconDom: { el: element() }, iconPoints: [unit, building].map(item => ({ x: 100, y: 100, s: 20, item })),
    unitFlagPoints: [{ x: 100, y: 100, s: 20, item: unit }],
    iconHits: [], flagHits: [], iconSlots: slots, MAX_ICON_SLOTS: 500,
    columnShiftMarkersStale: false, fogMarkersStale: false, showUnits: true, mapVisible: true,
    mapPxW: 200, mapPxH: 200, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
    hexW: 30, viewZoom: 1, viewAspectY: 1, window: { innerWidth: 200, innerHeight: 200 },
    iconModeActive: () => true, townscapeReady: () => false,
    mapToScreen: (x, y) => ({ x, y }), playerBorderColor: () => '#fff', unitColor: () => '#123456',
    itemIconCss: item => item.kind, syncUnitIconHealth() {},
    iconSlot(index) { return slots[index] || (slots[index] = { el: element(), shown: false }); },
  });
  ctx.placeIcons();
  assert.equal(ctx.iconHits.length, 2);
  ctx.showUnits = false; ctx.placeIcons();
  assert.deepEqual(Array.from(ctx.iconHits, hit => hit.item.kind), ['building']);
  assert.equal(slots[1].el.style.display, 'none');
  ctx.showUnits = true; ctx.placeIcons();
  assert.equal(ctx.iconHits.length, 2);
  ctx.showUnitDots = false; ctx.placeIcons();
  assert.deepEqual(Array.from(ctx.iconHits, hit => hit.item.kind), ['building']);
  ctx.showBuildingDots = false; ctx.placeIcons();
  assert.equal(ctx.iconHits.length, 0, 'both dot settings hide map circles and their hit targets');
  ctx.showUnitDots = true; ctx.placeIcons();
  assert.deepEqual(Array.from(ctx.iconHits, hit => hit.item.kind), ['unit'], 'building and unit settings remain independent');
  ctx.showUnitDots = false; ctx.townscapeActive = () => true; ctx.placeIcons();
  assert.equal(ctx.iconHits.length, 2, 'map dot settings do not remove town-view icon anchors');
  ctx.townscapeActive = () => false; ctx.showBuildingDots = ctx.showUnitDots = true;
  ctx.iconModeActive = () => false; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 1);
  ctx.showUnitDots = false; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 0);
  assert.ok(slots.every(slot => slot.el.style.display === 'none'), 'turning off unit dots hides retained map flags');
  ctx.showUnitDots = true; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 1);
  ctx.showUnits = false; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 0);
  assert.ok(slots.every(slot => slot.el.style.display === 'none'));
  ctx.showUnits = true; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 1);
  ctx.fogMarkersStale = true; ctx.placeIcons();
  assert.equal(ctx.flagHits.length, 0, 'hidden stale markers are not interactive');
});

test('all unit glyphs use native owner tints in both icon modes without changing health or hit tests', () => {
  const slots = [], point = { x: 100, y: 100, s: 20, fog: false, item: { kind: 'unit', owner: 1, health: 75 } };
  let color = '#234567';
  const ctx = context(['placeIcons', 'flagsActive', 'iconSlot', 'syncUnitIconHealth'], {
    iconDom: { el: element() }, iconPoints: [point], unitFlagPoints: [point],
    iconHits: [], flagHits: [], iconSlots: slots, MAX_ICON_SLOTS: 500,
    document: { createElement: element, createElementNS: element },
    columnShiftMarkersStale: false, fogMarkersStale: false, showUnits: true, mapVisible: true,
    mapPxW: 200, mapPxH: 200, mapX: 0, mapY: 0, mapPanX: 0, mapPanY: 0,
    hexW: 30, viewZoom: 1, viewAspectY: 1, window: { innerWidth: 200, innerHeight: 200 },
    iconModeActive: () => true, townscapeReady: () => false,
    mapToScreen: (x, y) => ({ x, y }), playerBorderColor: () => '#fedcba', unitColor: () => color,
    RESOURCE_COLOR: {}, dimCss: value => `dim(${value})`, itemIconCss: () => 'url("unit.png")', err: assert.fail,
  });
  for (const icons of [true, false]) {
    ctx.iconModeActive = () => icons;
    point.item = { kind: 'unit', owner: 1, health: 75 }; point.fog = false;
    ctx.placeIcons();
    const slot = slots[0], health = slot.healthSvg;
    assert.equal(slot.el.style.backgroundImage, 'url("unit.png")');
    assert.equal(slot.el.style.fxsBackgroundImageTint, color);
    assert.equal(health.style.display, '');
    assert.equal((icons ? ctx.iconHits : ctx.flagHits).length, 1);
    const radius = (icons ? ctx.iconHits : ctx.flagHits)[0].r;
    color = color === '#234567' ? '#6789ab' : '#234567';
    ctx.placeIcons();
    assert.equal(slot.el.style.fxsBackgroundImageTint, color, 'cached slots update even if border and geometry are unchanged');
    point.fog = true; point.item.health = 20; ctx.placeIcons();
    assert.equal(slot.el.style.opacity, '0.45');
    assert.match(slot.el.style.border, /dim\(#fedcba\)/);
    assert.equal(slot.healthCircle.attrs.stroke, '#df5757');
    assert.equal((icons ? ctx.iconHits : ctx.flagHits)[0].r, radius);
    point.item.owner = 0; ctx.placeIcons();
    assert.equal(slot.el.style.backgroundImage, 'url("unit.png")');
    assert.equal(slot.el.style.fxsBackgroundImageTint, color, 'local ownership is also tinted');
    assert.equal(slot.healthSvg, health, 'reused ownership does not recreate the health ring');
    if (icons) {
      point.item = { kind: 'resource', code: 'bonus' }; ctx.placeIcons();
      assert.equal(slot.el.style.backgroundImage, 'url("unit.png")');
      assert.equal(slot.el.style.fxsBackgroundImageTint, ''); assert.equal(health.style.display, 'none');
    }
  }
});

test('all three panels start expanded and minimize/restore with window icons without discarding contents', () => {
  const body = element(), head = element();
  let now = 1000, clears = 0;
  const ctx = context(['addPanelMinimize'], {
    document: { body, head, createElement: element, getElementById: id => head.children.find(el => el.id === id) },
    ps: n => n, Date: { now: () => now }, popSetHoverRow: () => clears++, syncMapScale() {},
  });
  for (const [builder, label] of [['buildPopulationUi', 'Population Panel'], ['buildLeadersUi', 'Leaders Panel'], ['buildFamilyUi', 'Family Tree']]) {
    assert.ok(slice(builder).includes(`addPanelMinimize(panel, header, '${label}')`));
    const panel = element(), header = element(), close = element(), rows = element();
    header.appendChild(close); panel.children.push(header, rows);
    ctx.addPanelMinimize(panel, header, label);
    assert.ok(header.classList.contains('anthro-person-panel-header'));
    const button = header.children[0];
    assert.equal(panel.classList.contains('anthro-person-panel-minimized'), false);
    assert.equal(button.attrs['aria-label'], `Minimize ${label}`);
    assert.equal(button.attrs['aria-expanded'], 'true');
    assert.match(button.innerHTML, /<svg/);
    button.events.mouseup(event('mouseup'));
    button.events.click(event('click'));
    assert.equal(panel.classList.contains('anthro-person-panel-minimized'), true);
    assert.equal(button.attrs['aria-expanded'], 'false');
    assert.equal(button.attrs['aria-label'], `Restore ${label}`);
    assert.equal(panel.children[1], rows);
    now += 400;
    button.events.keydown(event('keydown', { key: 'Enter' }));
    assert.equal(panel.classList.contains('anthro-person-panel-minimized'), false);
    assert.equal(button.attrs['aria-expanded'], 'true');
    now += 400;
    button.events.mouseup(event('mouseup', { button: 2 }));
    button.events.keydown(event('keydown', { key: 'Enter', repeat: true }));
    assert.equal(panel.classList.contains('anthro-person-panel-minimized'), false);
  }
  assert.equal(head.children.length, 1, 'one shared style, not per-panel resources');
  assert.match(head.children[0].textContent, /height:auto!important/);
  assert.match(head.children[0].textContent, /> \*\{display:none!important\}/);
  assert.match(head.children[0].textContent, /> \.anthro-person-panel-header\{display:flex!important\}/);
  assert.doesNotMatch(head.children[0].textContent, /:not|:first-child/);
  assert.equal(clears, 6);
});

test('scale length measures 100 miles per tile at every supported zoom with readable 1/2/5 distances', () => {
  const ctx = context(['mapScaleMetrics'], {});
  for (const zoom of [0.01, 0.1, 1, 2, 10, 100, 1920, 10000]) {
    const { miles, pixels, label } = ctx.mapScaleMetrics(70 * zoom, 180);
    assert.ok(pixels <= 180.00001 && pixels >= 70);
    assert.ok(Math.abs(pixels / (70 * zoom) * 100 - miles) < Math.max(1e-10, miles * 1e-12));
    const feet = / (feet|foot)$/.test(label);
    const value = feet ? miles * 5280 : miles;
    const mantissa = value / Math.pow(10, Math.floor(Math.log10(value)));
    assert.ok([1, 2, 5].some(n => Math.abs(n - mantissa) < 1e-9));
    assert.match(label, / (miles?|feet|foot)$/);
  }
  assert.equal(ctx.mapScaleMetrics(100, 180).miles, 100);
  assert.equal(ctx.mapScaleMetrics(18000, 180).label, '1 mile');
  assert.match(ctx.mapScaleMetrics(18000.01, 180).label, / feet$/);
  assert.equal(ctx.mapScaleMetrics(180 * 100 * 5280, 180).label, '1 foot');
  assert.match(ctx.mapScaleMetrics(18000 * 10000, 180).label, / feet$/);
});

test('map scale preserves Giant Earth world area across native, Ludicrous and experimental map dimensions', () => {
  const ctx = context(['mapScaleMetrics'], {});
  for (const [w, h] of [[180, 94], [128, 80], [256, 160], [106, 66]]) {
    ctx.manifest = { w, h };
    const expected = 100 * Math.sqrt(180 * 94 / (w * h));
    for (const zoom of [0.1, 1, 10000]) {
      const metrics = ctx.mapScaleMetrics(70 * zoom, 180);
      assert.equal(metrics.tileMiles, expected);
      assert.ok(Math.abs(metrics.pixels / (70 * zoom) * expected - metrics.miles) < 1e-9);
      assert.ok(Math.abs(w * h * metrics.tileMiles ** 2 - 180 * 94 * 100 ** 2) < 1e-6);
    }
  }
  ctx.manifest = { w: 0, h: 80 };
  assert.throws(() => ctx.mapScaleMetrics(70, 180), /valid map dimensions/);
});

test('scale placement stays within the viewport, clears expanded and minimized panels, and hides if no space exists', () => {
  const ctx = context(['mapScalePosition'], {});
  for (const [w, h] of [[1920, 1080], [800, 600], [400, 700]]) {
    const area = { x: 0, y: 0, w, h };
    const obstacles = [{ left: 0, right: w * 0.56, top: h - 180, bottom: h },
      { left: w - 200, right: w, top: 150, bottom: h - 100 }];
    const pos = ctx.mapScalePosition(area, 180, 58, obstacles, 10);
    assert.ok(pos, `${w}x${h}`);
    assert.ok(pos.x >= 10 && pos.y >= 10 && pos.x + 180 <= w - 10 && pos.y + 58 <= h - 10);
    assert.ok(obstacles.every(r => pos.x >= r.right + 10 || pos.x + 180 <= r.left - 10 || pos.y >= r.bottom + 10 || pos.y + 58 <= r.top - 10));
  }
  assert.equal(ctx.mapScalePosition({ x: 0, y: 0, w: 200, h: 100 }, 180, 58, [{ left: 0, top: 0, right: 200, bottom: 100 }], 10), null);
});

test('scale is retained, toothed, zoom-aware, clear of UI and hidden when a game menu or leader scene opens', () => {
  let overlay = false;
  const body = element(), obstacle = element();
  obstacle.style.display = 'flex';
  obstacle.getBoundingClientRect = () => ({ left: 0, right: 650, top: 620, bottom: 800, width: 650, height: 180 });
  const ctx = context(['mapScaleMetrics', 'mapScalePosition', 'buildMapScaleControls', 'syncMapScale'], {
    document: { body, createElement: element, querySelectorAll: () => [] },
    window: { getComputedStyle: el => el.style, addEventListener() {} }, ps: n => n,
    mapVisible: true, hexW: 100, viewZoom: 1, MAP_CHROME_CLASS: 'chrome',
    els: { panel: obstacle }, measureArea: () => ({ x: 0, y: 0, w: 1200, h: 800 }),
    LeaderModelManager: { isLeaderShowing: false }, gameOverlayActive: () => overlay,
  });
  ctx.syncMapScale();
  const scale = ctx.els.mapScale;
  assert.equal(scale.style.display, 'block');
  assert.match(scale.style.cssText, /background:transparent;border:0;/);
  assert.doesNotMatch(scale.style.cssText, /border-radius|box-shadow/);
  assert.match(scale.graphic.attrs['aria-label'], /100 miles/);
  assert.match(scale.graphic.innerHTML, /<rect/);
  assert.match(scale.graphic.innerHTML, /<path/);
  assert.ok(parseFloat(scale.style.top) + 86 <= 610 || parseFloat(scale.style.left) >= 660);
  ctx.viewZoom = 100; ctx.syncMapScale();
  assert.match(scale.graphic.attrs['aria-label'], /1 mile/);
  assert.equal(body.children.length, 1);
  overlay = true; ctx.syncMapScale(); assert.equal(scale.style.display, 'none');
  overlay = false; ctx.syncMapScale(); assert.equal(scale.style.display, 'block');
  ctx.LeaderModelManager.isLeaderShowing = true; ctx.syncMapScale(); assert.equal(scale.style.display, 'none');
  ctx.LeaderModelManager.isLeaderShowing = false; ctx.mapVisible = false; ctx.syncMapScale(); assert.equal(scale.style.display, 'none');
});

test('scale drag handle moves the retained scale, clamps to the viewport, and exposes its X reset only after moving', () => {
  const body = element(), events = {}, area = { x: 0, y: 0, w: 1200, h: 800 };
  let overlay = false;
  const ctx = context(['mapScaleMetrics', 'mapScalePosition', 'buildMapScaleControls', 'syncMapScale'], {
    document: { body, createElement: element, querySelectorAll: () => [] },
    window: { getComputedStyle: el => el.style, addEventListener: (type, fn) => { events[type] = fn; } },
    ps: n => n, mapVisible: true, hexW: 100, viewZoom: 1, MAP_CHROME_CLASS: 'chrome', els: {},
    measureArea: () => area, LeaderModelManager: { isLeaderShowing: false }, gameOverlayActive: () => overlay, lastMapDragEnd: 0,
  });
  ctx.syncMapScale();
  const scale = ctx.els.mapScale, handle = scale.moveHandle, reset = scale.resetButton;
  const original = { left: scale.style.left, top: scale.style.top };
  assert.equal(reset.style.display, 'none');
  assert.match(handle.innerHTML, /<svg/); assert.match(reset.innerHTML, /<svg/);
  handle.events.mousedown(event('mousedown', { clientX: 25, clientY: 715 }));
  events.mouseup(event('mouseup')); assert.equal(reset.style.display, 'none', 'clicking alone does not move the scale');
  handle.events.mousedown(event('mousedown', { clientX: 25, clientY: 715 }));
  events.mousemove(event('mousemove', { clientX: 325, clientY: 415, buttons: 1 }));
  events.mouseup(event('mouseup'));
  assert.equal(parseFloat(scale.style.left), parseFloat(original.left) + 300);
  assert.equal(parseFloat(scale.style.top), parseFloat(original.top) - 300);
  assert.equal(reset.style.display, 'flex'); assert.equal(scale.scaleDrag, null);
  const moved = { left: scale.style.left, top: scale.style.top };
  ctx.viewZoom = 100; ctx.syncMapScale();
  assert.equal(scale.style.left, moved.left); assert.equal(scale.style.top, moved.top);
  assert.equal(scale.moveHandle, handle, 'scale SVG updates do not replace the controls');
  overlay = true; ctx.syncMapScale(); assert.equal(scale.style.display, 'none');
  overlay = false; ctx.syncMapScale(); assert.equal(scale.style.left, moved.left);
  area.w = 400; area.h = 300; ctx.syncMapScale();
  assert.ok(parseFloat(scale.style.left) + parseFloat(scale.style.width) <= 390);
  assert.ok(parseFloat(scale.style.top) + parseFloat(scale.style.height) <= 290);
  reset.events.mouseup(event('mouseup')); reset.events.click(event('click'));
  assert.equal(reset.style.display, 'none'); assert.equal(scale.manualPosition, null);
  const expected = ctx.mapScalePosition(area, parseFloat(scale.style.width), 86, [], 10);
  assert.equal(parseFloat(scale.style.left), expected.x); assert.equal(parseFloat(scale.style.top), expected.y);
  handle.events.keydown(event('keydown', { key: 'ArrowUp' })); assert.equal(reset.style.display, 'flex');
  handle.events.keydown(event('keydown', { key: 'Home' })); assert.equal(reset.style.display, 'none');
  handle.events.mousedown(event('mousedown', { clientX: 25, clientY: 100 }));
  events.blur(); assert.equal(scale.scaleDrag, null); assert.equal(handle.style.cursor, 'grab');
  assert.equal(body.children.length, 1);
});

test('history focus is closed with its clock circle, restores UI without overwriting styles, and releases world history', () => {
  assert.ok(source.includes('let visibilityControlsExpanded = true, historyControlsExpanded = false'));
  const body = element(), header = element(), clock = element(), tooltip = element();
  body.appendChild(clock);
  const ctx = context(['updatePanelControls', 'toggleMapHistory', 'resetWorldTimeline'], {
    document: { body }, ps: n => n,
    worldTimelineState: { model: {}, events: [{ turn: 1 }] }, positionPanel() {}, syncWorldTimeline() {},
    els: { visibilityButton: {}, historyButton: clock, historyHeader: header, worldTimelineTooltip: tooltip, controlRow: { style: {} }, playbackPanel: { style: {} } },
    visibilityControlsExpanded: true, historyControlsExpanded: true, mapVisible: true, setPanelIconState() {}, onTrackLeave() {},
  });

  test('Chronicle starts closed, slashes its close icon and hides all HUD roots with compatible selectors, including newly added UI', () => {
    const body = element(), head = element(), hud = element(), map = element(), panel = element(), header = element(), clock = element();
    hud.style.visibility = 'visible'; map.classList.add('anthro-map-render-layer'); panel.classList.add('anthro-history-ui'); clock.classList.add('anthro-history-ui');
    panel.appendChild(header); for (const child of [hud, map, panel, clock]) body.appendChild(child);
    let notify, observed = 0, disconnected = 0, overlay = false;
    const ctx = context(['ensureChromeOverlayStyle', 'syncHistoryFocus', 'updatePanelControls', 'toggleMapHistory', 'resetWorldTimeline'], {
      document: { body, head, getElementById: id => head.children.find(x => x.id === id), createElement: element },
      MAP_CHROME_CLASS: 'chrome', LeaderModelManager: { isLeaderShowing: false }, gameOverlayActive: () => overlay,
      mapVisible: true, historyControlsExpanded: false, visibilityControlsExpanded: true, historyFocusObserver: null, ps: n => n,
      MutationObserver: class { constructor(fn) { notify = fn; } observe() { observed++; } disconnect() { disconnected++; } },
      els: { historyButton: clock, historyHeader: header, playbackPanel: panel, controlRow: element(), visibilityButton: element() },
      setPanelIconState() {}, onTrackLeave() {}, positionPanel() {}, syncWorldTimeline() {}, worldTimelineState: {},
    });
    ctx.ensureChromeOverlayStyle(); assert.ok(!head.children[0].textContent.includes(':not('));
    assert.match(head.children[0].textContent, /\.anthro-history-hidden \*/);
    ctx.updatePanelControls(); assert.equal(panel.style.display, 'none'); assert.ok(!clock.innerHTML.includes('M3 3L17 17'));
    ctx.toggleMapHistory(); assert.ok(clock.innerHTML.includes('M3 3L17 17'));
    assert.equal(hud.classList.contains('anthro-history-hidden'), true);
    assert.equal(map.classList.contains('anthro-history-hidden'), false); assert.equal(panel.classList.contains('anthro-history-hidden'), false);
    const notice = element(); body.appendChild(notice); notify();
    assert.equal(notice.classList.contains('anthro-history-hidden'), true); assert.equal(observed, 1);
    overlay = true; ctx.syncHistoryFocus(); assert.equal(hud.classList.contains('anthro-history-hidden'), false);
    assert.equal(disconnected, 1, 'menus restore HUD and release the observer');
    overlay = false; ctx.syncHistoryFocus(); ctx.toggleMapHistory();
    assert.equal(hud.classList.contains('anthro-history-hidden'), false); assert.equal(notice.classList.contains('anthro-history-hidden'), false);
    assert.equal(hud.style.visibility, 'visible', 'native inline styles remain intact');
    assert.ok(!clock.innerHTML.includes('M3 3L17 17')); assert.equal(clock.attrs['aria-label'], 'Open the World Chronicle Panel');
  });

  test('navigation hides townscape labels immediately and restores cached labels only after the pan settles', () => {
    const layer = element(), specs = [], features = [];
    let now = 1000, ensured = 0;
    const ctx = context(['scheduleGameCameraSync', 'hideTownLabels', 'syncTownLabels'], {
      mapVisible: true, applyingFromGame: false, gameCamTimer: 0, Date: { now: () => now },
      townLabelLayer: layer, showTownLabels: true, ensureTownLabelLayer: () => ensured++, townLabelSpecKey: 'same', townKey: 'same',
      townLabelSpecs: specs, townFeatureSpecs: features, viewZoom: 1, viewAspectY: 1, window: { innerWidth: 800, innerHeight: 600 },
      mapToScreen: () => ({ x: 0, y: 0 }), showSettlements: false, showBuildingLabels: false, showRiverNames: false,
      townLabelPan: { specs, features, zoom: 1, aspect: 1, width: 800, height: 600, visibility: 'false|false|false',
        rect: { x0: 0, x1: 800, y0: 0, y1: 600 }, x: 0, y: 0 },
    });
    layer.style.display = 'block'; ctx.scheduleGameCameraSync(); assert.equal(layer.style.display, 'none');
    now = 1249; ctx.syncTownLabels([], 0, 800, 0, 600);
    assert.equal(layer.style.display, 'none'); assert.equal(ensured, 0);
    now = 1250; ctx.syncTownLabels([], 0, 800, 0, 600);
    assert.equal(layer.style.display, 'block'); assert.equal(ensured, 1);
  });
  ctx.updatePanelControls();
  assert.equal(ctx.els.controlRow.style.display, 'flex'); assert.equal(ctx.els.playbackPanel.style.display, 'flex');
  assert.equal(body.classList.contains('anthro-history-focused'), true);
  assert.equal(clock.parentNode, header); assert.equal(clock.attrs['aria-expanded'], 'true');
  ctx.toggleMapHistory();
  assert.equal(body.classList.contains('anthro-history-focused'), false);
  assert.equal(clock.parentNode, body); assert.equal(clock.attrs['aria-expanded'], 'false');
  assert.equal(ctx.els.playbackPanel.style.display, 'none');
  assert.equal(ctx.worldTimelineState.model, null); assert.equal(ctx.worldTimelineState.events.length, 0);
  assert.equal(tooltip.style.display, 'none');
  ctx.toggleMapHistory();
  assert.equal(body.classList.contains('anthro-history-focused'), true); assert.equal(clock.parentNode, header);
});

test('visibility fits its column contents up to the viewport limit, while history is independently docked at the map bottom', () => {
  const ctx = context(['positionPanel', 'placePlaybackPanel'], {
    els: { panel: element(), playbackPanel: element(), visibilityGrid: { contentWidth: 1320 } },
    window: { innerWidth: 1920, innerHeight: 1080 }, mapPxW: 1920, ps: n => n, visibilityControlsExpanded: true,
    measureArea: () => ({ x: 0, y: 0, w: ctx.window.innerWidth, h: 1080 }), fitControlRow() {}, fitViewRow() {}, positionPopulationUi() {},
  });
  ctx.positionPanel();
  assert.equal(ctx.els.panel.style.width, '1344px');
  assert.equal(ctx.els.playbackPanel.style.width, '1200px'); assert.equal(ctx.els.playbackPanel.style.bottom, '0px');
  ctx.window.innerWidth = ctx.mapPxW = 360; ctx.positionPanel();
  assert.equal(ctx.els.panel.style.width, '336px'); assert.equal(ctx.els.playbackPanel.style.width, '336px');
  assert.equal(ctx.els.playbackPanel.style.left, '12px');
  ctx.visibilityControlsExpanded = false; ctx.positionPanel();
  assert.equal(ctx.els.panel.style.width, '52px');
  assert.equal(ctx.els.playbackPanel.style.width, '336px', 'minimizing visibility cannot shrink the timeline');
});

test('world ruler pages are horizontal, escaped, tooltip-detailed and bounded to forty actionable notches', () => {
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ctx = context(['worldTimelineRowsHtml'], { ps: n => n, escHtml: escape });
  const events = Array.from({ length: 100 }, (_, turn) => ({ turn, date: `${turn} BCE`, text: '<script>Rome</script> "quoted"', details: 'Historical evidence' }));
  const html = ctx.worldTimelineRowsHtml(events, 40);
  assert.match(html, /flex-direction:row/);
  assert.equal((html.match(/data-history-turn=/g) || []).length, 40);
  assert.match(html, /data-history-turn="40"/); assert.match(html, /data-history-turn="79"/);
  assert.match(html, /Historical evidence/); assert.match(html, /&quot;quoted&quot;/);
  assert.doesNotMatch(html, /text-overflow:ellipsis|max-height:48px/);
  assert.match(html, /data-history-group="40 BCE" aria-expanded="false"/);
  assert.match(html, /white-space:pre-wrap[^>]*>Historical evidence<\/div>/);
  assert.doesNotMatch(html, /<script>|data-history-turn="80"/);
});

test('date groups expand once per press, retain full narratives and never split matching dates across pages', () => {
  const ctx = context(['worldTimelineRowsHtml', 'activateTimelineEvent'], { ps: n => n, escHtml: String });
  const events = Array.from({ length: 42 }, (_, turn) => ({ turn, date: `${turn} CE`, text: `Event ${turn}`, details: 'A complete long description without truncation.' }));
  events.splice(40, 0, { turn: 39, date: '39 CE', text: 'Second event at the same date', details: 'Second full narrative', plots: [9] });
  const state = {}, header = { getAttribute: () => '39 CE' }, target = { closest: selector => selector === '[data-history-group]' ? header : null };
  let refreshed = 0;
  ctx.activateTimelineEvent(event('mouseup', { target }), state, () => { refreshed++; });
  ctx.activateTimelineEvent(event('click', { target }), state, () => { refreshed++; });
  assert.equal(refreshed, 1); assert.ok(state.expanded.has('39 CE'));
  const html = ctx.worldTimelineRowsHtml(events, 0, state.expanded);
  assert.match(html, /data-history-group="39 CE" aria-expanded="true"/);
  assert.match(html, /Second full narrative/); assert.match(html, /data-history-plots="9"/);
  assert.equal((html.match(/data-history-group=/g) || []).length, 40);
  assert.equal((html.match(/data-history-turn="39"/g) || []).length, 2);
  assert.doesNotMatch(ctx.worldTimelineRowsHtml(events, 40), /Second event at the same date/);
  ctx.activateTimelineEvent(event('keydown', { key: 'Enter', target }), state, () => { refreshed++; });
  assert.equal(state.expanded.has('39 CE'), false);
});
test('timeline hover and focus expand a date once, preserving click-to-collapse until the pointer leaves', () => {
  const ctx = context(['expandTimelineEvent', 'activateTimelineEvent'], {
    highlightChronicleEvent() {}, pause: () => assert.fail('hover must not seek'), goToIndex: () => assert.fail('hover must not seek'),
  });
  const state = {}, header = { getAttribute: () => '39 CE' }, card = { getAttribute: () => '39 CE' };
  const target = { closest: selector => selector === '[data-history-date]' ? card : selector === '[data-history-group]' ? header : null };
  let refreshed = 0;
  const refresh = () => refreshed++;
  ctx.expandTimelineEvent(event('mouseover', { target }), state, refresh);
  assert.equal(state.expanded.has('39 CE'), true);
  assert.equal(refreshed, 1);
  ctx.expandTimelineEvent(event('mouseover', { target }), state, refresh);
  assert.equal(refreshed, 1, 'child crossings do not trigger repeated renders');
  ctx.activateTimelineEvent(event('keydown', { key: 'Enter', target }), state, refresh);
  assert.equal(state.expanded.has('39 CE'), false);
  ctx.expandTimelineEvent(event('mouseover', { target }), state, refresh);
  assert.equal(state.expanded.has('39 CE'), false, 'manual collapse is respected during the same hover');
  ctx.expandTimelineEvent(null, state);
  ctx.expandTimelineEvent(event('focusin', { target }), state, refresh);
  assert.equal(state.expanded.has('39 CE'), true);
  assert.equal(refreshed, 3);
});
test('event hover highlights recorded plots only and clears for nonlocal events, fog and pointer exit', () => {
  const root = element();
  const ctx = context(['highlightChronicleEvent'], {
    chronicleHighlight: null, document: { createElementNS: element, body: root }, mapVisible: true, fogMode: true,
    visForPos: () => [2, 0], basePos: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    hexVert: (i, k) => [i * 10 + k, k], mapToScreen: (x, y) => ({ x: x + 5, y }), sizeScreenSvg() {}, ps: n => n,
  });
  const hover = plots => ({ target: { closest: () => ({ getAttribute: () => plots }) } });
  ctx.highlightChronicleEvent(hover('0,1'));
  assert.equal(ctx.chronicleHighlight.svg.style.display, 'block');
  assert.equal((ctx.chronicleHighlight.path.attrs.d.match(/M/g) || []).length, 1);
  ctx.highlightChronicleEvent(hover('')); assert.equal(ctx.chronicleHighlight.svg.style.display, 'none');
  ctx.highlightChronicleEvent(hover('0')); assert.equal(root.children.length, 1);
  ctx.highlightChronicleEvent(null); assert.equal(ctx.chronicleHighlight.svg.style.display, 'none');
});
test('Chronicle descriptions show their full text on hover or focus without breaking event seeking', () => {
  const make = () => { const el = element(); el.append = (...children) => children.forEach(child => el.appendChild(child)); return el; };
  const ctx = context(['buildWorldTimelineUi'], {
    document: { createElement: make }, els: { playbackPanel: { getBoundingClientRect: () => ({ left: 20, width: 900, top: 600 }) } },
    ps: n => n, window: { innerHeight: 900 }, buildWorldScrollbar: make,
    pause() {}, syncWorldTimeline() {}, goToIndex: turn => { ctx.sought = turn; }, worldTimelineState: {},
  });
  ctx.buildWorldTimelineUi();
  const rows = ctx.els.worldTimelineRows, tooltip = ctx.els.worldTimelineTooltip;
  const card = element(); card.setAttribute('data-history-turn', '7'); card.setAttribute('data-tooltip-content', 'Title and full description');
  const description = element(), full = 'New lands in Europe came under "The Gauls" & their allies, extending their frontier far beyond its former borders.';
  description.setAttribute('data-tooltip-content', full);
  description.closest = selector => selector === '[data-history-turn]' ? card : selector === '[data-history-group]' ? null : description;
  rows.events.mousemove(event('mousemove', { target: description }));
  assert.equal(tooltip.textContent, full); assert.equal(tooltip.style.display, 'block');
  assert.equal(description.attrs['aria-describedby'], tooltip.id);
  rows.events.mouseleave(); assert.equal(tooltip.style.display, 'none');
  rows.events.focusin(event('focusin', { target: description }));
  assert.equal(tooltip.textContent, full); assert.equal(tooltip.style.display, 'block');
  rows.events.keydown(event('keydown', { target: description, key: 'Enter' })); assert.equal(ctx.sought, 7);
  rows.events.focusout(); assert.equal(tooltip.style.display, 'none');
});

test('timeline geography uses real continent names and recorded region names without inventing a location', () => {
  const ctx = context(['civTimelinePlaceName'], {
    continentTypeForTile: plot => plot === 1 ? 7 : null, continentNameForType: () => 'Europe',
    window: { AnthroproceniaGeography: { getMapData: () => ({ regionForTile: new Map([[2, 'plains']]), regions: [{ id: 'plains', name: 'The Great Plains' }] }) } },
  });
  assert.equal(ctx.civTimelinePlaceName(1), 'Europe');
  assert.equal(ctx.civTimelinePlaceName(2), 'The Great Plains');
  assert.equal(ctx.civTimelinePlaceName(3), '');
});

test('world history builds in bounded frame batches, retains all events, and does not expose world history with fog enabled', () => {
  const targets = [], rows = element(), page = element();
  const state = { key: '', model: null, next: 0, events: [], start: 0, complete: false, html: '', errorLogged: false };
  const ctx = context(['syncWorldTimeline', 'worldTimelineRowsHtml'], {
    mapVisible: true, historyControlsExpanded: true, fogMode: false, fogLocked: false, gameOverlayActive: () => false,
    worldTimelineState: state, manifest: { rev: 1 }, frames: Array(101).fill([0, 1, 0, '1 CE']), ps: n => n, escHtml: x => x, err: assert.fail,
    els: { worldTimelineRows: rows, worldTimelinePage: page, worldTimelinePrev: {}, worldTimelineNext: {} },
    civTimelineEvents(state, first, owner, target) {
      assert.equal(owner, null); assert.ok(target - state.next <= 15);
      targets.push(target); state.next = target;
      return Array.from({ length: target + 1 }, (_, turn) => ({ turn, text: `Event ${turn}` }));
    },
  });
  ctx.syncWorldTimeline(); assert.equal(state.complete, false); assert.match(page.textContent, /Building/);
  while (!state.complete) ctx.syncWorldTimeline();
  assert.equal(state.events.length, 101); assert.equal(targets.at(-1), 100); assert.equal(targets.length, 7);
  const count = targets.length; ctx.syncWorldTimeline(); assert.equal(targets.length, count);
  state.start = 40; ctx.syncWorldTimeline(); assert.match(rows.innerHTML, /data-history-turn="40"/);
  ctx.fogMode = ctx.fogLocked = true; ctx.syncWorldTimeline();
  assert.match(rows.textContent, /requires Fog of War off/); assert.match(page.textContent, /hidden in multiplayer/);
  assert.equal(targets.length, count);
});

test('hidden toolbar controls cannot intercept map input while history focus is active', () => {
  const control = (left, top) => ({ style: { display: 'flex' }, getBoundingClientRect: () => ({ left, top, right: left + 36, bottom: top + 36 }) });
  const ctx = context(['walkerControlAt', 'pointInRect', 'overControlPanels'], {
    historyControlsExpanded: true, gameOverlayActive: () => false,
    els: { walkerSpeed: control(10, 10), historyButton: control(200, 200), playbackPanel: control(200, 200), panel: control(10, 10) },
  });
  assert.equal(ctx.walkerControlAt({ x: 20, y: 20 }), null);
  assert.equal(ctx.overControlPanels(20, 20), false);
  assert.equal(ctx.walkerControlAt({ x: 210, y: 210 }), ctx.els.historyButton);
});

test('playback follows the latest event at the current turn across event pages, including sparse turns, and preserves paused scrolling', () => {
  const events = Array.from({ length: 85 }, (_, i) => ({ turn: i * 2, text: `Event ${i}` }));
  const rows = element(); rows.clientWidth = 660; rows.scrollWidth = 8800; rows.scrollLeft = 0;
  const state = { key: '1|200', complete: true, events, start: 0, html: '' };
  const ctx = context(['syncWorldTimeline', 'worldTimelineRowsHtml', 'worldTimelineEventAt'], {
    playing: true, pos: 81, mapVisible: true, historyControlsExpanded: true, fogMode: false, gameOverlayActive: () => false,
    manifest: { rev: 1 }, frames: Array(200), worldTimelineState: state, ps: n => n, escHtml: x => x, err: assert.fail,
    els: { worldTimelineRows: rows, worldTimelinePage: element(), worldTimelinePrev: {}, worldTimelineNext: {} },
  });
  ctx.syncWorldTimeline();
  assert.equal(state.start, 40, 'the current date group is followed across pages');
  assert.equal(rows.scrollLeft, 0, 'the first two events on a new page remain inside its left viewport edge');
  ctx.pos = 111; ctx.syncWorldTimeline();
  assert.equal(rows.scrollLeft, 3080, 'the last preceding event in a sparse turn is centered');
  ctx.pos = 160; ctx.syncWorldTimeline(); assert.equal(state.start, 80);
  ctx.pos = 38; ctx.syncWorldTimeline(); assert.equal(state.start, 0); assert.equal(rows.scrollLeft, 3960, 'restarting or rewinding playback follows back to an earlier page');
  ctx.playing = false; rows.scrollLeft = 123; state.start = 40; ctx.pos = 0; ctx.syncWorldTimeline();
  assert.equal(state.start, 40); assert.equal(rows.scrollLeft, 123, 'paused playback must not fight manual browsing');
  assert.equal(ctx.worldTimelineEventAt([], 10), -1);
});

test('the themed Chronicle scrollbar follows scroll position and supports dragging, rail clicks, keyboard and overflow hiding', () => {
  const rows = element(), listeners = {};
  rows.id = 'ruler'; rows.clientWidth = 400; rows.scrollWidth = 2000; rows.scrollLeft = 0;
  const ctx = context(['buildWorldScrollbar', 'syncWorldScrollbar'], {
    document: { createElement: element }, window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    els: { worldTimelineRows: rows }, worldTimelineState: {}, ps: n => n,
  });
  const track = ctx.buildWorldScrollbar(rows), thumb = ctx.els.worldTimelineScrollThumb;
  track.clientWidth = 400;
  Object.defineProperty(thumb, 'offsetWidth', { get: () => parseFloat(thumb.style.width) });
  track.getBoundingClientRect = () => ({ left: 100 });
  ctx.syncWorldScrollbar();
  assert.equal(track.attrs.role, 'scrollbar'); assert.equal(track.attrs['aria-orientation'], 'horizontal');
  assert.equal(track.style.display, 'block'); assert.equal(thumb.style.width, '80px');
  assert.match(thumb.style.cssText, /#dec38b,#a17e45/);
  track.events.mousedown(event('mousedown', { target: thumb, clientX: 100 }));
  listeners.mousemove(event('mousemove', { clientX: 260, buttons: 1 }));
  assert.equal(rows.scrollLeft, 800); assert.equal(thumb.style.left, '160px');
  assert.equal(track.attrs['aria-valuenow'], '800');
  listeners.mouseup(event('mouseup')); assert.equal(ctx.worldTimelineState.scrollDrag, null);
  track.events.keydown(event('keydown', { key: 'End' })); assert.equal(rows.scrollLeft, 1600); assert.equal(thumb.style.left, '320px');
  track.events.keydown(event('keydown', { key: 'Home' })); assert.equal(rows.scrollLeft, 0);
  track.events.mousedown(event('mousedown', { target: track, clientX: 300 })); assert.equal(rows.scrollLeft, 800);
  rows.scrollWidth = 300; ctx.syncWorldScrollbar(); assert.equal(track.style.display, 'none');
});

test('every event in the selected turn is highlighted unless paused at the actual live game turn, including age and stale-capture cases', () => {
  const entries = [0, 1, 1, 2, 3].map(turn => {
    const entry = element(); entry.setAttribute('data-history-turn', String(turn)); return entry;
  });
  const ctx = context(['syncWorldTimelineHighlights'], {
    frames: [[0, 10], [0, 11], [0, 12], [1, 10]], pos: 1, playing: false, Game: { age: 0, turn: 12 },
    els: { worldTimelineRows: { querySelectorAll: () => entries } },
  });
  const active = () => entries.filter(e => e.attrs['data-history-current'] === 'true');
  ctx.syncWorldTimelineHighlights(); assert.equal(active().length, 2);
  assert.ok(active().every(e => e.attrs['aria-current'] === 'step' && /211,176,103/.test(e.style.background)));
  ctx.pos = 2; ctx.syncWorldTimelineHighlights(); assert.equal(active().length, 0);
  ctx.playing = true; ctx.syncWorldTimelineHighlights(); assert.equal(active().length, 1);
  ctx.playing = false; ctx.Game = { age: 1, turn: 10 }; ctx.pos = 0; ctx.syncWorldTimelineHighlights();
  assert.equal(active().length, 1, 'same turn number in a previous Age is still historical');
  ctx.pos = 3; ctx.syncWorldTimelineHighlights(); assert.equal(active().length, 0);
  ctx.frames = ctx.frames.slice(0, 3); ctx.pos = 2; ctx.Game = { age: 0, turn: 13 }; ctx.syncWorldTimelineHighlights();
  assert.equal(active().length, 1, 'a latest-but-stale recording is not the live game turn');
});

test('townscape labels respect checkbox changes immediately even inside a cached pan rectangle', () => {
  const specs = ['home', 'building', 'creek', 'street', 'mountain'].map((kind, i) => ({
    kind, text: kind, total: 300, rank: i, pts: [{ x: 20, y: 50 + 50 * i }, { x: 320, y: 50 + 50 * i }], cum: [0, 300],
  }));
  const layer = element(), ctx = context(['townLabelVisible', 'hideTownLabels', 'lineSpecPointAt', 'syncTownLabels'], {
    showTownLabels: true, showSettlements: true, showBuildingLabels: true, showRiverNames: true,
    ensureTownLabelLayer() {}, townLabelLayer: layer, townLabelSlots: [], townLabelPan: {},
    townLabelSpecKey: 'same', townKey: 'same', townLabelSpecs: specs, townFeatureSpecs: [], window: { innerWidth: 800, innerHeight: 600 },
    viewZoom: 1, viewAspectY: 1, ps: n => n, mapToScreen: (x, y) => ({ x, y }),
    document: { createElement: element }, MAX_TOWN_LABELS: 600,
    TOWN_LABEL_STYLE: Object.fromEntries(specs.map(s => [s.kind, [12, '#fff', '500', 'normal']])),
  });
  const visible = () => ctx.townLabelSlots.filter(slot => slot.el.style.display !== 'none').map(slot => slot.text);
  ctx.syncTownLabels([], 0, 800, 0, 600);
  assert.ok(visible().includes('building')); assert.ok(!visible().includes('mountain'));
  ctx.showBuildingLabels = ctx.showSettlements = ctx.showRiverNames = false;
  ctx.syncTownLabels([], 0, 800, 0, 600);
  assert.ok(visible().every(text => text === 'street'));
  ctx.showTownLabels = false; ctx.syncTownLabels([], 0, 800, 0, 600);
  assert.equal(layer.style.display, 'none');
  ctx.showTownLabels = ctx.showBuildingLabels = true; ctx.syncTownLabels([], 0, 800, 0, 600);
  assert.equal(layer.style.display, 'block'); assert.ok(visible().includes('building'));
});

test('geographic labels remain visible at townscape zoom while country and settlement labels hide', () => {
  let town = true;
  const layers = Object.fromEntries(['countryDom', 'civIconDom', 'settlementDom', 'regionLabelDom', 'geographicLabelDom'].map(name => [name, { el: element() }]));
  const ctx = context(['syncMapLabelVisibility'], { ...layers, townscapeActive: () => town });
  ctx.syncMapLabelVisibility();
  assert.ok(['countryDom', 'civIconDom', 'settlementDom'].every(name => layers[name].el.style.display === 'none'));
  assert.ok(['regionLabelDom', 'geographicLabelDom'].every(name => layers[name].el.style.display === ''));
  town = false; ctx.syncMapLabelVisibility();
  assert.ok(Object.values(layers).every(layer => layer.el.style.display === ''));
});

test('unit health rings reuse geometry, reflect damage and disappear when an icon slot changes kind', () => {
  let created = 0;
  const ctx = context(['syncUnitIconHealth'], {
    document: { createElementNS: () => { created++; return element(); } },
    err: message => assert.fail(message),
  });

  test('native city details append the simulated civilian count without changing citizens or repeating parentheses', () => {
    const count = { textContent: '5 (old population)' }, city = { population: 5, location: {} };
    const ctx = context(['syncCityDetailsPopulation'], {
      document: { querySelector: () => ({ querySelector: () => count }) },
      UI: { Player: { getHeadSelectedCity: () => 'city' } }, Cities: { get: () => city },
      GameplayMap: { getIndexFromLocation: () => 8 }, frames: [[0, 1]], manifest: { rev: 3 },
      readManifest: () => ({ rev: 3, frames: [[0, 1]] }),
      settlementPopulationSnapshot: () => new Map([[8, { population: 1234567 }]]),
      formatThousands: value => value.toLocaleString('en-US'), err: message => assert.fail(message),
    });
    ctx.syncCityDetailsPopulation(); ctx.syncCityDetailsPopulation();
    assert.equal(count.textContent, '5 (1,234,567)'); assert.equal(city.population, 5);
  });

  test('geographic camera refresh coalesces pans, waits for settling and invalidates only the label layout', () => {
    const callbacks = new Map(), cache = { layout: {} }, frame = new Map();
    let id = 0, draws = 0, now = 1000;
    const ctx = context(['scheduleGeographyLabelRefresh'], {
      geographyRefreshTimer: 0, geographyLabelCache: cache, mapVisible: true, curFrame: frame,
      lastMapInputTs: now, Date: { now: () => now }, fogMode: false,
      setTimeout: callback => { callbacks.set(++id, callback); return id; }, clearTimeout: key => callbacks.delete(key),
      drawGeographyLayers: current => { assert.equal(current, frame); draws++; }, err: message => assert.fail(message),
    });
    ctx.scheduleGeographyLabelRefresh(); ctx.scheduleGeographyLabelRefresh();
    assert.equal(callbacks.size, 1);
    let callback = [...callbacks.values()][0]; callbacks.clear(); callback();
    assert.equal(draws, 0); assert.equal(callbacks.size, 1);
    now += 300; callback = [...callbacks.values()][0]; callbacks.clear(); callback();
    assert.equal(draws, 1); assert.equal(cache.layout, null);
  });
  const slot = { el: element() };
  ctx.syncUnitIconHealth(slot, { kind: 'unit', health: 75 });
  assert.equal(created, 3); assert.match(slot.healthSvg.attrs['aria-label'], /75%/);
  ctx.syncUnitIconHealth(slot, { kind: 'unit', health: 20 });
  assert.equal(created, 3); assert.equal(slot.healthCircle.attrs.stroke, '#df5757');
  const [length] = slot.healthCircle.attrs['stroke-dasharray'].split(' ').map(Number);
  assert.ok(Math.abs(length / (2 * Math.PI * 46) - 0.2) < 1e-9);
  ctx.syncUnitIconHealth(slot, { kind: 'building' });
  assert.equal(slot.healthSvg.style.display, 'none');
});

test('movement checkbox explicitly hides retained arrow geometry and fortification and defense paths follow their layers', () => {
  const paths = Object.fromEntries(['road', 'rail', 'ties', 'roadDim', 'railDim', 'tiesDim', 'move', 'moveUnder', 'moveHead',
    'fort', 'defense', 'defenseUnder'].map(key => [key, element()]));
  const ctx = context(['drawRouteLayer', 'syncRouteStatus'], {
    routePaths: paths, routeDom: { el: element() }, syncRouteWidths() {}, basePos: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
    terrain: [5, 5], neighborsByIndex: [[], []], ensureRoutePaths() {}, readRoutesTurn: () => new Map(), routeKey: '', roadLines: new Map(),
    hexW: 10, hexH: 10, mapPxW: 200, mapPxH: 100, colShift: 0, pos: 0, viewZoom: 1,
    frames: [[0, 1]], frameFor: () => new Map([[0, 0], [1, 0]]), riverEdges: new Set(),
    showUnits: true, showPreviousMovement: true, showNaturalFeatures: false, showSettlements: true, mapVisible: true,
    readUnitsTurn: () => [[1, 0, 0, 50, 0, 0, 3]],
    settlementsForPos: () => new Map([[0, ['Roma', 5, 'City', [], [25, 100]]]]),
    mapToScreen: (x, y) => ({ x, y }), window: { innerWidth: 500, innerHeight: 500 },
  });
  ctx.drawRouteLayer(null);
  assert.ok(paths.move.attrs.d); assert.equal(paths.move.style.display, '');
  assert.ok(paths.fort.attrs.d); assert.match(paths.defense.attrs.d, /h5.5$/);
  ctx.showPreviousMovement = false;
  ctx.drawRouteLayer(null);
  for (const name of ['move', 'moveUnder', 'moveHead']) assert.equal(paths[name].style.display, 'none');
  ctx.showUnits = false; ctx.showSettlements = false; ctx.syncRouteStatus(null);
  for (const name of ['fort', 'defense', 'defenseUnder']) assert.equal(paths[name].style.display, 'none');
  ctx.showPreviousMovement = true; ctx.showUnits = true; ctx.drawRouteLayer(null);
  assert.equal(paths.move.style.display, ''); assert.ok(paths.move.attrs.d);
  ctx.showSettlements = true;
  for (const hp of [[100, 100], [110, 100], [100, 0], [NaN, 100]]) {
    ctx.settlementsForPos = () => new Map([[0, ['Roma', 5, 'City', [], hp]]]);
    ctx.syncRouteStatus(null);
    assert.equal(paths.defense.attrs.d, '');
    assert.equal(paths.defenseUnder.style.display, 'none');
  }
  ctx.settlementsForPos = () => new Map([[0, ['Roma', 5, 'City', [], [0, 100]]]]);
  ctx.syncRouteStatus(null);
  assert.match(paths.defense.attrs.d, /h0$/);
  assert.equal(paths.defenseUnder.style.display, '');
});

test('display crowds include walkers in route cooldowns and new outdoor arrivals while retaining exemptions', () => {
  const clumps = new crowds.WalkerClumps();
  clumps.coarse = true;
  const members = Array.from({ length: 68 }, (_, id) => ({ id, x: 10, y: 10, fade: id === 0 ? 0.1 : 1, clumpAfter: 9999 }));
  members[64].pinned = true; members[65].cmd = {}; members[66].runner = true; members[67].selected = true;
  const home = { people: members, military: false };
  const markers = clumps.markers(p => p, [home], p => p.runner || p.selected);
  assert.equal(clumps.clumps.size, 0, 'rendering does not depend on route-sharing membership');
  assert.equal(markers.length, 2); assert.equal(markers.flatMap(m => m.members).length, 64);
  assert.equal(new Set(markers.flatMap(m => m.members)).size, 64);
  assert.ok(markers.every(m => m.members.length <= 32 && m.clump.group === home));
  clumps.coarse = false; assert.equal(clumps.markers(p => p, [home]).length, 0);
});

test('decorations remain visible through crowd zoom while individual dots switch at the attainable aspect-aware boundary', () => {
  const ctx = context(['walkerCrowdsActive', 'townDecoActive'], {
    window: { innerHeight: 600 }, hexH: 100, viewAspectY: 0.5, viewZoom: 287,
    CLUMP_SPLIT_SCREENS: crowds.CLUMP_SPLIT_SCREENS, maxViewZoom: () => 1920, townscapeActive: () => true,
  });
  assert.equal(ctx.walkerCrowdsActive(), true); assert.equal(ctx.townDecoActive(), true);
  assert.equal(crowds.CLUMP_SPLIT_SCREENS, 24, 'twice the former 12-screen split threshold');
  ctx.viewZoom = 144;
  assert.equal(ctx.walkerCrowdsActive(), true, 'old split zoom now retains crowds');
  ctx.viewZoom = 288;
  assert.equal(ctx.walkerCrowdsActive(), false); assert.equal(ctx.townDecoActive(), true);
  ctx.viewAspectY = 0.001; ctx.viewZoom = 1919;
  assert.equal(ctx.walkerCrowdsActive(), true);
  ctx.viewZoom = 1920;
  assert.equal(ctx.walkerCrowdsActive(), false); assert.equal(ctx.townDecoActive(), true);
  ctx.townscapeActive = () => false; ctx.mapVisible = false; assert.equal(ctx.townDecoActive(), false);
});

test('camera changes replace rendered individuals and crowds synchronously, including while paused', () => {
  const graph = { nodes: [{ x: 10, y: 10 }], adj: [[]], doorForms: new Map() };
  const people = Array.from({ length: 6 }, (_, id) => ({ id, key: `home#${id}`, node: 0, target: 0, x: 10, y: 10, fade: 1, clumpAfter: 9999 }));
  people[4].pinned = true;
  const home = { people, byId: new Map(people.map(p => [p.id, p])), streetNodes: [0] };
  const circle = element(), clumps = new crowds.WalkerClumps();
  let now = 100, ticks = 0;
  const ctx = context(['peopleCameraKey', 'peopleTick', 'syncWalkerDots', 'syncWalkerHeadwear', 'syncCrowdDots', 'syncPeople', 'syncCrowdVisibility', 'clearPeopleVisuals'], {
    townInterturn: { active: false },
    townRender: { pending: false },
    ...crowds, hexH: 100, viewAspectY: 1, viewZoom: 2, mapPanX: 0, mapPanY: 0, mapX: 0, mapY: 0, peopleViewKey: '',
    peopleActive: () => true, ensurePeopleLayer() {}, townKey: 'town', townLayer: {}, peopleSvg: element(), townWorld: { graph, key: 'town' }, peopleLast: 0, peopleLoop: 0,
    nowMs: () => now, window: { innerWidth: 1000, innerHeight: 600 }, peopleSizeKey: '1000x600',
    popState: { peoplePaused: true, walkerSpeed: 5, selectedPerson: 'home#5' }, ps: n => n, walkerDotRadius: () => 1.6,
    clumpTime: 0, clumpsAt: -Infinity, walkerClumps: clumps, walkerCrowdsActive: () => false,
    walkerScreenPoint: p => p, walkerRunnerRole: () => '', walkerPlanRoute() {}, popModelKey: () => 'turn', personProfileFor: () => ({}), townWalkers: new Map([['home', home]]),
    cmdLiveTurn: () => false, cmdState: { chosen: new Set() }, cmdTickPerson() { ticks++; }, MAX_PEOPLE: 7200,
    peopleClumpMarkers: [], peopleClumpHidden: new Set(), peopleDotPaths: [], peopleClumpPaths: [], peopleHeadwearPaths: [], townPeople: element(),
    document: { createElementNS: element }, cmdPickRings: [], cmdPanelState: {}, peopleRingUnder: circle, peopleRing: circle,
    populationArrow: {}, popRefreshBuilding() {}, popRefreshActions() {}, clumpPicker: {}, requestAnimationFrame: () => 1,
  });
  const rendered = () => ctx.peopleDotPaths.reduce((sum, el) => sum + (el.attrs.d.match(/Z/g) || []).length, 0);
  ctx.peopleTick(); assert.equal(rendered(), 6);
  const project = ctx.walkerScreenPoint;
  ctx.walkerScreenPoint = () => { throw new Error('projection failed'); };
  ctx.mapPanY = 1;
  assert.throws(() => ctx.peopleTick(), /projection failed/);
  assert.equal(rendered(), 0, 'a failed replacement cannot leave the previous camera geometry visible');
  assert.equal(ctx.peopleSvg.style.display, 'none');
  ctx.walkerScreenPoint = project; ctx.mapPanY = 0;
  now += 50; ctx.peopleTick();
  assert.equal(rendered(), 6);
  ctx.walkerCrowdsActive = () => ctx.viewZoom < 2;
  ctx.viewZoom = 1.99;
  ctx.syncCrowdVisibility();
  assert.equal(rendered(), 0, 'old individual geometry clears synchronously before the zoom redraw');
  assert.equal(ctx.peopleSvg.style.display, 'none');
  let cancelled = 0;
  ctx.cancelAnimationFrame = () => cancelled++;
  ctx.syncPeople([]);
  assert.equal(rendered(), 2, 'only pinned and selected people keep individual circles');
  assert.equal(ctx.peopleClumpHidden.size, 4);
  assert.equal(ctx.peopleClumpMarkers[0].members.length, 4);
  assert.equal((ctx.peopleClumpPaths[0].attrs.d.match(/Z/g) || []).length, 1, 'distant groups draw representative dots without losing members');
  ctx.viewZoom = 2.01;
  ctx.syncPeople([]);
  assert.equal(rendered(), 6); assert.equal(ctx.peopleClumpPaths[0].attrs.d, '');
  assert.equal(cancelled, 2, 'camera refresh replaces the pending callback instead of starting another loop');
  ctx.mapPanX = 25; ctx.syncPeople([]);
  assert.equal(cancelled, 3, 'panning within a zoom mode also refreshes screen-space dots immediately');
  const baseline = ticks;
  now += 16; ctx.peopleTick();
  assert.equal(ticks, baseline, 'individual updates skip redundant 60Hz callbacks');
  now += 18; ctx.peopleTick();
  assert.equal(ticks, baseline + 6, 'individuals update at 30Hz with elapsed time');
  ctx.viewZoom = 1.9; ctx.peopleTick();
  assert.equal(ticks, baseline + 12, 'zoom mode changes bypass the cadence gate immediately');
  now += 32; ctx.peopleTick();
  assert.equal(ticks, baseline + 12, 'coarse crowds skip callbacks less than 50ms apart');
  now += 18; ctx.peopleTick();
  assert.equal(ticks, baseline + 18, 'crowd updates run at 20Hz');
  let elapsed = 0, advances = 0;
  const simulationStart = now;
  ctx.popState.walkerSpeed = 1;
  ctx.popState.peoplePaused = false;
  ctx.stepWalker = (person, graph, dt) => { if (person === people[0]) { elapsed += dt; advances++; } };
  for (let frame = 1; frame <= 120; frame++) {
    now = simulationStart + frame * 1000 / 60;
    ctx.peopleTick();
  }
  assert.ok(elapsed > 1.9 && elapsed <= 2.001, '20Hz crowds preserve real-time movement instead of slowing walkers down');
  assert.ok(advances <= 40, 'simulation stays at 20Hz');
  const before = advances;
  for (let i = 0; i < 100; i++) { ctx.mapPanX++; ctx.syncPeople([]); }
  assert.equal(advances, before, 'camera-only redraws do not advance simulation or reset its elapsed clock');
  const savedWorld = ctx.townWorld;
  ctx.townInterturn.active = true;
  ctx.mapPanX += 50;
  ctx.syncPeople([]);
  assert.equal(ctx.peopleSvg.style.display, 'none', 'AI-turn pause cannot leave fixed dots from the old camera on screen');
  assert.equal(ctx.townWorld, savedWorld, 'hiding stale dots retains the bounded walking network');
  ctx.viewZoom = 2.01;
  ctx.syncPeople([]);
  assert.equal(ctx.peopleSvg.style.display, 'none', 'zooming from crowds to walkers cannot restore stale circles');
  assert.equal(ctx.peopleClumpPaths[0].attrs.d, '');
  ctx.townInterturn.active = false;
  ctx.syncPeople([]);
  assert.equal(ctx.peopleSvg.style.display, 'block', 'resuming reprojects dots before making the layer visible');
  assert.equal(ctx.peopleViewKey, ctx.peopleCameraKey());
  ctx.walkerScreenPoint = p => ({ x: p.x + ctx.mapPanX, y: p.y });
  ctx.mapPanX = 25; ctx.syncPeople([]);
  assert.match(ctx.peopleDotPaths[0].attrs.d, /^M36\.6,10L/, 'dots move with the map rather than staying at stale screen coordinates');
  ctx.mapPanX = 2000; ctx.syncPeople([]);
  assert.equal(rendered(), 0, 'panning all walkers offscreen clears every old individual circle');
  assert.ok(ctx.peopleClumpPaths.every(path => !path.attrs.d), 'offscreen crowds leave no retained visible path');
  ctx.mapPanX = 0; ctx.syncPeople([]);
  assert.equal(rendered(), 6, 'panning back restores only the newly projected individuals');
  ctx.viewZoom = 1.9; ctx.syncPeople([]);
  ctx.mapPanX = 2000; ctx.syncPeople([]);
  assert.equal(rendered(), 0);
  assert.ok(ctx.peopleClumpPaths.every(path => !path.attrs.d), 'panning crowds offscreen clears both render modes');
  ctx.mapPanX = 0; ctx.syncPeople([]);
  assert.ok(ctx.peopleClumpPaths.some(path => path.attrs.d));
  ctx.walkerCrowdsActive = () => false;
  ctx.syncCrowdVisibility();
  assert.equal(ctx.peopleSvg.style.display, 'none', 'split-mode changes invalidate the view even when zoom coordinates are identical');
  assert.equal(rendered(), 0);
  assert.ok(ctx.peopleClumpPaths.every(path => !path.attrs.d));
  ctx.syncPeople([]);
  assert.equal(rendered(), 6, 'reprojection restores individuals after the changed split mode');
  ctx.peopleActive = () => false;
  ctx.syncCrowdVisibility();
  assert.equal(ctx.peopleSvg.style.display, 'none', 'scrolling out of townscape zoom hides individuals and crowds together');
  assert.equal(rendered(), 0, 'inactive zoom clears individual geometry, not only the parent display style');
  assert.ok(ctx.peopleClumpPaths.every(path => !path.attrs.d));
});

test('closing Population clears every selection and camera follow without discarding pins, expansion or issued commands', () => {
  const ring = element(), chosen = new Set(['home#0', 'home#1']), expanded = new Set(['civ']), pins = [{ key: 'home#0' }];
  const issued = { label: 'Work at the workshop' }, person = { cmd: issued };
  let stops = 0, updates = 0, rendered = 0;
  const ctx = context(['togglePopulationPanel', 'clearPopulationSelection', 'cmdCloseMenu', 'cmdClearPanelCommand', 'closeClumpPicker'], {
    els: { popPanel: element(), clumpPanel: element() },
    popState: { open: true, selectedId: 'home', selectedTile: 12, selectedKind: 'house', selectedPerson: 'home#0',
      focusPerson: 'home#0', hoverRow: {}, hoverNode: 'home', mapHover: {}, mapHoverKey: 'home', expanded, pins },
    popCameraTrip: { press: {}, trip: {} }, popStopCameraTrip() { ctx.popCameraTrip.trip = null; stops++; },
    popStopFollow() { stops++; }, popSetHoverRow() {},
    cmdState: { chosen, rightDown: true, target: {}, menu: { el: { parentNode: { removeChild() {} } } } },
    townWalkers: new Map([['home', { people: [person] }]]),
    cmdPanelState: { hovered: 'work', selected: 'work', target: {}, pointer: {}, highlights: element() },
    cmdHideArrows() {}, cmdPanelPaintRows() {}, cmdUpdateStatus() {},
    clumpPicker: { clump: {}, rows: [{}] }, peopleRingUnder: ring, peopleRing: ring, cmdPickRings: [ring],
    popSyncPersonHighlights() {}, updateSelectionIndicator: () => updates++,
    leadState: { open: true }, leadRender: () => rendered++,
    positionPopulationUi() {}, popRefreshModel() {}, popModelKey: () => 'model', popRender: () => rendered++,
  });
  ctx.togglePopulationPanel();
  assert.equal(ctx.popState.open, false);
  assert.equal(ctx.els.popPanel.style.display, 'none');
  for (const key of ['selectedId', 'selectedKind', 'selectedPerson', 'focusPerson', 'hoverNode', 'mapHoverKey']) assert.equal(ctx.popState[key], '');
  assert.equal(ctx.popState.selectedTile, -1);
  assert.equal(ctx.popState.hoverRow, null); assert.equal(ctx.popState.mapHover, null);
  assert.equal(chosen.size, 0); assert.equal(ctx.cmdState.menu, null); assert.equal(ctx.cmdState.rightDown, false);
  assert.equal(ctx.cmdPanelState.selected, ''); assert.equal(ctx.cmdPanelState.target, null);
  assert.equal(ctx.clumpPicker.clump, null);
  assert.equal(ring.attrs.r, '0', 'rings clear immediately even if walkers are paused');
  assert.equal(stops, 2); assert.equal(updates, 1);
  assert.equal(ctx.popState.expanded, expanded); assert.equal(ctx.popState.pins, pins);
  assert.equal(person.cmd, issued, 'deselecting must not cancel an already-issued action');
  ctx.togglePopulationPanel();
  assert.equal(ctx.popState.open, true);
  assert.equal(ctx.popState.selectedPerson, '');
  assert.equal(chosen.size, 0);
  assert.equal(rendered, 2);
  assert.match(slice('resetPopulationUi'), /clearPopulationSelection\(\)/, 'map close uses the same deselection cleanup');
});

test('stopping walkers clears retained individual and crowd geometry even during a camera trip', () => {
  const individual = element(), crowd = element(), ring = element(), world = {};
  individual.attrs.d = crowd.attrs.d = 'stale'; individual.mapShape = null; crowd.mapShape = 'stale';
  const walkers = new Map([['home', {}]]);
  const ctx = context(['stopPeople', 'clearPeopleVisuals'], {
    peopleLoop: 0, peopleViewKey: 'old', peopleSvg: { style: {} }, peopleDotPaths: [individual], peopleClumpPaths: [crowd], peopleHeadwearPaths: [],
    peopleRingUnder: ring, peopleRing: ring, cmdPickRings: [ring],
    popCameraTrip: { trip: { pos: 2 } }, mapVisible: true, pos: 2, gameOverlayActive: () => false,
    townWalkers: walkers, townWorld: world, walkerClumps: { clear() {} },
    peopleClumpMarkers: [{}], peopleClumpHidden: new Set(), closeClumpPicker() {}, clumpsAt: 0,
  });
  ctx.stopPeople();
  assert.equal(individual.attrs.d, ''); assert.equal(crowd.attrs.d, '');
  assert.equal(ring.attrs.r, '0'); assert.equal(ctx.peopleSvg.style.display, 'none');
  assert.equal(ctx.townWorld, world); assert.equal(walkers.size, 1, 'trip retains the bounded simulation but never its old screen paths');
  ctx.popCameraTrip.trip = null; ctx.stopPeople();
  assert.equal(ctx.townWorld, null); assert.equal(walkers.size, 0);
});

test('unused dot batches cannot reappear when an SVG renderer retains its last nonempty path', () => {
  const paths = [], root = element();
  const ctx = context(['syncWalkerDots', 'clearPeopleVisuals'], {
    individualDotPaths: crowds.individualDotPaths,
    townPeople: root, peopleDotPaths: paths, peopleClumpPaths: [], peopleHeadwearPaths: [], peopleSvg: { style: { display: 'block' } },
    peopleRingUnder: null, peopleRing: null, cmdPickRings: [],
    document: { createElementNS() {
      const path = element();
      path.setAttribute = (key, value) => {
        path.attrs[key] = value;
        // Model the retained native geometry independently of the DOM's empty d attribute.
        if (key === 'd' && value) path.paintedGeometry = value;
      };
      return path;
    } },
  });
  const dot = (id, fade) => ({ x: id * 10, y: 20, radius: 2, fade });
  const visible = () => paths.filter(path => path.style.visibility !== 'hidden' && path.paintedGeometry);
  ctx.syncWalkerDots([dot(0, 1), dot(1, 0.5), dot(2, 0.25)]);
  assert.equal(visible().length, 3);
  const retained = paths[2].paintedGeometry;
  ctx.syncWalkerDots([dot(0, 1)]);
  assert.equal(paths[2].attrs.d, '');
  assert.equal(paths[2].paintedGeometry, retained, 'empty DOM data alone does not prove native geometry disappeared');
  assert.equal(visible().length, 1, 'surplus fade/color batches are explicitly hidden');
  ctx.clearPeopleVisuals();
  assert.equal(visible().length, 0);
  ctx.syncWalkerDots([dot(3, 1)]);
  ctx.peopleSvg.style.display = 'block';
  assert.equal(visible().length, 1, 'revealing the parent must not revive unused cached paths');
  assert.match(visible()[0].paintedGeometry, /^M32,20L/);
  ctx.syncWalkerDots([]);
  assert.equal(visible().length, 0, 'all offscreen/indoor dots hide even when the parent stays visible');
  ctx.syncWalkerDots([dot(4, 1), dot(5, 0.5), dot(6, 0.25)]);
  assert.equal(visible().length, 3, 'reused slots become visible only after receiving current geometry');
  assert.equal(root.children.length, 3, 'reuse bounded batches instead of recreating SVG nodes');
});

test('walker highlight circles stay steady while selection arrows retain their blink animation', () => {
  const styles = [];
  const ctx = context(['ensureArrowStyle', 'ensurePeopleLayer'], {
    peopleSvg: null, peopleRing: null, peopleRingUnder: null, townPeople: null, MAP_DEPTH: 300000,
    document: {
      getElementById: id => styles.find(style => style.id === id),
      createElement: element,
      createElementNS() {
        const el = element();
        el.append = (...children) => children.forEach(child => el.appendChild(child));
        return el;
      },
      head: { appendChild: style => styles.push(style) }, body: { appendChild() {} },
    },
  });
  ctx.ensurePeopleLayer();
  assert.equal(styles.length, 1);
  const css = styles[0].textContent;
  assert.match(css, /\.anthro-selection-arrow svg\{animation:anthro-selection-pulse/);
  assert.doesNotMatch(css, /\.anthro-person-ring/, 'walker rings must not participate in the repeating opacity animation');
  assert.equal(ctx.peopleRing.attrs.stroke, '#fff');
  assert.equal(ctx.peopleRingUnder.attrs.stroke, '#000');
  ctx.ensurePeopleLayer();
  assert.equal(styles.length, 1, 'movement does not recreate or restart shared animation styles');
});

test('crowd-to-individual switching explicitly hides every retained crowd path', () => {
  const crowd = element();
  crowd.mapShape = 'old'; crowd.attrs.d = 'old';
  const ctx = context(['syncCrowdVisibility'], {
    peopleSvg: null, peopleActive: () => true, walkerCrowdsActive: () => false,
    peopleClumpPaths: [crowd], peopleClumpMarkers: [{}], peopleClumpHidden: new Set(['person']),
  });
  assert.equal(ctx.syncCrowdVisibility(), false);
  assert.equal(crowd.style.visibility, 'hidden');
  assert.equal(crowd.style.display, 'none');
  assert.ok(slice('setMapVisible').indexOf('if (!on) stopPeople()') < slice('setMapVisible').indexOf('stopCameraFollow()'),
    'map-close hides walkers before fallible panel cleanup, without waiting for another animation frame');
});

test('coarse display represents isolated walkers too and never leaves ordinary individual circles behind', () => {
  const clumps = new crowds.WalkerClumps();
  clumps.coarse = true;
  const people = Array.from({ length: 10 }, (_, id) => ({ id, x: id * 100, y: 10, fade: 1 }));
  const group = { people };
  const markers = clumps.markers(p => p, [group]);
  assert.equal(markers.flatMap(m => m.members).length, people.length);
  assert.equal(new Set(markers.flatMap(m => m.members)).size, people.length);
  assert.ok(markers.every(m => m.members.length === 1), 'isolated members keep their location, not a fabricated nearby crowd');
  clumps.coarse = false;
  assert.equal(clumps.markers(p => p, [group]).length, 0);
});
