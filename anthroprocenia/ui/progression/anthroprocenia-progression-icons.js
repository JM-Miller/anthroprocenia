import { Icon } from '/core/ui/utilities/utilities-image.js';

const installed = Symbol.for('anthroprocenia.progression-icons');

function customIconURL(definition, prefix) {
    if (!definition || !definition[prefix.field]?.startsWith(prefix.value) || definition.CivInjectedIcon) {
        return null;
    }
    const id = definition.IconString;
    if (!id?.startsWith('NODE_ANTHRO_') && !id?.startsWith('cult_anthro_')) {
        return null;
    }
    try {
        const url = UI.getIconURL(id);
        if (typeof url === 'string' && url.startsWith('fs://game/anthroprocenia/')) return url;
        console.error(`[Anthroprocenia progression] Missing registered artwork for ${id}; retaining native icon.`);
    } catch (error) {
        console.error(`[Anthroprocenia progression] Artwork lookup failed for ${id}: ${error.message}`);
    }
    return null;
}

for (const name of [
    'getCultureIconFromProgressionTreeNodeDefinition',
    'getTechIconFromProgressionTreeNodeDefinition',
    'getCultureIconFromProgressionTreeDefinition',
]) {
    const original = Icon[name];
    if (typeof original !== 'function' || original[installed]) {
        continue;
    }
    const tree = name === 'getCultureIconFromProgressionTreeDefinition';
    const wrapped = function (definition, ...args) {
        const info = tree ? definition : GameInfo.ProgressionTreeNodes.lookup(definition?.ProgressionTreeNodeType);
        const url = customIconURL(info, tree
            ? { field: 'ProgressionTreeType', value: 'TREE_ANTHRO_' }
            : { field: 'ProgressionTreeNodeType', value: 'NODE_ANTHRO_' });
        return url ?? original.call(this, definition, ...args);
    };
    wrapped[installed] = true;
    Icon[name] = wrapped;
}
