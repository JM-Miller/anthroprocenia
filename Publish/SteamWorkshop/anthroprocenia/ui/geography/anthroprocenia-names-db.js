/**
 * Anthroprocenia name database.
 *
 * Grammatical, civ-specific names for improvements, buildings and discoveries on the map view. Everything is data
 * keyed by normalized civ type (CIVILIZATION_ stripped, non-alphanumerics removed), then flavoured by:
 *   - government kind  (despotism / oligarchy / republic / monarchy / theocracy / authoritarian)
 *   - ideology         (DEMOCRACY / COMMUNISM / FASCISM, Modern age)
 *   - religion / pantheon (the owner's founded religion, or the names of its pantheon beliefs)
 *
 * Exposes window.AnthroproceniaNameDB = { data, governmentKind, pantheonTheme, constructibleName }.
 * constructibleName(ctx) returns a finished name such as "The Equiis Clay Pits" or
 * "The First Monument to the Warriors of the City of Rome"; it returns null for input it cannot handle so the
 * caller can fall back to its own generator.
 */
(function () {
  'use strict';

  const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
  function ordinal(n) {
    if (n <= ORDINALS.length) return ORDINALS[n - 1];
    const small = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const cardinal = value => value < 20 ? small[value]
      : value < 100 ? tens[Math.floor(value / 10)] + (value % 10 ? '-' + small[value % 10] : '')
      : value < 1000 ? small[Math.floor(value / 100)] + ' Hundred' + (value % 100 ? ' ' + cardinal(value % 100) : '')
      : cardinal(Math.floor(value / 1000)) + ' Thousand' + (value % 1000 ? ' ' + cardinal(value % 1000) : '');
    const word = cardinal(n);
    const irregular = { One: 'First', Two: 'Second', Three: 'Third', Five: 'Fifth', Eight: 'Eighth', Nine: 'Ninth', Twelve: 'Twelfth' };
    const match = word.match(/(?:^|[\s-])(One|Two|Three|Five|Eight|Nine|Twelve)$/);
    if (match) return word.slice(0, -match[1].length) + irregular[match[1]];
    return /y$/.test(word) ? word.slice(0, -1) + 'ieth' : word + 'th';
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const IRREGULAR_PLURALS = { 'ox': 'oxen' };
  function pluralize(phrase) {
    const words = String(phrase || '').trim().split(/\s+/);
    let w = words.pop() || '';
    const lower = w.toLowerCase();
    if (IRREGULAR_PLURALS[lower]) w = IRREGULAR_PLURALS[lower];
    else if (/(barracks|works|mills)$/i.test(w)) { /* already plural */ }
    else if (/(s|x|z|ch|sh)$/i.test(w)) w = `${w}es`;
    else if (/[^aeiou]y$/i.test(w)) w = `${w.slice(0, -1)}ies`;
    else if (/(wolf|calf|half|knife)$/i.test(w)) w = w.replace(/fe?$/i, 'ves');
    else w = `${w}s`;
    words.push(w);
    return words.join(' ');
  }

  // ---- government / ideology / pantheon classification -------------------------------------------------------------
  function governmentKind(text) {
    const t = String(text || '').toLowerCase();
    if (/theocra/.test(t)) return 'theocracy';
    if (/oligarch|plutocra|aristocra/.test(t)) return 'oligarchy';
    if (/authoritar|fascis|totalit|dictator|communis|socialis/.test(t)) return 'authoritarian';
    if (/republic|democra|revoluci/.test(t)) return 'republic';
    if (/monarch|feudal|imperial|kingdom|royal/.test(t)) return 'monarchy';
    return 'despotism';
  }
  const PANTHEON_THEMES = [
    ['patron', /patron|city/], ['earth', /earth/], ['fertility', /fertil/], ['festival', /festival/], ['healing', /heal/],
    ['harvest', /harvest/], ['forest', /forest/], ['forge', /forge/], ['sea', /\bsea\b/], ['sun', /\bsun\b/], ['war', /\bwar\b/],
    ['wisdom', /wisdom/], ['gods', /monument to the gods/], ['tradition', /oral/], ['waters', /waters/], ['stones', /stone/],
    ['revelry', /revelry/], ['trickster', /trickster/],
  ];
  function pantheonTheme(name) {
    const t = String(name || '').toLowerCase();
    for (const [theme, re] of PANTHEON_THEMES) if (re.test(t)) return theme;
    return '';
  }
  // Generic deity phrases, used when a civ has no named deity for the theme.
  const GENERIC_DEITIES = {
    patron: 'the City Patron Goddess', earth: 'the Earth Goddess', fertility: 'the Fertility Rites', festival: 'the Goddess of Festivals',
    healing: 'the God of Healing', harvest: 'the Goddess of the Harvest', forest: 'the God of the Forest', forge: 'the God of the Forge',
    sea: 'the God of the Sea', sun: 'the God of the Sun', war: 'the God of War', wisdom: 'the God of Wisdom', gods: 'the Gods',
    tradition: 'the Ancestral Tradition', waters: 'the Sacred Waters', stones: 'the Standing Stones', revelry: 'the God of Revelry',
    trickster: 'the Trickster God',
  };
  // Improvement keyword -> pantheon themes it can be dedicated to.
  const IMPROVEMENT_THEMES = [
    [/farm|plantation|orchard|vineyard|field/, ['harvest', 'fertility']], [/pasture|ranch/, ['fertility', 'earth']],
    [/mine|quarry|clay|pit|brick/, ['forge', 'earth', 'stones']], [/wood|lumber|forest|sawmill/, ['forest']],
    [/fish|boat|harbor|whal|port/, ['sea', 'waters']], [/camp|fort|barracks/, ['war']],
  ];

  const GOVERNMENTS = {
    despotism: { adj: ['Great', 'Old', 'Founders\''], honorees: ['Warriors', 'Fallen Warriors', 'Ancestors', 'Founders', 'Hunters', 'Elders'], army: 'Warband' },
    oligarchy: { adj: ['Council', 'Elders\'', 'Patrician'], honorees: ['Elders', 'Founding Families', 'Councillors', 'Magistrates', 'Benefactors'], army: 'Household Guard' },
    republic: { adj: ['Public', 'Civic', 'Common'], honorees: ['Citizens', 'Founders of the Republic', 'Fallen Citizens', 'Magistrates', 'Assembly'], army: 'Citizen Militia' },
    monarchy: { adj: ['Royal', 'Crown', 'Noble'], honorees: ['Kings', 'Royal House', 'Fallen Knights', 'Loyal Subjects', 'Lords'], army: 'Royal Guard' },
    theocracy: { adj: ['Holy', 'Sacred', 'Hallowed'], honorees: ['Faithful', 'Martyrs', 'Holy Ones', 'Prophets', 'Pilgrims'], army: 'Faithful' },
    authoritarian: { adj: ['State', 'National', 'Central'], honorees: ['Fallen Heroes', 'Patriots', 'Leaders of the Nation', 'Loyal Citizens', 'Founders of the State'], army: 'National Guard' },
  };
  const IDEOLOGIES = {
    DEMOCRACY: { adj: ['Free', 'Public', 'Liberty'], honorees: ['Defenders of Liberty', 'Free Citizens', 'Fallen Soldiers', 'Founders of the Constitution'], army: 'Citizen Army' },
    COMMUNISM: { adj: ['People\'s', 'Workers\'', 'Comrades\''], honorees: ['Workers', 'Martyrs of the Revolution', 'Fallen Comrades', 'Peasants and Workers'], army: 'People\'s Army' },
    FASCISM: { adj: ['National', 'Imperial', 'State'], honorees: ['Sons of the Nation', 'Heroes of the State', 'Fallen Legionaries', 'Defenders of the Nation'], army: 'National Legions' },
  };

  // ---- building / improvement classification -----------------------------------------------------------------------
  const BUILDING_CLASSES = [
    ['monument', /monument|statue|memorial|obelisk|stele|totem|column|colossus/],
    ['sacred', /temple|shrine|altar|cathedral|church|mosque|pagoda|synagogue|stupa|ziggurat|monastery|oracle|pantheon|sanctum|mandir|wat\b|sacred|holy/],
    ['military', /barracks|fort|fortress|stable|garrison|armory|arsenal|academy of war|citadel|stockade|walls?/],
    ['learning', /librar|academy|universit|school|observator|laborator|gymnasium|lyceum|scriptorium|archive|madrasa/],
    ['commerce', /market|bazaar|warehouse|exchange|bank|mint|harbor|dock|shipyard|port|forum|agora|tavern|inn|caravanserai/],
    ['civic', /granary|palace|court|hall|senate|assembly|bath|aqueduct|amphitheat|theat|arena|stadium|hospital|garden|kiln|brickyard|blacksmith|foundry|factory|workshop/],
  ];
  const DISCOVERY_RE = /discover|ruin|shipwreck|cache|village|tomb|relic|artifact|cave|wreck|battlefield|megalith/;
  function buildingClass(base) {
    const t = String(base || '').toLowerCase();
    for (const [cls, re] of BUILDING_CLASSES) if (re.test(t)) return cls;
    return 'general';
  }

  // ---- per-civ database --------------------------------------------------------------------------------------------
  // locals: native place-modifiers for improvements; river/coast: native qualifiers; city: how a settlement is styled;
  // army: the civ's own word for its soldiers; deities: named gods per pantheon theme (others use GENERIC_DEITIES).
  const CIVS = {
    ROME: { locals: ['Equiis', 'Aventinus', 'Caelius', 'Esquilinus', 'Viminalis', 'Palatinus'], river: 'Fluvialis', coast: 'Maritima', city: 'the City of', army: 'Legions',
      deities: { sea: 'Neptune', sun: 'Sol Invictus', war: 'Mars', forge: 'Vulcan', harvest: 'Ceres', healing: 'Aesculapius', wisdom: 'Minerva', forest: 'Silvanus', earth: 'Tellus', fertility: 'Bona Dea', festival: 'Flora', revelry: 'Bacchus', trickster: 'Mercury', patron: 'Juno', gods: 'the Capitoline Gods' } },
    GREECE: { locals: ['Eleusinian', 'Attic', 'Thessalian', 'Arcadian', 'Ionian', 'Delphic'], river: 'Potamian', coast: 'Paralian', city: 'the Polis of', army: 'Hoplites',
      deities: { sea: 'Poseidon', sun: 'Helios', war: 'Ares', forge: 'Hephaestus', harvest: 'Demeter', healing: 'Asclepius', wisdom: 'Athena', forest: 'Artemis', earth: 'Gaia', fertility: 'Aphrodite', festival: 'Hera', revelry: 'Dionysus', trickster: 'Hermes', patron: 'Athena Polias', gods: 'the Olympians' } },
    EGYPT: { locals: ['Ankh-Tawy', 'Sekhet', 'Hapi', 'Djeser', 'Neferu', 'Kemet'], river: 'Iteru', coast: 'Wadj-wer', city: 'the City of', army: 'Chariot Corps',
      deities: { sea: 'Sobek', sun: 'Ra', war: 'Sekhmet', forge: 'Ptah', harvest: 'Osiris', healing: 'Imhotep', wisdom: 'Thoth', forest: 'Min', earth: 'Geb', fertility: 'Isis', festival: 'Hathor', revelry: 'Bes', trickster: 'Set', patron: 'Bastet', gods: 'the Ennead' } },
    PERSIA: { locals: ['Pasargadian', 'Parsan', 'Susian', 'Ecbatanan', 'Zagrosian', 'Bactrian'], river: 'Rudkhane', coast: 'Sahili', city: 'the Satrapy of', army: 'Immortals',
      deities: { sea: 'Apam Napat', sun: 'Mithra', war: 'Verethragna', forge: 'Atar', harvest: 'Spenta Armaiti', healing: 'Haurvatat', wisdom: 'Ahura Mazda', waters: 'Anahita', patron: 'Anahita' } },
    HAN: { locals: ['Guanzhong', 'Zhongyuan', 'Jiangnan', 'Hexi', 'Bashu', 'Liaodong'], river: 'He', coast: 'Hai', city: 'the Commandery of', army: 'Armies',
      deities: { sea: 'the Dragon King', sun: 'Taiyang', war: 'Guan Di', earth: 'Houtu', harvest: 'Houji', wisdom: 'Confucius', gods: 'Heaven' } },
    MAYA: { locals: ['Kaan', 'Chan', 'Yax', 'Sak', 'Kab', 'Ek\''], river: 'Ha\'', coast: 'Kanal', city: 'the Kingdom of', army: 'Jaguar Warriors',
      deities: { sun: 'K\'inich Ajaw', harvest: 'Yum Kaax', war: 'Kawiil', earth: 'Itzamna', sea: 'Chaac', fertility: 'Ixchel' } },
    INCA: { locals: ['Chinchay', 'Anti', 'Kunti', 'Qulla', 'Wari', 'Sayri'], river: 'Mayu', coast: 'Mama Qucha', city: 'the Llaqta of', army: 'Warriors of the Sapa Inca',
      deities: { sun: 'Inti', earth: 'Pachamama', sea: 'Mama Qucha', war: 'Illapa', harvest: 'Mama Sara', gods: 'the Apus' } },
    MONGOLIA: { locals: ['Khentii', 'Orkhon', 'Altai', 'Onon', 'Tuul', 'Khangai'], river: 'Gol', coast: 'Dalai', city: 'the Ordu of', army: 'Keshig',
      deities: { sun: 'Tengri', earth: 'Etugen', war: 'Sulde', gods: 'Eternal Tengri' } },
    ABBASID: { locals: ['Mesopotamian', 'Tigrine', 'Khorasani', 'Basran', 'Kufan', 'Samarran'], river: 'Nahri', coast: 'Sahili', city: 'the Madinat of', army: 'Mamluks' },
    AKSUM: { locals: ['Tigray', 'Adulis', 'Yeha', 'Semien', 'Hawelti', 'Matara'], river: 'Wenz', coast: 'Bahri', city: 'the City of', army: 'Aksumite Host',
      deities: { sun: 'Astar', sea: 'Mahrem', war: 'Mahrem', earth: 'Beher' } },
    AMERICA: { locals: ['Frontier', 'Homestead', 'Prairie', 'Colonial', 'Heartland', 'Pioneer'], river: 'Riverside', coast: 'Seaboard', city: 'the City of', army: 'Minutemen' },
    ASSYRIA: { locals: ['Nineveh', 'Ashur', 'Kalhu', 'Tarbisu', 'Arbela', 'Dur-Sharrukin'], river: 'Idiqlat', coast: 'Tamtu', city: 'the City of', army: 'Assyrian Host',
      deities: { sun: 'Shamash', war: 'Ashur', wisdom: 'Nabu', sea: 'Ea', fertility: 'Ishtar', forge: 'Ninurta' } },
    BABYLON: { locals: ['Akkadian', 'Sumerian', 'Chaldean', 'Borsippan', 'Kishite', 'Nippurian'], river: 'Purattu', coast: 'Tamtu', city: 'the City of', army: 'Babylonian Host',
      deities: { sun: 'Shamash', war: 'Marduk', wisdom: 'Nabu', sea: 'Ea', fertility: 'Ishtar', forge: 'Ninurta', earth: 'Ninhursag' } },
    BUGANDA: { locals: ['Mengo', 'Kasubi', 'Busiro', 'Kyadondo', 'Mawokota', 'Buddu'], river: 'Mugga', coast: 'Nnyanja', city: 'the Ssaza of', army: 'Kabaka\'s Warriors' },
    BULGARIA: { locals: ['Pliska', 'Preslav', 'Balkan', 'Danubian', 'Rhodope', 'Thracian'], river: 'Rechna', coast: 'Morska', city: 'the City of', army: 'Bolyars' },
    CARTHAGE: { locals: ['Byrsan', 'Punic', 'Libyan', 'Utican', 'Hadrumetan', 'Megaran'], river: 'Nahar', coast: 'Yam', city: 'the City of', army: 'Sacred Band',
      deities: { sea: 'Melqart', sun: 'Baal Hammon', war: 'Baal Hammon', fertility: 'Tanit', patron: 'Tanit', healing: 'Eshmun' } },
    CHOLA: { locals: ['Kaveri', 'Thanjavur', 'Uraiyur', 'Pazhaiyarai', 'Poompuhar', 'Gangaikonda'], river: 'Aaru', coast: 'Kadal', city: 'the Nadu of', army: 'Chola Navy',
      deities: { sea: 'Varuna', sun: 'Surya', war: 'Murugan', wisdom: 'Saraswati', harvest: 'Annapurna', fertility: 'Parvati' } },
    DAIVIET: { locals: ['Thang Long', 'Hoa Lu', 'Red River', 'Cuu Chan', 'Phong Chau', 'Hoan'], river: 'Song', coast: 'Bien', city: 'the Province of', army: 'Dai Viet Host' },
    ENGLAND: { locals: ['Mercian', 'Wessex', 'Northumbrian', 'Kentish', 'Anglian', 'Saxon'], river: 'Rivering', coast: 'Shoreward', city: 'the Borough of', army: 'Longbowmen' },
    FRANCE: { locals: ['Gallic', 'Ile-de-France', 'Burgundian', 'Norman', 'Aquitainian', 'Provencal'], river: 'Riveraine', coast: 'Cotiere', city: 'the Commune of', army: 'Grande Armee' },
    GAUL: { locals: ['Arvernian', 'Aeduan', 'Belgic', 'Allobrogian', 'Sequanan', 'Helvetic'], river: 'Abona', coast: 'Mori', city: 'the Oppidum of', army: 'Gaulish Warband',
      deities: { sun: 'Belenus', war: 'Teutates', forge: 'Gobannus', healing: 'Grannus', earth: 'Cernunnos', sea: 'Manannan', forest: 'Cernunnos' } },
    GORYEO: { locals: ['Gaegyeong', 'Hamgyong', 'Jeolla', 'Pyongan', 'Gyeongsang', 'Hwanghae'], river: 'Gang', coast: 'Hae', city: 'the Prefecture of', army: 'Goryeo Host' },
    GREATBRITAIN: { locals: ['Albion', 'Imperial', 'Wessex', 'Mercian', 'Hanoverian', 'Colonial'], river: 'Riverine', coast: 'Maritime', city: 'the Borough of', army: 'Redcoats' },
    HAWAII: { locals: ['Kona', 'Kohala', 'Hamakua', 'Puna', 'Kau', 'Ka\'u'], river: 'Wai', coast: 'Kai', city: 'the Moku of', army: 'Ali\'i Warriors',
      deities: { sea: 'Kanaloa', sun: 'Ku', war: 'Ku', earth: 'Papa', forest: 'Kane', harvest: 'Lono', forge: 'Pele', fertility: 'Haumea' } },
    HEIAN: { locals: ['Kyoto', 'Yamashiro', 'Yamato', 'Kinai', 'Omi', 'Settsu'], river: 'Kawa', coast: 'Umi', city: 'the Province of', army: 'Court Guard',
      deities: { sun: 'Amaterasu', sea: 'Ryujin', war: 'Hachiman', harvest: 'Inari', wisdom: 'Tenjin' } },
    ICELAND: { locals: ['Thingvellir', 'Reykjanes', 'Eyjafjordur', 'Skagafjordur', 'Snaefell', 'Borgarfjordur'], river: 'Ar', coast: 'Strond', city: 'the Hreppr of', army: 'Hird',
      deities: { sea: 'Njord', sun: 'Sol', war: 'Odin', forge: 'Wayland', harvest: 'Freyr', healing: 'Eir', wisdom: 'Odin', earth: 'Jord', fertility: 'Freyja', trickster: 'Loki' } },
    JOSEON: { locals: ['Hanyang', 'Gyeonggi', 'Chungcheong', 'Jeolla', 'Gangwon', 'Hamgyeong'], river: 'Gang', coast: 'Hae', city: 'the Prefecture of', army: 'Joseon Guard' },
    KHMER: { locals: ['Angkor', 'Tonle', 'Koh Ker', 'Banteay', 'Preah', 'Baray'], river: 'Tonle', coast: 'Samut', city: 'the Nagara of', army: 'Royal Army',
      deities: { sun: 'Surya', sea: 'Varuna', war: 'Vishnu', wisdom: 'Brahma', earth: 'Preah Thorni', harvest: 'Lakshmi' } },
    MAJAPAHIT: { locals: ['Trowulan', 'Brantas', 'Kediri', 'Singhasari', 'Daha', 'Tumapel'], river: 'Kali', coast: 'Segara', city: 'the Negara of', army: 'Majapahit Fleet' },
    MAURYA: { locals: ['Magadhan', 'Pataliputran', 'Avantian', 'Kalingan', 'Gandharan', 'Taxilan'], river: 'Nadi', coast: 'Samudra', city: 'the Nagara of', army: 'Four-Fold Army',
      deities: { sun: 'Surya', sea: 'Varuna', war: 'Indra', wisdom: 'Saraswati', harvest: 'Annapurna', earth: 'Prithvi', fertility: 'Parvati' } },
    MEIJI: { locals: ['Edo', 'Kanto', 'Satsuma', 'Choshu', 'Tosa', 'Hizen'], river: 'Kawa', coast: 'Umi', city: 'the Prefecture of', army: 'Imperial Army' },
    MEXICO: { locals: ['Anahuac', 'Oaxacan', 'Chihuahuan', 'Yucatecan', 'Jalisciense', 'Veracruzano'], river: 'Rio', coast: 'Costa', city: 'the Municipio of', army: 'Ejercito' },
    MING: { locals: ['Jiangnan', 'Yingtian', 'Huguang', 'Shandong', 'Fujian', 'Yunnan'], river: 'He', coast: 'Hai', city: 'the Prefecture of', army: 'Ming Banners' },
    MISSISSIPPIAN: { locals: ['Cahokian', 'Etowahan', 'Moundville', 'Spiroan', 'Angelan', 'Kincaid'], river: 'Sipi', coast: 'Bayou', city: 'the Mound-City of', army: 'Mound Warriors',
      deities: { sun: 'the Great Sun', earth: 'Corn Mother', war: 'the Thunderers', waters: 'the Great Water Serpent' } },
    NEPAL: { locals: ['Kathmandu', 'Lichhavi', 'Gorkha', 'Mustang', 'Patan', 'Bhaktapur'], river: 'Khola', coast: 'Sagar', city: 'the Nagar of', army: 'Gorkhas' },
    NORMAN: { locals: ['Cotentin', 'Caen', 'Rouen', 'Bessin', 'Cauchois', 'Avranchin'], river: 'Riviere', coast: 'Cotiere', city: 'the Duchy Town of', army: 'Norman Knights' },
    OTTOMANS: { locals: ['Rumelian', 'Anatolian', 'Bursan', 'Edirnan', 'Konyan', 'Kayi'], river: 'Nehir', coast: 'Sahil', city: 'the Sanjak of', army: 'Janissaries' },
    PRUSSIA: { locals: ['Brandenburg', 'Pomeranian', 'Silesian', 'Junker', 'Masurian', 'Saxon'], river: 'Flussige', coast: 'Kustige', city: 'the Stadt of', army: 'Grenadiers' },
    QAJAR: { locals: ['Tehrani', 'Mazandarani', 'Azeri', 'Gilani', 'Isfahani', 'Khorasani'], river: 'Rud', coast: 'Sahel', city: 'the Shahr of', army: 'Qizilbash' },
    QING: { locals: ['Manchurian', 'Zhili', 'Jiangsu', 'Shengjing', 'Guangdong', 'Sichuan'], river: 'He', coast: 'Hai', city: 'the Prefecture of', army: 'Eight Banners' },
    RUSSIA: { locals: ['Muscovite', 'Novgorodian', 'Kievan', 'Vladimirian', 'Pskovian', 'Ryazan'], river: 'Rechnaya', coast: 'Primorskaya', city: 'the Gorod of', army: 'Streltsy' },
    SENGOKU: { locals: ['Owari', 'Mikawa', 'Kai', 'Echigo', 'Mino', 'Suruga'], river: 'Kawa', coast: 'Umi', city: 'the Domain of', army: 'Ashigaru' },
    SHAWNEE: { locals: ['Scioto', 'Ohio', 'Miami', 'Cumberland', 'Kispoko', 'Chalahgawtha'], river: 'Spaylaywitheepi', coast: 'Lakeshore', city: 'the Town of', army: 'Warriors of the Longhouse',
      deities: { sun: 'the Great Spirit', earth: 'Our Grandmother', war: 'the Thunderbeings', harvest: 'the Three Sisters', waters: 'the Underwater Panther' } },
    SIAM: { locals: ['Ayutthaya', 'Sukhothai', 'Chao Phraya', 'Lanna', 'Phetchaburi', 'Nakhon'], river: 'Mae Nam', coast: 'Thale', city: 'the Mueang of', army: 'Siamese Elephants' },
    SILLA: { locals: ['Gyeongju', 'Saro', 'Seorabeol', 'Geumseong', 'Hwarang', 'Gaya'], river: 'Gang', coast: 'Hae', city: 'the Province of', army: 'Hwarang' },
    SONGHAI: { locals: ['Gao', 'Timbuktu', 'Djenne', 'Niger', 'Tondibi', 'Kukiya'], river: 'Issa', coast: 'Bahar', city: 'the City of', army: 'Askia Guard' },
    SPAIN: { locals: ['Castilian', 'Aragonese', 'Andalusian', 'Galician', 'Leonese', 'Navarrese'], river: 'Ribera', coast: 'Costera', city: 'the Villa of', army: 'Tercios' },
    TONGA: { locals: ['Tongatapu', 'Vava\'u', 'Ha\'apai', 'Mu\'a', 'Lapaha', 'Niuas'], river: 'Vai', coast: 'Tahi', city: 'the Motu of', army: 'Tu\'i Warriors',
      deities: { sea: 'Tangaloa', sun: 'Hikule\'o', war: 'Maui', earth: 'Papa' } },
  };
  CIVS.FRENCHEMPIRE = CIVS.FRENCH = CIVS.FRANCE;
  CIVS.PIRATEREPUBLIC = { locals: ['Tortuga', 'Nassau', 'Port Royal', 'Barbary', 'Havana', 'Bahama'], river: 'Estuary', coast: 'Windward', city: 'the Haven of', army: 'Buccaneers',
    deities: { sea: 'Davy Jones', trickster: 'Calypso' } };

  // ---- name composition --------------------------------------------------------------------------------------------
  function pick(list, seed) { return list && list.length ? list[seed % list.length] : ''; }

  // The flavour set for an owner: ideology (Modern) beats government kind.
  function flavourFor(ctx) {
    const gov = GOVERNMENTS[governmentKind(ctx.government)] || GOVERNMENTS.despotism;
    const ideo = IDEOLOGIES[String(ctx.ideology || '').toUpperCase()];
    return ideo || gov;
  }
  function deityFor(ctx, civ, seed, wantedThemes) {
    const names = String(ctx.pantheons || '').split('|').filter(Boolean);
    const themes = names.map(pantheonTheme).filter(Boolean);
    let theme = '';
    if (wantedThemes) theme = themes.find(t => wantedThemes.includes(t)) || '';
    else if (themes.length) theme = themes[seed % themes.length];
    if (wantedThemes && !theme) return '';
    if (!theme) return '';
    return (civ && civ.deities && civ.deities[theme]) || GENERIC_DEITIES[theme] || '';
  }
  function cityPhrase(civ, settlement) {
    if (!settlement) return '';
    return `${civ ? civ.city : 'the City of'} ${settlement}`;
  }
  function firstFree(build, used, startOrdinal, maxOrdinal) {
    for (let ord = startOrdinal; ord <= maxOrdinal; ord++) {
      const name = build(ord).replace(/\s{2,}/g, ' ').trim();
      if (!used || !used.has(name)) { if (used) used.add(name); return name; }
    }
    return null;
  }

  function constructibleName(ctx) {
    if (!ctx || !ctx.base) return null;
    const civKey = String(ctx.civKey || '');
    const civ = CIVS[civKey] || null;
    const base = String(ctx.base).trim();
    const used = ctx.used || null;
    const seed = hash(`${ctx.index}|${base}`);
    const flavour = flavourFor(ctx);
    const settlement = String(ctx.settlement || '').trim();
    const place = cityPhrase(civ, settlement);

    if (ctx.isImprovement && !DISCOVERY_RE.test(base.toLowerCase())) {
      const plural = pluralize(base);
      const locals = civ && civ.locals.length ? civ.locals.slice() : (settlement ? [settlement] : ['']);
      const waterWord = ctx.water && civ ? civ[ctx.water] : '';
      if (waterWord) locals.unshift(waterWord);
      const lowerBase = base.toLowerCase();
      const themes = (IMPROVEMENT_THEMES.find(([re]) => re.test(lowerBase)) || [null, null])[1];
      const deity = themes ? deityFor(ctx, civ, seed, themes) : '';
      const style = seed % 3;   // 0 plain, 1 governmental adjective, 2 dedicated to a deity (when the owner has one)
      const adj = pick(flavour.adj, seed >>> 3);
      // Try every local modifier first, then repeat with ordinals ("The Second Equiis Clay Pits") until the name is free.
      for (let round = 0; round < 12; round++) {
        for (let k = 0; k < locals.length; k++) {
          const local = locals[(seed + k) % locals.length];
          let name;
          if (round === 0 && style === 2 && deity) name = `The ${local} ${plural} of ${deity}`;
          else if (round === 0 && style === 1) name = `The ${adj} ${local} ${plural}`;
          else name = `The ${local} ${plural}`;
          if (round > 0) name = name.replace(/^The /, `The ${ordinal(round + 1)} `);
          name = name.replace(/\s{2,}/g, ' ');
          if (!used || !used.has(name)) { if (used) used.add(name); return name; }
        }
      }
      return null;
    }

    if (ctx.isImprovement) {   // discoveries: singular, named for what was found and where
      const local = pick(civ && civ.locals, seed) || settlement;
      return firstFree(ord => `The ${ord > 1 ? ordinal(ord) + ' ' : ''}${local} ${base}`, used, 1, 12);
    }

    const cls = buildingClass(base);
    const noun = base;
    switch (cls) {
      case 'monument': {
        const honorees = flavour.honorees;
        return firstFree(ord => `The ${ordinal(ord)} ${noun} to the ${honorees[(ord - 1) % honorees.length]}${place ? ` of ${place}` : ''}`, used, 1, 30);
      }
      case 'sacred': {
        const divine = (ctx.religion && String(ctx.religion).trim()) || deityFor(ctx, civ, seed, null) || 'the Gods';
        return firstFree(ord => `The ${ordinal(ord)} ${noun} of ${divine}${settlement ? ` in ${settlement}` : ''}`, used, 1, 30);
      }
      case 'military': {
        const army = (civ && civ.army) || flavour.army;
        return firstFree(ord => `The ${ordinal(ord)} ${noun} of the ${army}${place ? ` of ${place}` : ''}`, used, 1, 30);
      }
      default: {
        const adj = pick(flavour.adj, seed);
        return firstFree(ord => `The ${ord > 1 ? ordinal(ord) + ' ' : ''}${adj} ${noun}${place ? ` of ${place}` : ''}`, used, 1, 30);
      }
    }
  }

  window.AnthroproceniaNameDB = {
    version: 1,
    data: { civs: CIVS, governments: GOVERNMENTS, ideologies: IDEOLOGIES, pantheonThemes: GENERIC_DEITIES },
    governmentKind, pantheonTheme, buildingClass, pluralize, ordinal, constructibleName,
  };
})();
