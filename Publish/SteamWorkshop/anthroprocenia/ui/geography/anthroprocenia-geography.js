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
];
function earthContinentName(name) {
  const known = ["Africa", "Antarctica", "Asia", "Australia", "Europe", "North America", "South America", "Oceania", "Greenland"];
  const value = String(name || "").trim().replace(/^Antartica$/i, "Antarctica");
  return known.find(entry => entry.toLowerCase() === value.toLowerCase()) || "";
}
function stockEarthRegionLookup(mapName, width, height) {
  if (String(mapName).toUpperCase() !== "LOC_MAP_EARTH_NAME" || width !== 106 || height !== 66) return null;
  return plot => {
    let best = null, bestDistance = 25;
    for (const [x, y, name] of STOCK_EARTH_LANDMARKS) {
      const dx = Math.min(Math.abs(plot.x - x), width - Math.abs(plot.x - x)), dy = plot.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { bestDistance = distance; best = name; }
    }
    return best || "";
  };
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
    reportError("Earth map context is invalid or not ready; using generated region names");
    return null;
  }
  const matchesMap = expected === "regional"
    ? ["MassiveColonization", "MassiveOldWorld", "MassiveIndoPacific"].includes(context.mapName)
    : context.mapName === expected;
  const expectedSource = expected === "regional" ? "GiantEarth" : expected;
  if (!matchesMap || context.sourceMapName !== expectedSource) {
    reportError("Earth map context does not match the selected map; using generated region names");
    return null;
  }
  const fields = ["sourceWidth", "sourceHeight", "sourceStartX", "sourceEndX", "sourceStartY",
    "sourceEndY", "liveWidth", "liveHeight", "livePlayableStartX", "livePlayableEndX"];
  if (fields.some(field => !Number.isInteger(context[field])) || context.liveWidth !== width ||
      context.liveHeight !== height || context.sourceWidth <= 0 || context.sourceHeight <= 0 ||
      context.sourceStartX < 0 || context.sourceStartX >= context.sourceWidth ||
      context.sourceEndX < 0 || context.sourceEndX >= context.sourceWidth ||
      context.sourceStartY < 0 || context.sourceEndY >= context.sourceHeight ||
      context.sourceEndY - context.sourceStartY + 1 !== height ||
      (context.sourceEndX - context.sourceStartX + context.sourceWidth) % context.sourceWidth + 1 !== width ||
      context.livePlayableStartX < 0 || context.livePlayableEndX >= width ||
      context.livePlayableStartX > context.livePlayableEndX) {
    reportError("Earth map context has invalid dimensions or bounds; using generated region names");
    return null;
  }
  const rows = apiValue("Earth region metadata lookup", () => Array.from(GameInfo.RegionPosition || []), [])
    .filter(row => row.MapName === context.sourceMapName && EARTH_REGION_NAMES[row.Region] &&
      [row.X, row.Y, row.Width, row.Height].every(Number.isInteger) && row.Width > 0 && row.Height > 0);
  if (!rows.length) {
    reportError("Earth region metadata is unavailable; using generated region names");
    return null;
  }
  return plot => {
    if (plot.x < context.livePlayableStartX || plot.x > context.livePlayableEndX) return "";
    const x = (context.sourceStartX + plot.x) % context.sourceWidth, y = context.sourceStartY + plot.y;
    let best = null;
    for (const row of rows) {
      if (x >= row.X && x < row.X + row.Width && y >= row.Y && y < row.Y + row.Height &&
          (!best || row.Width * row.Height < best.Width * best.Height)) best = row;
    }
    return best ? EARTH_REGION_NAMES[best.Region] : "";
  };
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

function rememberWarName(key, regionName) {
  const generated = `War of ${regionName}`;
  const migrated = rememberName(`name3:${key}`, "");
  const stored = rememberName(`name4:${key}`, "") || migrated || rememberName(key, generated);
  if (/\d/.test(stored) && !/\d/.test(regionName)) {
    return rememberName(`${migrated ? "name4" : "name3"}:${key}`, generated);
  }
  const corrected = normalizeGeographicQualifiers(stored);
  if (corrected !== stored) return rememberName(`name4:${key}`, corrected);
  return stored;
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

function collectComponents(records, predicate, locations) {
  const candidates = new Set();
  for (const [index, record] of records) if (predicate(record)) candidates.add(index);
  const components = [];
  while (candidates.size) {
    const first = candidates.values().next().value;
    const queue = [first], tiles = [];
    candidates.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], plot = locations.get(index);
      tiles.push(index);
      for (const neighbor of neighborsOf(plot)) {
        if (!candidates.has(neighbor.index)) continue;
        candidates.delete(neighbor.index);
        queue.push(neighbor.index);
      }
    }
    components.push(tiles);
  }
  return components;
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
  entries = entries.flatMap(entry => splitConnectedBy(entry.tiles, locations, () => null)
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
  const earthRegionAt = namedEarth
    ? earthRegionLookup(mapName, width, height) || stockEarthRegionLookup(mapName, width, height) : null;

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

  const landComponents = collectComponents(records, record => !record.water && !record.lake, locations);
  const oceanComponents = collectComponents(records,
    record => record.water && record.deepWater && !record.lake && !record.river, locations);
  const seaComponents = collectComponents(records,
    record => record.water && !record.deepWater && !record.lake && !record.river, locations);
  const lakeComponents = collectComponents(records, record => record.lake, locations);
  const riverWaterComponents = collectComponents(records, record => record.water && record.river && !record.lake, locations);
  const landTileCount = landComponents.reduce((total, tiles) => total + tiles.length, 0);
  const islandThreshold = Math.max(8, Math.floor(landTileCount * 0.015));
  const islandComponents = landComponents.filter(tiles => tiles.length <= islandThreshold)
    .map(tiles => ({ tiles, key: tiles.slice().sort((a, b) => a - b).join(",") }))
    .sort((a, b) => deterministicIndex(`${seed}|island-style|${a.key}`, 0x7fffffff)
      - deterministicIndex(`${seed}|island-style|${b.key}`, 0x7fffffff) || a.key.localeCompare(b.key));
  const islandTiles = new Set(islandComponents.flatMap(island => island.tiles));
  const regions = [], features = [], regionForTile = new Map();
  const islandByTile = new Map(), islandParents = islandComponents.map((_, i) => i);
  for (let i = 0; i < islandComponents.length; i++) for (const tile of islandComponents[i].tiles) islandByTile.set(tile, i);
  const islandRoot = i => {
    while (islandParents[i] !== i) { islandParents[i] = islandParents[islandParents[i]]; i = islandParents[i]; }
    return i;
  };
  for (const [tile, i] of islandByTile) {
    for (const water of neighborsOf(locations.get(tile))) {
      if (!records.get(water.index)?.water) continue;
      for (const neighbor of neighborsOf(locations.get(water.index))) {
        const j = islandByTile.get(neighbor.index);
        if (j != null && islandRoot(i) !== islandRoot(j)) islandParents[islandRoot(j)] = islandRoot(i);
      }
    }
  }
  const islandGroups = new Map();
  for (let i = 0; i < islandComponents.length; i++) {
    const root = islandRoot(i);
    if (!islandGroups.has(root)) islandGroups.set(root, []);
    islandGroups.get(root).push(islandComponents[i]);
  }
  for (const group of islandGroups.values()) {
    if (group.length < 2) continue;
    const tiles = group.flatMap(island => island.tiles).sort((a, b) => a - b);
    const stem = NAME_PARTS.islands[deterministicIndex(`${seed}|archipelago|${tiles[0]}`, NAME_PARTS.islands.length)];
    features.push({ id: `archipelago:${tiles[0]}`, type: "archipelago",
      name: geographicName(stem, "archipelago", tiles[0]), center: centerIndex(tiles, locations), tiles });
  }
  const usedRegionNames = new Set(), nativeRegionNames = new Set(), regionNameCursors = new Map(), landSeeds = new Map(), civByOwner = new Map();
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
      if (!water && nativeEarthRivers) {
        const earthName = (earthRegionAt && earthRegionAt(locations.get(center))) ||
          earthContinentName(records.get(center)?.continent?.name);
        if (earthName) {
          region.name = uniqueGeographicName(earthName, nativeRegionNames, value => value.toLowerCase());
          nativeRegionNames.add(region.name.toLowerCase());
          region.nativeEarthName = true;
        }
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
    if (tiles.length <= islandThreshold) landEntries.push({ tiles, water: false, island: true });
    else for (const part of splitConnectedBy(tiles, locations, continentOf)) landEntries.push({ tiles: part, water: false, continent: continentOf(part[0]) });
    const sorted = tiles.slice().sort((a, b) => a - b);
    const key = sorted.join(",");
    if (tiles.length <= islandThreshold) {
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
  const finalEntries = [...fitRegionCount(landEntries, locations, landTarget), ...waterEntries];
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

  const mountainComponents = collectComponents(records, record => record.mountain, locations);
  for (const tiles of mountainComponents) {
    if (tiles.length < 2) continue;
    const sorted = tiles.slice().sort((a, b) => a - b);
    features.push({
      id: `mountains:${sorted[0]}`,
      type: "mountains",
      name: geographicName(NAME_PARTS.mountains[deterministicIndex(`${seed}|mountains|${sorted[0]}`, NAME_PARTS.mountains.length)], "mountains", sorted[0]),
      center: centerIndex(sorted, locations),
      tiles: sorted,
    });
  }

  const riverComponents = collectComponents(records, record => record.river, locations);
  const earthRivers = new Map();
  for (const component of riverComponents) {
    // A connected river network is split by the game's own river names, so each named river gets its own label.
    for (const tiles of splitConnectedBy(component, locations, index => records.get(index)?.riverName || "")) {
      const sorted = tiles.slice().sort((a, b) => a - b);
      const realName = records.get(sorted[0])?.riverName;
      if (nativeEarthRivers && realName) {
        const key = realName.toLowerCase();
        if (!earthRivers.has(key)) earthRivers.set(key, { name: realName, tiles: [] });
        earthRivers.get(key).tiles.push(...sorted);
        continue;
      }
      features.push({
        id: `rivers:${sorted[0]}`,
        type: "river",
        name: realName && !/\s+river$/i.test(realName) ? realName
          : geographicName(realName || NAME_PARTS.rivers[deterministicIndex(`${seed}|rivers|${sorted[0]}`, NAME_PARTS.rivers.length)], "river", sorted[0]),
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
    if (feature.type !== "island" && feature.type !== "archipelago") continue;
    const region = nativeRegions.get(regionForTile.get(feature.center));
    if (region) { feature.name = region.name; feature.nativeEarthName = true; }
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
  for (const region of regions) boundary.push(...region.boundary.map(edge => ({ ...edge, regionId: region.id })));
  geographyCache = { width, height, regions, features, boundary, regionForTile, locations };
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
      let frontier = -1;
      for (const [index, owner] of owners) {
        if (owner !== attacker) continue;
        const plot = data.locations.get(index);
        if (neighborsOf(plot).some(neighbor => owners.get(neighbor.index) === defender)) { frontier = index; break; }
      }
      const regionId = data.regionForTile.get(frontier);
      const region = data.regions.find(entry => entry.id === regionId);
      if (region) wars.push({ id: `war:${attacker}:${defender}`, type: "war", name: rememberWarName(`war:${attacker}:${defender}:${region.id}`, region.name), center: frontier, tiles: [] });
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
  getOption: option => !!LensManager.isLayerEnabled(LAYER_TYPES[option]),
  setOption: setLensOption,
  refresh() {
    geographyCache = null;
    geographyCacheKey = "";
    for (const layer of layers.values()) layer.refresh();
    window.dispatchEvent(new CustomEvent("anthroprocenia-geography-changed"));
  },
};
