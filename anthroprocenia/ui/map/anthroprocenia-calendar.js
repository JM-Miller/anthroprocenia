export const REALISTIC_AGES = {
  AGE_ANTIQUITY: { turns: 4400, yearsPerTurn: 1 },
  AGE_EXPLORATION: { turns: 5400, yearsPerTurn: 0.25 },
  AGE_MODERN: { turns: 2400, yearsPerTurn: 1 / 12 },
};
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function calendarDateLabel(date, turn, lastTurn = turn) {
  const label = date ? String(date).replace(/\bBC\b/g, 'BCE').replace(/\bAD\b/g, 'CE') : 'Date unknown';
  return `${label} (${turn === lastTurn ? `Turn ${turn}` : `Turns ${turn}-${lastTurn}`})`;
}
export function realisticSpeedMultiplier() {
  const row = typeof GameInfo !== 'undefined' ? GameInfo.GlobalParameters.lookup('ANTHRO_REALISTIC_SPEED_FACTOR') : null;
  const factor = row ? Number(row.Value) : 1;
  if (![1, 2, 3, 4, 5, 6, 10, 20].includes(factor)) throw new Error(`Invalid realistic speed multiplier: ${row?.Value}`);
  return factor;
}
export function realisticAgeTurns(age) {
  const config = REALISTIC_AGES[age];
  if (!config) throw new Error(`Unknown realistic calendar age: ${age}`);
  return Math.ceil(config.turns / realisticSpeedMultiplier());
}
export function realisticDate(age, turn, factor = realisticSpeedMultiplier()) {
  const config = REALISTIC_AGES[age];
  if (!config || !Number.isFinite(turn) || ![1, 2, 3, 4, 5, 6, 10, 20].includes(factor)) throw new Error(`Invalid realistic calendar date: ${age}, ${turn}, ${factor}`);
  const index = Math.max(0, Math.floor(turn) - 1) * factor;
  if (age === 'AGE_ANTIQUITY') {
    const year = index < 4000 ? index - 4000 : index - 3999;
    return year < 0 ? `${-year} BCE` : `${year} CE`;
  }
  if (age === 'AGE_EXPLORATION') return `${SEASONS[index % 4]} ${400 + Math.floor(index / 4)} CE`;
  return `${MONTHS[index % 12]} ${1750 + Math.floor(index / 12)} CE`;
}
export function realisticCalendarEnabled() {
  return typeof GameInfo !== 'undefined' && !!GameInfo.GlobalParameters.lookup('ANTHRO_REALISTIC_CALENDAR');
}
export function currentRealisticDate(turn) {
  if (!realisticCalendarEnabled()) return null;
  const age = GameInfo.Ages.lookup(Game.age);
  if (!age) throw new Error(`Unknown realistic calendar age: ${Game.age}`);
  return realisticDate(age.AgeType, turn);
}
