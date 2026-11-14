// Commands for the people walking the townscapes: once a turn, the player's own walkers (picked with the Population Panel's
// checkboxes or a selection box on the townscapes) can be sent to do something at a townscape building, a tree or another
// walker. What they can do follows their occupation (its work family, see workFamily in the people module) and what was
// right-clicked; every occupation has at least two actions that bring in an in-game yield. An action may fail, and a risky one
// may cost a walker their life. Leaders (see leaderRole in the people module) have actions of their own, can be given three
// commands a turn and make success far likelier. Everything here is pure and deterministic in the seed.

import { unlockedOccupations } from './anthroprocenia-people.js';

export const YIELDS = ['food', 'production', 'gold', 'science', 'culture', 'happiness', 'influence', 'health'];
export const YIELD_LABELS = { food: 'Food', production: 'Production', gold: 'Gold', science: 'Science', culture: 'Culture', happiness: 'Happiness', influence: 'Influence', health: 'Unit Health' };
export const YIELD_COLORS = { food: '#9bd65a', production: '#e0a050', gold: '#ffd24a', science: '#6cc4ff', culture: '#c78cff', happiness: '#ffe08a', influence: '#8fb0ff', health: '#ff7a7a' };
// The game's yield types the civilization is paid in (Unit Health goes to a unit instead, see the map view).
export const GAME_YIELDS = { food: 'YIELD_FOOD', production: 'YIELD_PRODUCTION', gold: 'YIELD_GOLD', science: 'YIELD_SCIENCE', culture: 'YIELD_CULTURE', happiness: 'YIELD_HAPPINESS', influence: 'YIELD_DIPLOMACY' };

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}
// A small seeded generator (mulberry32).
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The things a command can be aimed at:
//   { kind: 'building', cls: 'house' | 'store' | 'civic' | 'sacred' | 'industry' | 'military' | 'tents', form, central }
//   { kind: 'tree' }
//   { kind: 'walker', enemy: boolean, battling: boolean, unit: boolean }   (battling: the target's unit is in a battle with the
//     commanded unit; unit: the target walks with a unit, so can be patched up)
// An action's `at` lists where it can be done: 'building' (any), a building class ('sacred'...), 'central' (a townscape's large
// central building), 'tree', 'ally' (a walker of the player's own civilization), 'unit' (one of the player's own walkers who is
// with a unit) or 'enemy' (an enemy walker in a battle with the commanded walkers' unit). `chance` is the base success chance
// (kept low: most things people try don't come off), `base` the usual yield, `risk` the chance each walker dies when it goes
// wrong (a quarter of it when it goes right). Unit Health ('health') is hit points for a unit.
const A = (id, label, at, yieldType, chance, base, risk = 0) => ({ id, label, at, yield: yieldType, chance, base, risk });
const COMMON = [
  A('help', 'Lend a Hand', ['building'], 'production', 0.22, 2),
  A('chat', 'Swap News', ['ally'], 'happiness', 0.25, 1),
  A('gossip', 'Spread a Rumour', ['store', 'house'], 'influence', 0.12, 1),
  A('sweep', 'Sweep the Street', ['house', 'store', 'civic'], 'happiness', 0.18, 1),
  A('water', 'Fetch Water for the Wounded', ['unit', 'tents'], 'health', 0.18, 6),
  A('forage', 'Forage', ['tree'], 'food', 0.16, 1),
  A('donate', 'Make an Offering', ['sacred'], 'culture', 0.15, 1),
];
const FAMILY_ACTIONS = {
  grounds: [A('tend', 'Tend to Grounds', ['central', 'civic', 'sacred'], 'culture', 0.28, 2), A('prune', 'Prune the Trees', ['tree'], 'happiness', 0.26, 2), A('supplies', 'Buy Supplies', ['store'], 'gold', 0.22, 2),
    A('plant', 'Plant a Garden', ['house', 'civic', 'tree'], 'food', 0.2, 2), A('lamps', 'Light the Lamps', ['central', 'civic', 'house'], 'happiness', 0.24, 1), A('repairs', 'Patch the Roof', ['house', 'sacred', 'civic'], 'production', 0.2, 2),
    A('fountain', 'Clean the Fountains', ['central', 'civic'], 'culture', 0.18, 2), A('bandage', 'Change the Bandages', ['unit', 'tents', 'military'], 'health', 0.2, 8)],
  farm: [A('harvest', 'Bring in the Harvest', ['tree', 'industry', 'store'], 'food', 0.26, 3), A('mill', 'Grind Grain', ['industry', 'store'], 'production', 0.22, 2), A('market', 'Sell Produce', ['store', 'central'], 'gold', 0.22, 2),
    A('sow', 'Sow the Fields', ['tree', 'house'], 'food', 0.24, 2), A('ditch', 'Dig an Irrigation Ditch', ['tree', 'industry'], 'food', 0.16, 4, 0.01), A('granary', 'Fill the Granary', ['store', 'industry', 'central'], 'food', 0.2, 3),
    A('almanac', 'Keep an Almanac', ['civic', 'house'], 'science', 0.14, 2), A('feast', 'Hold a Harvest Feast', ['central', 'civic', 'sacred'], 'happiness', 0.18, 3), A('rations', 'Bring Rations to the Troops', ['unit', 'tents', 'military'], 'health', 0.18, 7)],
  herd: [A('graze', 'Graze the Herd', ['tree'], 'food', 0.26, 3), A('wool', 'Sell Wool', ['store', 'central'], 'gold', 0.22, 2), A('milk', 'Deliver Milk', ['house', 'store'], 'food', 0.24, 2),
    A('shear', 'Shear the Flock', ['industry', 'tree'], 'production', 0.2, 2), A('horses', 'Break in Horses', ['military', 'tents'], 'production', 0.15, 3, 0.03), A('fair', 'Show at the Fair', ['central', 'civic'], 'culture', 0.14, 2),
    A('salve', 'Mix a Salve', ['unit', 'tents'], 'health', 0.16, 7)],
  hunt: [A('hunt', 'Hunt Game', ['tree'], 'food', 0.2, 3, 0.04), A('furs', 'Trade Furs', ['store'], 'gold', 0.22, 2), A('scout', 'Scout Ahead', ['enemy'], 'influence', 0.16, 2, 0.12),
    A('trap', 'Set Traps', ['tree'], 'food', 0.22, 2, 0.01), A('track', 'Track the Enemy', ['enemy'], 'production', 0.12, 3, 0.14), A('map', 'Map the Trails', ['tree', 'civic'], 'science', 0.15, 2),
    A('ambush', 'Lay an Ambush', ['enemy'], 'production', 0.1, 4, 0.2), A('herbs', 'Gather Healing Herbs', ['tree', 'unit'], 'health', 0.16, 8)],
  wood: [A('fell', 'Fell Timber', ['tree'], 'production', 0.26, 3, 0.02), A('build', 'Raise a Frame', ['building'], 'production', 0.22, 2), A('firewood', 'Sell Firewood', ['house', 'store'], 'gold', 0.22, 1),
    A('saw', 'Saw Planks', ['industry', 'store'], 'production', 0.22, 2), A('charcoal', 'Burn Charcoal', ['tree', 'industry'], 'production', 0.16, 3, 0.02), A('palisade', 'Mend the Palisade', ['military', 'tents', 'central'], 'production', 0.18, 3),
    A('carvewood', 'Carve a Totem', ['sacred', 'central', 'tree'], 'culture', 0.14, 2), A('splint', 'Splint Broken Limbs', ['unit', 'tents'], 'health', 0.15, 8)],
  stone: [A('quarry', 'Dress Stone', ['building'], 'production', 0.26, 3, 0.02), A('assay', 'Assay Ore', ['industry', 'store'], 'gold', 0.18, 3), A('survey', 'Survey the Ground', ['tree'], 'science', 0.18, 2),
    A('pave', 'Pave the Road', ['house', 'store', 'civic', 'central'], 'production', 0.2, 2), A('mine', 'Dig a New Shaft', ['industry', 'tree'], 'production', 0.14, 4, 0.05), A('smelt', 'Smelt Metal', ['industry'], 'gold', 0.16, 3, 0.02),
    A('statue', 'Raise a Statue', ['central', 'sacred', 'civic'], 'culture', 0.12, 3), A('earthworks', 'Dig Earthworks', ['military', 'tents'], 'health', 0.14, 6, 0.02)],
  water: [A('fish', 'Fish the Waters', ['tree', 'store'], 'food', 0.24, 3, 0.01), A('ferry', 'Ferry Goods', ['store', 'industry'], 'gold', 0.22, 2), A('pump', 'Clear the Wells', ['house', 'civic'], 'happiness', 0.22, 2),
    A('nets', 'Mend the Nets', ['store', 'house', 'industry'], 'production', 0.22, 2), A('hull', 'Caulk a Hull', ['industry', 'military'], 'production', 0.18, 3), A('salt', 'Salt the Catch', ['store', 'industry'], 'food', 0.2, 2),
    A('chart', 'Chart the Waters', ['civic', 'tree'], 'science', 0.14, 2), A('baths', 'Draw a Hot Bath', ['unit', 'tents', 'civic'], 'health', 0.17, 7)],
  soldier: [A('attack', 'Attack', ['enemy'], 'production', 0.14, 4, 0.25), A('drill', 'Drill the Troops', ['military', 'central', 'tents'], 'production', 0.22, 2), A('guard', 'Stand Guard', ['central', 'civic', 'sacred'], 'happiness', 0.26, 2),
    A('escort', 'Escort', ['ally'], 'influence', 0.22, 1), A('raid', 'Raid the Supply Train', ['enemy'], 'gold', 0.1, 5, 0.22), A('capture', 'Take a Prisoner', ['enemy'], 'influence', 0.08, 5, 0.2),
    A('flank', 'Outflank', ['enemy'], 'production', 0.11, 4, 0.18), A('fortify', 'Dig In', ['military', 'tents', 'tree'], 'health', 0.2, 8), A('firstaid', 'Bind Wounds', ['unit', 'tents'], 'health', 0.22, 10),
    A('patrol', 'Patrol the Walls', ['central', 'military', 'civic'], 'happiness', 0.22, 2), A('forage-army', 'Requisition Supplies', ['store', 'house'], 'food', 0.16, 3, 0.02), A('sharpen', 'Sharpen Weapons', ['industry', 'military'], 'production', 0.2, 2)],
  clergy: [A('pray', 'Lead Prayers', ['sacred', 'central'], 'culture', 0.26, 2), A('bless', 'Give a Blessing', ['ally', 'house'], 'happiness', 0.26, 2), A('alms', 'Collect Alms', ['store', 'house'], 'gold', 0.18, 1),
    A('parley', 'Preach Peace', ['enemy'], 'influence', 0.1, 3, 0.1), A('sick', 'Tend the Sick', ['unit', 'tents', 'house'], 'health', 0.22, 10), A('rites', 'Perform the Last Rites', ['unit', 'tents'], 'culture', 0.18, 2),
    A('pilgrim', 'Welcome Pilgrims', ['sacred', 'central'], 'influence', 0.15, 2), A('copy', 'Copy the Scriptures', ['sacred', 'civic'], 'science', 0.16, 2), A('festival', 'Hold a Festival', ['central', 'sacred', 'civic'], 'happiness', 0.15, 3),
    A('grove', 'Bless the Grove', ['tree'], 'culture', 0.2, 2)],
  learned: [A('study', 'Study the Archives', ['civic', 'central', 'sacred'], 'science', 0.24, 3), A('teach', 'Teach a Lesson', ['ally', 'house'], 'science', 0.24, 2), A('botany', 'Catalogue the Plants', ['tree'], 'science', 0.22, 2),
    A('record', 'Write a Chronicle', ['central', 'civic'], 'culture', 0.2, 2), A('surgery', 'Field Surgery', ['unit', 'tents'], 'health', 0.2, 12, 0.01), A('stars', 'Observe the Stars', ['civic', 'sacred', 'tree'], 'science', 0.16, 3),
    A('ledger', 'Audit the Ledgers', ['store', 'central'], 'gold', 0.16, 2), A('design', 'Draw up Plans', ['industry', 'civic', 'military'], 'production', 0.18, 2), A('translate', 'Translate a Letter', ['ally', 'civic'], 'influence', 0.14, 2),
    A('interrogate', 'Question a Captive', ['enemy'], 'science', 0.08, 4, 0.08)],
  court: [A('decree', 'Announce a Decree', ['central', 'civic'], 'influence', 0.22, 2), A('envoy', 'Carry a Letter', ['ally'], 'influence', 0.22, 1), A('levy', 'Collect Dues', ['store', 'house'], 'gold', 0.18, 3),
    A('herald', 'Demand Surrender', ['enemy'], 'influence', 0.08, 4, 0.15), A('banquet', 'Arrange a Banquet', ['central', 'civic'], 'happiness', 0.18, 3), A('census', 'Take a Census', ['house', 'civic'], 'science', 0.16, 2),
    A('ceremony', 'Plan a Ceremony', ['central', 'sacred'], 'culture', 0.18, 2), A('quarters', 'Arrange Quarters for the Wounded', ['unit', 'tents', 'military'], 'health', 0.18, 8), A('accounts', 'Settle the Accounts', ['store', 'central'], 'gold', 0.16, 2)],
  trade: [A('trade', 'Strike a Deal', ['store', 'central', 'ally'], 'gold', 0.22, 3), A('stock', 'Restock the Stalls', ['store', 'industry'], 'food', 0.22, 2), A('haggle', 'Haggle with Strangers', ['enemy'], 'gold', 0.12, 4, 0.08),
    A('caravan', 'Outfit a Caravan', ['store', 'industry', 'tents'], 'gold', 0.15, 4, 0.02), A('lend', 'Lend at Interest', ['house', 'store'], 'gold', 0.14, 3), A('exotic', 'Sell Exotic Goods', ['central', 'store'], 'culture', 0.14, 2),
    A('bribe', 'Bribe an Official', ['civic', 'central'], 'influence', 0.1, 4, 0.03), A('inn', 'Put up Travellers', ['house', 'store'], 'happiness', 0.18, 2), A('sutler', 'Sell to the Troops', ['unit', 'tents', 'military'], 'health', 0.15, 6)],
  craft: [A('craft', 'Craft Goods', ['industry', 'store', 'house'], 'production', 0.24, 3), A('sell', 'Sell Wares', ['store', 'central'], 'gold', 0.22, 2), A('carve', 'Carve a Monument', ['central', 'sacred', 'civic'], 'culture', 0.18, 2),
    A('tools', 'Forge Tools', ['industry', 'military'], 'production', 0.2, 3, 0.01), A('armour', 'Mend Armour', ['unit', 'tents', 'military'], 'health', 0.2, 9), A('loom', 'Weave Cloth', ['industry', 'house'], 'production', 0.2, 2),
    A('jewel', 'Make Jewellery', ['store', 'central'], 'gold', 0.14, 4), A('apprentice', 'Train an Apprentice', ['house', 'industry'], 'science', 0.15, 2), A('ornament', 'Decorate the Shrine', ['sacred'], 'culture', 0.18, 2)],
  arts: [A('perform', 'Put on a Performance', ['central', 'civic', 'sacred'], 'culture', 0.24, 3), A('busk', 'Busk for Coins', ['store', 'house', 'ally'], 'gold', 0.2, 1), A('sketch', 'Sketch the Trees', ['tree'], 'culture', 0.22, 2),
    A('cheer', 'Lift Spirits', ['ally', 'tents'], 'happiness', 0.26, 2), A('song', 'Sing to the Wounded', ['unit', 'tents'], 'health', 0.16, 6), A('mural', 'Paint a Mural', ['house', 'civic', 'central'], 'culture', 0.16, 3),
    A('portrait', 'Paint a Portrait', ['central', 'house'], 'gold', 0.14, 3), A('satire', 'Mock the Enemy', ['enemy'], 'happiness', 0.12, 3, 0.06), A('poem', 'Recite an Epic', ['ally', 'central', 'sacred'], 'influence', 0.14, 2)],
  labor: [A('haul', 'Haul Materials', ['building'], 'production', 0.24, 3, 0.01), A('clear', 'Clear Brush', ['tree'], 'food', 0.22, 2), A('wage', 'Work for Wages', ['store', 'house'], 'gold', 0.22, 1),
    A('dig', 'Dig Foundations', ['industry', 'civic', 'house'], 'production', 0.2, 3, 0.02), A('road', 'Mend the Road', ['house', 'store', 'central'], 'production', 0.2, 2), A('stretcher', 'Carry Stretchers', ['unit', 'tents'], 'health', 0.2, 8, 0.02),
    A('unload', 'Unload the Carts', ['store', 'industry'], 'gold', 0.18, 2), A('barricade', 'Build a Barricade', ['military', 'tents', 'central'], 'production', 0.16, 3, 0.03)],
  town: [A('errand', 'Run Errands', ['store', 'house', 'central'], 'gold', 0.22, 1), A('gather', 'Gather Firewood', ['tree'], 'production', 0.24, 2), A('volunteer', 'Volunteer', ['civic', 'sacred', 'central'], 'happiness', 0.22, 2),
    A('cook', 'Cook for the Neighbours', ['house'], 'food', 0.2, 2), A('market-day', 'Go to Market', ['store', 'central'], 'gold', 0.18, 2), A('mend', 'Mend Clothes', ['house', 'unit'], 'health', 0.15, 5),
    A('story', 'Tell Old Stories', ['ally', 'house', 'sacred'], 'culture', 0.16, 2), A('school', 'Learn Letters', ['civic', 'sacred'], 'science', 0.14, 2)],
};
// Leaders and their households do not perform ordinary occupational work.
const LEADER_ACTIONS = [
  A('court', 'Hold Court', ['central', 'civic'], 'influence', 0.24, 4), A('rally', 'Rally the People', ['ally', 'central'], 'happiness', 0.24, 4), A('taxes', 'Levy Taxes', ['store', 'house'], 'gold', 0.22, 5),
  A('commission', 'Commission a Great Work', ['central', 'sacred', 'civic'], 'culture', 0.16, 5), A('charter', 'Grant a Charter', ['civic', 'store', 'industry'], 'science', 0.16, 4), A('feast-leader', 'Throw a Feast', ['central', 'civic'], 'food', 0.2, 5),
  A('inspect', 'Inspect the Troops', ['unit', 'tents', 'military'], 'health', 0.24, 12), A('charge', 'Lead the Charge', ['enemy'], 'production', 0.12, 7, 0.22), A('truce', 'Offer Terms', ['enemy'], 'influence', 0.1, 6, 0.1),
  A('works', 'Order Public Works', ['building'], 'production', 0.2, 4),
];
// Unknown work families fall back to townsfolk; leadership households have a separate action set.
export function familyActions(family, leader = false, context = {}) {
  if (context.ageCategory === 'Infant') return [];
  const leadership = leader || context.leaderHousehold;
  if (context.ageCategory === 'Child' || (context.ageCategory === 'Youth' && context.years < 16)) return [
    A('learn-child', leadership ? 'Study with Family' : 'Practice Lessons', ['house', 'civic', 'sacred'], 'science', 0.18, 1),
    A('play-child', leadership ? 'Play with Family' : 'Play with Neighbours', ['house', 'civic'], 'happiness', 0.24, 1),
    A('help-child', 'Help with Household Chores', ['house'], 'happiness', 0.2, 1),
    ...(context.celebration && !leadership ? [A('festival-child', 'Enjoy the Festival', ['civic', 'central', 'house'], 'happiness', 0.24, 1)] : []),
  ];
  if (leadership) return LEADER_ACTIONS.filter(action => context.ageCategory !== 'Elder' || action.risk === 0);
  const actions = (FAMILY_ACTIONS[family] || FAMILY_ACTIONS.town).concat(COMMON);
  if (context.occupation === 'Supply runner') actions.push(A('runner-supply', 'Deliver Formation Supplies', ['military', 'tents'], 'production', 0.26, 2));
  if (context.occupation === 'Message runner') actions.push(A('runner-message', 'Deliver Formation Dispatches', ['military', 'tents', 'civic'], 'influence', 0.26, 2));
  for (const row of unlockedOccupations(context.discoveries)) if (row[1] === context.occupation) {
    actions.push(A('discovery-' + row[0], row[4], row[5], row[6], 0.26, 3));
  }
  if (context.war) {
    if (['soldier', 'commander'].includes(family)) actions.push(A('wartime-drill', 'Practice Defensive Formations', ['military', 'tents', 'central'], 'production', 0.26, 3));
    else if (['farm', 'herd', 'water', 'trade'].includes(family)) actions.push(A('wartime-provisions', 'Prepare Wartime Provisions', ['store', 'industry', 'house'], 'food', 0.22, 2));
    else if (['craft', 'wood', 'stone', 'labor', 'grounds'].includes(family)) actions.push(A('wartime-repair', 'Repair Civilian Shelters', ['house', 'civic'], 'production', 0.24, 2));
    else actions.push(A('wartime-care', 'Organize Care for Displaced Families', ['house', 'civic', 'sacred'], 'happiness', 0.22, 2));
  }
  if (context.celebration) {
    const cook = ['farm', 'herd', 'water', 'trade', 'town'].includes(family);
    actions.push(A('celebration-' + (cook ? 'feast' : 'prepare'), cook ? 'Prepare a Celebration Feast' : ['soldier', 'commander'].includes(family) ? 'Stand Ceremonial Guard' : family === 'clergy' ? 'Lead Celebration Rites' : 'Prepare Festival Decorations', ['house', 'central', 'civic', 'sacred'], 'happiness', 0.26, 3));
  }
  if (context.recovery && ['craft', 'wood', 'stone', 'labor', 'grounds'].includes(family)) actions.push(A('recovery-rebuild', 'Restore Damaged Homes', ['house', 'industry', 'civic'], 'production', 0.24, 3));
  if (context.shortage && ['farm', 'herd', 'water', 'trade', 'town', 'court', 'clergy'].includes(family)) actions.push(A('shortage-rations', 'Distribute Emergency Food', ['store', 'house', 'civic'], 'food', 0.24, 2));
  if (context.crisis) actions.push(A('crisis-support', ['soldier', 'commander'].includes(family) ? 'Guard Relief Supplies' : ['farm', 'herd', 'water'].includes(family) ? 'Prepare Emergency Stores' : 'Help Neighbours through the Crisis', ['house', 'store', 'civic'], 'happiness', 0.22, 2));
  if (context.alliance && (leader || ['court', 'trade'].includes(family))) actions.push(A('allied-cooperation', 'Arrange Allied Cooperation', ['civic', 'central', 'store'], 'influence', 0.22, 2));
  return context.ageCategory === 'Elder' ? actions.filter(action => action.risk === 0 && !/attack|charge|ditch|quarry|fell|dig|barricade|build|repair|mine|pave|smelt|horses/i.test(action.id)) : actions;
}
export function ambientActions(family, context = {}) {
  return familyActions(family, !!context.leader, context).filter(action => !action.at.includes('enemy') && action.yield !== 'health' && action.id !== 'gossip');
}
export function familyInteraction(person, relative, relation) {
  if (!person || !relative || !relation || person.ageCategory === 'Infant') return '';
  const young = p => ['Infant', 'Child'].includes(p.ageCategory) || (p.ageCategory === 'Youth' && p.years < 16);
  if (relative.ageCategory === 'Infant') return young(person) ? '' : 'Care for infant family member';
  if (young(person)) {
    if (young(relative)) return 'Play with ' + (relation === 'sibling' ? 'sibling' : 'family');
    return 'Learn from ' + (relation === 'parent' ? 'parent' : 'family elder');
  }
  if (young(relative)) return 'Teach and care for ' + (relation === 'child' ? 'child' : 'young family member');
  if (relative.ageCategory === 'Elder' && person.ageCategory !== 'Elder') return 'Help an elderly family member';
  return relation === 'spouse' ? 'Share a meal with spouse' : relation === 'sibling' ? 'Catch up with sibling' : 'Spend time with family';
}
export const WORK_FAMILY_KEYS = Object.keys(FAMILY_ACTIONS);
export const LEADER_ACTION_IDS = LEADER_ACTIONS.map(a => a.id);
// How many commands a person can be given each turn: three for a leader, one for anyone else.
export function commandsPerTurn(leader) { return leader ? 3 : 1; }
// Whether an action can be done at a target.
export function actionFits(action, target) {
  if (!target) return false;
  for (const at of action.at) {
    if (target.kind === 'building') {
      if (at === 'building' || at === target.cls || (at === 'central' && target.central)) return true;
    } else if (target.kind === 'tree') {
      if (at === 'tree') return true;
    } else if (target.kind === 'walker') {
      if (at === 'ally' && !target.enemy) return true;
      if (at === 'unit' && !target.enemy && target.unit) return true;
      if (at === 'enemy' && target.enemy && target.battling) return true;
    }
  }
  return false;
}
// The menu for a right-click: every action open to at least one of the commanded walkers at this target, with the walkers who
// can do it (`who`: indexes into `walkers`) and how many of them are leaders (`leaders`). walkers: [{ family, leader }]. Sorted
// by how many can do it, then by name.
export function commandMenu(walkers, target) {
  const byId = new Map();
  walkers.forEach((walker, i) => {
    for (const action of walker.actions || familyActions(walker.family, !!walker.leader, walker.context)) {
      if (!actionFits(action, target)) continue;
      let entry = byId.get(action.id);
      if (!entry) { entry = { ...action, who: [], leaders: 0 }; byId.set(action.id, entry); }
      if (!entry.who.includes(i)) { entry.who.push(i); if (walker.leader) entry.leaders++; }
    }
  });
  return [...byId.values()].sort((a, b) => b.who.length - a.who.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

// The chance a command comes off. More hands and friendly surroundings help a little, enemies nearby hurt, and leaders taking
// part help a great deal (and raise the ceiling).
export function commandChance(action, count, allies, enemies, leaders) {
  const lead = Math.min(3, Math.max(0, leaders | 0));
  const raw = action.chance + 0.03 * Math.log2(Math.max(1, count)) + 0.012 * Math.min(8, allies) - 0.04 * Math.min(8, enemies) + (lead ? 0.2 + 0.08 * (lead - 1) : 0);
  return Math.max(0.02, Math.min(lead ? 0.8 : 0.6, raw));
}
// How much of an action's yield a group brings in: a leader taking part (or a great crowd, about 40 people) gets it all; a few
// people on their own get only a tiny share of it (2% for anyone up to about six), rising with the square of the crowd's size.
export const FULL_CROWD = 40;
export function yieldShare(count, leaders) {
  if (leaders > 0) return 1;
  return Math.max(0.02, Math.min(1, (Math.max(1, count) / FULL_CROWD) ** 2));
}
// How a command turns out. opts: { action, count (walkers doing it), allies (allied buildings and walkers near the target),
// enemies (enemy walkers near it), leaders (how many of the walkers are leaders), seed }.
// Returns { success, chance, yield, amount, deaths: [walker indexes], popDelta, wound }: amount is the yield brought in (for
// Unit Health, hit points healed), to three decimals and scaled by yieldShare and the reward reduction, so fractions add up in the
// turn's queue; wound is the hit points a unit loses when a risky action goes wrong. popDelta is the change to
// the Home Location's people: deaths take people away; a good harvest, a blessing or a cheerful crowd may bring newcomers.
export function resolveCommand(opts) {
  const action = opts.action, count = Math.max(1, Math.floor(Number(opts.count) || 1));
  const allies = Math.max(0, Number(opts.allies) || 0), enemies = Math.max(0, Number(opts.enemies) || 0), leaders = Math.max(0, Math.floor(Number(opts.leaders) || 0));
  const rand = seededRandom(`${opts.seed}|${action.id}|${count}`);
  const chance = commandChance(action, count, allies, enemies, leaders);
  const success = rand() < chance;
  let amount = 0;
  if (success) {
    const full = action.base * (0.6 + 0.8 * rand()) * Math.sqrt(count) * (1 + 0.08 * Math.min(8, allies)) * (leaders ? 1.5 : 1);
    amount = Math.max(0.001, Math.round(full * yieldShare(count, leaders) * 100) / 1000);
  }
  else rand();
  // a leader's presence keeps people safer too
  const risk = action.risk * (success ? 0.25 : 1) * (1 + 0.15 * Math.min(8, enemies)) * (leaders ? 0.6 : 1);
  const deaths = [];
  for (let i = 0; i < count; i++) if (risk > 0 && rand() < risk) deaths.push(i);
  let popDelta = -deaths.length;
  if (success && (action.yield === 'food' || action.yield === 'happiness') && rand() < 0.35) popDelta += 1 + Math.floor(rand() * Math.max(1, count / 2));
  const wound = !success && action.risk > 0 ? Math.round(4 + 40 * action.risk * (1 + 0.1 * Math.min(8, enemies))) : 0;
  return { success, chance, yield: action.yield, amount, deaths, popDelta, wound };
}
// Totals per yield of a list of outcomes ({ yield, amount }).
export function yieldTotals(outcomes) {
  const totals = {};
  for (const o of outcomes || []) if (o && o.amount > 0 && YIELDS.includes(o.yield)) totals[o.yield] = Math.round(((totals[o.yield] || 0) + o.amount) * 1000) / 1000;
  return totals;
}
// A yield amount as shown: whole numbers as they are, fractions to three decimals at most.
export function formatYield(amount) {
  const n = Math.round((Number(amount) || 0) * 1000) / 1000;
  return String(n);
}

// A route's points (map pixels) bent into a gentle meander: each interior stretch is pushed sideways by a sine of its own,
// none at the two ends. amplitude is in map pixels; `steps` points are added per stretch.
export function meanderPath(points, seed, amplitude, steps = 4) {
  if (!points || points.length < 2) return points ? points.slice() : [];
  const rand = seededRandom(`${seed}|meander`), out = [{ x: points[0].x, y: points[0].y }];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (!length) continue;
    const nx = -dy / length, ny = dx / length, amp = Math.min(amplitude, length * 0.25) * (rand() < 0.5 ? -1 : 1), phase = rand() * Math.PI;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, o = s === steps ? 0 : amp * Math.sin(Math.PI * t) * Math.cos(phase * (1 - t));
      out.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o });
    }
  }
  return out;
}
