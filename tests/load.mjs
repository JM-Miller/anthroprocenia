import { readFile } from 'node:fs/promises';

// Loads a mod module for a test. The mod has no package config, so modules are imported from data: URLs, and any relative
// `import ... from './x.js'` inside them is first replaced by the (recursively loaded) data URL of that module.
const cache = new Map();
export async function loadModule(file) {
  if (cache.has(file)) return cache.get(file);
  let source = await readFile(new URL(`../anthroprocenia/ui/map/${file}`, import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from '\.\/([\w-]+\.js)'/g)].map(match => match[1]);
  for (const dependency of new Set(imports)) {
    const url = await moduleUrl(dependency);
    source = source.split(`'./${dependency}'`).join(`'${url}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  cache.set(file, import(url));
  return cache.get(file);
}
const urls = new Map();
async function moduleUrl(file) {
  if (urls.has(file)) return urls.get(file);
  let source = await readFile(new URL(`../anthroprocenia/ui/map/${file}`, import.meta.url), 'utf8');
  for (const dependency of new Set([...source.matchAll(/from '\.\/([\w-]+\.js)'/g)].map(match => match[1]))) {
    source = source.split(`'./${dependency}'`).join(`'${await moduleUrl(dependency)}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  urls.set(file, url);
  return url;
}
