import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'official-icon-catalog.json'), 'utf8'));
const python = process.env.PYTHON || 'python';
const prelude = `
import importlib.util, json, os, pathlib, sqlite3, xml.etree.ElementTree as ET
spec = importlib.util.spec_from_file_location('official_icons', r'tools\\build-official-icons.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
catalog = json.loads(m.CATALOG.read_text(encoding='utf-8'))
`;
function runPython(code) {
  const result = spawnSync(python, ['-B', '-c', prelude + code], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout.trim();
}

test('catalog has distinct original-art slots, human-readable briefs, and aliases only within categories', () => {
  const ids = new Set();
  const filenames = new Set();
  for (const entry of catalog.entries) {
    assert.ok(entry.name && !entry.name.startsWith('LOC_'));
    assert.match(entry.brief, /Original white engraved/);
    assert.match(entry.art, /^art\/official-icons\/official_(civ|unit|building|improvement|quarter)_[a-z0-9_]+\.png$/);
    assert.ok(!filenames.has(path.basename(entry.art)), entry.art);
    filenames.add(path.basename(entry.art));
    for (const id of entry.ids) {
      assert.ok(!ids.has(id), id);
      ids.add(id);
      assert.ok(id.startsWith(entry.category === 'civ' ? 'CIVILIZATION_' : `${entry.category.toUpperCase()}_`));
    }
    assert.ok(entry.sources.length > 0);
    assert.ok(entry.modules.length > 0);
  }
  assert.equal(catalog.entries.reduce((n, e) => n + e.ids.length, 0),
    Object.values(catalog.id_counts).reduce((a, b) => a + b, 0));
});

test('installed Base and DLC inventory exactly matches catalog, including great-person and upgrade aliases', () => {
  const available = runPython(`
base = pathlib.Path(os.environ.get('CIV7_BASE', m.DEFAULT_BASE))
if not (base / 'modules').is_dir():
    print('UNAVAILABLE')
else:
    actual = m.inventory(base)
    assert actual == catalog, 'Installed inventory changed; rebuild/review catalog'
    tables, _ = m.installed_tables(base)
    covered = {id for e in actual['entries'] for id in e['ids']}
    for table, field in [('Units','UnitType'),('Buildings','ConstructibleType'),('Improvements','ConstructibleType'),('UniqueQuarters','UniqueQuarterType')]:
        assert {d[field] for d,_,_ in tables[table]} <= covered, table
    logios = next(e for e in actual['entries'] if e['key'] == 'UNIT_LOGIOS')
    assert 'UNIT_LOGIOS_SOCRATES' in logios['ids']
    hoplite = next(e for e in actual['entries'] if e['key'] == 'UNIT_HOPLITE')
    assert 'UNIT_HOPLITE_2' in hoplite['ids']
    assert any(s.startswith('DLC/') for e in actual['entries'] for s in e['sources'])
    print('OK')
`);
  assert.ok(['OK', 'UNAVAILABLE'].includes(available));
});

test('native schema accepts generated Row/Update XML without losing aliases, contexts, sizes or gameplay', () => {
  runPython(`
base = pathlib.Path(os.environ.get('CIV7_BASE', m.DEFAULT_BASE))
schema = base / 'Assets' / 'schema' / 'icons' / 'IconManager.sql'
if schema.is_file():
    db = sqlite3.connect(':memory:')
    db.executescript(schema.read_text(encoding='utf-8-sig'))
    tables, _ = m.installed_tables(base)
    columns = {row[1] for row in db.execute('pragma table_info(IconDefinitions)')}
    for data,_,_ in tables['IconDefinitions']:
        data = {k:v for k,v in data.items() if k in columns}
        names = list(data)
        db.execute('INSERT OR REPLACE INTO IconDefinitions ('+','.join(names)+') VALUES ('+','.join('?' for _ in names)+')', list(data.values()))
    for (context,) in db.execute('SELECT DISTINCT Context FROM Icons').fetchall():
        db.execute('INSERT OR IGNORE INTO IconContexts (Context) VALUES (?)', (context,))
    db.execute("INSERT INTO IconAliases (ID,OtherID) VALUES ('TEST_ROMAN_ALIAS','CIVILIZATION_ROME')")
    before = db.execute("SELECT * FROM IconDefinitions WHERE Context LIKE 'BACKGROUND%' ORDER BY ID,Context,IconSize").fetchall()
    sizes = db.execute('SELECT ID,Context,IconSize,NeedsTinting,FitToContent FROM IconDefinitions ORDER BY ID,Context,IconSize').fetchall()
    db.commit()
    db.execute('PRAGMA foreign_keys=ON')
    icon_root = ET.parse(m.MOD / 'data' / 'official-icon-overrides.xml').getroot()
    config_root = ET.parse(m.MOD / 'config' / 'OfficialIcons.xml').getroot()
    assert {t.tag for t in icon_root} == {'IconDefinitions'}
    assert {t.tag for t in config_root} == {'CivilizationItems'}
    seen = set()
    for operation in icon_root.find('IconDefinitions'):
        assert operation.tag in ('Update','Row'), 'Never Delete official definitions'
        if operation.tag == 'Update':
            where, values = operation.find('Where').attrib, operation.find('Set').attrib
            assert where['Context'] in {'DEFAULT','FONTICON'}
            assert set(values) == {'Path'}
            assert set(where) == {'ID','Context'}
            db.execute('UPDATE IconDefinitions SET Path=? WHERE ID=? AND Context=?', (values['Path'],where['ID'],where['Context']))
            seen.add(where['ID'])
        else:
            data = operation.attrib
            db.execute('INSERT INTO IconDefinitions (ID,Context,IconSize,Path) VALUES (?,?,?,?)', (data['ID'],data['Context'],int(data['IconSize']),data['Path']))
            seen.add(data['ID'])
    assert seen == {id for e in catalog['entries'] for id in e['ids']}
    assert before == db.execute("SELECT * FROM IconDefinitions WHERE Context LIKE 'BACKGROUND%' ORDER BY ID,Context,IconSize").fetchall()
    assert db.execute("SELECT Path FROM IconDefinitions WHERE ID='BUILDING_LIBRARY' AND Context='FONTICON'").fetchone()[0].startswith('fs://game/anthroprocenia_map_history/art/official-icons/')
    for row in sizes:
        assert row == db.execute('SELECT ID,Context,IconSize,NeedsTinting,FitToContent FROM IconDefinitions WHERE ID=? AND Context=? AND IconSize=?', row[:3]).fetchone()
    assert db.execute("SELECT OtherID FROM IconAliases WHERE ID='TEST_ROMAN_ALIAS'").fetchone()[0] == 'CIVILIZATION_ROME'
    for update in config_root.find('CivilizationItems'):
        assert update.tag == 'Update'
        assert set(update.find('Where').attrib) == {'Type'}
        assert set(update.find('Set').attrib) == {'Icon'}
        assert update.find('Where').get('Type') in seen
`);
});

test('civilization scene textures never become emblem CSS selectors', () => {
  const renderer = runPython('print(m.make_renderer(catalog))');
  assert.equal(fs.readFileSync(path.join(root, 'anthroprocenia', 'ui', 'map', 'anthroprocenia-official-icons.js'), 'utf8').trim(), renderer);
  for (const entry of catalog.entries.filter(entry => entry.category === 'civ')) {
    const emblemPaths = new Set(entry.native_icons.filter(icon => icon.context === 'DEFAULT').map(icon => icon.path));
    for (const icon of entry.native_icons.filter(icon => icon.context.startsWith('BACKGROUND') && !emblemPaths.has(icon.path))) {
      const filename = icon.path.split('/').at(-1).replace(/^blp:/, '').replace(/\.png$/, '');
      assert.ok(!entry.menu_filenames.includes(filename), `${entry.key} preserves ${icon.context}`);
      assert.ok(!renderer.includes(`.img-${filename},`), `${filename} must retain native scene art`);
      assert.ok(!renderer.includes(`[style*=\\"${filename}\\"]`));
    }
  }
});

test('manifest loads all official artwork and overrides in shell and game after optional content', () => {
  runPython(`
ns = {'m':'ModInfo'}
root = ET.parse(m.MOD / 'anthroprocenia.modinfo').getroot()
references = {node.get('id') for node in root.find('m:References',ns)}
dependencies = {node.get('id') for node in root.find('m:Dependencies',ns)}
assert set(catalog['integration']['reference_modules']) - {'base-standard'} <= references
assert dependencies == {'base-standard'}, 'Optional DLC must remain optional'
for scope in ('shell','game'):
    groups = root.findall("m:ActionGroups/m:ActionGroup[@id='official-icons-"+scope+"']",ns)
    assert len(groups) == 1
    group = groups[0]
    assert group.get('scope') == scope and group.get('criteria') == 'always'
    assert int(group.find('m:Properties/m:LoadOrder',ns).text) == catalog['integration']['load_order']
    actions = group.find('m:Actions',ns)
    for action,filename in catalog['integration'][scope].items():
        assert [node.text for node in actions.findall('m:'+action+'/m:Item',ns)] == [filename]
        assert (m.MOD / filename).is_file()
    assert {node.text for node in actions.findall('m:ImportFiles/m:Item',ns)} == {e['art'] for e in catalog['entries']}
`);
});

test('art validation rejects absent, opaque, colored, duplicate and mirrored art, including gold civ emblems', () => {
  runPython(`
from PIL import Image, ImageDraw
import shutil
folder = pathlib.Path('tests') / ('.official-art-fixture-' + str(os.getpid()))
folder.mkdir()
try:
    def entry(name, category='unit'):
        return {'art': name+'.png', 'name':name, 'category':category}
    def rejects(entries, message):
        try:
            m.validate_art({'entries':entries}, folder)
        except ValueError as exc:
            assert message in str(exc), str(exc)
        else:
            raise AssertionError('Invalid art passed: '+message)
    rejects([entry('absent')], 'Missing original art')
    image = Image.new('RGBA',(128,128))
    draw = ImageDraw.Draw(image)
    draw.polygon([(18,20),(90,33),(106,96),(55,107),(40,62)], fill='white')
    image.save(folder/'white.png')
    m.validate_art({'entries':[entry('white','civ')]},folder)
    Image.new('RGBA',(128,128),'white').save(folder/'opaque.png')
    rejects([entry('opaque')], 'transparent AND opaque')
    gold = Image.new('RGBA',(128,128))
    ImageDraw.Draw(gold).polygon([(18,20),(90,33),(106,96),(55,107),(40,62)],fill=(220,175,60,255))
    gold.save(folder/'gold.png')
    rejects([entry('gold','civ')], 'must be white')
    image.save(folder/'duplicate.png')
    rejects([entry('white'),entry('duplicate')], 'duplicates')
    image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(folder/'mirror.png')
    rejects([entry('white'),entry('mirror')], 'mirrors')
finally:
    shutil.rmtree(folder)
`);
});

test('optional renderer remaps named quarters and native filename emblems without generic stock overrides', () => {
  let renderer = runPython('print(m.make_renderer(catalog))');
  renderer = renderer.replace(/^import [^\r\n]*\r?\n/gm, '');
  const factories = new Map([
    ['CivCard', { factory: () => (props) => props, overridePriority: 0 }],
    ['BuildingOrUnitInfo', { factory: () => (props) => props, overridePriority: 0 }],
  ]);
  const styles = [];
  const quarter = catalog.entries.find((e) => e.category === 'quarter');
  const url = `url("fs://game/anthroprocenia_map_history/${quarter.art}")`;
  const makeElement = (initialStyle, computedStyle = {}, serialize = (value) => value) => {
    const writes = { style: 0, attributes: 0 };
    const attributes = new Map([['data-icon-id', 'CITY_UNIQUE_QUARTER']]);
    return {
      writes,
      computedStyle,
      style: new Proxy({ ...initialStyle }, {
        set(target, key, value) { writes.style++; target[key] = serialize(value); return true; },
      }),
      parentElement: { textContent: quarter.name, parentElement: null },
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => { writes.attributes++; attributes.set(name, value); },
      matches() {
        return attributes.get('data-icon-id') === 'CITY_UNIQUE_QUARTER'
          || Object.values(this.style).some((value) => String(value).includes('city_uniquequarter'));
      },
      querySelectorAll: () => [],
    };
  };
  const backgrounds = makeElement({ backgroundImage: 'url("blp:city_uniquequarter")' });
  const masks = makeElement({ maskImage: 'url("blp:city_uniquequarter")', backgroundColor: '#4080ff' });
  const prefixedMasks = makeElement({
    webkitMaskImage: 'url("blp:city_uniquequarter")',
    backgroundImage: 'url("blp:city_uniquequarter")',
  });
  const computedMasks = makeElement({ backgroundColor: '#ff8040' }, { maskImage: 'url("blp:city_uniquequarter")' });
  const canonicalMasks = makeElement({
    maskImage: 'url(blp:city_uniquequarter)',
    backgroundImage: 'url(blp:city_uniquequarter)',
  }, {}, (value) => typeof value === 'string' ? value.replace(/url\("([^"]+)"\)/g, 'url($1)') : value);
  const nodes = [backgrounds, masks, prefixedMasks, computedMasks, canonicalMasks];
  let observerCallback;
  const context = {
    Locale: { compose: (key) => catalog.entries.find((e) => e.name_key === key)?.name ?? key },
    document: {
      getElementById: () => null,
      createElement: () => ({}),
      head: { appendChild: (node) => styles.push(node) },
      documentElement: {},
      querySelectorAll: () => nodes.filter((node) => node.matches()),
    },
    ComponentRegistry: {
      get: (name) => factories.get(name),
      register: (name, factory, priority) => factories.set(name, { factory: () => factory, overridePriority: priority }),
    },
    componentRegistered: () => {},
    createRenderEffect: (fn) => fn(),
    getComputedStyle: (element) => element.computedStyle,
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
  };
  vm.runInNewContext(renderer, context);
  const originalItem = { title: quarter.name, icon: 'CITY_UNIQUE_QUARTER', kind: 'KIND_QUARTER' };
  const props = { buildings: [originalItem, { title: 'Unrequested custom quarter', icon: 'CITY_UNIQUE_QUARTER' }] };
  const card = factories.get('CivCard').factory()(props);
  assert.equal(card.buildings[0].icon, quarter.key);
  assert.equal(card.buildings[1].icon, 'CITY_UNIQUE_QUARTER');
  assert.equal(originalItem.icon, 'CITY_UNIQUE_QUARTER', 'Never mutate gameplay/model data');
  const detail = factories.get('BuildingOrUnitInfo').factory()(originalItem);
  assert.equal(detail.icon, quarter.key);
  const missingIcon = { name: quarter.name_key, isUniqueQuarter: true };
  const nonStringIcon = { title: quarter.name, isUniqueQuarter: true, icon: Symbol('native-icon') };
  assert.equal(factories.get('BuildingOrUnitInfo').factory()(missingIcon).icon, quarter.key);
  assert.equal(factories.get('BuildingOrUnitInfo').factory()(nonStringIcon).icon, quarter.key);
  const urlIcon = { title: quarter.name, isUniqueQuarter: true, icon: 'url("blp:city_uniquequarter")' };
  assert.equal(factories.get('BuildingOrUnitInfo').factory()(urlIcon).icon, url);
  assert.equal(backgrounds.style.backgroundImage, url);
  assert.equal(masks.style.maskImage, url);
  assert.equal(masks.style.backgroundColor, '#4080ff');
  assert.equal(masks.style.backgroundImage, undefined, 'Mask consumers must not gain background artwork');
  assert.equal(prefixedMasks.style.webkitMaskImage, url);
  assert.equal(prefixedMasks.style.backgroundImage, 'url("blp:city_uniquequarter")', 'Preserve existing native mask background');
  assert.equal(computedMasks.style.maskImage, url, 'Stylesheet masks also need an inline replacement');
  assert.equal(computedMasks.style.backgroundImage, undefined);
  assert.equal(canonicalMasks.style.maskImage, url.replaceAll('"', ''));
  const writes = nodes.map((node) => ({ ...node.writes }));
  for (let iteration = 0; iteration < 5; iteration++) {
    observerCallback(nodes.map((target) => ({ type: 'attributes', target })));
  }
  assert.deepEqual(nodes.map((node) => node.writes), writes,
    'Repeated style/attribute observer callbacks must not produce more mutations');
  assert.equal(styles.length, 1);
  assert.match(styles[0].textContent, /civ_sym_rome/);
  assert.match(styles[0].textContent, /mask-image:/);
  assert.doesNotMatch(styles[0].textContent, /:not\(/, 'Gameface rejects CSS :not selectors');
  assert.match(styles[0].textContent, /\[style\*="mask"\] \{ background-image: none !important;/);
  assert.doesNotMatch(styles[0].textContent, /(?:city_uniquequarter|impicon_|buildicon_|unitflag_)/);
});

test('all delivered original artwork passes white-alpha and duplicate checks once available', (t) => {
  const absent = catalog.entries.filter((entry) => !fs.existsSync(path.join(root, 'anthroprocenia', entry.art)));
  if (absent.length) {
    t.skip(`${absent.length} original images not delivered; build/check intentionally remain blocked`);
    return;
  }
  runPython('m.validate_art(catalog)');
});
