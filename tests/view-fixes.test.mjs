import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const playback = await readFile(new URL('../anthroprocenia/ui/map/anthroprocenia-playback.js', import.meta.url), 'utf8');
const slice = name => {
  const start = playback.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0, i = playback.indexOf('{', start);
  for (; i < playback.length; i++) {
    if (playback[i] === '{') depth++;
    else if (playback[i] === '}' && --depth === 0) break;
  }
  return playback.slice(start, i + 1);
};

test('while a leader scene (diplomacy) shows, every map layer and everything inside it is hidden', () => {
  const css = slice('ensureChromeOverlayStyle');
  assert.match(css, /body\.anthro-leader-scene \.anthro-map-render-layer, body\.anthro-leader-scene \.anthro-map-render-layer \* \{ visibility: hidden !important; \}/);
  assert.match(css, /body\.anthro-game-overlay \.\$\{MAP_CHROME_CLASS\} \{ display: none !important; \}/);
  // The labels are children that set visibility:visible for themselves, which a hidden parent alone does not override.
  assert.match(playback, /style\.cssText = '[^']*visibility:visible;/);
  assert.match(slice('syncOverlayState'), /document\.body\.classList\.toggle\('anthro-leader-scene', leader\)/);
  assert.match(slice('syncOverlayState'), /const leader = mapVisible && !!LeaderModelManager\.isLeaderShowing/);
});

test('every layer that can carry labels is a render layer, so the leader-scene rule reaches it', () => {
  const root = slice('ensureMapRoot');
  assert.match(root, /for \(const dom of \[wonDom, dotDom, terrainMarkerDom, riverDom, tradeRouteDom, routeDom, regionBorderDom, regionLabelDom, civIconDom, countryDom, settlementDom, geographicLabelDom\]\)/);
  assert.match(root, /d\.classList\.add\('anthro-map-render-layer'\)/);
  for (const layer of ['unitDom', 'iconDom']) assert.match(root, new RegExp(`if \\(!${layer}\\.el\\)[\\s\\S]*?classList\\.add\\('anthro-map-render-layer'\\)`));
});

test('the buildings\' decorative squares are left out while the townscapes show, and redrawn when that changes', () => {
  const draw = slice('drawUnitLayer');
  assert.match(draw, /const townscapeOn = townscapeActive\(\);/);
  assert.match(draw, /if \(townscapeOn && marker\.item && marker\.item\.kind !== 'resource'\) continue;/);
  // icon points (which the townscapes are built from) are recorded before the square is skipped
  assert.ok(draw.indexOf('iconPoints.push') < draw.indexOf("marker.item.kind !== 'resource') continue;"));
  assert.ok(draw.indexOf("marker.item.kind !== 'resource') continue;") < draw.indexOf('shapePaths(marker.shape'));
  assert.match(draw, /if \(townscapeOn && !marker\.item && marker\.kind === 'unit' && !marker\.decor && !marker\.natural\) continue;/, 'the decorative unit dots too');
  const view = slice('applyMapView');
  assert.match(view, /townNow = townscapeActive\(\)/);
  assert.match(view, /townNow !== townscapeShown/);
  assert.match(view, /townscapeShown = townNow;/);
  assert.match(playback, /^let townscapeShown = false;/m);
  assert.match(slice('syncTownscapes'), /unitDom.el.style.display = ''/);
  assert.match(slice('syncTownscapes'), /if \(townscapeActive\(\)\) for \(const slot of unitSlots\) if \(slot\) parkSlot\(slot\)/);
});
