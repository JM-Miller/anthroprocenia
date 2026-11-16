import { parseGameYear } from './anthroprocenia-units.js';

export function familyEventDate(year, years, frames) {
  const at = years.findIndex(value => value >= year);
  if (at >= 0 && Math.abs(years[at] - year) < 0.0001 && frames[at]) return frames[at][3] || `recorded turn ${at + 1}`;
  const origin = parseGameYear(frames[0] && frames[0][3]);
  if (origin === null) return year < 0 ? `${Math.ceil(-year)} years before the first record` : `${Math.floor(year)} years after the first record`;
  const astronomical = origin < 0 ? origin + 1 : origin;
  const date = Math.floor(astronomical + year);
  return date <= 0 ? `${1 - date} BCE` : `${date} CE`;
}

export function familyEvents(members, nameOf, years, frames, observations = []) {
  const events = [], byId = new Map(members.map(member => [member.id, member]));
  const add = (year, text, details = 'Family history reconstructed from household records.') => {
    const date = familyEventDate(year, years, frames);
    events.push({ year, date, details, text: `In ${date} ${text}` });
  };
  for (const member of members) {
    const name = nameOf(member);
    const details = `Born: ${familyEventDate(member.born, years, frames)}. Children: ${(member.children || []).length}.`
      + (member.deathYear !== undefined ? ` Died: ${familyEventDate(member.deathYear, years, frames)}${member.cause ? ` (${member.cause})` : ''}.` : '');
    add(member.born, `${name} was born.`, details);
    if (member.kind === 'moved' && years[member.since] !== undefined) add(years[member.since], `${name} moved to this home.`);
    if (member.spouse && member.id < member.spouse && byId.has(member.spouse)) {
      add(member.married, `${name} married ${nameOf(byId.get(member.spouse))}.`, details);
    }
    if (member.deathYear !== undefined) add(member.deathYear, `${name} died${member.cause ? ` of ${member.cause}` : ''}.`, details);
    for (const [age, milestone] of [[16, 'reached adulthood'], [60, 'turned sixty']]) {
      const year = member.born + age;
      if (year >= years[0] && year <= years[years.length - 1] && (member.deathYear === undefined || member.deathYear >= year)) add(year, `${name} ${milestone}.`, details);
    }
    for (const parent of new Set(member.parents || (member.parent ? [member.parent] : []))) {
      if (byId.has(parent)) add(member.born, `${nameOf(byId.get(parent))} became a parent of ${name}.`, details);
    }
    const spouse = member.spouse && byId.get(member.spouse);
    if (member.deathYear !== undefined && spouse && (spouse.deathYear === undefined || spouse.deathYear > member.deathYear)) add(member.deathYear, `${nameOf(spouse)} was widowed.`, details);
  }
  for (const observation of observations) {
    const member = byId.get(observation.id);
    if (!member || observation.turn >= frames.length || years[observation.turn] === undefined) continue;
    add(years[observation.turn], `${nameOf(member)} ${observation.text}`);
  }
  return events.sort((a, b) => a.year - b.year || a.text.localeCompare(b.text));
}

// Only transitions established by recorded state are narrated as events.
export class CivilizationTimeline {
  constructor(owner) {
    this.owner = owner; this.territory = new Map(); this.settlements = new Map();
    this.identities = new Map(); this.relations = new Map(); this.discoveries = null;
    this.events = []; this.turns = 0; this.tileCount = 0;
    this.tileCounts = new Map(); this.societies = new Map();
    this.buildings = new Map(); this.wonders = new Map(); this.damaged = new Set();
    this.met = null; this.suzerains = null; this.celebrating = null; this.crisis = null; this.age = null;
  }
  clone() {
    const copy = new CivilizationTimeline(this.owner);
    copy.territory = new Map(this.territory);
    copy.settlements = new Map([...this.settlements].map(([plot, settlement]) => [plot, { ...settlement }]));
    copy.identities = new Map(this.identities); copy.relations = new Map(this.relations);
    copy.discoveries = this.discoveries && new Set(this.discoveries);
    copy.events = this.events.slice(); copy.turns = this.turns; copy.tileCount = this.tileCount;
    copy.tileCounts = new Map(this.tileCounts);
    copy.societies = new Map([...this.societies].map(([owner, society]) => [owner, { ...society, discoveries: society.discoveries && new Set(society.discoveries) }]));
    copy.buildings = new Map(this.buildings); copy.wonders = new Map(this.wonders); copy.damaged = new Set(this.damaged);
    copy.met = this.met && new Set(this.met); copy.suzerains = this.suzerains && new Map(this.suzerains);
    copy.celebrating = this.celebrating; copy.crisis = this.crisis; copy.age = this.age;
    return copy;
  }
  observe(turn, frame, record, players, discoveryName, warName, extra = {}) {
    if (!record) return;
    const initial = this.turns++ === 0;
    const add = (text, details, plots = []) => {
      const date = frame[3] || `recorded turn ${turn + 1}`;
      this.events.push({ turn, date, details, plots: [...new Set(plots)], text: `In ${date} ${text}` });
    };
    const all = this.owner === null, beforeIdentities = this.identities;
    if (players && Array.isArray(players.idd)) {
      const current = record.s === 1 ? new Map() : new Map(this.identities);
      for (const row of players.idd) {
        if (row.length === 1) current.delete(row[0]); else current.set(row[0], row.slice(1));
      }
      this.identities = current;
    }
    const civ = id => {
      const identity = this.identities.get(id) || beforeIdentities.get(id);
      return identity && (extra.civilizationName ? extra.civilizationName(identity) : identity[1] || identity[2]) || `Civilization ${id}`;
    };
    const affects = owner => all ? this.identities.has(owner) || beforeIdentities.has(owner) : owner === this.owner;
    if (!initial && this.age !== frame[0]) add(`${all ? 'The world' : civ(this.owner)} entered a new Age.`,
      `${all ? 'The peoples of the world' : civ(this.owner)} left the former Age behind as a new chapter of history began.`);
    this.age = frame[0];
    if (!initial) for (const [owner, identity] of this.identities) {
      if (!affects(owner)) continue;
      const beforeIdentity = beforeIdentities.get(owner);
      if (!beforeIdentity) continue;
      if (beforeIdentity[5] !== identity[5]) add(`${civ(owner)} emerged as a new civilization.`,
        `${beforeIdentity[1] || beforeIdentity[2]} gave way to ${civ(owner)}, marking a change in the realm's identity.`);
      if (beforeIdentity[7] !== identity[7] && identity[7]) add(`${civ(owner)} adopted ${identity[7]}.`,
        `${civ(owner)} embraced ${identity[7]}${beforeIdentity[7] ? ` in place of ${beforeIdentity[7]}` : ' as their form of government'}.`);
    }
    const oldTiles = this.tileCount, oldCounts = all ? new Map(this.tileCounts) : null;
    const beforeTerritory = record.s === 1 ? this.territory : null, changedPlaces = new Map();
    const markTerritoryChange = (owner, plot, direction) => {
      if (initial || owner === undefined || owner < 0 || !affects(owner)) return;
      const name = extra.placeName && extra.placeName(plot);
      if (!changedPlaces.has(owner)) changedPlaces.set(owner, { gained: new Set(), lost: new Set(), gainedPlots: [], lostPlots: [] });
      if (name) changedPlaces.get(owner)[direction].add(name);
      changedPlaces.get(owner)[`${direction}Plots`].push(plot);
    };
    if (record.s === 1) { this.territory = new Map(); this.tileCount = 0; this.tileCounts.clear(); }
    for (const packed of record.terr || []) {
      const plot = Math.floor(packed / 1024), owner = Math.floor((packed % 1024) / 8) - 1;
      const previousOwner = (beforeTerritory || this.territory).get(plot);
      if (previousOwner !== owner) {
        markTerritoryChange(previousOwner, plot, 'lost');
        markTerritoryChange(owner, plot, 'gained');
      }
      if (all) {
        const previous = this.territory.get(plot);
        if (previous !== undefined) this.tileCounts.set(previous, (this.tileCounts.get(previous) || 0) - 1);
        if (owner >= 0) this.tileCounts.set(owner, (this.tileCounts.get(owner) || 0) + 1);
      }
      if (this.territory.get(plot) === this.owner) this.tileCount--;
      if (owner === this.owner) this.tileCount++;
      if (owner < 0) this.territory.delete(plot); else this.territory.set(plot, owner);
    }
    if (beforeTerritory) for (const [plot, owner] of beforeTerritory) {
      if (!this.territory.has(plot)) markTerritoryChange(owner, plot, 'lost');
    }
    const newTiles = this.tileCount;
    if (!initial) for (const owner of all ? new Set([...oldCounts.keys(), ...this.tileCounts.keys()]) : [this.owner]) {
      if (!affects(owner)) continue;
      const before = all ? oldCounts.get(owner) || 0 : oldTiles, after = all ? this.tileCounts.get(owner) || 0 : newTiles;
      if (before !== after) {
        const gained = after > before, changes = changedPlaces.get(owner);
        const places = changes ? [...changes[gained ? 'gained' : 'lost']].sort() : [];
        const location = places.length ? ` in ${places.length > 1 ? `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}` : places[0]}` : '';
        add(`${civ(owner)} ${gained ? 'expanded their territory' : 'saw their borders recede'}${location}.`,
          gained ? `New lands${location} came under ${civ(owner)} rule, extending the realm beyond its former borders.`
            : `Lands${location} passed beyond ${civ(owner)} control, narrowing the realm's frontier.`,
          changes ? changes[`${gained ? 'gained' : 'lost'}Plots`] : []);
      }
    }
    const seen = new Set();
    for (const row of record.set || []) {
      const plot = row[0], previous = this.settlements.get(plot);
      seen.add(plot);
      if (row.length === 1) {
        if (previous && affects(previous.owner)) add(`${previous.name} was lost or destroyed.`,
          `${previous.name} disappeared from the settlements of ${civ(previous.owner)}; its fate is not established by the surviving record.`, [plot]);
        this.settlements.delete(plot); continue;
      }
      const owner = this.territory.get(plot), name = row[1];
      const place = all ? `${name} (${civ(owner)})` : name;
      if (affects(owner)) {
        if (!previous) add(`${place} ${initial && frame[1] > 1 ? 'was first recorded' : 'was founded'}.`,
          initial && frame[1] > 1 ? `${name} was already a ${row[3]} of ${civ(owner)} when these chronicles began.`
            : `${name} took its place among the settlements of ${civ(owner)}, beginning a new chapter in the land's history.`, [plot]);
        else if (previous.owner !== owner) add(`${name} came under ${civ(owner)} control.`,
          `${name}, formerly held by ${civ(previous.owner)}, became part of ${civ(owner)}. The record does not establish how rule changed.`, [plot]);
        else {
          if (previous.name !== name) add(`${previous.name} was renamed ${place}.`,
            `The settlement once known as ${previous.name} now bore the name ${name} under ${civ(owner)} rule.`, [plot]);
          if (previous.type !== row[3]) add(`${place} became ${row[3]}.`,
            `${name} changed from ${previous.type} to ${row[3]}, taking on a new standing within ${civ(owner)}.`, [plot]);
          if (Number.isFinite(previous.population) && row[2] !== previous.population) add(`${place}'s population ${row[2] > previous.population ? 'grew' : 'dwindled'}.`,
            `${name} ${row[2] > previous.population ? 'became home to a growing community' : 'was home to a smaller community than before'}. Its recorded population changed from ${previous.population} to ${row[2]}.`, [plot]);
          for (let yieldIndex = 0; yieldIndex < (row[4] || []).length; yieldIndex++) {
            const before = previous.yields && previous.yields[yieldIndex], after = row[4][yieldIndex];
            if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
              const resource = ['food', 'production', 'gold', 'science', 'culture', 'happiness', 'influence'][yieldIndex] || 'local output';
              const milestone = ['harvests flourished', 'workshops thrived', 'wealth grew', 'scholarship flourished', 'cultural life flourished', 'spirits rose', 'influence grew'][yieldIndex] || 'prosperity grew';
              const oldJobs = extra.occupationCounts?.(plot, turn - 1)?.[yieldIndex];
              const newJobs = extra.occupationCounts?.(plot, turn)?.[yieldIndex];
              const counted = Number.isFinite(oldJobs) && Number.isFinite(newJobs);
              const delta = counted ? newJobs - oldJobs : null;
              const count = delta === null ? '' : Math.abs(delta).toLocaleString('en-US');
              const details = counted
                ? `${name} ${delta >= 0 ? 'gained' : 'lost'} ${count} people in ${resource}-related occupations; this workforce changed from ${oldJobs.toLocaleString('en-US')} to ${newJobs.toLocaleString('en-US')}.`
                : `${name}'s ${resource}-related workforce ${after > before ? 'expanded' : 'contracted'}; simulated occupation counts are unavailable in this record.`;
              add(`${place}'s ${after > before ? milestone : `${resource}-related workforce declined`}.`, details, [plot]);
            }
          }
        }
      } else if (previous && affects(previous.owner) && owner !== undefined) add(`${name} came under ${civ(owner)} control.`,
        `${name} passed from ${civ(previous.owner)} to ${civ(owner)}, changing the reach of both realms.`, [plot]);
      this.settlements.set(plot, { name, owner, type: row[3], population: row[2], yields: row[4] });
    }
    // Ownership can change without a settlement-data delta.
    for (const [plot, settlement] of this.settlements) {
      const owner = this.territory.get(plot);
      if (!seen.has(plot) && owner !== undefined && owner !== settlement.owner) {
        if (affects(owner) || affects(settlement.owner)) add(`${settlement.name} came under ${civ(owner)} control.`,
          `${settlement.name} passed from ${civ(settlement.owner)} to ${civ(owner)}, changing the reach of both realms.`, [plot]);
        settlement.owner = owner;
      }
      if (record.s === 1 && !seen.has(plot)) this.settlements.delete(plot);
    }
    if (players && Array.isArray(players.rel)) {
      const current = record.s === 1 ? new Map() : new Map(this.relations);
      for (const [a, b, code] of players.rel) {
        const key = `${a},${b}`;
        if (code === undefined) current.delete(key); else current.set(key, code);
      }
      for (const key of new Set([...this.relations.keys(), ...current.keys()])) {
        const pair = key.split(',').map(Number);
        if (!pair.some(affects)) continue;
        const before = this.relations.get(key), after = current.get(key);
        const nations = `${civ(pair[0])} and ${civ(pair[1])}`;
        if (all && !initial && (before === undefined || before < 0) && after >= 0) add(`${nations} made first contact.`,
          `${nations} entered one another's diplomatic world, beginning their recorded relationship.`);
        if (before !== 4 && after === 4) add(initial ? `${nations} were already at war.` : `${warName(pair, this.territory)} began between ${nations}.`,
          initial ? `${nations} were fighting when these chronicles began; the outbreak predates the surviving record.`
            : `${nations} entered open war. The outcome of their struggle was yet to be written.`);
        if (!initial && before === 4 && after !== 4) add(`The war between ${nations} ended.`,
          `${nations} were no longer at war, closing a chapter of open conflict between their realms.`);
        if (before !== 3 && after === 3) add(`${nations} ${initial ? 'were allied' : 'formed an alliance'}.`,
          `${nations} ${initial ? 'shared an alliance when these chronicles began' : 'became allies, binding their realms in a new diplomatic partnership'}.`);
        if (!initial && before === 3 && after !== 3) add(`The alliance between ${nations} ended.`,
          `${nations} no longer shared their former alliance; its dissolution changed the diplomatic balance.`);
        if (!initial && after !== before && after === 1) add(`Relations between ${nations} became friendly.`,
          `Goodwill marked a warmer chapter in the recorded relations of ${nations}.`);
        if (!initial && after !== before && after === 2) add(`Relations between ${nations} became hostile.`,
          `Hostility darkened relations between ${nations}, though the record does not establish its cause.`);
      }
      this.relations = current;
    }
    for (const society of players && Array.isArray(players.soc) ? players.soc : []) {
      const owner = society[0];
      if (!affects(owner)) continue;
      const state = all ? this.societies.get(owner) || {} : this;
      if (Array.isArray(society[1])) {
        const next = new Set(society[1]);
        if (state.discoveries) for (const id of next) if (!state.discoveries.has(id)) add(`${civ(owner)} mastered ${discoveryName(id)}.`,
          `${discoveryName(id)} joined the knowledge and traditions of ${civ(owner)}, marking a new step in the realm's development.`);
        state.discoveries = next;
      }
      for (const [index, field, start, end] of [[2, 'celebrating', 'began a celebration', 'ended a celebration'], [3, 'crisis', 'entered an Age crisis', 'emerged from an Age crisis']]) {
        const current = society[index];
        if (typeof current !== 'boolean') continue;
        if (typeof state[field] === 'boolean' && current !== state[field]) add(`${civ(owner)} ${current ? start : end}.`,
          field === 'celebrating' ? `${civ(owner)} ${current ? 'entered a season of celebration and public rejoicing' : 'brought their season of celebration to a close'}.`
            : `${civ(owner)} ${current ? 'faced the upheaval of an Age crisis, opening an uncertain chapter for the realm' : 'left the Age crisis behind and entered a new chapter of recovery'}.`);
        state[field] = current;
      }
      if (all) this.societies.set(owner, state);
    }
    if (!all && players && Array.isArray(players.met)) {
      const current = new Set(players.met);
      if (this.met) for (const other of current) if (other !== this.owner && !this.met.has(other)) add(`${civ(this.owner)} made first contact with ${civ(other)}.`,
        `${civ(other)} entered the diplomatic horizon of ${civ(this.owner)}, beginning their recorded relationship.`);
      this.met = current;
    }
    if (extra.suzerains) {
      const current = new Map(extra.suzerains);
      if (this.suzerains) for (const id of new Set([...current.keys(), ...this.suzerains.keys()])) {
        const before = this.suzerains.get(id), after = current.get(id);
        if (before !== after && affects(after)) add(`${civ(after)} became suzerain of ${civ(id)}.`,
          `${civ(after)} gained suzerainty over ${civ(id)}${before !== undefined && before >= 0 ? `, replacing ${civ(before)}` : ''}.`);
        if (before !== after && affects(before) && (!all || !affects(after))) add(`${civ(before)} lost suzerainty over ${civ(id)}.`,
          `${civ(id)} passed beyond ${civ(before)} suzerainty${after !== undefined && after >= 0 ? ` and into the influence of ${civ(after)}` : ''}.`);
      }
      this.suzerains = current;
    }
    const buildingName = id => extra.buildingName ? extra.buildingName(id) : `constructible ${id}`;
    const wonderName = id => extra.wonderName ? extra.wonderName(id) : `wonder ${id}`;
    const constructionEvents = new Map();
    const buildings = record.s === 1 ? new Map() : this.buildings;
    for (const [plot, list] of record.bld || []) {
      const previous = this.buildings.get(plot) || [], next = list || [];
      const owner = this.territory.get(plot);
      if (!initial && affects(owner)) {
        for (const id of new Set([...previous, ...next])) {
          const change = next.filter(type => type === id).length - previous.filter(type => type === id).length;
          if (change) {
            const key = `${owner},${id}`, previous = constructionEvents.get(key);
            constructionEvents.set(key, { owner, id, count: (previous ? previous.count : 0) + change, plots: [...previous && previous.plots || [], plot] });
          }
        }
      }
      if (next.length) buildings.set(plot, next.slice()); else buildings.delete(plot);
    }
    this.buildings = buildings;
    for (const { owner, id, count, plots } of constructionEvents.values()) if (count) add(
      `${civ(owner)} ${count > 0 ? 'developed their' : 'lost part of their'} ${buildingName(id)} infrastructure.`,
      `${civ(owner)} ${count > 0 ? 'gained' : 'lost'} ${Math.abs(count)} ${buildingName(id)} ${Math.abs(count) === 1 ? 'building' : 'buildings'}, ${count > 0 ? 'expanding' : 'diminishing'} the realm's built landscape.`, plots);
    const wonders = record.s === 1 ? new Map() : this.wonders;
    for (const row of record.won || []) {
      const previous = this.wonders.get(row[0]);
      if (!initial) {
        if (row.length > 1 && affects(row[1]) && (!previous || previous[0] !== row[1])) add(`${civ(row[1])} ${previous ? 'gained control of' : 'completed'} ${wonderName(row[2])}.`,
          previous ? `${wonderName(row[2])} passed from ${civ(previous[0])} to ${civ(row[1])}, bringing the great monument under new rule.`
            : `${wonderName(row[2])} joined the great monuments of ${civ(row[1])}, leaving a new landmark in the realm's history.`, [row[0]]);
        if (previous && affects(previous[0]) && (row.length === 1 || row[1] !== previous[0]) && (!all || row.length === 1)) add(`${civ(previous[0])} lost ${wonderName(previous[1])}.`,
          `${wonderName(previous[1])} no longer stood among the wonders held by ${civ(previous[0])}.`, [row[0]]);
      }
      if (row.length > 1) wonders.set(row[0], row.slice(1)); else wonders.delete(row[0]);
    }
    this.wonders = wonders;
    const damaged = record.s === 1 ? new Set() : this.damaged;
    for (const row of record.dmg || []) {
      const plot = row[0], pillaged = row.length > 1 && row[1].length > 0;
      const owner = this.territory.get(plot);
      if (!initial && affects(owner) && pillaged !== this.damaged.has(plot)) {
        const settlement = this.settlements.get(plot), region = extra.placeName && extra.placeName(plot);
        const location = settlement ? ` at ${settlement.name}` : region ? ` in ${region}` : '';
        add(`${civ(owner)} ${pillaged ? 'suffered pillaging' : 'restored their pillaged lands'}${location}.`,
          `${pillaged ? 'Pillaging damaged' : 'Restoration renewed'} the built landscape${location} of ${civ(owner)}. ${pillaged ? 'The record does not identify those responsible.' : 'The site was no longer recorded as pillaged.'}`, [plot]);
      }
      if (pillaged) damaged.add(plot); else damaged.delete(plot);
    }
    this.damaged = damaged;
  }
}

export function groupTimelineEvents(events) {
  const groups = [], byDate = new Map();
  events.forEach((event, index) => {
    const key = event.date || (Number.isInteger(event.turn) ? `turn:${event.turn}` : `event:${index}`);
    let group = byDate.get(key);
    if (!group) {
      group = { key, date: event.date || '', turn: event.turn, events: [] };
      byDate.set(key, group); groups.push(group);
    }
    group.events.push(event);
  });
  return groups;
}

export class LiveTimelineFeed {
  constructor() { this.reset(); }
  reset() { this.turn = -1; this.seen = new Set(); this.pending = []; this.offset = 0; }
  accept(events, turn) {
    const baseline = this.turn < 0;
    if (turn < this.turn) return;
    const recent = new Set();
    for (const event of events) {
      const key = `${event.turn}|${event.text}`;
      if (!baseline && event.turn >= this.turn && !this.seen.has(key)) this.pending.push(event);
      if (event.turn >= turn - 1) recent.add(key);
    }
    this.seen = recent; this.turn = turn;
  }
  take() {
    if (this.offset >= this.pending.length) return null;
    const event = this.pending[this.offset++];
    if (this.offset >= 128 || this.offset === this.pending.length) { this.pending = this.pending.slice(this.offset); this.offset = 0; }
    return event;
  }
}
