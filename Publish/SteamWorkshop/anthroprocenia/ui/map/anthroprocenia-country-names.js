import { installModUi } from './anthroprocenia-ui.js';

export function createCountryNamesView(getCatalog = () => {
  if (!window.AnthroproceniaReplay?.countryNames) throw new Error('Country naming is still loading. Please refresh.');
  return window.AnthroproceniaReplay.countryNames();
}) {
  installModUi(document, 'anthro-map-chrome', text => text);
  const root = document.createElement('div');
  root.id = 'anthroprocenia-country-names';
  root.className = 'anthro-map-chrome';
  root.style.cssText = 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;padding:12px;color:#e5d2ac;pointer-events:auto;';
  const add = (tag, text, parent = root) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    parent.appendChild(element);
    return element;
  };
  add('h2', 'Country Names');
  const current = add('p'), note = add('p'), rules = add('p');
  note.style.cssText = rules.style.cssText = 'font-size:13px;line-height:18px;margin:4px 0;';
  const controls = add('div');
  controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;margin:8px 0;';
  const search = add('input', '', controls);
  search.type = 'search'; search.placeholder = 'Search names or conditions';
  search.setAttribute('aria-label', 'Search country names and conditions');
  search.style.cssText = 'width:260px;padding:6px;margin:4px;';
  const button = (text, parent, action) => {
    const element = add('button', text, parent); element.type = 'button';
    element.addEventListener('click', action);
    return element;
  };
  button('Refresh', controls, () => load());
  const filters = add('div');
  filters.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;';
  add('span', 'Include names granted by: ', filters);
  const excluded = new Set(), filterButtons = new Map();
  for (const category of ['Government', 'Culture', 'Capital', 'Era', 'Geography', 'Population', 'Religion', 'Duplication']) {
    const filter = button(category, filters, () => {
      if (excluded.has(category)) excluded.delete(category); else excluded.add(category);
      filter.setAttribute('aria-pressed', String(!excluded.has(category)));
      filter.style.opacity = excluded.has(category) ? '0.5' : '1';
      page = 0; render();
    });
    filter.setAttribute('aria-pressed', 'true'); filter.style.margin = '3px';
    filterButtons.set(category, filter);
  }
  button('Reset filters', filters, () => {
    excluded.clear(); search.value = ''; page = 0;
    for (const filter of filterButtons.values()) { filter.setAttribute('aria-pressed', 'true'); filter.style.opacity = '1'; }
    render();
  });
  const status = add('p'); status.setAttribute('role', 'status');
  const list = add('div');
  list.setAttribute('aria-label', 'Possible country names');
  list.style.cssText = 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0;max-height:48vh;overflow-y:auto;';
  const paging = add('div'); paging.style.cssText = 'display:flex;align-items:center;margin-top:8px;';
  const previous = button('Previous', paging, () => { page--; render(); });
  const pageLabel = add('span', '', paging); pageLabel.style.margin = '0 12px';
  const next = button('Next', paging, () => { page++; render(); });
  let catalog = null, page = 0;
  const render = () => {
    while (list.firstChild) list.removeChild(list.firstChild);
    const term = search.value.trim().toLowerCase();
    const rows = (catalog?.rows || []).filter(row => !row.categories.some(category => excluded.has(category)) &&
      `${row.name} ${row.conditions.join(' ')}`.toLowerCase().includes(term));
    const pages = Math.max(1, Math.ceil(rows.length / 40));
    page = Math.max(0, Math.min(page, pages - 1));
    status.textContent = catalog ? `${rows.length} matching names. Lower priority numbers are chosen first.` : '';
    pageLabel.textContent = `Page ${page + 1} of ${pages}`;
    previous.disabled = !catalog || page === 0;
    next.disabled = !catalog || page + 1 >= pages;
    for (const row of rows.slice(page * 40, page * 40 + 40)) {
      const item = add('div', '', list);
      item.style.cssText = 'padding:8px;border-bottom:1px solid #65553c;flex:0 0 auto;';
      add('strong', `${row.current ? 'CURRENT - ' : ''}${row.name}`, item);
      add('div', `Priority ${row.priority + 1} | ${row.categories.join(', ')}`, item);
      if (row.uniqueness) add('div', row.uniqueness, item);
      add('div', 'Example activation conditions:', item);
      for (const condition of row.conditions) add('div', condition, item).style.cssText = 'font-size:13px;line-height:18px;margin:4px 0;';
    }
    if (catalog && !rows.length) add('p', 'No names match these filters.', list);
  };
  const load = () => {
    try {
      catalog = getCatalog(); page = 0;
      current.textContent = `Current country: ${catalog.currentName}`;
      note.textContent = catalog.note;
      rules.textContent = catalog.rules.map(rule => `${rule.priority + 1}. ${rule.description}`).join('; ');
      render();
    } catch (error) {
      console.error(`[ANTHROPROCENIA] country names catalog: ${error}`);
      catalog = null; current.textContent = ''; note.textContent = ''; rules.textContent = '';
      render(); status.textContent = `Unable to load country names: ${error.message || error}`;
    }
  };
  search.addEventListener('input', () => { page = 0; render(); });
  load();
  return root;
}
