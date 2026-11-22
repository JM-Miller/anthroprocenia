// Pure logic for the Map View "Population Panel": a Civilization > Continent > Region > Tile > Icon type > Home Location tree with
// people under each Home Location (one icon circle). Nothing here touches the game or the DOM, so it can be tested on its own.

export const PAGE_SIZE = 60;
export const ROW_HEIGHT = 26;

export class PeopleSelection {
  constructor() { this.people = new Set(); this.homes = new Map(); this.excluded = new Set(); this.revision = 0; }
  homeOf(key) {
    const at = key.lastIndexOf('#'), home = key.slice(0, at), index = Number(key.slice(at + 1));
    return at >= 0 && Number.isInteger(index) && index >= 0 && index < (this.homes.get(home) || 0) ? home : '';
  }
  has(key) { return !this.excluded.has(key) && (!!this.homeOf(key) || this.people.has(key)); }
  add(key) { this.excluded.delete(key); if (!this.homeOf(key)) this.people.add(key); this.revision++; return this; }
  delete(key) {
    const had = this.has(key);
    this.people.delete(key);
    if (this.homeOf(key)) this.excluded.add(key);
    this.revision++;
    return had;
  }
  clear() { this.people.clear(); this.homes.clear(); this.excluded.clear(); this.revision++; }
  setHome(home, total, on) {
    this.homes.delete(home);
    for (const set of [this.people, this.excluded]) for (const key of set) if (key.slice(0, key.lastIndexOf('#')) === home) set.delete(key);
    if (on) this.homes.set(home, Math.max(0, Math.floor(total)));
    this.revision++;
  }
  homeStatus(home) {
    if (!this.homes.has(home)) return [...this.people].some(key => key.slice(0, key.lastIndexOf('#')) === home) ? 'mixed' : 'false';
    const excluded = [...this.excluded].filter(key => this.homeOf(key) === home).length;
    return excluded === 0 ? 'true' : excluded >= this.homes.get(home) ? 'false' : 'mixed';
  }
  get size() {
    let total = this.people.size;
    for (const n of this.homes.values()) total += n;
    for (const key of this.excluded) if (this.homeOf(key)) total--;
    return total;
  }
}

// How the people of a Home Location are listed: in their own order, sorted by occupation, or in one group per occupation.
export const SORT_MODES = ['default', 'occupation', 'groups'];
export const SORT_LABELS = { default: 'Default', occupation: 'Occupation', groups: 'Occupation Groups' };
export function nextSortMode(mode) { return SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length]; }

// The kind of icon an icon circle is ("Farm", "Warrior"), which its Home Location is listed under. Entries normally carry
// it; otherwise a constructible's ten circles (`b<type>.<n>.<dot>`) share their type and anything else stands alone.
export function homeGroupFor(icon) {
  if (icon.group && icon.group.id) return icon.group;
  const match = /^b(\d+)\./.exec(String(icon.id));
  return match ? { id: `b${match[1]}`, name: icon.typeName || icon.name } : { id: String(icon.id), name: icon.name };
}
export function tileNodeId(civId, continentId, tileIndex) { return `c:${civId}|k:${continentId}|t:${tileIndex}`; }
export function iconNodeId(civId, continentId, tileIndex, groupId, iconId) { return `${tileNodeId(civId, continentId, tileIndex)}|g:${groupId}|i:${iconId}`; }
export function occupationNodeId(iconId, title) { return `${iconId}|o:${title}`; }

export function formatThousands(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const byTotal = (a, b) => b.total - a.total || String(a.label).localeCompare(String(b.label));

// entries: [{ civ: { id, name }, continent: { id, name }, tile: { index, name }, icon: { id, name, kind, population, ... } }]
// Returns the civilization nodes, each carrying the total population of everything beneath it. Larger groups come first.
export function buildPopulationTree(entries) {
  const civs = new Map();
  const child = (parent, id, make) => {
    let node = parent.get(id);
    if (!node) { node = make(); node.map = new Map(); parent.set(id, node); }
    return node;
  };
  for (const entry of entries) {
    const population = Math.max(0, Math.floor(Number(entry.icon.population) || 0));
    if (!population) continue;
    const civId = `c:${entry.civ.id}`;
    const civ = child(civs, civId, () => ({ id: civId, kind: 'civ', label: entry.civ.name, total: 0, children: [] }));
    const contId = `${civId}|k:${entry.continent.id}`;
    const continent = child(civ.map, contId, () => ({ id: contId, kind: 'continent', label: entry.continent.name, total: 0, children: [] }));
    const regionId = entry.region && `${contId}|r:${entry.region.id}`;
    const region = regionId ? child(continent.map, regionId, () => ({
      id: regionId, kind: 'region', geographicKind: entry.region.type, label: entry.region.name, total: 0, children: [],
    })) : null;
    const tileId = tileNodeId(entry.civ.id, entry.continent.id, entry.tile.index);
    const tile = child((region || continent).map, tileId, () => ({ id: tileId, kind: 'tile', label: entry.tile.name, tile: entry.tile.index, total: 0, children: [] }));
    const home = homeGroupFor(entry.icon), groupId = `${tileId}|g:${home.id}`;
    const iconId = `${groupId}|i:${entry.icon.id}`;
    if (tile.map.has(groupId) && tile.map.get(groupId).map.has(iconId)) continue;
    const group = child(tile.map, groupId, () => ({ id: groupId, kind: 'group', iconKind: entry.icon.kind, label: home.name, tile: entry.tile.index, total: 0, children: [] }));
    const icon = { id: iconId, kind: 'icon', iconKind: entry.icon.kind, label: entry.icon.name, tile: entry.tile.index, total: population, icon: entry.icon, children: [] };
    group.map.set(iconId, icon);
    group.total += population; tile.total += population; continent.total += population; civ.total += population;
    if (region) region.total += population;
  }
  const finish = node => {
    if (!node.map) return node;
    node.children = [...node.map.values()].map(finish).sort(byTotal);
    delete node.map;
    return node;
  };
  return [...civs.values()].map(finish).sort(byTotal);
}

// The rows the panel shows given what is expanded. Every list (civilizations, a civilization's continents, a Home
// Location's people...) is shown a page at a time, so a total in the millions never produces millions of rows.
// `shown` maps a parent id (or 'root') to how many of its children are currently listed.
// options: { sort: one of SORT_MODES, plan(iconNode) => homePlan, occupationLabel(title) => text }. Sorting by occupation
// needs the Home Location's plan (see homePlan in the people module); without one people are listed in their own order.
export function visibleRows(tree, expanded, shown, options = {}) {
  const rows = [];
  const limitFor = id => Math.max(PAGE_SIZE, (shown && shown.get(id)) || PAGE_SIZE);
  const sort = SORT_MODES.includes(options.sort) ? options.sort : 'default';
  const people = (node, parentId, count, indexAt, depth) => {
    const limit = limitFor(parentId);
    for (let p = 0; p < count && p < limit; p++) rows.push({ type: 'person', node, index: indexAt(p), depth });
    if (count > limit) rows.push({ type: 'more', parentId, remaining: count - limit, depth });
  };
  const home = (node, depth) => {
    const plan = sort !== 'default' && options.plan ? options.plan(node) : null;
    if (!plan || plan.total !== node.total) { people(node, node.id, node.total, p => p, depth); return; }
    if (sort === 'occupation') { people(node, node.id, node.total, p => plan.personAt(p), depth); return; }
    const limit = limitFor(node.id);
    plan.groups.forEach((group, g) => {
      if (g >= limit) return;
      const id = occupationNodeId(node.id, group.title), open = expanded.has(id);
      const label = options.occupationLabel ? options.occupationLabel(group.title) : group.title;
      const occupation = { id, kind: 'occupation', label, title: group.title, total: group.count, start: group.start, tile: node.tile, home: node, children: [] };
      rows.push({ type: 'node', node: occupation, depth, open });
      if (open) people(node, id, group.count, p => plan.personAt(group.start + p), depth + 1);
    });
    if (plan.groups.length > limit) rows.push({ type: 'more', parentId: node.id, remaining: plan.groups.length - limit, depth });
  };
  const walk = (list, depth, parentId) => {
    const limit = limitFor(parentId);
    for (let i = 0; i < list.length && i < limit; i++) {
      const node = list[i], open = expanded.has(node.id);
      rows.push({ type: 'node', node, depth, open });
      if (!open) continue;
      if (node.kind === 'icon') home(node, depth + 1);
      else walk(node.children, depth + 1, node.id);
    }
    if (list.length > limit) rows.push({ type: 'more', parentId, remaining: list.length - limit, depth });
  };
  walk(tree, 0, 'root');
  return rows;
}

export function showMore(shown, parentId) {
  shown.set(parentId, Math.max(PAGE_SIZE, shown.get(parentId) || PAGE_SIZE) + PAGE_SIZE);
}

// The slice of `count` rows to draw for a scrolled viewport, plus the scroll offset kept within range.
export function windowRows(count, scroll, viewHeight, rowHeight = ROW_HEIGHT, buffer = 4) {
  const contentHeight = count * rowHeight, maxScroll = Math.max(0, contentHeight - viewHeight);
  const offset = Math.max(0, Math.min(maxScroll, Number(scroll) || 0));
  const start = Math.max(0, Math.floor(offset / rowHeight) - buffer);
  const end = Math.min(count, Math.ceil((offset + viewHeight) / rowHeight) + buffer);
  return { start, end, offset, maxScroll, contentHeight };
}

// Mouse wheel and engine wheel events can both report the same notch; drop the repeat.
export function wheelStep(delta, now, lastStamp, dedupeMs = 20) {
  if (now - lastStamp < dedupeMs) return 0;
  return delta > 0 ? ROW_HEIGHT * 3 : delta < 0 ? -ROW_HEIGHT * 3 : 0;
}

// Keeps a selected node's row in view; returns the new scroll offset.
export function scrollToRow(rowIndex, scroll, viewHeight, rowHeight = ROW_HEIGHT) {
  const top = rowIndex * rowHeight, bottom = top + rowHeight;
  if (top < scroll) return top;
  if (bottom > scroll + viewHeight) return bottom - viewHeight;
  return scroll;
}

export function ancestorIds(id, tree = null) {
  if (tree) {
    const find = (nodes, path) => {
      for (const node of nodes) {
        if (node.id === id) return path;
        const found = find(node.children || [], [...path, node.id]);
        if (found) return found;
      }
      return null;
    };
    const found = find(tree, []);
    if (found) return found;
  }
  const parts = String(id).split('|'), ids = [];
  for (let i = 1; i < parts.length; i++) ids.push(parts.slice(0, i).join('|'));
  return ids;
}

export function isSelectableNode(node) { return !!node && (node.kind === 'tile' || node.kind === 'icon'); }

export function personKey(nodeId, index) { return `${nodeId}#${index}`; }
// Units move, so the people of a unit's Home Location are known by its owner and unit id (the `i:u...` part) rather than by
// the tile it stands on; every other Home Location stays put and keeps its whole node id.
export function personBaseId(nodeId) {
  const id = String(nodeId), m = /^(c:[^|]*)\|.*\|(i:u[^|]*)$/.exec(id);
  return m ? `${m[1]}|${m[2]}` : id;
}
export function stablePersonKey(key) {
  const k = String(key), at = k.lastIndexOf('#');
  return at < 0 ? k : personBaseId(k.slice(0, at)) + k.slice(at);
}

// Whether a row stands for what is hovered on the map. hover: { person: personKey | '', home: Home Location node id | '',
// tile: tile index | -1 }. A hovered person lights up their own row, their Home Location and their tile; a hovered icon
// circle its Home Location and tile; a hovered tile its tile row(s).
export function rowHovered(row, hover) {
  if (!hover || !row) return false;
  if (row.type === 'pin') return !!hover.person && row.pin.key === hover.person;
  if (row.type === 'person') return !!hover.person && personKey(row.node.id, row.index) === hover.person;
  if (row.type !== 'node') return false;
  const node = row.node;
  if (node.kind === 'icon') return !!hover.home && node.id === hover.home;
  if (node.kind === 'tile') return hover.home ? hover.home.startsWith(`${node.id}|`) : hover.tile >= 0 && node.tile === hover.tile;
  return false;
}

// Opens every level above person `personIndex` of Home Location `nodeId` (and the Home Location itself, and their
// occupation group when people are grouped by occupation) and widens every "show more" page so that row is listed.
// `options` is the same as visibleRows'. Returns the icon node, or null when the tree has no such Home Location.
export function revealPerson(tree, nodeId, personIndex, expanded, shown, options = {}) {
  const path = [...ancestorIds(nodeId, tree), nodeId];
  let list = tree, parentId = 'root', node = null;
  const cover = (id, count) => {
    const needed = Math.ceil(count / PAGE_SIZE) * PAGE_SIZE;
    if ((shown.get(id) || PAGE_SIZE) < needed) shown.set(id, needed);
  };
  for (const id of path) {
    const at = list.findIndex(candidate => candidate.id === id);
    if (at < 0) return null;
    cover(parentId, at + 1);
    node = list[at];
    expanded.add(id);
    list = node.children; parentId = id;
  }
  if (!node || node.kind !== 'icon' || personIndex < 0 || personIndex >= node.total) return null;
  const sort = SORT_MODES.includes(options.sort) ? options.sort : 'default';
  const plan = sort !== 'default' && options.plan ? options.plan(node) : null;
  if (!plan || plan.total !== node.total) cover(node.id, personIndex + 1);
  else if (sort === 'occupation') cover(node.id, plan.slotOf(personIndex) + 1);
  else {
    const g = plan.groupOf(personIndex), group = plan.groups[g], id = occupationNodeId(node.id, group.title);
    cover(node.id, g + 1);
    expanded.add(id);
    cover(id, plan.slotOf(personIndex) - group.start + 1);
  }
  return node;
}

// Where person `index` of icon `nodeId` is among the visible rows, or -1.
export function personRowIndex(rows, nodeId, index) {
  return rows.findIndex(row => row.type === 'person' && row.node.id === nodeId && row.index === index);
}

// The scroll offset that puts row `rowIndex` in the middle of the view.
export function centerScroll(rowIndex, viewHeight, rowHeight = ROW_HEIGHT) {
  return Math.max(0, rowIndex * rowHeight - (viewHeight - rowHeight) / 2);
}

// ---- search -------------------------------------------------------------------------------------------------------------------
export function normalizeQuery(text) { return String(text || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// Interleaved IDs assign every person to one roof without storing or scanning millions of residents.
export function buildingResidents(total, slot, roofs, excluded = []) {
  const count = roofs > 0 && slot >= 0 && slot < roofs ? Math.max(0, Math.ceil((total - slot) / roofs)) : 0;
  const includes = i => i >= 0 && i < total && i % roofs === slot;
  const removed = [...new Set(excluded.filter(includes).map(i => (i - slot) / roofs))].sort((a, b) => a - b);
  return { count: count - removed.length, indexAt: i => {
    let rank = i;
    for (const n of removed) { if (n > rank) break; rank++; }
    return slot + rank * roofs;
  }, includes: i => includes(i) && !removed.includes((i - slot) / roofs) };
}

export function buildingHousing(total, buildings, age = 0) {
  total = Math.max(0, Math.floor(total));
  const era = Math.max(0, Math.min(2, age | 0)), small = [3, 4, 6][era], big = [15, 20, 30][era];
  const areas = buildings.map(b => b.box ? Math.max(0, (b.box.x1 - b.box.x0) * (b.box.y1 - b.box.y0)) : 0);
  const largest = Math.max(0, ...areas), large = areas.map(area => largest > 0 && area >= largest * 0.35);
  // Cycle IDs through weighted roof slots; big roofs get five shares without per-person arrays.
  const explicit = buildings.some(b => b.housingWeight !== undefined);
  const stride = !explicit && large.length && large.every(Boolean) ? 5 : 1;
  const weights = large.map((big, i) => (buildings[i].housingWeight ?? (big ? 5 : 1)) / stride);
  const period = weights.reduce((sum, n) => sum + n, 0);
  const capacity = buildings.reduce((sum, b, i) => sum + weights[i] * stride * small * (b.capacityShare ?? 1), 0), homes = new Map(), ranges = [];
  let start = 0;
  buildings.forEach((b, i) => {
    const width = weights[i], first = start, end = start + width;
    const count = Math.floor(total / period) * width + Math.max(0, Math.min(width, total % period - first));
    const includes = id => id >= 0 && id < total && id % period >= first && id % period < end;
    const residents = excluded => {
      const removed = [...new Set((excluded || []).filter(includes))].sort((a, b) => a - b);
      const ranks = removed.map(id => Math.floor(id / period) * width + id % period - first);
      return { count: count - removed.length, includes: id => includes(id) && !removed.includes(id), indexAt: i => {
        let rank = i;
        for (const n of ranks) { if (n > rank) break; rank++; }
        return Math.floor(rank / width) * period + first + rank % width;
      } };
    };
    homes.set(b.sourceIndex, { count, capacity: (b.housingWeight !== undefined ? b.housingWeight * small : large[i] ? big : small) * (b.capacityShare ?? 1), residents });
    ranges.push({ end, sourceIndex: b.sourceIndex });
    start = end;
  });
  return { homes, capacity, overflow: total > capacity, sourceOf(id) {
    if (id < 0 || id >= total || !ranges.length) return null;
    const slot = id % period;
    let lo = 0, hi = ranges.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (slot < ranges[mid].end) hi = mid; else lo = mid + 1; }
    return ranges[lo].sourceIndex;
  } };
}

export function buildingPopulationRows(node, residents, inside, shown, query = '', personText = () => '', options = {}) {
  const rows = [], q = normalizeQuery(query);
  const section = (id, label, count, at) => {
    const collapsed = !!options.collapsed && options.collapsed.has(id);
    rows.push({ type: 'header', sectionId: id, collapsed, label: `${label} (${formatThousands(count)})`, depth: 0 });
    if (collapsed) return;
    const limit = Math.max(PAGE_SIZE, shown.get(id) || PAGE_SIZE);
    const scanned = q ? Math.min(count, Math.max(2000, limit)) : Math.min(count, limit);
    let found = 0;
    for (let i = 0; i < scanned; i++) {
      const row = at(i);
      if (q && !matchesQuery(`${row.node.label} ${personText(row.node, row.index)}`, q)) continue;
      if (found++ < limit) rows.push({ type: 'person', ...row, depth: 0 });
    }
    if (!q && count > limit) rows.push({ type: 'more', parentId: id, remaining: count - limit, depth: 0 });
    if (q && scanned < count) rows.push({ type: 'note', label: `Searched ${formatThousands(scanned)} of ${formatThousands(count)}; clear search to page through everyone.`, depth: 0 });
    if (!found) rows.push({ type: 'note', label: q ? 'No matches in searched people' : 'None', depth: 0 });
  };
  section(`inside:${node.id}`, 'Currently inside', inside.count, inside.rowAt);
  const outside = options.outside || [];
  section(`outside:${node.id}`, 'Currently outside', outside.length, i => outside[i]);
  section(`residents:${node.id}`, 'Lives here', residents.count, i => ({ node, index: residents.indexAt(i) }));
  return rows;
}

export function matchesQuery(text, query) { return !!query && String(text || '').toLowerCase().includes(query); }
// Rows matching a search: every level whose name matches (civilizations, continents, tiles, icon kinds, Home Locations), then
// people whose name, occupation or age matches. A world can hold millions of people, so people are searched within a budget:
// the open Home Locations first (deeper), then every other Home Location's first `perHome` people.
// options: { personText(iconNode, index) => searchable text, expanded: Set, budget, perHome, maxResults }
// Returns { rows, scanned, people } (`people` is how many people there are in all; `scanned` how many were searched).
export function searchPopulation(tree, query, options = {}) {
  const q = normalizeQuery(query), rows = [], homes = [];
  const maxResults = options.maxResults || 200, perHome = options.perHome || 200;
  let budget = options.budget || 2000, scanned = 0, people = 0;
  if (!q) return { rows, scanned, people };
  const walk = list => {
    for (const node of list) {
      if (rows.length < maxResults && matchesQuery(node.label, q)) rows.push({ type: 'node', node, depth: 0, open: false, result: true });
      if (node.kind === 'icon') { homes.push(node); people += node.total; } else walk(node.children || []);
    }
  };
  walk(tree);
  const expanded = options.expanded || new Set();
  const ordered = [...homes.filter(h => expanded.has(h.id)), ...homes.filter(h => !expanded.has(h.id))];
  for (const home of ordered) {
    if (budget <= 0 || rows.length >= maxResults) break;
    const limit = Math.min(home.total, budget, expanded.has(home.id) ? budget : perHome);
    for (let i = 0; i < limit && rows.length < maxResults; i++) {
      if (options.personText && matchesQuery(options.personText(home, i), q)) rows.push({ type: 'person', node: home, index: i, depth: 0, result: true });
    }
    budget -= limit; scanned += limit;
  }
  return { rows, scanned, people };
}

// ---- pins ---------------------------------------------------------------------------------------------------------------------
// The panel's pinned people come first, under their own heading, then everyone else (or the search results).
export function withPinnedSection(pinnedRows, bodyRows, bodyLabel) {
  if (!pinnedRows.length) return bodyLabel ? [{ type: 'header', label: bodyLabel }, ...bodyRows] : bodyRows;
  return [{ type: 'header', label: `Pinned (${pinnedRows.length})` }, ...pinnedRows, { type: 'header', label: bodyLabel || 'Everyone' }, ...bodyRows];
}

// "Brutus Brutii Farmer The Brutii Wheat Farm" as separate columns.
export function personRowParts(profile, homeName) {
  return { name: profile.name, occupation: profile.occupation, home: homeName };
}

export function nodeCountText(node) { return formatThousands(node.total); }

// How many of the people under a panel node have each occupation: Map title -> count. A Home Location's come from its plan
// (planFor(iconNode), see homePlan), an occupation group is its own count, and anything higher adds up its Home Locations.
// `cache` (a Map by node id) keeps the totals of nodes already worked out.
export function occupationCounts(node, planFor, cache) {
  if (!node) return new Map();
  if (cache && cache.has(node.id)) return cache.get(node.id);
  let counts = new Map();
  if (node.kind === 'occupation') counts.set(node.title, node.total);
  else if (node.kind === 'icon') {
    const plan = planFor ? planFor(node) : null;
    if (plan) for (const group of plan.groups) counts.set(group.title, (counts.get(group.title) || 0) + group.count);
  } else {
    for (const child of node.children || []) {
      for (const [title, count] of occupationCounts(child, planFor, cache)) counts.set(title, (counts.get(title) || 0) + count);
    }
  }
  counts = new Map([...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  if (cache) cache.set(node.id, counts);
  return counts;
}
// The lines of a panel row's occupations tooltip: a heading, then "Farmer: 1,204" for the `max` commonest occupations and
// how many more there are.
export function occupationTipLines(node, counts, labelFor, max = 12) {
  const heading = node.kind === 'icon' ? `Home Location: ${node.label}` : node.label;
  const lines = [`${heading} (${formatThousands(node.total)} people)`];
  if (!counts.size) { lines.push('No occupations recorded'); return lines; }
  let shown = 0;
  for (const [title, count] of counts) {
    if (shown++ >= max) break;
    lines.push(`${labelFor ? labelFor(title) : title}: ${formatThousands(count)}`);
  }
  if (counts.size > max) lines.push(`and ${counts.size - max} more occupation${counts.size - max === 1 ? '' : 's'}`);
  return lines;
}

// The Leaders Panel's rows: the people in leadership roles, found among the first people of each Home Location that can hold
// leaders. homeOf(iconNode) => a kind of leaders' home ('' for none); roleOf(iconNode, index) => the person's role ('' for none);
// options: { perHome (5), max (2000), order: { kind: rank } }. Returns [{ node, index, home, role }], by home kind then as found.
export function leaderRows(tree, homeOf, roleOf, options = {}) {
  const perHome = options.perHome || 5, max = options.max || 2000, order = options.order || {}, out = [];
  const walk = list => {
    for (const node of list) {
      if (out.length >= max) return;
      if (node.kind !== 'icon') { walk(node.children || []); continue; }
      const home = homeOf(node);
      if (!home) continue;
      for (let i = 0; i < Math.min(perHome, node.total) && out.length < max; i++) {
        const role = roleOf(node, i);
        if (role) out.push({ node, index: i, home, role });
      }
    }
  };
  walk(tree || []);
  const rank = row => (order[row.home] === undefined ? 99 : order[row.home]);
  return out.map((row, i) => ({ row, i })).sort((a, b) => rank(a.row) - rank(b.row) || a.i - b.i).map(e => e.row);
}