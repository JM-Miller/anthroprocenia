// Names for the lines and features drawn on the townscapes (streets, main streets, roads, creeks and buildings) and for the
// map's rivers, mountains and forests while townscapes show. Each culture family writes them its own way ("Via Lucia",
// "Rue de Varennes", "Mill Street", "Nahr Rashid"...) around a name made by the shared name generator (or a name the game or
// geography module already gave), and townscape names reuse their Home Location's name so a town's streets belong to it.
// Everything is deterministic in the seed.

import { cultureOf, generatedPlace, generatedSurname } from './anthroprocenia-namegen.js';

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];

// {n}: a name. Each kind lists a few patterns; every culture not listed uses the generic (English-styled) words.
const W = {
  generic: { street: ['{n} Street', '{n} Lane', '{n} Row', '{n} Way'], main: ['{n} High Street', 'Great {n} Street', '{n} Avenue'], road: ['{n} Road', 'Old {n} Road'], creek: ['{n} Creek', '{n} Brook', '{n} Run'], river: ['{n} River', 'River {n}'], mountain: ['Mount {n}', '{n} Peaks', '{n} Range'], forest: ['{n} Wood', '{n} Forest'] },
  latin: { street: ['Via {n}', 'Vicus {n}', 'Clivus {n}'], main: ['Via Magna {n}', 'Decumanus {n}', 'Cardo {n}'], road: ['Via {n}', 'Iter {n}'], creek: ['Rivus {n}', 'Fons {n}'], river: ['Flumen {n}', '{n}'], mountain: ['Mons {n}', 'Montes {n}'], forest: ['Silva {n}', 'Lucus {n}'] },
  greek: { street: ['Odos {n}', 'Stoa {n}'], main: ['Plateia {n}', 'Megali Odos {n}'], road: ['Odos {n}', 'Hodos {n}'], creek: ['Rheithron {n}', 'Krene {n}'], river: ['Potamos {n}', '{n}'], mountain: ['Oros {n}', 'Ore {n}'], forest: ['Drymos {n}', 'Alsos {n}'] },
  egyptian: { street: ['Way of {n}', 'Lane of {n}'], main: ['Avenue of {n}', 'Processional Way of {n}'], road: ['Road of {n}'], creek: ['Canal of {n}', 'Channel of {n}'], river: ['Iteru {n}', 'Waters of {n}'], mountain: ['Djew {n}', 'Heights of {n}'], forest: ['Grove of {n}', 'Palms of {n}'] },
  persian: { street: ['Kucheh-ye {n}', 'Rah-e {n}'], main: ['Khiyaban-e {n}', 'Bazar-e {n}'], road: ['Rah-e {n}', 'Jaddeh-ye {n}'], creek: ['Juy-e {n}', 'Qanat-e {n}'], river: ['Rud-e {n}', '{n} Rud'], mountain: ['Kuh-e {n}', 'Kuhha-ye {n}'], forest: ['Jangal-e {n}', 'Bagh-e {n}'] },
  arabic: { street: ['Darb {n}', 'Zuqaq {n}', 'Shari {n}'], main: ['Shari al-Kabir {n}', 'Suq {n}'], road: ['Tariq {n}', 'Darb {n}'], creek: ['Wadi {n}', 'Falaj {n}'], river: ['Nahr {n}', 'Wadi {n}'], mountain: ['Jabal {n}', 'Jibal {n}'], forest: ['Ghaba {n}', 'Bustan {n}'] },
  mesopotamian: { street: ['Suqu {n}', 'Street of {n}'], main: ['Processional Way of {n}', 'Great Street of {n}'], road: ['Harranu {n}', 'Road of {n}'], creek: ['Canal {n}', 'Palgu {n}'], river: ['Naru {n}', 'River {n}'], mountain: ['Shadu {n}', 'Mount {n}'], forest: ['Qishtu {n}', 'Cedars of {n}'] },
  celtic: { street: ['Stryd {n}', 'Lon {n}'], main: ['Stryd Fawr {n}', 'Heol {n}'], road: ['Ffordd {n}', 'Bothar {n}'], creek: ['Nant {n}', 'Allt {n}'], river: ['Afon {n}', 'Abhainn {n}'], mountain: ['Ben {n}', 'Mynydd {n}'], forest: ['Coed {n}', 'Coill {n}'] },
  sinitic: { street: ['{n} Hutong', '{n} Xiang', '{n} Jie'], main: ['{n} Da Jie', '{n} Lu'], road: ['{n} Dao', '{n} Lu'], creek: ['{n} Xi', '{n} Qu'], river: ['{n} He', '{n} Jiang'], mountain: ['{n} Shan', '{n} Ling'], forest: ['{n} Lin', '{n} Senlin'] },
  korean: { street: ['{n}-gil', '{n}-golmok'], main: ['{n}-daero', '{n}-ro'], road: ['{n}-ro', '{n}-gil'], creek: ['{n}-cheon', '{n}-gaeul'], river: ['{n}-gang', '{n}-cheon'], mountain: ['{n}-san', '{n}-bong'], forest: ['{n}-sup', '{n}-rim'] },
  japanese: { street: ['{n}-dori', '{n}-michi', '{n}-koji'], main: ['{n}-odori', '{n}-kaido'], road: ['{n}-kaido', '{n}-michi'], creek: ['{n}-zawa', '{n}-gawa'], river: ['{n}-gawa', '{n}-kawa'], mountain: ['{n}-yama', '{n}-dake'], forest: ['{n}-mori', '{n}-bayashi'] },
  indic: { street: ['{n} Gali', '{n} Marg'], main: ['{n} Rajpath', '{n} Chowk'], road: ['{n} Path', '{n} Marg'], creek: ['{n} Nala', '{n} Nadi'], river: ['{n} Nadi', '{n}'], mountain: ['{n} Parvat', '{n} Giri'], forest: ['{n} Van', '{n} Aranya'] },
  tai: { street: ['Soi {n}', 'Trok {n}'], main: ['Thanon {n}', 'Thanon Luang {n}'], road: ['Thanon {n}', 'Thang {n}'], creek: ['Khlong {n}', 'Huai {n}'], river: ['Mae Nam {n}', 'Nam {n}'], mountain: ['Doi {n}', 'Khao {n}'], forest: ['Pa {n}', 'Dong {n}'] },
  viet: { street: ['Ngo {n}', 'Pho {n}'], main: ['Duong {n}', 'Dai Lo {n}'], road: ['Duong {n}', 'Quoc Lo {n}'], creek: ['Rach {n}', 'Suoi {n}'], river: ['Song {n}', 'Song {n}'], mountain: ['Nui {n}', 'Day {n}'], forest: ['Rung {n}', 'Lam {n}'] },
  austronesian: { street: ['Jalan {n}', 'Gang {n}'], main: ['Jalan Raya {n}', 'Jalan Besar {n}'], road: ['Jalan {n}', 'Lebuh {n}'], creek: ['Kali {n}', 'Sungai Kecil {n}'], river: ['Sungai {n}', 'Kali {n}'], mountain: ['Gunung {n}', 'Bukit {n}'], forest: ['Hutan {n}', 'Rimba {n}'] },
  polynesian: { street: ['Ala {n}', 'Ara {n}'], main: ['Ala Nui {n}', 'Huarahi {n}'], road: ['Ala {n}', 'Ara {n}'], creek: ['Kahawai {n}', 'Awa Iti {n}'], river: ['Wai {n}', 'Awa {n}'], mountain: ['Mauna {n}', 'Maunga {n}'], forest: ['Ngahere {n}', 'Nahele {n}'] },
  maya: { street: ['Sakbe {n}', 'Bej {n}'], main: ['Nohoch Sakbe {n}', 'Great Sakbe of {n}'], road: ['Sakbe {n}', 'Bej {n}'], creek: ['Ha {n}', 'Ch\'en {n}'], river: ['Nohoch Ha {n}', 'River {n}'], mountain: ['Witz {n}', 'Wits {n}'], forest: ['K\'aax {n}', 'Te\' {n}'] },
  andean: { street: ['Kiklla {n}', 'Ñan {n}'], main: ['Hatun Ñan {n}', 'Qhapaq Ñan {n}'], road: ['Ñan {n}', 'Qhapaq Ñan {n}'], creek: ['Yaku {n}', 'Puquio {n}'], river: ['Mayu {n}', '{n} Mayu'], mountain: ['Urqu {n}', 'Apu {n}'], forest: ['Sach\'a {n}', 'Monte {n}'] },
  algonquian: { street: ['{n} Path', '{n} Trail'], main: ['Great {n} Trail', '{n} Council Path'], road: ['{n} Trail', '{n} Portage'], creek: ['{n} Sipiwesk', '{n} Brook'], river: ['{n} Sipi', '{n} River'], mountain: ['{n} Wajiw', '{n} Hills'], forest: ['{n} Woods', '{n} Mitigoog'] },
  bantu: { street: ['Njia ya {n}', 'Mtaa wa {n}'], main: ['Barabara Kuu ya {n}', 'Soko la {n}'], road: ['Barabara ya {n}', 'Njia ya {n}'], creek: ['Kijito cha {n}', 'Mfereji wa {n}'], river: ['Mto {n}', 'Mto wa {n}'], mountain: ['Mlima {n}', 'Milima ya {n}'], forest: ['Msitu wa {n}', 'Pori la {n}'] },
  mande: { street: ['{n} Sira', '{n} Kene'], main: ['{n} Sira Ba', '{n} Sugu'], road: ['{n} Sira', '{n} Kala'], creek: ['{n} Kolon', '{n} Ji'], river: ['{n} Ba', '{n} Ji Ba'], mountain: ['{n} Kulu', '{n} Kuru'], forest: ['{n} Tu', '{n} Wula'] },
  punic: { street: ['Shuq {n}', 'Derekh {n}'], main: ['Rehov {n}', 'Great Shuq {n}'], road: ['Derekh {n}', 'Mesilla {n}'], creek: ['Nahal {n}', 'Ma\'yan {n}'], river: ['Nahar {n}', 'Nahal {n}'], mountain: ['Har {n}', 'Rosh {n}'], forest: ['Ya\'ar {n}', 'Horesh {n}'] },
  ethiopic: { street: ['{n} Menged', '{n} Sefer'], main: ['{n} Gebeya', '{n} Tilik Menged'], road: ['{n} Menged', '{n} Godana'], creek: ['{n} Wenz', '{n} Mink'], river: ['{n} Wenz', 'Abay {n}'], mountain: ['{n} Terara', 'Ras {n}'], forest: ['{n} Den', '{n} Chaka'] },
  mongol: { street: ['{n} Gudamj', '{n} Zam'], main: ['{n} Ikh Zam', '{n} Örgön Choloo'], road: ['{n} Zam', '{n} Tergen Zam'], creek: ['{n} Bulag', '{n} Gol'], river: ['{n} Mörön', '{n} Gol'], mountain: ['{n} Uul', '{n} Nuruu'], forest: ['{n} Oi', '{n} Tal'] },
  turkic: { street: ['{n} Sokak', '{n} Yolu'], main: ['{n} Caddesi', '{n} Çarşı'], road: ['{n} Yolu', 'Büyük {n} Yolu'], creek: ['{n} Dere', '{n} Çay'], river: ['{n} Irmak', '{n} Su'], mountain: ['{n} Dağ', '{n} Dağları'], forest: ['{n} Orman', '{n} Koru'] },
  norman: { street: ['Rue {n}', 'Ruelle {n}', 'Rue de {n}'], main: ['Grand-Rue de {n}', 'Boulevard {n}', 'Place {n}'], road: ['Chemin de {n}', 'Route de {n}'], creek: ['Ruisseau de {n}', 'Ru de {n}'], river: ['Rivière {n}', 'La {n}'], mountain: ['Mont {n}', 'Monts de {n}'], forest: ['Forêt de {n}', 'Bois de {n}'] },
  iberian: { street: ['Calle {n}', 'Callejón {n}', 'Rua {n}'], main: ['Calle Mayor de {n}', 'Avenida {n}', 'Plaza {n}'], road: ['Camino de {n}', 'Carretera de {n}'], creek: ['Arroyo {n}', 'Riachuelo {n}'], river: ['Río {n}', 'Rio {n}'], mountain: ['Sierra {n}', 'Monte {n}'], forest: ['Bosque de {n}', 'Selva de {n}'] },
  germanic: { street: ['{n}gasse', '{n}straße', '{n}weg'], main: ['Hauptstraße {n}', '{n}markt', '{n}allee'], road: ['{n}er Landstraße', '{n}weg'], creek: ['{n}bach', '{n}graben'], river: ['{n}fluss', '{n}'], mountain: ['{n}berg', '{n}gebirge'], forest: ['{n}wald', '{n}forst'] },
  slavic: { street: ['Ulitsa {n}', 'Pereulok {n}'], main: ['Prospekt {n}', 'Bolshaya {n}', 'Ploshchad {n}'], road: ['Doroga {n}', 'Trakt {n}'], creek: ['Ruchey {n}', 'Potok {n}'], river: ['Reka {n}', '{n}'], mountain: ['Gora {n}', 'Gory {n}'], forest: ['Les {n}', 'Bor {n}'] },
  norse: { street: ['{n}gata', '{n}stræde', '{n}vegr'], main: ['Stor{n}gata', '{n}torg'], road: ['{n}vegen', '{n}stigen'], creek: ['{n}bekken', '{n}å'], river: ['{n}elva', '{n}älv'], mountain: ['{n}fjell', '{n}berg'], forest: ['{n}skog', '{n}lund'] },
  pirate: { street: ['{n} Alley', '{n} Wharf Lane'], main: ['{n} Quay', '{n} Waterfront'], road: ['{n} Track', 'Smugglers\' {n} Road'], creek: ['{n} Inlet', '{n} Gully'], river: ['{n} River', 'River {n}'], mountain: ['{n} Bluff', 'Mount {n}'], forest: ['{n} Thicket', '{n} Jungle'] },
};
// A building's name by its class: ['{n}' the home's or a family's name].
const BUILDING = {
  generic: { house: ['{s} House', '{s} Cottage', '{s} Lodging'], store: ['{s}\'s Store', '{n} Market Hall', '{s}\'s Stall'], civic: ['{n} Hall', '{n} Court', '{n} Library'], sacred: ['{n} Temple', '{n} Shrine', '{n} Chapel'], industry: ['{n} Mill', '{s}\'s Workshop', '{n} Forge'], military: ['{n} Barracks', '{n} Armory', '{n} Gatehouse'], tents: ['{s} Camp', '{s} Tent'], central: ['{n} Palace', 'Great Hall of {n}', '{n} Citadel'] },
  latin: { house: ['Domus {s}', 'Insula {s}'], store: ['Taberna {s}', 'Macellum {n}'], civic: ['Basilica {n}', 'Curia {n}'], sacred: ['Templum {n}', 'Aedes {n}'], industry: ['Officina {s}', 'Pistrinum {s}'], military: ['Castra {n}', 'Armamentarium {n}'], tents: ['Tabernaculum {s}'], central: ['Palatium {n}', 'Forum {n}'] },
  greek: { house: ['Oikos {s}'], store: ['Agora {n}', 'Ergasterion {s}'], civic: ['Bouleuterion {n}', 'Stoa {n}'], sacred: ['Naos {n}', 'Hieron {n}'], industry: ['Ergasterion {s}'], military: ['Phrourion {n}'], tents: ['Skene {s}'], central: ['Akropolis {n}', 'Prytaneion {n}'] },
  arabic: { house: ['Dar {s}', 'Bayt {s}'], store: ['Suq {n}', 'Dukkan {s}'], civic: ['Diwan {n}', 'Madrasa {n}'], sacred: ['Masjid {n}', 'Jami {n}'], industry: ['Warsha {s}'], military: ['Qasaba {n}', 'Ribat {n}'], tents: ['Khayma {s}'], central: ['Qasr {n}', 'Dar al-Imara {n}'] },
  sinitic: { house: ['{s} Jia', '{s} Zhai'], store: ['{n} Shi', '{s} Pu'], civic: ['{n} Yamen', '{n} Shuyuan'], sacred: ['{n} Si', '{n} Miao'], industry: ['{s} Fang', '{n} Yao'], military: ['{n} Ying', '{n} Guan'], tents: ['{s} Zhang'], central: ['{n} Gong', '{n} Dian'] },
  japanese: { house: ['{s}-ke', '{s}-ya'], store: ['{s}-ya', '{n} Ichiba'], civic: ['{n} Yakusho', '{n} Bugyosho'], sacred: ['{n}-dera', '{n} Jinja'], industry: ['{s} Kobo', '{n} Kaji'], military: ['{n} Yagura', '{n} Toride'], tents: ['{s} Jinmaku'], central: ['{n}-jo', '{n} Goten'] },
  indic: { house: ['{s} Haveli', '{s} Ghar'], store: ['{n} Bazaar', '{s} Dukan'], civic: ['{n} Sabha', '{n} Vihara'], sacred: ['{n} Mandir', '{n} Devalaya'], industry: ['{s} Karkhana'], military: ['{n} Durg', '{n} Qila'], tents: ['{s} Dera'], central: ['{n} Mahal', '{n} Rajbari'] },
  norman: { house: ['Maison {s}', 'Logis {s}'], store: ['Boutique {s}', 'Halles de {n}'], civic: ['Hôtel de Ville de {n}', 'Bibliothèque {n}'], sacred: ['Église de {n}', 'Chapelle {n}'], industry: ['Moulin de {n}', 'Atelier {s}'], military: ['Caserne de {n}', 'Arsenal de {n}'], tents: ['Camp {s}'], central: ['Château de {n}', 'Palais de {n}'] },
  iberian: { house: ['Casa {s}'], store: ['Tienda {s}', 'Mercado de {n}'], civic: ['Ayuntamiento de {n}', 'Biblioteca {n}'], sacred: ['Iglesia de {n}', 'Ermita {n}'], industry: ['Molino de {n}', 'Taller {s}'], military: ['Cuartel de {n}', 'Alcazaba {n}'], tents: ['Campamento {s}'], central: ['Palacio de {n}', 'Alcázar de {n}'] },
  germanic: { house: ['Haus {s}', '{s}hof'], store: ['{s}laden', '{n}er Markthalle'], civic: ['{n}er Rathaus', '{n}er Bibliothek'], sacred: ['{n}er Kirche', '{n}er Kapelle'], industry: ['{n}er Mühle', '{s}werkstatt'], military: ['{n}er Kaserne', '{n}er Zeughaus'], tents: ['Lager {s}'], central: ['Schloss {n}', '{n}er Burg'] },
  slavic: { house: ['Dom {s}', 'Izba {s}'], store: ['Lavka {s}', 'Rynok {n}'], civic: ['Ratusha {n}', 'Biblioteka {n}'], sacred: ['Tserkov {n}', 'Chasovnya {n}'], industry: ['Melnitsa {n}', 'Masterskaya {s}'], military: ['Kazarma {n}', 'Arsenal {n}'], tents: ['Lager {s}'], central: ['Kreml {n}', 'Dvorets {n}'] },
  norse: { house: ['{s}stue', '{s}gård'], store: ['{s}bod', '{n} Torghall'], civic: ['{n} Tinghus', '{n} Rådhus'], sacred: ['{n} Hov', '{n} Kirke'], industry: ['{n} Kvern', '{s}smie'], military: ['{n} Borg', '{n} Våpenhus'], tents: ['{s}leir'], central: ['{n} Kongsgård', '{n} Hall'] },
};
const KINDS = ['street', 'main', 'road', 'creek', 'river', 'mountain', 'forest'];
export const LINE_KINDS = KINDS;
export const BUILDING_CLASSES = ['house', 'store', 'civic', 'sacred', 'industry', 'military', 'tents', 'central'];

function fill(pattern, n, s) {
  const out = pattern.replace('{n}', n).replace('{s}', s);
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function words(family, kind) {
  const table = W[family] || W.generic;
  return table[kind] || W.generic[kind] || W.generic.street;
}
// The name of a townscape street ('street' | 'main'), road or creek: the town's own name for the main street, its families'
// and places' names (in the culture's sounds) for the rest. i tells the town's lines apart.
export function townLineName(civKey, homeName, kind, i) {
  const family = cultureOf(civKey), k = KINDS.includes(kind) ? kind : 'street';
  const seed = `${civKey}|${homeName}|${k}|${i}`;
  const own = String(homeName || '').trim();
  let n;
  if ((k === 'main' && (i % 2 === 0)) || (k === 'road' && i % 3 === 0)) n = own || generatedPlace(family, seed);
  else if (hash(`${seed}|who`) % 2) n = generatedSurname(family, seed) || generatedPlace(family, seed);
  else n = generatedPlace(family, seed);
  return fill(pick(words(family, k), seed), n, n);
}
// The name of a townscape building of class `cls` (or 'central' for a Home Location's central building), after its Home
// Location and a family of the town.
export function townBuildingName(civKey, homeName, cls, i) {
  const family = cultureOf(civKey), c = BUILDING_CLASSES.includes(cls) ? cls : 'house';
  const seed = `${civKey}|${homeName}|b${c}|${i}`;
  const table = BUILDING[family] || BUILDING.generic;
  const list = table[c] || BUILDING.generic[c];
  const n = String(homeName || '').trim() || generatedPlace(family, seed);
  const s = generatedSurname(family, seed) || generatedPlace(family, `${seed}|s`);
  return fill(pick(list, seed), n, s);
}
// The name of a map river, mountain range or forest: the name it already has (from the game or the geography module) written
// in the owning culture's way, or a new one made from its seed. Names that already carry a kind word are kept as they are.
export function localFeatureName(civKey, kind, seed, fallbackName) {
  const family = cultureOf(civKey), k = KINDS.includes(kind) ? kind : 'river';
  const given = String(fallbackName || '').trim();
  if (given && /\b(river|mount|mountains|range|peaks|forest|wood|woods|hills|creek|sea|lake)\b/i.test(given)) return given;
  const n = given || generatedPlace(family, `${civKey}|${k}|${seed}`);
  return fill(pick(words(family, k), `${civKey}|${k}|${seed}`), n, n);
}
