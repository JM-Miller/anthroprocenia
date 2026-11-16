// Names, occupations and faiths for the tiny people who walk through a townscape. A person's name comes from the
// culture of the civilization that controls the tile (and the faith that civilization founded), the age shapes the
// by-name and the trades available, and the occupation follows what the person is part of: the improvement,
// building, quarter, wonder or unit the townscape belongs to and the building they live or work in.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;   // avalanche: the low bits matter when picking from short lists
  return h >>> 0;
}
import { cultureOf, generatedGiven, generatedSurname, fullNameStyle } from './anthroprocenia-namegen.js';

// male given names | female given names | family names (or, for Iceland, fathers' names)
const NAME_ROWS = {
  ROME: 'Marcus,Gaius,Lucius,Quintus,Titus,Publius,Aulus,Decimus|Julia,Livia,Cornelia,Claudia,Octavia,Valeria,Flavia,Aurelia|Julius,Brutus,Cornelius,Fabius,Claudius,Aemilius,Valerius,Antonius,Flavius,Domitius',
  GREECE: 'Nikias,Alexandros,Theron,Leonidas,Demetrios,Kleon,Philon,Xenon|Phila,Thaleia,Theano,Kallisto,Melissa,Xanthe,Eirene,Zoe|Alkmaion,Philaios,Eumolpos,Peisistratos,Aleuas,Pelops,Diomedes,Herakleides,Lykourgos,Sophokles',
  EGYPT: 'Ahmose,Khety,Senusret,Nebamun,Paser,Hori,Ptahmose,Meryre|Nefertari,Isetnofret,Meryt,Sitre,Tiye,Henut,Nefret,Meritamun|Amunemhat,Rekhmire,Djehuty,Inebny,Mentuhotep,Sobekhotep,Intef,Montu,Khnum,Wadjet',
  PERSIA: 'Dariush,Arshak,Bahram,Mehrdad,Kourosh,Shapur,Farhad,Tahmasp|Roxana,Atossa,Parisa,Azadeh,Mandana,Shirin,Farnaz,Dena|Pasargadi,Hamadani,Isfahani,Shirazi,Mardani,Spandiari,Bagrati,Karen,Suren,Mihran',
  ABBASID: 'Muhammad,Harun,Ali,Hasan,Yusuf,Khalid,Ibrahim,Mansur|Fatima,Aisha,Zubayda,Layla,Maryam,Khadija,Zaynab,Sakina|Barmaki,Tahiri,Hashimi,Basri,Kufi,Baghdadi,Musawi,Saffari,Hamdani,Khuzai',
  ASSYRIA: 'Ashurdan,Nabu-rimanni,Sin-ahhe,Adad-nirari,Tukulti,Bel-ibni,Nergal-ushezib,Shamash-shuma|Naqia,Banitu,Sammuramat,Iltani,Belessunu,Ahat-abisha,Taddin,Amat|Adasi,Eriba,Sargon,Nabu,Ninurta,Shamshi,Ashur,Sennacherib,Kalhu,Nineveh',
  BABYLON: 'Marduk-apla,Nabu-kudurri,Itti-Marduk,Shamash-eriba,Bel-shimanni,Nanna-iddin,Mushezib,Ea-nasir|Taram,Ishtar-ummi,Belit,Amat-Shamash,Shuqamuna,Kubaba,Nidintu,Tashmetu|Egibi,Murashu,Nur-Sin,Kassite,Hammurabi,Borsippa,Nippur,Sippar,Uruk,Kish',
  GAUL: 'Dumnorix,Orgetorix,Ambiorix,Cingetorix,Litavicus,Cotuatus,Viridovix,Eporedorix|Rigani,Cartimandua,Dagomara,Nantosuelta,Sirona,Brigantia,Veleda,Maponia|Arvernus,Aeduus,Sequanus,Helvetius,Allobrox,Biturix,Carnutus,Remus,Senonus,Treverus',
  HAN: 'Bang,Che,Qubing,Wei,Ping,Zhao,Jun,Heng|Wei,Lan,Mei,Zhaojun,Ying,Hua,Xiu,Yu|Liu,Zhao,Wang,Li,Chen,Zhang,Wei,Xiao,Cao,Han',
  MING: 'Yong,Hao,Ming,Tao,Kai,Bo,Cheng,Lin|Xiu,Lian,Fang,Yun,Qing,Zhen,Rui,Mei|Zhu,Xu,Tang,Shen,Wen,Yang,Qian,Gu,Lu,Hu',
  QING: 'Ebai,Fiongdon,Hatan,Sonin,Songgotu,Tulisen,Dorgon,Mingju|Xiuying,Lanying,Meiling,Yuxi,Zhenyu,Suyin,Fenglan,Huiying|Niohuru,Fuca,Tunggiya,Hesheri,Nara,Sakda,Irgen,Dongo,Wang,Zhang',
  MAURYA: 'Chandra,Bindu,Ashoka,Rama,Kautilya,Vikram,Devadatta,Sumitra|Durdhara,Radha,Sita,Padma,Kamala,Uma,Lakshmi,Gauri|Kashyapa,Gautama,Bharadvaja,Vasistha,Atreya,Kaushika,Gargya,Vatsa,Angirasa,Mauryan',
  CHOLA: 'Rajaraja,Rajendra,Aditya,Parantaka,Kandaraditya,Arulmozhi,Vandiyadevan,Kundavai|Kundavai,Vanathi,Chembian,Sembiyan,Poonkuzhali,Nandini,Aruna,Mangai|Pazhuvettaraiyar,Mazhavarayar,Kadavarayar,Muttaraiyar,Velir,Irukkuvel,Kodumbalur,Paluvur,Vanavan,Tennavan',
  KHMER: 'Sok,Vuth,Chea,Ream,Narith,Sovann,Dara,Pich|Sophea,Chanthou,Srey,Kanha,Rachana,Sokha,Vanna,Bopha|Chan,Keo,Kong,Ly,Mao,Nhem,Phan,Sok,Touch,Yim',
  MAJAPAHIT: 'Gajah,Raden,Wijaya,Hayam,Arya,Nambi,Ronggolawe,Jayanegara|Gayatri,Dyah,Sri,Tribhuwana,Retno,Ayu,Wulan,Sekar|Rajasa,Singhasari,Kahuripan,Daha,Tumapel,Matahun,Wengker,Lasem,Pajang,Tuban',
  SIAM: 'Somchai,Chai,Prasert,Narai,Naresuan,Anurak,Somsak,Kasem|Malee,Suda,Napa,Siriporn,Kanya,Lamai,Boonsri,Pim|Chakri,Bunnag,Sihanat,Singhaseni,Sukhothai,Ayudhya,Suphanburi,Lopburi,Ratchaburi,Nakhon',
  DAIVIET: 'Trong,Hung,Quang,Duc,Minh,Binh,Thanh,Long|Lan,Huong,Mai,Linh,Thao,Hoa,Nga,Trinh|Ly,Tran,Le,Nguyen,Ho,Mac,Trinh,Dinh,Khuc,Pham',
  NEPAL: 'Bhim,Ram,Arjun,Sagar,Prithvi,Amar,Bahadur,Hari|Sita,Gita,Laxmi,Maya,Radha,Sunita,Kamala,Parbati|Malla,Thapa,Rana,Pande,Basnyat,Kunwar,Shah,Shrestha,Tamang,Gurung',
  MAYA: 'Chaak,Yaxun,Kinich,Balam,Ahau,Itzamna,Ukit,Bakab|Ixchel,Ixkan,Itzel,Yaxal,Sak,Kaan,Chel,Ixnik|Balam,Kan,Tun,Ek,Ahk,Xiu,Cocom,Pech,Canul,Chel',
  INCA: 'Huayna,Tupac,Wayra,Inti,Amaru,Manco,Apu,Sinchi|Mama,Quilla,Cusi,Chaska,Nusta,Killa,Illari,Sumaq|Hatun,Capac,Chima,Raura,Anan,Mayta,Vicaquirau,Tocco,Aucaylli,Qhapaq',
  MISSISSIPPIAN: 'Sun,Hawk,Bear,Thunder,Cedar,Otter,River,Flint|Corn,Dawn,Willow,Moon,Dove,Fern,Rain,Star|Panther,Raccoon,Wolf,Turtle,Beaver,Eagle,Deer,Fox,Spider,Heron',
  SHAWNEE: 'Chiksika,Sauwauseekau,Kumskaukau,Cornstalk,Hokolesqua,Weshecat,Hawk,Fox|Tecumapese,Methoataske,Nehaaseemo,Moon,Willow,Corn,Dawn,Fern|Chalahgawtha,Kispokotha,Mekoche,Pekowi,Hathawekela,Panther,Turtle,Raccoon,Wolf,Deer',
  BUGANDA: 'Kato,Mukasa,Walusimbi,Kiwanuka,Ssebowa,Kibuuka,Nsubuga,Lutaaya|Nakato,Nabirye,Namukasa,Nansubuga,Nambi,Nalubega,Nassolo,Nabukalu|Ffumbe,Lugave,Nkima,Mamba,Ngeye,Nvuma,Kasimba,Njovu,Butiko,Nnyonyi',
  HAWAII: 'Kalani,Keoni,Makoa,Kekoa,Kane,Nalu,Lono,Keanu|Leilani,Malia,Kalea,Noelani,Mele,Lani,Keala,Nani|Kealoha,Kahale,Akana,Kapule,Makaila,Kaleo,Kahanu,Nakoa,Kekumu,Kauhane',
  TONGA: 'Sione,Tevita,Viliami,Semisi,Mosese,Ofa,Taufa,Fifita|Mele,Lupe,Seini,Salote,Losa,Siu,Ana,Fusi|Tupou,Vaea,Tuita,Fusitua,Ata,Fakafanua,Maafu,Havea,Fifita,Latu',
  SONGHAI: 'Sonni,Askia,Mohammed,Ali,Suleiman,Bakari,Moussa,Ismael|Fatouma,Aissata,Hawa,Mariam,Zeinabou,Rahma,Kadidia,Haoua|Cisse,Toure,Maiga,Dia,Kati,Sy,Bari,Diallo,Zarma,Keita',
  CARTHAGE: 'Hanno,Himilco,Mago,Hasdrubal,Hamilcar,Bomilcar,Adherbal,Maharbal|Elissa,Sophoniba,Imilce,Arishat,Batbaal,Shiprat,Hamilat,Amat|Barca,Magonid,Hannonid,Gisgo,Bodmelqart,Abdmelqart,Himilkat,Adonibaal,Hasdrubal,Eshmun',
  AKSUM: 'Ezana,Kaleb,Ousanas,Endubis,Wazeba,Gabra,Armah,Sizana|Selam,Tsion,Mekdes,Azeb,Berhan,Saba,Makeda,Yodit|Gebre,Tekle,Haile,Wolde,Kidane,Mariam,Giorgis,Amlak,Yohannes,Tewodros',
  MONGOLIA: 'Batu,Bold,Bayar,Temur,Dorj,Erdene,Munkh,Tsogt|Oyun,Khulan,Sarnai,Narantuya,Altan,Borte,Checheg,Solongo|Borjigin,Kiyat,Jalair,Barlas,Tayichiud,Merkit,Naiman,Keraite,Uriankhai,Onggirat',
  NORMAN: 'William,Robert,Roger,Richard,Tancred,Odo,Bohemond,Geoffrey|Matilda,Adela,Emma,Sybil,Gunnor,Judith,Alice,Eleanor|de Hauteville,de Montgomery,de Beaumont,de Warenne,Giroie,Taillefer,Fitz-Osbern,Malet,de Courcy,de Tosny',
  SPAIN: 'Juan,Pedro,Diego,Fernando,Alonso,Hernan,Francisco,Rodrigo|Isabel,Maria,Ana,Catalina,Juana,Leonor,Beatriz,Teresa|Mendoza,Guzman,Velasco,Enriquez,Toledo,Alvarez,Cisneros,Pimentel,Zuniga,Ponce',
  FRENCHEMPIRE: 'Jean,Pierre,Louis,Henri,Charles,Francois,Antoine,Philippe|Marie,Jeanne,Anne,Catherine,Marguerite,Louise,Isabeau,Madeleine|Montmorency,Bourbon,Rohan,Lorraine,Conde,Noailles,Talleyrand,Lafayette,Richelieu,Choiseul',
  ENGLAND: 'William,John,Henry,Thomas,Edmund,Robert,Richard,Geoffrey|Matilda,Eleanor,Joan,Margaret,Alice,Agnes,Isabel,Cecily|Percy,Neville,Howard,Stanley,Beauchamp,Clifford,Mowbray,Courtenay,Talbot,Mortimer',
  GREATBRITAIN: 'George,William,James,Charles,Edward,Arthur,Henry,Albert|Victoria,Elizabeth,Mary,Charlotte,Emma,Florence,Ada,Alice|Cavendish,Russell,Grosvenor,Spencer,Cecil,Wellesley,Pelham,Baring,Wedgwood,Arkwright',
  PRUSSIA: 'Friedrich,Wilhelm,Otto,Karl,Heinrich,Ludwig,Johann,Gustav|Luise,Auguste,Charlotte,Sophie,Amalie,Wilhelmine,Clara,Marie|von Bismarck,von Moltke,von Kleist,von Arnim,von Dohna,von Schwerin,von Zieten,von Yorck,von Roon,Schmidt',
  RUSSIA: 'Ivan,Dmitri,Alexei,Nikolai,Pyotr,Sergei,Mikhail,Fyodor|Anna,Ekaterina,Olga,Maria,Natalia,Sofia,Tatiana,Irina|Romanov,Sheremetev,Golitsyn,Dolgorukov,Stroganov,Orlov,Naryshkin,Yusupov,Vorontsov,Demidov',
  BULGARIA: 'Boris,Simeon,Krum,Asen,Petar,Ivan,Kaloyan,Todor|Maria,Irina,Elena,Desislava,Teodora,Bogdana,Ralitsa,Yana|Dulo,Asenov,Shishman,Terter,Komitopuli,Kavkhan,Sratsimir,Boril,Petrov,Ivanov',
  OTTOMANS: 'Mehmed,Murad,Osman,Ahmed,Suleyman,Orhan,Ibrahim,Selim|Hurrem,Fatma,Ayse,Mihrimah,Nilufer,Safiye,Hafsa,Gulbahar|Koprulu,Evrenosoglu,Mihaloglu,Candarli,Sokollu,Pargali,Barbaros,Turahanoglu,Karamanoglu,Osmanoglu',
  MUGHAL: 'Babur,Akbar,Humayun,Jahangir,Salim,Murad,Daniyal,Bairam|Nur,Mumtaz,Jahanara,Salima,Gulbadan,Hamida,Ruqaiya,Zeb|Barlas,Atgah,Kokaltash,Rajawat,Kachhwaha,Sayyid,Mirza,Bairam,Asaf,Todar',
  QAJAR: 'Agha,Fath,Mohammad,Nasser,Abbas,Hossein,Naser,Mirza|Taj,Anis,Fatemeh,Maryam,Zahra,Shams,Khadijeh,Mahin|Devehlu,Qovanlu,Ashaqabash,Ziyadoghlu,Zand,Afshar,Bakhtiari,Qashqai,Shahsevan,Kangarlu',
  MEIJI: 'Hirobumi,Taro,Ichiro,Kenji,Masao,Shigeru,Takeshi,Yukio|Hanako,Yoshiko,Sachiko,Tomoko,Mitsuko,Kimiko,Haruko,Umeko|Mitsui,Mitsubishi,Sumitomo,Yasuda,Iwasaki,Shibusawa,Okura,Furukawa,Ito,Yamamoto',
  HEIAN: 'Michizane,Kiyomori,Yoritomo,Akira,Masakado,Tadahira,Michinaga,Yukinaga|Murasaki,Shonagon,Akiko,Teishi,Sadako,Fujiko,Kaoru,Hanako|Fujiwara,Taira,Minamoto,Tachibana,Sugawara,Otomo,Kiyohara,Abe,Soga,Nakatomi',
  SENGOKU: 'Nobunaga,Shingen,Kenshin,Hideyoshi,Ieyasu,Masamune,Motonari,Yoshimoto|Nene,Oichi,Gracia,Hana,Aya,Chacha,Ine,Mitsu|Takeda,Uesugi,Hojo,Imagawa,Oda,Tokugawa,Mori,Shimazu,Date,Maeda',
  JOSEON: 'Seong,Min,Jun,Hyeon,Su,Jae,Dong,Woo|Eun,Hye,Yeon,Soo,Ji,Mi,Seo,Ha|Kim,Yi,Park,Choi,Jeong,Han,Min,Yun,Cho,Hong',
  GORYEO: 'Seong,Min,Jun,Hyeon,Su,Jae,Dong,Woo|Eun,Hye,Yeon,Soo,Ji,Mi,Seo,Ha|Wang,Kim,Choe,Yi,Chung,Kang,Yun,Yu,Hong,Heo',
  SILLA: 'Seong,Min,Jun,Hyeon,Su,Jae,Dong,Woo|Eun,Hye,Yeon,Soo,Ji,Mi,Seo,Ha|Park,Seok,Kim,Choe,Seol,Jeong,Bae,Son,Yi,Ahn',
  ICELAND: 'Thorgeir,Snorri,Gudmund,Egil,Eirik,Gunnar,Njal,Hrafn|Gudrun,Thora,Ingibjorg,Helga,Aslaug,Thorunn,Sigrid,Unn|Ormur,Skuli,Ketil,Bjarni,Hallur,Oddi,Haukur,Svein',
  MEXICO: 'Jose,Miguel,Benito,Francisco,Porfirio,Emiliano,Venustiano,Antonio|Maria,Guadalupe,Josefina,Carmen,Rosa,Dolores,Soledad,Luz|Madero,Terrazas,Escandon,Limantour,Zuloaga,Creel,Iturbe,Mora,Juarez,Hernandez',
  AMERICA: 'James,John,William,George,Thomas,Samuel,Henry,Benjamin|Mary,Elizabeth,Sarah,Abigail,Martha,Hannah,Margaret,Eleanor|Adams,Livingston,Schuyler,Carroll,Randolph,Winthrop,Cabot,Lowell,Hancock,Roosevelt',
  PIRATEREPUBLIC: 'Edward,Calico,Black,Stede,Henry,Benjamin,Samuel,Charles|Anne,Mary,Grace,Jane,Rachel,Sally,Betsy,Maria|Teach,Rackham,Bonny,Vane,Kidd,Morgan,Bellamy,Roberts,Hornigold,Avery',
  GENERIC: 'Aldric,Bran,Corin,Dorian,Edric,Falk,Garen,Hale|Alba,Brisa,Cora,Dara,Elin,Fenna,Gwen,Hana|Aldren,Berrow,Carrow,Dunmore,Elmer,Farrow,Garrick,Halden,Ivor,Jorren',
};
NAME_ROWS.FRENCH = NAME_ROWS.FRANCE = NAME_ROWS.FRENCHEMPIRE;
NAME_ROWS.CITYSTATE = NAME_ROWS.INDEPENDENT = NAME_ROWS.GENERIC;
const NAMES = {};
for (const [civ, row] of Object.entries(NAME_ROWS)) {
  const [male, female, family] = row.split('|').map(list => list.split(','));
  NAMES[civ] = { male, female, family };
}
export const PEOPLE_CIVS = Object.keys(NAMES).filter(key => key !== 'GENERIC');
const FAMILY_FIRST = new Set(['HAN', 'MING', 'QING', 'DAIVIET', 'MEIJI', 'HEIAN', 'SENGOKU', 'JOSEON', 'GORYEO', 'SILLA']);

// Faiths: given names and trades of the clergy. The founded religion's name is matched loosely.
const FAITHS = [
  ['islam', /islam|muslim/i, { male: ['Muhammad', 'Ahmad', 'Ali', 'Hassan', 'Omar', 'Yusuf', 'Ibrahim', 'Khalid'], female: ['Fatima', 'Aisha', 'Zainab', 'Layla', 'Maryam', 'Khadija'], clergy: ['Imam', 'Muezzin', 'Qadi'] }],
  ['christian', /christ|catholic|orthodox|protestant/i, { male: ['John', 'Peter', 'Paul', 'Thomas', 'Matthew', 'Stephen', 'Andrew', 'Luke'], female: ['Maria', 'Anna', 'Elizabeth', 'Catherine', 'Agnes', 'Margaret'], clergy: ['Priest', 'Monk', 'Bishop'] }],
  ['buddhist', /buddh/i, { male: ['Ananda', 'Sumedha', 'Tenzin', 'Sariputta', 'Rahula', 'Kassapa'], female: ['Khema', 'Uppalavanna', 'Sujata', 'Maya', 'Visakha', 'Patacara'], clergy: ['Monk', 'Abbot', 'Novice'] }],
  ['hindu', /hindu|vedic|brahman/i, { male: ['Arjun', 'Rama', 'Vishnu', 'Krishna', 'Hari', 'Mohan', 'Dev', 'Shiv'], female: ['Lakshmi', 'Sita', 'Radha', 'Parvati', 'Gauri', 'Durga'], clergy: ['Pandit', 'Temple priest', 'Brahmin'] }],
  ['jewish', /jud|jew/i, { male: ['David', 'Samuel', 'Moses', 'Isaac', 'Jacob', 'Aaron', 'Eli', 'Joseph'], female: ['Rachel', 'Leah', 'Sarah', 'Miriam', 'Hannah', 'Ruth'], clergy: ['Rabbi', 'Cantor', 'Scribe'] }],
  ['zoroastrian', /zoroast|mazd/i, { male: ['Darius', 'Mehrdad', 'Zarir', 'Spenta', 'Ardeshir', 'Rostam'], female: ['Mehr', 'Anahita', 'Spenta', 'Armaiti', 'Hutaosa', 'Daena'], clergy: ['Mobed', 'Fire-tender', 'Dastur'] }],
  ['shinto', /shint/i, { male: ['Kazuo', 'Haruki', 'Takeshi', 'Hiroshi', 'Susanoo', 'Ryu'], female: ['Amaterasu', 'Sakura', 'Hina', 'Akane', 'Mizuki', 'Yuki'], clergy: ['Kannushi', 'Miko', 'Shrine keeper'] }],
  ['taoist', /tao|dao/i, { male: ['Laozi', 'Zhuang', 'Ge', 'Tao', 'Wuji', 'Yang'], female: ['Xiwangmu', 'Yin', 'Lan', 'Qing', 'Ling', 'Mei'], clergy: ['Daoist priest', 'Hermit', 'Alchemist'] }],
  ['norse', /norse|asa|heathen|odin|germanic/i, { male: ['Bjorn', 'Ragnar', 'Sigurd', 'Leif', 'Ulf', 'Halfdan'], female: ['Freya', 'Astrid', 'Sigrid', 'Ingrid', 'Thyra', 'Gudrun'], clergy: ['Godi', 'Seer', 'Skald'] }],
];
export function faithFlavor(religion) {
  const text = String(religion || '');
  for (const [key, pattern, data] of FAITHS) if (pattern.test(text)) return { key, ...data };
  return null;
}

// Trades per category: [antiquity, exploration, modern].
const TRADES = {
  farm: [['Farmer', 'Field hand', 'Reaper', 'Shepherd'], ['Farmer', 'Tenant farmer', 'Plowman', 'Shepherd'], ['Farmer', 'Agronomist', 'Tractor driver', 'Farmhand']],
  plantation: [['Planter', 'Overseer', 'Picker'], ['Planter', 'Overseer', 'Picker', 'Trader'], ['Planter', 'Foreman', 'Picker', 'Agronomist']],
  pasture: [['Herdsman', 'Shepherd', 'Drover'], ['Herdsman', 'Shepherd', 'Drover', 'Dairymaid'], ['Rancher', 'Herdsman', 'Veterinarian']],
  camp: [['Hunter', 'Trapper', 'Skinner'], ['Hunter', 'Trapper', 'Furrier'], ['Guide', 'Hunter', 'Ranger']],
  mine: [['Miner', 'Smelter', 'Prospector'], ['Miner', 'Assayer', 'Smelter', 'Pit boy'], ['Miner', 'Foreman', 'Mining engineer', 'Blaster']],
  quarry: [['Quarryman', 'Stonecutter', 'Mason'], ['Quarryman', 'Stonecutter', 'Mason'], ['Quarryman', 'Driller', 'Crane operator']],
  wood: [['Woodcutter', 'Sawyer', 'Charcoal burner'], ['Woodcutter', 'Sawyer', 'Carpenter'], ['Lumberjack', 'Sawyer', 'Mill hand']],
  fishing: [['Fisherman', 'Net-maker', 'Boatwright'], ['Fisherman', 'Net-maker', 'Salter'], ['Fisherman', 'Deckhand', 'Cannery worker']],
  fort: [['Soldier', 'Sentry', 'Guardsman'], ['Soldier', 'Sentry', 'Gunner', 'Pikeman'], ['Soldier', 'Sergeant', 'Sentry']],
  shrine: [['Priest', 'Temple keeper', 'Acolyte'], ['Priest', 'Verger', 'Acolyte', 'Pilgrim'], ['Clergyman', 'Sexton', 'Chaplain']],
  hall: [['Scribe', 'Scholar', 'Archivist', 'Teacher'], ['Scholar', 'Clerk', 'Librarian', 'Notary'], ['Professor', 'Librarian', 'Clerk', 'Teacher']],
  court: [['Courtier', 'Steward', 'Servant', 'Herald'], ['Courtier', 'Chamberlain', 'Page', 'Herald'], ['Civil servant', 'Aide', 'Clerk']],
  market: [['Merchant', 'Trader', 'Stallkeeper', 'Moneychanger'], ['Merchant', 'Peddler', 'Banker', 'Stallkeeper'], ['Shopkeeper', 'Banker', 'Clerk', 'Salesman']],
  home: [['Laborer', 'Weaver', 'Servant', 'Potter'], ['Laborer', 'Weaver', 'Servant', 'Cobbler'], ['Factory hand', 'Clerk', 'Seamstress', 'Laborer']],
  granary: [['Granary keeper', 'Porter', 'Miller'], ['Granary keeper', 'Porter', 'Cooper'], ['Warehouseman', 'Porter', 'Teamster']],
  workshop: [['Smith', 'Potter', 'Tanner', 'Weaver'], ['Cooper', 'Weaver', 'Glassblower', 'Smith'], ['Machinist', 'Welder', 'Mechanic', 'Foreman']],
  harbor: [['Sailor', 'Stevedore', 'Shipwright'], ['Sailor', 'Stevedore', 'Pilot', 'Shipwright'], ['Dockworker', 'Harbor pilot', 'Sailor']],
  water: [['Water carrier', 'Well digger', 'Builder'], ['Water carrier', 'Pump keeper', 'Builder'], ['Plumber', 'Engineer', 'Pump operator']],
  leisure: [['Actor', 'Bath attendant', 'Musician', 'Gardener'], ['Musician', 'Actor', 'Gardener', 'Innkeeper'], ['Groundskeeper', 'Musician', 'Usher']],
  monument: [['Custodian', 'Stonemason', 'Caretaker'], ['Custodian', 'Stonemason', 'Guide'], ['Guide', 'Caretaker', 'Guard']],
  ruin: [['Antiquarian', 'Hermit', 'Treasure hunter'], ['Antiquarian', 'Hermit', 'Treasure hunter'], ['Archaeologist', 'Guide', 'Treasure hunter']],
  wonder: [['Master builder', 'Architect', 'Custodian'], ['Master builder', 'Architect', 'Custodian'], ['Architect', 'Engineer', 'Guide']],
  miller: [['Miller', 'Porter'], ['Miller', 'Baker', 'Porter'], ['Miller', 'Baker']],
  office: [['Clerk', 'Scribe'], ['Clerk', 'Notary'], ['Clerk', 'Accountant', 'Typist', 'Manager', 'Engineer']],
  generic: [['Laborer', 'Craftsman', 'Servant'], ['Laborer', 'Craftsman', 'Servant'], ['Laborer', 'Clerk', 'Technician']],
};
const SPECIALISTS = [['Scholar', 'Artisan', 'Philosopher', 'Engineer'], ['Scholar', 'Artisan', 'Navigator', 'Alchemist'], ['Researcher', 'Engineer', 'Technician', 'Artist']];
TRADES.specialist = SPECIALISTS;
const FEMALE_TITLE = { Priest: 'Priestess', Monk: 'Nun', Bishop: 'Abbess', Abbot: 'Abbess', Actor: 'Actress', Servant: 'Maid' };
export const OCCUPATION_UNLOCKS = [
  ['NODE_TECH_AQ_POTTERY', 'Ceramic painter', 'craft', ['workshop', 'market'], 'Paint Ceramics', ['industry', 'store'], 'culture'],
  ['NODE_TECH_AQ_IRRIGATION', 'Irrigation steward', 'farm', ['farm', 'water'], 'Maintain Irrigation Channels', ['industry', 'civic'], 'food'],
  ['NODE_TECH_AQ_WRITING', 'Copyist', 'learned', ['hall', 'office', 'shrine'], 'Copy Written Records', ['civic', 'sacred'], 'science'],
  ['NODE_TECH_AQ_BRONZE_WORKING', 'Bronze founder', 'craft', ['workshop', 'mine'], 'Cast Bronze Tools', ['industry'], 'production'],
  ['NODE_TECH_AQ_IRON_WORKING', 'Ironworker', 'craft', ['workshop', 'mine'], 'Forge Iron Tools', ['industry'], 'production'],
  ['NODE_TECH_AQ_MATHEMATICS', 'Land surveyor', 'learned', ['hall', 'wonder', 'farm'], 'Survey Property Boundaries', ['civic', 'central'], 'science'],
  ['NODE_CIVIC_AQ_MAIN_CODE_OF_LAWS', 'Legal advocate', 'learned', ['hall', 'court', 'office'], 'Hear a Legal Petition', ['civic', 'central'], 'influence'],
  ['NODE_CIVIC_AQ_MAIN_LITERACY', 'School tutor', 'learned', ['hall', 'home', 'specialist'], 'Teach Reading', ['civic', 'house'], 'science'],
  ['NODE_CIVIC_AQ_MAIN_SKILLED_TRADES', 'Guild artisan', 'craft', ['workshop', 'market'], 'Train an Apprentice', ['industry', 'store'], 'production'],
  ['NODE_TECH_EX_CARTOGRAPHY', 'Cartographer', 'learned', ['hall', 'harbor', 'specialist'], 'Draw Navigation Charts', ['civic', 'store'], 'science'],
  ['NODE_TECH_EX_ASTRONOMY', 'Astronomer', 'learned', ['hall', 'wonder', 'specialist'], 'Record Celestial Observations', ['civic', 'sacred'], 'science'],
  ['NODE_TECH_EX_GUILDS', 'Guildmaster', 'trade', ['workshop', 'market'], 'Organize Guild Orders', ['industry', 'store'], 'gold'],
  ['NODE_TECH_EX_EDUCATION', 'University lecturer', 'learned', ['hall', 'specialist'], 'Deliver a University Lecture', ['civic'], 'science'],
  ['NODE_TECH_EX_METAL_CASTING', 'Type founder', 'craft', ['workshop', 'office'], 'Cast Printing Type', ['industry'], 'production'],
  ['NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE', 'Diplomatic envoy', 'court', ['court', 'office'], 'Prepare Diplomatic Dispatches', ['civic', 'central'], 'influence'],
  ['NODE_CIVIC_EX_MAIN_BUREAUCRACY', 'Registrar', 'court', ['office', 'hall'], 'Maintain Civic Registers', ['civic'], 'influence'],
  ['NODE_TECH_MO_STEAM_ENGINE', 'Steam engineer', 'craft', ['workshop', 'miller', 'mine'], 'Service a Steam Engine', ['industry'], 'production'],
  ['NODE_TECH_MO_ELECTRICITY', 'Electrician', 'craft', ['workshop', 'office', 'home'], 'Maintain Electrical Wiring', ['industry', 'civic', 'house'], 'production'],
  ['NODE_TECH_MO_RADIO', 'Radio operator', 'learned', ['office', 'fort', 'harbor'], 'Transmit a Radio Message', ['civic', 'military'], 'influence'],
  ['NODE_TECH_MO_FLIGHT', 'Aircraft mechanic', 'craft', ['workshop', 'fort'], 'Service Aircraft Equipment', ['industry', 'military'], 'production'],
  ['NODE_TECH_MO_COMPUTATION', 'Computer technician', 'learned', ['office', 'hall', 'specialist'], 'Process Research Data', ['civic'], 'science'],
  ['NODE_CIVIC_MO_MAIN_NATURAL_HISTORY', 'Naturalist', 'learned', ['hall', 'ruin', 'specialist'], 'Catalogue Natural Specimens', ['civic'], 'science'],
  ['NODE_CIVIC_MO_MAIN_SOCIAL_QUESTION', 'Community organizer', 'court', ['hall', 'home', 'court'], 'Organize Community Relief', ['civic', 'house'], 'happiness'],
  ['NODE_CIVIC_MO_MAIN_CAPITALISM', 'Stockbroker', 'trade', ['office', 'market'], 'Arrange Investment Orders', ['store', 'civic'], 'gold'],
];
export const PEOPLE_PROGRESSION_NODES = OCCUPATION_UNLOCKS.map(row => row[0]);
export function unlockedOccupations(discoveries) {
  const known = new Set(discoveries || []);
  return OCCUPATION_UNLOCKS.filter(row => known.has(row[0]));
}

// Which category a building form belongs to; houses take the category of the icon they stand under.
const FORM_CATEGORY = {
  temple: 'shrine', ziggurat: 'shrine', pyramid: 'shrine', stupa: 'shrine', pagoda: 'shrine', dome: 'shrine', church: 'shrine', mound: 'shrine', shrine: 'shrine', stele: 'monument',
  hall: 'hall', palace: 'court', amphitheatre: 'leisure', theatre: 'leisure', ballcourt: 'leisure', bazaar: 'market', stall: 'market',
  tower: 'fort', castle: 'fort', barracks: 'fort', factory: 'workshop', warehouse: 'granary', granary: 'granary', windmill: 'miller', skyscraper: 'office',
};

const ERA_NAMES = [['Early Antiquity', 'Middle Antiquity', 'Late Antiquity'], ['Early Exploration', 'Middle Exploration', 'Late Exploration'], ['Early Modern', 'Middle Modern', 'Late Modern']];
export function eraLabel(age, lvl) { return (ERA_NAMES[Math.max(0, Math.min(2, age | 0))] || ERA_NAMES[0])[Math.max(0, Math.min(2, lvl | 0))]; }

const ANTIQUE_EPITHETS = ['the Elder', 'the Younger', 'the Tall', 'the Red', 'the Wise', 'the Swift', 'the Stout', 'the Fair'];
const MIDDLE_INITIALS = 'ABCDEFGHJKLMNPRSTW';

// ---- what is stored for a person -----------------------------------------------------------------------------------------------
// A person is four small ids: a first name and a last name from their civilization's lists (civNameLists), and two different
// personality traits from PERSONALITY_TRAITS. Their home is the Home Location (icon circle) and tile whose people they are
// listed under; their occupation comes from that home (homePlan). The full name is rebuilt from the ids, so a person never
// has to be stored as text. The order of these lists is part of the saved format: only append to them, and bump
// NAME_LISTS_VERSION if an existing entry ever moves.
export const NAME_LISTS_VERSION = 1;
export const PERSONALITY_TRAITS = [
  'Ambitious', 'Boastful', 'Brave', 'Calm', 'Cautious', 'Charming', 'Cheerful', 'Clumsy', 'Content', 'Curious', 'Devout', 'Diligent',
  'Dreamy', 'Frugal', 'Generous', 'Gentle', 'Gossipy', 'Gregarious', 'Honest', 'Hot-tempered', 'Humble', 'Idealistic', 'Impatient', 'Jealous',
  'Kind', 'Lazy', 'Loyal', 'Melancholic', 'Methodical', 'Mischievous', 'Modest', 'Patient', 'Practical', 'Proud', 'Quarrelsome', 'Quick-witted',
  'Reserved', 'Restless', 'Shrewd', 'Shy', 'Skeptical', 'Sly', 'Stubborn', 'Superstitious', 'Thrifty', 'Trusting', 'Witty', 'Zealous',
];
// How many names generated from the culture's sounds are baked into each civilization's lists after its hand-written ones.
const BAKED_GIVEN = 48, BAKED_FAMILY = 64;
const listCache = new Map();
function bake(count, existing, make) {
  const out = [], seen = new Set(existing);
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const name = make(i);
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}
// A civilization's name lists. `first` holds its hand-written male and female given names, then the baked generated ones,
// then every faith's given names (for people who follow the founded religion); `female[id]` says which first names are
// women's. `last` holds its hand-written family names, then the baked generated ones (for Iceland: fathers' names).
export function civNameLists(civKey) {
  const known = !!NAMES[civKey], culture = cultureOf(civKey), key = known ? civKey : `GENERIC:${culture}`;
  let lists = listCache.get(key);
  if (lists) return lists;
  const civ = known ? NAMES[civKey] : NAMES.GENERIC, seedKey = known ? civKey : key;
  const first = [], female = [], pools = { male: [[], []], female: [[], []] }, faith = {};
  const add = (name, isFemale, pool) => { pool.push(first.length); first.push(name); female.push(isFemale); };
  for (const name of civ.male) add(name, false, pools.male[0]);
  for (const name of civ.female) add(name, true, pools.female[0]);
  for (const name of bake(BAKED_GIVEN, civ.male, i => generatedGiven(culture, false, `${seedKey}|bake|m${i}`))) add(name, false, pools.male[1]);
  for (const name of bake(BAKED_GIVEN, civ.female, i => generatedGiven(culture, true, `${seedKey}|bake|f${i}`))) add(name, true, pools.female[1]);
  for (const [faithKey, , data] of FAITHS) {
    faith[faithKey] = { male: [], female: [] };
    for (const name of data.male) add(name, false, faith[faithKey].male);
    for (const name of data.female) add(name, true, faith[faithKey].female);
  }
  const last = [...civ.family, ...bake(BAKED_FAMILY, civ.family, i => generatedSurname(culture, `${seedKey}|bake|s${i}`))];
  lists = { key, culture, first, female, last, handFamily: civ.family.length, pools, faith };
  listCache.set(key, lists);
  return lists;
}

// opts: { civKey, religion, seed }. Returns { first, last, traits: [a, b] }, deterministic in the seed.
export function personRecord(opts) {
  const lists = civNameLists(opts.civKey), seed = opts.seed;
  const gender = hash(`${seed}|g`) % 2 === 1 ? 'female' : 'male';
  // About half of the names come from the hand-written lists and half from the baked generated ones.
  const civPools = lists.pools[gender], baked = hash(`${seed}|gg`) % 100 < 50 && civPools[1].length > 0;
  const pool = civPools[baked ? 1 : 0];
  const first = pool[hash(`${seed}|n`) % pool.length];
  const bakedFamilies = lists.last.length - lists.handFamily;
  const last = hash(`${seed}|gf`) % 100 < 50 && bakedFamilies > 0 ? lists.handFamily + hash(`${seed}|ln`) % bakedFamilies : hash(`${seed}|ln`) % lists.handFamily;
  const n = PERSONALITY_TRAITS.length, a = hash(`${seed}|t1`) % n, b = (a + 1 + hash(`${seed}|t2`) % (n - 1)) % n;
  return { first, last, traits: [a, b] };
}

// The full name written for a stored person: the civilization's naming order and typical forms (patronymics, Roman
// three-part names, "de" names...) and the age's by-names, all worked out from the ids alone.
export function personName(civKey, record, age) {
  const lists = civNameLists(civKey);
  const given = lists.first[record.first] || lists.first[0], family = lists.last[record.last] || lists.last[0];
  const female = !!lists.female[record.first], seed = `${lists.key}|${record.first}|${record.last}`;
  const era = Math.max(0, Math.min(2, age | 0)), familyFirst = FAMILY_FIRST.has(civKey);
  let name;
  if (civKey === 'ICELAND') name = `${given} ${family}${female ? 'sdottir' : 'sson'}`;
  else if (familyFirst) name = `${family} ${given}`;
  else name = fullNameStyle(lists.culture, civKey, given, family, female, seed) || `${given} ${family}`;
  // The age shapes by-names: epithets in antiquity, middle initials in the modern age.
  const flair = hash(`${seed}|e`) % 100;
  if (era === 0 && flair < 22) name += ` ${ANTIQUE_EPITHETS[hash(`${seed}|ep`) % ANTIQUE_EPITHETS.length]}`;
  else if (era === 2 && flair < 45 && !familyFirst) name = name.replace(' ', ` ${MIDDLE_INITIALS[hash(`${seed}|i`) % MIDDLE_INITIALS.length]}. `);
  return name;
}
export function personGender(civKey, record) { return civNameLists(civKey).female[record.first] ? 'female' : 'male'; }
export function personTraits(record) { return record.traits.map(id => PERSONALITY_TRAITS[id] || '').filter(Boolean); }

// ---- occupations --------------------------------------------------------------------------------------------------------------
function unitOptions(o) {
  const sub = o.unit.sub, base = o.unit.base || 'Soldier';
  if (o.form === 'command') return ['Officer', 'Captain', 'Standard-bearer', 'Aide'];
  if (o.form === 'wagon') return ['Quartermaster', 'Teamster', 'Camp follower', 'Cook'];
  if (sub === 'settler') return ['Colonist', 'Settler', 'Pioneer'];
  if (sub === 'builder') return ['Laborer', 'Builder', 'Digger'];
  if (sub === 'merchant') return ['Trader', 'Caravan guard', 'Drover'];
  if (sub === 'scout') return ['Scout', 'Pathfinder', 'Tracker'];
  if (sub === 'commander') return ['Aide', 'Adjutant', 'Herald'];
  if (sub === 'naval') return ['Sailor', 'Marine', 'Helmsman', 'Gunner'];
  if (sub === 'air') return ['Airman', 'Mechanic', 'Pilot'];
  if (sub === 'siege') return ['Engineer', 'Gunner', 'Sapper', base];
  if (sub === 'cavalry') return ['Rider', 'Trooper', base];
  return [base, base, 'Soldier', 'Sentry'];
}
// The occupations open to the people of a home, as [title, share] pairs whose shares add up to 1.
// opts: { religion, age, category, form, unit: { sub, base } | null }
export function landMilitaryUnit(unit) {
  return !!unit && ['infantry', 'ranged', 'cavalry', 'siege', 'armor', 'commander', 'scout'].includes(unit.sub);
}
export function occupationYieldIndex(title) {
  const patterns = [
    /farmer|farmhand|field hand|reaper|shepherd|herdsman|rancher|planter|picker|fisherman|hunter|miller|baker|agronomist|plowman|granary/i,
    /artisan|craftsman|smith|weaver|potter|tanner|cooper|glassblower|machinist|welder|mechanic|miner|mason|stonecutter|quarry|woodcutter|sawyer|carpenter|lumberjack|factory|engineer|builder|laborer/i,
    /merchant|trader|peddler|banker|stallkeeper|moneychanger|shopkeeper|salesman|accountant/i,
    /scholar|researcher|professor|teacher|scientist|alchemist|librarian|philosopher|technician/i,
    /artist|musician|actor|sculptor|poet|archivist|antiquarian|archaeologist/i,
    /entertainer|bath attendant|gardener|groundskeeper|usher|innkeeper|clergyman|priest|priestess|acolyte|chaplain|temple keeper/i,
    /diplomat|courtier|herald|civil servant|steward|chamberlain|notary|scribe|clerk|aide/i,
  ];
  return patterns.findIndex(pattern => pattern.test(title));
}
export function occupationOptions(opts) {
  const age = Math.max(0, Math.min(2, opts.age | 0)), flavor = faithFlavor(opts.religion);
  const shares = new Map(), add = (title, share) => shares.set(title, (shares.get(title) || 0) + share);
  if (opts.unit) {
    const list = unitOptions(opts);
    const runners = landMilitaryUnit(opts.unit);
    for (const title of list) add(title, (runners ? 0.92 : 1) / list.length);
    if (runners) { add('Supply runner', 0.04); add('Message runner', 0.04); }
  } else {
    const category = FORM_CATEGORY[opts.form] || opts.category || 'generic';
    const table = TRADES[category] || TRADES.generic, trades = table[age] || table[0], specialists = SPECIALISTS[age];
    const clergy = flavor && flavor.clergy ? flavor.clergy : null;
    if (category === 'shrine' && clergy) for (const title of clergy) add(title, 1 / clergy.length);
    else {
      for (const title of trades) {
        if (title === 'Priest' && clergy) for (const c of clergy) add(c, 0.82 / trades.length / clergy.length);
        else add(title, 0.82 / trades.length);
      }
      for (const title of specialists) add(title, 0.18 / specialists.length);
    }
  }
  const category = FORM_CATEGORY[opts.form] || opts.category || 'generic';
  const unlocked = unlockedOccupations(opts.discoveries).filter(row => opts.unit
    ? ['commander', 'siege', 'air', 'naval'].includes(opts.unit.sub) && row[3].includes(opts.unit.sub === 'naval' ? 'harbor' : opts.unit.sub === 'commander' ? 'office' : 'fort')
    : row[3].includes(category));
  if (unlocked.length) {
    for (const [title, share] of shares) shares.set(title, share * 0.7);
    for (const row of unlocked) add(row[1], 0.3 / unlocked.length);
  }
  if (!opts.unit && Array.isArray(opts.yields)) {
    const representatives = ['Farmer', 'Artisan', 'Trader', 'Scholar', 'Artist', 'Entertainer', 'Diplomat'];
    representatives.forEach(title => { if (!shares.has(title)) add(title, 0.01); });
    for (const [title, share] of shares) {
      const index = occupationYieldIndex(title), value = opts.yields[index];
      if (index >= 0 && Number.isFinite(value)) shares.set(title, share * (value >= 0 ? 1 + value / 10 : 1 / (1 - value / 10)));
    }
    const total = [...shares.values()].reduce((sum, share) => sum + share, 0);
    for (const [title, share] of shares) shares.set(title, share / total);
  }
  return [...shares];
}
// An occupation's name for a man or a woman, and the name a group of them is listed under ("Priest / Priestess").
export function genderedOccupation(title, gender) { return gender === 'female' && FEMALE_TITLE[title] ? FEMALE_TITLE[title] : title; }
export function occupationGroupLabel(title) { return FEMALE_TITLE[title] ? `${title} / ${FEMALE_TITLE[title]}` : title; }

const MAX_HOME_POPULATION = 0x7fffffff;
// Integer mixing hash for the per-block numbers (string hashing per block would be too slow when sorting big homes).
function mix(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) + Math.imul(b | 0, 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return h >>> 0;
}
const PLAN_BLOCK = 1024, PLAN_INVERSE = new Map();
// How the `population` people of a home divide into occupations, kept steady from turn to turn.
// People are taken in blocks of PLAN_BLOCK by index. Within every block the occupations take fixed runs of places whose
// lengths follow the home's shares, and a per-block shuffle (an odd affine map mod PLAN_BLOCK) puts each person on a place.
// A person's occupation therefore depends only on their own index, never on the home's size, so a growing city keeps its
// people in their trades. Each turn every block's runs turn by a step or two (`opts.turn`), so about one person in a
// hundred takes up a different trade each turn. The slots list people by occupation (alphabetical), then by block, then by
// place, so sorting or grouping a home of millions is just arithmetic.
// Returns { total, groups: [{ title, start, count }], slotOf(index), personAt(slot), groupOf(index), occupationOf(index) }.
export function homePlan(opts, seed, population) {
  const total = Math.max(0, Math.min(MAX_HOME_POPULATION, Math.floor(Number(population) || 0)));
  const turn = Math.max(0, Math.floor(Number(opts.turn) || 0));
  const options = occupationOptions(opts);
  // Each home leans its own way (more reapers here, more shepherds there) around the usual shares.
  const weights = options.map(([title, share]) => share * (0.6 + 0.8 * (hash(`${seed}|w|${title}`) % 1000) / 1000));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const Q = PLAN_BLOCK, exact = weights.map(w => w / sum * Q), runLen = exact.map(Math.floor);
  let left = Q - runLen.reduce((a, b) => a + b, 0);
  const order = exact.map((x, k) => [x - runLen[k], k]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) runLen[order[k][1]]++;
  // Option k holds places [runStart[k], runStart[k] + runLen[k]) of every block; placeOption maps a place to its option.
  const runStart = [], placeOption = new Int32Array(Q);
  let at = 0;
  options.forEach((_, k) => { runStart[k] = at; for (let n = 0; n < runLen[k]; n++) placeOption[at + n] = k; at += runLen[k]; });
  const base = hash(`${seed}|plan`);
  const A = 1 + 2 * (hash(`${seed}|pa`) % (Q / 2));
  if (!PLAN_INVERSE.has(A)) { let inv = 1; while ((A * inv) % Q !== 1) inv += 2; PLAN_INVERSE.set(A, inv); }
  const Ainv = PLAN_INVERSE.get(A);
  const offset = b => { const h = mix(base, b); return (h % Q + Math.floor(turn * ((h >>> 12) % 200) / 100)) % Q; };
  const placeOf = (b, l) => (A * l + offset(b)) % Q;
  const full = Math.floor(total / Q), rest = total - full * Q;
  // The last, partly filled block: who of its people holds each option, in place order.
  const restMembers = options.map(() => []), restRank = new Int32Array(rest);
  if (rest) {
    const c = offset(full), byPlace = [];
    for (let l = 0; l < rest; l++) byPlace.push([(A * l + c) % Q, l]);
    byPlace.sort((x, y) => x[0] - y[0]);
    for (const [p, l] of byPlace) { const k = placeOption[p]; restRank[l] = restMembers[k].length; restMembers[k].push(l); }
  }
  const groups = options.map(([title], k) => ({ title, option: k, count: full * runLen[k] + restMembers[k].length })).filter(g => g.count > 0)
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
  const groupOfOption = new Int32Array(options.length).fill(-1);
  let start = 0;
  groups.forEach((g, n) => { g.start = start; start += g.count; groupOfOption[g.option] = n; });
  const valid = i => Number.isInteger(i) && i >= 0 && i < total;
  const groupOf = i => (valid(i) ? groupOfOption[placeOption[placeOf(Math.floor(i / Q), i % Q)]] : -1);
  const slotOf = i => {
    if (!valid(i)) return -1;
    const b = Math.floor(i / Q), l = i % Q, p = placeOf(b, l), k = placeOption[p], g = groups[groupOfOption[k]];
    return b < full ? g.start + b * runLen[k] + (p - runStart[k]) : g.start + full * runLen[k] + restRank[l];
  };
  const groupAtSlot = slot => {
    let lo = 0, hi = groups.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (groups[mid].start <= slot) lo = mid; else hi = mid - 1; }
    return groups.length ? lo : -1;
  };
  const personAt = slot => {
    if (!valid(slot)) return -1;
    const g = groups[groupAtSlot(slot)], k = g.option, off = slot - g.start, inFull = full * runLen[k];
    if (off >= inFull) return full * Q + restMembers[k][off - inFull];
    const b = Math.floor(off / runLen[k]), p = runStart[k] + off % runLen[k];
    return b * Q + (((p - offset(b)) % Q + Q) % Q) * Ainv % Q;
  };
  const occupationOf = i => { const g = groupOf(i); return g >= 0 ? groups[g].title : ''; };
  return { total, groups, slotOf, personAt, groupOf, occupationOf };
}
function weightedPick(options, roll) {
  let x = (roll % 100000) / 100000;
  for (const [title, share] of options) { if (x < share) return title; x -= share; }
  return options.length ? options[options.length - 1][0] : 'Laborer';
}

// opts: { civKey, religion, age, lvl, seed, category, form, unit: { sub, base } | null, record?, plan?, index? }
// `record` is a stored person (else one is made from the seed); with a home's `plan` and the person's `index` in it, the
// occupation is the one the plan gives them. Returns { name, occupation, gender, faith, traits, record }.
export function personProfile(opts) {
  const record = opts.record || personRecord(opts);
  const gender = personGender(opts.civKey, record);
  const name = personName(opts.civKey, record, opts.age);
  const title = opts.plan && opts.index != null ? opts.plan.occupationOf(opts.index) : '';
  const occupation = genderedOccupation(title || weightedPick(occupationOptions(opts), hash(`${opts.seed}|s`)), gender);
  return { name, occupation, gender, faith: opts.religion || '', traits: personTraits(record), record };
}

// ---- leadership roles ----------------------------------------------------------------------------------------------------------
// The first few people of some homes lead: the royal family at a palace, the governor and deputy of a settlement's urban
// centre (its specialists' home), a commander with their scribe and aide, and the officer of a military unit (a centurion and
// optio in Rome's). opts: { home: 'palace' | 'center' | 'unit', unit: { sub } | null, civKey, index, gender, age: 0 | 1 | 2,
// ageCategory }. Returns the role's title ('' for everyone else).
const ROYAL = [['King', 'Queen'], ['Prince Consort', 'Queen Consort'], ['Crown Prince', 'Crown Princess'], ['Prince', 'Princess'], ['Prince', 'Princess']];
const CIVILIAN_UNITS = new Set(['settler', 'builder', 'merchant', 'scout', 'religious', 'civilian', 'great']);
export const LEADERS_PER_HOME = { palace: 5, center: 2, commander: 3, military: 2 };
export function leaderRole(opts) {
  const index = opts.index | 0, female = opts.gender === 'female' ? 1 : 0;
  if (index < 0 || opts.ageCategory === 'Child' && index !== 2) return '';
  if (opts.home === 'palace') return index < LEADERS_PER_HOME.palace ? ROYAL[index][female] : '';
  if (opts.ageCategory === 'Child') return '';
  if (opts.home === 'center') return ['Governor', 'Deputy Governor'][index] || '';
  if (opts.home !== 'unit' || !opts.unit) return '';
  const sub = opts.unit.sub || '';
  if (sub === 'commander') return ['Commander', "Commander's Scribe", "Commander's Aide"][index] || '';
  if (CIVILIAN_UNITS.has(sub)) return '';
  const rome = /ROM/.test(String(opts.civKey || '').toUpperCase());
  if (sub === 'naval') return ['Ship\'s Captain', 'First Mate'][index] || '';
  if (rome) return ['Centurion', 'Optio'][index] || '';
  return ['Captain', 'Sergeant'][index] || '';
}
// The work family a leader acts in (see workFamily): the court for royals and governors, the learned for a scribe, soldiers for
// officers.
export function leaderFamily(role) {
  if (/Scribe/.test(role)) return 'learned';
  if (/Commander|Captain|Mate|Centurion|Optio|Sergeant/.test(role)) return 'soldier';
  return 'court';
}

// ---- what a walking person is doing ------------------------------------------------------------------------------------------
// Occupations grouped by the kind of work they do; anything not listed (a faith's own clergy titles, unit names) is matched
// by WORK_HINTS or falls back to 'town'.
const WORK_FAMILIES = {
  grounds: ['Custodian', 'Caretaker', 'Gardener', 'Groundskeeper', 'Temple keeper', 'Sexton', 'Verger', 'Bath attendant'],
  farm: ['Farmer', 'Field hand', 'Reaper', 'Tenant farmer', 'Plowman', 'Agronomist', 'Tractor driver', 'Farmhand', 'Planter', 'Overseer', 'Picker', 'Miller', 'Granary keeper'],
  herd: ['Shepherd', 'Herdsman', 'Drover', 'Dairymaid', 'Rancher', 'Veterinarian'],
  hunt: ['Hunter', 'Trapper', 'Skinner', 'Furrier', 'Ranger', 'Scout', 'Pathfinder', 'Tracker'],
  wood: ['Woodcutter', 'Sawyer', 'Charcoal burner', 'Lumberjack', 'Mill hand', 'Carpenter'],
  stone: ['Miner', 'Smelter', 'Prospector', 'Assayer', 'Pit boy', 'Mining engineer', 'Blaster', 'Quarryman', 'Stonecutter', 'Mason', 'Stonemason', 'Driller', 'Crane operator'],
  water: ['Fisherman', 'Net-maker', 'Boatwright', 'Salter', 'Deckhand', 'Cannery worker', 'Sailor', 'Stevedore', 'Shipwright', 'Pilot', 'Dockworker', 'Harbor pilot', 'Water carrier', 'Well digger', 'Pump keeper', 'Plumber', 'Pump operator', 'Helmsman', 'Marine'],
  soldier: ['Soldier', 'Sentry', 'Guardsman', 'Gunner', 'Pikeman', 'Sergeant', 'Guard', 'Officer', 'Captain', 'Standard-bearer', 'Rider', 'Trooper', 'Sapper', 'Caravan guard', 'Airman', 'Supply runner', 'Message runner'],
  clergy: ['Priest', 'Acolyte', 'Pilgrim', 'Clergyman', 'Chaplain', 'Monk', 'Bishop', 'Abbot'],
  learned: ['Scribe', 'Scholar', 'Archivist', 'Teacher', 'Clerk', 'Librarian', 'Notary', 'Professor', 'Researcher', 'Philosopher', 'Alchemist', 'Accountant', 'Typist', 'Manager', 'Navigator', 'Antiquarian', 'Archaeologist', 'Engineer', 'Architect', 'Master builder'],
  court: ['Courtier', 'Steward', 'Servant', 'Herald', 'Chamberlain', 'Page', 'Civil servant', 'Aide', 'Adjutant', 'Quartermaster'],
  trade: ['Merchant', 'Trader', 'Stallkeeper', 'Moneychanger', 'Peddler', 'Banker', 'Shopkeeper', 'Salesman', 'Innkeeper', 'Teamster', 'Camp follower', 'Cook', 'Baker'],
  craft: ['Smith', 'Potter', 'Tanner', 'Weaver', 'Cooper', 'Glassblower', 'Machinist', 'Welder', 'Mechanic', 'Cobbler', 'Seamstress', 'Craftsman', 'Artisan', 'Technician', 'Foreman'],
  arts: ['Actor', 'Musician', 'Usher', 'Artist', 'Guide', 'Hermit', 'Treasure hunter'],
};
const WORK_HINTS = [[/priest|monk|nun|abb|imam|rabbi|lama|shaman|druid|oracle|cleric|bishop|friar|deacon/i, 'clergy'], [/guard|soldier|warrior|archer|spear|sword|knight|infantry|rifle|musket|cavalry|lancer|chariot|slinger|legion|hoplite|tank|artillery/i, 'soldier'], [/settler|colonist|pioneer|builder|laborer|digger|porter|factory|warehouse/i, 'labor']];
const FAMILY_BY_TITLE = new Map();
for (const [family, titles] of Object.entries(WORK_FAMILIES)) for (const title of titles) FAMILY_BY_TITLE.set(title, family);
const MALE_TITLE = new Map(Object.entries(FEMALE_TITLE).map(([male, female]) => [female, male]));
export function workFamily(occupation) {
  const title = MALE_TITLE.get(occupation) || occupation || '';
  const unlocked = OCCUPATION_UNLOCKS.find(row => row[1] === title);
  if (unlocked) return unlocked[2];
  if (FAMILY_BY_TITLE.has(title)) return FAMILY_BY_TITLE.get(title);
  for (const [pattern, family] of WORK_HINTS) if (pattern.test(title)) return family;
  return 'town';
}
const WORK_CATEGORIES = {
  grounds: ['leisure', 'monument', 'shrine'], farm: ['farm', 'plantation', 'miller', 'granary'],
  herd: ['pasture', 'farm'], hunt: ['camp', 'hunting', 'fort'], wood: ['wood', 'lumber', 'workshop'],
  stone: ['mine', 'quarry', 'workshop'], water: ['harbor', 'fishing', 'water'],
  soldier: ['fort'], clergy: ['shrine'], learned: ['hall', 'office', 'wonder'],
  court: ['court', 'office'], trade: ['market', 'granary', 'harbor'],
  craft: ['workshop', 'miller'], arts: ['leisure', 'monument', 'wonder', 'ruin'],
  labor: ['workshop', 'granary', 'farm'], town: ['home', 'generic'],
};
export function workplaceScore(family, category, form = '', group = '') {
  const classes = { sacred: 'shrine', industry: 'workshop', store: 'market', military: 'fort', tents: 'fort', civic: 'hall', house: 'home' };
  const kind = FORM_CATEGORY[form] || classes[group] || category || 'generic';
  const at = (WORK_CATEGORIES[family] || WORK_CATEGORIES.town).indexOf(kind);
  return at >= 0 ? 100 - at * 5 : kind === 'home' || kind === 'generic' ? 1 : 0;
}
// Action wordings: a string, or [antiquity, exploration, modern] for one that changes with the age. {place} is the destination's
// name and {their} the person's pronoun.
const ERRANDS = {
  grounds: ['Tending to Grounds', 'Buying Supplies', 'Sweeping the Steps', ['Fetching Lamp Oil', 'Fetching Candles', 'Changing the Lightbulbs']],
  farm: ['Carrying Grain', 'Mending Tools', 'Selling Produce', ['Fetching a Plow Ox', 'Buying Seed', 'Buying Fertilizer']],
  herd: ['Selling Wool', 'Buying Salt for the Herd', 'Taking Milk to Market'],
  hunt: ['Selling Furs', 'Trading Pelts', ['Sharpening Spears', 'Buying Powder and Shot', 'Buying Cartridges']],
  wood: ['Hauling Timber', 'Sharpening Axes', 'Delivering Firewood'],
  stone: [['Hauling Ore', 'Hauling Ore', 'Delivering Ore'], 'Dressing Stone', ['Fetching Lamp Oil', 'Fetching Lamp Oil', 'Checking the Blasting Caps']],
  water: ['Mending Nets', 'Selling the Catch', 'Carrying Water', ['Caulking a Hull', 'Caulking a Hull', 'Repairing the Engine']],
  soldier: ['On Patrol', 'Standing Watch', ['Polishing Armor', 'Cleaning a Musket', 'Cleaning a Rifle'], 'Reporting for Duty'],
  clergy: ['Leading Prayers', 'Visiting the Sick', 'Collecting Alms', 'Preparing a Ceremony'],
  learned: [['Copying Scrolls', 'Copying Manuscripts', 'Filing Reports'], 'Delivering Letters', 'Teaching a Lesson', 'Consulting the Archives'],
  court: ['Carrying a Message', 'Running an Errand', 'Buying Supplies', 'Announcing a Decree'],
  trade: ['Haggling over Prices', 'Counting Coins', 'Delivering Goods', 'Buying Supplies', 'Restocking the Stall'],
  craft: ['Buying Supplies', 'Delivering an Order', 'Fetching Tools', ['Buying Clay', 'Buying Leather', 'Ordering Parts']],
  arts: ['Rehearsing', 'Busking for Coins', 'Looking for an Audience'],
  labor: ['Carrying Goods', 'Looking for Work', 'Buying Supplies', 'Hauling Bricks'],
  town: ['Running Errands', 'Buying Supplies', 'Visiting the Market'],
};
const SOCIAL = ['Visiting {their} Family', 'Chatting with Neighbors', 'Taking a Stroll', ['Going to the Baths', 'Going to the Tavern', 'Going to the Cafe'], 'Meeting {their} Friends'];
const SPOT_ACTIONS = {
  tree: {
    grounds: ['Tending to Grounds', 'Pruning Trees'], wood: ['Felling Timber', 'Marking Trees for Felling'], hunt: ['Tracking Game', 'Setting Snares'],
    farm: ['Gathering Firewood'], herd: ['Grazing the Flock in the Shade'], soldier: ['Scouting the Treeline'], clergy: ['Meditating Among the Trees'],
    any: ['Gathering Firewood', 'Foraging for Berries', 'Resting in the Shade', 'Collecting Kindling'],
  },
  river: {
    water: ['Fishing', 'Mending Nets by the River'], grounds: ['Clearing the Riverbank'], herd: ['Watering the Herd'], farm: ['Watering the Fields', 'Digging an Irrigation Ditch'],
    clergy: ['Blessing the Waters'], soldier: ['Guarding the Ford'],
    any: ['Fetching Water', 'Washing Clothes', 'Fishing', ['Bathing in the River', 'Watching the Boats', 'Strolling Along the River']],
  },
  resource: {
    stone: ['Mining {place}', 'Surveying the {place}'], farm: ['Harvesting {place}'], herd: ['Tending the {place}'], hunt: ['Hunting {place}'], trade: ['Buying {place}', 'Inspecting the {place}'],
    any: ['Gathering {place}', 'Inspecting the {place}'],
  },
  field: {
    farm: ['Working the Fields', 'Harvesting the Crop', ['Sowing Seeds', 'Sowing Seeds', 'Driving the Tractor']], herd: ['Herding the Flock', 'Mending Fences'],
    stone: ['Working the {place}'], wood: ['Working the {place}'], grounds: ['Tending to Grounds'], trade: ['Buying Produce at the {place}'],
    any: ['Bringing Lunch to the Fields', 'Working at the {place}', 'Helping with the Harvest'],
  },
  feature: {
    herd: ['Grazing the Flock'], hunt: ['Tracking Game'], clergy: ['Praying in the Wilds'],
    any: ['Gathering Reeds', 'Picking Flowers', 'Foraging', 'Taking in the View'],
  },
};
const pickWording = (list, age, seed) => {
  const entry = list[hash(seed) % list.length];
  return Array.isArray(entry) ? entry[Math.max(0, Math.min(entry.length - 1, age | 0))] : entry;
};
// What a walking person is doing, as a short title-case phrase.
// opts: { occupation, gender: 'female' | 'male', age: 0 | 1 | 2, purpose, place, seed }, purpose being one of:
//   'home' (walking to their own door), 'travel' (to another townscape or out along a road; place is where to), 'errand'
//   (to another door of their own townscape), 'stroll' (to a street corner), or a spot: 'tree', 'river', 'resource' (place
//   is the resource), 'field' (place is the improvement) or 'feature'.
export function walkerAction(opts) {
  const age = Math.max(0, Math.min(2, opts.age | 0)), seed = `${opts.seed}|act`, family = workFamily(opts.occupation);
  const place = String(opts.place || '').trim();
  let text;
  if (opts.purpose === 'home') text = 'Heading Home';
  else if (opts.purpose === 'work') text = place ? `Heading to Work at ${place}` : 'Heading to Work';
  else if (opts.purpose === 'travel') text = place ? `Traveling to ${place}` : 'Traveling';
  else if (SPOT_ACTIONS[opts.purpose]) {
    const table = SPOT_ACTIONS[opts.purpose], own = table[family];
    // Most people at a spot do their own trade's work there; the rest do something anyone might.
    const list = own && hash(`${seed}|own`) % 100 < 70 ? own : table.any;
    text = pickWording(list, age, seed);
    if (text.includes('{place}') && !place) text = pickWording(table.any.filter(t => !String(t).includes('{place}')).concat(['Foraging']), age, seed);
  } else if (opts.purpose === 'stroll') text = pickWording(SOCIAL, age, seed);
  else text = hash(`${seed}|soc`) % 100 < 22 ? pickWording(SOCIAL, age, seed) : pickWording(ERRANDS[family] || ERRANDS.town, age, seed);
  return text.replace(/\{place\}/g, place).replace(/\{their\}/g, opts.gender === 'female' ? 'Her' : 'His');
}
