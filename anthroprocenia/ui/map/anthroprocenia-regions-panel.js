import { formatThousands } from './anthroprocenia-population-panel.js';
import { uiGlyph } from './anthroprocenia-ui.js';

export function regionRows(geography, frame, settlements, tree, visibility, ownerName) {
  const rows = new Map(), named = new Map(), populations = new Map(), stack = [...tree];
  const continentForTile = new Map();
  for (const continent of geography.continents || []) {
    for (const index of continent.tiles || []) continentForTile.set(index, continent.name);
  }
  while (stack.length) {
    const node = stack.pop();
    if (node.kind === 'tile') populations.set(node.tile, (populations.get(node.tile) || 0) + node.total);
    else stack.push(...(node.children || []));
  }
  const add = (record, type, collection) => {
    const key = record.parentId ? `${record.parentId}|${record.name}` : record.name;
    let row = named.get(key);
    if (!row) {
      row = { id: record.id, name: record.name, type, types: [], regionIds: [], featureIds: [], continentIds: [],
        indices: new Set(), tiles: 0, population: 0, settlements: [], owners: new Map() };
      named.set(key, row);
    }
    if (!row.types.includes(type)) row.types.push(type);
    row[collection].push(record.id);
    for (const index of record.tiles || []) row.indices.add(index);
    return row;
  };
  for (const region of geography.regions) {
    const type = region.island ? 'Island' : region.water ? 'Water' : 'Region';
    const row = add(region, type, 'regionIds');
    rows.set(region.id, row);
  }
  for (const [index, id] of geography.regionForTile) {
    const row = rows.get(id);
    if (row) row.indices.add(index);
  }
  for (const subregion of geography.subregions || []) {
    const row = add(subregion, 'Sub-region', 'featureIds');
    row.parentId = rows.get(subregion.parentId)?.id;
  }
  for (const feature of geography.features || []) {
    if (feature.type === 'river' || feature.type === 'mountains') {
      add(feature, feature.type === 'river' ? 'River' : 'Mountains', 'featureIds');
    }
  }
  for (const continent of geography.continents || []) add(continent, 'Continent', 'continentIds');
  for (const row of named.values()) {
    row.tileIndices = [];
    const membership = new Map();
    for (const index of row.indices) {
      if (visibility && (visibility[index] || 0) === 0) continue;
      row.tileIndices.push(index);
      const continent = continentForTile.get(index);
      if (continent) membership.set(continent, (membership.get(continent) || 0) + 1);
      row.tiles++; row.population += populations.get(index) || 0;
      const settlement = settlements.get(index);
      if (settlement) row.settlements.push({ name: settlement[0] || 'Settlement', citizens: settlement[1] });
      const value = frame.get(index);
      if (value !== undefined) {
        const owner = (value >> 3) & 63, name = ownerName(owner);
        if (name) {
          const previous = row.owners.get(owner);
          row.owners.set(owner, { name, tiles: (previous ? previous.tiles : 0) + 1 });
        }
      }
    }
    row.continent = [...membership].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
    delete row.indices;
  }
  return [...named.values()].filter(row => row.tiles).sort((a, b) => a.name.localeCompare(b.name)).map(row => ({
    ...row, settlements: row.settlements.sort((a, b) => a.name.localeCompare(b.name)),
    owners: [...row.owners.values()].sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name)),
  }));
}

const PAGE = 40;
const REGION_TYPES = [['Region', 'Regions', 'regions'], ['Island', 'Islands', 'island'], ['Water', 'Water', 'water'],
  ['Mountains', 'Mountains', 'mountains'], ['River', 'Rivers', 'river'], ['Continent', 'Continents', 'continent'],
  ['Sub-region', 'Sub-regions', 'regions']];
export class RegionsPanel {
  constructor({ document, scale, className, onHighlight }) {
    this.document = document; this.scale = scale; this.onHighlight = onHighlight;
    this.open = false; this.visible = false; this.hover = null; this.selected = null; this.highlight = null; this.highlightSelection = null;
    this.rows = []; this.slots = []; this.query = ''; this.page = 0; this.populationStatus = '';
    this.expanded = new Set();
    this.searchCollapsed = new Set();
    this.types = new Set(REGION_TYPES.map(([type]) => type)); this.typeButtons = [];
    const make = (tag, css, text) => {
      const element = document.createElement(tag);
      element.style.cssText = css;
      if (text) element.textContent = text;
      return element;
    };
    const p = scale, glyph = kind => uiGlyph(kind, false, p(16));
    const buttonCss = `color:#eef3fb;background:#1a2638;border:1px solid #6a88bb;cursor:pointer;font:${p(13)}px sans-serif;`;
    this.button = make('button', `position:fixed;z-index:100046;display:none;width:${p(36)}px;height:${p(36)}px;padding:${p(6)}px;border-radius:50%;box-sizing:border-box;pointer-events:auto;${buttonCss}`);
    this.button.id = 'anthroprocenia-regions-button';
    this.button.classList.add('anthro-regions-circle');
    this.button.setAttribute('aria-controls', 'anthroprocenia-regions-panel');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Toggle Regions Panel'); this.button.setAttribute('title', 'Show or hide the Regions Panel');
    this.button.innerHTML = uiGlyph('regions', false, p(24));
    this.panel = make('section', `position:fixed;z-index:100047;display:none;flex-direction:column;box-sizing:border-box;overflow:hidden;pointer-events:auto;background:rgba(12,17,28,0.96);border:1px solid #6a88bb;border-radius:${p(8)}px;color:#eef3fb;font:${p(13)}px sans-serif;`);
    this.panel.id = 'anthroprocenia-regions-panel';
    this.panel.setAttribute('aria-label', 'Regions Panel');
    const header = make('div', `display:flex;align-items:center;gap:${p(8)}px;padding:${p(8)}px;border-bottom:1px solid #6a88bb;`);
    header.classList.add('anthro-panel-heading');
    const title = make('strong', 'flex:1;');
    title.innerHTML = glyph('regions') + ' Regions';
    this.clear = make('button', buttonCss, 'Clear selection');
    this.clear.innerHTML = glyph('clear') + ' Clear selection';
    this.close = make('button', `${buttonCss}width:${p(32)}px;height:${p(32)}px;border-radius:50%;background:#c0262d;`, 'X');
    this.close.innerHTML = glyph('close');
    this.close.setAttribute('aria-label', 'Close Regions Panel');
    this.close.classList.add('anthro-regions-circle', 'anthro-regions-close');
    header.append(title, this.clear, this.close);
    const searchBar = make('label', `display:flex;align-items:center;gap:${p(6)}px;margin:${p(8)}px;`);
    const searchIcon = make('span', 'flex:0 0 auto;');
    searchIcon.innerHTML = glyph('search');
    this.search = make('input', `flex:1;min-width:0;padding:${p(6)}px;color:#fff;background:#111a29;border:1px solid #6a88bb;`);
    this.search.setAttribute('placeholder', 'Search regions, settlements or countries');
    this.search.setAttribute('aria-label', 'Search regions, settlements or countries');
    searchBar.append(searchIcon, this.search);
    const filters = make('div', `display:flex;flex-wrap:wrap;gap:${p(6)}px;padding:0 ${p(8)}px ${p(8)}px;`);
    filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Region types');
    for (const [type, label, icon] of REGION_TYPES) {
      const button = make('button', `${buttonCss}flex:1;padding:${p(6)}px;white-space:nowrap;`);
      button.innerHTML = glyph(icon) + ' ' + label;
      button.setAttribute('aria-label', `Include ${label.toLowerCase()}`);
      button.setAttribute('title', `Show or hide ${label.toLowerCase()}`);
      this.activate(button, () => {
        if (this.types.has(type)) this.types.delete(type); else this.types.add(type);
        this.page = 0; this.render(true);
      });
      this.typeButtons.push({ type, button }); filters.appendChild(button);
    }
    this.status = make('div', `padding:0 ${p(8)}px ${p(6)}px;color:#cfe3ff;`);
    this.list = make('div', 'flex:1;min-height:0;overflow-y:auto;');
    this.list.setAttribute('role', 'list');
    const footer = make('div', `display:flex;align-items:center;gap:${p(8)}px;padding:${p(8)}px;`);
    this.previous = make('button', buttonCss, 'Previous');
    this.next = make('button', buttonCss, 'Next');
    this.previous.innerHTML = glyph('previous') + ' Previous';
    this.next.innerHTML = 'Next ' + glyph('next');
    this.counter = make('span', 'flex:1;text-align:center;');
    footer.append(this.previous, this.counter, this.next);
    this.panel.append(header, searchBar, filters, this.status, this.list, footer);
    for (const element of [this.button, this.panel]) { element.classList.add(className); document.body.appendChild(element); }
    this.activate(this.button, () => this.setOpen(!this.open));
    this.activate(this.close, () => this.setOpen(false));
    this.activate(this.clear, () => { this.selected = null; this.hover = null; this.paintSelection(); this.syncHighlight(); });
    this.activate(this.previous, () => { this.page = Math.max(0, this.page - 1); this.render(true); });
    this.activate(this.next, () => { this.page++; this.render(true); });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.searchCollapsed.clear(); this.page = 0; this.render(true); });
    this.panel.addEventListener('mouseleave', () => { this.hover = null; this.syncHighlight(); });
  }
  activate(element, run) {
    let stamp = -Infinity;
    const press = event => {
      if (event.button || event.type === 'keydown' && (event.repeat || !['Enter', ' '].includes(event.key))) return;
      event.preventDefault(); event.stopPropagation();
      const now = Date.now();
      if (now - stamp < 300) return;
      stamp = now; run();
    };
    for (const type of ['mouseup', 'click', 'keydown']) element.addEventListener(type, press);
  }
  setOpen(open) {
    this.open = open;
    if (!open) { this.hover = null; this.selected = null; }
    this.button.setAttribute('aria-expanded', String(open));
    this.panel.style.display = this.visible && open ? 'flex' : 'none';
    this.paintSelection(); this.syncHighlight();
  }
  syncHighlight() {
    const id = this.visible && this.open ? (this.hover !== null ? this.hover : this.selected) : null;
    if (id === this.highlight && this.selected === this.highlightSelection) return;
    this.highlightSelection = this.selected;
    this.highlight = id; this.onHighlight(id);
  }
  sync(show, anchor, area) {
    this.visible = show;
    this.button.style.display = show ? 'flex' : 'none';
    this.panel.style.display = show && this.open ? 'flex' : 'none';
    if (show) {
      const p = this.scale, rect = anchor.getBoundingClientRect(), size = p(36), gap = p(8);
      this.button.style.left = Math.round(Math.max(area.x + gap, rect.left - size - gap)) + 'px';
      this.button.style.top = Math.round(rect.top) + 'px';
      const top = Math.max(area.y + gap, rect.bottom + gap);
      this.panel.style.left = (area.x + gap) + 'px'; this.panel.style.top = top + 'px';
      this.panel.style.width = Math.max(0, Math.min(p(500), area.w - gap * 2)) + 'px';
      this.panel.style.height = Math.max(0, area.y + area.h - top - gap) + 'px';
    }
    this.syncHighlight();
  }
  update(rows, populationStatus = '') {
    this.rows = rows; this.populationStatus = populationStatus;
    if (!rows.some(row => row.id === this.selected)) this.selected = null;
    this.render();
  }
  paintSelection() {
    for (const slot of this.slots) {
      const selected = !!slot.row && slot.row.id === this.selected;
      slot.button.setAttribute('aria-pressed', String(selected));
      slot.button.style.backgroundColor = selected ? '#334962' : 'transparent';
    }
    this.clear.disabled = this.selected === null;
  }
  render(resetScroll = false) {
    const scrollTop = this.list.scrollTop || 0;
    const hover = this.hover, hovered = this.slots.find(slot => slot.row && slot.row.id === hover);
    for (const { type, button } of this.typeButtons) button.setAttribute('aria-pressed', String(this.types.has(type)));
    const included = row => (row.types || [row.type]).some(type => this.types.has(type));
    const matches = row => included(row) &&
      (!this.query || [row.name, ...row.settlements.map(city => city.name), ...row.owners.map(owner => owner.name)].join(' ').toLowerCase().includes(this.query));
    const continents = this.rows.filter(row => (row.types || [row.type]).includes('Continent'));
    let rows;
    if (continents.length) {
      const groups = continents.map(row => ({ ...row, group: true, children: [] }));
      const byName = new Map(groups.map(group => [group.name, group]));
      const other = { id: 'geography:unassigned', name: 'Water and other areas', type: 'Group', group: true,
        tiles: 0, population: 0, settlements: [], owners: [], children: [] };
      for (const row of this.rows) {
        if (continents.includes(row)) continue;
        const group = byName.get(row.continent) || other;
        if (matches(row) || this.query && group !== other && group.name.toLowerCase().includes(this.query) &&
          included(row)) group.children.push(row);
      }
      rows = [];
      for (const group of [...groups.sort((a, b) => a.name.localeCompare(b.name)), other]) {
        if (!group.children.length && (group === other || !matches(group))) continue;
        group.expanded = this.query ? !this.searchCollapsed.has(group.id) : this.expanded.has(group.id);
        group.children.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name));
        rows.push(group);
        if (group.expanded) rows.push(...group.children);
      }
    } else rows = this.rows.filter(matches);
    const parents = new Map(this.rows.map(row => [row.id, row])), children = new Map();
    for (const row of rows.slice()) if (row.parentId && !rows.some(parent => parent.id === row.parentId)) {
      const parent = parents.get(row.parentId);
      if (parent) rows.push(parent);
    }
    for (const row of rows) if (row.parentId && parents.has(row.parentId)) {
      if (!children.has(row.parentId)) children.set(row.parentId, []);
      children.get(row.parentId).push(row);
    }
    const nested = [];
    for (const row of rows) {
      if (row.parentId && rows.some(parent => parent.id === row.parentId)) continue;
      const parts = children.get(row.id);
      nested.push(parts ? { ...row, subregions: parts, expanded: this.query ? !this.searchCollapsed.has(row.id) : this.expanded.has(row.id) } : row);
      if (parts && (this.query ? !this.searchCollapsed.has(row.id) : this.expanded.has(row.id))) {
        nested.push(...parts.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name)));
      }
    }
    rows = nested;
    this.page = Math.max(0, Math.min(this.page, Math.ceil(rows.length / PAGE) - 1));
    const shown = rows.slice(this.page * PAGE, (this.page + 1) * PAGE), p = this.scale;
    for (let i = 0; i < shown.length; i++) {
      let slot = this.slots[i];
      if (!slot) {
        const button = this.document.createElement('button');
        button.style.cssText = `display:block;width:100%;box-sizing:border-box;padding:${p(8)}px;text-align:left;color:#eef3fb;background:transparent;border:0;border-bottom:1px solid #3c4d64;white-space:normal;cursor:pointer;font:${p(13)}px sans-serif;`;
        const lines = ['regions', 'people', 'settlement', 'territory'].map(kind => {
          const row = this.document.createElement('div'), icon = this.document.createElement('span'), text = this.document.createElement('span');
          row.style.cssText = `display:flex;align-items:baseline;gap:${p(6)}px;`;
          icon.style.cssText = 'flex:0 0 auto;color:#e1c58e;';
          icon.innerHTML = uiGlyph(kind, false, p(16));
          row.append(icon, text); button.appendChild(row);
          return text;
        });
        lines[0].style.fontWeight = '700';
        const container = this.document.createElement('div'), expand = this.document.createElement('button');
        container.style.cssText = 'position:relative;';
        expand.style.cssText = `position:absolute;left:${p(4)}px;top:${p(8)}px;width:${p(24)}px;height:${p(24)}px;color:#e1c58e;background:#1a2638;border:1px solid #6a88bb;cursor:pointer;`;
        container.append(button, expand);
        slot = { button, lines, expand, container, row: null }; this.slots.push(slot); this.list.appendChild(container);
        this.activate(expand, () => {
          if (!slot.row?.subregions) return;
          const state = this.query ? this.searchCollapsed : this.expanded;
          if (state.has(slot.row.id)) state.delete(slot.row.id); else state.add(slot.row.id);
          this.render();
        });
        this.activate(button, () => {
          if (!slot.row) return;
          if (slot.row.group) {
            const state = this.query ? this.searchCollapsed : this.expanded;
            if (state.has(slot.row.id)) state.delete(slot.row.id); else state.add(slot.row.id);
            this.render();
          } else {
            this.selected = this.selected === slot.row.id ? null : slot.row.id;
            this.paintSelection(); this.syncHighlight();
          }
        });
        for (const type of ['mouseenter', 'focus']) button.addEventListener(type, () => {
          if (slot.row && slot.row.type !== 'Group') { this.hover = slot.row.id; this.syncHighlight(); }
        });
        for (const type of ['mouseleave', 'blur']) button.addEventListener(type, () => { if (slot.row && this.hover === slot.row.id) { this.hover = null; this.syncHighlight(); } });
      }
      const row = shown[i]; slot.row = row; slot.button.style.display = 'block'; slot.container.style.display = 'block';
      slot.expand.style.display = row.subregions ? 'block' : 'none';
      slot.expand.innerHTML = uiGlyph(row.expanded ? 'previous' : 'next', false, p(16));
      slot.expand.setAttribute('aria-label', `${row.expanded ? 'Collapse' : 'Expand'} sub-regions of ${row.name}`);
      slot.expand.setAttribute('aria-expanded', String(!!row.expanded));
      slot.button.style.paddingLeft = p(row.subregions || row.parentId ? 36 : row.group || !continents.length ? 8 : 24) + 'px';
      slot.button.setAttribute('aria-expanded', row.group ? String(row.expanded) : 'false');
      slot.lines[0].textContent = row.group ? `${row.expanded ? '-' : '+'} ${row.name} (${row.children.length} areas)`
        : `${row.name} (${(row.types || [row.type]).join(', ')})`;
      slot.lines[1].textContent = `${formatThousands(row.tiles)} known tiles; population: ${this.populationStatus || formatThousands(row.population)}`;
      slot.lines[2].textContent = `Settlements (${row.settlements.length}): ${row.settlements.map(city => `${city.name} (${city.citizens} citizens)`).join(', ') || 'None'}`;
      slot.lines[3].textContent = `Territory: ${row.owners.map(owner => `${owner.name} (${formatThousands(owner.tiles)} tiles)`).join(', ') || 'No civilization territory'}`;
      if (row.type === 'Group') {
        slot.lines[1].textContent = 'Areas without a known continent';
        slot.lines[2].textContent = ''; slot.lines[3].textContent = '';
      }
      const label = slot.lines.map(line => line.textContent).join('; ');
      slot.button.setAttribute('aria-label', label); slot.button.setAttribute('title', label);
    }
    for (let i = shown.length; i < this.slots.length; i++) { this.slots[i].button.style.display = 'none'; this.slots[i].container.style.display = 'none'; this.slots[i].row = null; }
    this.hover = hovered && hovered.row && hovered.row.id === hover ? hover : null;
    this.status.textContent = !this.rows.length ? 'No known regions available.' : !rows.length ? 'No regions match these filters.' : 'Expand continents and region arrows to browse areas. Hover to highlight; click an area to select.';
    this.counter.textContent = `${rows.length ? this.page * PAGE + 1 : 0}-${this.page * PAGE + shown.length} of ${rows.length}`;
    this.previous.disabled = this.page === 0; this.next.disabled = (this.page + 1) * PAGE >= rows.length;
    this.list.scrollTop = resetScroll ? 0 : scrollTop;
    this.paintSelection(); this.syncHighlight();
  }
  reset() { this.setOpen(false); this.rows = []; this.expanded.clear(); this.searchCollapsed.clear(); this.query = ''; this.search.value = ''; this.types = new Set(REGION_TYPES.map(([type]) => type)); this.page = 0; this.key = ''; this.geography = null; this.tree = null; this.render(true); }
}
