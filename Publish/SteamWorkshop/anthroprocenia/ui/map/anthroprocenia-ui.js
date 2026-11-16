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
};
export function uiGlyph(kind, slashed = false) {
  if (!GLYPHS[kind]) throw new Error(`Unknown mod UI icon: ${kind}`);
  return `<svg aria-hidden="true" viewBox="0 0 20 20" style="width:16px;height:16px;pointer-events:none;vertical-align:middle" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS[kind]}"/>${slashed ? '<path d="M3 3L17 17" stroke="#101722" stroke-width="4"/><path d="M3 3L17 17"/>' : ''}</svg>`;
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
}
export function installModUi(document, rootClass, compose) {
  if (document.getElementById('anthroprocenia-native-controls-style')) return;
  const style = document.createElement('style');
  style.id = 'anthroprocenia-native-controls-style';
  const roots = `.${rootClass}`;
  style.textContent = `
${roots} button { appearance:none!important;box-sizing:border-box;font-family:Title,serif!important;color:#e5d2ac!important;background:transparent!important;border:1px solid transparent!important;border-image-source:url("fs://game/base_button-bg.png")!important;border-image-slice:24 50 24 50 fill!important;border-image-width:12px 24px!important;border-image-outset:2px 4px!important;min-height:26px;padding:5px 10px;cursor:pointer; }
${roots} button:hover,${roots} button:focus { border-image-source:url("fs://game/base_button-bg-focus.png")!important; }
${roots} button:active { border-image-source:url("fs://game/base_button-bg-press.png")!important; }
${roots} button:disabled,${roots} [aria-disabled="true"] { opacity:0.45;cursor:default; }
${roots} input,${roots} select,${roots} textarea { appearance:none!important;background:#101722!important;color:#e5d2ac!important;border:1px solid #8e7c58!important;border-radius:3px;box-sizing:border-box; }
#anthroprocenia-panel,#anthroprocenia-playback-panel,#anthroprocenia-population-panel,#anthroprocenia-leaders-panel,#anthroprocenia-family-panel,#anthroprocenia-civ-timeline,#anthroprocenia-command-panel,#anthroprocenia-command-menu,#anthroprocenia-clump-panel,#anthroprocenia-skip-ahead-panel {
  background:linear-gradient(180deg,#223047,#101722)!important;
  border:1px solid #c0a16a!important;border-radius:8px!important;
  box-shadow:inset 0 0 0 3px #101722,inset 0 0 0 4px #65553c,0 6px 24px rgba(0,0,0,0.65)!important;
  color:#e5d2ac!important;
}
.${rootClass} .anthro-person-panel-header,.${rootClass} .anthro-panel-heading {
  background:linear-gradient(90deg,rgba(157,135,96,0.28),rgba(22,32,49,0.2),rgba(157,135,96,0.28))!important;
  border-bottom:1px solid #9d8760!important;
  box-shadow:inset 0 2px 0 #e1c58e,inset 0 -3px 0 rgba(5,9,16,0.65)!important;
  color:#f0d9a8!important;font-family:Title,serif!important;letter-spacing:0.6px;
}
.${rootClass} .anthro-panel-heading strong,.${rootClass} .anthro-person-panel-header strong { color:#f0d9a8; }
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
