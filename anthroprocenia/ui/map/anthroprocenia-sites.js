// Historical-site names for the constructible icons on the map. Every in-game and DLC civilization has its own
// family/clan/house names, naming pattern and a few native words; the site type (farm, mine, shrine...) supplies the
// noun, and a resource on the tile ("Wheat Farm") is folded in where it fits. Names are fully deterministic: the same
// civilization, tile, type and icon always produce the same name, and the icons on one tile never share a name.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;   // avalanche: the low bits matter when picking from short lists
  return h >>> 0;
}
import { cultureOf, generatedSurname, generatedPlace, siteModifier } from './anthroprocenia-namegen.js';

// Naming patterns: {f} is the family, {s} the site.
const PATTERNS = {
  the: ['The {f} {s}', 'The {f} {s}', 'The {s} of the {f}'],
  of: ['The {s} of {f}', '{f}\'s {s}', 'The {f} {s}'],
  clan: ['The {f} Clan {s}', 'The {f} Family {s}', '{f} Family {s}'],
  house: ['The {f} {s}', 'The {s} of House {f}', 'House {f} {s}'],
  ayllu: ['The {f} Ayllu {s}', 'The {f} {s}'],
  pirate: ['Captain {f}\'s {s}', '{f}\'s {s}', 'Old {f}\'s {s}'],
};

// Site nouns by category. {res} is the tile's resource (dropped when there is none) and {base} the game's own name.
const NOUNS = {
  farm: ['{res} Farm', '{res} Field', '{res} Farmstead', '{res} Grange', '{res} Tillage', '{res} Holding', '{base}'],
  plantation: ['{res} Plantation', '{res} Estate', '{res} Grove', '{res} Orchard', '{res} Holdings'],
  pasture: ['{res} Pasture', '{res} Meadow', '{res} Fold', '{res} Ranch', 'Herdsman\'s {res} Meadow', '{res} Grazing Commons'],
  camp: ['{res} Hunting Camp', '{res} Trapping Lodge', 'Hunters\' {res} Camp', '{res} Camp', 'Huntsman\'s Lodge'],
  mine: ['{res} Mine', '{res} Diggings', '{res} Pit', '{res} Shaft', 'Miners\' {res} Gallery', '{res} Works'],
  quarry: ['{res} Quarry', 'Stonecutters\' Yard', '{res} Cut', 'Stoneworks', 'Masons\' Pit'],
  wood: ['Timber Camp', 'Woodcutters\' Lodge', 'Logging Yard', 'Forest Holding', 'Sawyers\' Yard'],
  fishing: ['{res} Fishery', 'Fishing Wharf', 'Fishermen\'s Landing', '{res} Weir', 'Net-Menders\' Quay'],
  fort: ['Fort', 'Watchtower', 'Garrison', 'Stronghold', 'Keep', 'Bulwark', 'Outpost', '{base}'],
  shrine: ['Shrine', 'Temple', 'Sanctuary', 'Chapel', 'Votive Hall', 'Priests\' Hall', '{base}'],
  hall: ['Hall', 'Lyceum', 'Scriptorium', 'Archive', 'Academy', 'Reading Room', 'Scholars\' House', '{base}'],
  market: ['Market', 'Bazaar', 'Exchange', 'Trading House', 'Merchants\' Row', 'Mart', 'Counting House', '{base}'],
  home: ['Farmhand Commonhouse', 'Workers\' Commonhouse', 'Tenement Row', 'Lodging House', 'Longhouse', 'Cottage Row', 'Boarding House'],
  granary: ['Granary', 'Storehouse', 'Grain Store', 'Silo', 'Provision Barn', 'Warehouse'],
  workshop: ['Workshop', 'Smithy', 'Foundry', 'Mill', 'Forge', 'Works', 'Crafthall', '{base}'],
  harbor: ['Harbor', 'Quay', 'Dock', 'Landing', 'Wharf', 'Port House'],
  water: ['Waterworks', 'Cistern', 'Well', 'Aqueduct', 'Irrigation Works', 'Pump House'],
  leisure: ['Bathhouse', 'Gardens', 'Amphitheatre', 'Playhouse', 'Pleasure Grounds', 'Pavilion'],
  monument: ['Monument', 'Memorial', 'Mausoleum', 'Tomb', 'Cenotaph', 'Obelisk', '{base}'],
  ruin: ['Ruins', 'Old Settlement', 'Lost Cache', 'Abandoned Works', 'Burial Mound'],
  wonder: ['Great Works', 'Founders\' Monument', 'Grand Monument', 'Royal Works'],
  generic: ['{base}', '{base} Compound', 'Old {base}', 'Great {base}', '{base} Yard'],
};

const EXTRA_NOUNS = {
  farm: ['{res} Acres', '{res} Furrows', '{res} Terraces', 'Sowers\' {res} Plot', '{res} Steading', '{res} Demesne'],
  plantation: ['{res} Cultivation', '{res} Vineyard', '{res} Estate Lands', 'Planters\' {res} Rows'],
  pasture: ['{res} Steppe-Fold', '{res} Rangeland', 'Shepherds\' {res} Down', '{res} Stockyard'],
  camp: ['{res} Snare Lodge', 'Trackers\' {res} Hide', '{res} Blind', 'Hunters\' Longhouse'],
  mine: ['{res} Adit', '{res} Lode', 'Delvers\' {res} Seam', '{res} Excavation'],
  quarry: ['{res} Stone-Pit', 'Cutters\' {res} Face', '{res} Block Yard'],
  wood: ['Charcoal Burners\' Clearing', 'Woodwrights\' Glade', 'Felling Ground', 'Coppice Holding'],
  fishing: ['{res} Net-Shore', 'Anglers\' {res} Cove', '{res} Fish-Trap', 'Boatmen\'s Slip'],
  fort: ['Watch-Fort', 'Rampart', 'Redoubt', 'Blockhouse', 'Palisade', 'Gatehouse'],
  shrine: ['Holy House', 'Oratory', 'Pilgrim\'s Rest', 'Reliquary Hall', 'Prayer Hall', 'Sacred Grove House'],
  hall: ['Study House', 'Counsel Hall', 'Learned Society', 'Lecture Hall', 'Chronicle House', 'Astronomers\' Tower'],
  market: ['Fair Ground', 'Tollhouse', 'Cloth Hall', 'Merchant Quarter', 'Stallholders\' Court', 'Weighhouse'],
  home: ['Weavers\' Row', 'Artisans\' Court', 'Crofters\' Cottages', 'Households\' Yard', 'Gatekeepers\' Lodgings'],
  granary: ['Corn Loft', 'Grain Barn', 'Provisioner\'s Store', 'Rice Barn', 'Stockroom'],
  workshop: ['Craft Yard', 'Artisans\' Works', 'Tannery', 'Potters\' Kiln', 'Weavers\' Shed', 'Toolmakers\' Shop'],
  harbor: ['Anchorage', 'Boat Basin', 'Ship Landing', 'Seamen\'s Haven', 'Ferry Stage'],
  water: ['Water Gate', 'Fountain House', 'Conduit', 'Spring House', 'Channel Works'],
  leisure: ['Festival Grounds', 'Promenade', 'Games Court', 'Pleasure Garden', 'Theatre Court'],
  monument: ['Standing Stones', 'Triumphal Arch', 'Commemorative Column', 'Founders\' Tomb', 'Votive Pillar'],
  ruin: ['Forgotten Hall', 'Fallen Settlement', 'Old Foundations', 'Buried Works'],
  generic: ['{base} Court', '{base} House', 'Lesser {base}', '{base} Row'],
};
for (const [category, extra] of Object.entries(EXTRA_NOUNS)) NOUNS[category].push(...extra);

// First match wins; each pattern is tested against the type name without its BUILDING_/IMPROVEMENT_/WONDER_ prefix.
const CATEGORIES = [
  ['harbor', /FISHING_QUAY|HARBOR|^PORT$|WHARF|DOCKYARD|SHIPYARD|NAVAL|LIGHTHOUSE|COTHON|^COAST$/],
  ['fishing', /FISHING|FISH/],
  ['plantation', /PLANTATION/],
  ['farm', /FARM|TERRACE|LO_I_KALO|KIRIMAHU|MAWASKAWE/],
  ['pasture', /PASTURE|RANCH/],
  ['camp', /^CAMP|CAMPFIRE/],
  ['quarry', /QUARRY|STONECUTTER/],
  ['mine', /MINE|CLAY_PIT|POTKOP/],
  ['wood', /WOODCUTTER|SAW|LUMBER/],
  ['fort', /FORT|ENCAMPMENT|KASBAH|BATTERY|WALL|BAILEY|MOTTE|CITADEL|BARRACKS|ARMORER|MILITARY|DEFENS|ORTOO|BANG|DUNGEON/],
  ['water', /BARAY|STEPWELL|SAQIYA|BRIDGE|KABAKAS/],
  ['granary', /GRANARY|CANNERY|ICE_HOUSE/],
  ['shrine', /ALTAR|TEMPLE|CHAPEL|CATEDRAL|MOSQUE|CAMII|MADRASA|MONASTERY|PAGODA|VIHARA|NEMETON|MERU|MANIGRAMAM|DHARAMSHALA|ANJUVANNAM|BASILICA|CHAPTER|TAKYEH|MORTUARY|JINJA|MEGALITH|STONE_HEAD|CAIRN|MASTABA|KUH_NAH|LANGI|HALE_|VAI_KAUKAU|JALAW|GOBEN/],
  ['monument', /MONUMENT|PALACE|ZIGGURAT|PYRAMID|OBELISK|PARTHENON|CANDI_BENTAR/],
  ['hall', /LIBRARY|LECTURE|UNIVERSITY|SCHOOL|ACADEMY|OBSERVATORY|LABORATORY|MUSEUM|EXAMINATION|CONFUCIAN|INSTITUTE|PRINTING|SALON|ODEON|OPERA|CITY_HALL|GUILD|CASA_CONSISTORIAL|^THING$|HOSPITAL|EMBASSY/],
  ['market', /MARKET|BAZAAR|GROCER|MONEY|BANK|EXCHANGE|STOCK|DEPARTMENT|SOUQ|CARAVANSERAI|ENTREPOT|PORTAL_DE_MERCADERES|TRADING|CASA_DE_CONTRATACION|GHAHVE|TEA_HOUSE|TAVERN|GINKO/],
  ['home', /TENEMENT|VILLA|VILLAGE|TENTS|OBSHCHINA|HOUSING/],
  ['workshop', /BLACKSMITH|IRONWORKS|FACTORY|KILN|BRICKYARD|GRISTMILL|MANUFACTORY|STEEL|RAILYARD|RAIL_STATION|AIRFIELD|LAUNCH|RADIO|JUKOGYO|GAMA|ABATTOIR|OIL_RIG|POWER|MILL/],
  ['leisure', /BATH|HAMMAM|ARENA|AMPHITHEATER|GARDEN|PAIRIDAEZA|CITY_PARK|FORMAL|MENAGERIE|FESTIVAL|CIRCUS|WATER_PUPPET|OPEN_AIR|PLAZA|PAVILION/],
  ['ruin', /RUINS|SHIPWRECK|WRECK|CAVE|EXPEDITION/],
];

export function siteCategory(typeKey) {
  const key = String(typeKey || '').toUpperCase();
  if (key.startsWith('WONDER_')) return 'wonder';
  const tail = key.replace(/^(BUILDING|IMPROVEMENT)_/, '');
  for (const [category, pattern] of CATEGORIES) if (pattern.test(tail)) return category;
  return 'generic';
}

// Native words by site category: farm, home, market, shrine, fort, hall.
const LOCAL_KEYS = { farm: 'farm', plantation: 'farm', pasture: 'farm', home: 'home', market: 'market', shrine: 'shrine', fort: 'fort', hall: 'hall' };

// [pattern set, families, native words]. Families are the lineages, clans, houses or dynasties of that culture.
const CIV_ROWS = {
  ROME: ['the', 'Julii|Brutii|Cornelii|Fabii|Claudii|Aemilii|Valerii|Antonii|Flavii|Domitii|Cassii|Livii|Sergii|Tullii|Aurelii', 'Fundus|Domus|Macellum|Fanum|Castellum|Curia'],
  GREECE: ['the', 'Alcmaeonids|Philaids|Eumolpids|Peisistratids|Aleuads|Bacchiads|Heraclids|Pelopids|Kerykes|Eteoboutads|Eupatrids|Diomedes', 'Agros|Oikos|Agora|Temenos|Phrourion|Prytaneion'],
  EGYPT: ['of', 'Ahmose|Khety|Mentuhotep|Senusret|Sobekhotep|Nebamun|Rekhmire|Meryre|Hori|Paser|Djehuty|Ptahmose|Inebny', 'Sekhet|Per|Shuyt|Hutnetjer|Khetem|Perankh'],
  PERSIA: ['the', 'Intaphrenes|Otanes|Gobryas|Hydarnes|Megabyzus|Aspathines|Mardonius|Pharnaces|Spitamenes|Artabazus|Bagabuxsha|Datis', 'Mazraeh|Khaneh|Bazar|Atashkadeh|Qaleh|Divan'],
  HAN: ['clan', 'Liu|Zhao|Wang|Li|Chen|Zhang|Wei|Xiao|Cao|Han|Ma|Sun|Yuan', 'Tian|Ju|Shi|Miao|Guan|Ting'],
  AKSUM: ['the', 'Ezana|Kaleb|Ousanas|Endubis|Wazeba|Hataz|Sembrouthes|Gersem|Armah|Gabra|Ella Amida|Ouazebas', 'Meder|Bet|Gebeya|Mekdes|Gimb|Mengist'],
  KHMER: ['the', 'Jayavarman|Suryavarman|Yasovarman|Indravarman|Rajendravarman|Udayadityavarman|Harshavarman|Bhavavarman|Isanavarman|Mahidharapura|Sangkhapura|Aninditapura', 'Srae|Phteah|Phsar|Prasat|Kampaeng|Sala'],
  MAURYA: ['the', 'Kashyapa|Gautama|Bharadvaja|Vasistha|Atreya|Kaushika|Gargya|Vatsa|Angirasa|Magadha|Nanda|Mauryan', 'Kshetra|Griha|Apana|Mandira|Durga|Sabha'],
  MAYA: ['the', 'Balam|Kan|Chaak|Tun|Ek|Ahk|Itza|Xiu|Cocom|Pech|Canul|Chel', 'Kool|Naah|Kiwik|Kuhul|Multun|Popol Naah'],
  MISSISSIPPIAN: ['clan', 'Bear|Panther|Thunder|Raccoon|Wolf|Deer|Eagle|Turtle|Water Spider|Beaver|Fox|Hawk', ''],
  CARTHAGE: ['the', 'Barcid|Magonid|Hannonid|Gisgonid|Mago|Hanno|Himilco|Bomilcar|Adherbal|Maharbal|Hasdrubal|Hamilcar', ''],
  ASSYRIA: ['of', 'Adasi|Eriba|Sargon|Ashur|Tukulti|Shamshi|Adad|Nabu|Ninurta|Sennacherib|Esarhaddon|Shalmaneser', 'Eqlu|Bitu|Karum|Ekurru|Duru|Ekallu'],
  BABYLON: ['the', 'Egibi|Murashu|Nur-Sin|Itti-Marduk|Shamash|Nabu|Kudurru|Marduk|Nanna|Kassite|Hammurabi|Nebuchadnezzar', 'Eqlu|Bitu|Karum|Ekurru|Duru|Bit Tuppi'],
  GAUL: ['the', 'Aedui|Arverni|Sequani|Helvetii|Allobroges|Bituriges|Carnutes|Remi|Senones|Treveri|Parisii|Nervii', 'Magos|Treb||Nemeton|Dunum|'],
  ABBASID: ['the', 'Barmakid|Tahirid|Nawbakhti|Banu Musa|Banu Hashim|Saffarid|Ibn Tulun|Hamdanid|Thaqafi|Khuzai|Ibn Rustah|Ibn Qutayba', 'Mazraa|Dar|Suq|Masjid|Hisn|Diwan'],
  CHOLA: ['the', 'Pazhuvettaraiyar|Mazhavarayar|Kadavarayar|Muttaraiyar|Velir|Irukkuvel|Kodumbalur|Paluvur|Vanavan|Tennavan|Cheran|Pallava', 'Vayal|Illam|Angadi|Koil|Kottai|Mandapam'],
  MING: ['clan', 'Zhu|Xu|Tang|Shen|Wen|Yang|Qian|Gu|Lu|Hu|Feng|Zheng', 'Tian|Zhai|Shi|Miao|Wei|Yamen'],
  QING: ['clan', 'Niohuru|Fuca|Tunggiya|Hesheri|Nara|Sakda|Irgen|Dongo|Gualgiya|Ula|Hoifa|Yehe', 'Zhuang|Yuan|Hang|Miao|Ying|Yamen'],
  SONGHAI: ['the', 'Sonni|Askia|Cisse|Toure|Maiga|Dia|Kati|Ben Ali|Sy|Bari|Diallo|Zarma', ''],
  MONGOLIA: ['clan', 'Borjigin|Kiyat|Jalair|Barlas|Tayichiud|Merkit|Naiman|Keraite|Uriankhai|Khongirad|Oirat|Onggirat', 'Taria|Ger|Zakh|Khiid|Berkh|Ordon'],
  NORMAN: ['house', 'de Hauteville|de Montgomery|de Beaumont|de Warenne|Giroie|Taillefer|Fitz-Osbern|Malet|de Courcy|de Grandmesnil|de Bellemes|de Tosny', 'Manoir|Maison|Marche|Chapelle|Chateau|Salle'],
  SPAIN: ['house', 'Mendoza|Guzman|Velasco|Enriquez|Toledo|Alvarez|Cisneros|Pimentel|Zuniga|Ponce de Leon|Alba|Medina Sidonia', 'Granja|Casa|Mercado|Ermita|Alcazaba|Cabildo'],
  INCA: ['ayllu', 'Hatun|Hanan Qusqu|Hurin Qusqu|Capac|Chima|Raura|Apu Mayta|Aucaylli|Sutic Tocco|Vicaquirau|Anan|Qhapaq', 'Chakra|Wasi|Katu|Waka|Pukara|Kancha'],
  SHAWNEE: ['clan', 'Chalahgawtha|Kispokotha|Mekoche|Pekowi|Hathawekela|Cornstalk|Blue Jacket|Black Hoof|Tecumseh|Panther|Turtle|Raccoon', ''],
  BUGANDA: ['clan', 'Ffumbe|Lugave|Nkima|Mamba|Ngeye|Nvuma|Kasimba|Njovu|Butiko|Nnyonyi|Mbogo|Ngonge', ''],
  HAWAII: ['clan', 'Kamehameha|Kalakaua|Keawe|Umi|Liloa|Maui|Kekaulike|Kalaniopuu|Kaumualii|Kapiolani|Lunalilo|Pai', 'Mahi|Hale|Makeke|Heiau|Puuhonua|Halau'],
  MAJAPAHIT: ['the', 'Rajasa|Singhasari|Wijaya|Hayam|Bhre Wengker|Bhre Kahuripan|Bhre Daha|Bhre Tumapel|Bhre Matahun|Kertanagara|Gajah|Raden', 'Sawah|Omah|Pasar|Candi|Benteng|Pendopo'],
  TONGA: ['the', 'Tuitonga|Tuihaatakalaua|Tuikanokupolu|Vaea|Tupou|Maafu|Fusitua|Tuita|Ata|Fakafanua|Kauhalalalo|Lauaki', ''],
  AMERICA: ['the', 'Adams|Livingston|Schuyler|Carroll|Randolph|Winthrop|Cabot|Lowell|Vanderbilt|Roosevelt|Hancock|Rockefeller', 'Homestead|Rowhouse|Trading Post|Meetinghouse|Stockade|Town Hall'],
  FRENCHEMPIRE: ['house', 'Montmorency|Bourbon|Rohan|Lorraine|Conde|Noailles|Talleyrand|Lafayette|Richelieu|Beauharnais|Choiseul|Polignac', 'Ferme|Maison|Marche|Chapelle|Chateau|Hotel de Ville'],
  ENGLAND: ['house', 'Percy|Neville|Howard|Stanley|Beauchamp|Clifford|Mowbray|Courtenay|Talbot|Dacre|Mortimer|Montagu', 'Manor Farm|Cottage|Market Cross|Priory|Keep|Guildhall'],
  GREATBRITAIN: ['the', 'Cavendish|Russell|Grosvenor|Spencer|Cecil|Wellesley|Pelham|Baring|Rothschild|Wedgwood|Arkwright|Darby', 'Home Farm|Terrace|Corn Exchange|Chapel|Redoubt|Athenaeum'],
  PRUSSIA: ['house', 'von Bismarck|von Moltke|von Kleist|von Arnim|von Buelow|von der Marwitz|von Dohna|von Itzenplitz|von Schwerin|von Zieten|von Yorck|von Roon', 'Gut|Haus|Markt|Kirche|Festung|Rathaus'],
  RUSSIA: ['the', 'Romanov|Sheremetev|Golitsyn|Dolgorukov|Stroganov|Shuvalov|Orlov|Naryshkin|Yusupov|Vorontsov|Trubetskoy|Demidov', 'Khutor|Izba|Torg|Tserkov|Ostrog|Terem'],
  MEIJI: ['clan', 'Mitsui|Mitsubishi|Sumitomo|Yasuda|Iwasaki|Shibusawa|Okura|Furukawa|Konoike|Asano|Fujita|Kawasaki', 'Noen|Nagaya|Ichiba|Jinja|Shiro|Kaikan'],
  HEIAN: ['clan', 'Fujiwara|Taira|Minamoto|Tachibana|Sugawara|Otomo|Kiyohara|Abe|Soga|Nakatomi|Kose|Ki', 'Shoen|Yashiki|Ichi|Jinja|Toride|Den'],
  SENGOKU: ['clan', 'Takeda|Uesugi|Hojo|Imagawa|Oda|Tokugawa|Mori|Shimazu|Date|Chosokabe|Asakura|Maeda', 'Hatake|Yashiki|Ichi|Jinja|Shiro|Goten'],
  MEXICO: ['house', 'Madero|Terrazas|Escandon|Limantour|Zuloaga|Creel|Iturbe|Sanchez Navarro|Alaman|Mora|Iturbide|Obregon', 'Hacienda|Casa|Mercado|Capilla|Presidio|Ayuntamiento'],
  MUGHAL: ['the', 'Barlas|Atgah|Kokaltash|Rajawat|Kachhwaha|Sayyid|Mirza|Khan-i-Khanan|Bairam|Asaf|Todar|Man Singh', 'Zamin|Haveli|Bazaar|Dargah|Qila|Diwan'],
  NEPAL: ['the', 'Malla|Thapa|Rana|Pande|Basnyat|Kunwar|Shah|Newar|Tamang|Gurung|Limbu|Shrestha', 'Khet|Ghar|Bazaar|Mandir|Kot|Sabha'],
  OTTOMANS: ['the', 'Koprulu|Evrenosoglu|Mihaloglu|Candarli|Sokollu|Pargali|Barbaros|Turahanoglu|Karamanoglu|Kara Mustafa|Ibrahim|Osmanoglu', 'Ciftlik|Konak|Carsi|Cami|Hisar|Divan'],
  QAJAR: ['the', 'Devehlu|Qovanlu|Ashaqabash|Ziyadoghlu|Zand|Afshar|Bakhtiari|Qashqai|Shahsevan|Bayat|Kangarlu|Amir Kabir', 'Mazraeh|Khaneh|Bazar|Emamzadeh|Qaleh|Divankhaneh'],
  SIAM: ['the', 'Chakri|Bunnag|Sihanat|Singhaseni|Sukhothai|Phaya|Ayudhya|Suphanburi|Lopburi|Ratchaburi|Phetchaburi|Nakhon', 'Na|Ruean|Talat|Wat|Pom|Sala'],
  DAIVIET: ['clan', 'Ly|Tran|Le|Nguyen|Ho|Mac|Trinh|Dinh|Khuc|Pham|Ngo|Vu', 'Ruong|Nha|Cho|Chua|Thanh|Dinh'],
  JOSEON: ['clan', 'Kim|Yi|Park|Choi|Jeong|Han|Min|Yun|Cho|Hong|Seo|Shin', 'Bat|Hanok|Jang|Sa|Seong|Dang'],
  GORYEO: ['clan', 'Wang|Kim|Choe|Yi|Chung|Kang|Yun|Yu|Hong|Min|Heo|Gyeongju', 'Bat|Jip|Jang|Sa|Seong|Dang'],
  SILLA: ['clan', 'Park|Seok|Kim|Choe|Seol|Jeong|Bae|Son|Yi|Gim|Hyeon|Ahn', 'Bat|Jip|Si|Sa|Seong|Jeon'],
  ICELAND: ['of', 'Sturlung|Oddaverji|Haukdaelir|Svinfelling|Asbirning|Vatnsfirding|Ormsson|Skalholt|Ingolfsson|Hrafnsson|Snorrason|Eiriksson', 'Baer|Skali|Kaupang|Hof|Borg|Althing'],
  BULGARIA: ['the', 'Dulo|Asen|Shishman|Terter|Komitopuli|Kavkhan|Sratsimir|Bogoris|Krum|Omurtag|Boril|Petar', 'Niva|Kashta|Pazar|Tsarkva|Krepost|Dvorets'],
  PIRATEREPUBLIC: ['pirate', 'Teach|Rackham|Bonny|Vane|Kidd|Morgan|Bellamy|Roberts|Hornigold|Read|Avery|Low', ''],
  GENERIC: ['the', 'Aldren|Berrow|Carrow|Dunmore|Elmer|Farrow|Garrick|Halden|Ivor|Jorren|Kessin|Lorne', ''],
};
CIV_ROWS.FRENCH = CIV_ROWS.FRANCE = CIV_ROWS.FRENCHEMPIRE;
CIV_ROWS.CITYSTATE = CIV_ROWS.INDEPENDENT = CIV_ROWS.GENERIC;

const NATIVE_KEYS = ['farm', 'home', 'market', 'shrine', 'fort', 'hall'];
const CIVS = {};
for (const [key, [patternSet, families, words]] of Object.entries(CIV_ROWS)) {
  const local = {};
  words.split('|').forEach((word, i) => { if (word) local[NATIVE_KEYS[i]] = word; });
  CIVS[key] = { patterns: PATTERNS[patternSet], families: families.split('|'), local, culture: cultureOf(key) };
}

export const SITE_CIV_KEYS = Object.keys(CIVS).filter(key => key !== 'GENERIC');

function roman(n) {
  const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [value, symbol] of table) while (n >= value) { out += symbol; n -= value; }
  return out;
}

function tidy(text) {
  return text.replace(/\s{2,}/g, ' ').replace(/\s+'s\b/g, '\'s').trim();
}

function buildName(civ, category, item, seed) {
  const nouns = (NOUNS[category] || NOUNS.generic).slice();
  const native = civ.local[LOCAL_KEYS[category]];
  if (native) nouns.push(native, native);
  const noun = nouns[hash(`${seed}|n`) % nouns.length];
  let site = tidy(noun.replace(/\{res\}/g, item.resource || '').replace(/\{base\}/g, item.base || 'Site'));
  // A quarter of the sites carry a culture-typical modifier ("Fundus Vetus", "Upper Mill").
  if (hash(`${seed}|m`) % 100 < 25) {
    const modifier = siteModifier(civ.culture, seed);
    if (modifier) site = tidy(modifier.pre ? `${modifier.pre} ${site}` : `${site} ${modifier.post}`);
  }
  // Families come from the culture's hand-written lineages about half the time, and from its generated sounds otherwise.
  const family = hash(`${seed}|gf`) % 100 < 45 ? generatedSurname(civ.culture, seed) : civ.families[hash(`${seed}|f`) % civ.families.length];
  // One site in five is named for a (generated) place instead of a family.
  if (hash(`${seed}|pl`) % 100 < 20) {
    const place = generatedPlace(civ.culture, seed);
    return tidy(hash(`${seed}|pf`) % 2 ? `${place} ${site}` : `The ${site} of ${place}`);
  }
  const pattern = civ.patterns[hash(`${seed}|p`) % civ.patterns.length];
  return tidy(pattern.replace('{f}', family).replace('{s}', site));
}

// items: [{ typeKey, base, resource, count }]. Returns, per item, one unique name for each of its `count` icons.
export function siteNamesForTile(civKey, tileIndex, items) {
  const civ = CIVS[civKey] || CIVS.GENERIC, used = new Set(), result = [];
  for (const item of items) {
    const category = siteCategory(item.typeKey), names = [];
    for (let dot = 0; dot < item.count; dot++) {
      let name = '';
      const seedBase = `${civKey}|${tileIndex}|${item.typeKey}|${dot}`;
      for (let attempt = 0; attempt < 48 && !name; attempt++) {
        const candidate = buildName(civ, category, item, `${seedBase}|${attempt}`);
        if (!used.has(candidate)) name = candidate;
      }
      if (!name) {
        const first = buildName(civ, category, item, `${seedBase}|0`);
        for (let n = 2; !name; n++) if (!used.has(`${first} ${roman(n)}`)) name = `${first} ${roman(n)}`;
      }
      used.add(name);
      names.push(name);
    }
    result.push(names);
  }
  return result;
}
