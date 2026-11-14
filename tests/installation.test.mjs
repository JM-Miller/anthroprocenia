import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../install-publish.ps1', import.meta.url));
const manifest = (version, id = 'anthroprocenia_map_history') =>
  `<Mod id="${id}" version="${version}" xmlns="ModInfo"><ActionGroups><ActionGroup><Actions><ImportFiles><Item>maps/test.js</Item></ImportFiles></Actions></ActionGroup></ActionGroups></Mod>`;
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'anthro-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'release'), destination = join(root, 'Mods', 'anthroprocenia');
  await mkdir(join(source, 'maps'), { recursive: true });
  await mkdir(join(destination, 'anthroprocenia'), { recursive: true });
  await writeFile(join(source, 'anthroprocenia.modinfo'), manifest(36));
  await writeFile(join(source, 'maps', 'test.js'), '// test release');
  const run = () => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer,
    '-Source', source, '-Destination', destination], { encoding: 'utf8', timeout: 30000 });
  return { root, source, destination, run };
}
test('installer disables stale duplicate identities without deleting files or changing unrelated mods', { skip: process.platform !== 'win32' }, async t => {
  const { root, destination, run } = await fixture(t);
  const legacy = join(destination, 'anthroprocenia', 'anthroprocenia.modinfo');
  await writeFile(legacy, manifest(4));
  await writeFile(legacy + '.disabled', 'previous backup');
  await writeFile(join(destination, 'anthroprocenia', 'old.js'), '// preserve legacy source');
  const other = join(root, 'Mods', 'other');
  await mkdir(other);
  await writeFile(join(other, 'other.modinfo'), manifest(1, 'unrelated'));
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /exactly one active mod identity/);
  assert.ok(!(await readdir(join(destination, 'anthroprocenia'))).includes('anthroprocenia.modinfo'));
  assert.equal(await readFile(legacy + '.disabled.1', 'utf8'), manifest(4));
  assert.equal(await readFile(legacy + '.disabled', 'utf8'), 'previous backup');
  assert.equal(await readFile(join(destination, 'anthroprocenia', 'old.js'), 'utf8'), '// preserve legacy source');
  assert.equal(await readFile(join(other, 'other.modinfo'), 'utf8'), manifest(1, 'unrelated'));
  assert.equal(await readFile(join(destination, 'maps', 'test.js'), 'utf8'), '// test release');
  const again = run();
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.doesNotMatch(again.stdout, /Disabled duplicate/);
});

test('installer refuses newer duplicate releases before copying or disabling anything', { skip: process.platform !== 'win32' }, async t => {
  const { destination, run } = await fixture(t);
  const legacy = join(destination, 'anthroprocenia', 'anthroprocenia.modinfo');
  await writeFile(legacy, manifest(100));
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to replace or disable a newer installation/);
  assert.equal(await readFile(legacy, 'utf8'), manifest(100));
  assert.ok(!(await readdir(destination)).includes('anthroprocenia.modinfo'));
});

test('installer refuses downgrading the primary installation or copying an incomplete release', { skip: process.platform !== 'win32' }, async t => {
  const { source, destination, run } = await fixture(t);
  const active = join(destination, 'anthroprocenia.modinfo');
  await writeFile(active, manifest(100));
  const downgrade = run();
  assert.notEqual(downgrade.status, 0);
  assert.match(downgrade.stderr, /Refusing to replace or disable a newer installation/);
  assert.equal(await readFile(active, 'utf8'), manifest(100));
  await rm(join(source, 'maps', 'test.js'));
  const incomplete = run();
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Release references a missing file/);
  assert.equal(await readFile(active, 'utf8'), manifest(100));
});
