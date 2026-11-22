import { uiGlyph } from './anthroprocenia-ui.js';

export const CIV_SWITCH_PAUSE_STYLES = `
#pause-menu-button-container.anthroprocenia-pause-buttons {
  margin-top: 0 !important;
  padding-top: 2rem;
  padding-bottom: 2rem;
  min-height: 0;
  box-sizing: border-box;
  justify-content: space-between;
}
#pause-menu-button-container.anthroprocenia-pause-buttons .anthroprocenia-pause-row {
  flex: 0 0 2.4444444444rem;
  height: 2.4444444444rem;
  min-height: 2.4444444444rem;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
#pause-menu-button-container.anthroprocenia-pause-buttons .pause-menu-button {
  width: 20rem;
  height: 2.4444444444rem;
  min-height: 2.4444444444rem;
  box-sizing: border-box;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
`;

export function syncCivSwitchPauseMenu(container, document, localize, activate) {
  let button = container.querySelector('#anthroprocenia-switch-civ-button');
  if (!button) {
    button = document.createElement('fxs-button');
    button.id = 'anthroprocenia-switch-civ-button';
    button.classList.add('pause-menu-button');
    button.setAttribute('caption', 'Switch Civilization');
    button.setAttribute('data-tooltip-content', 'Permanently take control of another surviving major civilization. Save first.');
    button.addEventListener('action-activate', activate);
  }
  const nativeButtons = Array.from(container.querySelectorAll('.pause-menu-button,fxs-button')).filter(item => item !== button);
  const caption = item => String(item.getAttribute('caption') || item.textContent || '').replace(/\s+/g, ' ').trim();
  const named = (item, key) => caption(item) === key || caption(item) === localize(key).replace(/\s+/g, ' ').trim();
  const restart = nativeButtons.find(item => named(item, 'LOC_PAUSE_MENU_RESTART'));
  const retire = nativeButtons.find(item => named(item, 'LOC_PAUSE_MENU_RETIRE') || named(item, 'LOC_PAUSE_MENU_NOMORETURNS'));
  // Disabled native buttons can be wrapped by a tooltip.
  const rowOf = item => {
    while (item.parentElement && item.parentElement !== container) item = item.parentElement;
    return item;
  };
  if (restart && retire) {
    const rows = Array.from(container.children), restartRow = rowOf(restart), retireRow = rowOf(retire);
    const later = rows.indexOf(restartRow) > rows.indexOf(retireRow) ? restartRow : retireRow;
    if (button.nextElementSibling !== later) container.insertBefore(button, later);
  } else if (button.parentElement !== container) container.appendChild(button);
  container.classList.add('anthroprocenia-pause-buttons');
  for (const item of [...nativeButtons, button]) rowOf(item).classList.add('anthroprocenia-pause-row');
  return button;
}

function requireSwitchSession(api, state) {
  if (!api || typeof api.setAsLocalPlayer !== 'function') throw new Error('Native civilization switching is unavailable in this game build.');
  if (state.multiplayer !== false || state.hotseat !== false) throw new Error('Civilization switching is only available in single-player, non-hotseat games.');
  if (state.autoplay) throw new Error('Stop autoplay before switching civilizations.');
  if (!Number.isInteger(state.local) || state.local < 0 || state.observer !== state.local ||
      !state.humans.includes(state.local)) throw new Error('Return to your live civilization before switching.');
}

export async function switchLocalCivilization(player, api, getSession) {
  const before = getSession();
  requireSwitchSession(api, before);
  if (!Number.isInteger(player) || !before.alive.includes(player)) throw new Error('Choose a surviving major civilization.');
  if (player === before.local) throw new Error('You are already playing this civilization.');
  // This native method takes the target ID, despite reporting a zero-argument function length.
  api.setAsLocalPlayer(player);
  let after;
  for (let attempt = 0; attempt < 80; attempt++) {
    after = getSession();
    if (after.local === player && after.observer === player && after.humans.includes(player) &&
        !after.humans.includes(before.local) && !after.autoplay && after.turn === before.turn) return;
    if (after.autoplay || after.turn !== before.turn) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Native civilization handoff was not confirmed (local player ${after.local}, turn ${after.turn}). No further handoff was attempted.`);
}

export class CivSwitchPicker {
  constructor({ document, scale, getApi, getSession, map, resume, returnToPause, label, reportError }) {
    Object.assign(this, { document, scale, getApi, getSession, map, resume, returnToPause, label, reportError });
    this.active = false;
    this.target = null;
    this.suppressUntil = 0;
  }
  build() {
    if (this.root) return;
    const root = this.document.createElement('div'), close = this.document.createElement('div');
    root.id = 'anthroprocenia-civ-picker';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Switch civilization');
    root.setAttribute('tabindex', '-1');
    root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:100100;display:none;pointer-events:auto;';
    close.innerHTML = uiGlyph('close');
    close.setAttribute('role', 'button'); close.setAttribute('tabindex', '0');
    close.setAttribute('aria-label', 'Cancel civilization switching');
    close.style.cssText = `position:absolute;left:${this.scale(16)}px;top:${this.scale(16)}px;width:${this.scale(38)}px;height:${this.scale(38)}px;padding:${this.scale(8)}px;box-sizing:border-box;background:#101722;border:1px solid #9d8760;cursor:pointer;`;
    const message = this.document.createElement('div');
    message.style.cssText = `position:absolute;left:${this.scale(66)}px;top:${this.scale(16)}px;max-width:70%;padding:${this.scale(10)}px;background:#101722;color:#e5d2ac;font:${this.scale(15)}px sans-serif;pointer-events:none;`;
    this.caption = this.document.createElement('div'); message.appendChild(this.caption);
    this.error = this.document.createElement('div'); this.error.setAttribute('role', 'alert');
    this.error.style.color = '#ffa38b'; message.appendChild(this.error);
    root.appendChild(close); root.appendChild(message);
    root.addEventListener('mousedown', event => { event.preventDefault(); event.stopImmediatePropagation(); });
    root.addEventListener('mouseup', event => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!this.active) return;
      if (event.button === 2 || event.target === close || close.contains(event.target)) this.cancel();
      else if (event.button === 0 && event.target === root && !this.overControls(event.clientX, event.clientY)) this.choose(event.clientX, event.clientY);
    });
    root.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); });
    root.addEventListener('contextmenu', event => { event.preventDefault(); event.stopImmediatePropagation(); });
    root.addEventListener('mousemove', event => this.hover(event.clientX, event.clientY));
    close.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); }
    });
    this.document.body.appendChild(root);
    this.root = root;
  }
  begin() {
    try {
      if (this.active) return;
      requireSwitchSession(this.getApi(), this.getSession());
      this.build();
      this.error.textContent = '';
      this.target = null;
      this.active = true;
      this.resume();
      this.map.enter();
      this.root.style.display = 'block';
      this.document.body.classList.add('anthroprocenia-civ-picking');
      this.syncUi();
      this.root.focus();
      this.hover(-1, -1);
    } catch (error) {
      if (this.active) this.finish(true);
      this.reportError(error.message || String(error));
    }
  }
  hover(x, y) {
    if (!this.active || this.busy) return;
    const target = this.map.targetAt(x, y);
    if (target !== this.target) { this.target = target; this.map.highlight(target); }
    this.caption.textContent = target === null
      ? 'Click another civilization\'s territory to take permanent control. Your old civilization becomes AI-controlled. Right-click or X to cancel.'
      : `Play as ${this.label(target)}. Left-click to switch; right-click or X to cancel.`;
  }
  async choose(x, y) {
    if (!this.active || this.busy) return;
    try {
      const target = this.map.targetAt(x, y);
      if (target === null) return;
      this.busy = true;
      this.error.textContent = '';
      this.caption.textContent = `Switching to ${this.label(target)}...`;
      await switchLocalCivilization(target, this.getApi(), this.getSession);
      this.finish(false);
    } catch (error) {
      this.error.textContent = error.message || String(error);
      this.reportError(this.error.textContent);
    } finally { this.busy = false; }
  }
  finish(cancelled) {
    this.active = false; this.target = null;
    this.suppressUntil = Date.now() + 500;
    if (this.root) this.root.style.display = 'none';
    this.document.body.classList.remove('anthroprocenia-civ-picking');
    this.syncUi();
    try { this.map.leave(); }
    finally { if (cancelled) this.returnToPause(); }
  }
  cancel() { if (this.active && !this.busy) this.finish(true); }
  syncUi() {
    for (const child of this.document.body.children) {
      const allowed = child === this.root || child.classList.contains('anthro-map-render-layer');
      child.classList.toggle('anthroprocenia-civ-picker-hidden', this.active && !allowed);
    }
  }
  overControls(x, y) {
    return Array.from(this.root.children).some(child => {
      const rect = child.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }
  input(name, finished, x, y) {
    if (!this.active) return Date.now() < this.suppressUntil && /mousebutton|cancel|sys-menu/.test(name);
    if (this.busy) return true;
    if (finished && /^(cancel|sys-menu|mousebutton-right)$/.test(name)) this.cancel();
    else if (finished && name === 'mousebutton-left') {
      const rect = this.root.firstElementChild.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) this.cancel();
      else if (!this.overControls(x, y)) this.choose(x, y);
    }
    return true;
  }
}
