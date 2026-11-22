import { REALISTIC_AGES, calendarDateLabel, realisticDate, realisticSpeedMultiplier, realisticAgeTurns } from './anthroprocenia-calendar.js';
import { uiGlyph } from './anthroprocenia-ui.js';

function whole(value, name) {
  if (!/^\d+$/.test(String(value).trim()) || !Number.isSafeInteger(Number(value))) throw new Error(`${name} must be a whole number.`);
  return Number(value);
}
export function skipDuration(mode, age, turns, years, parts, factor = realisticSpeedMultiplier()) {
  let count;
  if (mode === 'turns') count = whole(turns, 'Turns');
  else if (mode === 'calendar') {
    if (!REALISTIC_AGES[age]) throw new Error('Calendar duration is unavailable for this Age; use turns.');
    if (!Number.isInteger(factor) || factor < 1 || factor > 6) throw new Error('Invalid Realistic speed multiplier.');
    const perYear = Math.round(1 / REALISTIC_AGES[age].yearsPerTurn);
    const part = whole(parts, 'Seasons/months');
    if (part >= perYear) throw new Error(`Extra seasons/months must be between 0 and ${perYear - 1}.`);
    count = Math.ceil((whole(years, 'Years') * perYear + part) / factor);
  } else throw new Error('Choose turns or calendar time.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 2147483647) throw new Error('Choose between 1 and 2,147,483,647 turns.');
  return count;
}
export function skipTargetTurn(age, input, part = 0, factor = realisticSpeedMultiplier()) {
  const config = REALISTIC_AGES[age];
  if (!config) throw new Error('Target dates are unavailable for this Age.');
  if (!Number.isInteger(factor) || factor < 1 || factor > 6) throw new Error('Invalid Realistic speed multiplier.');
  const match = /^(-?\d+)\s*(BCE|BC|CE|AD)?$/i.exec(String(input).trim());
  if (!match) throw new Error('Enter a whole year, such as 3000 BCE or 1800 CE.');
  let year = Number(match[1]);
  if (!Number.isSafeInteger(year) || year === 0) throw new Error('Enter a valid year; the calendar has no year zero.');
  if (match[2] && year < 0) throw new Error('Use a positive year with BCE/CE, or a negative year without an era.');
  if (/^(BCE|BC)$/i.test(match[2] || '')) year = -year;
  const parts = Math.round(1 / config.yearsPerTurn);
  if (!Number.isInteger(part) || part < 0 || part >= parts) throw new Error('Choose a valid season or month.');
  const turn = age === 'AGE_ANTIQUITY' ? 4000 + year + (year < 0 ? 1 : 0)
    : (year - (age === 'AGE_EXPLORATION' ? 400 : 1750)) * parts + part + 1;
  if (turn < 1 || turn > config.turns) {
    const lastTurn = Math.ceil(config.turns / factor);
    throw new Error(`Choose a date in this Age: ${calendarDateLabel(realisticDate(age, 1, factor), 1)} to ${calendarDateLabel(realisticDate(age, lastTurn, factor), lastTurn)}.`);
  }
  const accelerated = Math.ceil((turn - 1) / factor) + 1;
  if (accelerated > Math.ceil(config.turns / factor)) throw new Error('That date is beyond the last turn at this speed.');
  return accelerated;
}

export function installSkipAheadDiplomacy({ manager, getController, getState, reportError,
  wait = () => new Promise(resolve => setTimeout(resolve, 25)) }) {
  const original = manager.raiseDiplomacyHub;
  let pending = null;
  manager.raiseDiplomacyHub = function (...args) {
    const controller = getController();
    if (!pending && !controller?.active) return original.apply(this, args);
    if (pending) { pending.args = args; return; }
    const request = pending = { args, receiver: this };
    const restore = async () => {
      try {
        const start = controller.start;
        controller.stop('Stopped Skip Ahead to open diplomacy.');
        for (let attempt = 0; attempt < 80; attempt++) {
          if (controller.state.phase === 'error') throw new Error(controller.state.message);
          const current = getState();
          if (current.age !== start.age || current.multiplayer !== false) throw new Error('The game session changed while returning control.');
          if (!controller.api.isActive && current.player === start.player && current.observer === start.observer) {
            pending = null;
            original.apply(request.receiver, request.args);
            return;
          }
          await wait();
        }
        throw new Error('Native player control was not restored. Return to your civilization before opening diplomacy.');
      } catch (error) {
        reportError(`Unable to open diplomacy: ${error.message || error}`);
      } finally {
        if (pending === request) pending = null;
      }
    };
    return restore();
  };
}

export class SkipAheadController {
  constructor({ engine, getApi, getState, onChange }) {
    this.engine = engine;
    this.getApi = getApi;
    this.getState = getState;
    this.onChange = onChange;
    this.active = false;
    this.state = { phase: 'idle', elapsed: 0, requested: 0, message: '' };
    this.listeners = [];
  }
  publish() { this.onChange({ ...this.state, active: this.active }); }
  listen(name, callback) {
    const handler = data => {
      try { callback(data); }
      catch (error) { this.fail(error); }
    };
    this.listeners.push([name, handler]);
    this.engine.on(name, handler);
  }
  cleanup() {
    for (const [name, handler] of this.listeners) this.engine.off(name, handler);
    this.listeners = [];
  }
  progress() {
    const current = this.getState();
    if (current.age !== this.start.age) return false;
    if (!Number.isInteger(current.turn)) throw new Error('The engine did not provide a valid current turn.');
    this.state.elapsed = Math.max(this.state.elapsed, current.turn - this.start.turn);
    return true;
  }
  begin(turns) {
    skipDuration('turns', '', turns, 0, 0);
    const api = this.getApi(), start = this.getState();
    for (const method of ['setTurns', 'setReturnAsPlayer', 'setObserveAsPlayer', 'setActive', 'setPause']) {
      if (!api || typeof api[method] !== 'function') throw new Error('Native AI autoplay is unavailable in this game session.');
    }
    if (this.active || api.isActive) throw new Error('Autoplay is already running.');
    if (!this.engine || typeof this.engine.on !== 'function' || typeof this.engine.off !== 'function') throw new Error('Native turn events are unavailable.');
    if (start.multiplayer !== false) throw new Error('Skip Ahead is only available in single-player, non-hotseat games.');
    if (!Number.isInteger(start.player) || start.player < 0 || start.observer !== start.player || !start.canStart) throw new Error('Return to the latest live map during your own turn before skipping.');
    if (!Number.isInteger(start.turn) || start.turn < 0 || !Number.isSafeInteger(start.turn + turns)) throw new Error('The engine did not provide a valid starting turn.');
    this.start = { ...start };
    this.api = api;
    this.active = true;
    this.reason = '';
    this.state = { phase: 'running', paused: false, elapsed: 0, requested: turns, message: 'AI simulation is running. Processing real turns can take time.' };
    try {
      this.listen('TurnBegin', () => {
        if (!this.progress()) this.stop('Age transition: return to the game for your Age choices.');
        else if (this.state.elapsed >= turns) this.stop('target');
        else this.publish();
      });
      this.listen('AutoplayEnded', () => this.finish());
      this.listen('GameAgeEnded', () => this.stop('Age ended: return to the game for your Age choices.'));
      this.listen('TeamVictory', () => this.stop('The game ended.'));
      this.listen('PlayerDefeat', data => { if (data && data.player === start.player) this.stop('Your civilization was defeated.'); });
      for (const name of ['LoadComplete', 'GameStarted']) this.listen(name, () => this.stop('The game session changed.'));
      api.setTurns(turns);
      api.setReturnAsPlayer(start.player);
      api.setObserveAsPlayer(start.observer);
      api.setPause(false);
      api.setActive(true);
      if (this.active) this.publish();
    } catch (error) {
      this.fail(error);
      throw new Error(this.state.message);
    }
  }
  togglePause() {
    if (!this.active || this.state.phase !== 'running') return;
    try {
      const paused = !this.state.paused;
      this.api.setPause(paused);
      this.state.paused = paused;
      this.state.message = paused ? 'Autoplay paused. Press the center button to resume.' : 'AI simulation is running. Processing real turns can take time.';
      this.publish();
    } catch (error) { this.fail(error); }
  }
  stop(reason = 'Cancelled. Completed turns are not undone.') {
    if (!this.active || this.state.phase === 'stopping') return;
    this.reason = reason;
    this.state.phase = 'stopping';
    this.state.message = 'Returning control to your civilization...';
    this.publish();
    try {
      this.api.setPause(false);
      this.state.paused = false;
      this.api.setActive(false);
      if (this.active && !this.api.isActive) this.finish();
    } catch (error) { this.fail(error); }
  }
  finish() {
    if (!this.active) return;
    const sameAge = this.progress();
    this.active = false;
    this.cleanup();
    const { elapsed, requested } = this.state;
    if (sameAge && elapsed === requested && (!this.reason || this.reason === 'target')) {
      this.state.phase = 'complete';
      this.state.message = `Completed ${elapsed} turns. Control returned to your civilization.`;
    } else {
      this.state.phase = elapsed > requested ? 'error' : 'stopped';
      this.state.message = elapsed > requested
        ? `The engine advanced ${elapsed} turns, beyond the ${requested}-turn target. Reload your pre-skip save to undo this.`
        : `${this.reason && this.reason !== 'target' ? this.reason : 'Native autoplay ended before reaching the target.'} Advanced ${elapsed} of ${requested} turns.`;
    }
    this.publish();
  }
  fail(error) {
    let message = `Skip Ahead failed: ${error.message || error}`;
    const wasActive = this.active;
    this.active = false;
    this.cleanup();
    if (wasActive && this.api) {
      try { this.api.setActive(false); this.api.setPause(false); }
      catch (stopError) { message += ` Native autoplay could not be stopped: ${stopError.message || stopError}. Use the game's autoplay controls.`; }
    }
    this.state.phase = 'error';
    this.state.message = message;
    this.publish();
  }
}

export function createSkipAheadPanel({ document, scale, getBounds, getState, engine, getApi, getOverlayActive, reportError, onFinished }) {
  const panel = document.createElement('div'), header = document.createElement('div'), body = document.createElement('div');
  panel.id = 'anthroprocenia-skip-ahead-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Skip Ahead');
  panel.style.cssText = `position:fixed;z-index:100047;display:none;flex-direction:column;box-sizing:border-box;background:#101722;border:1px solid #9d8760;border-radius:${scale(8)}px;color:#e5d2ac;font:${scale(14)}px sans-serif;pointer-events:auto;overflow:hidden;`;
  header.classList.add('anthro-panel-heading');
  header.style.cssText = `display:flex;align-items:center;gap:${scale(6)}px;padding:${scale(10)}px;flex:0 0 auto;`;
  body.style.cssText = `padding:${scale(14)}px;overflow:auto;min-height:0;`;
  panel.appendChild(header); panel.appendChild(body);
  let open = false, shown = true, minimized = false, lastError = '', targetTurn = 0, targetAge = '';
  const text = value => { const el = document.createElement('div'); el.textContent = value; el.style.marginBottom = scale(10) + 'px'; body.appendChild(el); return el; };
  const button = (label, action, parent = body) => {
    const el = document.createElement('div');
    el.textContent = label; el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0');
    el.style.cssText = `display:inline-block;padding:${scale(6)}px ${scale(10)}px;border:1px solid #9d8760;border-radius:${scale(4)}px;cursor:pointer;`;
    let released = false;
    const activate = event => {
      if (event.button || (event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key)))) return;
      event.preventDefault(); event.stopPropagation();
      if (event.type === 'click' && released) { released = false; return; }
      if (event.type === 'mouseup') released = true;
      if (el.getAttribute('aria-disabled') !== 'true') action();
    };
    el.walkerActivate = activate;
    el.addEventListener('mousedown', event => { released = false; event.stopPropagation(); });
    for (const type of ['mouseup', 'click', 'keydown']) el.addEventListener(type, activate);
    parent.appendChild(el); return el;
  };
  const title = document.createElement('strong');
  title.textContent = 'Skip Ahead'; title.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  header.appendChild(title);
  const minimize = button('', () => { minimized = !minimized; sync(); }, header);
  const cancel = button('Stop', () => controller.stop(), header);
  cancel.setAttribute('title', 'Stop autoplay and return control');
  const close = button('', () => { open = false; sync(); }, header);
  close.innerHTML = uiGlyph('close'); close.setAttribute('aria-label', 'Close Skip Ahead');
  text('Save first. The AI controls research, spending, diplomacy and wars. Changes are permanent; autoplay stops at an Age transition.').style.cssText = `margin-bottom:${scale(12)}px;color:#b8aa91;font-size:${scale(12)}px;line-height:${scale(17)}px;`;
  const errors = text('');
  errors.setAttribute('role', 'alert');
  errors.style.color = '#ffa38b';
  const showError = error => {
    const message = error.message || String(error);
    errors.textContent = message;
    if (message !== lastError) reportError(message);
    lastError = message;
  };
  const slider = (id, label, changed) => {
    const row = text(''), caption = document.createElement('div'), track = document.createElement('div');
    const fill = document.createElement('div'), thumb = document.createElement('div');
    caption.style.cssText = `margin-bottom:${scale(8)}px;color:#e5d2ac;`;
    track.id = id; track.setAttribute('role', 'slider'); track.setAttribute('tabindex', '0');
    track.setAttribute('aria-label', label); track.setAttribute('aria-orientation', 'horizontal');
    track.style.cssText = `position:relative;height:${scale(18)}px;box-sizing:border-box;border:1px solid #756142;border-radius:${scale(9)}px;background:linear-gradient(180deg,#0b111c,#1d2b3d);cursor:pointer;`;
    fill.style.cssText = `position:absolute;left:0;top:${scale(5)}px;height:${scale(6)}px;background:#a17e45;pointer-events:none;`;
    thumb.style.cssText = `position:absolute;top:${scale(1)}px;width:${scale(14)}px;height:${scale(14)}px;box-sizing:border-box;border:1px solid #e6ce98;border-radius:50%;background:linear-gradient(180deg,#dec38b,#a17e45);transform:translateX(-50%);pointer-events:none;`;
    track.appendChild(fill); track.appendChild(thumb); row.appendChild(caption); row.appendChild(track);
    let min = 0, max = 0, value = 0, disabled = false, dragging = false;
    const move = next => { if (!disabled) changed(Math.max(min, Math.min(max, Math.round(next)))); };
    const fromX = x => { const rect = track.getBoundingClientRect(); if (rect.width > 0) move(min + (max - min) * (x - rect.left) / rect.width); };
    track.addEventListener('mousedown', event => {
      if (event.button || disabled) return;
      event.preventDefault(); event.stopPropagation(); dragging = true; fromX(event.clientX);
    });
    document.addEventListener('mousemove', event => {
      if (!dragging) return;
      if (event.buttons === 0) { dragging = false; return; }
      event.preventDefault(); event.stopPropagation(); fromX(event.clientX);
    }, true);
    document.addEventListener('mouseup', event => {
      if (!dragging) return;
      dragging = false; event.preventDefault(); event.stopPropagation();
    }, true);
    track.addEventListener('keydown', event => {
      const step = Math.max(1, Math.floor((max - min) / 10));
      const next = { ArrowLeft: value - 1, ArrowDown: value - 1, ArrowRight: value + 1, ArrowUp: value + 1, Home: min, End: max, PageDown: value - step, PageUp: value + step }[event.key];
      if (next === undefined) return;
      event.preventDefault(); event.stopPropagation(); move(next);
    });
    return { row, stop() { dragging = false; }, set(low, high, current, description, off, captionLabel = label) {
      min = low; max = high; value = current; disabled = off || min >= max;
      if (disabled) dragging = false;
      caption.textContent = `${captionLabel}: ${description}`;
      track.setAttribute('aria-label', captionLabel);
      const percent = max > min ? 100 * (value - min) / (max - min) : 0;
      fill.style.width = thumb.style.left = percent + '%';
      track.setAttribute('aria-valuemin', String(min)); track.setAttribute('aria-valuemax', String(max));
      track.setAttribute('aria-valuenow', String(value)); track.setAttribute('aria-valuetext', description);
      track.setAttribute('aria-disabled', String(disabled)); track.style.opacity = disabled ? '0.5' : '1';
    } };
  };
  const yearSlider = slider('anthro-skip-target-year', 'Target year', year => {
    const state = getState(), parts = partsPerYear(state.age), factor = realisticSpeedMultiplier();
    const part = ((targetTurn - 1) * factor) % parts;
    targetTurn = Math.min(realisticAgeTurns(state.age), Math.max(state.turn + 1, Math.ceil((year * parts + part) / factor) + 1)); preview(true);
  });
  const inputRow = text(''), inputLabel = document.createElement('label'), yearInput = document.createElement('input');
  yearInput.id = 'anthro-skip-custom-year'; yearInput.type = 'text';
  yearInput.setAttribute('aria-label', 'Custom target year'); yearInput.setAttribute('placeholder', '3000 BCE or 1800 CE');
  inputLabel.setAttribute('for', yearInput.id); inputLabel.textContent = 'Custom target year ';
  yearInput.style.cssText = `width:${scale(160)}px;padding:${scale(7)}px;color:#fff;background:#101622;border:1px solid #9d8760;pointer-events:auto;user-select:text;`;
  inputRow.appendChild(inputLabel); inputRow.appendChild(yearInput);
  const partSlider = slider('anthro-skip-target-part', 'Season / month', part => {
    const age = getState().age, parts = partsPerYear(age), factor = realisticSpeedMultiplier();
    const index = Math.floor((targetTurn - 1) * factor / parts) * parts + part;
    targetTurn = Math.min(realisticAgeTurns(age), Math.ceil(index / factor) + 1); preview(true);
  });
  const estimate = text(''), progress = text('');
  progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite');
  function partsPerYear(age) {
    if (!REALISTIC_AGES[age]) throw new Error('Target dates are unavailable for this Age.');
    return Math.round(1 / REALISTIC_AGES[age].yearsPerTurn);
  }
  function duration(state) {
    if (!state.realistic) throw new Error('Target dates require the Realistic calendar.');
    if (state.age !== targetAge) throw new Error('The Age changed. Reopen Skip Ahead to choose a new target.');
    if (targetTurn <= state.turn) throw new Error('Choose a date later than the current date.');
    return skipDuration('turns', '', targetTurn - state.turn, 0, 0);
  }
  function preview(updateInput = false, validate = true) {
    try {
      const state = getState(), parts = partsPerYear(state.age), config = REALISTIC_AGES[state.age], factor = realisticSpeedMultiplier();
      const index = (targetTurn - 1) * factor, currentIndex = Math.max(0, state.turn - 1) * factor;
      const year = Math.floor(index / parts), part = index % parts;
      const date = realisticDate(state.age, targetTurn), yearText = date.replace(/^[A-Za-z]+\s+/, '');
      yearSlider.set(Math.min(Math.floor(currentIndex / parts), config.turns / parts - 1), config.turns / parts - 1, year, calendarDateLabel(yearText, targetTurn), controller.active);
      partSlider.row.style.display = parts > 1 ? 'block' : 'none';
      partSlider.set(year === Math.floor(currentIndex / parts) ? currentIndex % parts : 0, parts - 1, part, date.split(' ')[0], controller.active, parts === 4 ? 'Season' : 'Month');
      if (updateInput) yearInput.value = yearText;
      yearInput.disabled = controller.active;
      const turns = validate ? duration(state) : Math.max(0, targetTurn - state.turn);
      estimate.textContent = `Target: ${calendarDateLabel(date, targetTurn)}. ${turns} real turns.`;
      submit.setAttribute('aria-disabled', String(controller.active || !state.realistic || targetAge !== state.age || targetTurn <= state.turn));
      errors.textContent = ''; lastError = '';
    } catch (error) { estimate.textContent = ''; submit.setAttribute('aria-disabled', 'true'); showError(error); }
  }
  yearInput.addEventListener('input', () => {
    try {
      const state = getState(), parts = partsPerYear(state.age), factor = realisticSpeedMultiplier();
      const part = ((targetTurn - 1) * factor) % parts;
      targetTurn = skipTargetTurn(state.age, yearInput.value, part);
      if (targetTurn <= state.turn && Math.floor((targetTurn - 1) * factor / parts) === Math.floor(state.turn * factor / parts)) targetTurn = state.turn + 1;
      preview();
    } catch (error) { estimate.textContent = ''; submit.setAttribute('aria-disabled', 'true'); showError(error); }
  });
  yearInput.addEventListener('mousedown', event => { event.stopPropagation(); yearInput.focus(); });
  const submit = button('Begin Autoplay', () => {
    try { controller.begin(duration(getState())); if (controller.active) { minimized = true; sync(); } }
    catch (error) { showError(error); }
  });
  const pause = button('', () => controller.togglePause(), document.body);
  pause.id = 'anthroprocenia-skip-ahead-pause';
  pause.style.cssText = `position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100061;display:none;align-items:center;justify-content:center;box-sizing:border-box;width:${scale(60)}px;height:${scale(60)}px;border:2px solid #cfe3ff;border-radius:50%;background:rgba(16,22,34,0.96);cursor:pointer;pointer-events:auto;`;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), glyph = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('width', String(scale(28))); icon.setAttribute('height', String(scale(28)));
  icon.setAttribute('aria-hidden', 'true'); icon.style.pointerEvents = 'none';
  glyph.setAttribute('fill', '#cfe3ff'); icon.appendChild(glyph); pause.appendChild(icon);
  let pauseKey = '';
  function syncPause() {
    const visible = controller.active && !!getApi().isActive && !getOverlayActive();
    pause.style.display = visible ? 'flex' : 'none';
    const key = controller.state.paused ? 'paused' : 'running';
    if (key === pauseKey) return;
    pauseKey = key;
    glyph.setAttribute('d', key === 'paused' ? 'M6 3L21 12L6 21Z' : 'M5 3H10V21H5ZM14 3H19V21H14Z');
    pause.setAttribute('aria-label', key === 'paused' ? 'Resume Skip Ahead autoplay' : 'Pause Skip Ahead autoplay');
    pause.setAttribute('title', key === 'paused' ? 'Resume autoplay' : 'Pause autoplay');
    pause.setAttribute('aria-pressed', String(key === 'paused'));
  }
  const controller = new SkipAheadController({ engine, getApi, getState, onChange: state => {
    progress.textContent = `${state.elapsed} / ${state.requested} turns. ${state.message}`;
    if (state.phase === 'error') { minimized = false; open = true; }
    if (targetAge !== getState().age) {
      const current = getState(), config = REALISTIC_AGES[current.age];
      targetAge = current.age; targetTurn = config ? Math.min(realisticAgeTurns(current.age), current.turn + 50) : 0;
    }
    preview(true, false);
    sync();
    if (state.phase === 'error') showError(new Error(state.message));
    if (!state.active) onFinished(state);
  } });
  cancel.setAttribute('aria-disabled', 'true');
  for (const type of ['mousedown', 'mouseup', 'click', 'wheel', 'keydown', 'keyup']) panel.addEventListener(type, event => {
    event.stopPropagation();
    if (type === 'keydown' && event.key === 'Escape') { open = false; sync(); event.preventDefault(); }
  });
  document.body.appendChild(panel);
  function sync(visible = shown) {
    shown = visible;
    syncPause();
    panel.style.display = open && shown ? 'flex' : 'none';
    body.style.display = minimized ? 'none' : 'block';
    if (!open || !shown || minimized) { yearSlider.stop(); partSlider.stop(); }
    minimize.innerHTML = uiGlyph(minimized ? 'maximize' : 'minimize');
    minimize.setAttribute('aria-label', `${minimized ? 'Restore' : 'Minimize'} Skip Ahead`);
    minimize.setAttribute('aria-expanded', String(!minimized));
    cancel.style.display = controller.active ? 'block' : 'none';
    cancel.setAttribute('aria-disabled', String(!controller.active));
    title.textContent = minimized && controller.active ? `Autoplay: ${realisticDate(targetAge, targetTurn)} (${controller.state.elapsed}/${controller.state.requested})`
      : minimized && controller.state.phase === 'complete' ? 'Autoplay complete'
        : minimized && controller.state.phase === 'stopped' ? 'Autoplay stopped' : 'Skip Ahead';
    if (!open || !shown) return;
    const area = getBounds(), width = Math.min(scale(460), area.width - scale(16));
    panel.style.width = width + 'px'; panel.style.left = (area.width - width) / 2 + 'px';
    panel.style.top = scale(80) + 'px'; panel.style.maxHeight = Math.max(scale(100), area.height - scale(100)) + 'px';
  }
  return { element: panel, pauseElement: pause, controller, sync, toggle() {
    open = !open;
    if (open && !controller.active) {
      const state = getState(), config = REALISTIC_AGES[state.age];
      targetAge = state.age; targetTurn = config ? Math.min(realisticAgeTurns(state.age), state.turn + 50) : 0;
      minimized = false; preview(true);
    }
    sync();
  } };
}
