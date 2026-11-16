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
function fixture() {
  let kind = 'major', nativeCalls = 0;
  const identities = new Map(Array.from({ length: 64 }, (_, owner) => [owner, ['leader', 'Rome', 'Roman', 255, 16711680, 'CIVILIZATION_ROME']]));
  const ctx = vm.createContext({
    pos: 0, ownerColorCache: new Map(), identityForPos: () => identities,
    ownerMeta: () => ({ kind, dotType: '#123456' }),
    UI: { Player: {
      getPrimaryColorValueAsHex() { nativeCalls++; return 255; },
      getSecondaryColorValueAsHex() { nativeCalls++; return 16711680; },
    } },
  });
  vm.runInContext(source.slice(source.indexOf('const PALETTE ='), source.indexOf('// Dual player colors.')), ctx);
  vm.runInContext(['ownerColors', 'unitColor', 'playerBorderColor'].map(slice).join('\n'), ctx);
  return { ctx, identities, nativeCalls: () => nativeCalls, setKind: value => { kind = value; } };
}
function lab(rgb) {
  const [r, g, b] = Array.from(rgb, value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const f = value => value > 216 / 24389 ? Math.cbrt(value) : value * 24389 / 27 / 116 + 16 / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

test('all 63 default countries have distinct, perceptually spaced map colors even when their native civ colors match', t => {
  const { ctx, identities, nativeCalls } = fixture(), before = JSON.stringify([...identities]);
  const colors = Array.from({ length: 63 }, (_, owner) => ctx.ownerColors(owner));
  assert.equal(new Set(colors.map(color => color.primaryCss)).size, 63);
  assert.equal(new Set(colors.map(color => color.secondaryCss)).size, 63);
  let primaryMinimum = Infinity, secondaryMinimum = Infinity;
  const primary = colors.map(color => lab(color.primary)), secondary = colors.map(color => lab(color.secondary));
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
    primaryMinimum = Math.min(primaryMinimum, distance(primary[i], primary[j]));
    secondaryMinimum = Math.min(secondaryMinimum, distance(secondary[i], secondary[j]));
  }
  assert.ok(primaryMinimum >= 20, `primary CIE76 separation ${primaryMinimum}`);
  assert.ok(secondaryMinimum >= 12, `secondary CIE76 separation ${secondaryMinimum}`);
  for (let owner = 0; owner < 63; owner++) {
    assert.equal(ctx.unitColor(owner), colors[owner].primaryCss);
    assert.equal(ctx.playerBorderColor(owner), colors[owner].secondaryCss);
    assert.equal(ctx.ownerColors(owner), colors[owner], 'repeat draws reuse the cached colors');
  }
  ctx.pos = 123; ctx.ownerColorCache.clear();
  assert.deepEqual(Array.from({ length: 63 }, (_, owner) => ctx.ownerColors(owner).primaryCss), colors.map(color => color.primaryCss));
  assert.equal(JSON.stringify([...identities]), before, 'recorded/native identity colors remain unchanged');
  assert.equal(nativeCalls(), 0, 'default major slots do not depend on native color availability');
  t.diagnostic(`63 colors: minimum CIE76 primary ${primaryMinimum.toFixed(2)}, secondary ${secondaryMinimum.toFixed(2)}`);
});

test('independent powers and barbarians retain their existing map styling and native identity colors', () => {
  const { ctx, setKind } = fixture();
  setKind('citystate');
  assert.deepEqual(Array.from(ctx.ownerColors(0).primary), [255, 0, 0]);
  assert.deepEqual(Array.from(ctx.ownerColors(0).secondary), [0, 0, 255]);
  assert.equal(ctx.unitColor(0), '#ffffff');
  assert.equal(ctx.playerBorderColor(0), '#123456');
  setKind('village');
  assert.equal(ctx.unitColor(0), '#e23b3b');
  assert.equal(ctx.playerBorderColor(0), '#5a1010');
});
