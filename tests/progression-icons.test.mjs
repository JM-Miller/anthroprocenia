import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = path.join(root, 'anthroprocenia');
const base = process.env.CIV7_BASE ||
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Sid Meier's Civilization VII\\Base";
const nativePath = path.join(base, 'modules', 'core', 'ui', 'utilities', 'utilities-image.js');
const scriptPath = path.join(mod, 'ui', 'progression', 'anthroprocenia-progression-icons.js');
const script = fs.readFileSync(scriptPath, 'utf8').replace(/^import .*;\r?\n/gm, '');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'progression-inventory.json'), 'utf8'));
const registered = new Map();
for (const name of ['civilization-icons.xml', 'progression-icons.xml']) {
    const xml = fs.readFileSync(path.join(mod, 'data', name), 'utf8');
    for (const match of xml.matchAll(/<Row\b[^>]*\bID="([^"]+)"[^>]*\bPath="([^"]+)"[^>]*\/>/g)) {
        registered.set(match[1], match[2]);
    }
}
const originals = inventory.originals.filter(row => row.ProgressionTreeNodeType.startsWith('NODE_ANTHRO_'));
const added = inventory.nodes.map(row => ({
    ProgressionTreeNodeType: row.node, ProgressionTree: row.tree, IconString: row.node, CivInjectedIcon: false,
}));
const trees = [...new Map(originals.map(row => [row.ProgressionTree, {
    ProgressionTreeType: row.ProgressionTree, IconString: row.IconString,
}])).values()];

function harness() {
    const calls = [];
    const nodes = new Map([...originals, ...added].map(row => [row.ProgressionTreeNodeType, row]));
    const context = vm.createContext({
        console,
        GameInfo: {
            ProgressionTreeNodes: { lookup: id => nodes.get(id) },
            Civilizations: { lookup: () => ({ CivilizationType: 'CIVILIZATION_ROME' }) },
        },
        Players: { get: () => ({ civilizationType: 'CIVILIZATION_ROME' }) },
        GameContext: { localPlayerID: 0 },
        UI: { getIconURL(id) { calls.push(id); return registered.get(id) || 'blp:unknown_complete'; } },
    });
    const native = fs.readFileSync(nativePath, 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/^export \{ Icon \};/m, '');
    vm.runInContext(native, context, { filename: nativePath });
    const before = { ...context.Icon };
    vm.runInContext(script, context, { filename: scriptPath });
    return { context, nodes, calls, before, icon: context.Icon };
}

function assertMountedPNG(url) {
    assert.match(url, /^fs:\/\/game\/anthroprocenia\/.+\.png$/);
    const filename = path.join(mod, ...url.slice('fs://game/anthroprocenia/'.length).split('/'));
    assert.deepEqual(fs.readFileSync(filename).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

test('all original and added Anthro research icons resolve through registered mounted PNGs', () => {
    const { icon, calls, context, nodes } = harness();
    for (const row of [...originals, ...added]) {
        const expected = registered.get(row.IconString);
        assertMountedPNG(expected);
        assert.equal(icon.getCultureIconFromProgressionTreeNodeDefinition(row), expected, row.ProgressionTreeNodeType);
        assert.equal(icon.getTechIconFromProgressionTreeNodeDefinition(row), expected, row.ProgressionTreeNodeType);
    }
    const pictish = originals.find(row => row.ProgressionTreeNodeType === 'NODE_ANTHRO_PICTISH_1');
    assert.ok(pictish);
    nodes.set(12345, pictish);
    assert.equal(icon.getCultureIconFromProgressionTreeNodeDefinition({
        ProgressionTreeNodeType: 12345, IconString: 'stale-icon',
    }), registered.get(pictish.IconString), 'the canonical GameInfo definition is used, including hashed IDs');
    assert.equal(calls.at(-1), pictish.IconString);
    assert.equal(context.UI.getIconURL('native_missing'), 'blp:unknown_complete');
});

test('Anthro civilization tree emblems resolve through IconDefinitions rather than blp', () => {
    const { icon, calls } = harness();
    assert.equal(trees.length, 47);
    for (const row of trees) {
        const url = icon.getCultureIconFromProgressionTreeDefinition(row);
        assert.equal(url, registered.get(row.IconString), row.ProgressionTreeType);
        assertMountedPNG(url);
        assert.equal(calls.at(-1), row.IconString);
    }
});

test('native definitions, CivInjectedIcon and failed custom lookups retain native behavior', () => {
    const { icon, before, nodes, calls, context } = harness();
    const methods = ['getCultureIconFromProgressionTreeNodeDefinition', 'getTechIconFromProgressionTreeNodeDefinition'];
    const examples = [
        { ProgressionTreeNodeType: 'NODE_TECH_AQ_WRITING', IconString: 'tech_writing' },
        { ProgressionTreeNodeType: 'NODE_NATIVE_CUSTOM_LOOKING', IconString: added[0].IconString },
        { ProgressionTreeNodeType: 'NODE_ANTHRO_NATIVE_ICON', IconString: 'cult_rome' },
        { ProgressionTreeNodeType: 'NODE_ANTHRO_INJECTED', IconString: added[0].IconString, CivInjectedIcon: true },
        { ProgressionTreeNodeType: 'NODE_ANTHRO_MISSING_ICON', IconString: 'NODE_ANTHRO_UNREGISTERED' },
        { ProgressionTreeNodeType: 'NODE_ANTHRO_EMPTY_ICON', IconString: '' },
    ];
    for (const row of examples) {
        nodes.set(row.ProgressionTreeNodeType, row);
        for (const method of methods) {
            assert.equal(icon[method](row), before[method](row), `${method}: ${row.ProgressionTreeNodeType}`);
        }
    }
    assert.equal(icon.getCultureIconFromProgressionTreeNodeDefinition(examples[3]), 'fs://game/cult_rome');
    assert.ok(!calls.includes(added[0].IconString), 'native IDs and injected icons bypass custom lookup');
    const missing = { ProgressionTreeNodeType: 'NODE_DOES_NOT_EXIST' };
    for (const method of methods) assert.equal(icon[method](missing), before[method](missing));
    for (const row of [
        { ProgressionTreeType: 'TREE_CIVICS_AQ_ROME', IconString: 'cult_rome' },
        { ProgressionTreeType: 'TREE_NATIVE_CUSTOM_LOOKING', IconString: trees[0].IconString },
        { ProgressionTreeType: 'TREE_ANTHRO_BAD', IconString: 'cult_anthro_unregistered' },
        { ProgressionTreeType: 'TREE_ANTHRO_EMPTY', IconString: '' },
    ]) {
        assert.equal(icon.getCultureIconFromProgressionTreeDefinition(row),
            before.getCultureIconFromProgressionTreeDefinition(row));
    }
    for (const result of ['blp:unknown_complete', 'fs://game/another-mod/icon.png', '', null]) {
        context.UI.getIconURL = () => result;
        assert.equal(icon.getCultureIconFromProgressionTreeNodeDefinition(originals[0]),
            before.getCultureIconFromProgressionTreeNodeDefinition(originals[0]));
    }
    context.UI.getIconURL = () => { throw new Error('icons unavailable'); };
    assert.equal(icon.getCultureIconFromProgressionTreeNodeDefinition(originals[0]),
        before.getCultureIconFromProgressionTreeNodeDefinition(originals[0]));
});

test('bridge installation is idempotent and changes only the three research helpers', () => {
    const { context, icon, before } = harness();
    const installed = { ...icon };
    vm.runInContext(`{ ${script} }`, context, { filename: scriptPath });
    const changed = Object.keys(icon).filter(name => icon[name] !== before[name]).sort();
    assert.deepEqual(changed, [
        'getCultureIconFromProgressionTreeDefinition',
        'getCultureIconFromProgressionTreeNodeDefinition',
        'getTechIconFromProgressionTreeNodeDefinition',
    ]);
    for (const name of Object.keys(installed)) assert.equal(icon[name], installed[name]);
    const manifest = fs.readFileSync(path.join(mod, 'anthroprocenia.modinfo'), 'utf8');
    const group = manifest.match(/<ActionGroup id="progression-expansion"[\s\S]*?<\/ActionGroup>/)?.[0];
    assert.match(group, /<UIScripts><Item>ui\/progression\/anthroprocenia-progression-icons\.js<\/Item><\/UIScripts>/);
});

test('installed tree-grid consumers delegate research images to the patched shared helpers', () => {
    const read = relative => fs.readFileSync(path.join(base, 'modules', 'base-standard', ...relative.split('/')), 'utf8');
    for (const [kind, helper] of [
        ['culture', 'getCultureIconFromProgressionTreeNodeDefinition'],
        ['tech', 'getTechIconFromProgressionTreeNodeDefinition'],
    ]) {
        const chooser = read(`ui-next/screens/choosers/${kind}-chooser/${kind}-chooser.js`);
        assert.match(chooser, new RegExp(`iconCallback:\\s*Icon\\.${helper}`));
        const model = read(`ui/${kind}-tree/model-${kind}-tree.js`);
        assert.match(model, /delegateGetIconPath:\s*this\.iconCallback/);
    }
    const grid = read('ui/tree-grid/tree-grid.js');
    assert.match(grid, /this\.delegateGetIconPath\(nodeInfo\)/);
    for (const relative of ['ui/tree-grid/tree-grid.js', 'ui/tree-grid/tree-card.js', 'ui/tree-grid/tree-card-v2.js']) {
        assert.doesNotMatch(read(relative), /blp:[^\r\n]*IconString/);
    }
});
