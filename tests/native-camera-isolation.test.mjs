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
function world() {
  let now = 1000, renders = 0;
  const nativeCalls = [], canceled = [], timers = [], warnings = [];
  const state = { focusPoint: { x: 12, y: 34 }, zoomLevel: 0.4 };
  const ctx = vm.createContext({
    Camera: {
      getState: () => state,
      zoom: (...args) => nativeCalls.push(['zoom', ...args]),
      lookAt: (...args) => nativeCalls.push(['lookAt', ...args]),
      lookAtPlot: (...args) => nativeCalls.push(['lookAtPlot', ...args]),
    },
    mapVisible: true, applyingFromGame: false, lastMapInputTs: 0, gameCamTimer: 0,
    hideTownLabels() {},
    camLast: { x: 0, y: 0, z: 1 }, camPollTimer: 0, leaderSceneShown: false,
    LeaderModelManager: { isLeaderShowing: false }, syncOverlayState() {},
    viewZoom: 28, mapPanX: 0, mapPanY: 0, mapPxW: 2500, mapPxH: 1500, mapX: 0, mapY: 0,
    MIN_VIEW_ZOOM: 0.01, maxViewZoom: () => 400000, popStopCameraTrip() {},
    measureArea: () => ({ x: 0, y: 0, w: 1920, h: 1080 }), applyMapView: () => renders++,
    Date: { now: () => now }, clearTimeout: id => canceled.push(id), setTimeout: fn => { timers.push(fn); return timers.length; },
    requestAnimationFrame: fn => { timers.push(fn); return timers.length; }, viewApplyQueued: false,
    startCaptureWatch() {}, startOverlayWatch() {}, startSelectionIndicator() {},
    stopSelectionIndicator() {}, stopCaptureWatch() {}, stopOverlayWatch() {}, closeGamepadControls() {},
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval: id => canceled.push(id),
    console: { warn: message => warnings.push(message) }, TAG: '[test]',
  });
  vm.runInContext(['camSnap', 'scheduleGameCameraSync', 'changeMapZoom', 'panMap', 'requestViewApply',
    'holdGameCamera', 'startCameraFollow', 'stopCameraFollow'].map(slice).join('\n'), ctx);
  return { ctx, state, nativeCalls, canceled, timers, warnings, renders: () => renders, advance: () => { now += 20; } };
}

test('rapid camera input defers turn capture and pending detail drawing, then catches up once without moving historical playback', () => {
  const { ctx, canceled } = world();
  let now = 1000, pending, captures = 0, details = 0, available = 6;
  const drawn = [];
  Object.assign(ctx, {
    Date: { now: () => now }, building: false, manifest: {}, cellByIndex: [0], frames: [0, 1, 2, 3, 4], pos: 4,
    builtFrameCount: 5, recordedFrameCount: () => available, curFrame: new Map(), scatterJob: null, viewDetailTimer: 0, decorRefreshTimer: 2,
    refresh() { captures++; ctx.frames = Array.from({ length: available }, (_, i) => i); },
    frameFor: pos => pos, drawMap: frame => drawn.push(frame), updateControls() {}, redraw: () => details++,
    setTimeout: fn => { pending = fn; return 1; }, err: message => { throw new Error(message); },
  });
  vm.runInContext(['syncToLatestCapture', 'scheduleViewDetailRedraw'].map(slice).join('\n'), ctx);
  ctx.scheduleGameCameraSync(); ctx.scheduleViewDetailRedraw();
  for (now = 1020; now < 1500; now += 20) {
    ctx.scheduleGameCameraSync(); ctx.syncToLatestCapture(); pending();
  }
  assert.equal(captures, 0); assert.equal(details, 0);
  ctx.scatterJob = { frame: 'old-turn' };
  now = 1730; ctx.syncToLatestCapture();
  assert.equal(captures, 1); assert.equal(details, 0); assert.deepEqual(drawn, [5]);
  assert.equal(ctx.viewDetailTimer, 0); assert.equal(ctx.decorRefreshTimer, 0); assert.equal(ctx.scatterJob, null);
  assert.ok(canceled.includes(1) && canceled.includes(2), 'superseded renderer jobs are actually canceled');
  ctx.scheduleViewDetailRedraw(); pending(); assert.equal(details, 1, 'a standalone detail redraw resumes once navigation is quiet');
  ctx.syncToLatestCapture(); assert.equal(captures, 1, 'one catch-up, not a replay of every deferred redraw');
  ctx.pos = 1; available = 7; now = 1800; ctx.scheduleGameCameraSync(); ctx.syncToLatestCapture();
  now = 2050; ctx.syncToLatestCapture();
  assert.equal(ctx.pos, 1); assert.deepEqual(drawn, [5, 1], 'historical viewing stays on its selected turn');
});

test('repeated whole-map zoom-out, zoom-in and pan never send native zoom or camera movement requests', () => {
  const { ctx, nativeCalls, timers, renders, advance } = world();
  const initial = ctx.viewZoom;
  for (let i = 0; i < 80; i++) { ctx.changeMapZoom(0.8); advance(); }
  assert.equal(ctx.viewZoom, 0.01);
  for (let i = 0; i < 80; i++) { ctx.changeMapZoom(1.25); ctx.panMap(20, -10); advance(); }
  assert.ok(ctx.viewZoom > initial, '2D zoom range remains independent of the native camera');
  assert.ok(ctx.mapPanX !== 0 && ctx.mapPanY !== 0);
  assert.equal(renders(), 240);
  assert.ok(ctx.lastMapInputTs > 1000, 'deferred natural drawing still receives navigation timestamps');
  assert.deepEqual(nativeCalls, []);
  assert.equal(timers.length, 0, 'there is no delayed native camera sync to run after input settles');
});

test('coalesced map navigation cancels pending legacy sync and does not recreate a hidden native request', () => {
  const { ctx, nativeCalls, timers, canceled, renders } = world();
  ctx.gameCamTimer = 73;
  for (let i = 0; i < 100; i++) ctx.requestViewApply();
  assert.deepEqual(canceled, [73]);
  assert.equal(ctx.gameCamTimer, 0);
  assert.equal(timers.length, 1, 'only a 2D redraw remains queued');
  timers.shift()();
  assert.equal(renders(), 1);
  assert.deepEqual(nativeCalls, []);
  ctx.applyingFromGame = true;
  const stamp = ctx.lastMapInputTs;
  ctx.scheduleGameCameraSync();
  assert.equal(ctx.lastMapInputTs, stamp, 'opening alignment does not masquerade as player navigation');
});

test('camera watch observes native placement/selection changes without snapping back or imposing map zoom', () => {
  const { ctx, state, nativeCalls } = world();
  for (let i = 0; i < 100; i++) {
    state.focusPoint.x += 1; state.focusPoint.y -= 2; state.zoomLevel = i / 100;
    ctx.holdGameCamera();
    assert.equal(ctx.camLast.x, state.focusPoint.x);
    assert.equal(ctx.camLast.y, state.focusPoint.y);
    assert.equal(ctx.camLast.z, state.zoomLevel);
  }
  assert.deepEqual(nativeCalls, [], 'native placement camera remains under native control');
});

test('open/close watch lifecycle remains bounded and reports the isolated native-camera behavior', () => {
  const { ctx, nativeCalls, warnings, timers } = world();
  ctx.startCameraFollow(); ctx.startCameraFollow();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /v45.*isolated from native 3D camera/);
  assert.equal(timers.length, 1);
  ctx.stopCameraFollow();
  assert.equal(ctx.camPollTimer, 0);
  assert.equal(ctx.camLast, null);
  assert.deepEqual(nativeCalls, [], 'closing does not teleport the native camera to the 2D view');
});
