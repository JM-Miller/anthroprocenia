import { countryIconChoice } from './anthroprocenia-civ-icons.js';

const civKey = type => String(type || '').toUpperCase().replace(/^CIVILIZATION_/, '');
const imageProperties = ['backgroundImage', 'maskImage', 'webkitMaskImage'];
const candidateSelector = '[data-icon-id^="CIVILIZATION_"], [class*="civ-icon"], [class*="civ-symbol"], .diplo-ribbon__symbol, .civilization-icon, .end-results-portrait-overlay-icon, .age-ending__symbol';

export function civilizationFromIconSource(source, typeForUrl) {
  const text = String(source || '').trim();
  const match = /^url\(\s*['"]?([^'")]+)['"]?\s*\)$/.exec(text);
  const url = match ? match[1] : text;
  const registered = typeForUrl && typeForUrl(url);
  if (registered) return registered;
  const asset = /(?:^|\/|:)(?:civ_sym_|dip_cs_)([a-z0-9_]+)(?:\.png)?(?:$|\?)/i.exec(url);
  return asset && asset[1] !== 'unknown' && asset[1] !== 'citystate' ? `CIVILIZATION_${asset[1].toUpperCase()}` : null;
}

export function civUiArtwork(type, owner, civilizations, choices, seed) {
  if (seed === undefined) return null;
  const key = civKey(type);
  if (owner !== undefined) {
    return civilizations.has(owner) ? choices.get(owner) || null : null;
  }
  const owners = [...civilizations].filter(([, civ]) => civKey(civ) === key).map(([id]) => id).sort((a, b) => a - b);
  return owners.length ? choices.get(owners[0]) || null : countryIconChoice(type, seed);
}

export class CivIconUi {
  constructor({ document, MutationObserver, scopeMode, resolveArtwork, typeForUrl, reportError,
    diplomacyMode = () => false,
    computedStyle = element => getComputedStyle(element) }) {
    this.document = document;
    this.scopeMode = scopeMode;
    this.resolveArtwork = resolveArtwork;
    this.typeForUrl = typeForUrl;
    this.computedStyle = computedStyle;
    this.diplomacyMode = diplomacyMode;
    this.states = new WeakMap();
    this.artworkNodes = new WeakSet();
    this.variableSources = new WeakSet();
    this.observer = new MutationObserver(records => {
      for (const element of new Set(records.map(record => record.target))) {
        const state = this.states.get(element);
        if (state && state.writtenStyle === element.getAttribute('style')) continue;
        if (this.variableSources.has(element)) {
          for (const glyph of [element, ...element.querySelectorAll(candidateSelector)]) {
            try { this.sync(glyph); }
            catch (error) { reportError(`civilization UI icon update failed: ${error}`); }
          }
          continue;
        }
        try { this.sync(element); }
        catch (error) { reportError(`civilization UI icon update failed: ${error}`); }
      }
    });
  }

  owns(node) { return this.artworkNodes.has(node); }

  sync(element) {
    if (!element || element.nodeType !== 1 || this.owns(element) || !element.style || typeof element.getAttribute !== 'function') return;
    let state = this.states.get(element);
    if (state) {
      for (const property of imageProperties) {
        const current = element.style[property] || '';
        if (current !== state.writes[property]) state.original[property] = current;
      }
    }
    if (this.scopeMode(element) !== 'normal') {
      if (state) this.restore(element, state);
      return;
    }
    const original = state ? state.original : Object.fromEntries(imageProperties.map(property => [property, element.style[property] || '']));
    const iconId = element.getAttribute('data-icon-id');
    if (iconId && !/^CIVILIZATION_/.test(iconId)) {
      if (state) this.restore(element, state);
      return;
    }
    const candidate = element.matches && element.matches(candidateSelector);
    let type = iconId && /^CIVILIZATION_/.test(iconId) ? iconId : null;
    for (const source of Object.values(original)) {
      if (!type) type = civilizationFromIconSource(source, this.typeForUrl);
    }
    if (!type && candidate) {
      let parent = element;
      while (parent && parent !== this.document.body) {
        const source = parent.style && parent.style.getPropertyValue('--civ-symbol');
        if (source) {
          type = civilizationFromIconSource(source, this.typeForUrl);
          if (!this.variableSources.has(parent)) {
            this.variableSources.add(parent);
            this.observer.observe(parent, { attributes: true, attributeFilter: ['style'] });
          }
          break;
        }
        const root = parent.getRootNode && parent.getRootNode();
        parent = parent.parentElement || (root && root.host);
      }
    }
    if (!type && ((!state && candidate) || Object.values(original).some(source => source.indexOf('var(') >= 0))) {
      const computed = this.computedStyle(element);
      for (const property of imageProperties) {
        if (!type) type = civilizationFromIconSource(computed[property], this.typeForUrl);
      }
    }
    if (!type && !state && !candidate) return;
    if (!state) {
      state = { original, writes: {}, svg: null, path: null, writtenStyle: null };
      this.states.set(element, state);
      // Watch only civilization glyphs, not the map's thousands of animated style attributes.
      this.observer.observe(element, { attributes: true, attributeFilter: ['style'] });
    }
    const artwork = type ? this.resolveArtwork(type, element) : null;
    if (!artwork) {
      this.restore(element, state);
      return;
    }
    if (!state.svg) {
      const namespace = 'http://www.w3.org/2000/svg';
      state.svg = this.document.createElementNS(namespace, 'svg');
      state.svg.setAttribute('viewBox', '0 0 64 64');
      state.svg.setAttribute('width', '100%');
      state.svg.setAttribute('height', '100%');
      state.svg.setAttribute('aria-hidden', 'true');
      state.svg.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;';
      state.path = this.document.createElementNS(namespace, 'path');
      state.path.setAttribute('fill-rule', 'evenodd');
      state.path.setAttribute('fill', 'currentColor');
      this.artworkNodes.add(state.svg);
      this.artworkNodes.add(state.path);
      state.svg.appendChild(state.path);
    }
    if (state.svg.parentNode !== element) element.appendChild(state.svg);
    const scale = this.diplomacyMode(element) ? 'scale(0.75)' : '';
    if (state.svg.style.transform !== scale) {
      state.svg.style.transform = scale;
      state.svg.style.transformOrigin = '50% 50%';
    }
    if (state.path.getAttribute('d') !== artwork.path) state.path.setAttribute('d', artwork.path);
    const computed = this.computedStyle(element);
    const tint = element.style.fxsBackgroundImageTint || computed.fxsBackgroundImageTint ||
      computed.getPropertyValue('fxs-background-image-tint') || computed.color || 'currentColor';
    if (state.svg.style.color !== tint) state.svg.style.color = tint;
    if (state.svg.style.display !== 'block') state.svg.style.display = 'block';
    for (const property of imageProperties) {
      if (element.style[property] !== 'none') element.style[property] = 'none';
      state.writes[property] = element.style[property] || '';
    }
    state.writtenStyle = element.getAttribute('style');
  }

  restore(element, state) {
    if (state.svg && state.svg.style.display !== 'none') state.svg.style.display = 'none';
    for (const property of imageProperties) {
      if ((element.style[property] || '') !== state.original[property]) element.style[property] = state.original[property];
      state.writes[property] = element.style[property] || '';
    }
    state.writtenStyle = element.getAttribute('style');
  }
}
