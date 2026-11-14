// Culture-aware name generator shared by the site names and the people names, so every civilization (and every in-game or DLC
// culture) draws on far more than its short hand-written lists. Each culture family has its own sounds (onsets, middles and
// endings for given names, surnames and places), plus ways of writing a full name that are typical of it (patronymics,
// Roman three-part names, "de" place names, ...). Everything is deterministic in the seed.

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16;   // avalanche: the low bits matter when picking from short lists
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];
const cap = text => text.charAt(0).toUpperCase() + text.slice(1);

// a: onsets, b: middles (may be ''), m/f: male / female endings, s: surname endings, p: place endings, j: how parts are joined
const FAMILIES = {
  latin: { a: ['Ae', 'Cas', 'Fab', 'Luc', 'Mar', 'Pom', 'Sev', 'Val', 'Tit', 'Ner', 'Sab', 'Vit', 'Gal', 'Cor', 'Lic', 'Pla', 'Rut', 'Sul', 'Ner', 'Cat', 'Hor', 'Ocr', 'Pap', 'Ter'], b: ['i', 'a', 'o', 'pi', 'ri', 'ti', 'ni', 'li', 'ci', 'vi', ''], m: ['us', 'ius', 'anus', 'inus', 'o', 'ianus', 'ax'], f: ['a', 'ia', 'illa', 'ina', 'ana'], s: ['ius', 'ianus', 'inus', 'ilius', 'anus', 'ca'], p: ['ium', 'ia', 'um', 'ae', 'ona', 'entum'] },
  greek: { a: ['Alk', 'Dem', 'Euk', 'Phil', 'Kall', 'Nik', 'Pyth', 'Theo', 'Hip', 'Lys', 'Mel', 'Ari', 'Kle', 'Pol', 'Sim', 'Tim', 'Xen', 'Zen', 'Dio', 'Ant'], b: ['o', 'a', 'e', 'i', 'ia', 'ono', 'ome', 'ika', ''], m: ['os', 'ides', 'on', 'eus', 'ias', 'ander', 'ocles', 'ippos'], f: ['e', 'a', 'ia', 'ene', 'ippe', 'ydora'], s: ['ides', 'ades', 'akos', 'eus', 'ion', 'ikos'], p: ['ai', 'ia', 'os', 'ion', 'opolis', 'ene'] },
  egyptian: { a: ['Ah', 'Amen', 'Ptah', 'Khen', 'Sen', 'Ram', 'Mery', 'Nef', 'Ipu', 'Bak', 'Hat', 'Kha', 'Mentu', 'Seti', 'Tut'], b: ['mose', 'em', 'u', 'a', 'et', 'en', ''], m: ['hotep', 'mose', 'ankh', 're', 'mes', 'iry', 'ef', 'amun'], f: ['ankh', 'it', 'ret', 'tari', 'mut', 'nebty', 'iset'], s: ['hotep', 'em-hat', 'ankhu', 'iry', 'nakht', 'amun'], p: ['is', 'et', 'opolis', 'ut', 'ibis'] },
  persian: { a: ['Dar', 'Bah', 'Far', 'Mehr', 'Kav', 'Shah', 'Ard', 'Bar', 'Gus', 'Kar', 'Mir', 'Nush', 'Roz', 'Sam', 'Tir', 'Yaz'], b: ['a', 'i', 'u', 'ya', 'ra', 'zi', ''], m: ['ush', 'ram', 'zad', 'dad', 'han', 'yar', 'shir', 'mehr', 'bod'], f: ['dokht', 'bano', 'azad', 'in', 'ush', 'zadeh', 'afarin'], s: ['an', 'ian', 'zadeh', 'pour', 'ani', 'mand'], p: ['abad', 'an', 'shahr', 'gerd', 'kand', 'istan'] },
  arabic: { a: ['Abd', 'Nas', 'Sal', 'Jab', 'Rash', 'Zay', 'Kar', 'Fad', 'Has', 'Mus', 'Tar', 'Wal', 'Yas', 'Hamd', 'Said', 'Anw'], b: ['a', 'i', 'u', 'ar', 'im', ''], m: ['id', 'ir', 'im', 'an', 'ah', 'ud', 'ar', 'iq'], f: ['a', 'ah', 'iyya', 'ima', 'ira', 'una', 'ana'], s: ['i', 'awi', 'ani', 'ri', 'iyya', 'zi'], p: ['iyya', 'abad', 'ah', 'iyah', 'ayn', 'ar'] },
  mesopotamian: { a: ['Nabu', 'Sin', 'Adad', 'Nergal', 'Shamash', 'Bel', 'Ninurta', 'Ashur', 'Ea', 'Marduk', 'Ishtar', 'Nanna', 'Enlil', 'Tashmet'], b: ['-ahhe', '-iddin', '-apla', '-shumu', '-ibni', '-ushezib', ''], m: ['-ibni', '-rimanni', '-eriba', '-nasir', '-shuma', '-kudurri', '-balassu'], f: ['-ummi', '-iltani', '-belit', '-ahat', '-banitu', '-taram'], s: ['-ibni', '-eriba', '-shuma', '-aplu'], p: ['u', 'ash', 'ar', 'in', 'ippur', 'ak'] },
  celtic: { a: ['Brig', 'Cun', 'Dum', 'Esu', 'Ver', 'Cat', 'Bel', 'Tar', 'Mor', 'Ana', 'Rhi', 'Ep', 'Cin', 'Lug', 'Sen', 'Vin'], b: ['o', 'a', 'i', 'u', 'ga', 'to', ''], m: ['rix', 'os', 'ios', 'macos', 'gnatus', 'marus', 'orix'], f: ['a', 'ia', 'gena', 'ona', 'ana', 'issa'], s: ['icos', 'acos', 'ennos', 'iacos', 'ovices', 'agnos'], p: ['dunum', 'magus', 'briga', 'ritum', 'durum', 'acum'] },
  sinitic: { a: ['Wen', 'Zhi', 'Hao', 'Yu', 'Jian', 'Ming', 'Xiao', 'Long', 'Feng', 'Qing', 'Bao', 'Chun', 'Dong', 'Guang', 'Hui', 'Jing', 'Kang', 'Lei', 'Nan', 'Rong'], b: [''], m: ['hua', 'yuan', 'lin', 'bo', 'cheng', 'an', 'guo', 'jie', 'ping', 'tao', 'xiang', 'yi'], f: ['lan', 'mei', 'ying', 'xiu', 'yun', 'zhen', 'hong', 'juan', 'ling', 'rong', 'fang'], s: ['', '', ''], p: ['cheng', 'zhou', 'ling', 'jing', 'chuan', 'shan'], j: '' },
  korean: { a: ['Seung', 'Min', 'Jae', 'Hyun', 'Dong', 'Tae', 'Woo', 'Ji', 'Eun', 'Soo', 'Yeong', 'Joon', 'Sung', 'Kyung'], b: [''], m: ['ho', 'jin', 'su', 'min', 'woo', 'hee', 'gi', 'beom', 'seok'], f: ['hee', 'young', 'sook', 'ja', 'mi', 'eun', 'ah', 'rim', 'seon'], s: ['', ''], p: ['ju', 'ju', 'gyeong', 'san', 'jeon', 'cheon'], j: '' },
  japanese: { a: ['Aki', 'Haru', 'Masa', 'Taka', 'Yoshi', 'Nobu', 'Kazu', 'Tomo', 'Hiro', 'Shige', 'Mune', 'Sada', 'Yori', 'Kiyo', 'Ume', 'Take'], b: [''], m: ['hiro', 'nori', 'masa', 'yuki', 'tsugu', 'kage', 'mitsu', 'shi', 'ro', 'o'], f: ['ko', 'e', 'mi', 'ka', 'ne', 'yo', 'hime', 'no'], s: ['mura', 'yama', 'kawa', 'da', 'moto', 'hara', 'shita', 'ta'], p: ['mura', 'ga', 'kawa', 'zaki', 'jima', 'machi'], j: '' },
  indic: { a: ['Ash', 'Bhim', 'Chand', 'Dev', 'Gop', 'Har', 'Indr', 'Jay', 'Kal', 'Lak', 'Mah', 'Nar', 'Prat', 'Raj', 'Sur', 'Vij', 'Ved', 'Ana'], b: ['a', 'i', 'u', 'ra', 'ya', 'va', ''], m: ['pala', 'datta', 'deva', 'gupta', 'raja', 'sena', 'mitra', 'nanda', 'vardhana'], f: ['devi', 'bai', 'kumari', 'mati', 'priya', 'lata', 'ni', 'vati'], s: ['kar', 'dhara', 'pati', 'sharma', 'varman', 'nayaka', 'ayya'], p: ['pur', 'nagar', 'abad', 'pura', 'gram', 'kota'] },
  tai: { a: ['Sri', 'Su', 'Pra', 'Chai', 'Nar', 'Kam', 'Thep', 'Wat', 'Ban', 'Som', 'Pho', 'Sak', 'Yut', 'Pich'], b: ['ya', 'tha', 'wa', 'ka', 'ri', ''], m: ['chai', 'pong', 'sak', 'wan', 'dej', 'korn', 'rat', 'thep'], f: ['wan', 'porn', 'chan', 'ratana', 'kaew', 'pim', 'dao'], s: ['akul', 'panich', 'wong', 'rat', 'sakul', 'kasem'], p: ['buri', 'pura', 'nakhon', 'thani', 'rat', 'kaeo'] },
  viet: { a: ['Quang', 'Hoang', 'Thanh', 'Bao', 'Minh', 'Phuc', 'Khanh', 'Tuan', 'Lien', 'Kim', 'Ngoc', 'Thu', 'Hai', 'Duy'], b: [''], m: ['hung', 'long', 'duc', 'phong', 'binh', 'son', 'vinh', 'tien', 'hieu'], f: ['lan', 'huong', 'mai', 'trang', 'anh', 'nga', 'thuy', 'yen'], s: ['', ''], p: ['yen', 'binh', 'son', 'giang', 'hoa', 'dong'], j: ' ' },
  austronesian: { a: ['Ra', 'Ja', 'Ka', 'Bu', 'Wi', 'Sa', 'Ti', 'Ma', 'Na', 'Ha', 'Pa', 'Su', 'Gu', 'La'], b: ['ma', 'ya', 'wa', 'nga', 'ka', 'ta', 'ra', 'ni'], m: ['dana', 'wijaya', 'negara', 'pati', 'mada', 'jaya', 'raja', 'kusuma'], f: ['ni', 'wati', 'sari', 'ayu', 'dewi', 'mala', 'indah'], s: ['wiryo', 'kusumo', 'negoro', 'ningrat', 'dirjo', 'hadi'], p: ['pura', 'jati', 'ngan', 'bayan', 'kerto', 'sari'] },
  polynesian: { a: ['Ka', 'Ke', 'Ma', 'Na', 'Pua', 'Lo', 'Ha', 'Ku', 'Ta', 'Mo', 'Ale', 'Lei', 'Hi', 'Fa'], b: ['la', 'lo', 'ua', 'hi', 'ea', 'li', 'mo', 'pa'], m: ['ni', 'kai', 'mea', 'kane', 'lani', 'moku', 'hoa', 'ua'], f: ['lani', 'lei', 'nani', 'ani', 'kea', 'ina', 'ola'], s: ['kai', 'moku', 'lani', 'hale', 'nui', 'ua'], p: ['ua', 'ea', 'kai', 'nui', 'wai', 'kou'] },
  maya: { a: ['Chak', 'Yax', 'Kin', 'Bal', 'Ek', 'Ix', 'Kuk', 'Tzun', 'Ah', 'Pak', 'Yum', 'Och', 'Zac', 'Hun', 'Uk'], b: ['u', 'a', 'i', 'o', 'ul', 'ab', ''], m: ['am', 'ich', 'nal', 'kan', 'pat', 'tun', 'chaan', 'balam'], f: ['kab', 'chel', 'nik', 'tal', 'kan', 'ha', 'e'], s: ['ek', 'cab', 'tun', 'balam', 'pol', 'cutz'], p: ['tun', 'kal', 'chen', 'nah', 'hal', 'ha'] },
  andean: { a: ['Hua', 'Tup', 'Man', 'Pach', 'Wir', 'Ata', 'Qhap', 'Sum', 'Yup', 'Ccol', 'Inca', 'Cusi', 'Atoq', 'Puma'], b: ['yna', 'ac', 'co', 'ya', 'wa', 'ru'], m: ['mayta', 'kuti', 'yupanqui', 'capac', 'huaman', 'cusi', 'sinchi', 'raymi'], f: ['coya', 'quilla', 'chaska', 'sisa', 'qori', 'mama', 'ñusta'], s: ['mayta', 'yupanqui', 'huaman', 'tupa', 'quispe', 'ccori'], p: ['marca', 'pampa', 'cocha', 'huasi', 'tambo', 'pata'] },
  algonquian: { a: ['Wapa', 'Mato', 'Kita', 'Ahan', 'Misi', 'Nata', 'Oki', 'Pem', 'Sagi', 'Tama', 'Wabi', 'Nik', 'Mon', 'Cha'], b: ['ne', 'ka', 'sa', 'to', 'wa', 'mi'], m: ['wak', 'sepi', 'nagan', 'quot', 'hegan', 'tuk', 'kwe', 'hok'], f: ['kwe', 'ni', 'sipi', 'moo', 'wen', 'ake'], s: ['kwa', 'nekah', 'pesh', 'waugh', 'seh', 'mooni'], p: ['sepe', 'wik', 'ink', 'ong', 'auk', 'ahki'] },
  bantu: { a: ['Mu', 'Ka', 'Nam', 'Ssa', 'Lu', 'Ki', 'Mba', 'Nku', 'Bu', 'Wa', 'Zu', 'Tu', 'Cha', 'Se'], b: ['ka', 'ku', 'ba', 'lu', 'na', 'ma', 'ti'], m: ['bi', 'mba', 'wa', 'nde', 'ya', 'ngo', 'zi', 'ba'], f: ['ya', 'be', 'ngi', 'mbi', 'zi', 'ssa', 'na'], s: ['mba', 'zi', 'ya', 'nde', 'landa', 'gwa'], p: ['nda', 'ngo', 'mba', 'bwe', 'wala', 'zi'] },
  mande: { a: ['Sun', 'Mam', 'Ban', 'Dia', 'Kou', 'Sey', 'Tra', 'Fo', 'Ba', 'Sa', 'Mor', 'Sid', 'Ous', 'Ala'], b: ['di', 'ma', 'ba', 'ko', 'ra', 'ta', ''], m: ['ba', 'ta', 'kar', 'mane', 'sane', 'ouly', 'dou', 'ly'], f: ['ta', 'nata', 'sira', 'mata', 'ya', 'ma', 'bi'], s: ['ra', 'ta', 'ko', 'dian', 'kate', 'yate'], p: ['kane', 'bougou', 'dougou', 'ndi', 'koro', 'gao'] },
  punic: { a: ['Ab', 'Ad', 'Bod', 'Esh', 'Hann', 'Him', 'Ith', 'Mag', 'Mel', 'Yat', 'Baal', 'Ger', 'Han', 'Aza', 'Tan'], b: ['d', 'b', 'a', 'o', 'i', ''], m: ['baal', 'melqart', 'ibal', 'on', 'o', 'ibaal', 'cor', 'tanit'], f: ['bal', 'it', 'ath', 'tanit', 'bat', 'ishtar'], s: ['baal', 'melqart', 'eshmun', 'tanit', 'sakon', 'milk'], p: ['bal', 'ath', 'tum', 'ibaal', 'ed', 'ura'] },
  ethiopic: { a: ['Abr', 'Dag', 'Eze', 'Gab', 'Hail', 'Kal', 'Mek', 'Teke', 'Wel', 'Yo', 'Ab', 'Ber', 'Mer', 'Sel', 'Zer'], b: ['a', 'e', 'i', 'o', 'ha', 'le', ''], m: ['ha', 'eb', 'selassie', 'wold', 'mikael', 'giyorgis', 'kristos', 'amlak'], f: ['work', 'tsion', 'sabla', 'selam', 'azeb', 'berhan', 'mimi'], s: ['ye', 'selassie', 'mikael', 'giorgis', 'eyesus', 'maryam'], p: ['um', 'ada', 'gar', 'abo', 'agu', 'ale'] },
  mongol: { a: ['Bat', 'Bold', 'Gan', 'Mun', 'Ogo', 'Tem', 'Chu', 'Er', 'Dor', 'Khu', 'Nar', 'Sar', 'Tsog', 'Alt'], b: ['a', 'u', 'e', 'o', ''], m: ['bayar', 'temur', 'tsetseg', 'tulga', 'khuu', 'erdene', 'bold', 'ulzii'], f: ['tuya', 'gerel', 'bayar', 'tsetseg', 'khuu', 'sarnai', 'altan'], s: ['uud', 'chin', 'ud', 'iin', 'khan', 'tai'], p: ['khoto', 'orda', 'uul', 'nuur', 'tal', 'gol'] },
  turkic: { a: ['Alp', 'Bay', 'Cem', 'Dur', 'Ere', 'Gok', 'Kara', 'Orh', 'Sel', 'Tug', 'Yil', 'Mur', 'Ayd', 'Bil', 'Tim'], b: ['a', 'i', 'u', 'ar', 'er', ''], m: ['han', 'bey', 'oglu', 'tekin', 'bas', 'ay', 'mir', 'toprak'], f: ['gul', 'nur', 'sultan', 'ay', 'han', 'cicek', 'hatun'], s: ['oglu', 'zade', 'bey', 'lar', 'ci', 'han'], p: ['kale', 'hisar', 'kent', 'abad', 'ova', 'koy'] },
  norman: { a: ['Gui', 'Ber', 'Rol', 'Thib', 'Rich', 'Ha', 'Ma', 'Gaut', 'Sim', 'Rau', 'Tur', 'Hug', 'Ber', 'Ansel', 'Lamb'], b: ['l', 'r', 'n', 'ar', 'on', ''], m: ['aume', 'ert', 'and', 'on', 'er', 'ard', 'ier', 'in'], f: ['ette', 'ine', 'ille', 'ane', 'elle', 'a', 'ise'], s: ['ville', 'ac', 'ot', 'eau', 'ier', 'court', 'mont'], p: ['ville', 'court', 'mont', 'fleur', 'ac', 'ay'] },
  iberian: { a: ['Alon', 'Ber', 'Cris', 'Die', 'Fer', 'Gon', 'Her', 'Igna', 'Ped', 'Rod', 'Sal', 'Teo', 'Vic', 'Ped', 'Gaspar'], b: ['', 'a', 'i', 'o', 'ri', 'li'], m: ['so', 'nando', 'go', 'ro', 'mundo', 'lo', 'cio', 'dro'], f: ['ela', 'ita', 'ina', 'ana', 'osa', 'ia', 'ena'], s: ['ez', 'es', 'az', 'oz', 'ero', 'illa', 'ales'], p: ['villa', 'ada', 'ona', 'eda', 'osa', 'ares'] },
  germanic: { a: ['Ald', 'Ber', 'Cuth', 'Dun', 'Edg', 'Gar', 'Hild', 'Leof', 'Os', 'Wulf', 'Sig', 'Ad', 'Egb', 'Ger', 'Hold', 'Rud'], b: ['e', 'a', 'o', 'er', 'ric', ''], m: ['wine', 'mund', 'fred', 'helm', 'bert', 'ward', 'win', 'ulf', 'mar'], f: ['burga', 'hild', 'wyn', 'gard', 'flaed', 'trude', 'linde', 'a'], s: ['ton', 'ham', 'ley', 'worth', 'ford', 'stein', 'berg', 'smith'], p: ['ton', 'ham', 'ford', 'burg', 'worth', 'bury', 'wick', 'stead'] },
  slavic: { a: ['Bog', 'Dra', 'Gos', 'Mil', 'Rad', 'Sta', 'Vla', 'Zdi', 'Voj', 'Bro', 'Iz', 'Lub', 'Sve', 'Yar', 'Vse'], b: ['o', 'i', 'a', 'e', ''], m: ['slav', 'mir', 'dan', 'gor', 'bor', 'mil', 'vit', 'zar'], f: ['slava', 'mila', 'mira', 'dana', 'ka', 'ena', 'ana'], s: ['ov', 'ev', 'in', 'sky', 'ich', 'ko', 'enko', 'ak'], p: ['grad', 'gorod', 'vo', 'ovo', 'sk', 'polye'] },
  norse: { a: ['Arn', 'Bjorn', 'Eir', 'Geir', 'Hall', 'Ketil', 'Orm', 'Skapt', 'Thor', 'Ulf', 'Sveinn', 'Tor', 'Vig', 'Hrol', 'Stein'], b: ['', 'a', 'i', 'u'], m: ['mund', 'stein', 'finn', 'geir', 'bjorn', 'laug', 'grim', 'kell'], f: ['dis', 'hild', 'laug', 'run', 'gerd', 'veig', 'unn', 'borg'], s: ['son', 'son', 'sson', 'ason', 'arson'], p: ['fjord', 'vik', 'dalr', 'stadir', 'nes', 'holt'] },
  pirate: { a: ['Ned', 'Jack', 'Black', 'Red', 'Tom', 'Will', 'Sam', 'Bart', 'Jem', 'Cap', 'Fin', 'Mad', 'Hal', 'Nat'], b: [''], m: ['', 'ley', 'son', 'ton', 'by', 'kin', 'dy', 'ham'], f: ['ie', 'a', 'ette', 'beth', 'y', 'ry', 'ell'], s: ['ley', 'son', 'ton', 'by', 'kins', 'ham', 'ford', 'wick'], p: ['cove', 'bay', 'key', 'harbor', 'reef', 'point'] },
  generic: { a: ['Al', 'Bar', 'Cor', 'Dun', 'El', 'Far', 'Gar', 'Hal', 'Iv', 'Jor', 'Kes', 'Lor', 'Mor', 'Nor', 'Ors', 'Per'], b: ['a', 'e', 'i', 'o', 'u', ''], m: ['an', 'en', 'in', 'on', 'ric', 'ard', 'ell', 'ow'], f: ['a', 'ia', 'ina', 'elle', 'ara', 'wen', 'is'], s: ['er', 'ton', 'ow', 'ell', 'ard', 'ing', 'ley'], p: ['ton', 'ford', 'dale', 'wick', 'mere', 'field'] },
};

const CULTURE_BY_CIV = {
  ROME: 'latin', GREECE: 'greek', EGYPT: 'egyptian', PERSIA: 'persian', ABBASID: 'arabic', ASSYRIA: 'mesopotamian', BABYLON: 'mesopotamian', GAUL: 'celtic',
  HAN: 'sinitic', MING: 'sinitic', QING: 'sinitic', MAURYA: 'indic', CHOLA: 'indic', MUGHAL: 'indic', NEPAL: 'indic', KHMER: 'tai', SIAM: 'tai', DAIVIET: 'viet',
  MAJAPAHIT: 'austronesian', MAYA: 'maya', INCA: 'andean', MISSISSIPPIAN: 'algonquian', SHAWNEE: 'algonquian', BUGANDA: 'bantu', HAWAII: 'polynesian', TONGA: 'polynesian',
  SONGHAI: 'mande', CARTHAGE: 'punic', AKSUM: 'ethiopic', MONGOLIA: 'mongol', OTTOMANS: 'turkic', QAJAR: 'persian', NORMAN: 'norman', FRENCHEMPIRE: 'norman',
  FRENCH: 'norman', FRANCE: 'norman', SPAIN: 'iberian', MEXICO: 'iberian', ENGLAND: 'germanic', GREATBRITAIN: 'germanic', AMERICA: 'germanic', PRUSSIA: 'germanic',
  RUSSIA: 'slavic', BULGARIA: 'slavic', MEIJI: 'japanese', HEIAN: 'japanese', SENGOKU: 'japanese', JOSEON: 'korean', GORYEO: 'korean', SILLA: 'korean',
  ICELAND: 'norse', PIRATEREPUBLIC: 'pirate',
};
export const NAME_CULTURES = Object.keys(FAMILIES);
export function cultureOf(civKey) { return CULTURE_BY_CIV[civKey] || 'generic'; }

function compose(family, seed, ends) {
  const f = FAMILIES[family] || FAMILIES.generic, join = f.j == null ? '' : f.j;
  const first = pick(f.a, `${seed}|a`);
  const middle = hash(`${seed}|mid`) % 100 < 45 ? pick(f.b, `${seed}|b`) : '';
  const end = pick(ends(f), `${seed}|e`);
  const text = [first, middle, end].filter(Boolean).join(join);
  return cap(text.replace(/^-+|-+$/g, '').replace(/(.)\1{2,}/g, '$1$1').replace(/--+/g, '-'));
}
export function generatedGiven(family, female, seed) { return compose(family, `${seed}|g${female ? 1 : 0}`, f => (female ? f.f : f.m)); }
export function generatedSurname(family, seed) { return compose(family, `${seed}|s`, f => f.s); }
export function generatedPlace(family, seed) { return compose(family, `${seed}|p`, f => f.p); }

// Typical modifiers for a site's name ("Fundus Vetus", "Upper Mill"): [before, after].
const MODIFIERS = {
  latin: [[], ['Maior', 'Minor', 'Vetus', 'Nova', 'Superior']], greek: [[], ['Ano', 'Kato', 'Palaia', 'Nea']], arabic: [[], ['al-Kabir', 'al-Jadid', 'al-Qadim', 'al-Sharqi']],
  germanic: [['Upper', 'Lower', 'Old', 'New', 'Great', 'Little'], []], norman: [['Haut', 'Bas', 'Vieux', 'Nouveau'], []], iberian: [[], ['de Arriba', 'de Abajo', 'Viejo', 'Nuevo']],
  slavic: [['Verkhny', 'Nizhny', 'Staryi', 'Novyi'], []], sinitic: [['Upper', 'Lower', 'East', 'West', 'Old', 'New'], []], japanese: [['Kami', 'Shimo', 'Higashi', 'Nishi', 'Shin', 'Furu'], []],
  persian: [['Bala', 'Pa\'in', 'Kohneh', 'Now'], []], indic: [['Bada', 'Chhota', 'Purana', 'Naya'], []], turkic: [['Ust', 'Alt', 'Eski', 'Yeni'], []], polynesian: [[], ['nui', 'iki', 'kahiko', 'hou']],
  egyptian: [[], ['Resy', 'Mehty', 'Wer', 'Nedjes']], celtic: [[], ['Mor', 'Bihan', 'Hen', 'Newydd']], norse: [['Ytri', 'Innri', 'Gamli', 'Nyja'], []], pirate: [['Old', 'Little', 'Upper', 'Lower'], []],
  generic: [['Upper', 'Lower', 'Old', 'New'], []],
};
export function siteModifier(family, seed) {
  const [before, after] = MODIFIERS[family] || MODIFIERS.generic;
  const options = [...before.map(w => ({ pre: w })), ...after.map(w => ({ post: w }))];
  return options.length ? options[hash(`${seed}|mod`) % options.length] : null;
}

// ---- full-name styles ----------------------------------------------------------------------------------------------------------
// Returns a way of writing a person's full name that is typical of the culture: given/family are the usual parts, and
// `father` is a generated male given name for patronymics. Returns null when the culture just uses given + family.
const SON = { latin: 'filius', greek: 'son of', arabic: 'ibn', mongol: 'son of', persian: 'son of', turkic: 'oglu', celtic: 'mac', punic: 'son of', ethiopic: 'wolda', mesopotamian: 'son of', indic: 'putra of', egyptian: 'son of', mande: 'ben' };
const DAUGHTER = { latin: 'filia', greek: 'daughter of', arabic: 'bint', mongol: 'daughter of', persian: 'daughter of', turkic: 'kizi', celtic: 'ingen', punic: 'daughter of', ethiopic: 'wolda', mesopotamian: 'daughter of', indic: 'putri of', egyptian: 'daughter of', mande: 'bint' };
export function fullNameStyle(family, civKey, given, familyName, female, seed) {
  const roll = hash(`${seed}|style`) % 100;
  const father = generatedGiven(family, false, `${seed}|father`);
  if (family === 'slavic' && roll < 70) {
    const stem = father.replace(/[aeiouy]$/i, '');
    const patronymic = female ? `${stem}ovna` : `${stem}ovich`;
    return `${given} ${patronymic} ${familyName}`.replace(/\s+/g, ' ').trim();
  }
  if (family === 'latin' && roll < 65) return `${given} ${familyName} ${generatedSurname('latin', `${seed}|cog`)}`;
  if (family === 'iberian' && roll < 50) return `${given} ${familyName} de ${generatedPlace('iberian', `${seed}|de`)}`;
  if (family === 'norman' && roll < 40) return `${given} de ${generatedPlace('norman', `${seed}|de`)}`;
  if (family === 'germanic' && civKey === 'PRUSSIA' && roll < 25) return `${given} von ${generatedPlace('germanic', `${seed}|von`)}`;
  if (SON[family] && roll < 55) {
    if (family === 'turkic') return `${given} ${father}${female ? ' kizi' : 'oglu'}`;
    return `${given} ${female ? DAUGHTER[family] : SON[family]} ${father}`;
  }
  return null;
}
