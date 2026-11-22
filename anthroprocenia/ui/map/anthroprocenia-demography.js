// Pure logic for the people's lives in the Population Panel: how old each person is, who dies each turn (of old age,
// disease, battle or pillaging) and who takes their place (a child born into the family, or a newcomer). Nothing here
// touches the game or the DOM; the playback works out each home's hazards from the recorded turns and steps lives with them.

export const AGE_CATEGORIES = ['Child', 'Youth', 'Adult', 'Elder'];
export function ageCategory(years) {
  const y = Number(years) || 0;
  return y < 13 ? 'Child' : y < 16 ? 'Youth' : y < 60 ? 'Adult' : 'Elder';
}
export const DEATH_CAUSES = { age: 'old age', disease: 'disease', battle: 'battle', pillage: 'pillaging', infancy: 'illness in infancy' };

// A game turn can stand for decades of calendar; lives are aged by at most a few years a turn (at least one) so that people
// visibly grow up turn by turn and stay around for a good part of a game.
export const DEFAULT_LIFE_YEARS = 2;
export function lifeYearsPerTurn(calendarYears) {
  const y = Number(calendarYears);
  if (!Number.isFinite(y) || y <= 0) return DEFAULT_LIFE_YEARS;
  return Math.max(1, Math.min(4, y));
}

export function seedNumber(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mix(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b | 0, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return h >>> 0;
}
const roll = (seed, a, b) => mix(mix(seed, a), b) / 4294967296;

const ERA_DISEASE = [1.6, 1.2, 0.5];
// The dangers and chances of one home on one turn.
// input: { size, prevSize (the home settlement's population this turn and last; 0 when there is none), food (its food yield),
//   era (0 antiquity, 1 exploration, 2 modern), pillagedHere / pillagedNear (the home or a neighbouring tile was pillaged
//   this turn), wounds: [[distance 0 | 1, severity 0..1]] (wounded units on or next to the home), outbreak: 0..1 roll }
// Returns { disease, battle, pillage, birth, outbreak, growing } — death chances for this turn, and the chance that someone
// who dies is followed by a child born into the family (rather than a newcomer moving in).
export function homeHazard(input) {
  const size = Math.max(0, Number(input.size) || 0), prevSize = Math.max(0, Number(input.prevSize) || 0);
  const era = Math.max(0, Math.min(2, input.era | 0));
  const duration = input.years > 0 ? Math.min(1, input.years) : 1;
  const outbreakChance = (0.006 + Math.min(0.03, size * 0.0015)) * ERA_DISEASE[era] * duration;
  const outbreak = (Number(input.outbreak) || 0) < outbreakChance;
  const disease = (outbreak ? 0.03 + Math.min(0.05, size * 0.002) : 0.002 * ERA_DISEASE[era]) * duration;
  let battle = 0;
  for (const [distance, severity] of input.wounds || []) battle += (distance === 0 ? 0.25 : 0.08) * Math.max(0, Math.min(1, severity));
  battle = Math.min(0.35, battle);
  const pillage = (input.pillagedHere ? 0.12 : 0) + (input.pillagedNear ? 0.03 : 0);
  const foodPerPop = size > 0 ? Math.max(0, Number(input.food) || 0) / size : 0.5;
  const growing = size > prevSize && prevSize > 0;
  const birth = Math.max(0.15, Math.min(0.95, 0.35 + 0.15 * Math.min(2, foodPerPop) + (growing ? 0.3 : size < prevSize ? -0.15 : 0)));
  return { disease, battle, pillage, birth, outbreak, growing };
}

// This turn's chance of death at `age` years (given `years` of life passed this turn), with the cause chances.
export function deathChances(hazard, age, years) {
  const category = ageCategory(age);
  const infancy = age < 5 ? 0.02 * years : 0;
  const disease = hazard.disease * (category === 'Child' ? 1.4 : category === 'Elder' ? 2 : 0.6);
  const battle = hazard.battle * (category === 'Youth' || category === 'Adult' ? 1 : 0.4);
  const pillage = hazard.pillage;
  return { total: Math.min(0.9, infancy + disease + battle + pillage), infancy, disease, battle, pillage };
}

// A person slot's life at the first recorded turn: someone of any age.
// State: { turn, gen, family, born, lifespan, kind: 'initial' | 'born' | 'moved', since, lastDeath: { turn, cause, gen,
// family } | null }. `gen` counts the people who have lived in the slot; `family` is the generation whose family name they
// carry (a child born to the slot keeps the family's name).
export function startLife(seed, year) {
  const lifespan = 45 + 40 * roll(seed, 0, 1);
  return { turn: 0, gen: 0, family: 0, born: year - lifespan * roll(seed, 0, 2), lifespan, kind: 'initial', since: 0, lastDeath: null, parent: null, history: [] };
}
// Advances `state` to turn `t` (life-year `year`, `years` of life passed since the last turn) under `hazard`. A `forced`
// cause (a death the player's command brought about on this turn) ends the life whatever the odds.
export function stepLife(state, seed, t, year, years, hazard, forced = '') {
  const age = year - state.born;
  let cause = '';
  if (forced) cause = String(forced);
  else if (age >= state.lifespan) cause = DEATH_CAUSES.age;
  else if (hazard) {
    const c = deathChances(hazard, age, years), u = roll(seed, state.gen * 7919 + 3, t);
    if (u < c.total) {
      let x = u;
      for (const key of ['infancy', 'disease', 'battle', 'pillage']) { if (x < c[key]) { cause = DEATH_CAUSES[key]; break; } x -= c[key]; }
      cause = cause || DEATH_CAUSES.disease;
    }
  }
  state.turn = t;
  if (!cause) return state;
  state.lastDeath = { turn: t, cause, gen: state.gen, family: state.family };
  state.history.push({ gen: state.gen, family: state.family, born: state.born, parent: state.parent, since: state.since, kind: state.kind, deathTurn: t, deathYear: year, cause });
  if (state.history.length > 64) state.history.shift();
  const gen = state.gen + 1, birth = hazard ? hazard.birth : 0.5;
  state.gen = gen;
  state.lifespan = 45 + 40 * roll(seed, gen, 1);
  state.since = t;
  if (roll(seed, gen, 4) < birth) {
    state.kind = 'born';
    state.born = year - Math.min(years, 4) * roll(seed, gen, 2) * 0.99;
    // Keep known adult family predecessors as modeled parents; replacements who died as children are siblings, not parents.
    const parent = state.history.slice().reverse().find(p => p.family === state.family && p.deathYear - p.born >= 16 && p.deathYear + 1 >= state.born);
    state.parent = parent ? parent.gen : null;
  } else {
    state.kind = 'moved';
    state.family = gen;
    state.born = year - (15 + 40 * roll(seed, gen, 2));
    state.parent = null;
  }
  return state;
}

export function familyMembers(state, focus = state.gen) {
  const members = [...state.history, { gen: state.gen, family: state.family, born: state.born, parent: state.parent, since: state.since, kind: state.kind }];
  const byGen = new Map(members.map(p => [p.gen, p]));
  let root = byGen.get(focus);
  if (!root) return [];
  const seen = new Set();
  while (root.parent != null && byGen.has(root.parent) && !seen.has(root.gen)) { seen.add(root.gen); root = byGen.get(root.parent); }
  const out = [], visit = (p, depth) => {
    if (out.some(row => row.gen === p.gen)) return;
    out.push({ ...p, depth });
    for (const child of members) if (child.parent === p.gen) visit(child, depth + 1);
  };
  visit(root, 0);
  return out;
}

// Small, stable home cohorts keep relationships reconstructible without materializing the whole population.
export const FAMILY_COHORT_SIZE = 8;
export function simulateFamilies(lives, year, years, unit, genderOf) {
  if (typeof genderOf !== 'function') throw new TypeError('Family simulation requires a canonical gender resolver');
  const members = new Map(), marriages = [];
  for (const { index, state } of lives) {
    for (const life of [...state.history, state]) {
      if (life.born > year) continue;
      const id = `${index}:${life.gen}`;
      const gender = genderOf(index, life.gen);
      if (gender !== 'male' && gender !== 'female') throw new TypeError(`Invalid family member gender: ${id}`);
      members.set(id, { ...life, id, index, gender, parents: [], children: [], spouse: null });
    }
  }
  const ageAt = (p, at) => unit ? 16 + (at - p.born) * 0.7 : at - p.born;
  const end = p => p.deathYear === undefined ? Infinity : p.deathYear;
  const ancestorCache = new Map();
  const link = (parent, child) => {
    if (!child.parents.includes(parent.id)) {
      child.parents.push(parent.id);
      // Birth events can add ancestors to people whose ancestry was already queried.
      ancestorCache.clear();
    }
    if (!parent.children.includes(child.id)) parent.children.push(child.id);
  };
  for (const child of members.values()) {
    const parent = members.get(`${child.index}:${child.parent}`);
    if (parent && ageAt(parent, child.born) >= 16 && end(parent) >= child.born) link(parent, child);
  }
  const ancestors = p => {
    if (ancestorCache.has(p.id)) return ancestorCache.get(p.id);
    const found = new Set(), todo = [...p.parents];
    while (todo.length) {
      const id = todo.pop();
      if (found.has(id)) continue;
      found.add(id);
      const parent = members.get(id);
      if (parent) todo.push(...parent.parents);
    }
    ancestorCache.set(p.id, found);
    return found;
  };
  const related = (a, b) => {
    const aa = ancestors(a), bb = ancestors(b);
    if (aa.has(b.id) || bb.has(a.id)) return true;
    for (const id of aa) if (bb.has(id)) return true;
    return false;
  };
  const events = [];
  for (const p of members.values()) {
    const adult = p.born + (unit ? 2 / 0.7 : 18);
    const arrival = p.kind === 'moved' ? years[p.since] : -Infinity;
    events.push({ year: Math.max(adult, arrival), adult: true, p }, { year: p.born, adult: false, p });
  }
  events.sort((a, b) => a.year - b.year || Number(b.adult) - Number(a.adult) || a.p.index - b.p.index || a.p.gen - b.p.gen);
  const available = { male: [], female: [] }, activeMarriages = [];
  for (const event of events) {
    const { p, year: at } = event;
    if (at > year) continue;
    if (event.adult) {
      if (at >= end(p) || p.spouse) continue;
      const candidates = available[p.gender === 'male' ? 'female' : 'male'];
      let mate = null;
      for (let i = 0; i < candidates.length;) {
        const other = candidates[i];
        if (end(other) <= at) { candidates.splice(i, 1); continue; }
        if (other.index !== p.index && Math.abs(ageAt(other, at) - ageAt(p, at)) <= 20 && !related(other, p)) {
          mate = other;
          candidates.splice(i, 1);
          break;
        }
        i++;
      }
      if (!mate) { available[p.gender].push(p); continue; }
      p.spouse = mate.id; mate.spouse = p.id;
      p.married = mate.married = at;
      const marriage = { partners: [mate.id, p.id], year: at, end: Math.min(end(mate), end(p)) };
      marriages.push(marriage);
      activeMarriages.push(marriage);
    } else if (!unit && p.kind !== 'moved' && p.parents.length < 2) {
      for (let i = activeMarriages.length - 1; i >= 0; i--) {
        const m = activeMarriages[i];
        if (m.end < at || m.partners.some(id => ageAt(members.get(id), at) > 50)) activeMarriages.splice(i, 1);
      }
      const marriage = activeMarriages.find(m => m.year < at && p.parents.every(id => m.partners.includes(id)) && m.partners.every(id => {
        const parent = members.get(id);
        return (parent.index !== p.index || p.parents.includes(id)) && ageAt(parent, at) >= 18 && ageAt(parent, at) <= 50;
      }));
      if (marriage) for (const id of marriage.partners) link(members.get(id), p);
    }
  }
  return { members, marriages };
}

export function familyTreeLayout(members) {
  const width = 190, height = 100, gap = 28, rowGap = 70, margin = 20;
  const byId = new Map(members.map(p => [p.id, p])), groups = [], groupOf = new Map();
  for (const member of members) {
    const group = { members: [member], parents: new Set(), rank: 0 };
    groupOf.set(member.id, group);
    groups.push(group);
  }
  const reaches = (from, target) => {
    const seen = new Set(), todo = [from];
    while (todo.length) {
      const group = todo.pop();
      if (group === target) return true;
      if (seen.has(group)) continue;
      seen.add(group);
      for (const p of group.members) for (const id of p.parents) if (groupOf.has(id)) todo.push(groupOf.get(id));
    }
    return false;
  };
  for (const member of members) {
    const a = groupOf.get(member.id), b = groupOf.get(member.spouse);
    if (!b || a === b || reaches(a, b) || reaches(b, a)) continue;
    a.members.push(...b.members);
    for (const p of b.members) groupOf.set(p.id, a);
    groups.splice(groups.indexOf(b), 1);
  }
  for (const group of groups) for (const member of group.members) for (const id of member.parents) {
    const parent = groupOf.get(id);
    if (parent && parent !== group) group.parents.add(parent);
  }
  const pending = new Set(groups);
  while (pending.size) {
    let progressed = false;
    for (const group of pending) {
      if ([...group.parents].some(p => pending.has(p))) continue;
      group.rank = Math.max(0, ...[...group.parents].map(p => p.rank + 1));
      pending.delete(group); progressed = true;
    }
    if (!progressed) throw new Error('Family tree contains cyclic parentage');
  }
  const layers = new Map();
  for (const group of groups) {
    const list = layers.get(group.rank) || [];
    list.push(group); layers.set(group.rank, list);
  }
  const span = group => group.members.length * (width + gap) - gap;
  const fullWidth = Math.max(width, ...[...layers.values()].map(layer => layer.reduce((n, group) => n + span(group) + gap * 2, -gap * 2)));
  const boxes = [], placed = new Map();
  for (const [rank, layer] of [...layers].sort((a, b) => a[0] - b[0])) {
    const parentX = group => group.parents.size
      ? [...group.parents].reduce((n, p) => n + p.x + span(p) / 2, 0) / group.parents.size : 0;
    layer.sort((a, b) => parentX(a) - parentX(b) || a.members[0].born - b.members[0].born || a.members[0].id.localeCompare(b.members[0].id));
    const total = layer.reduce((n, group) => n + span(group) + gap * 2, -gap * 2);
    let x = margin + (fullWidth - total) / 2;
    for (const group of layer) {
      group.x = x;
      for (const member of group.members) {
        const box = { id: member.id, x, y: margin + rank * (height + rowGap), width, height };
        boxes.push(box); placed.set(member.id, box);
        x += width + gap;
      }
      x += gap;
    }
  }
  const links = [], families = new Map();
  for (const member of members) if (byId.has(member.spouse) && member.id < member.spouse) {
    const pair = [placed.get(member.id), placed.get(member.spouse)].sort((a, b) => a.x - b.x);
    const [a, b] = pair;
    links.push({ kind: 'marriage', points: [[a.x + width, a.y + height / 2], [b.x, b.y + height / 2]] });
  }
  for (const member of members) {
    const parents = member.parents.filter(id => placed.has(id)).sort();
    if (!parents.length) continue;
    const key = parents.join('|'), family = families.get(key) || { parents, children: [] };
    family.children.push(member.id); families.set(key, family);
  }
  for (const family of families.values()) {
    const parents = family.parents.map(id => placed.get(id)), children = family.children.map(id => placed.get(id));
    const couple = parents.length === 2 && groupOf.get(parents[0].id) === groupOf.get(parents[1].id);
    const originX = parents.reduce((n, p) => n + p.x + width / 2, 0) / parents.length;
    const originY = Math.max(...parents.map(p => p.y + (couple ? height / 2 : height)));
    const busY = Math.min(...children.map(p => p.y)) - rowGap / 2;
    if (!couple) for (const p of parents) links.push({ kind: 'parentage', points: [[p.x + width / 2, p.y + height], [p.x + width / 2, busY], [originX, busY]] });
    links.push({ kind: 'parentage', points: [[originX, originY], [originX, busY]] });
    const centers = children.map(p => p.x + width / 2);
    links.push({ kind: 'children', points: [[Math.min(originX, ...centers), busY], [Math.max(originX, ...centers), busY]] });
    for (const child of children) links.push({ kind: 'children', points: [[child.x + width / 2, busY], [child.x + width / 2, child.y]] });
  }
  return { boxes, links, width: fullWidth + margin * 2, height: margin * 2 + (layers.size ? Math.max(...layers.keys()) * (height + rowGap) + height : 0) };
}

// About how many of a home's `population` people die and are born on a turn (for the panel's tooltips): the people of a
// home span all ages, so deaths are old age (one lifetime's share of the years passed) plus each danger weighted by how many
// people of each age it strikes; births follow deaths and city growth.
export function expectedChange(population, hazard, years, growth = 0) {
  const n = Math.max(0, Number(population) || 0);
  if (!n || !hazard) return { deaths: 0, births: 0 };
  const child = 15 / 65, working = 45 / 65, elder = 5 / 65;
  const event = 0.077 * 0.02 * years + hazard.disease * (child * 1.4 + working * 0.6 + elder * 2)
    + hazard.battle * (working + (child + elder) * 0.4) + hazard.pillage;
  const deaths = n * Math.min(0.9, years / 65 + event);
  const births = deaths * hazard.birth + n * Math.max(0, Number(growth) || 0);
  return { deaths: Math.round(deaths), births: Math.round(births) };
}
