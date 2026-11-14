import { currentRealisticDate, realisticCalendarEnabled } from '../map/anthroprocenia-calendar.js';

function updateDate() {
  try {
    const date = currentRealisticDate(Game.turn);
    if (!date) return;
    for (const element of document.querySelectorAll('.ps-turn-age')) {
      if (element.textContent !== date) element.textContent = date;
    }
  } catch (error) { console.error(`[ANTHROPROCENIA] calendar HUD: ${error}`); }
}
let queued = false;
function scheduleDate() {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; updateDate(); }, 0);
}
const observer = new MutationObserver(records => {
  if (records.some(record => record.type === 'childList' &&
      ([...record.addedNodes].some(node => node.nodeType === 1 &&
        ((typeof node.matches === 'function' && node.matches('.ps-turn-age, panel-system-bar')) ||
         (typeof node.querySelector === 'function' && node.querySelector('.ps-turn-age')))) ||
       (record.target.nodeType === 1 && typeof record.target.matches === 'function' && record.target.matches('.ps-turn-age'))))) scheduleDate();
});
let observing = false;
function observeHud() {
  if (observing || !realisticCalendarEnabled()) return;
  observing = true;
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleDate();
}
if (document.body) observeHud();
else document.addEventListener('DOMContentLoaded', observeHud, { once: true });
for (const name of ['GameStarted', 'LoadComplete', 'LocalPlayerTurnBegin', 'PlayerTurnActivated', 'GameAgeChanged']) engine.on(name, () => {
  if (document.body) observeHud();
  scheduleDate();
});
scheduleDate();
