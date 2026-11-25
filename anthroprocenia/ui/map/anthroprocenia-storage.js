const STORE_NS = 'CivAnthroprocenia__';
const LEGACY_STORE_NS = ['CivRew', 'ind__'].join('');

export function replayStorageScope(game, context) {
  if (!game || typeof game.isAnyMultiplayer !== 'boolean') throw new Error('Multiplayer status is unavailable.');
  if (!game.isAnyMultiplayer && game.isHotseat !== true) return '';
  const observer = context && context.localObserverID;
  if (!Number.isInteger(observer) || observer < 0 || observer > 63) throw new Error('Replay observer is unavailable.');
  return `observer${observer}__`;
}

// Never import ambiguous legacy fog, commands or names into another player's history.
export function createReplayStore(getConfiguration, getContext) {
  const written = new Map();
  const scope = () => replayStorageScope(getConfiguration().getGame(), getContext());
  const physicalKey = (key, owner) => {
    if (!key.startsWith(STORE_NS)) throw new Error('Unexpected replay storage key.');
    return STORE_NS + owner + key.slice(STORE_NS.length);
  };
  return {
    scope,
    clear() { written.clear(); },
    read(key) {
      const game = getConfiguration().getGame(), owner = scope();
      if (!game || typeof game.getValue !== 'function') throw new Error('Replay storage is unavailable.');
      const value = game.getValue(physicalKey(key, owner));
      if (!owner && (value == null || value === '')) {
        const legacy = game.getValue(LEGACY_STORE_NS + key.slice(STORE_NS.length));
        if (legacy != null && legacy !== '') return legacy;
      }
      return value;
    },
    write(key, value) {
      const owner = scope(), physical = physicalKey(key, owner);
      if (written.has(physical) && written.get(physical) === value) return true;
      const game = getConfiguration().editGame();
      if (!game || typeof game.setValue !== 'function') throw new Error('Replay storage is unavailable.');
      game.setValue(physical, value);
      written.delete(physical);
      written.set(physical, value);
      if (written.size > 16) written.delete(written.keys().next().value);
      return true;
    },
  };
}
