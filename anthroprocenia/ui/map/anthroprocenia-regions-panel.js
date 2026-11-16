import { formatThousands } from './anthroprocenia-population-panel.js';
import { uiGlyph } from './anthroprocenia-ui.js';

export function regionRows(geography, frame, settlements, tree, visibility, ownerName) {
  const rows = new Map(), populations = new Map(), stack = [...tree];
  while (stack.length) {
    const node = stack.pop();
    if (node.kind === 'tile') populations.set(node.tile, (populations.get(node.tile) || 0) + node.total);
    else stack.push(...(node.children || []));
  }
  for (const region of geography.regions) rows.set(region.id, {
    id: region.id, name: region.name, type: region.island ? 'Island' : region.water ? 'Water' : 'Region',
    tiles: 0, population: 0, settlements: [], owners: new Map(),
  });
  for (const [index, id] of geography.regionForTile) {
    if (visibility && (visibility[index] || 0) === 0) continue;
    const row = rows.get(id);
    if (!row) continue;
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
  return [...rows.values()].filter(row => row.tiles).sort((a, b) => a.name.localeCompare(b.name)).map(row => ({
    ...row, settlements: row.settlements.sort((a, b) => a.name.localeCompare(b.name)),
    owners: [...row.owners.values()].sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name)),
  }));
}

const PAGE = 40;
export class RegionsPanel {
  constructor({ document, scale, className, onHighlight }) {
    this.document = document; this.scale = scale; this.onHighlight = onHighlight;
    this.open = false; this.visible = false; this.hover = null; this.selected = null; this.highlight = null;
    this.rows = []; this.slots = []; this.query = ''; this.page = 0; this.populationStatus = '';
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
    this.panel.append(header, searchBar, this.status, this.list, footer);
    for (const element of [this.button, this.panel]) { element.classList.add(className); document.body.appendChild(element); }
    this.activate(this.button, () => this.setOpen(!this.open));
    this.activate(this.close, () => this.setOpen(false));
    this.activate(this.clear, () => { this.selected = null; this.hover = null; this.paintSelection(); this.syncHighlight(); });
    this.activate(this.previous, () => { this.page = Math.max(0, this.page - 1); this.render(); });
    this.activate(this.next, () => { this.page++; this.render(); });
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.page = 0; this.render(); });
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
    if (id === this.highlight) return;
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
  render() {
    const hover = this.hover, hovered = this.slots.find(slot => slot.row && slot.row.id === hover);
    const rows = this.rows.filter(row => !this.query || [row.name, ...row.settlements.map(city => city.name), ...row.owners.map(owner => owner.name)].join(' ').toLowerCase().includes(this.query));
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
        slot = { button, lines, row: null }; this.slots.push(slot); this.list.appendChild(button);
        this.activate(button, () => { if (slot.row) { this.selected = this.selected === slot.row.id ? null : slot.row.id; this.paintSelection(); this.syncHighlight(); } });
        for (const type of ['mouseenter', 'focus']) button.addEventListener(type, () => { if (slot.row) { this.hover = slot.row.id; this.syncHighlight(); } });
        for (const type of ['mouseleave', 'blur']) button.addEventListener(type, () => { if (slot.row && this.hover === slot.row.id) { this.hover = null; this.syncHighlight(); } });
      }
      const row = shown[i]; slot.row = row; slot.button.style.display = 'block';
      slot.lines[0].textContent = `${row.name} (${row.type})`;
      slot.lines[1].textContent = `${formatThousands(row.tiles)} known tiles; population: ${this.populationStatus || formatThousands(row.population)}`;
      slot.lines[2].textContent = `Settlements (${row.settlements.length}): ${row.settlements.map(city => `${city.name} (${city.citizens} citizens)`).join(', ') || 'None'}`;
      slot.lines[3].textContent = `Territory: ${row.owners.map(owner => `${owner.name} (${formatThousands(owner.tiles)} tiles)`).join(', ') || 'No civilization territory'}`;
      const label = slot.lines.map(line => line.textContent).join('; ');
      slot.button.setAttribute('aria-label', label); slot.button.setAttribute('title', label);
    }
    for (let i = shown.length; i < this.slots.length; i++) { this.slots[i].button.style.display = 'none'; this.slots[i].row = null; }
    this.hover = hovered && hovered.row && hovered.row.id === hover ? hover : null;
    this.status.textContent = this.rows.length ? 'Hover to highlight. Click to select; click again or Clear selection to release.' : 'No known regions available.';
    this.counter.textContent = `${rows.length ? this.page * PAGE + 1 : 0}-${this.page * PAGE + shown.length} of ${rows.length}`;
    this.previous.disabled = this.page === 0; this.next.disabled = (this.page + 1) * PAGE >= rows.length;
    this.list.scrollTop = 0;
    this.paintSelection(); this.syncHighlight();
  }
  reset() { this.setOpen(false); this.rows = []; this.query = ''; this.search.value = ''; this.page = 0; this.key = ''; this.geography = null; this.tree = null; this.render(); }
}
