const GLYPHS = {
  close: 'M4 4L16 16M16 4L4 16',
  minimize: 'M4 15H16',
  maximize: 'M4 4H16V16H4ZM4 7H16',
  fit: 'M3 8V3H8M12 3H17V8M17 12V17H12M8 17H3V12',
  previous: 'M13 3L6 10L13 17',
  next: 'M7 3L14 10L7 17',
  zoomIn: 'M13 13L18 18M8 4V12M4 8H12M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8',
  zoomOut: 'M13 13L18 18M4 8H12M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8',
  pin: 'M7 2H13L12 8L16 12H4L8 8ZM10 12V19',
  move: 'M10 2V18M2 10H18M7 5L10 2L13 5M15 7L18 10L15 13M13 15L10 18L7 15M5 13L2 10L5 7',
  history: 'M3 7A7 7 0 1 1 3 13M3 3V7H7M10 6V10L13 12',
  regions: 'M2 5L7 2L13 5L18 2V16L13 19L7 16L2 19ZM7 2V16M13 5V19M2 10L7 13L13 10L18 13',
  island: 'M2 16Q6 12 10 14Q14 12 18 16M2 19Q6 16 10 18Q14 16 18 19M10 14V5M5 6Q7 2 10 5Q13 2 16 6M10 5L6 10M10 5L14 10',
  water: 'M2 5Q6 1 10 5Q14 9 18 5M2 11Q6 7 10 11Q14 15 18 11M2 17Q6 13 10 17Q14 21 18 17',
  river: 'M6 2C18 6 2 9 12 13S14 17 10 19M10 2C22 6 6 9 16 13S18 17 14 19',
  mountains: 'M1 17L7 4L13 17ZM10 11L14 3L19 17H13M5 8L7 10L9 8',
  continent: 'M3 6L8 2L15 3L18 8L14 10L13 15L9 18L6 13L3 11ZM5 7L10 6L13 8L10 11L9 15',
  people: 'M7 6A3 3 0 1 0 13 6A3 3 0 1 0 7 6M3 18V16A7 5 0 0 1 17 16V18Z',
  settlement: 'M2 9L10 2L18 9M4 8V18H16V8M8 18V12H12V18',
  territory: 'M5 19V2M5 3H17L14 7L17 11H5',
  clear: 'M4 5H16M8 5V3H12V5M5 5L6 17H14L15 5M8 8V14M12 8V14',
  search: 'M13 13L18 18M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8',
};
export function uiGlyph(kind, slashed = false, size = 16) {
  if (!GLYPHS[kind]) throw new Error(`Unknown mod UI icon: ${kind}`);
  return `<svg aria-hidden="true" data-anthro-glyph="${kind}" viewBox="0 0 20 20" style="width:${size}px;height:${size}px;pointer-events:none;vertical-align:middle" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS[kind]}"/>${slashed ? '<path d="M3 3L17 17" stroke="#101722" stroke-width="4"/><path d="M3 3L17 17"/>' : ''}</svg>`;
}
export function updateMapLoadingStatus(document, slot, stages, scale, bounds, occupied) {
  if (!stages.length) {
    if (slot && slot.el.style.display !== 'none') slot.el.style.display = 'none';
    return slot;
  }
  if (!slot) {
    const el = document.createElement('div'), icon = document.createElement('span'), text = document.createElement('span');
    el.id = 'anthroprocenia-map-loading-status';
    el.classList.add('anthro-map-chrome', 'anthro-history-ui');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true');
    el.style.cssText = `position:fixed;transform:translateX(-50%);z-index:100046;display:none;align-items:center;justify-content:center;gap:${8 * scale}px;max-width:45vw;padding:0;font:${12 * scale}px Title,serif;pointer-events:none;`;
    icon.innerHTML = uiGlyph('history', false, 22 * scale);
    icon.style.cssText = 'display:flex;flex:0 0 auto;pointer-events:none;animation:anthro-loading-spin 2s linear infinite;';
    text.style.pointerEvents = 'none';
    el.appendChild(icon); el.appendChild(text); document.body.appendChild(el);
    slot = { el, text, key: '' };
  }
  const caption = `Loading: ${stages.join(' | ')}`;
  if (slot.key !== caption) { slot.text.textContent = caption; slot.key = caption; }
  if (slot.el.style.display !== 'flex') slot.el.style.display = 'flex';
  const padding = 12 * scale, size = slot.el.getBoundingClientRect();
  const width = size.width, height = Math.max(22 * scale, size.height), center = bounds.x + bounds.w / 2;
  let top = bounds.y + bounds.h - padding - height;
  for (let pass = 0; pass <= occupied.length; pass++) {
    const overlap = occupied.filter(rect => center + width / 2 + padding > rect.left &&
      center - width / 2 - padding < rect.right && top + height + padding > rect.top && top - padding < rect.bottom);
    if (!overlap.length) break;
    top = Math.min(...overlap.map(rect => rect.top - padding - height));
  }
  if (top < bounds.y + padding) slot.el.style.display = 'none';
  const left = `${center}px`, y = `${top}px`;
  if (slot.el.style.left !== left) slot.el.style.left = left;
  if (slot.el.style.top !== y) slot.el.style.top = y;
  return slot;
}
export function enhanceModButton(button, compose) {
  const caption = button.getAttribute('caption') || button.textContent.trim();
  const symbols = { X: ['close', 'Close this window'], '[]': ['fit', 'Fit the whole view'], '+': ['zoomIn', 'Zoom in'], '-': ['zoomOut', 'Zoom out'], '\u25c0': ['previous', 'Previous'], '\u25b6': ['next', 'Next'] };
  const symbol = symbols[caption];
  const label = button.getAttribute('title') || button.getAttribute('aria-label') || (symbol ? symbol[1] : compose(caption));
  if (label) {
    if (!button.getAttribute('title')) button.setAttribute('title', label);
    if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', label);
    if (button.getAttribute('data-tooltip-content') !== label) button.setAttribute('data-tooltip-content', label);
  }
  if (symbol && button.tagName !== 'FXS-BUTTON' && !button.querySelector('svg,img')) button.innerHTML = uiGlyph(symbol[0]);
  if ((symbol && symbol[0] === 'close') || button.querySelector('svg[data-anthro-glyph="close"]')) {
    if (button.getAttribute('data-anthro-close') !== 'true') button.setAttribute('data-anthro-close', 'true');
  }
}
export function installModUi(document, rootClass, compose, closeSize = 32) {
  if (document.getElementById('anthroprocenia-native-controls-style')) return;
  const style = document.createElement('style');
  style.id = 'anthroprocenia-native-controls-style';
  const roots = `.${rootClass}`;
  style.textContent = `
${roots},${roots} button,${roots} [role="button"],${roots} fxs-button,${roots} fxs-activatable {
  text-shadow:-1px 0 0 #080b10,1px 0 0 #080b10,0 -1px 0 #080b10,0 1px 0 #080b10,0 2px 2px #080b10!important;
}
${roots} button,${roots} [role="button"],${roots} fxs-button,${roots} fxs-activatable { font-weight:700!important; }
${roots} button { appearance:none!important;box-sizing:border-box;font-family:Title,serif!important;color:#e5d2ac!important;background:transparent!important;border:1px solid transparent!important;border-image-source:url("fs://game/base_button-bg.png")!important;border-image-slice:24 50 24 50 fill!important;border-image-width:12px 24px!important;border-image-outset:2px 4px!important;min-height:26px;padding:5px 10px;cursor:pointer; }
${roots} button:hover,${roots} button:focus { border-image-source:url("fs://game/base_button-bg-focus.png")!important; }
${roots} button:active { border-image-source:url("fs://game/base_button-bg-press.png")!important; }
${roots} button:disabled,${roots} [aria-disabled="true"] { opacity:0.45;cursor:default; }
${roots} input,${roots} select,${roots} textarea { appearance:none!important;background:#101722!important;color:#e5d2ac!important;border:1px solid #8e7c58!important;border-radius:3px;box-sizing:border-box; }
#anthroprocenia-panel,#anthroprocenia-playback-panel,#anthroprocenia-population-panel,#anthroprocenia-regions-panel,#anthroprocenia-leaders-panel,#anthroprocenia-family-panel,#anthroprocenia-civ-timeline,#anthroprocenia-command-panel,#anthroprocenia-command-menu,#anthroprocenia-clump-panel,#anthroprocenia-skip-ahead-panel {
  background:linear-gradient(180deg,#223047,#101722)!important;
  border:1px solid #c0a16a!important;border-radius:8px!important;
  box-shadow:inset 0 0 0 3px #101722,inset 0 0 0 4px #65553c,0 6px 24px rgba(0,0,0,0.65)!important;
  color:#e5d2ac!important;
}
#anthroprocenia-map-loading-status { background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;color:#e5d2ac!important; }
@keyframes anthro-loading-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
.${rootClass} .anthro-person-panel-header,.${rootClass} .anthro-panel-heading {
  background:linear-gradient(90deg,rgba(157,135,96,0.28),rgba(22,32,49,0.2),rgba(157,135,96,0.28))!important;
  border-bottom:1px solid #9d8760!important;
  box-shadow:inset 0 2px 0 #e1c58e,inset 0 -3px 0 rgba(5,9,16,0.65)!important;
  color:#f0d9a8!important;font-family:Title,serif!important;letter-spacing:0.6px;
}
.${rootClass} .anthro-panel-heading strong,.${rootClass} .anthro-person-panel-header strong { color:#f0d9a8; }
#anthroprocenia-history-button > svg { display:block;width:76%!important;height:76%!important;flex:0 0 auto; }
.${rootClass} .anthro-regions-circle { border-image:none!important;border:1px solid #6a88bb!important;background:#1a2638!important;min-height:0; }
${roots}[data-anthro-close="true"],${roots} [data-anthro-close="true"],[id^="anthroprocenia-"][data-anthro-close="true"],[id^="anthroprocenia-"] [data-anthro-close="true"] {
  box-sizing:border-box!important;flex:0 0 ${closeSize}px!important;width:${closeSize}px!important;height:${closeSize}px!important;
  min-width:${closeSize}px!important;max-width:${closeSize}px!important;min-height:${closeSize}px!important;max-height:${closeSize}px!important;
  padding:0!important;border-radius:50%!important;border:1px solid #ff9a9f!important;border-image:none!important;
  background:#c0262d!important;color:#fff!important;line-height:1!important;cursor:pointer;
}
[data-anthro-close="true"]:hover,[data-anthro-close="true"]:focus { background:#e1353e!important;outline:2px solid #ffd1d4;outline-offset:2px; }
[data-anthro-close="true"]:active { background:#941b22!important; }
[data-anthro-close="true"] > svg { display:block;width:100%!important;height:100%!important;box-sizing:border-box;padding:25%; }
#anthroprocenia-regions-panel button[aria-pressed] { border-image:none!important;border:0!important;border-bottom:1px solid #65553c!important; }
#anthroprocenia-regions-panel button[aria-pressed="true"] { background:linear-gradient(90deg,rgba(157,135,96,0.42),rgba(22,32,49,0.3))!important;box-shadow:inset 3px 0 #e1c58e; }
#anthroprocenia-regions-panel button[aria-pressed]:hover,#anthroprocenia-regions-panel button[aria-pressed]:focus { outline:1px solid #c0a16a;outline-offset:-2px; }
.${rootClass} [role="slider"]:focus { outline:1px solid #e6ce98; }
`;
  document.head.appendChild(style);
  const selector = 'button,[role="button"],fxs-button,fxs-activatable';
  const rootSelector = `.${rootClass},[id^="anthroprocenia-"]`;
  const owned = node => !!(node && typeof node.closest === 'function' && node.closest(rootSelector));
  const scan = node => {
    if (!node || node.nodeType !== 1 || typeof node.querySelectorAll !== 'function') return;
    if (!owned(node)) {
      for (const root of node.querySelectorAll(rootSelector)) if (!owned(root.parentElement)) scan(root);
      return;
    }
    if (typeof node.matches === 'function' && node.matches(selector)) enhanceModButton(node, compose);
    for (const button of node.querySelectorAll(selector)) enhanceModButton(button, compose);
  };
  scan(document.body);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (owned(record.target) && typeof record.target.matches === 'function' && record.target.matches(selector)) enhanceModButton(record.target, compose);
      } else {
        for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
        if (owned(record.target)) {
          const button = record.target.closest(selector);
          if (button && owned(button)) enhanceModButton(button, compose);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'aria-label', 'caption'] });
}
