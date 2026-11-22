import LensManager from "/core/ui/lenses/lens-manager.js";

const TAG = "[ANTHROPROCENIA]";
const LAYER_TYPES = {
  regions: "anthroprocenia-region-labels",
  boundaries: "anthroprocenia-region-boundaries",
  features: "anthroprocenia-geographic-labels",
};
const NAME_PARTS = {
  islands: ["Aster", "Beryl", "Cypress", "Dawn", "Ember", "Pearl", "Sable", "Willow"],
  mountains: ["Ashen", "Bright", "Copper", "Cloud", "Frost", "Iron", "Storm", "White"],
  rivers: ["Amber", "Clear", "Golden", "Silver", "Swift", "Verdant", "Wild", "Willow"],
  seas: ["Azure", "Calm", "Cerulean", "Coral", "Distant", "Opal", "Sapphire", "Tranquil"],
  gulfs: ["Amber", "Blue", "Crescent", "Jade", "Quiet", "Shining", "Summer", "Windward"],
  oceans: ["Endless", "Far", "Great", "Open", "Outer", "Silent", "Western", "World"],
  lakes: ["Crystal", "Dawn", "Emerald", "Mirror", "Pearl", "Silver", "Still", "Willow"],
};
const HISTORICAL_REGION_NAMES = {
  AKSUM: ["Aksum", "Tigray", "Hamasien"],
  AKSUMITE: ["Aksum", "Tigray", "Hamasien"],
  EGYPT: ["Kemet", "Thebes", "Memphis"],
  EGYPTIAN: ["Kemet", "Thebes", "Memphis"],
  GREECE: ["Hellas", "Attica", "Ionia"],
  GREEK: ["Hellas", "Attica", "Ionia"],
  KHMER: ["Kambuja", "Angkor", "Chenla"],
  MAURYA: ["Magadha", "Avanti", "Gandhara"],
  MAYA: ["Yucatan", "Peten", "Chiapas"],
  MAYAN: ["Yucatan", "Peten", "Chiapas"],
  HAN: ["Zhongyuan", "Shandong", "Guanzhong"],
  PERSIA: ["Pars", "Media", "Bactria"],
  PERSIAN: ["Pars", "Media", "Bactria"],
  ROME: ["Latium", "Etruria", "Campania"],
  ROMAN: ["Latium", "Etruria", "Campania"],
  MISSISSIPPIAN: ["Cahokia", "Etowah", "Moundville"],
  CARTHAGE: ["Byzacena", "Numidia", "QartHadasht"],
  CARTHAGINIAN: ["Byzacena", "Numidia", "QartHadasht"],
  ASSYRIA: ["Assyria", "Nineveh", "Arbela"],
  ASSYRIAN: ["Assyria", "Nineveh", "Arbela"],
  GAUL: ["Gallia", "Armorica", "Aquitania"],
  GAULS: ["Gallia", "Armorica", "Aquitania"],
  ABBASID: ["Iraq", "Baghdad", "Khuzestan"],
  CHOLA: ["Tamilakam", "Chola", "Tondaimandalam"],
  MING: ["Jiangnan", "Zhongyuan", "Guangdong"],
  SONGHAI: ["Gao", "Dendi", "Timbuktu"],
  MONGOLIA: ["Mongolia", "Khentii", "Karakorum"],
  MONGOL: ["Mongolia", "Khentii", "Karakorum"],
  NORMAN: ["Neustria", "Normandy", "Apulia"],
  INCA: ["Cusco", "Qullasuyu", "Tawantinsuyu"],
  SHAWNEE: ["Ohio", "Wabash", "Shawnee"],
  BUGANDA: ["Buganda", "Busoga", "Bunyoro"],
  HAWAII: ["Hawaii", "Kona", "Oahu"],
  MAJAPAHIT: ["Java", "Majapahit", "Madura"],
  SPAIN: ["Iberia", "Castile", "Aragon"],
  SPANISH: ["Iberia", "Castile", "Aragon"],
  TONGA: ["Tonga", "Haapai", "Vavau"],
  JAPAN: ["Yamato", "Kansai", "Honshu"],
  JAPANESE: ["Yamato", "Kansai", "Honshu"],
  OTTOMAN: ["Anatolia", "Rumelia", "Bithynia"],
  AMERICA: ["Appalachia", "Chesapeake", "Tidewater"],
  AMERICAN: ["Appalachia", "Chesapeake", "Tidewater"],
  FRANCE: ["Francia", "Aquitaine", "Burgundy"],
  FRENCH: ["Francia", "Aquitaine", "Burgundy"],
  PRUSSIA: ["Prussia", "Brandenburg", "Silesia"],
  PRUSSIAN: ["Prussia", "Brandenburg", "Silesia"],
  RUSSIA: ["Rus", "Muscovy", "Novgorod"],
  RUSSIAN: ["Rus", "Muscovy", "Novgorod"],
  MEXICO: ["Anahuac", "Oaxaca", "Yucatan"],
  SIAM: ["Siam", "Ayutthaya", "Lanna"],
  THAI: ["Siam", "Ayutthaya", "Lanna"],
  QING: ["Manchuria", "Liaoning", "Zhili"],
  MUGHAL: ["Hindustan", "Punjab", "Bengal"],
  POLAND: ["Mazovia", "Silesia", "LesserPoland"],
  POLISH: ["Mazovia", "Silesia", "LesserPoland"],
  VIETNAM: ["DaiViet", "Tonkin", "Annam"],
  VIETNAMESE: ["DaiViet", "Tonkin", "Annam"],
  INDONESIA: ["Java", "Sumatra", "Sulawesi"],
  INDONESIAN: ["Java", "Sumatra", "Sulawesi"],
  BRAZIL: ["Amazonia", "Bahia", "Pernambuco"],
  BRAZILIAN: ["Amazonia", "Bahia", "Pernambuco"],
  KOREA: ["Joseon", "Gyeonggi", "Jeolla"],
  KOREAN: ["Joseon", "Gyeonggi", "Jeolla"],
  SWEDEN: ["Svealand", "Gotaland", "Scania"],
  SWEDISH: ["Svealand", "Gotaland", "Scania"],
  NETHERLANDS: ["Holland", "Frisia", "Flanders"],
  PORTUGAL: ["Lusitania", "Alentejo", "Minho"],
  PORTUGUESE: ["Lusitania", "Alentejo", "Minho"],
  GREATBRITAIN: ["Britannia", "Wessex", "Mercia"],
  BRITAIN: ["Britannia", "Wessex", "Mercia"],
  ENGLAND: ["Mercia", "Northumbria", "Wessex"],
};
const HISTORICAL_WATER_NAMES = {
  AKSUM: ["RedSea", "Adulis"],
  EGYPT: ["RedSea", "Mediterranean"],
  GREECE: ["Aegean", "Ionian"],
  ROME: ["Tyrrhenian", "Adriatic", "Mediterranean"],
  CARTHAGE: ["Mediterranean", "Sicilian"],
  PERSIA: ["PersianGulf", "Caspian"],
  CHOLA: ["Coromandel", "BayofBengal"],
  MING: ["EastChina", "YellowSea"],
  JAPAN: ["Seto", "SeaofJapan"],
  JAPANESE: ["Seto", "SeaofJapan"],
  OTTOMAN: ["Marmara", "BlackSea"],
  SPAIN: ["Cantabrian", "Alboran"],
  PORTUGAL: ["Atlantic", "Algarve"],
  PORTUGUESE: ["Atlantic", "Algarve"],
  NETHERLANDS: ["NorthSea", "Wadden"],
  ENGLAND: ["NorthSea", "Channel"],
  GREATBRITAIN: ["NorthSea", "Channel"],
  FRANCE: ["Channel", "Biscay"],
  FRENCH: ["Channel", "Biscay"],
  VIETNAM: ["Tonkin", "SouthChina"],
  INDONESIA: ["Java", "Banda", "Sunda"],
  INDONESIAN: ["Java", "Banda", "Sunda"],
  KOREA: ["YellowSea", "EastSea"],
  KOREAN: ["YellowSea", "EastSea"],
  THAI: ["GulfOfThailand", "Andaman"],
  BRAZILIAN: ["Atlantic", "Amazon"],
};
const FALLBACK_REGION_NAMES = ["Arcadia", "Achaea", "Elysium", "Thule", "Sarmatia", "Illyria"];
const FALLBACK_WATER_NAMES = ["Pelagos", "Mare", "Oceanus", "Thalassa", "Abyss"];
const LABEL_STYLES = {
  regions: { fill: 0xbfffffff, fontSize: 18, stroke: 0x90000000 },
  features: { fill: 0xbfffffff, fontSize: 16, stroke: 0x90000000 },
  boundary: { fill: 0x70ffe9a8, fontSize: 14, stroke: 0x50000000 },
};
let geographyCache = null;
let geographyCacheKey = "";
let apiErrorLogged = false;
let liveWarSignature = "";

function reportError(message) {
  console.error(`${TAG} ${message}`);
}

function apiValue(name, call, fallback = null) {
  try {
    return call();
  } catch (error) {
    if (!apiErrorLogged) {
      reportError(`${name} unavailable: ${error}`);
      apiErrorLogged = true;
    }
    return fallback;
  }
}

function deterministicIndex(key, length) {
  let hash = 2166136261;
  const text = String(key);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function gameSeed() {
  return apiValue("game seed lookup", () => {
    const config = Configuration.getGame();
    return config && (config.gameSeed ?? config.startSeed ?? config.mapSeed);
  }, null);
}

const GEOGRAPHIC_QUALIFIER_GROUPS = [
  ["North", "Northern", "South", "Southern"], ["East", "Eastern", "West", "Western"], ["Inner", "Outer"],
  ["Great", "Greater", "Lesser", "Upper", "Lower"],
];
const GEOGRAPHIC_QUALIFIERS = GEOGRAPHIC_QUALIFIER_GROUPS.flat();
function canAddGeographicQualifier(name, qualifier) {
  const group = GEOGRAPHIC_QUALIFIER_GROUPS.find(values => values.includes(qualifier));
  const words = String(name).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/);
  return !group || !group.some(value => words.includes(value.toLowerCase()));
}
function normalizeGeographicQualifiers(name) {
  const pattern = new RegExp(`^((?:War of\\s+)?(?:(?:The|Lake|Rio)\\s+)?)((?:(?:${GEOGRAPHIC_QUALIFIERS.join("|")})\\s+){2,})`, "i");
  return String(name).replace(pattern, (_, prefix, adjectives) => {
    const kept = [];
    for (const word of adjectives.trim().split(/\s+/)) {
      const group = GEOGRAPHIC_QUALIFIER_GROUPS.find(values => values.some(value => value.toLowerCase() === word.toLowerCase()));
      for (let i = kept.length - 1; i >= 0; i--) {
        if (group.some(value => value.toLowerCase() === kept[i].toLowerCase())) kept.splice(i, 1);
      }
      kept.push(word);
    }
    return prefix + kept.join(" ") + " ";
  });
}
function uniqueGeographicName(base, used, normalize = value => value, cursors = null) {
  base = normalizeGeographicQualifiers(base);
  const qualifiers = ["", ...GEOGRAPHIC_QUALIFIERS];
  const modifiers = ["Distant", "Misty", "Windswept", "Hidden", "Rocky", "Shimmering", "Fabled", "Remote"];
  const words = base.toLowerCase().split(/[^a-z]+/);
  const cursorKey = normalize(base), cursor = cursors && cursors.get(cursorKey);
  let name = base, round = cursor && used.has(normalize(cursor.name)) ? cursor.round : 0;
  while (used.has(normalize(name))) {
    const qualifier = qualifiers[round % qualifiers.length];
    let variant = Math.floor(round / qualifiers.length);
    round++;
    if (qualifier && !canAddGeographicQualifier(base, qualifier)) continue;
    const extras = [];
    for (let i = 0; i < modifiers.length; i++) {
      if ((variant & (1 << i)) && !words.includes(modifiers[i].toLowerCase())) extras.push(modifiers[i]);
    }
    variant = Math.floor(variant / (1 << modifiers.length));
    if (qualifier) extras.push(qualifier);
    const stem = extras.length && /^the\s+/i.test(base) ? base.replace(/^the\s+/i, `The ${extras.join(" ")} `)
      : extras.length ? `${extras.join(" ")} ${base}` : base;
    if (variant) {
      let suffix = "";
      while (variant > 0) { variant--; suffix = String.fromCharCode(97 + variant % 26) + suffix; variant = Math.floor(variant / 26); }
      name = `${stem} near Vala${suffix}`;
    } else name = stem;
  }
  if (cursors) cursors.set(cursorKey, { name, round });
  return name;
}

function validateGeographicNames(entries, locations, width, reservedNames = []) {
  const qualifierPattern = new RegExp(`\\b(?:${GEOGRAPHIC_QUALIFIERS.join("|")})\\b`, "gi");
  const parsed = entries.filter(entry => !entry.nativeEarthName).map(entry => {
    const qualifiers = String(entry.name).match(qualifierPattern) || [];
    const base = String(entry.name).replace(qualifierPattern, "").replace(/\s+/g, " ").trim();
    return { entry, qualifiers, base, center: locations.get(entry.center) };
  });
  const groups = new Map();
  for (const item of parsed) {
    const category = item.entry.type || String(item.entry.id).split(":")[0] + (item.entry.island ? ":island" : "");
    const key = `${category}|${item.base.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values()) {
    for (const item of group) {
      const peers = group.filter(other => other !== item);
      const keep = item.qualifiers.filter(qualifier => {
        const q = qualifier.toLowerCase();
        if (!peers.length) return false;
        if (q === "great" || q === "greater" || q === "lesser") {
          const size = item.entry.tiles.length;
          return peers.every(other => q === "lesser" ? size < other.entry.tiles.length : size > other.entry.tiles.length);
        }
        if (!item.center || peers.some(other => !other.center)) return false;
        if (q === "north" || q === "northern" || q === "south" || q === "southern") {
          return peers.every(other => q.startsWith("north") ? item.center.y > other.center.y : item.center.y < other.center.y);
        }
        if (q === "east" || q === "eastern" || q === "west" || q === "western") {
          return peers.every(other => {
            const dx = ((other.center.x - item.center.x) % width + width) % width;
            if (!width || dx === 0 || dx * 2 === width) return false;
            return q.startsWith("west") ? dx < width / 2 : dx > width / 2;
          });
        }
        return false;
      });
      let next = 0;
      item.entry.name = String(item.entry.name).replace(qualifierPattern, word => {
        const retained = keep[next] && keep[next].toLowerCase() === word.toLowerCase();
        if (retained) next++;
        return retained ? word : "";
      }).replace(/\s+/g, " ").trim();
      if (!item.entry.name) item.entry.name = item.base;
    }
  }
  const usedByKind = new Map(), nextDuplicateByKind = new Map();
  for (const name of reservedNames) {
    if (!usedByKind.has("river")) usedByKind.set("river", new Set());
    usedByKind.get("river").add(name.toLowerCase());
  }
  for (const entry of entries) {
    if (entry.nativeEarthName) continue;
    const kind = entry.type || "regions";
    if (!usedByKind.has(kind)) usedByKind.set(kind, new Set());
    const used = usedByKind.get(kind);
    if (used.has(entry.name.toLowerCase())) {
      const modifiers = ["Distant", "Misty", "Windswept", "Hidden", "Rocky", "Shimmering", "Fabled", "Remote"];
      const base = entry.name;
      if (!nextDuplicateByKind.has(kind)) nextDuplicateByKind.set(kind, new Map());
      const nextByBase = nextDuplicateByKind.get(kind), baseKey = base.toLowerCase();
      let n = nextByBase.get(baseKey) || 1;
      do {
        const words = [];
        let value = n++;
        while (value > 0) { value--; words.push(modifiers[value % modifiers.length]); value = Math.floor(value / modifiers.length); }
        entry.name = /^the\s+/i.test(base) ? base.replace(/^the\s+/i, `The ${words.join(" ")} `) : `${words.join(" ")} ${base}`;
      } while (used.has(entry.name.toLowerCase()));
      nextByBase.set(baseKey, n);
    }
    used.add(entry.name.toLowerCase());
  }
}

function geographicAdjective(name) {
  const text = String(name).trim();
  if (/^(?:Amber|Clear|Golden|Silver|Swift|Verdant|Wild|Willow|Ashen|Bright|Copper|Cloud|Frost|Iron|Storm|White|Azure|Calm|Cerulean|Coral|Distant|Opal|Sapphire|Tranquil|Blue|Crescent|Jade|Quiet|Shining|Summer|Windward|Endless|Far|Great|Open|Outer|Silent|Western|World)$/i.test(text)) return text;
  if (/(ian|ean|ish|ese|ic|ern|en|ful)$/i.test(text)) return text;
  if (/ia$/i.test(text)) return `${text}n`;
  if (/y$/i.test(text)) return `${text.slice(0, -1)}ian`;
  if (/e$/i.test(text)) return `${text.slice(0, -1)}ian`;
  return `${text}ian`;
}

function geographicName(name, kind, key) {
  const base = normalizeGeographicQualifiers(String(name).replace(/([a-z])([A-Z])/g, "$1 $2")).replace(/^the\s+/i, "").replace(/\s+(?:isles?|islands?|archipelago|rivers?|ranges?|mountains?|oceans?|seas?|gulfs?|lakes?)$/i, "").trim();
  const adjective = geographicAdjective(base);
  const style = deterministicIndex(`${gameSeed()}|${kind}|${key}`, 3);
  if (kind === "island") return [`The Isle of ${base}`, `The ${adjective} Isle`, `The ${adjective} Island`][style];
  if (kind === "archipelago") return [`The ${adjective} Isles`, `The ${adjective} Archipelago`, `The Isles of ${base}`][style];
  if (kind === "river") return [`The ${adjective} River`, `The ${canAddGeographicQualifier(adjective, "Lesser") ? "Lesser " : ""}${adjective} River`, `Rio ${/a$/i.test(base) ? base : `${base}ia`}`][style];
  if (kind === "mountains") return [`The ${adjective} Range`, `The ${adjective} Mountains`, `The Mountains of ${base}`][style];
  if (kind === "lake") return [`Lake ${base}`, `The ${adjective} Lake`, `The Lake of ${base}`][style];
  const suffix = kind === "ocean" ? "Ocean" : kind === "gulf" ? "Gulf" : "Sea";
  return [`The ${adjective} ${suffix}`, `The ${suffix} of ${base}`, `The ${canAddGeographicQualifier(adjective, "Greater") ? "Greater " : ""}${adjective} ${suffix}`][style];
}

function indexFor(x, y) {
  return apiValue("plot index lookup", () => GameplayMap.getIndexFromXY(x, y), -1);
}

function locationFor(index) {
  return apiValue("plot location lookup", () => GameplayMap.getLocationFromIndex(index), null);
}

function continentFor(x, y) {
  const id = apiValue("continent lookup", () => GameplayMap.getContinentType(x, y), -1);
  if (typeof id !== "number" || id < 0) return null;
  const description = apiValue("continent definition lookup", () => GameInfo.Continents.lookup(id)?.Description, null);
  if (!description) return null;
  const name = apiValue("continent name localization", () => Locale.compose(description), "");
  return name && !/^LOC_/i.test(name) ? { id, name: String(name).trim() } : null;
}

const EARTH_REGION_NAMES = {
  ANTARCTICA: "Antarctica", ANTARTICA: "Antarctica", GREENLAND: "Greenland",
  GROENLAND: "Greenland", NORTH_AMERICA: "North America", ARCTIC_AMERICA: "Arctic America",
  CENTRAL_AMERICA: "Central America", SOUTH_AMERICA_WEST: "Western South America",
  SOUTH_AMERICA_EAST: "Eastern South America", ANTARCTIC_AMERICA: "Southern South America",
  AUSTRALIA: "Australia", OCEANIA: "Oceania", SOUTH_ASIA: "South Asia",
  CENTRAL_ASIA: "Central Asia", EAST_ASIA: "East Asia", NORTH_ASIA: "North Asia",
  MIDDLE_EAST: "Middle East", TURKEY: "Anatolia", MEDITERRANEAN: "Mediterranean",
  SOUTH_EUROPA: "Southern Europe", WEST_EUROPA: "Western Europe",
  NORTH_EUROPA: "Northern Europe", EAST_EUROPA: "Eastern Europe",
  NORTH_AFRICA: "North Africa", CENTRAL_AFRICA: "Central Africa",
  SOUTH_AFRICA: "Southern Africa", MADAGASCAR: "Madagascar",
};

// Anchors follow the stock fixed Earth map's historical start locations; do not
// apply them to Random Earth or to maps with a different size or projection.
const STOCK_EARTH_LANDMARKS = [
  [61, 28, "Ethiopia"], [57, 33, "Egypt"], [56, 43, "Greece"], [85, 46, "Northern China"],
  [83, 32, "Cambodia"], [75, 36, "Northern India"], [20, 32, "Yucatan"],
  [19, 45, "Mississippi Valley"], [67, 41, "Iran"], [51, 44, "Italy"],
  [74, 29, "Southern India"], [0, 36, "Hawaii"], [27, 20, "Andes"], [84, 23, "Java"],
  [90, 43, "Eastern China"], [81, 52, "Mongolia"], [44, 51, "Normandy"],
  [46, 27, "West Africa"], [43, 42, "Iberia"], [24, 44, "Eastern North America"],
  [56, 21, "Uganda"], [102, 46, "Japan"], [16, 34, "Mexico"], [50, 51, "Prussia"],
  [56, 56, "Western Russia"], [82, 32, "Thailand"], [45, 54, "Britain"],
  [48, 38, "Tunisia"], [56, 47, "Bulgaria"], [76, 38, "Nepal"], [84, 35, "Northern Vietnam"],
  [97, 48, "Korea"], [63, 44, "Mesopotamia"], [4, 17, "Tonga"], [58, 46, "Anatolia"],
  [37, 60, "Iceland"],
  [44, 49, "France"], [72, 37, "Indus Valley"], [90, 52, "Manchuria"],
  [20, 45, "Ohio Valley"], [66, 44, "Caspian Region"], [25, 37, "Caribbean"],
  [95, 49, "Korean Peninsula"], [99, 45, "Japanese Archipelago"],
  [64, 42, "Babylonia"], [45, 48, "Gaul"], [91, 11, "Australia"],
  [51, 59, "Scandinavia"],
];
function earthContinentName(name) {
  const known = ["Africa", "Antarctica", "Asia", "Australia", "Europe", "North America", "South America", "Oceania", "Greenland"];
  const value = String(name || "").trim().replace(/^Antartica$/i, "Antarctica");
  return known.find(entry => entry.toLowerCase() === value.toLowerCase()) || "";
}
function stockEarthRegionLookup(mapName, width, height) {
  if (String(mapName).toUpperCase() !== "LOC_MAP_EARTH_NAME" || width !== 106 || height !== 66) return null;
  const lookup = plot => {
    let best = null, bestDistance = Infinity;
    for (const [x, y, name] of STOCK_EARTH_LANDMARKS) {
      const dx = Math.min(Math.abs(plot.x - x), width - Math.abs(plot.x - x)), dy = plot.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { bestDistance = distance; best = name; }
    }
    return bestDistance <= 9 ** 2 ? best : "";
  };
  lookup.sourceMapName = "StockEarth";
  lookup.sourcePlot = plot => plot;
  return lookup;
}

// Each pair is a source-map coordinate, not a percentage of the live (possibly cropped) map.
const EARTH_WATER_ANCHORS = [
  ["river", "Nile", [31, 42], [58, 34], [57, 31]],
  ["river", "Niger", [10, 32], [43, 27], [46, 26]],
  ["river", "Congo", [24, 23], [53, 20], [53, 22]],
  ["river", "Zambezi", [29, 12], [57, 12], [55, 16]],
  ["river", "Danube", [25, 63], [54, 47], [54, 48]],
  ["river", "Rhine", [17, 68], [48, 49], [48, 51]],
  ["river", "Volga", [40, 67], [64, 52], [61, 53]],
  ["river", "Tigris", [41, 54], [65, 41], [64, 43]],
  ["river", "Euphrates", [38, 53], [63, 40], [63, 42]],
  ["river", "Indus", [53, 48], [73, 39], [72, 37]],
  ["river", "Ganges", [64, 49], [78, 39], [77, 36]],
  ["river", "Brahmaputra", [69, 51], [80, 40], [79, 38]],
  ["river", "Mekong", [79, 40], [84, 33], [84, 35]],
  ["river", "Yangtze", [82, 55], [88, 44], [87, 43]],
  ["river", "Yellow River", [78, 61], [83, 49], [85, 47]],
  ["river", "Amur", [88, 72], [92, 56], [91, 53]],
  ["river", "Ob", [51, 77], [73, 57], [70, 57]],
  ["river", "Yenisei", [62, 80], [80, 58], [77, 58]],
  ["river", "Lena", [78, 81], [90, 59], [85, 58]],
  ["river", "Mississippi", [143, 59], [12, 46], [20, 44]],
  ["river", "Saint Lawrence", [154, 72], [23, 52], [25, 50]],
  ["river", "Colorado", [130, 59], [5, 43], [14, 43]],
  ["river", "Amazon", [165, 32], [31, 21], [32, 24]],
  ["river", "Orinoco", [160, 40], [28, 26], [31, 28]],
  ["river", "Parana", [169, 17], [34, 11], [34, 17]],
  ["river", "Murray", [102, 8], [97, 8], [96, 12]],
  ["lake", "Lake Superior", [144, 73], [15, 54], [21, 50]],
  ["lake", "Lake Michigan", [145, 69], [16, 51], [21, 47]],
  ["lake", "Lake Huron", [149, 71], [19, 52], [23, 49]],
  ["lake", "Lake Erie", [151, 68], [21, 50], [24, 47]],
  ["lake", "Lake Ontario", [153, 70], [23, 51], [25, 49]],
  ["lake", "Great Bear Lake", [130, 83], [9, 60], [16, 56]],
  ["lake", "Great Slave Lake", [133, 79], [11, 58], [17, 54]],
  ["lake", "Lake Titicaca", [157, 22], [25, 15], [29, 19]],
  ["lake", "Lake Victoria", [31, 25], [59, 22], [56, 21]],
  ["lake", "Lake Tanganyika", [29, 20], [57, 19], [55, 19]],
  ["lake", "Lake Malawi", [33, 16], [60, 16], [57, 17]],
  ["lake", "Lake Chad", [19, 35], [51, 28], [51, 29]],
  ["lake", "Caspian Sea", [44, 60], [67, 46], [66, 44]],
  ["lake", "Aral Sea", [53, 64], [72, 49], [70, 46]],
  ["lake", "Lake Baikal", [73, 73], [85, 55], [83, 53]],
  ["lake", "Lake Balkhash", [61, 64], [78, 49], [76, 47]],
  ["lake", "Lake Eyre", [98, 13], [96, 11], [94, 15]],
  ["sea", "Mediterranean Sea", [21, 53], [50, 38], [51, 40]],
  ["sea", "Mediterranean Sea", [9, 53], [43, 38], [45, 40]],
  ["sea", "Mediterranean Sea", [30, 52], [57, 37], [57, 40]],
  ["sea", "Black Sea", [32, 61], [60, 46], [60, 46]],
  ["sea", "Baltic Sea", [23, 74], [52, 55], [51, 54]],
  ["sea", "North Sea", [14, 73], [46, 54], [47, 55]],
  ["sea", "Red Sea", [35, 40], [62, 32], [61, 30]],
  ["sea", "Persian Gulf", [44, 46], [69, 35], [68, 35]],
  ["sea", "Arabian Sea", [51, 35], [72, 30], [72, 29]],
  ["sea", "Bay of Bengal", [68, 37], [80, 31], [80, 29]],
  ["sea", "South China Sea", [84, 37], [88, 32], [89, 33]],
  ["sea", "East China Sea", [91, 54], [93, 44], [94, 43]],
  ["sea", "Sea of Japan", [96, 63], [96, 51], [99, 49]],
  ["sea", "Sea of Okhotsk", [99, 76], [99, 58], [102, 55]],
  ["sea", "Bering Sea", [111, 82], [0, 59], [5, 57]],
  ["sea", "Caribbean Sea", [153, 43], [23, 29], [25, 34]],
  ["sea", "Gulf of Mexico", [145, 51], [16, 36], [21, 38]],
  ["sea", "Coral Sea", [111, 23], [102, 21], [102, 21]],
  ["sea", "Tasman Sea", [113, 8], [103, 9], [103, 13]],
  ["sea", "Java Sea", [86, 27], [89, 24], [87, 24]],
  ["island", "Greenland", [176, 88], [27, 60], [34, 59]],
  ["island", "Iceland", [2, 84], [38, 59], [37, 60]],
  ["island", "Britain", [10, 76], [44, 54], [45, 54]],
  ["island", "Ireland", [4, 75], [41, 53], [42, 54]],
  ["island", "Sicily", [22, 52], [51, 38], [51, 42]],
  ["island", "Sardinia", [18, 56], [48, 40], [49, 44]],
  ["island", "Crete", [29, 51], [56, 37], [56, 41]],
  ["island", "Cyprus", [34, 51], [60, 37], [60, 41]],
  ["island", "Madagascar", [37, 17], [68, 8], [63, 15]],
  ["island", "Sri Lanka", [62, 33], [78, 27], [77, 27]],
  ["island", "Sumatra", [75, 30], [84, 25], [82, 26]],
  ["island", "Java", [83, 25], [89, 22], [84, 23]],
  ["island", "Borneo", [83, 31], [90, 27], [88, 27]],
  ["island", "Sulawesi", [92, 27], [94, 26], [92, 26]],
  ["island", "New Guinea", [104, 26], [100, 25], [101, 27]],
  ["island", "Philippines", [89, 40], [94, 36], [93, 34]],
  ["island", "Taiwan", [87, 49], [94, 40], [94, 39]],
  ["island", "Japanese Archipelago", [99, 61], [99, 49], [99, 45]],
  ["island", "New Zealand", [111, 7], [103, 4], [103, 9]],
  ["island", "Hawaiian Islands", [115, 52], [102, 36], [0, 36]],
  ["island", "Cuba", [150, 48], [21, 33], [25, 37]],
  ["island", "Hispaniola", [155, 46], [25, 32], [28, 36]],
  ["island", "Jamaica", [153, 46], [22, 31], [26, 35]],
  ["island", "Puerto Rico", [158, 46], [28, 32], [30, 36]],
  ["island", "Tierra del Fuego", [163, 1], [29, 1], [31, 7]],
];
// Giant Earth source coordinates. Island naming skips the mainland polygons.
const GIANT_EARTH_LAND_AREAS = [
  ["Britain", 7, 70, 12, 83], ["Ireland", 3, 73, 6, 77],
  ["Iceland", 1, 83, 4, 86], ["Greenland", 168, 82, 2, 93],
  ["Madagascar", 35, 13, 39, 21], ["Borneo", 81, 28, 86, 35],
  ["Sumatra", 72, 27, 78, 34], ["Java", 80, 24, 85, 26],
  ["Philippines", 86, 35, 92, 45], ["Taiwan", 87, 47, 88, 50],
  ["Sri Lanka", 62, 32, 64, 34], ["Cyprus", 32, 53, 33, 53],
  ["Sardinia", 17, 56, 18, 57], ["Sicily", 20, 52, 21, 53], ["Malta", 21, 50, 22, 51],
  ["Hawaiian Islands", 113, 47, 122, 54], ["New Zealand", 107, 2, 114, 13],
  ["Western Australia", 84, 4, 94, 25], ["Eastern Australia", 95, 4, 104, 25],
  ["Jamaica", 151, 45, 153, 46],
  ["Corsica", 17, 58, 18, 59], ["The Balearic Isles", 12, 55, 14, 56],
];
const GIANT_EARTH_PENINSULAS = [
  ["Italia", [[16, 65], [22, 65], [22, 59], [25, 55], [23, 53], [19, 57], [16, 62]]],
  ["Anatolia", [[30, 59], [42, 60], [44, 55], [36, 52], [30, 54]]],
  ["Scandinavia", [[17, 73], [26, 73], [37, 83], [32, 92], [20, 89]]],
  ["Korea", [[87, 65], [90, 66], [93, 60], [91, 57], [88, 60]]],
  ["Iberia", [[2, 51], [10, 51], [13, 60], [10, 62], [2, 62]]],
  ["India", [[52, 58], [59, 60], [65, 56], [73, 54], [73, 51], [70, 48], [67, 44], [64, 34], [60, 33], [56, 41], [51, 47]]],
  ["The Malayan Peninsula", [[72, 40], [75, 40], [75, 38], [74, 37], [76, 35], [79, 33], [79, 30], [77, 29], [75, 32], [74, 34], [73, 35], [72, 38]]],
  ["Southeast Asia", [[70, 50], [73, 52], [76, 49], [79, 48], [81, 43], [82, 38], [79, 36], [79, 31], [76, 31], [72, 38], [68, 44], [70, 47]]],
  ["Arabia", [[33, 48], [36, 50], [39, 49], [42, 46], [46, 44], [47, 41], [43, 37], [38, 36], [35, 39]]],
  ["Western Central Africa", [[12, 21], [25, 21], [25, 36], [12, 36]]],
  ["Eastern Central Africa", [[25, 18], [37, 18], [37, 32], [34, 36], [25, 36]]],
  ["Western North Africa", [[2, 38], [16, 38], [16, 53], [2, 53]]],
  ["Eastern North Africa", [[28, 38], [38, 38], [38, 53], [28, 53]]],
  ["Central North Africa", [[2, 38], [38, 38], [38, 53], [2, 53]]],
  ["Greece", [[25, 53], [28, 52], [31, 54], [31, 59], [29, 61], [26, 61], [25, 58]]],
  ["The Balkans", [[23, 53], [31, 51], [34, 60], [31, 65], [25, 65], [22, 61]]],
  ["Western Europe", [[7, 62], [13, 60], [17, 63], [18, 75], [7, 75]]],
  ["Central Europe", [[17, 63], [25, 63], [29, 66], [29, 75], [18, 75]]],
  ["Eastern Europe", [[29, 60], [46, 61], [49, 80], [37, 84], [29, 75]]],
  ["Western Arctic America", [[116, 70], [142, 70], [142, 94], [116, 94]]],
  ["Eastern Arctic America", [[142, 70], [168, 70], [168, 94], [142, 94]]],
  ["Western North America", [[116, 58], [135, 58], [135, 56], [144, 56], [144, 80], [116, 80]]],
  ["Eastern North America", [[144, 56], [148, 56], [148, 53], [154, 53], [154, 56], [168, 56], [168, 80], [144, 80]]],
  ["Central America", [[129, 58], [135, 58], [135, 56], [145, 56], [148, 50], [146, 46], [152, 41], [151, 39], [146, 39], [140, 45], [132, 48], [129, 54]]],
  ["Siberia", [[37, 80], [115, 80], [115, 94], [37, 94]]],
  ["North Asia", [[37, 71], [115, 71], [115, 94], [37, 94]]],
];
function giantEarthTundraBoundary(sourcePlot, width, height) {
  const boundary = new Map();
  if (typeof GameplayMap.getBiomeType !== "function" || typeof GameInfo.Biomes?.lookup !== "function") return boundary;
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
    const source = sourcePlot({ x, y });
    if (!source) continue;
    const america = source.x >= 116 && source.x < 168;
    if ((!america && (source.x < 37 || source.x >= 115)) || source.y < (america ? 70 : 71) || GameplayMap.isWater(x, y)) continue;
    const biome = apiValue("northern biome lookup",
      () => GameInfo.Biomes.lookup(GameplayMap.getBiomeType(x, y))?.BiomeType, "");
    if (biome === "BIOME_TUNDRA" || america && biome === "BIOME_SNOW") {
      boundary.set(source.x, Math.min(boundary.get(source.x) ?? Infinity, source.y));
    }
  }
  return boundary;
}
function giantEarthLandName({ x, y }, islandsOnly = false, tundraBoundary = null) {
  if (y === 0) return "Antarctica";
  if (!islandsOnly && giantEarthAlaska(x, y)) return "Western Arctic America";
  for (const [name, polygon] of islandsOnly ? [] : GIANT_EARTH_PENINSULAS) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[i], [bx, by] = polygon[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    if (inside) {
      if (name === "Siberia" || name === "North Asia") return mergedGiantEarthRegionName(name, { x, y }, tundraBoundary);
      if (name.endsWith(" America")) return mergedGiantEarthRegionName(name, { x, y }, tundraBoundary);
      return name;
    }
  }
  for (const [name, x0, y0, x1, y1] of GIANT_EARTH_LAND_AREAS) {
    if (islandsOnly && name.endsWith(" Australia") && !(x >= 98 && x <= 101 && y <= 6)) continue;
    if ((x0 <= x1 ? x >= x0 && x <= x1 : x >= x0 || x <= x1) && y >= y0 && y <= y1) return name;
  }
  return "";
}
function fixedGiantEarthRegionLookup(mapName, width, height) {
  if (String(mapName).toUpperCase() !== "LOC_MAP_GIANT_EARTH_NAME" || width !== 180 || height !== 94) return null;
  const tundraBoundary = giantEarthTundraBoundary(plot => plot, width, height);
  const lookup = plot => giantEarthLandName(plot, false, tundraBoundary);
  lookup.sourceMapName = "GiantEarth";
  lookup.sourcePlot = plot => plot;
  lookup.tundraBoundary = tundraBoundary;
  return lookup;
}
const GIANT_EARTH_LAND_ANCHORS = [
  ["West Africa", 8, 33], ["Western Central Africa", 19, 28], ["Eastern Central Africa", 31, 27], ["East Africa", 35, 30],
  ["Southern Africa", 27, 11], ["Central North Africa", 20, 46],
  ["Western Europe", 13, 68], ["Eastern Europe", 34, 71], ["Scandinavia", 25, 84],
  ["Middle East", 47, 50], ["Central Asia", 57, 64], ["North Asia", 63, 82],
  ["Northeast Asia", 96, 79], ["East Asia", 83, 59],
  ["South Asia", 61, 46], ["Southeast Asia", 80, 41],
  ["Western Australia", 89, 15], ["Eastern Australia", 100, 15], ["Oceania", 115, 26],
  ["Western North America", 133, 69], ["Eastern North America", 153, 69], ["Central America", 143, 48],
  ["South America", 163, 24], ["Caribbean", 153, 45], ["Greenland", 176, 87],
  ["Antarctica", 80, 0],
];
function giantEarthAlaska(x, y) {
  // Includes the Aleutians and southeast panhandle, without extending into the Yukon interior.
  return x >= 106 && x < 113 && y >= 73 && y <= 75 ||
    x >= 113 && x <= 125 && y >= 78 && y <= 94 ||
    x >= 126 && x <= 130 && y >= 74 && y <= 77 && y >= x - 54;
}
function mergedGiantEarthRegionName(name, source, tundraBoundary) {
  const { x, y } = source;
  if (giantEarthAlaska(x, y)) return "Western Arctic America";
  if (name === "West Asia") return "Middle East";
  if (name === "Caribbean" && y < 43) return "South America";
  if (name === "North Africa" || name === "South Europe") return "Central North Africa";
  if (name === "Mediterranean") return y < 54 ? (x < 16 ? "Western North Africa" : x >= 28 ? "Eastern North Africa" : "Central North Africa")
    : x < 17 ? "Western Europe" : x < 29 ? "Central Europe" : "Eastern Europe";
  if (name === "Northern Europe" && x < 37) return "Scandinavia";
  if (["Northern Europe", "Siberia", "North Asia", "Northern Asia"].includes(name)) {
    // The Yenisei near Krasnoyarsk separates the western and eastern subdivisions.
    return `${x < 68 ? "Western" : "Eastern"} ${y >= (tundraBoundary?.get(x) ?? 80) ? "Siberia" : "North Asia"}`;
  }
  if (name === "Central Africa") {
    if (source.y < 18) return "Southern Africa";
    if (source.y >= 38) return "Central North Africa";
    return source.x < 25 ? "Western Central Africa" : "Eastern Central Africa";
  }
  if (name === "Central America" || /^(?:(?:Western|Eastern) )?(?:North|Arctic) America$/.test(name)) {
    // Panama ends before Colombia; Baja retains its existing northern boundary.
    if (y < 40 || x >= 153 && y < 43) return "South America";
    const northernBoundary = x <= 134 ? 58 : 56;
    if (y < northernBoundary && !(x >= 148 && x <= 154 && y >= 53)) return "Central America";
    const arctic = source.y >= (tundraBoundary?.get(source.x) ?? 80);
    return `${source.x < (arctic ? 142 : 144) ? "Western" : "Eastern"} ${arctic ? "Arctic" : "North"} America`;
  }
  return name;
}
function earthLandRegionName(plot, regionLookup) {
  const name = regionLookup?.(plot);
  if (name) return name;
  const source = regionLookup?.sourcePlot(plot);
  if (!source || regionLookup.sourceMapName !== "GiantEarth") return "";
  let nearest = Infinity, region = "";
  for (const [candidate, x, y] of GIANT_EARTH_LAND_ANCHORS) {
    const raw = Math.abs(source.x - x);
    const distance = Math.min(raw, 180 - raw) ** 2 + (source.y - y) ** 2;
    if (distance < nearest) { nearest = distance; region = candidate; }
  }
  return mergedGiantEarthRegionName(region, source, regionLookup.tundraBoundary);
}
function includeConnectedItaliaTiles(regionLookup, records, locations) {
  if (regionLookup?.sourceMapName !== "GiantEarth") return regionLookup;
  const italia = new Set(), candidates = new Set();
  for (const [index, record] of records) {
    if (record.water || record.lake) continue;
    const name = earthLandRegionName(locations.get(index), regionLookup);
    if (name === "Italia") italia.add(index);
    if (/^South(?:ern)? Europe$/i.test(record.continent?.name || "") ||
        /^South(?:ern)? Europe$/i.test(name)) candidates.add(index);
  }
  const queue = [...italia];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const neighbor of neighborsOf(locations.get(queue[cursor]))) {
      if (!candidates.has(neighbor.index) || italia.has(neighbor.index)) continue;
      italia.add(neighbor.index);
      queue.push(neighbor.index);
    }
  }
  return Object.assign(plot => italia.has(indexFor(plot.x, plot.y)) ? "Italia" : regionLookup(plot), regionLookup);
}
const EARTH_MOUNTAIN_ANCHORS = [
  ["Alps", [18, 64], [50, 45], [50, 48], 5],
  ["Pyrenees", [8, 60], [43, 42], [44, 45], 3],
  ["Apennines", [21, 59], [51, 42], [51, 44], 4],
  ["Carpathians", [29, 66], [56, 48], [55, 50], 4],
  ["Scandinavian Mountains", [23, 83], [50, 58], [50, 59], 8],
  ["Atlas Mountains", [12, 50], [43, 35], [45, 38], 7],
  ["Ural Mountains", [48, 78], [66, 56], [63, 57], 9],
  ["Caucasus", [42, 61], [63, 45], [62, 47], 4],
  ["Zagros Mountains", [45, 51], [68, 39], [67, 41], 6],
  ["Hindu Kush", [55, 56], [72, 42], [72, 41], 5],
  ["Himalayas", [66, 54], [80, 42], [78, 40], 9],
  ["Tian Shan", [61, 64], [78, 48], [76, 47], 6],
  ["Altai Mountains", [68, 71], [82, 53], [79, 51], 6],
  ["Kunlun Mountains", [70, 59], [82, 46], [80, 44], 6],
  ["Great Dividing Range", [102, 15], [100, 14], [99, 17], 8],
  ["Southern Alps", [109, 4], [102, 4], [102, 9], 4],
  ["Andes", [157, 21], [25, 16], [28, 20], 16],
  ["Andes", [155, 9], [28, 7], [30, 11], 12],
  ["Rocky Mountains", [128, 69], [5, 50], [15, 50], 15],
  ["Appalachian Mountains", [150, 64], [21, 46], [25, 45], 8],
  ["Sierra Madre", [137, 54], [11, 38], [18, 37], 8],
  ["Transantarctic Mountains", [66, 1], [70, 1], [65, 1], 6],
];
function earthMountainLookup(regionLookup) {
  if (!regionLookup?.sourcePlot) return null;
  const column = { GiantEarth: 1, GreatestEarthMap: 2, StockEarth: 3 }[regionLookup.sourceMapName];
  if (!column) return null;
  const width = column === 1 ? 180 : column === 2 ? 104 : 106;
  return plot => {
    const source = regionLookup.sourcePlot(plot);
    if (!source) return "";
    let name = "", best = Infinity;
    for (const anchor of EARTH_MOUNTAIN_ANCHORS) {
      const [x, y] = anchor[column], dx = Math.abs(source.x - x);
      const distance = Math.min(dx, width - dx) ** 2 + (source.y - y) ** 2;
      const radius = anchor[4] * (column === 1 ? 1 : 0.6);
      if (distance <= radius ** 2 && distance < best) { name = anchor[0]; best = distance; }
    }
    return name;
  };
}
const EARTH_RIVER_CITIES = {
  LONDON: "Thames", OXFORD: "Thames", PARIS: "Seine", ROUEN: "Seine",
  LYON: "Rhone", AVIGNON: "Rhone", BORDEAUX: "Garonne", TOULOUSE: "Garonne",
  NANTES: "Loire", ORLEANS: "Loire", ROME: "Tiber", ROMA: "Tiber",
  FLORENCE: "Arno", PISA: "Arno", TURIN: "Po", FERRARA: "Po",
  LISBON: "Tagus", LISBOA: "Tagus", TOLEDO: "Tagus", PORTO: "Douro",
  SEVILLE: "Guadalquivir", ZARAGOZA: "Ebro", HAMBURG: "Elbe", DRESDEN: "Elbe",
  BREMEN: "Weser", PRAGUE: "Vltava", BERLIN: "Spree", WARSAW: "Vistula",
  KRAKOW: "Vistula", WROCLAW: "Oder", KIEV: "Dnieper", KYIV: "Dnieper",
  SMOLENSK: "Dnieper", MOSCOW: "Moskva", RIGA: "Daugava", DUBLIN: "Liffey",
  GLASGOW: "Clyde", VIENNA: "Danube", BUDAPEST: "Danube", BELGRADE: "Danube",
  COLOGNE: "Rhine", BAMAKO: "Niger", TIMBUKTU: "Niger", GAO: "Niger",
  CAIRO: "Nile", ASWAN: "Nile", KHARTOUM: "Nile", LUXOR: "Nile",
  KINSHASA: "Congo", BRAZZAVILLE: "Congo", TETE: "Zambezi",
  BAGHDAD: "Tigris", MOSUL: "Tigris", BABYLON: "Euphrates", RAQQA: "Euphrates",
  DAMASCUS: "Barada", SAMARKAND: "Zeravshan", TASHKENT: "Chirchiq",
  KABUL: "Kabul River", LAHORE: "Ravi", DELHI: "Yamuna", AGRA: "Yamuna",
  VARANASI: "Ganges", PATNA: "Ganges", KOLKATA: "Hooghly", DHAKA: "Buriganga",
  MANDALAY: "Irrawaddy", YANGON: "Yangon River", BANGKOK: "Chao Phraya",
  HANOI: "Red River", PHNOM_PENH: "Mekong", VIENTIANE: "Mekong",
  JAKARTA: "Ciliwung", PALEMBANG: "Musi", PONTIANAK: "Kapuas",
  BANJARMASIN: "Barito", SURAKARTA: "Bengawan Solo", SEOUL: "Han River",
  PYONGYANG: "Taedong", TOKYO: "Sumida", KYOTO: "Kamo", OSAKA: "Yodo",
  WUHAN: "Yangtze", NANJING: "Yangtze", CHONGQING: "Yangtze",
  CHANGSHA: "Xiang", GUANGZHOU: "Pearl River", FUZHOU: "Min River",
  HANGZHOU: "Qiantang", LUOYANG: "Luo River", CHENGDU: "Jin River",
  NOVOSIBIRSK: "Ob", OMSK: "Irtysh", TOBOLSK: "Irtysh", TOMSK: "Tom River",
  IRKUTSK: "Angara", KRASNOYARSK: "Yenisei", YAKUTSK: "Lena", KHABAROVSK: "Amur",
  MONTREAL: "Saint Lawrence", QUEBEC: "Saint Lawrence", OTTAWA: "Ottawa River",
  DETROIT: "Detroit River", CHICAGO: "Chicago River", PITTSBURGH: "Ohio River",
  CAHOKIA: "Mississippi", NEW_ORLEANS: "Mississippi", MEMPHIS: "Mississippi",
  WASHINGTON: "Potomac", NEW_YORK: "Hudson", PHILADELPHIA: "Delaware",
  RICHMOND: "James River", IQUITOS: "Amazon", LETICIA: "Amazon",
  MANAUS: "Rio Negro", SANTAREM: "Tapajos", CIUDAD_BOLIVAR: "Orinoco",
  LIMA: "Rimac", CUSCO: "Huatanay", AREQUIPA: "Chili River",
  SANTIAGO: "Mapocho", CONCEPCION: "Biobio", ASUNCION: "Paraguay", ROSARIO: "Parana",
};
function earthWaterLookup(regionLookup) {
  if (!regionLookup?.sourcePlot) return null;
  const column = { GiantEarth: 2, GreatestEarthMap: 3, StockEarth: 4 }[regionLookup.sourceMapName];
  if (!column) return null;
  const width = column === 2 ? 180 : column === 3 ? 104 : 106;
  const height = column === 2 ? 94 : column === 3 ? 64 : 66;
  const riverCities = new Map(), riverRadius = column === 2 ? 2 : 1;
  for (const row of apiValue("Earth river city atlas lookup", () => Array.from(GameInfo.CityMap || []), [])) {
    if (row.MapName !== regionLookup.sourceMapName) continue;
    const city = String(row.CityLocaleName || "").replace(/^LOC_CITY_NAME_/, "");
    const x = Number(row.X), y = Number(row.Y);
    if (!Object.prototype.hasOwnProperty.call(EARTH_RIVER_CITIES, city)
      || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!riverCities.has(city)) riverCities.set(city, []);
    riverCities.get(city).push([x, y]);
  }
  const riverAnchors = [];
  for (const [city, points] of riverCities) {
    // Reused city keys in distant countries are not reliable river landmarks.
    if (points.some(([x, y]) => Math.min(Math.abs(x - points[0][0]), width - Math.abs(x - points[0][0])) > riverRadius * 3
      || Math.abs(y - points[0][1]) > riverRadius * 3)) continue;
    for (const point of points) riverAnchors.push([EARTH_RIVER_CITIES[city], ...point]);
  }
  return (plot, kind) => {
    const source = regionLookup.sourcePlot(plot);
    if (!source) return "";
    const { x, y } = source;
    if (kind === "river") {
      let nearest = Infinity, name = "";
      for (const [river, ax, ay] of riverAnchors) {
        const raw = Math.abs(x - ax), distance = Math.min(raw, width - raw) ** 2 + (y - ay) ** 2;
        if (distance < nearest) { nearest = distance; name = river; }
      }
      if (nearest <= riverRadius ** 2) return name;
    }
    if (kind === "archipelago") {
      if (column === 2 && x >= 91 && x <= 124 && y >= 18 && y <= 33) return "Melanesia";
      if (column === 2 && x >= 98 && x <= 112 && y >= 34 && y <= 51) return "Micronesia";
      if (column === 2 && x >= 113 && x <= 122 && y >= 47 && y <= 54) return "Hawaiian Islands";
      if (column === 2 && x >= 113 && x <= 140 && y >= 10 && y <= 46) return "Polynesia";
      return "";
    }
    if (kind === "island" && column === 2) {
      const name = giantEarthLandName(source, true);
      if (name) return name;
    }
    let name = "", nearest = Infinity;
    for (const anchor of EARTH_WATER_ANCHORS) {
      if (anchor[0] !== (kind === "ocean" ? "sea" : kind)) continue;
      if (column === 2 && kind === "island" && GIANT_EARTH_LAND_AREAS.some(area => area[0] === anchor[1])) continue;
      const [ax, ay] = anchor[column], raw = Math.abs(x - ax);
      const distance = Math.min(raw, width - raw) ** 2 + (y - ay) ** 2;
      if (distance < nearest) { nearest = distance; name = anchor[1]; }
    }
    if (kind === "ocean") return nearest <= (column === 2 ? 6 : 3) ** 2
      ? name : earthWaterLookupOcean(x, y, column, width, height);
    if (kind === "sea" && nearest > (column === 2 ? 12 : 7) ** 2) {
      return earthWaterLookupOcean(x, y, column, width, height);
    }
    return nearest <= (column === 2 ? kind === "island" ? 4 : 10 : 6) ** 2 ? name : "";
  };
}
function earthWaterLookupOcean(x, y, column, width, height) {
  if (y < height * 0.08) return "Southern Ocean";
  if (y >= height * 0.9) return "Arctic Ocean";
  if (column === 2) {
    const americanDivide = y >= 50 ? 145 : y >= 35 ? 153 : 166;
    return x > 95 && x < americanDivide ? "Pacific Ocean"
      : x >= 40 && x <= 95 && y < 45 ? "Indian Ocean" : "Atlantic Ocean";
  }
  const americanDivide = column === 3
    ? y >= 48 ? 10 : y >= 30 ? 14 : y >= 15 ? 24 : 29
    : y >= 45 ? 17 : y >= 30 ? 20 : y >= 15 ? 29 : 31;
  return x < americanDivide ? "Pacific Ocean"
    : x > 65 ? x < 94 && y < 32 ? "Indian Ocean" : "Pacific Ocean" : "Atlantic Ocean";
}

function earthRegionLookup(mapName, width, height) {
  const selected = String(mapName).toUpperCase();
  const expected = selected.includes("GREATEST_EARTH") ? "GreatestEarthMap"
    : selected.includes("GIANT_EARTH") ? "GiantEarth"
    : selected.includes("REGIONAL_EARTH") ? "regional" : "";
  if (!expected) return null;
  if (typeof GameTutorial === "undefined" || typeof Database === "undefined" ||
      typeof GameTutorial.getProperty !== "function" || typeof Database.makeHash !== "function") return null;
  const raw = apiValue("Earth map context lookup",
    () => GameTutorial.getProperty(Database.makeHash("YnAMP_GeographicUnlockMapContext")), null);
  if (!raw) return null;
  const context = typeof raw === "string"
    ? apiValue("Earth map context parsing", () => JSON.parse(raw), null) : raw;
  if (!context || context.schemaVersion !== 1 || context.status !== "ready") {
    reportError("Earth map context is invalid or not ready; using only independently verified Earth names");
    return null;
  }
  const matchesMap = expected === "regional"
    ? ["MassiveColonization", "MassiveOldWorld", "MassiveIndoPacific"].includes(context.mapName)
    : context.mapName === expected;
  const expectedSource = expected === "regional" ? "GiantEarth" : expected;
  if (!matchesMap || context.sourceMapName !== expectedSource) {
    reportError("Earth map context does not match the selected map; using only independently verified Earth names");
    return null;
  }
  const fields = ["sourceWidth", "sourceHeight", "sourceStartX", "sourceEndX", "sourceStartY",
    "sourceEndY", "liveWidth", "liveHeight", "livePlayableStartX", "livePlayableEndX"];
  if (fields.some(field => !Number.isInteger(context[field])) || context.liveWidth !== width ||
      context.liveHeight !== height || context.sourceWidth <= 0 || context.sourceHeight <= 0 ||
      context.sourceWidth !== (expectedSource === "GiantEarth" ? 180 : 104) ||
      context.sourceHeight !== (expectedSource === "GiantEarth" ? 94 : 64) ||
      context.sourceStartX < 0 || context.sourceStartX >= context.sourceWidth ||
      context.sourceEndX < 0 || context.sourceEndX >= context.sourceWidth ||
      context.sourceStartY < 0 || context.sourceEndY >= context.sourceHeight ||
      context.sourceEndY - context.sourceStartY + 1 !== height ||
      (context.sourceEndX - context.sourceStartX + context.sourceWidth) % context.sourceWidth + 1 !== width ||
      context.livePlayableStartX < 0 || context.livePlayableEndX >= width ||
      context.livePlayableStartX > context.livePlayableEndX) {
    reportError("Earth map context has invalid dimensions or bounds; using only independently verified Earth names");
    return null;
  }
  const rows = apiValue("Earth region metadata lookup", () => Array.from(GameInfo.RegionPosition || []), [])
    .filter(row => row.MapName === context.sourceMapName && EARTH_REGION_NAMES[row.Region] &&
      [row.X, row.Y, row.Width, row.Height].every(Number.isInteger) && row.Width > 0 && row.Height > 0);
  if (!rows.length) {
    reportError("Earth region metadata is unavailable; using only independently verified Earth names");
    return null;
  }
  const sourcePlot = plot => {
    if (plot.x < context.livePlayableStartX || plot.x > context.livePlayableEndX) return "";
    return { x: (context.sourceStartX + plot.x) % context.sourceWidth, y: context.sourceStartY + plot.y };
  };
  const tundraBoundary = context.sourceMapName === "GiantEarth" ? giantEarthTundraBoundary(sourcePlot, width, height) : null;
  const lookup = plot => {
    const source = sourcePlot(plot);
    if (!source) return "";
    const { x, y } = source;
    if (context.sourceMapName === "GiantEarth") {
      const name = giantEarthLandName(source, false, tundraBoundary);
      if (name) return name;
    }
    let best = null;
    for (const row of rows) {
      if (x >= row.X && x < row.X + row.Width && y >= row.Y && y < row.Y + row.Height &&
          (!best || row.Width * row.Height < best.Width * best.Height)) best = row;
    }
    if (!best) {
      let distance = Infinity;
      for (const row of rows) {
        const dx = Math.abs(x - (row.X + row.Width / 2));
        const d = Math.min(dx, context.sourceWidth - dx) ** 2 + (y - row.Y - row.Height / 2) ** 2;
        if (d < distance) { best = row; distance = d; }
      }
    }
    const name = best ? EARTH_REGION_NAMES[best.Region] : "";
    if (context.sourceMapName === "GiantEarth") {
      const regionalName = ({ Greenland: "North America", Australia: "Oceania", Madagascar: "East Africa",
        Anatolia: "West Asia", Antarctica: "" })[name] ?? name;
      return mergedGiantEarthRegionName(regionalName, source, tundraBoundary);
    }
    return name;
  };
  lookup.sourceMapName = context.sourceMapName;
  lookup.sourcePlot = sourcePlot;
  lookup.tundraBoundary = tundraBoundary;
  return lookup;
}

let neighborCache = new Map();
function neighborsOf(plot) {
  const key = plot.y * mapWidth + plot.x;
  if (neighborCache.has(key)) return neighborCache.get(key);
  const out = [];
  const evenRow = (plot.y & 1) === 0;
  const horizontalOffsets = [
    1, -1,
    evenRow ? 0 : 1, evenRow ? -1 : 0,
    evenRow ? 0 : 1, evenRow ? -1 : 0,
  ];
  // Map View boundary edges use E,W,NE,NW,SE,SW, not the native enum's order.
  const directions = [DirectionTypes.DIRECTION_EAST, DirectionTypes.DIRECTION_WEST,
    DirectionTypes.DIRECTION_NORTHEAST, DirectionTypes.DIRECTION_NORTHWEST,
    DirectionTypes.DIRECTION_SOUTHEAST, DirectionTypes.DIRECTION_SOUTHWEST];
  for (let direction = 0; direction < 6; direction++) {
    const neighbor = apiValue("adjacent plot lookup", () => GameplayMap.getAdjacentPlotLocation(plot, directions[direction]), null);
    if (!neighbor || !Number.isInteger(neighbor.x) || !Number.isInteger(neighbor.y)) continue;
    if (neighbor.y < 0 || neighbor.y >= mapHeight) continue;
    const expectedX = plot.x + horizontalOffsets[direction];
    const x = ((neighbor.x % mapWidth) + mapWidth) % mapWidth;
    const index = indexFor(x, neighbor.y);
    const wrapped = x !== neighbor.x || expectedX < 0 || expectedX >= mapWidth;
    if (index >= 0) out.push({ index, x, y: neighbor.y, direction, wrapped });
  }
  neighborCache.set(key, out);
  return out;
}

let mapWidth = 0;
let mapHeight = 0;

function rememberName(key, name) {
  try {
    const store = typeof window !== "undefined" ? window.AnthroproceniaNames : null;
    return store ? store.remember(key, name) : name;
  } catch (error) {
    reportError(`label name storage failed: ${error}`);
    return name;
  }
}
function rememberValidatedName(key, name) {
  try {
    const store = typeof window !== "undefined" ? window.AnthroproceniaNames : null;
    if (!store) return name;
    const stored = store.get(key);
    return stored === name ? stored : store.set(key, name);
  } catch (error) {
    reportError(`validated label name storage failed: ${error}`);
    return name;
  }
}

function rememberWarName(key, regionName, islands = false) {
  const pair = /^border-war:(\d+)[,:](\d+):/.exec(key);
  const canonical = pair ? `war-pair:${[Number(pair[1]), Number(pair[2])].sort((a, b) => a - b).join(":")}` : key;
  const prior = rememberName(canonical, "");
  if (prior) return prior;
  if (!regionName) return "";
  const location = regionName.replace(/^The /, "the ");
  const formats = [
    `War of ${location}`, `War for ${location}`, `Conflict over ${location}`,
    `Campaign for ${location}`, `Struggle for ${location}`,
    ...(islands ? [`Island War for ${location}`, `Island Campaign for ${location}`, `War across ${location}`] : []),
  ];
  const generated = formats[deterministicIndex(`${gameSeed()}|${canonical}|${regionName}`, formats.length)];
  const migrated = rememberName(`name3:${key}`, "");
  const stored = rememberName(`name4:${key}`, "") || migrated || rememberName(key, generated);
  if (/\d/.test(stored) && !/\d/.test(regionName)) {
    return rememberName(canonical, generated);
  }
  const corrected = normalizeGeographicQualifiers(stored);
  return rememberName(canonical, corrected);
}
function warNameForPlayers(first, second, owners = null, data = buildGeography()) {
  const pair = [first, second].sort((a, b) => a - b), key = `border-war:${pair.join(":")}:`;
  const stored = rememberWarName(key, "");
  if (stored || !data) return stored;
  if (!owners) owners = currentOwners(data);
  const regions = new Map(data.regions.map(region => [region.id, region]));
  const involved = new Set(), candidates = [...owners].filter(([, owner]) => pair.includes(owner)).sort((a, b) => a[0] - b[0]);
  for (const [index, owner] of candidates) {
    const plot = data.locations.get(index);
    if (!plot) continue;
    const neighbor = neighborsOf(plot).find(neighbor => owners.get(neighbor.index) === pair[1 - pair.indexOf(owner)]);
    if (!neighbor) continue;
    involved.add(regions.get(data.regionForTile.get(index)));
    involved.add(regions.get(data.regionForTile.get(neighbor.index)));
    break;
  }
  if (!involved.size) for (const owner of pair) {
    const counts = new Map();
    for (const [index, candidate] of candidates) if (candidate === owner) {
      const region = regions.get(data.regionForTile.get(index));
      if (region) counts.set(region, (counts.get(region) || 0) + 1);
    }
    const region = [...counts].sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))[0]?.[0];
    if (region) involved.add(region);
  }
  const selected = [...involved].filter(Boolean);
  const location = [...new Set(selected.map(region => region.name))].sort().join(" and ");
  return rememberWarName(key + location, location, selected.length > 0 && selected.every(region => region.island));
}
function warRegionName(index, neighbor, data = buildGeography()) {
  if (!data) return "";
  const ids = new Set([data.regionForTile.get(index), data.regionForTile.get(neighbor)]);
  return [...new Set(data.regions.filter(region => ids.has(region.id)).map(region => region.name))].sort().join(" and ");
}

// The game's own name for the river on a plot ("" when it has none or the name is an unresolved key).
function riverNameAt(x, y) {
  const raw = apiValue("river name lookup", () => GameplayMap.getRiverName?.(x, y), "");
  if (!raw) return "";
  const name = apiValue("river name localization", () => Locale.compose(raw), "");
  return name && !/^LOC_/i.test(name) ? String(name).trim() : "";
}

function landClass(x, y) {
  const water = apiValue("water terrain lookup", () => GameplayMap.isWater(x, y), false);
  const navigableRiver = apiValue("navigable river lookup", () => GameplayMap.isNavigableRiver(x, y), false);
  const riverType = apiValue("river type lookup", () => GameplayMap.getRiverType(x, y), null);
  const hasRiverType = riverType != null && typeof RiverTypes !== "undefined" && riverType !== RiverTypes.NO_RIVER;
  const river = hasRiverType || apiValue("river lookup", () => GameplayMap.isRiver?.(x, y), false) || navigableRiver;
  const lake = apiValue("lake lookup", () => GameplayMap.isLake(x, y), false);
  const mountain = apiValue("mountain lookup", () => GameplayMap.isMountain(x, y), false);
  const terrainType = apiValue("terrain type lookup", () => GameInfo.Terrains.lookup(GameplayMap.getTerrainType(x, y))?.TerrainType, "");
  return {
    water: !!water || !!lake,
    river: !!river,
    riverName: river ? riverNameAt(x, y) : "",
    navigableRiver: !!navigableRiver,
    lake: !!lake,
    mountain: !!mountain,
    coast: water && terrainType === "TERRAIN_COAST",
    deepWater: water && terrainType === "TERRAIN_OCEAN",
  };
}

function centerIndex(tiles, locations) {
  if (!tiles.length) return -1;
  let x = 0, y = 0;
  for (const index of tiles) {
    const location = locations.get(index);
    x += location.x;
    y += location.y;
  }
  x /= tiles.length;
  y /= tiles.length;
  let best = tiles[0], bestDistance = Infinity;
  for (const index of tiles) {
    const location = locations.get(index);
    const dx = location.x - x, dy = location.y - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  }
  return best;
}

function collectComponents(records, predicate, locations, gap = 0) {
  const candidates = new Set();
  for (const [index, record] of records) if (predicate(record, index)) candidates.add(index);
  const components = [];
  while (candidates.size) {
    const first = candidates.values().next().value;
    const queue = [first], tiles = [];
    candidates.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], plot = locations.get(index);
      tiles.push(index);
      const adjacent = neighborsOf(plot);
      const connected = gap ? adjacent.concat(adjacent.flatMap(neighbor => neighborsOf(locations.get(neighbor.index)))) : adjacent;
      for (const neighbor of connected) {
        if (!candidates.has(neighbor.index)) continue;
        candidates.delete(neighbor.index);
        queue.push(neighbor.index);
      }
    }
    components.push(tiles);
  }
  return components;
}

function coastalIslandChains(landComponents, records, locations) {
  const tiny = new Set(landComponents.filter(tiles => tiles.length <= 3).flat());
  const components = collectComponents(records, (record, index) => tiny.has(index) ||
    record.water && !record.deepWater && !record.lake && !record.river, locations);
  const chains = [];
  for (const component of components) {
    const land = component.filter(index => tiny.has(index));
    if (!land.length) continue;
    const members = landComponents.filter(tiles => tiny.has(tiles[0]) && land.includes(tiles[0]));
    if (members.length < 2) continue;
    const enclosed = component.every(index => {
      const adjacent = neighborsOf(locations.get(index));
      return adjacent.length === 6 && adjacent.every(neighbor => {
        const record = records.get(neighbor.index);
        return tiny.has(neighbor.index) || record?.water && !record.lake && !record.river;
      });
    });
    if (enclosed) chains.push(land);
  }
  return chains;
}

function civKey(value) {
  return String(value || "").replace(/^CIVILIZATION_/i, "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function majorCivAt(index, locations, civByOwner) {
  const plot = locations.get(index);
  if (!plot) return null;
  const owner = apiValue("region owner lookup", () => GameplayMap.getOwner(plot.x, plot.y), -1);
  if (!Number.isInteger(owner) || owner < 0) return null;
  if (civByOwner.has(owner)) return civByOwner.get(owner);
  const player = apiValue("region owner player lookup", () => Players.get(owner), null);
  if (!player?.isMajor) { civByOwner.set(owner, null); return null; }
  const type = civKey(player.civilizationType);
  const civ = type ? { owner, type } : null;
  civByOwner.set(owner, civ);
  return civ;
}

function nearestCivAssignments(tiles, locations, seedCivs) {
  const included = new Set(tiles);
  const distanceByTile = new Map(), civByTile = new Map(), queue = [];
  for (const [index, civ] of seedCivs) {
    if (!included.has(index)) continue;
    distanceByTile.set(index, 0);
    civByTile.set(index, civ);
    queue.push(index);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], distance = distanceByTile.get(index), civ = civByTile.get(index);
    for (const neighbor of neighborsOf(locations.get(index))) {
      if (!included.has(neighbor.index)) continue;
      const nextDistance = distance + 1, priorDistance = distanceByTile.get(neighbor.index);
      const priorCiv = civByTile.get(neighbor.index);
      if (priorDistance != null && (priorDistance < nextDistance || (priorDistance === nextDistance && priorCiv.owner <= civ.owner))) continue;
      distanceByTile.set(neighbor.index, nextDistance);
      civByTile.set(neighbor.index, civ);
      queue.push(neighbor.index);
    }
  }
  return civByTile;
}

function splitIntoRegions(tiles, locations, civByTile) {
  const remaining = new Set(tiles), regions = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    const civ = civByTile.get(first) || null;
    const queue = [first], component = [];
    remaining.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      component.push(index);
      for (const neighbor of neighborsOf(locations.get(index))) {
        if (!remaining.has(neighbor.index)) continue;
        const neighborCiv = civByTile.get(neighbor.index) || null;
        if ((civ && neighborCiv?.owner !== civ.owner) || (!civ && neighborCiv)) continue;
        remaining.delete(neighbor.index);
        queue.push(neighbor.index);
      }
    }
    regions.push({ civ, tiles: component });
  }
  return regions;
}

function historicalRegionName(civ, tiles, records, usedNames, water = false, cursors = null) {
  const choices = (water ? HISTORICAL_WATER_NAMES[civ?.type] : HISTORICAL_REGION_NAMES[civ?.type]) || [];
  const key = tiles.slice().sort((a, b) => a - b).join(",");
  const start = choices.length ? deterministicIndex(`${gameSeed()}|${civ?.type}|${key}`, choices.length) : 0;
  for (let offset = 0; offset < choices.length; offset++) {
    const candidate = choices[(start + offset) % choices.length];
    if (!usedNames.has(candidate)) { usedNames.add(candidate); return candidate; }
  }
  const landChoices = HISTORICAL_REGION_NAMES[civ?.type] || [];
  for (const candidate of landChoices) {
    if (!usedNames.has(candidate)) { usedNames.add(candidate); return candidate; }
  }
  const civName = civ?.type.replace(/[^a-z]/gi, "");
  if (civName && !usedNames.has(civName)) { usedNames.add(civName); return civName; }
  if (!water) {
    const continent = localizedContinentForTiles(tiles, records);
    const oneWordContinent = continent && continent.name.replace(/[^a-z]/gi, "");
    if (oneWordContinent && !usedNames.has(oneWordContinent)) {
      usedNames.add(oneWordContinent);
      return oneWordContinent;
    }
  }
  const fallbacks = water ? FALLBACK_WATER_NAMES : FALLBACK_REGION_NAMES;
  const fallbackStart = deterministicIndex(`${gameSeed()}|${water ? "water" : "land"}|${key}`, fallbacks.length);
  for (let offset = 0; offset < fallbacks.length; offset++) {
    const candidate = fallbacks[(fallbackStart + offset) % fallbacks.length];
    if (!usedNames.has(candidate)) { usedNames.add(candidate); return candidate; }
  }
  const base = choices[start] || fallbacks[fallbackStart];
  const unique = uniqueGeographicName(base, usedNames, value => value, cursors);
  usedNames.add(unique);
  return unique;
}

function localizedContinentForTiles(tiles, records) {
  const counts = new Map();
  for (const index of tiles) {
    const continent = records.get(index)?.continent;
    if (!continent) continue;
    const current = counts.get(continent.id) || { ...continent, count: 0 };
    current.count++;
    counts.set(continent.id, current);
  }
  let best = null;
  for (const continent of counts.values()) if (!best || continent.count > best.count) best = continent;
  return best;
}

const REGION_TARGET = 100;

function splitConnectedBy(tiles, locations, keyOf) {
  const remaining = new Set(tiles), parts = [];
  while (remaining.size) {
    const first = remaining.values().next().value, key = keyOf(first);
    const queue = [first], part = [];
    remaining.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      part.push(index);
      for (const neighbor of neighborsOf(locations.get(index))) {
        if (!remaining.has(neighbor.index) || keyOf(neighbor.index) !== key) continue;
        remaining.delete(neighbor.index);
        queue.push(neighbor.index);
      }
    }
    parts.push(part);
  }
  return parts;
}

// Graph-distance seeds keep winding coastlines and wrapped continents contiguous.
function splitRegionTiles(tiles, locations) {
  const set = new Set(tiles);
  const farthest = seed => {
    const seen = new Set([seed]), queue = [seed];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const neighbor of neighborsOf(locations.get(queue[cursor]))) {
        if (!set.has(neighbor.index) || seen.has(neighbor.index)) continue;
        seen.add(neighbor.index); queue.push(neighbor.index);
      }
    }
    if (seen.size !== set.size) throw new Error("Cannot subdivide a disconnected geographic region");
    return queue[queue.length - 1];
  };
  const s0 = farthest(tiles[0]), s1 = farthest(s0);
  const owner = new Map([[s0, 0], [s1, 1]]), queue = [s0, s1];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    for (const neighbor of neighborsOf(locations.get(index))) {
      if (!set.has(neighbor.index) || owner.has(neighbor.index)) continue;
      owner.set(neighbor.index, owner.get(index));
      queue.push(neighbor.index);
    }
  }
  const a = [], b = [];
  for (const t of tiles) {
    (owner.get(t) ? b : a).push(t);
  }
  return [a, b];
}

// Bring the region count to `target`: split the biggest regions while short, merge the smallest while over.
function fitRegionCount(entries, locations, target) {
  entries = entries.flatMap(entry => entry.island || entry.archipelago ? [entry] : splitConnectedBy(entry.tiles, locations, () => null)
    .map(tiles => ({ ...entry, tiles })));
  while (entries.length < target) {
    let big = null;
    for (const entry of entries) if (!entry.water && !entry.island && entry.tiles.length >= 2 && (!big || entry.tiles.length > big.tiles.length)) big = entry;
    if (!big) break;
    const [a, b] = splitRegionTiles(big.tiles, locations);
    if (!a.length || !b.length) break;
    entries.splice(entries.indexOf(big), 1, { ...big, tiles: a }, { ...big, tiles: b });
  }
  if (entries.length > target) {
    const entryByTile = new Map();
    for (const entry of entries) for (const index of entry.tiles) entryByTile.set(index, entry);
    const active = new Set(entries), heap = [], order = new Map(entries.map((entry, i) => [entry, i]));
    const less = (a, b) => a.size < b.size || (a.size === b.size && a.order < b.order);
    const push = entry => {
      const item = { entry, size: entry.tiles.length, order: order.get(entry) };
      let i = heap.length;
      heap.push(item);
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (!less(item, heap[parent])) break;
        heap[i] = heap[parent]; i = parent;
      }
      heap[i] = item;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
          if (!less(heap[child], last)) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    for (const entry of entries) push(entry);
    while (active.size > target && heap.length) {
      const item = pop(), small = item.entry;
      if (!active.has(small) || small.tiles.length !== item.size) continue;
      let target2 = null;
      for (const index of small.tiles) {
        for (const neighbor of neighborsOf(locations.get(index))) {
          const other = entryByTile.get(neighbor.index);
          if (other && other !== small && other.water === small.water &&
              other.continent === small.continent && other.waterKind === small.waterKind &&
              !other.island && !small.island) { target2 = other; break; }
        }
        if (target2) break;
      }
      if (!target2) continue;
      for (const index of small.tiles) entryByTile.set(index, target2);
      target2.tiles = target2.tiles.concat(small.tiles);
      active.delete(small);
      push(target2);
    }
    entries = entries.filter(entry => active.has(entry));
  }
  return entries;
}

function buildGeography() {
  const width = apiValue("map width lookup", () => GameplayMap.getGridWidth(), 0);
  const height = apiValue("map height lookup", () => GameplayMap.getGridHeight(), 0);
  if (!(width > 0) || !(height > 0)) {
    reportError("cannot build geographic names before map dimensions are available");
    return null;
  }
  mapWidth = width;
  mapHeight = height;
  const seed = gameSeed();
  const mapName = apiValue("map name lookup", () => Configuration.getMap?.()?.mapName, "");
  const localizedMapName = mapName ? apiValue("map name localization", () => Locale.compose(mapName), "") : "";
  const namedEarth = /earth/i.test(String(mapName)) || /earth/i.test(String(localizedMapName));
  const nativeEarthRivers = namedEarth && !/random.*earth|earth.*random/i.test(String(mapName));
  const cacheKey = `${width}x${height}|${seed ?? "unseeded"}|${mapName || ""}`;
  if (geographyCache && geographyCacheKey === cacheKey) return geographyCache;
  neighborCache = new Map();
  let earthRegionAt = namedEarth
    ? earthRegionLookup(mapName, width, height) || fixedGiantEarthRegionLookup(mapName, width, height) ||
      stockEarthRegionLookup(mapName, width, height) : null;
  const earthWaterAt = earthWaterLookup(earthRegionAt);
  const earthMountainAt = earthMountainLookup(earthRegionAt);

  const records = new Map(), locations = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = indexFor(x, y);
      if (index < 0) continue;
      const plot = { x, y };
      const terrain = landClass(x, y);
      const continent = terrain.water ? null : continentFor(x, y);
      records.set(index, { ...terrain, continent });
      locations.set(index, plot);
    }
  }
  earthRegionAt = includeConnectedItaliaTiles(earthRegionAt, records, locations);

  let landComponents = collectComponents(records, record => !record.water && !record.lake, locations);
  const antarctic = nativeEarthRivers && landComponents.filter(tiles => tiles.some(index => {
    const plot = locations.get(index), source = earthRegionAt?.sourcePlot(plot);
    return source ? source.y === 0 : plot.y === 0;
  }));
  const antarcticTiles = new Set(antarctic ? antarctic.flat() : []);
  if (antarctic?.length) {
    landComponents = landComponents.filter(tiles => !antarcticTiles.has(tiles[0]));
    landComponents.push([...antarcticTiles]);
  }
  const chains = coastalIslandChains(landComponents, records, locations);
  const chainTiles = new Set(chains.flat());
  landComponents = landComponents.filter(tiles => !chainTiles.has(tiles[0])).concat(chains);
  const waterComponents = (predicate, kind) => {
    const components = collectComponents(records, predicate, locations);
    return earthWaterAt ? components.flatMap(tiles => splitConnectedBy(tiles, locations,
      index => earthWaterAt(locations.get(index), kind))) : components;
  };
  const oceanComponents = waterComponents(
    record => record.water && record.deepWater && !record.lake && !record.river, "ocean");
  const seaComponents = waterComponents(
    record => record.water && !record.deepWater && !record.lake && !record.river, "sea");
  const lakeComponents = collectComponents(records, record => record.lake, locations);
  const riverWaterComponents = collectComponents(records, record => record.water && record.river && !record.lake, locations);
  const landTileCount = landComponents.reduce((total, tiles) => total + tiles.length, 0);
  const islandThreshold = Math.max(8, Math.floor(landTileCount * 0.015));
  const islandEarthNames = new Map(), mainlandEarthComponents = new Set();
  if (earthWaterAt) for (const tiles of landComponents) {
    if (tiles.length > Math.max(islandThreshold, width * height * 0.04)) continue;
    if (earthRegionAt.sourceMapName === "GiantEarth" && tiles.length > 100 && tiles.some(index => {
      const source = earthRegionAt.sourcePlot(locations.get(index));
      return source && giantEarthLandName(source).endsWith(" Australia");
    })) {
      mainlandEarthComponents.add(tiles[0]);
      continue;
    }
    const names = new Map();
    for (const index of tiles) {
      const name = earthWaterAt(locations.get(index), "island");
      if (name) names.set(name, (names.get(name) || 0) + 1);
    }
    const name = [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (name) for (const index of tiles) islandEarthNames.set(index, name);
  }
  const isIsland = tiles => !mainlandEarthComponents.has(tiles[0]) && (tiles.length <= islandThreshold ||
    antarcticTiles.has(tiles[0]) || chainTiles.has(tiles[0]) || islandEarthNames.has(tiles[0]));
  const islandComponents = landComponents.filter(isIsland)
    .map(tiles => ({ tiles, key: tiles.slice().sort((a, b) => a - b).join(",") }))
    .sort((a, b) => deterministicIndex(`${seed}|island-style|${a.key}`, 0x7fffffff)
      - deterministicIndex(`${seed}|island-style|${b.key}`, 0x7fffffff) || a.key.localeCompare(b.key));
  const islandTiles = new Set(islandComponents.flatMap(island => island.tiles));
  const regions = [], features = [], regionForTile = new Map();
  for (const chain of chains) {
    const tiles = chain.slice().sort((a, b) => a - b);
    const stem = NAME_PARTS.islands[deterministicIndex(`${seed}|archipelago|${tiles[0]}`, NAME_PARTS.islands.length)];
    const center = centerIndex(tiles, locations);
    features.push({ id: `archipelago:${tiles[0]}`, type: "archipelago",
      name: earthWaterAt ? earthWaterAt(locations.get(center), "archipelago") : geographicName(stem, "archipelago", tiles[0]),
      nativeEarthName: !!earthWaterAt, center, tiles });
  }
  const usedRegionNames = new Set(), regionNameCursors = new Map(), landSeeds = new Map(), civByOwner = new Map();
  for (const [index, plot] of locations) {
    const civ = majorCivAt(index, locations, civByOwner);
    if (!civ) continue;
    landSeeds.set(index, civ);
  }
  const landCivByTile = new Map();
  const addRegions = (components, water) => {
    for (const component of components) {
      const sorted = component.tiles.slice().sort((a, b) => a - b);
      const center = centerIndex(sorted, locations);
      const historicalName = historicalRegionName(component.civ, sorted, records, usedRegionNames, water, regionNameCursors);
      const deepWater = water && sorted.some(index => records.get(index)?.deepWater);
      const lake = water && sorted.every(index => records.get(index)?.lake);
      const river = water && sorted.every(index => records.get(index)?.river);
      const islandTile = !water && sorted.every(index => islandTiles.has(index)) ? sorted[0] : undefined;
      const name = water
        ? geographicName(historicalName, lake ? "lake" : deepWater ? "ocean" : river ? "river" : "sea", sorted[0])
        : islandTile !== undefined ? geographicName(historicalName, "island", sorted[0]) : historicalName;
      const region = { id: `${water ? "water" : "land"}:${sorted[0]}`, name, center, tiles: sorted, boundary: [], water, island: islandTile !== undefined };
      if (nativeEarthRivers) {
        const source = earthRegionAt?.sourcePlot(locations.get(center));
        const islandRegion = source && earthRegionAt.sourceMapName === "GiantEarth"
          ? giantEarthLandName(source, false, earthRegionAt.tundraBoundary) : "";
        const earthName = antarcticTiles.has(sorted[0]) ? "Antarctica"
          : chainTiles.has(sorted[0]) && earthWaterAt?.(locations.get(center), "archipelago") ||
          (water ? earthWaterAt && earthWaterAt(locations.get(center), lake ? "lake" : river ? "river" : deepWater ? "ocean" : "sea")
          : islandTile !== undefined && earthWaterAt ? islandEarthNames.get(sorted[0]) || islandRegion :
          earthLandRegionName(locations.get(center), earthRegionAt) ||
          earthContinentName(records.get(center)?.continent?.name));
        const plot = locations.get(center);
        const landName = earthLandRegionName(plot, earthRegionAt) ||
          earthContinentName(records.get(center)?.continent?.name) || "Earth";
        const oceanName = earthWaterAt?.(plot, "ocean") || "World Ocean";
        region.name = earthName || (water ? lake ? `Inland Waters of ${landName}`
          : river ? `Waterways of ${landName}` : oceanName
          : islandTile !== undefined && earthWaterAt ? `${oceanName} Islands` : landName);
        region.nativeEarthName = true;
      }
      regions.push(region);
      for (const index of sorted) {
        regionForTile.set(index, region.id);
        if (!water && component.civ) landCivByTile.set(index, component.civ);
      }
    }
  };
  const landEntries = [];
  const continentOf = index => records.get(index)?.continent?.id ?? -1;
  for (const tiles of landComponents) {
    // A land-connected island is one region, even if its continent IDs differ.
    if (isIsland(tiles)) landEntries.push({ tiles, water: false, island: true, archipelago: chainTiles.has(tiles[0]) });
    else for (const part of splitConnectedBy(tiles, locations, index => {
      if (!earthRegionAt) return continentOf(index);
      const name = earthLandRegionName(locations.get(index), earthRegionAt);
      return name === "Italia" ? name : `${continentOf(index)}|${name}`;
    })) {
      landEntries.push({ tiles: part, water: false, continent: continentOf(part[0]) });
    }
    const sorted = tiles.slice().sort((a, b) => a - b);
    const key = sorted.join(",");
    if (isIsland(tiles) && !chainTiles.has(tiles[0])) {
      const center = centerIndex(sorted, locations);
      features.push({
        id: `island:${sorted[0]}`,
        type: "island",
        name: geographicName(NAME_PARTS.islands[deterministicIndex(`${seed}|islands|${key}`, NAME_PARTS.islands.length)], "island", key),
        center,
        tiles: sorted,
      });
    }
  }
  const waterEntries = [
    ...oceanComponents.map(tiles => ({ tiles, water: true, waterKind: "ocean" })),
    ...seaComponents.map(tiles => ({ tiles, water: true, waterKind: "sea" })),
    ...lakeComponents.map(tiles => ({ tiles, water: true, waterKind: "lake" })),
    ...riverWaterComponents.map(tiles => ({ tiles, water: true, waterKind: "river" })),
  ];
  const landTarget = Math.min(REGION_TARGET, Math.max(landEntries.length, Math.floor(landTileCount / 12)));
  // Atlas regions are physical locations, not a budget to merge away when islands exceed the target.
  const finalEntries = [...(earthRegionAt ? landEntries : fitRegionCount(landEntries, locations, landTarget)), ...waterEntries];
  const allLandTiles = [];
  for (const entry of finalEntries) if (!entry.water) allLandTiles.push(...entry.tiles);
  const civAssignments = nearestCivAssignments(allLandTiles, locations, landSeeds);
  for (const entry of finalEntries) {
    if (entry.water) { entry.civ = null; continue; }
    const counts = new Map();
    for (const index of entry.tiles) {
      const civ = civAssignments.get(index);
      if (!civ) continue;
      const current = counts.get(civ.owner) || { civ, count: 0 };
      current.count++;
      counts.set(civ.owner, current);
    }
    let best = null;
    for (const value of counts.values()) if (!best || value.count > best.count) best = value;
    entry.civ = best ? best.civ : null;
  }

  addRegions(finalEntries.filter(entry => !entry.water), false);
  addRegions(finalEntries.filter(entry => entry.water), true);

  for (const region of regions) {
    for (const index of region.tiles) {
      const plot = locations.get(index);
      const neighbors = new Map(neighborsOf(plot).map(neighbor => [neighbor.direction, neighbor]));
      for (let direction = 0; direction < 6; direction++) {
        const neighbor = neighbors.get(direction);
        if (!neighbor || neighbor.wrapped || regionForTile.get(neighbor.index) !== region.id) {
          if (!neighbor || neighbor.wrapped || index < neighbor.index) {
            region.boundary.push({ index, direction });
          }
        }
      }
    }
  }
  if (regionForTile.size !== records.size) {
    reportError(`region partition covers ${regionForTile.size} of ${records.size} map tiles`);
  }

  const mountainComponents = collectComponents(records, record => record.mountain, locations, 1);
  for (const component of mountainComponents) {
    const named = new Map();
    for (const index of component) {
      const name = earthMountainAt ? earthMountainAt(locations.get(index)) : "";
      if (!named.has(name)) named.set(name, []);
      named.get(name).push(index);
    }
    for (const [earthName, tiles] of named) {
      if (nativeEarthRivers && !earthName) continue;
      if (tiles.length < 2) continue;
      const sorted = tiles.slice().sort((a, b) => a - b);
      features.push({
        id: `mountains:${sorted[0]}`,
        type: "mountains",
        name: earthName || geographicName(NAME_PARTS.mountains[deterministicIndex(`${seed}|mountains|${sorted[0]}`, NAME_PARTS.mountains.length)], "mountains", sorted[0]),
        nativeEarthName: !!earthName,
        center: centerIndex(sorted, locations),
        tiles: sorted,
      });
    }
  }

  const riverComponents = collectComponents(records, record => record.river, locations);
  const earthRivers = new Map();
  const riverName = index => (earthWaterAt && earthWaterAt(locations.get(index), "river")) || records.get(index)?.riverName || "";
  for (const component of riverComponents) {
    // A connected river network is split by the game's own river names, so each named river gets its own label.
    for (const tiles of splitConnectedBy(component, locations, riverName)) {
      const sorted = tiles.slice().sort((a, b) => a - b);
      const realName = riverName(sorted[0]);
      if (nativeEarthRivers && (earthWaterAt || realName)) {
        if (!realName) continue;
        const key = realName.toLowerCase();
        if (!earthRivers.has(key)) earthRivers.set(key, { name: realName, tiles: [] });
        earthRivers.get(key).tiles.push(...sorted);
        continue;
      }
      features.push({
        id: `rivers:${sorted[0]}`,
        type: "river",
        name: realName || geographicName(NAME_PARTS.rivers[deterministicIndex(`${seed}|rivers|${sorted[0]}`, NAME_PARTS.rivers.length)], "river", sorted[0]),
        center: centerIndex(sorted, locations),
        tiles: sorted,
      });
    }
  }
  for (const river of earthRivers.values()) {
    river.tiles.sort((a, b) => a - b);
    features.push({ id: `rivers:${river.tiles[0]}`, type: "river", name: river.name,
      nativeEarthName: true, center: centerIndex(river.tiles, locations), tiles: river.tiles });
  }

  const waterGroups = [
    { type: "oceans", tiles: oceanComponents },
    { type: "seas", tiles: seaComponents },
    { type: "lakes", tiles: lakeComponents },
  ];
  for (const waterGroup of waterGroups) for (const tiles of waterGroup.tiles) {
    const sorted = tiles.slice().sort((a, b) => a - b);
    const shoreline = sorted.reduce((total, index) => {
      const plot = locations.get(index);
      return total + neighborsOf(plot).filter(neighbor => !records.get(neighbor.index)?.water).length;
    }, 0);
    const type = waterGroup.type === "oceans" || waterGroup.type === "lakes" ? waterGroup.type
      : shoreline >= 5 && sorted.length < landTileCount * 0.2 ? "gulfs" : "seas";
    const suffix = type === "oceans" ? "Ocean" : type === "gulfs" ? "Gulf" : type === "lakes" ? "Lake" : "Sea";
    features.push({
      id: `${type}:${sorted[0]}`,
      type: suffix.toLowerCase(),
      name: geographicName(NAME_PARTS[type][deterministicIndex(`${seed}|${type}|${sorted[0]}`, NAME_PARTS[type].length)], suffix.toLowerCase(), sorted[0]),
      center: centerIndex(sorted, locations),
      tiles: sorted,
    });
  }

  const nativeRegions = new Map(regions.filter(region => region.nativeEarthName).map(region => [region.id, region]));
  for (const feature of features) {
    if (earthWaterAt && ["ocean", "sea", "gulf", "lake"].includes(feature.type)) {
      feature.name = earthWaterAt(locations.get(feature.center), feature.type === "gulf" ? "sea" : feature.type);
      feature.nativeEarthName = true;
      continue;
    }
    if (nativeEarthRivers && !earthWaterAt && !["island", "archipelago", "river"].includes(feature.type)) {
      feature.name = ""; feature.nativeEarthName = true;
    }
    if (feature.type !== "island" && feature.type !== "archipelago") continue;
    const region = nativeRegions.get(regionForTile.get(feature.center));
    if (region && !(feature.type === "archipelago" && feature.nativeEarthName)) {
      feature.name = region.name; feature.nativeEarthName = true;
    }
    if (nativeEarthRivers && !feature.nativeEarthName) { feature.name = ""; feature.nativeEarthName = true; }
  }
  const boundary = [];
  const namesByKind = new Map(), nameCursorsByKind = new Map();
  const reservedEarthRivers = new Set([...earthRivers.values()].map(river => river.name.toLowerCase()));
  const saveUniqueName = (entry, kind, key) => {
    let used = namesByKind.get(kind);
    if (!used) { used = new Set(); namesByKind.set(kind, used); }
    let cursors = nameCursorsByKind.get(kind);
    if (!cursors) { cursors = new Map(); nameCursorsByKind.set(kind, cursors); }
    if (entry.nativeEarthName) { used.add(entry.name.toLowerCase()); return; }
    const migratedKey = `name3:${key}`, correctedKey = `name4:${key}`;
    const migrated = rememberName(migratedKey, "");
    let name = rememberName(correctedKey, "") || migrated || rememberName(key, "");
    const corrected = name && normalizeGeographicQualifiers(name);
    const needsCorrection = !!name && corrected !== name;
    const badDigits = !!name && /\d/.test(name) && !/\d/.test(entry.name);
    const reserved = kind === "river" ? new Set([...used, ...reservedEarthRivers]) : used;
    if (!name || reserved.has(name.toLowerCase()) || needsCorrection || badDigits) {
      const base = needsCorrection && !badDigits ? corrected : normalizeGeographicQualifiers(entry.name);
      name = uniqueGeographicName(base, reserved, value => value.toLowerCase(), cursors);
      const storageKey = needsCorrection || (migrated && badDigits) ? correctedKey : migratedKey;
      name = rememberName(storageKey, name);
      if (reserved.has(name.toLowerCase())) name = uniqueGeographicName(base, reserved, value => value.toLowerCase(), cursors);
    }
    used.add(name.toLowerCase());
    entry.name = name;
  };
  for (const region of regions) saveUniqueName(region, "regions", `region2:${region.id}`);
  for (const feature of features) saveUniqueName(feature, feature.type, `feature2:${feature.id}`);
  validateGeographicNames(regions, locations, width);
  validateGeographicNames(features, locations, width, reservedEarthRivers);
  for (const region of regions) {
    if (!region.nativeEarthName) region.name = rememberValidatedName(`name5:region2:${region.id}`, region.name);
  }
  for (const feature of features) {
    if (!feature.nativeEarthName) feature.name = rememberValidatedName(`name5:feature2:${feature.id}`, feature.name);
  }
  for (const feature of features) {
    if (feature.type !== "island" && feature.type !== "lake") continue;
    const region = regions.find(region => region.id === regionForTile.get(feature.center));
    if (region && region.tiles.length === feature.tiles.length) feature.name = region.name;
  }
  if (earthRegionAt?.sourceMapName === "GiantEarth") {
    const required = new Set(["Antarctica", "Western Siberia", "Eastern Siberia", "Western North Asia", "Eastern North Asia",
      ...GIANT_EARTH_LAND_AREAS.map(area => area[0]),
      ...GIANT_EARTH_PENINSULAS.map(area => area[0]).filter(name => name !== "Siberia" && name !== "North Asia")]);
    for (const entry of regions.concat(features)) entry.requiredEarthName = required.has(entry.name);
  }
  for (const region of regions) boundary.push(...region.boundary.map(edge => ({ ...edge, regionId: region.id })));
  const continents = new Map();
  for (const [index, record] of records) {
    if (!record.continent) continue;
    const { id, name } = record.continent;
    if (!continents.has(id)) continents.set(id, { id: `continent:${id}`, name, tiles: [] });
    continents.get(id).tiles.push(index);
  }
  geographyCache = { width, height, regions, continents: [...continents.values()],
    features: features.filter(feature => feature.name), boundary, regionForTile, locations };
  geographyCacheKey = cacheKey;
  return geographyCache;
}

function currentWarLabels(data = buildGeography()) {
  if (!data || typeof Players === "undefined" || typeof Players.get !== "function") return [];
  const owners = currentOwners(data);
  const majors = [];
  for (let id = 0; id < 64; id++) {
    const player = apiValue("player lookup", () => Players.get(id), null);
    if (player?.isMajor) majors.push({ id, player });
  }
  const wars = [];
  for (let i = 0; i < majors.length; i++) {
    for (let j = i + 1; j < majors.length; j++) {
      const { id: attacker, player } = majors[i], defender = majors[j].id;
      if (!apiValue("war status lookup", () => player.Diplomacy?.isAtWarWith?.(defender), false)) continue;
      let frontier = -1, otherSide = -1;
      for (const [index, owner] of owners) {
        if (owner !== attacker) continue;
        const plot = data.locations.get(index);
        const neighbor = neighborsOf(plot).find(neighbor => owners.get(neighbor.index) === defender);
        if (neighbor) { frontier = index; otherSide = neighbor.index; break; }
      }
      const regionId = data.regionForTile.get(frontier);
      const region = data.regions.find(entry => entry.id === regionId);
      if (region) {
        wars.push({ id: `war:${attacker}:${defender}`, type: "war", name: warNameForPlayers(attacker, defender, owners, data), center: frontier, tiles: [] });
      }
    }
  }
  return wars;
}

function currentOwners(data = geographyCache) {
  const owners = new Map();
  if (!data) return owners;
  for (const [index, plot] of data.locations) {
    const owner = apiValue("plot owner lookup", () => GameplayMap.getOwner(plot.x, plot.y), -1);
    if (typeof owner === "number" && owner >= 0) owners.set(index, owner);
  }
  return owners;
}

function layerGridName(type) {
  return `Anthroprocenia_${type}_${mapWidth}x${mapHeight}`;
}

class GeographyLensLayer {
  constructor(type) {
    this.type = type;
    this.grid = null;
    this.visible = false;
    this.drawn = false;
  }

  initLayer() {}

  applyLayer() {
    this.visible = true;
    this.draw();
    if (this.grid?.setVisible) this.grid.setVisible(true);
  }

  removeLayer() {
    this.visible = false;
    if (this.grid?.setVisible) this.grid.setVisible(false);
  }

  ensureGrid() {
    if (this.grid) return true;
    if (typeof WorldUI === "undefined" || typeof WorldUI.createSpriteGrid !== "function") {
      reportError("WorldUI sprite-grid API is unavailable; the geography lens cannot render");
      return false;
    }
    const mode = typeof SpriteMode !== "undefined" && SpriteMode.Default != null ? SpriteMode.Default : false;
    this.grid = WorldUI.createSpriteGrid(layerGridName(this.type), mode);
    return !!this.grid;
  }

  draw() {
    if (this.drawn || !this.ensureGrid()) return;
    const data = buildGeography();
    if (!data) return;
    const wars = this.type === "features" ? currentWarLabels(data) : [];
    if (this.type === "features") liveWarSignature = warSignature(wars);
    const labels = this.type === "regions" ? data.regions
      : this.type === "features" ? data.features.concat(wars) : [];
    const style = this.type === "regions" ? LABEL_STYLES.regions : LABEL_STYLES.features;
    for (const label of labels) {
      if (label.center < 0) continue;
      this.grid.addText(label.center, label.name, { x: 0, y: 0, z: 12 }, {
        fonts: [],
        fontSize: style.fontSize,
        fill: style.fill,
        stroke: style.stroke,
        faceCamera: true,
      });
    }
    if (this.type === "boundaries") {
      const boundaryTiles = new Set(data.boundary.map(edge => edge.index));
      for (const index of boundaryTiles) {
        this.grid.addText(index, "•", { x: 0, y: 0, z: 4 }, {
          fonts: [],
          fontSize: LABEL_STYLES.boundary.fontSize,
          fill: LABEL_STYLES.boundary.fill,
          stroke: LABEL_STYLES.boundary.stroke,
          faceCamera: true,
        });
      }
    }
    this.drawn = true;
  }

  refresh() {
    if (!this.grid) return;
    if (typeof this.grid.clear === "function") this.grid.clear();
    this.drawn = false;
    if (this.visible) this.draw();
  }

  onAgeMaybeChanged() {
    if (this.visible) this.refresh();
  }
}

const layers = new Map();
for (const [option, type] of Object.entries(LAYER_TYPES)) {
  const layer = new GeographyLensLayer(option);
  layers.set(option, layer);
  try {
    LensManager.registerLensLayer(type, layer);
  } catch (error) {
    reportError(`could not register ${option} lens layer: ${error}`);
  }
}

function setLensOption(option, enabled) {
  const layerType = LAYER_TYPES[option];
  if (!layerType) throw new Error(`Unknown geography layer: ${option}`);
  try {
    const current = LensManager.isLayerEnabled(layerType);
    if (!!current !== !!enabled) LensManager.toggleLayer(layerType, { force: !!enabled, serialize: true });
  } catch (error) {
    reportError(`could not toggle ${option} lens layer: ${error}`);
    throw error;
  }
}

function warSignature(wars) {
  return wars.map(war => `${war.id}:${war.name}:${war.center}`).sort().join("|");
}

function refreshWarLayerIfChanged(playerId) {
  const localPlayerId = typeof GameContext !== "undefined" ? GameContext.localPlayerID : null;
  if (Number.isInteger(playerId) && Number.isInteger(localPlayerId) && playerId !== localPlayerId) return;
  const layer = layers.get("features");
  if (!layer || !layer.visible) return;
  const wars = currentWarLabels(buildGeography());
  const signature = warSignature(wars);
  if (signature !== liveWarSignature) layer.refresh();
}

function registerWarRefreshEvent() {
  if (typeof GameEvents === "undefined") return;
  for (const name of ["PlayerTurnStarted", "PlayerTurnActivated", "TurnBegin"]) {
    const event = GameEvents[name];
    if (event && typeof event.add === "function") {
      event.add(playerId => refreshWarLayerIfChanged(playerId));
      return;
    }
  }
  reportError("turn events are unavailable; active war labels refresh when the geography layer is toggled");
}

registerWarRefreshEvent();

window.AnthroproceniaGeography = {
  getMapData: buildGeography,
  getWarLabels: currentWarLabels,
  rememberWarName,
  warNameForPlayers,
  warRegionName,
  getOption: option => !!LensManager.isLayerEnabled(LAYER_TYPES[option]),
  setOption: setLensOption,
  refresh() {
    geographyCache = null;
    geographyCacheKey = "";
    for (const layer of layers.values()) layer.refresh();
    window.dispatchEvent(new CustomEvent("anthroprocenia-geography-changed"));
  },
};
