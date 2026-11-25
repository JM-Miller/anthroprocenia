import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const source = await readFile(new URL('../anthroprocenia/ui/narration/anthroprocenia-early-loader.js', import.meta.url), 'utf8');

test('early loading uses only the enabled canonical script and does not load it twice', async () => {
  let scripts = [];
  const loaded = [], events = new Map();
  const context = vm.createContext({
    Modding: { getInitialScripts: () => scripts },
    InitialScriptType: { Default: 0 },
    Controls: { loadSource: (...args) => { loaded.push(args); return Promise.resolve(); } },
    engine: { on: (name, callback) => events.set(name, callback), whenReady: Promise.resolve() },
    console: { warn() {}, error: message => assert.fail(message) },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  assert.equal(loaded.length, 0, 'disabled mods must not be preloaded');
  scripts = [{ url: 'fs://game/anthroprocenia_map_history/ui/narration/anthroprocenia-narrator.js', isModule: true }];
  events.get('InitialScriptAdded')();
  events.get('InitialScriptAdded')();
  assert.deepEqual(loaded, [[scripts[0].url, true]]);
});

test('game-UI patch is idempotent, preserves bytes, and restores without reverting unrelated edits',
  { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'anthro-narration-loader-'));
    try {
      const ui = join(root, 'Base', 'modules', 'base-standard', 'ui');
      await mkdir(ui, { recursive: true });
      const file = join(ui, 'root-game.html');
      const original = Buffer.from('\ufeff<head>\r\n\t\t<script src="/core/ui/component-support.js"></script>\r\n</head>\n');
      await writeFile(file, original);
      const installer = fileURLToPath(new URL('../tools/install-narration-loader.ps1', import.meta.url));
      const run = (...args) => {
        const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer,
          '-GameRoot', root, '-BackupDirectory', join(root, 'backups'), ...args], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.error?.message);
      };
      run();
      const patched = await readFile(file);
      assert.equal(patched.toString().split('id="anthroprocenia-narration-loader"').length - 1, 1);
      run();
      assert.deepEqual(await readFile(file), patched);
      run('-Restore');
      assert.deepEqual(await readFile(file), original);
      run();
      await writeFile(file, Buffer.concat([await readFile(file), Buffer.from('unrelated edit\n')]));
      run('-Restore');
      assert.deepEqual(await readFile(file), Buffer.concat([original, Buffer.from('unrelated edit\n')]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
