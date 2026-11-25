# Anthroprocenia

Anthroprocenia records Civilization VII games and provides an interactive
historical map with a replay timeline, geographic labels, and configurable
map layers.

For step-by-step source edits, worked JavaScript/XML/SQL/content examples,
recording formats, testing, verified backups, rollback, and troubleshooting,
see [MODDING_GUIDE.txt](MODDING_GUIDE.txt).

## Installation

Prepared release files are in `Publish/SteamWorkshop/anthroprocenia/` and
`Publish/CivFanatics/`; see `Publish/PUBLISHING.md` in the source repository.
Public Anthroprocenia listing targets must be
confirmed before uploading; the previously recorded Workshop link currently
opens an item titled REWIND: Replay Map History.

For manual installation, copy the contents of `anthroprocenia/` into an
`anthroprocenia` directory in the game's `Mods` directory, not the enclosing
repository. The installed directory should contain `anthroprocenia.modinfo`
alongside the `config`, `data`, `ui`, and `text` directories. Remove or disable older duplicate
Anthroprocenia installations so that only one manifest with the mod ID remains.
Fully restart the game and enable the mod in **Add-Ons**.

Version 107 fixes loading-screen icon feedback and scopes custom unit abilities
to their native unit classes to prevent new-game initialization stalls.
Fully restart Civ VII after installing; no civilization features need disabling.

## Map View startup (version 122)

Map View again opens automatically after **Begin Game**, including when resuming
existing saves. Startup checks the actual recorded frames rather than parsing
the observer-scoped cache fingerprint as a number. It waits for the opening
capture without rebuilding an already-visible map. Fully restart Civ VII after
installing this fix.

## Offline prerecorded narration

`tools/build-narration.py` records the mod's authored civilization introductions,
overviews, Civilopedia histories, civic descriptions, units, buildings, improvements, quarters,
traditions and civilization abilities as standalone 24 kHz, mono, 16-bit PCM
WAVs in `anthroprocenia/audio/narration`. These files play directly from File
Explorer. `narrator-preview.wav` is an original voice sample; `index.json`
associates each recording with its localization key and spoken script.

The narrator uses Kokoro's British female `bf_emma` voice at a measured 0.94
speed, without celebrity imitation or artificial pitch shifting. Synthesis
runs locally with two inference threads; no text is sent to an online service.
The engine is MIT-licensed and its model is Apache-2.0-licensed. Model downloads
are cached outside the mod in `%LOCALAPPDATA%\AnthroproceniaNarrator\models`.

Use Python 3.12 and install `tools/narration-requirements.txt` into an isolated
environment. Run `python tools/build-narration.py preview` for the sample or
`python tools/build-narration.py generate` for the complete authored inventory.
Interrupted generation resumes using the recording index.

`python tools/build-narration.py official` records original introductions for
all 38 installed leader/persona identifiers and 50 official civilizations,
including DLC. These are new scripts, not copies of the game's original quotes.
Their completed inventory is in `official-index.json`.

Native research, civic and landmark quote events also use the new voice when
their subject is available in the gameplay database. Original game quotations
are not copied: stock discoveries receive new narration synthesized locally,
while authored Anthroprocenia discoveries use their prerecorded descriptions.
Closing a quote stops its replacement voice; unrelated music and effects remain
native. A missing subject or unavailable companion logs an error and preserves
native narration rather than leaving the player without audio.

Civilization, civic, unit and building artwork now uses the mod's actual
`anthroprocenia` resource mount, rather than its manifest identity. This fixes
blank legacy civic icons without changing native civilization backgrounds.

After installing the mod, start `python tools/narration-companion.py` using the
same isolated Python environment, then fully restart Civ VII. The companion
plays the prerecorded WAVs locally and synthesizes dynamic narrative text with
the same voice. It binds only to loopback, uses a per-run authentication token
written only to the installed mod, and never uploads game text. Civ VII's
native XMLHttpRequest handler does not reach localhost HTTP, so in-game
requests use a bounded local UI-log bridge and atomic file acknowledgements.
The HTTP interface is for local diagnostics, not the game's transport.
Readiness is verified by a native ping/acknowledgement, not a stale status file.
The acknowledgement file is registered for native resource lookup and changes
only in response to requests, rather than continuously during game loading.
Keep the companion running while playing; music and sound effects remain native.

Loading-screen voices start before ordinary game-scoped mod scripts. With Civ VII
closed, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\install-narration-loader.ps1`
to install a single early-loader line in the game's UI. This opt-in patch verifies
an original backup under `%LOCALAPPDATA%\AnthroproceniaNarrator\backups`.
It uses the enabled initial-script catalog and its canonical URLs, so disabling
the mod does not enable narration and ordinary startup does not load it twice.
Run the same command with `-Restore` to remove only the added line. Game updates
or Steam file verification may remove the patch; reinstall it afterward if needed.

The UI replaces leader-selection voice animations and the mapped leader/civ
loading introductions, narrates civilization details, and reads narrative popup bodies. Choices speak only on mouse hover,
after a short debounce; leaving or choosing an option cancels it. Without a
working companion, native narration remains enabled and the UI log explains
the failure. Dynamic WAVs are cached under
`%LOCALAPPDATA%\AnthroproceniaNarrator\recordings` and play from File Explorer.

Native Civ VII 1.5.1 testing verified local WAV playback from Amina's leader
selection, Egypt's civilization details, and Elizabeth's existing-save loading
introduction. The early loader connected before the loading voice request, and
the save finished loading successfully. This does not claim that every cinematic,
diplomacy line, or original quote has been replaced.

## Native map compatibility (version 123)

The Voronoi map wrappers now support Civ VII 1.5.1, whose native module no
longer exports `SquareMapDims`. A namespace import preserves compatibility with
older versions while avoiding a fatal module-linking error in current versions.
Existing provider dimensions and all Giant/63-player defaults are preserved.
Giant Earth generation still requires separate native diagnosis.

Official icon overrides also use the resource mount `fs://game/anthroprocenia/`,
not the mod's database identity. Native civilization background contexts remain
untouched.

## Settlement spacing

Anthroprocenia sets the native `CITY_MIN_RANGE` parameter to **2** instead of
the default **3**, in every Age and game mode. This is the native hex-range
setting, not a separate simulated-settlement rule. Existing settlements are
not moved. Fully restart Civ VII and reload your game after installation;
multiplayer participants must all install the same change.

## Geographic and population update (version 125)

Realistic x10 and x20 are available in single-player and multiplayer setup.
Their Antiquity / Exploration / Modern turn budgets are respectively
440 / 540 / 240 and 220 / 270 / 120. Research, civics, celebrations and calendar
increments follow the selected multiplier; other costs retain Marathon pacing.
Start a new game to select a different speed.

Colossal is an explicitly experimental **256 x 160** option, with twice
Ludicrous's width and height (four times its tile area). The native 1.5.1
oversized-width failure is not fixed by registering this option; it is expected
to fail native generation. Ludicrous remains the tested 128 x 80 option, and
Giant Earth retains its original 180 x 94 dimensions.

Map scale is anchored to Giant Earth at 100 miles across a tile. Other recorded
dimensions use `100 * sqrt((180 * 94) / (width * height))` miles per tile,
preserving the same world area. The scale bar, walker speeds, town radii and
physical decoration sizes use this exact value.

Non-Earth continents use invented names. Procedural regions, islands, waters,
rivers and mountains retire descriptive prefixes such as Misty and Fabled.
Nearby duplicate names can use geographically justified Eastern/Western or
Northern/Southern pairs; remote duplicates get distinct invented place stems.
Single-tile procedural peaks use Mount names. Native Earth names are preserved.

Regions of at least eight land tiles have deterministic connected sub-regions.
They appear below their parent in the Regions and Population panels, with
independent known-tile populations, settlements and territorial statistics.
The Regions panel provides a Sub-regions filter and separate expansion arrows,
leaving parent selection available. Sub-regions reuse map labels, boundaries,
hover shading and offscreen selection arrows. Expansion and background
statistics refresh preserve scrolling; searches, filters and page changes reset it.

Completed native unit production records the originating settlement and unit
identity in the observer-scoped save. Its modeled manpower is deducted once
from that settlement's civilian homes, populations and occupations, and does
not return when the unit moves or dies. Starting units, upgrades and ordinary
movement do not create recruitment records. Production UI population excludes
stationed-unit manpower. Older saves begin recording recruitment on installation;
unobserved past production is not guessed. Existing opposite-sex, adult-only
marriage rules remain unchanged and are regression-tested.

All **1,550** authored description and history WAV recordings are complete,
alongside the **88** official leader/civilization introduction recordings.
They are ordinary playable audio files; narrative option text still speaks
only on hover using the same local narrator.

## Multiplayer-safe foundation (version 121)

Multiplayer/hotseat replay, visibility, labels and Map View records now use
observer-specific save keys. Clients no longer overwrite each other's fog,
population data or command queues. Ambiguous older multiplayer recordings are
not imported; recording starts afresh for each observer. Existing single-player
recordings remain compatible. Loading another game resets recorder baselines.

**This is not full multiplayer certification.** Walker commands, yield rewards
and unit healing are blocked in multiplayer/hotseat: the existing UI mutation
calls have no verified synchronized gameplay-command transport. Population
viewing, autonomous walkers and townscapes remain available. Skip Ahead and
civilization takeover retain their single-player restrictions. All participants
must install identical mod/content versions, and added civilizations, buildings,
units, maps and game speeds still require live host/client and reload testing.

Live movement/damage/ownership event bursts share a capture after at least
250 ms. Expensive captures back off by four times their measured scan cost,
up to five seconds; resolved turn-begin and final captures are not throttled.
Identical recent save payloads skip native configuration writes, and identical
same-turn deltas no longer invalidate playback or rescan static map layers.
These are bounded-work improvements, not a claimed native FPS benchmark.

Version 109 uses Child for ages under 13, Youth for ages 13-15, Adult for
ages 16-59, and Elder from 60. Youths cannot hold adult leadership offices;
the hereditary heir remains an exception. Modeled marriages require a male
and female partner, using their actual named profiles across generations,
and still require both partners to be at least 18. Family reconstruction
caches ancestry and limits partner/parent searches to eligible candidates
while retaining historical marriages and preventing marriages between relatives.

## Townscape rendering and loading status (versions 118-119)

Townscapes replace their circle icons when accepted roofs become visible,
including partial roof commits. Unrendered towns retain selectable fallback
icons; hiding the roofs restores their circles. Resource icons remain available.

Collision-checked decoration previews appear with the first roofs. Denser
placement and detailed silhouette budgets increase by 50%, with era-specific
amphorae, fishing racks, torches, lanterns, trade furniture, hand pumps,
mailboxes and bicycles. Native path command/character limits remain unchanged,
and dense placement and geometry preparation continue in bounded batches.

Visible townscape layers now arrive in this order: pools/lakes, roofs and
decorations, minor/entry roads, walking networks and walkers, then remaining
layers and town labels. Collision-safe road preparation can run invisibly
before building placement; disabled decorations/walkers do not block later
stages. Scene replacement and map closure cancel stale work.

The pointer-transparent loading indicator names active rendering jobs
without blocking gameplay. It has a transparent, borderless background and
sits at bottom-center, shifting upward to avoid measured map controls.
The townscape compass also limits targets to three quarters of the shorter
viewport dimension from the camera center, after map wrapping.
Selected-unit destination scans and lens geometry
also run in deferred, cancellable batches instead of scanning the whole map
during the first lens update. Fully restart Civ VII after installing.

## Map View fog protection (versions 116-117)

**Fog of War defaults on** as of version 117. Single-player games can still
disable it using the checkbox; active multiplayer games keep it locked on.

Turning **Fog of War** on immediately masks hidden tiles and invalidates pending
marker/townscape work, before the deferred redraw. A cached topmost fog layer
also covers retained SVG geometry and label overhangs extending into hidden
tiles. Unchanged visibility/layout reuses this layer without extra canvas paints.

Missing visibility entries remain hidden, and map-size changes invalidate
visibility reconstruction caches. Revealed static information remains available;
live units require current line of sight. Routes refresh when visibility changes,
and movement arrows cannot extend into unknown tiles. Whole marker roots stay
hidden until stricter-fog rebuilds finish, including during recent camera input.
Fully restart Civ VII after installing.

## Immediate peace negotiations (version 111)

Peace negotiations no longer require a minimum number of turns at war.
Either side can propose peace on the turn war begins; the other leader must
still accept the negotiated agreement. The normal post-peace restriction on
declaring another war is unchanged.

Major-civilization vassalage is not implemented in this release. Negotiated
submission, enforced war restrictions and major-civilization troop levies
still need verified native gameplay support. City-state effects and their
text have not been relabeled as vassal effects without working replacements.

## Starter content and land raiders (version 110)

All civilizations gain these Antiquity buildings without technology, civic,
resource or civilization unlocks. Each costs 35 base Production and uses normal
urban building placement and purchase rules.

| Building | Base yields |
| --- | --- |
| Pastural Enclosure | +1 Food, +1 Production |
| Fire Pit | +1 Food, +1 Happiness |
| Toolmaker's Hut | +2 Production |
| Barter Post | +2 Gold |
| Story Circle | +1 Culture, +1 Happiness |

Three unrestricted Antiquity units supplement, rather than replace, native units:
**Latched Reed Oarboat** (25 Production, 15 Combat/10 Ranged/5 Bombard,
2 Movement), **Clubman** (20 Production, 12 Combat), and **Stone Thrower**
(20 Production, 3 Combat/10 Ranged/3 Bombard, range 1). They are deliberately
cheaper and weaker than the Galley, Warrior and Slinger respectively.
The oarboat still needs a legal naval deployment location.

Every civilization also gains a **gold-purchase-only land unit** in each Age:

| Unit | Age | Technology | Combat | Movement |
| --- | --- | --- | --- | --- |
| Raider | Antiquity | Bronze Working | 22 | 3 |
| Highwaymen | Exploration | Heraldry | 35 | 3 |
| Partisan | Modern | Industrialization | 50 | 3 |

Their **Pirate** ability applies the native Privateer engine effect and foreign
territory permission on land: they can enter neutral territory and pillage
without declaring war. They cannot be produced, and gold prices use native
purchase/game-speed scaling. The existing naval Privateer is unchanged.
These additions reuse the mod's white icons and compatible native 3D models;
they do not introduce new 3D artwork. Start a new game to use the added rules.

On Giant Earth, Italia also includes all land-connected South Europe tiles;
water-separated islands retain their own names. Diplomacy's hanging cloth
banners are hidden, while leaders, lighting and diplomacy controls remain.

## Expanded civilizations (versions 106-119)

The expansion contains **47 civilizations** across all three Ages:

- **Antiquity (13):** Britons, Suebi, GoTurks, Caralans, Wagadu, Javanese,
  Slavic, Orinoco, Iberia, Thrace, Scythia, Nordic, and Pictish.
- **Exploration (17):** Lakhota, Navajo, Zimbabwe, Byzantium, Ayutthaya, Aztec, Mohawk, Franks,
  Seljuk Turks, Rus, Lombards, Timurids, Venice, Almohads, Khwarazmians,
  Papal States, and Taino.
- **Modern (17):** Ashanti, Wafdist Egypt, Serbia, Indonesia, Portugal,
  Hungary, Tahiti, Gran Colombia, Vatican, Berber, Sweden, Afghanistan,
  Kazakh, Scotland, Dominican, Haiti, and Brazil.

The former Antiquity Taino identity is now **Orinoco**, with an Orinoco-basin
history and kit; its internal `TAINO` key remains for compatibility.
Exploration Taino is a separate Caribbean civilization. Nordic represents
pre-Viking Scandinavian societies; Berber emphasizes modern Amazigh societies.
Version 108 reworks the former Xiongnu slot as **GoTurks**, representing the
sixth- to eighth-century Turkic khaganates with revised names and history.
Its internal `XIONGNU` key remains for save compatibility; Antiquity placement
is a gameplay convention. Every civilization now has an authored narrative
introduction and overview. Selection names consistently omit a leading "The";
articles in ordinary prose and generated country titles remain grammatical.

Lakhota (retaining the requested spelling) emphasizes Plains kinship, mobile
camps and mounted mobility; Navajo emphasizes Dinetah households, weaving
and canyon agriculture. Both have authored introductions, complete civic
and tradition kits, original illustrative icons/scenes and five nearby
Giant Earth starts. Their geographic settlement labels, later personal-name
pools and native visual donors are documented gameplay approximations,
not claims of an Exploration-era census or archaeological reconstruction.

Each has a civilization ability, a unique military replacement line and
Scout (Explorer in Modern), two
ageless unique buildings forming a unique quarter, a unique rural improvement,
and six branching civics with three additional masteries and four slottable
traditions. The two research branches converge at a final civic; masteries
provide an additional application of the indicated civic's first bonus.
The mod also supplies city names, alternate
map emblems and culturally supported personal-name families.

Original painted settlement scenes replace unrelated native civilization
backgrounds in the menu and loading screen. Individually authored white,
transparent icons depict the unique buildings, quarters, improvements,
military units and recon units; upgrade tiers have distinct rank marks.
Civilization emblems are also white, allowing native ownership recoloring.
The scenes, including Lakhota and Navajo, are AI-generated historical
illustrations, not archaeological reconstructions. Their white icons remain
original procedural drawings, reproducible with
`python tools/build-plains-southwest-art.py` (Pillow required); this command
does not overwrite the imported scene art. Unit portraits, unit/building/improvement models and their
textures still reuse installed base-game assets through explicit references;
these are visual approximations, not newly authored historical models.
No native game artwork is redistributed.
The same white engraved style replaces installed base-game/DLC civilization
emblems, units, buildings, improvements and unique quarters: 445 original PNGs
(51 emblems, 179 unit families, 114 buildings, 75 improvements and 26 quarters).
Native upgrade and named-great-person aliases retain their family's artwork.
Owner tinting and civilization loading backgrounds are preserved. Wonders,
leader portraits, resources, yields, technologies, civics and generic interface
buttons are outside this icon replacement.
Official icon replacements update only DEFAULT and FONTICON contexts.
BACKGROUND/BACKGROUND_VERT textures and their native filename selectors
remain untouched, preserving base-game/DLC civilization selection and
loading artwork rather than replacing scenery with white emblems.
Original PNGs use distinct basenames across folders: native image lookup can
otherwise replace an emblem with a same-named settlement scene.
Wagadu remains separate from the community Wagadu civilization.

| Civilization | Historical gameplay focus |
| --- | --- |
| Britons | Vegetated sacred landscapes, Specialists, chariot attacks and hillfort networks |
| Suebi | Woodland husbandry, warband production and defensive forest movement |
| GoTurks | Pastures, mounted retinues, qaghan courts and Silk Road diplomacy |
| Caralans | Coast-valley food exchange, cotton farming, communal construction and ceremonial Specialists |
| Wagadu | Caravan capacity, resource storage, connected markets and Soninke cultural institutions |
| Javanese | River-fed rice, growth, shipbuilding and interisland exchange |
| Slavic | Riverine agriculture, woodland defense and connected settlements |
| Orinoco | Floodplain agriculture, modeled ceramics, river exchange and connected settlements |

Building and improvement modifiers apply in their settlement. Unique rural
improvements are limited to one per settlement. Quarter bonuses require both
unique buildings in the same district and apply only in the owning civilization's
settlements containing that quarter. Traditions apply only while slotted.
Military units now combine a modest base-strength advantage with situational
combat, movement, healing or terrain abilities rather than sharing a flat bonus.
Historical themes, sources and translation caveats are recorded in
`tools/civilization-kits.json` and the three Age-specific additions catalogs.
The additions include civilization, civic and unique-element Civilopedia
histories. Attested local names and supported translations replace generic
English labels where possible; descriptive English remains when a reliable
historical lexicon does not support a translation. Functional translations
are not presented as otherwise unattested historical institutions.

All 45 appear among relevant existing leaders' recommended choices. Direct
historical pairings are highlighted; geographic and strategic recommendations
are labeled accordingly. Later-Age civilizations have leader and native-style
gameplay unlock conditions. Original official recommendations are preserved.

Fully restart Civ VII after updating, then select the appropriate Age in a new-game
setup. Existing games do not acquire a different civilization or relocate.
YnAMP is optional; the homeland starts below apply only to its Giant Earth map.

Civilization identities are maintained in `tools/civilizations.json` and
`tools/civilizations-<age>-additions.json`; mechanics, civic branches and
historical notes are in the corresponding `civilization-kits` catalogs.
Install the art-generation dependency with `python -m pip install -r tools/requirements.txt`.
Regenerate definitions with `python tools/build-civilizations.py` (use `--base`
for a nondefault installed `Base` directory). Run
`node --test tests/civilizations.test.mjs tests/civilizations-giant-earth.test.mjs`
to check the kits, naming/icon integration, homeland terrain and installed native
schemas. Set `CIV7_BASE_PATH` when the game is installed outside the default path.
Original icon, emblem and scene files are preserved by ordinary regeneration;
missing original art is an error rather than a reused-symbol fallback.
`--art-atlas <path>` replaces them from an original four-column, two-row atlas
ordered Britons, Suebi, GoTurks, Caralans, Wagadu, Javanese, Slavic, Orinoco.
Use `--atlas-keys` and `--atlas-grid` to import other original scene layouts.

The settler overlay remains visible in native unit view. All unit-circle glyphs,
including player-controlled units, use their owner's colors as of version 115.
Map View applies the primary color through native Gameface image tinting rather
than CSS masks. Native unit flags use the contrasting secondary color above
their primary-color interiors. Health rings and non-unit icons are unchanged.
Generated country names avoid artificial hyphens while
preserving authentic hyphenated names. Native tooltips no longer recursively
expand already-replaced civilization names. War-front markers are many-pointed
stars, military locations are triangles, and the independent Unit dots and
Building dots settings also control their map markers and hit targets.

## Pause-menu layout (version 103)

**Switch Civilization** appears between **Retire** and **Restart**, preserving
the native buttons' order. All pause-menu buttons use uniform heights and
even spacing within their existing column, including when Restart is disabled.
The oversized Resume/Options section gaps are removed to make room without
extending the button list into the surrounding pause-menu information.

## Giant Earth expansion starts

YnAMP **Giant Earth** (180x94) has bespoke true starts for **all 45 added
civilizations**. Version 114 preserves every primary homeland and adds nearby
alternatives: **43 civilizations have five starts each**, **Exploration Taino
has four**, and **Tahiti has two** (221 locations total). Small islands retain
fewer starts rather than changing geography or moving to a distant homeland.
Every pair in a civilization's set is **2-4 hex tiles apart**, on playable
source-map land in the same geographic region. The alternatives minimize total
distance from the original start, which remains YnAMP's first choice.

| Civilization | Homeland | Primary tile (X, Y) |
| --- | --- | --- |
| Iberia | Northeastern Iberian Peninsula, Tarragona region | 10, 57 |
| Britons | Eastern Britain | 12, 73 |
| Suebi | Elbe basin, ancient Germania | 20, 71 |
| GoTurks | Orkhon-Selenga region, Mongolia | 75, 72 |
| Caralans | Supe/Huacho coastal valleys, Peru | 151, 27 |
| Wagadu | Koumbi Saleh region, southeastern Mauritania | 9, 42 |
| Javanese | Central Java | 82, 25 |
| Slavic | Polesia/Pripet region | 31, 70 |
| Orinoco | Orinoco basin, South America | 161, 39 |
| Thrace | Upper Hebros, Plovdiv region | 29, 60 |
| Scythia | Lower Dnieper steppe, Kamyanka region | 37, 67 |
| Nordic Communities | Funen, Voldtofte/Odense region | 20, 74 |
| Picts | Moray Firth/Inverness region | 9, 81 |
| Zimbabwe | Great Zimbabwe/Masvingo | 30, 16 |
| Byzantium | European shore of the Bosporus, Constantinople region | 31, 60 |
| Ayutthaya | Chao Phraya basin, Ayutthaya | 75, 42 |
| Aztec | Tenochtitlan, Valley of Mexico | 138, 49 |
| Mohawk | Mohawk Valley, west of Albany | 154, 68 |
| Franks | Aachen, Carolingian heartland | 16, 69 |
| Seljuks | Konya region, central Anatolia | 35, 57 |
| Rus | Kyiv, middle Dnieper | 33, 69 |
| Lombards | Pavia, western Po valley | 18, 62 |
| Timurids | Samarkand | 55, 60 |
| Venice | Venetian lagoon | 21, 62 |
| Almohads | Marrakesh | 7, 47 |
| Khwarazmians | Lower Oxus, Gurganj/Urgench region | 50, 61 |
| Papal States | Rome region | 20, 58 |
| Taino (Exploration) | Central Hispaniola | 155, 47 |
| Ashanti | Kumasi | 11, 34 |
| Wafdist Egypt | Cairo, Nile floodplain | 30, 47 |
| Serbia | Belgrade | 27, 62 |
| Indonesia | Jakarta, western Java | 80, 26 |
| Portugal | Lisbon, Atlantic Iberia | 4, 55 |
| Hungary | Budapest, middle Danube | 26, 64 |
| Tahiti | Tahiti, Society Islands | 123, 23 |
| Gran Colombia | Bogota region | 156, 37 |
| Vatican City | Rome region | 20, 57 |
| Amazigh | Tafilalt/Erfoud, southeastern Moroccan Atlas foothills | 10, 46 |
| Sweden | Stockholm | 24, 79 |
| Afghanistan | Kabul-region valley | 53, 57 |
| Kazakhs | Turkistan, Syr Darya region | 55, 62 |
| Scotland | Edinburgh | 10, 78 |
| Dominican Republic | Santo Domingo, eastern Hispaniola | 156, 47 |
| Haiti | Port-au-Prince, western Hispaniola | 155, 46 |
| Brazil | Rio de Janeiro | 167, 22 |

These are map-scale homeland approximations, not claims of exact ancient
capital coordinates. Early Slavic origins and the identification of Koumbi
Saleh as Ghana's capital are debated. Wagadu does not start in modern Ghana;
the Suebi start reflects their earlier Elbe homeland rather than later Galicia.
Caral's location is documented by [UNESCO](https://whc.unesco.org/en/list/1269/);
the [early Slavic homeland discussion](https://www.encyclopedia.com/humanities/encyclopedias-almanacs-transcripts-and-maps/slavs-and-early-slav-culture)
explains the uncertainty for Slavic origins.

Where a city marker falls on water or mountains at this map scale, the start
uses nearby land in the same homeland. Papal States and Vatican City use
neighboring Rome-region cells; overlapping historical homelands remain subject
to YnAMP's placement rules. Tahiti uses the actual Tahiti island tile, even
though the source map groups it under its internal `MELANESIA` continent ID.

Compatibility activates only with YnAMP enabled and leaves other maps and
community civilizations, including the separate community Wagadu, unchanged.
Enable true starts in YnAMP when creating a new Giant Earth game; existing
games are not relocated. These entries were prepared in version 103; version
104 adds the playable civilizations themselves. Version 112 adds Iberia's
peninsular start; version 113 completes coverage for every added civilization,
rather than relying on random placement or a donor civilization. Version 114
registers the additional locations as native YnAMP `AlternateStart` rows for
overlapping/duplicate starts. YnAMP still applies its placement checks and
fallback rules; these are candidates, not five simultaneous capitals.
Regenerate alternatives from the installed source terrain with
`node tools/build-giant-earth-starts.mjs` (`YNAMP_PATH` may override its modules
directory). Generation runs during development, not during game turns.

## Permanent civilization switching (version 102)

Open the pause menu and choose **Switch Civilization**. The map temporarily
hides the HUD and every visibility layer except territory, country names and
civilization icons. Hover another surviving major civilization's territory to
shade everything outside it; left-click to take permanent control. Your former
civilization becomes AI-controlled. Right-click, Escape or the top-left X
cancels and returns to the pause menu. Map visibility preferences are restored
when the picker closes.

Save first. This is available only in single-player, non-hotseat games with
autoplay stopped. The picker never starts autoplay or explicitly advances a
turn; normal native turn processing resumes under the new civilization.
Save/reload persistence and actual control of the new civilization's units
were verified in Civ VII 1.5.1 using a disposable game.

## Brighter dotted fronts and map controls (version 101)

Both war-front gradients are now brighter and dotted, with aligned red and
orange-red dots spaced 32 screen pixels apart at standard UI scale.
Dot spacing and thickness remain screen-sized as the camera zooms.
The shared curves, land-only restriction and **War names** checkbox are retained.

The map-view exit X and main-game **Open Map** button have been removed.
Automatic opening/hiding, the minimap, Victories integration and native map
shortcut keep their existing behavior. Permanent civilization switching was
added separately in version 102.

## Layered land fronts and peacetime-independent names (version 100)

War fronts now meander smoothly along shared land-to-land borders. A thicker
red gradient overlays an even wider orange-red gradient on the identical path,
with translucent stroke bands softening both edges. At standard UI scale,
the red core is 5 pixels wide and the orange-red halo reaches 24 pixels;
stroke widths remain screen-sized as the camera zooms.
Ocean, coastal-water, lake and navigable-river tile borders are excluded.
The **War names** checkbox still controls both layers and the war labels.

War/peace no longer affects country names. The war-based naming rule,
activation conditions and catalog filter have been removed, and old cached
country names regenerate. Other naming conditions retain their priority order.

## War overlay visibility (version 99)

The **War names** visibility checkbox controls both existing war-name labels
and red lines along shared territorial borders between civilizations at war.
It works independently of ordinary borders, territory fills and geographic-name
controls. Unrevealed borders remain hidden under fog. Fronts update when war
ends or ownership changes, with cached geometry during camera movement.
The minimap suppresses the overlay without changing the full-map checkbox.

## Country-name word variants (version 98)

Country-name cleanup now removes repeated word families, including plurals,
possessives, government adjectives, directional variants and configured
country/capital adjectives. For example, "Federal Federated Federation" becomes
"Federation" and "Roman Republic of Rome" becomes "Roman Republic".
The government noun is retained instead of its redundant adjective.
Duplicate-country qualifiers use the same cleanup, and cached names refresh.

## Map controls, country names, and realistic walkers (version 97)

Visibility controls now independently switch Island names, Body of Water names,
Mountain names, Rivers, Roads, Building dots/squares, and Unit dots/squares.
Dot switches retain unit icons and townscapes. Road geometry and connecting
branches never enter ocean, coastal-water, or lake tiles; navigable-river
crossings remain allowed. Current capitals have a filled star before their map
label; former original capitals have a hollow star.

Country names are disambiguated deterministically. Map labels use the selected
one-word base only when no other country shares or mentions that base; other
interfaces retain full names. Expanded cultural/capital roots and geography,
citizen-population, and religion rules feed the new **Country Names** tab
in Victories. It lists evaluator-produced names, example activation conditions,
priorities, search, condition-exclusion filters, and bounded 40-name pages.
Custom capital/religion names can produce additional names.

Mississippian names use their current capital as the base, including Cahokia.
Rome's special Roma/Rome-capital override applies only to Roman civilizations
with at least five settlements: Roman Republic for republics, otherwise
The Roman Empire. There is no Roman Kingdom override; smaller Roman countries
use ordinary government-appropriate naming.

Military walkers form military formations only after participating in recorded
combat on the displayed turn, including defenders. Wounds or nearby enemies
alone do not qualify; older recordings without combat metadata remain loose.
Combat eligibility updates without rebuilding the walking network.
At 1x, autonomous and commanded walkers travel 3 mph (4.4 feet/second) at the
displayed 100-miles-per-tile scale; cavalry travels twice as fast. Zoom does not
change ground speed. The 1-5x controls and pause remain available.

The Chronicle clock also deduplicates delayed native-release and DOM-mouseup
tails in either order and clears stale panel visibility when opened.
Native Gameface appearance and event delivery still require in-game acceptance.

## Native population displays and renderer repairs (version 96)

The native unit command panel displays simulated Manpower. The production
chooser displays Population directly below the settlement name, totaling the
Population panel's people on that settlement's purchased tiles, including units
on those tiles. Both displays use the latest recording even during historical
replay. New unit records retain native identities so identical units cannot
exchange counts; older records request a fresh capture instead of guessing.

Arched labels now use Gameface-supported flex children and fixed-decimal
transforms, including curved single-word Latin names. Each line retains at most
eight paint runs, joined scripts stay shaped together, and fitted multiline
labels retain their separation. Persistent Regions selections take precedence
over hover; all other known, visible areas retain the same feathered shadow,
with large contours batched rather than omitted.

The World Chronicle clock suppresses delayed duplicate native/DOM activations
and its closed tooltip reads "Open the World Chronicle Panel". Workforce
notifications show the actual signed yield delta, for example "(+1 Science)",
instead of the simulated-count disclaimer. Palace leadership titles follow the
recorded government, with Consuls in republics rather than royal titles.
Malta is mandatory at Valletta's Giant Earth location without absorbing Sicily
or the surrounding sea.

Fully restart Civilization VII after installation. Native panel appearance and
Chronicle activation still need in-game visual acceptance.

## Earth regions and map presentation (version 95)

Giant Earth merges West Asia into Middle East, South Europe into Central North
Africa, and residual Mediterranean land into neighboring European/North African
regions. The Mediterranean Sea remains unchanged. North Africa is now Central
North Africa; Siberia and North Asia each have Western/Eastern divisions,
separated near the Yenisei.

Central America starts two tiles farther south, except Baja California, and ends
at Panama before Colombia. Western Arctic America includes Alaska and its
Aleutian islands and southeast panhandle.

The Regions panel has expandable continent headings and population-descending
areas within each continent. Exact-name groups remain combined. Cross-continent
areas use their largest known continent share; areas without known continent
tiles appear under Water and other areas. Search reveals matching children,
and filters, fog protection, selections and the 40-row pool are retained.

Label arches follow measured word widths with stronger curvature, bounded
paint runs, cached layouts and extra interline clearance. Major-player diplomacy
banners receive Map View colors when their models are created, including
fallback banners; native leader models and independent powers are untouched.
Native in-game banner appearance still needs visual acceptance.

## Calendar dates and map labels (version 94)

Dates in the Family Tree, family and world histories, notifications, map title,
scrubber preview, Realistic calendar HUD and Skip Ahead displays use calendar
dates followed by turn numbers, for example `4000 BCE (Turn 1)`.
Season and month names are preserved. Dates before the first retained record
are marked `before Turn ...` rather than assigned an invented turn.
Date-entry fields still accept plain years such as `3000 BCE`.

Civilization icons stay in the capital's connected territory; a wholly hidden
capital component cannot transfer its icon to a visible detached holding.
Long country labels reserve space between arched lines and use outlines
proportional to their fitted text size. Settlement defense bars hide at full
health, and movement badges show only when the turn count changes.

Diplomacy hanging-banner tint hooks and shared geographic war-name integration
are included, but still need in-game visual acceptance. Native enemy-hover
combat estimates and the red movement-style attack path remain unfinished.

## Visible townscapes, diplomacy colors and Earth refinements (version 93)

Collision-checked townscape roofs now appear progressively while minor-road
and entrance routing continues, instead of waiting for the whole scene.
Camera-only changes retain that work; finished roads, roof outlines, labels
and walking networks still wait for their own preparation.

The actual local/other-player diplomacy panels use their respective Map View
colors, including the native frame tint that previously bypassed player-color
variables. Deferred native recolors are corrected without changing game data.

Greece includes slightly more of the southern Balkans. The Malayan Peninsula
includes its narrow Thai tail rather than leaving it in Southeast Asia.
Arctic America follows
the northern tundra/snow frontier and uses a more balanced east/west split,
preserving named islands. North America ends at the head of Baja California,
with Florida retained in the eastern division. Australia is divided into
Western Australia and Eastern Australia, with Tasmania in the eastern division.

## Consistent X controls

Mod-added X controls share a circular red button with a white X, including
panel close buttons and the map-scale reset; existing actions are unchanged.

## Earth subdivisions, geographic filters and native colors (version 92)

Giant Earth redistributes the former Northern Europe, Central Africa and
North America regions into neighboring subdivisions. Siberia spans northern
Asia from each longitude's first tundra tile to the Arctic coast, with North
Asia directly south of it. Where biome data is unavailable, the fixed-map
80th source row is the fallback boundary. Specific island names remain intact.

The Regions panel includes **Mountains**, **Rivers** and **Continents** filters
alongside Regions, Islands and Water. Exact matching names share one row;
overlapping records count each known tile only once. Feature and continent
selection supports the same fog-safe highlighting and offscreen arrows.

Native leader/civilization colors no longer fail when Gameface lacks
`style.getPropertyPriority()`: priority is read from serialized declarations
instead, retaining native-style restoration and the Map View color pair.

## Country labels and Earth-region naming (version 91)

Arched labels now keep whole words together and use natural font spacing,
instead of assigning equal widths to differently shaped letters. Rendering
still uses at most eight text runs per line.

Native leader/civilization identity backgrounds and color variables now use the
same per-player primary/secondary pair as Map View, including duplicate civs.
Native contrast variants are regenerated from that pair; neutral UI styling,
independent powers, saved identity data and engine world-map colors are unchanged.

Grand dynastic names such as **Great Han**, **Great Ming/Da Ming** and
**Great Qing/Da Qing** require **eight settlements**. Historical alternatives
use conventional dynasty/kingdom names rather than assuming a reunification
from settlement count. Optional Great/Grand qualifiers also require eight;
proper names such as Great Britain are unchanged. Country names never combine
**Imperial** and **Empire**. The Roma/Rome four-settlement exception is unchanged.

**Arabia**, **Greece**, **Eastern/Western Central Africa** and **Eastern/Western
North Africa** are mandatory Giant Earth region names, alongside **North Africa**.
North America and Arctic America each have mandatory **Eastern/Western**
divisions. **Siberia** is separate from the remaining **North Asia**.
Unmatched regions use containing geographic
areas, including descriptions such as Pacific Ocean Islands or Inland Waters
of Central Asia, rather than blank labels or invented proper names. Mainland
regions remain connected; islands, island chains, Antarctica and naturally
grouped mountain features may span gaps. Exact matching names share one row
in the Regions panel without changing their physical partitions.

Advanced Setup defaults remain **Score Victory off** and **Apex Civilization
Transition**. Boolean defaults are stored numerically for the native setup UI.
Saved setups and player-selected options are not forcibly reset.

## Setup, map layers and accelerated speeds (version 90)

New games default to **Giant Earth** when YnAMP supplies it, **Long** ages,
**no age-end countdown**, **score victory off**, and YnAMP natural wonders at
**real-world locations only**. These remain editable setup choices and do not
change existing saves. Without YnAMP, the existing map default is preserved.

The **Units** checkbox also hides unit icon circles and their click targets,
without hiding building or resource icons. Required Giant Earth regions now
include North Africa, Western/Central/Eastern Europe, The Balkans, The Malayan
Peninsula, Corsica and The Balearic Isles.

**Realistic x2** through **Realistic x6** advance calendar time N times faster
and scale research, civics and celebrations to 1/N of Realistic, with integer
rounding. Age turn budgets are rounded up. Production, growth and other
speed-adjusted costs use **Marathon-equivalent pacing on all Realistic speeds**,
including the base speed; movement points are not multiplied. Skip Ahead dates,
the native calendar and recorded life-years follow the selected multiplier.
Choose a speed when starting a new game; existing recordings retain their dates.

## Decorations at the 1000-foot map scale (version 89)

As soon as the displayed scale drops below **1000 feet**, townscape decorations
upgrade from tiny preview marks to readable full artwork, even while people
remain in crowds or the map is vertically compressed. The threshold uses the
same rounded distance, viewport width and UI scale as the map-scale indicator.
Cached placements upgrade on the first bounded decoration update rather than
restarting placement work. Fog, the decorations checkbox, collision footprints
and native drawing budgets are unchanged.

## Branching river deltas and readable headings (version 88)

Merged navigable-river deltas have a meandering trunk, two main distributaries
and four tapered secondary mouths rather than a simple three-pronged fan.
Their full channels reserve collision water; shared roots, wrapping, fog and
native drawing budgets remain enforced. Minor-river deltas are unchanged.
The shared dark text outline now covers panel titles and body text as well as
controls, including Skip Ahead's expanded and minimized Autoplay headings.
The ornate gold artwork and existing text colors are preserved.

## Occupation narratives and lighter notifications (version 87)

Fading notifications, civilization timelines and World Chronicle use the
country names generated for the event's recorded turn. Yield-related events
describe actual changes in simulated workers, for example **Roma (Roman Republic)
hired 500 new scholars**, rather than yield-point changes. Worker losses are
reported as losses, unchanged workforces produce no hiring event, and records
without occupation counts explicitly say the count is unavailable.

Notification rows are created only when needed. Their heights are measured
once per new message or viewport/scale change, not during every fade tick;
layout reads are batched before animation writes. Idle/hidden rows avoid
redundant style updates. The live feed seeks recent events instead of scanning
all history, and its temporary timeline releases already-delivered history.
Queued events, four simultaneous notices, overlay pausing and the existing
4.2-second lifetime are preserved.

Joined tile-edge navigable rivers have a moderately stronger meander while
retaining exact shared endpoints and the same channel widths and topology.

## Heap-crash mitigation and map presentation (version 86)

The November 16 04:03 crash dump reports V8 out-of-memory near a 128 MB
JavaScript heap ceiling. With user approval, the local game's backed-up
`AppOptions.txt` now sets `Script_UI_MaxHeapSize 512`. This supported setting
requires a full game restart; it is a maximum, not a 512 MB reservation.
Gameplay heap settings are unchanged. The mod does not change this preference
automatically on other installations. No individual leaking cache was isolated,
and raising the ceiling is not proof that all long-session memory growth is fixed.
Skip Ahead's Stop control also uses a supported display value instead of
repeatedly generating native `inline-block` warnings.

Townscape preparation survives equivalent marker redraws. Circle icons remain
full-sized until the corresponding town geometry is committed and visible, then
refresh immediately. Leadership's crown and circle border match neighboring
soft-white/blue controls. Shared ornate controls retain their artwork with
heavier, dark-outlined text for contrast on gold backgrounds.

Earth rivers additionally use city landmarks from the matching map projection,
reject distant reused city names, and preserve native river names outside atlas
coverage. Unknown rivers are not assigned invented Earth names. Navigable
river tiles render as connected, slightly wider hex-edge channels rather than
all-adjacency meshes. These channels approximate the recorded river footprint,
not native flow-direction metadata; fog, wrapping, minor-river connections and
close-up deltas remain supported. Existing saves keep their physical rivers.

## Detached country labels and tile regions (version 82)

Each disconnected land territory of a major civilization can display its country
name, using the same name, territory containment, collision handling, typography,
arches, scaling, and **Civilization labels** checkbox as the main label. Tiny fragments
that cannot fit a label remain unlabeled. Ownership and capital changes update
the connected groups; fog can hide label tiles but does not split a connected
country into extra groups. Horizontal map wrapping preserves land connections.
The visible capital-containing group is primary, otherwise the largest visible
group is used. Civilization emblems remain single per country rather than
repeating with each extra label.

Tile hover tooltips include **Region: name** in both live Map View's native plot
content and historical replay tooltips, independently of map-name visibility
checkboxes. Hidden tiles disclose nothing; revealed tiles can show their region
without revealing unseen units. Native tooltip content remains intact.

The circular **Regions** map button sits immediately left of **Population**.
Its searchable, paged list shows known region/island/water names, visible tile
counts, settlement names and citizen counts, simulated regional population
using the Population Panel's people, and each civilization with territory there.
Same-named island groups appear as one row with combined statistics across their
disconnected pieces. Other regions retain separate rows. Hover, selection and
the offscreen arrow target every piece of a grouped island row.
The **Regions**, **Islands**, and **Water** type toggles combine with text search;
all types are initially included. Filtering preserves a clicked selection.
Fog-hidden tiles, cities, and populations are excluded. Rows are pooled in
pages of 40 to bound native UI allocation.

Hovering a row temporarily highlights its region; clicking selects it until
deselected, cleared, or the panel closes. Hover takes priority over selection,
then selection resumes when the pointer leaves the row. This panel highlight
works even with **Region Boundaries** unchecked. If every known fragment of the
highlighted region is offscreen, a blinking selection arrow points toward it
from the map edge, avoiding controls and choosing a nearby wrapped direction.
The arrow disappears when any known fragment enters view. Map closure, hidden
fog, and native game overlays suppress the effect.
The map-history clock glyph is larger within its existing circular button;
proportional insets keep both its normal and slashed states inside the circle
at different UI scales without clipping. Population uses a soft-white, default-user
head-and-shoulders icon. The Regions panel reuses the ornate gold-framed theme,
decorated heading, and shared icons for controls, names, population, settlements,
and territory. Future UI follows the same shared style.

## Connected regions, compatible curves and country-name variety (version 70)

Country labels contain no repeated words and at most one government noun.
Country-name cleanup uses Gameface-compatible word matching: unsupported
Unicode-property regex syntax no longer interrupts map labels, Population,
or native civilization-name updates.
Native civilization labels refresh at turn start using the same full-map names
as fog-off Map View. A capital named **Roma** or **Rome** takes precedence over
every other naming rule: **Roman Republic** for a republican government;
otherwise **The Roman Kingdom** below four settlements or **The Roman Empire**
with four or more. Duplicate countries can sometimes use their occupied region
or island instead of a north/south qualifier. Wars use the regions on both sides
of the involved land border.

Country icons choose between the native emblem and four original, civ-specific
silhouettes for each of the 50 built-in/DLC civilizations, with no repeated
alternative artwork across civs. One seed is saved per game. Adjacent countries
of the same culture receive different alternatives, using the native emblem
as a fifth choice only when four alternatives are insufficient. Selection uses
the full border graph, not visible territory, camera position, government, or
country name. It is deterministic on reload and replay; border or civilization
changes can require reassigning icons. Graphs needing more than five emblems
are reported rather than silently assigning conflicting neighbors.
Rome's alternatives are a tower shield,
a crested helmet, the Colosseum, and an SPQR standard. Unknown modded
civilizations retain their native emblem. Alternatives use pooled inline SVG,
not repeatedly registered engine images, and follow the Civilization icons
checkbox and existing fog/territory placement.
During active games, existing native civilization-icon surfaces use the same
selected artwork. Player-tagged diplomacy entries, district emblems, diplomacy
headers and local endgame displays resolve the corresponding player; displays
with only a civilization use the lowest-numbered matching player's emblem.
These UI choices follow the latest recorded turn, not a historical replay position.
Native layout and input remain intact; identity tint follows the shared palette.
Leader, unit, building and resource
art is unchanged, and main-menu/save-load icons retain their native artwork.
Native UI emblems are independent of the Map View visibility checkbox.

The 63 default major-player slots have distinct, stable Map View colors,
including duplicate civilizations. Both territory fills and secondary
icon/border colors are tested for perceptual spacing. Native leader/civ UI now
shares that palette; engine world-map colors and independent-power/barbarian
styling are unchanged. With 63 colors, icons and
labels remain important identification cues, particularly for color-blind users.

Fixed stock Earth (106 x 66), YnAMP GiantEarth (180 x 94), GreatestEarthMap
(104 x 64), and validated crops of those YnAMP sources use projection-specific
Earth region and water landmarks. Unsupported projections retain procedural
names; nearby landmark matching is not a complete real-world watershed atlas.
Subcontinent/region labels follow **Subcontinent and region names**; named
island and water-region records follow **Island, water-body and mountain names**.
River labels retain their separate checkbox. Geographic labels remain available
at townscape zoom, and sea labels stay within their visible water tiles.
Label pools are viewport-culled and bounded, and refresh after camera movement
settles rather than rebuilding on every pan frame.

Population has a geographic division below each continent, while existing
tile/home/person identities remain stable. The simulated world-population
baseline is seven times its previous value. City details show the simulated
civilian population in parentheses without changing gameplay citizens.
Civilian occupation shares follow recorded settlement yields, and yield-change
chronicles report workers gained or lost rather than yield-point differences.

Recorded city defenses have linear bars, unit circles have health rings, and
fortified units have map fortifications. Older recordings without defense
health do not invent a health value. Movement captures are coalesced immediately,
and disabled movement arrows explicitly hide retained SVG geometry.
Camera movement is available during settlement growth/plot selection.
Health and fortification paths reuse bounded pools; AI-turn decorative
suspension and camera-settle protections remain in place. Zoomed-in marker
placement includes only viewport and adjacent tiles; repeated refreshes resume
the pending layout instead of restarting it. Townscapes wait for that layout
before their first commit, and icon circles retain a 16-pixel minimum even at
townscape scale. Road planning does not retry unchanged blocked town pairs.
The town-link planner reads scene and neighboring tile indexes instead of
scanning every road and river in the world. River context includes road endpoint
neighbors, and bounds include bent road spines so their bridge crossings remain
intact. Distant rivers are not passed to the local pathfinder.
Dry-road trimming, dense bridge candidate searches, building acceptance, and
entrance routing now resume in batches of at most 64 steps, yielding after
eight milliseconds between steps instead of synchronously processing every
roof while zooming, with at least 16 milliseconds between continuation callbacks.
All valid approaches are retained; pending scenes resume
without restarting and are discarded when their scene changes or Map View closes.
The latest Windows report identifies an application hang while zooming, not a
confirmed renderer crash; an in-game retest is still required to verify whether
these bounded-work fixes resolve it.

At townscape scale, every visible physical river endpoint (including inland
ends) fans into three deterministic meandering channels with pointed, tapered
tips instead of a semicircular cap. Internal joints, city-dot clipping, and fog
boundaries do not create extra mouths. Branches retain the river's water/fog
colors, wrap with the map, and reserve water corridors for townscape collision
checks. Only viewport-intersecting delta polygons are submitted, within native
SVG budgets; zoomed-out river lines retain their existing appearance.
The v72 native retest still failed after reaching building-footprint preparation.
Version 73 replaces that stage's unbounded custom grid enumeration with the
existing bounded collision index, including its oversized-footprint safeguards.
It also avoids passing the complete roof-area array as function arguments during
subdivision. A further native retest is required; the crash is not yet confirmed
resolved.
The v73 retest progressed through entrance routing and reached geometry
submission, but still failed before a settled commit. Version 74 also batches
local walking-graph construction, approach attachments, edge scoring, and the
combined walking network. The completed network is prepared before geometry
publication and handed to the people renderer without a second synchronous
build. Cancellation or preparation errors leave the running network intact.
Focused tests compare all nodes, edges, costs, destinations, and river
restrictions with the synchronous result. Native crash resolution remains
unconfirmed; commit-stage diagnostics distinguish roofs, decorations, and
people in the next retest.
The v74 retest exposed a visibility regression: town geometry waited for the
walking network to finish. Version 75 displays the prepared roads and roofs
first, then builds the walking network in separate bounded batches. Existing
walkers remain paused until that network is complete; its failure cannot hide
the townscape. Map closure and scene replacement cancel obsolete walking jobs.
The loading placard now says "Loading...". Dated event cards in the world,
civilization, and family timelines expand automatically on hover or keyboard
focus. Click/keyboard collapse remains available during the same hover, and
hovering never seeks to another turn.

The v75 retest still ended in a user-reported crash during zoom/pan, after
geometry and walking-network preparation had completed. Version 76 also batches
decoration obstacle indexing and candidate placement, yielding even when every
candidate is rejected. Separate, cancelable decoration jobs cannot hold back
the prepared roads and roofs. Contained camera changes reuse physical placements
instead of rebuilding the collision index.
At the exact aspect-aware, maximum-zoom-clamped crowd-dispersal threshold,
decorations switch from preview dashes to complete artwork. Detailed artwork
uses screen-space SVG coordinates, a three-pixel readability floor, and sampling
that preserves each visible decoration category within 8,192 commands and
262,144 characters. Physical sizes, walking/collision footprints, water checks,
and simulation counts remain unchanged. Stale screen-space artwork hides during
camera motion and returns after the settled refresh. Native crash resolution
still needs an affected-save retest; the available logs do not establish the
faulting native component.

Version 77 applies the text-arching option to island, subcontinent, region,
and water-body names, not just land-region names. Geographic text uses explicit,
bounded HTML run boxes and a native paint font of at least 16 pixels before
map scaling. Non-river geographic fonts stay between 10/11 and 24 UI-scaled pixels,
with vertical compression compensated so close zoom cannot flatten or stretch
names out of view. Collision reservations include the compensated label bounds.
Region/geographic visibility checkboxes, fog filtering, and the arching toggle
continue to work independently; river names retain their river-following layout.
The separate user-reported v76 townscape-entry crash remains unresolved by this
geographic-text update.

Version 78 preserves location-based Earth mainland regions independently of the
procedural region budget. Giant Earth's many islands previously consumed that
budget, leaving whole connected continents with only a single regional name.
Geographic text now uses viewport-sized, untransformed HTML roots in Map View;
retained labels reproject immediately on pan/zoom without enlarging their fonts.
This avoids scaling and clipping enormous geographic text surfaces, while
preserving arches, fog checks, category toggles, and the map-space minimap layout.
Local validation uses the installed 180-by-94 Giant Earth atlas; native in-game
visibility still requires a retest. This does not resolve the separate
townscape-entry crash.

Version 79 fixes v78's Map View/minimap initialization failure
(`ReferenceError: syncGeographyLabelViewport is not defined`). The viewport
helper is declared at module scope rather than inside label placement.
A regression check compiles the complete playback module with that helper
exported, so extracting functions into test fixtures cannot hide a scope error.

Version 80 matches geographic text to the working country/settlement label
style: bold sans-serif, explicit visible text, and a transparent background.
Region boundaries rendered correctly while the former geographic text style
remained invisible in the native game, even with arching disabled. The affected
Giant Earth retest now confirms visible geographic names. Bounded UI.log entries
record available geography, placed label counts, and viewport/label positions
when geography or category toggles change, not on every camera movement.

Version 81 adds Giant Earth source-coordinate landmarks for Britain, Ireland,
Antarctica, Greenland, Iceland, Madagascar, Borneo, Sumatra, Java, Philippines,
Hawaiian Islands, New Zealand, Australia, Taiwan, Sri Lanka, Cyprus, Sardinia,
Sicily, Italia, Anatolia, Scandinavia, and Korea. These names are prioritized and
not discarded just because overview labels collide; fog, viewport culling, and
the region/geographic-feature checkboxes still apply. Dense overview labels can
overlap, so zoom in to separate them. Exact full-map dimensions also permit
fixed landmarks before optional atlas metadata becomes available; cropped maps
still require their validated source-coordinate context.
Version 85 also reserves mainland regions for India, Southeast Asia, and Iberia
at their Giant Earth source locations, independently of optional atlas metadata.
Validated Giant Earth crops inherit these landmarks where the land is present;
named islands such as Sri Lanka, Sumatra, and Borneo keep their own names.
Jamaica is likewise reserved as a required island region at its own location.

On fixed Earth projections, geographic names are unmodified real-world names,
not procedural adjectives or saved fantasy names. Unmatched features remain
unlabeled rather than receiving an invented mountain, island, or lake name.
Mountain components bridge a single intervening hex, but different real ranges
keep their own names. Chains consisting exclusively of 1-3-tile islands share
one region when connected through coastal marine water, surrounded by ocean,
and isolated from larger landmasses. Pacific chains use real regional names such
as Melanesia, Micronesia, and Polynesia where their source locations match.
All land components touching Earth's bottom row share one Antarctica island;
intervening water remains water.

With **Region Boundaries** enabled, hovering a known map region leaves that
region clear and dims all other known regions with a strong, 72%-opacity
dark-grey overlay. Layered screen-space edge strokes provide a soft feather
without native blur filters or additional canvas paints. Labels and controls
remain above it. The effect clears over controls, unknown tiles, during camera
changes, on mouse leave, and when the checkbox or Map View is closed; it refreshes
after a settled camera change. Geometry is cached within the same hovered region
and clipped to the viewport even at extreme zoom. Exceptionally fragmented
contours exceeding the hard native budget are omitted with an explicit warning.

Native UI icons follow the map's owner-specific emblem even when a native slot
still references an earlier civilization. Only custom artwork inside diplomacy
panels is scaled to 75%; ribbons, other screens, and native emblems retain their
size. UI country replacement consumes repeated government suffixes, including
the Maurya Tribal Alliance case, without changing leader titles. Country names
keep only one government noun. Fully and exclusively controlled named land
regions become optional country-name roots, considering every detached piece
and unclaimed tile; Roman-capital and historical overrides remain authoritative.

Townscape decoration previews start twice as far out as in v80. Close-up scenes
can display up to 1,024 complete silhouettes instead of 512, using actual path
costs and interleaved categories. Complex scenes may show fewer: the existing
8,192-command, 262,144-character, 6,144-placement, and incremental work limits
remain unchanged. This does not claim to resolve the separately reported native
townscape-entry crash.

Region boundary directions now match Map View's hex edges rather than the
native direction enum order. Subdivision uses connected graph floods, including
across map seams and winding coastlines; detached pieces remain separate regions
even when that exceeds the target region count, except for the explicitly grouped
island chains and Antarctica described above. Every map tile belongs to exactly
one region, including islands, lakes, rivers and ocean tiles.

Arched country/region labels use HTML text runs instead of SVG text paths, avoiding
the missing text and stray diagonal-line rendering problem in the game UI.
Each line has at most eight whole-word runs with natural horizontal spacing,
so long names do not create an unbounded number of transformed character
elements. The arching checkbox still works.

Country names have expanded government-compatible formats, descriptive qualifiers
and alternate cultural roots. Selection is deterministic for each country and
settlement-size bucket, not rerolled by redraws or leader changes. Historical
pre-state/dynastic forms, era overrides, small capital states and distinct
capital-derived roots are retained. Geographic qualifiers still compare canonical
roots, regardless of alternate names or government titles; directional terms
are not chosen at random. Outside the Roman-capital override, only despotisms
with more than three settlements can receive an Empire title.

Fully restart Civ VII after updating.

## Restored geographic names and curved labels (version 69)

Generated subregions cover every map tile exactly once. Mainland subregions are
connected and subdivided independently of water bodies, preserving islands,
lakes and continent boundaries. Islands, oceans, seas/gulfs, lakes, rivers and
mountain ranges receive stable automatic names, including on generated maps.

Region and geographic-feature labels share collision detection: a name is moved
within its own visible tiles or omitted when no readable space remains, rather
than drawn over another name. The partition still covers the full map when
crowded labels are hidden; zooming in makes room for more names.

Country/region text curves are restored and enabled by default. The **Country/
region text arching** checkbox still switches them off. **Island, water and
mountain names**, **Region names** and **River names** control their respective
labels. Whole-line SVG text paths avoid per-character DOM costs.

Fully restart Civ VII after updating.

## Map presentation, dated chronicles and shared country roots (version 68)

Diplomacy transitions show the fullscreen **Loading Map...** placard. Live Map
View tooltips use the native plot information at the hovered map coordinates,
while the original world tooltip is suppressed; historical tooltips still use
recorded information.

River tiles retain their recorded territorial ownership without artificial
shared wedges. Region names have an eleven-screen-pixel minimum size. Visibility
controls now include **Unit previous movement arrows**, **Region Boundaries**
(independent of continent boundaries), and optional **Country/region text
arching**. Arching defaults off and uses whole-line SVG text paths.

World Chronicle and timelines group events by date into expandable boxes.
Expanded groups show complete descriptions. Hovering or focusing a located
event highlights its recorded plots; events without recorded locations do not
invent one. Pages contain forty date groups and keep matching dates together.

Country qualifiers compare shared roots, ignoring government titles and
grandeur: Han, The Han Dynasty and Great Han can become The Western Han,
The Central Han Dynasty and Great Eastern Han. Distinct capital-derived roots
such as Roman and Ravenian remain separate. Fully restart Civ VII after updating
and verify the affected save.

## Persistent unit lenses and country-name corrections (version 67)

Native settler legends, trade choosers and continent panels no longer count as
full-screen menus. Selected-unit tile highlights remain visible across overlay
polls while these lens panels are open; real menus, historical playback and
deselection still hide them.

Version 67 compared complete unqualified generated country names; version 68
supersedes this with root-based comparison while preserving genuinely distinct
capital-derived names. Country-name caches are invalidated when naming changes.

Native UI name replacement now uses one pass over the original text, consumes
adjacent native articles and the trailing " Civilization" suffix, and never
re-translates inserted country names. Save/load originals remain unchanged.
Fully restart Civ VII after updating and verify the affected save.

## Menu transitions, unit selection and native lenses (version 66)

Native city/diplomacy panels no longer trigger generic mod-button scans.
Civilization-name rewrites share live names within each mutation batch, reuse
compiled patterns, ignore their own writes and avoid rescanning descendants on
unrelated class changes. Save/load names and explicit turn refreshes still work.

Unit-circle presses are captured before bubbling handlers. Their DOM and native
release/click tails remain owned even if selection moves the cursor or opens
another UI mode; a fresh press clears suppression.

Selected settlers and replacements show the native red blocked-land, yellow
legal non-freshwater and green freshwater categories. Traders color destination
territory green for available routes and red for unavailable routes. Missionaries
and replacements use native religion-spread destinations; other selected-unit
action targets mirror the game's available/temporarily-unavailable classifications.
Discovery units use the native lens selector, and explorer continent tiles reuse
the native continent classifications and colors. Only revealed tiles appear,
including when mod fog is disabled; highlights hide during replay or overlays.
All groups share a 1,170-polygon/262,144-character viewport geometry budget.
The legend reports truncation and only shows categories supplied by the game:
no invented yellow category for a native two-category action or trade lens.

Fully restart Civ VII after updating. Automated regressions verify these repairs;
confirm menu smoothness and selection/highlight behavior in the affected save.

## Country and region label repairs (version 65)

Country names now render as reusable whole text lines instead of individually
transformed, outlined and shadowed characters. This removes the decorative
character arch while preserving names, territory-fitting placement, rotation,
line wrapping and visibility controls. Zoom changes reuse the existing text
rows, and disabled civilization icons no longer run territory/boundary scans.

Switching Region names back on restores the parent layer's opacity immediately;
it no longer stays transparent until Map View is reopened. Fog filtering,
cached region names and townscape-zoom hiding remain unchanged.

The freeze-session renderer log reports command-set exhaustion. These repairs
remove label rendering pressure and a confirmed visibility bug; retest the
affected save after fully restarting Civ VII to confirm native stability.

## Zoom-out during turn changes (version 64)

Turn-resume redraws now wait for 250 ms without camera input, including a
recheck when their timer fires. Turn resume and settled-detail redraws catch up
to the newest recording before painting, rather than drawing the old turn first.
Each full map render cancels superseded detail, decoration, scatter, townscape
and turn-resume callbacks. Historical viewing keeps its selected turn.

This fixes a confirmed scheduling bypass in the reported zoom-out/turn-change
scenario. Windows recorded the latest failure as an application hang; its
crash dump was unavailable and the game restart replaced the session logs.
Native hang elimination still requires retesting the affected save.
Fully restart Civ VII after installing this update.

## Connected territory, ornate panels and target-date autoplay (version 63)

Shared river and mountain tiles use a connected central territory core with
side-joined edge partitions instead of wedges that meet only at a vertex.
Borrowed civilization colors connect to solid neighboring territory; adjacent
split tiles no longer swap colors across their shared edge. Full shared-tile
coverage, fog filtering, map wrapping, incremental redraws and actual gameplay
ownership are preserved. Each shared tile uses at most seven polygons.

Mod panels share the World Chronicle's navy-and-gold palette, double inset
frames, gilt headers and serif titles, including Population, Leaders, Family
Tree, civilization history, commands, formation pickers, visibility and Skip
Ahead.

Skip Ahead now selects an absolute target date rather than a duration:
- Choose the year with its slider or enter a custom year, such as `3000 BCE`
  or `1800 CE`. Negative years without an era also mean BCE; there is no year zero.
- Exploration adds a Spring/Summer/Autumn/Winter slider; Modern adds a
  January-December slider. Antiquity needs only the target year.
- **Begin Autoplay** runs to the chosen date and minimizes the panel. Its header
  retains progress, restore, close and a **Stop** control while running; the
  center pause/resume circle remains available.
- Targets must be later than the current date and within the current Age's
  Realistic calendar. Early Age endings, defeats, victories and session changes
  still stop the run. Errors restore the panel and are shown explicitly.

Save before starting: native AI decisions are permanent. Fully restart Civ VII
after installing this update. Automated and browser-mock checks do not replace
live-game validation.

## Chronicle narratives and scout discoveries (version 62)

Country names use "Confederacy" instead of "Confederacies", including previously
cached names. Civilization and World Chronicle events use historical narrative
wording rather than tile-count reports: territorial growth names the continents
or regions where land actually changed hands, when that geography is available.
Every civilization event has a brief, event-specific description based on the
recorded changes; unknown causes are not invented.

World Chronicle cards include a single-line description that ends in an ellipsis
when it does not fit. Hover or keyboard-focus the description to read its full
text in the Chronicle tooltip. Event seeking, highlighting, scrolling and
forty-event paging are unchanged.

Selecting a local scout highlights revealed discovery improvements in gold on
the latest live map, even with map fog off. The highlights refresh as discoveries
are revealed, added or collected, retain visible outlines when zoomed out, and
hide during replay or after deselection. Hidden discoveries remain hidden.
Autoplay behavior is unchanged.

## Lower renderer load and farther decoration previews (version 61)

Decoration previews begin at one-quarter of the townscape zoom threshold:
one tile need cover only a quarter of the viewport dimensions. A separate,
screen-sized SVG keeps previews visible before towns appear, below roads and
roofs, without starting town generation or walkers. Visibility switches, fog,
camera settling and map closure still apply. The 2-8-foot close-zoom scale is
unchanged.

Zoomed-out natural features are sampled before placement, reducing a
10,000-marker scene to 256 layout candidates. Natural features and islet
bands together are capped at 2048 commands / 65536 characters below a
48-pixel tile width, or 8192 commands / 262144 characters at closer zoom.
Offscreen islets are excluded before geometry construction. Preview and
dense simplified decorations no longer normalize or cache unused detailed
silhouettes.

The latest captured crash is an access violation with Intel's DX12 driver
and D3D12Core in its stack; the renderer reports command-set exhaustion.
These changes reduce mod rendering pressure, but cannot repair or establish
elimination of a native driver fault. Fully restart Civ VII and retest the
affected save. If DX12 still crashes, try the game's DX11 launch option and
check for an appropriate graphics-driver update.

## Denser decorations and navigation safety (version 60)

Decorations show tiny preview markers as soon as townscapes appear, then
transition to their physical 2-8-foot sizes at closer zoom. Up to 4096
decorations are submitted per padded viewport, eight times the old early-zoom
limit. Dense vegetation targets 256 times its previous candidate density,
with viewport-only generation, collision checks and level-of-detail sampling.
Adaptive shapes retain the combined 8192-command / 262144-character ceiling;
placements are bounded to 6144 and small pans reuse the existing scene.

During rapid navigation, newer captures and detail redraws wait for 250 ms
without camera input. Catching up to a new turn cancels superseded detail and
scatter work rather than submitting duplicate renderer batches; historical
viewing keeps its selected turn. This addresses overlapping rendering in the
reported fully-zoomed-out/panning/turn-change scenario. The latest renderer
log reports command-set and rendering-job exhaustion, but no new dump was
available; native crash elimination still needs affected-save verification.
Population rows also avoid unsupported mixed-unit CSS calculations and
`max-content` widths that were repeatedly rejected by Gameface.

## Map startup repair (version 59)

Remove a premature visibility update that stopped playback-module startup
with `Cannot access 'showNaturalFeatures' before initialization`, preventing
Map View from loading. Natural-feature visibility still updates through the
normal camera/render lifecycle after initialization. Regression checks now
execute the complete module and its DOM-ready Map HUD integration, not only
compile it. Fully restart Civ VII after installing this repair.

## Map rendering and Chronicle (version 58)

World Chronicle starts closed. Its clock-arrow circle gains a slash while
open, indicating that clicking closes it. Chronicle focus hides other HUD
roots, including newly created UI, with Gameface-compatible selectors.
Closing it or entering a game menu restores the native HUD styles.

Townscape labels hide immediately during camera panning and return after
250 ms without navigation input. Coarse hills, cliffs, forests and other
natural-feature markers hide at townscape zoom; terrain, waterways and
townscape decorations remain available.

The latest captured crash was a native Gameface/Renoir renderer access
violation, not a JavaScript out-of-memory exception. Detail geometry now
excludes offscreen areas and counts all six fog-gradient passes together
against command and character budgets. These protections reduce renderer
load; they do not establish that the native crash is eliminated. Fully
restart Civ VII and retest the affected save.

Opening diplomacy during Skip Ahead now stops the remaining autoplay request,
including paused autoplay, and waits for native player control to return before
opening the native diplomacy menu. If control cannot be confirmed, an explicit
error is shown instead of opening diplomacy in observer mode.
The map's loading cover releases when the leader scene is showing. When Classic
Leader Screens is enabled, a scene-wipe timeout also preserves its pending
first-meet-to-hub handoff instead of leaving every diplomacy panel hidden.
Version 115 coalesces Classic Leader Screens' duplicate animation-frame updates
and supplies a single, bounded timer fallback for its native transition updates
when rendering frames stall. It does not force diplomatic actions or report
failed scene/resource loading as success. The loading cover also releases after
ten seconds with an explicit diagnostic, rather than indefinitely covering the
native controls. During diplomacy, complete Map View render roots are suspended
without discarding them; unchanged HUD classes and hidden route geometry are
not rewritten on every overlay poll.

## Skip Ahead and focused map history (version 56)

The globe-turning circle opens **Skip Ahead**. Choose real turns or calendar
years plus Exploration seasons / Modern months, then Submit. **Save first**:
native AI autoplay controls your civilization, including research, construction,
settlements, territory, yields, diplomacy and wars. This is real turn processing,
not instant random placement or fabricated yield grants. It is single-player
only and stops for Age choices, victory, defeat, or a changed game session.
A centered pause/resume circle remains available during the skip even if its
panel or Map View closes; Cancel returns control. Calendar input requires
Realistic speed. Native autoplay timing still needs live-game verification.

Visibility fits its six columns when space permits and scrolls horizontally
on smaller screens. The history clock-arrow circle sits between Leaders and
walker pause while history is closed. Opening history docks a gold/navy
**World Chronicle** to the map's bottom, moves that circle into its header,
and hides other game/mod HUD content without discarding panel states.
Closing history restores the UI; game menus remain available.

The Chronicle's horizontal events ruler combines recorded civilizations into
one history above the scrubber. Hover or focus a notch for details, click it
to seek, use the wheel to scroll, and page through forty events at a time.
Its custom navy-and-gold scrollbar replaces the operating-system scrollbar;
drag its gold thumb, click the rail, or use arrow keys / Home / End.
During playback it follows the current turn's latest event, automatically
changing pages and scrolling; paused playback preserves manual browsing.
All events matching the displayed turn are highlighted during playback and
historical pauses; pausing at the actual live game turn removes highlights.
The combined world timeline requires Fog of War off to avoid exposing hidden
history. It builds incrementally and releases its world model on close.

Family timelines add adulthood, parenthood, age-sixty and widowhood events.
Civilization events include growth, yields, construction, wonders, pillaging,
first contact, suzerainty, celebrations, crises, governments and Ages.
New player-civilization events produce fading upper-center notices, without
replaying a historical backlog.

Natural features include grey-brown rocky fringes along recorded cliff edges
and nine smaller hill glyphs per sampled hill tile; both follow the Natural
features checkbox. With fog off, **Revealed terrain** displays soft dark-gray
gradients along unexplored boundaries and light-gray gradients along current
line-of-sight boundaries. These use a fixed set of retained translucent bands,
not per-edge gradient resources. Selected units and replacements highlight
native-classified, revealed destinations: settler suitability, trade territory,
religion spread, discovery/continent lenses and native action targets.
Colors and categories follow the game; vector budgets are shared across groups
and viewport filtering remains in force. The legend reports limited drawings.

Townscape decorations span 2-8 feet including their round outlines, using the
existing 100-mile tile scale. Their size is independent of town population or
layout radius; detailed and budget-simplified glyphs use the same physical size.
Townscape roads, roofs, creeks and rivers use screen-sized SVG viewports with
map-coordinate view boxes, avoiding subpixel CSS clipping at maximum zoom.

Mod windows start expanded; minimize/maximize controls use window glyphs.
Plain mod buttons use native frame assets, with icons and hover helpers.
The townscape compass is slashed when its next action disables arrows.
Country names collapse repeated articles and government titles, including
merging overlapping tribes/confederacies into **Tribal Confederacy**.
Older cached country labels are regenerated with the corrected naming rules.
Automated and browser-mock checks do not establish native renderer or
gameplay correctness; fully restart Civ VII and verify in game.

### Movable map scale

Drag the square four-arrow handle above the map scale to reposition it.
A smaller, translucent red **X** appears beside the handle only after moving
the scale; click it to restore automatic placement at its original corner,
clear of other panels. Arrow keys move the focused handle; **Home** resets it.
The position survives zooming and closing/reopening Map View for the current
session, and stays inside the map viewport when the window is resized.

## Townscape navigation and interface fixes (version 55)

Visibility controls now scroll horizontally, including with the mouse wheel.
Separate checkboxes control townscape buildings, decorations, parks/fields,
walls, quays, roads/bridges, creeks/pools, fires/accents, walker dots/crowds and
walker hats. Townscape labels keep their existing checkbox. These default on,
apply immediately without deleting simulated roads or people, and remain off
through camera changes until re-enabled. Hidden buildings and walkers are not
invisible click targets; visible hats remain selectable without their dots.
The townscape-road switch also hides major map roads at townscape zoom; their
normal overview visibility returns on zoom-out.

Townscape roads, roofs and decorations stay visible and transform with the camera
while zooming. Expensive replacement detail still waits for 250 ms of settled
input; screen-projected walker dots and labels refresh separately. Leaving
townscape scale still releases hidden structural vector geometry. Horizontal map
wrapping repaints fog-filtered terrain before yielding to the marker rebuild,
instead of presenting a black background while that rebuild is queued.

A compass circle at the map's middle-right appears only while townscapes are
visible. It toggles selection-style arrows to townscapes in the camera tile and
its six adjacent tiles, including offscreen directions. It starts off, respects
fog and menus, and uses one bounded SVG batch (at most 1,024 arrows).

Townscape road planning connects dry-reachable towns within each tile and joins
facing edge towns to adjacent tiles. Nearby major roads are preferred; otherwise
mini-roads connect their street gates. Compact offscreen road terminals avoid
generating distant buildings or walker worlds. Walking follows the actual road
spine, including bends, rather than a straight shortcut between homes. Water
restrictions remain enforced; unreachable dry connections are reported.
Major map roads taper to **20 feet across** between first townscape visibility
and 1.5 times that zoom, using the existing 100-mile tile scale. They regain their
overview width on zoom-out; minor roads retain their opaque visibility floors.

The confirmed `mapUnitIconInput is not defined` input failure is repaired by
putting unit-click handlers at module scope. An intact-module compilation
regression now checks scope, not just extracted functions. Delayed mouseup/click
tails no longer close Population entries or toggle circle controls twice.
At individual-walker zoom, occupation hats, crowns and symbols draw in rarity
order: common trades underneath rare occupations. Headwear has a separate
512-icon/128-path budget and clears with stale walker projections.

The civilization timeline circle now has an explicit SVG icon. Family and civ
timelines share an event-spaced ruler, one labeled tick per event, with detailed
tooltips and 40-event pages. Leadership section names follow the recorded
government. Duplicate country names gain deterministic collective and hyphenated
variants. Real Earth names bypass generated island suffixes and stale saved-name
rewrites, including an Antarctica spelling correction. Eleven more stock-Earth
landmarks use verified historical-start coordinates; projection guards remain.

Agriculture and Chiefdom now cost one tenth of their version-54 scaled values:
**220 science and 393 culture** in the base Antiquity trees, with integer
rounding. Later tiers are unchanged. Fully restart Civ VII; start a new game for
the updated database pacing. Native crash elimination and renderer behavior still
require confirmation in the affected save.

## Townscape performance and selection (version 54)

Unit-circle selections now consume their entire DOM/native click gesture, preventing
the following world click from immediately deselecting the unit or opening a city.
Civilization symbols hide immediately when townscapes appear and return on zoom-out
without changing the Civilization icons toggle.

Distant crowds show one eighth of their formation dots. At 3, 6 and 12 tile-heights
per viewport they reveal one quarter, one half and all dots respectively; the
crowd/individual split remains at 24 viewport heights. All people still simulate,
and group counts, selection radii and individually selected/pinned/commanded people
are preserved. The 7,200-member regression draws 900 distant dots instead of 7,200:
8,100 rather than 64,800 SVG commands.

Townscapes no longer allocate whole-town decoration grids while preparing walking
stops. Decoration placement is viewport-only, with smaller early-zoom budgets and
more detail closer up. Minor roads, main roads, connecting roads and house approaches
remain fully opaque, with minimum screen widths so subpixel strokes do not appear
faded. Their physical routes and collision widths are unchanged.

Telemetry records the 01:11 AM crash while zooming into townscapes, but its native
dump/package was already cleared. These changes remove verified allocation and
oversized-symbol/rendering hazards, not establish a conclusively identified native
fault. Fully restart and verify the affected scene in-game.

## Stability and event timelines (version 53)

The November 14 DX12 crash package reports V8 allocation failures at approximately
128 MB, rather than identifying a DX12 device-loss fault. Long map strokes no longer
allocate one obstacle record per tiny townscape cell; spatial queries and live
workplace references are bounded without dropping collision geometry. Parsed replay
records are kept in a small cache and reloaded as needed. Region labels now use
whole text lines instead of separately transformed, shadowed characters, retaining
their names, rotation and wrapping but omitting the decorative character arch.
These changes address verified allocation hazards; confirming the native crash is
gone still requires a live run with the affected save.

The Family Tree header has an **Events Timeline** toggle for dated births,
marriages, arrivals and deaths. Occupation and settlement changes observed while
that family view is open are saved with the game; missing past career observations
are not invented. Pages contain at most 40 events. The circular **timeline** button beside
Walker Speed opens your civilization's timeline: recorded settlement foundations,
ownership and name changes, wars, peace, alliances, discoveries and government changes.
Both timelines stop at the viewed replay turn. Existing recordings cannot supply events
from before recording began.

Leaders and their connected living families use leadership and family activities
only, including offscreen activity descriptions. Children keep age-appropriate
family activities; infant care and elder safety restrictions remain. Family members
do not gain leader command allowances or success bonuses simply by being related.

On Windows, after `Prepare Publish.bat`, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-publish.ps1`
from the repository root. This verifies the release files, copies them, checks SHA256 hashes, and
disables older/equal-version manifests with the same mod ID anywhere under the local Mods directory.
Disabled manifests are renamed with a `.disabled` suffix; their files and earlier backups are
preserved. Newer duplicate releases cause an explicit refusal before installation.
Version 36 repairs a discovered nested v4 installation alongside v35 that registered the same ID
but did not contain the new map entry points. The previous launch stopped before map-generation
startup; no current native dump was available, so this conflict is a verified installation defect,
not a conclusively proven explanation of the native crash. A full desktop restart is required
to discard cached mod registrations. Map bootstrap logs now identify module loading and dimension
registration separately in `Logs/Scripting.log`; live launch verification is still required.

Version 37 addresses UI work found around the subsequent freeze: native UI mutation nodes
do not always provide `matches`, so the calendar HUD guards those methods and does not
observe the map DOM at all while the extended calendar is disabled. Dense townscape
walking networks use exact indexed nearest-street searches instead of comparing every
street node in one town with every street node in its neighbor. Door-road detour geometry
is built only when the direct meandering approaches are blocked. Existing door, obstacle,
water, and harbor connectivity rules remain unchanged. The retained freeze logs identify
townscape rebuilding, but do not establish that these stalls were the only cause; restart
the game to load the fixes and verify the affected scene.

## Settled, bounded townscape drawing (version 50)

The latest retained crash occurred while zooming out from townscapes, with Vulkan
command-set exhaustion followed by `vkBeginCommandBuffer` out-of-memory.
Townscape roads and roofs still had unbounded SVG submissions despite the earlier
natural-detail limits and native-camera isolation.

Townscapes, their labels, and walkers now hide before navigation transforms.
Rebuilds wait until the camera and input have been stable for 250 ms, including
same-tier pans/zooms and programmatic trips. Walkers retain their simulation while
waiting; stale/failed rebuilds remain hidden, and closing or recycling the map
cancels queued townscape refreshes.

Structural paths share an 8,192-command / 262,144-character ceiling; roofs and
roof details share a separate ceiling of the same size. Selection highlights are
limited to 4,096 commands / 131,072 characters. Limits sample complete SVG
subpaths across the scene, favor sparse groups, and skip unchanged submissions.
Dense views may omit decorative geometry; accepted buildings, residence IDs,
population, collision geometry, and walking routes are not reduced. Existing
decoration/natural-detail limits and normal-zoom territory fringes remain.

Regression tests cover rapid zoom-out, recovery on zoom-in, interrupted/failed
rebuilds, and actual command/character ceilings under a 96 MB JavaScript heap.
These limits reduce an uncovered renderer workload; SVG counts are not native
Vulkan command-set measurements, and eliminating the native crash still needs
live-game confirmation. Fully restart Civ VII and retry the affected zoom-out.

## Commanded walkers respect pause (version 49)

Paused walkers no longer move along assigned action routes. Commanded and
autonomous walking share the pause gate, including command fade progression.
Assigned commands/routes remain queued, and resuming continues at the selected
speed without catching up elapsed paused time. Camera-only redraws remain active.
Restart Civ VII to load this change.

## Walker tooltips and steady highlights (version 48)

Walker highlight circles no longer run the repeating opacity animation. Their
black/white outline stays steady as the walker moves; the separate on-screen/
edge-of-screen selection arrows keep blinking. Indoor fade, deselection and
stale-camera visibility rules still apply.

An isolated walker drawn by the coarse crowd renderer now gets the full person
tooltip, including the same live current action used by close-up walker and
Population tooltips. Previously that dot received only a generic one-person
group tooltip. Actual multi-person groups retain their group count and picker
hint instead of attributing one member's action to everyone. Restart Civ VII
after installation.

## Retained walker-batch visibility and entrance roads (version 47)

Unused walker/crowd SVG batches are now explicitly hidden individually, rather
than relying on empty path data to erase native geometry. Previously a reduced
batch count (people fading indoors, moving offscreen, or switching between crowds
and individuals) left unused paths unhidden; showing the parent layer again could
expose retained geometry. A reused batch becomes visible only after receiving its
current appearance and path. Camera invalidation hides every batch, and closing
Map View stops/hides walkers immediately rather than waiting for another animation
frame or panel cleanup.

The regression models a renderer that retains its last nonempty path even when
the DOM's `d` is cleared, and verifies shrinking/empty batches, parent re-show,
reused slots and crowd-mode transitions. It preserves the bounded SVG pool and
avoids redundant visibility writes. Live in-game confirmation is still required.

Building-entrance approach subroads now use a brighter cream color (`#f0d8a4`)
with explicit full opacity; their narrow physical widths and routes are unchanged.
Fully restart Civ VII after installation.

## Population selection and townscape visual cleanup (version 46)

Closing the Population Panel now clears selected people, selected Home Location/
tile entries, command-picked walkers, hover highlights, selection rings and
command targeting. It also stops person camera trips/following and closes the
crowd picker. Reopening does not restore those selections. Saved pins, expanded
groups, sorting, pause/speed settings and already-issued walker actions remain.
Map-close/reset uses the same cleanup; minimizing is not closing.

Zoom/pan invalidation now clears retained individual **and** crowd SVG geometry
and selection rings, rather than relying only on hiding their parent SVG.
Crossing the crowd/individual split also invalidates the rendered view key.
Only a completed current-view projection reveals the walker layer; failed draws
and AI-interturn pauses cannot expose the old paths. Stopping walkers during a
person camera trip retains its bounded simulation, but not stale screen visuals.

Streets, building approaches, main/link roads, bridge decks and rails use brighter
opaque colors with explicit opacity of one. Physical widths and routing are
unchanged. Decorative furniture remains visible but is not an autonomous walker
destination; building activities and square strolls remain.
Restart Civ VII to load this release.

## Isolated Map View camera and restored fringes (version 45)

The latest crash at 13:42:59 repeated Vulkan command-set exhaustion and
out-of-memory errors. Its UI log confirms v44 was active and had committed
bounded natural geometry before the crash, so the earlier drawing fixes were
not sufficient. A remaining navigation path was also zooming/panning the hidden
native 3D world after every Map View navigation, with additional projection
correction requests and a camera-restoration poll.

As approved, Map View navigation now changes **only the 2D map**. Opening still
reads the native projection to fit the initial view, but zooming, panning and
population-camera trips no longer issue native camera requests. Native
selection/build-placement camera moves are observed, not reversed. Consequently
closing Map View no longer transfers its browsed position/zoom to the 3D world.
Navigation timestamps still drive deferred natural-detail refreshes. An opening
`v45 Map View navigation isolated` diagnostic identifies this behavior in UI.log.

Territory/coastline fringes are restored on **every eligible visible boundary**,
not a sparse sample. They disappear only below two projected pixels in either
tile dimension, including minimap views. A padded viewport excludes distant
offscreen edges, and moving beyond it schedules a debounced state repaint;
padding avoids repainting the state canvas on every pan tick. Contiguous
same-side curve pieces merge into one polygon with redundant baseline/end
vertices removed. Fog and partial paints retain the same footprints.

This supersedes v43's 2,048-edge sampling, eight-pixel cutoff and global
8,192-polygon / 32,768-vertex guarantee. The 4,096-segment allocation is again
a detail target, with at least two subdivisions per visible edge. In the full
40,960-tile adversarial fixture, all boundaries require 101,649 polygons /
304,947 vertices, rather than v42's 302,514 / 1,011,624. A 240-by-160 viewport
on that same map submits 1,716 polygons / 5,148 vertices after panning.
Both remain three color-batched paints; these are not Vulkan command counts.

Regression tests verify zero native camera writes across repeated navigation,
camera-watch lifecycle and native selection changes, full visible boundary
coverage, offscreen culling, lobe geometry, zoom cutoffs and placement routing.
Fully restart Civ VII and retry the affected save. The removed native camera
path is verified in tests; elimination of the native GPU crash still requires
that live reproduction and is not established by the logs alone.

## Natural-detail zoom lifecycle (version 44)

The 13:30 crash again ended in Vulkan command-set exhaustion. Trees/mountains
were reported to remain visible too long during full-map zoom-out. The prior
boundary-budget change did not resolve the native crash.

Natural-feature SVGs and islet bands now hide synchronously **before** changing
the map transform whenever their rendered camera key differs from the current
zoom, aspect, pan, viewport, layout or replay position. They remain hidden while
the replacement is queued or being scattered over multiple passes, and return
only after a complete draw for the current camera. Old-camera continuations are
discarded. This also covers zoom changes within one detail tier, coarse tier-one
views, and minimap resizing; formerly those paths could keep the old geometry.
During continuous navigation natural decorations intentionally disappear until
the camera settles. Terrain fills, ownership borders and real item markers remain.

The natural-detail pipeline now separately samples at most 1,536 tree/mountain/
other natural symbols, with a shared limit of 16,384 SVG commands and 524,288
geometry characters including all islet bands. The prior 5,000/10,000-candidate
placement budget did not limit the actual two-tone drawing geometry. All accepted
town tree collision/picking positions remain, even for unsampled decorations.
Fresh-camera visibility still respects the feature toggle and subpixel cutoff.

Regression tests execute the real camera/marker functions and inspect visibility
at the transform write, interrupted scatter continuations, repeated rapid zooms,
minimap resize, failed draws and actual emitted SVG limits under a 96 MB heap.
Low-volume `v44 natural detail committed` diagnostics identify completed render
tiers and geometry counts in `Logs/UI.log`; draw-budget limiting is reported once
per layout/recording. These counts are not native Vulkan command-set measurements.
Fully restart Civ VII after installation. The visibility defect is tested;
elimination of the native GPU crash still requires reloading the affected save.

## Zoom-out renderer stability (version 43)

The 13:17 crash repeated native command-set exhaustion and Vulkan out-of-memory
errors while zooming out in full Map View. Version 42 limited town decorations
and walkers, but did not cover the whole-map coastline/territory edge fringe.
That fringe had only a target budget: its minimum two segments per edge could
exceed it on oversized maps, and sign changes could split each segment into two
polygons that were not counted.

Boundary detail now has hard limits: 2,048 decorative edges, 4,096 segments,
at most 8,192 polygons and 32,768 emitted polygon vertices per fringe paint.
Edge selection is deterministic and based on map topology, not changing owners
or fog, keeping partial and full repaints consistent. Small maps retain all
eligible edges; oversized maps deliberately use sparser boundary decoration.
Tile fills and ownership border strokes remain complete.

Fringe is suppressed when either projected tile dimension is below eight pixels,
including on the minimap. Crossing that threshold invalidates the cached state
and schedules repaint even without a label-tier change. Zooming back restores
detail. Layout/recording recycling releases the cached topology.

In the same 40,960-tile adversarial boundary fixture, the v42 function emitted
302,514 polygons / 1,011,624 vertices despite its 60,000-polygon target; v43 emits
5,068 polygons / 16,952 vertices, retaining three color-batched paint calls.
Tests also exercise partial paints, fog, cache release and actual zoom transitions
under a 96 MB JavaScript heap. These are geometry measurements, not native Vulkan
command-set counts or proof that this was the sole source of graphics exhaustion.
Fully restart Civ VII after installing v43 and reload the affected save to verify
the zoom-out behavior in the native renderer.

## Renderer workload limits (version 42)

The 13:00 crash was preceded by repeated native renderer command-set exhaustion
and Vulkan out-of-memory errors; a companion report explicitly identifies a GPU
crash. This differs from the earlier V8 heap failure. These reports establish a
graphics failure, not which individual mod drawing operation caused it.

Walker graphics now batch by color and fifteen visible fade levels rather than
creating one SVG element per individual. Crowds share two color batches, even when
thousands of people are isolated. All represented people, military colors, movement
formations, picking radii and selection rings remain. Individual dots use small
octagons with unchanged horizontal/vertical diameter; fading changes only opacity.
The 7,200-isolated-person regression reduces crowd SVG elements from 7,200 to two.

Decoration drawing now samples at most 512 placements at crowd zoom and 1,536 closer up across the padded viewport,
with limits of 8,192 SVG path commands and 262,144 serialized geometry characters.
Complex decorations simplify within their reserved footprints when necessary.
Dense views deliberately show less decorative detail; close views with fewer
placements retain the original shapes. The 50x vegetation generation target and
collision/leisure data remain, but the prior 24,000-placement limit alone no longer
determines how much geometry reaches the renderer. Budget limiting is diagnosed
once per map session. SVG path commands are not native Vulkan command-set counts.

Automated dense-scene, camera, scale and formation tests verify these limits,
including under a 96 MB JavaScript heap. Native GPU stability still requires
reloading the affected save in Civ VII; this is a targeted workload mitigation,
not a verified driver repair or a guarantee against every native crash.
Fully exit to the desktop and restart Civ VII after installing v42.

## Townscape navigation and scale (version 41)

Walker speed starts at **1x**; 5x remains the original full pace. Main-square
background fills are removed, while squares remain walker gathering destinations.
Townscape roads use fully opaque, brighter earth-tone strokes at unchanged physical widths.

Screen-space walker/crowd graphics hide as soon as the camera changes or leaves
townscape zoom. They become visible only after a complete projection for the current
view, including after AI-turn suspension; failed or deferred scene work cannot leave
old dots pinned to the screen. The walker SVG is clipped to the screen as well.

More bridges can connect nearby, obliquely facing road ends (up to 45 degrees off the
crossing direction), with the bounded scene limit increased from 128 to 256. Maximum
span, dry-bank, water and tree-clearance checks remain; perpendicular streets and
dry gaps do not receive spurious bridges. Walkers still require a valid bridge/deck
to cross water.

The map scale bar switches from miles to feet when its target span is less than
one mile. Distances retain readable 1/2/5 steps, correct physical lengths and
singular/plural labels. Restart Civ VII after installing v41.

## Walker speed label (version 40)

The top-center walker-speed circle now uses explicit-size SVG path lettering for
`1x` through `5x`, avoiding auto-sized span/fallback-font rendering in Gameface.
The lettering scales with the interface and remains click-through; the button keeps
its speed tooltip, accessible label and existing input behavior. Restart Civ VII
after installing v40.

## Map placement and townscape scale (version 39)

Building, wonder and city-improvement location clicks now reach native plot selection
even while the placement city's panel hides Map View's ordinary controls. Previously
the generic game-overlay input guard returned before the map click could be translated
to its plot. Native panel buttons and modal selection permissions remain protected.

Townscape roads retain their routes but are one twentieth as wide, including building
approaches and connecting roads. At 100 miles per tile, major miniroads are about
9.9 feet wide and smaller lanes about 5.3 feet; existing narrower entrance paths retain
their relative hierarchy. Bridge widths and road collision clearances follow the scale,
without shrinking the rivers they cross. Roofs retain their locations and resident IDs
but are one quarter as wide/long (one sixteenth of their previous footprint area), with
appropriately reduced outlines. The minimum inter-building clearance is tripled, not
multiplied by sixteen. Population and housing capacity are unchanged.

Vegetation targets fifty times the previous scatter density. Additional plants and bushes
are generated only in the padded viewport using deterministic spatial cells, not retained
in town-wide candidate arrays or saves. Viewport placement caps are 2,048 at crowd
zoom and 6,144 closer up, followed by bounded drawing samples. The existing
full-footprint water/obstacle avoidance remain; wide views use bounded sampling, so crowded
or obstructed areas cannot guarantee fifty times as many accepted decorations.

Coastal decks now extend back over their dry landing instead of being clipped short of
land. That landing receives an obstacle-clear meandering approach from the street network;
every deck receives a deck-contained access branch. Unreachable waterfronts are hidden
with a diagnostic rather than showing isolated quays or dock roofs. Fully restart Civ VII
after installing v39.

## Stability and performance (version 38)

The captured 04:28 crash minidump identifies V8 heap exhaustion: repeated allocation
failures near the game's approximately 128 MB JavaScript heap limit, followed by its
fatal out-of-memory handler. Version 38 reduces townscape heap pressure rather than
changing native heap limits or reducing the requested player count:

- Scene selection buffers the actual townscape footprint instead of loading distant
  towns more than a tile away. All in-view towns remain eligible under the existing
  24-town limit; building density and total recorded populations are unchanged.
- Offscreen cached entries release housing-roof references, decorations and walk graphs.
  Inspected homes remain available; deterministic layouts can be rebuilt from the save.
  Surviving walker groups update their graph references and discard obsolete runner caches.
- Subdivision yields one four-roof group at a time and stops at the existing scene budget.
  Shared approach junctions no longer duplicate coincident walking nodes, and symmetric
  edge costs are calculated once using nearby obstacles instead of every building.

In a controlled Node fixture with four visible dense homes and 30 distant homes, v37
prepared 24 layouts in 333 ms, retaining 37.5 MB of layout heap; v38 prepared the four
needed layouts in 58 ms, retaining 6.6 MB. These are layout-preparation measurements,
not total in-game frame times or a guarantee against every possible heap exhaustion.
Door access, water avoidance, harbor connectivity and walker continuity have regression coverage.

During AI turn processing, decorative walker animation and townscape rebuilding suspend,
then resume after local turn activation without discarding the scene. The recorder still
captures each fully resolved turn; provisional mid-turn captures run only while Map View is
open, including a refresh requested on opening it. Pending provisional work is canceled at
turn activation to avoid a duplicate scan. Tile capture reads each district once and derives
regular-grid coordinates locally; society capture reads each player's tech/civic handles once.
Captures taking at least 250 ms log their duration in `Logs/UI.log` for live comparison.
Version 114 shares city collections, constructible collections and constructible
definitions within each synchronous turn capture. The 63-major regression
fixture reduces native constructible-collection reads from 129 to 64 and city
collection reads from 127 to 64; repeated type lookups drop from 12,732 to five.
Building, pillage, wonder, settlement and center-marker outputs are preserved,
and each new capture reads fresh data, including after cities are razed.
These changes reduce mod overhead, but native AI, other mods and game autosaving remain
outside these measurements. No end-to-end turn-time reduction is claimed without a live test.
Fully restart Civ VII to load v38.

## Realistic calendar (enabled in version 53)

The extended calendar and its matching research, civic and celebration pacing are
enabled again. Fully restart and **start a new game**; existing saves and presets
are not converted between calendar modes. The date HUD checks the gameplay marker,
so games without the realistic-calendar database changes retain their native dates.

**Start a new game after installing this version.** The mod now affects gameplay and saved games,
not just the map UI. **Realistic** replaces Standard and remains the default,
including for multiplayer; x2 through x6, x10 and x20 alternatives are available.
Its internal ID remains `GAMESPEED_STANDARD`.

- **Antiquity:** 4,400 annual turns, from 4000 BCE through 400 CE, without a year zero.
- **Exploration:** 5,400 seasonal turns, Spring 400 CE through Winter 1749 CE.
- **Modern:** 2,400 full-month turns, January 1750 through December 1949.

The shared 400 CE label is the requested age-boundary convention. Seasons run Spring, Summer,
Autumn, Winter. The HUD and newly recorded replay frames use these exact date labels; the
native date API is not replaced. Existing replay frames keep their original dates.

Age timers use these fixed turn budgets for every age-length setting. Milestones, future research
and other age-progress events no longer accelerate those timers. Victories and elimination can
still end a game early. Technology/civic costs and additive repeatable costs, celebration duration
and celebration happiness-curve parameters scale by that age's turns divided by the native Standard
140-point age budget, divided by the selected Realistic multiplier.
As of version 90, other speed-adjusted costs use Marathon pacing.
Research database costs compensate for the native Marathon multiplier so it
does not triple research/civic costs. Integer rounding still applies.
Agriculture and Chiefdom start from their immediate successors' base costs before
the age multiplier; their final scaled costs are then divided by ten and rounded.
Native cost scaling can round these opening costs by a few points.
Celebration defaults absent from the database are supplied from the installed engine's native defaults.
Other gameplay-overhaul mods can conflict with these settings.

Realistic recordings carry fractional life-year durations: one year, one quarter-year, or one
twelfth-year per turn, multiplied by N at Realistic xN. Disease/outbreak pacing follows that duration; battle and pillage remain
event-based. Legacy recordings retain their previous life simulation. Provisional map scans are
coalesced during the local player's active turn rather than running throughout AI movement;
turn-boundary, final and explicit map-open captures remain authoritative.
SQL has been checked against the installed gameplay/frontend schemas and representative game data.
Full live-game age transitions, research and celebrations still require verification after restart.

## New-game defaults (versions 33-34)

New setups default to no end-of-age countdown, Catastrophic disasters, score victory off,
and Giant map size when a map mod such as YnAMP provides Giant in the selected size domain.
**Tiny, Small, Standard, Large, and Huge** remain selectable, alongside provider-specific
sizes and **Colossal**. Each map script retains its own size restrictions.
YnAMP's **Giant Earth** map script remains available and uses Giant size.
An oversized-map provider such as YnAMP must be enabled for the additional oversized sizes.
Only **Giant**, **Giant Earth** (if supplied as a size), **Ludicrous**, and **Colossal**
default to **63 total players**, with their setup player ceilings raised to at least 63.
Smaller and unrelated provider sizes retain their original player defaults and limits;
all existing human-player limits are preserved. Fewer players may still be chosen manually.
Large maps with 63 players can substantially increase memory use and turn times.
The countdown setting does not remove the native age-progression rules.

Ludicrous now uses **128 x 80** instead of YnAMP's 230 x 116, with matching setup
labels. Native 1.5.1 tests reached generation at 128 x 94 but failed before generation
at 130 x 94 and 180 x 80, with 63 players in each test. Giant Earth remains **180 x 94**
as requested; its full-width native initialization failure is unresolved. Changing
Ludicrous dimensions does not rescale or crop Giant Earth's geography.
The 128 x 116 candidate generated terrain and placed 63 players but crashed during
native advanced-start-region assignment. Version 124's 128 x 80 Ludicrous completed
Terra Fractal generation, assigned all 63 advanced-start regions, and reached
`LOADSTATE_FINISHED` in a native new-game test. Full campaigns and multiplayer
remain unverified. Existing saves retain their stored map dimensions.

Version 35 routes the eight native Voronoi map choices (including Continents, Shuffle and Donut)
through small compatibility entry points. They register oversized engine dimensions before the
native generator reads its built-in size tables; without this, Giant could fail in
`commonRequestMapData` while reading an undefined size's `x` coordinate. Existing map names,
sea-level options, start-position rules and restrictions are preserved. Provider-specific scripts
such as YnAMP's Giant Earth are not replaced. No installed game files are modified.
Restart and choose a map again in a fresh setup; older saved presets can retain the original
unwrapped script path. Automated checks cover map initialization, not a complete native
63-player terrain generation or full campaign, which still require live-game verification.

The starting age defaults to Antiquity, with Apex-only randomized civilizations. AI defaults to
**Apex Civilization Transition**, with historical leader association and normal civilization
unlock requirements retained. This uses the game's own civilization choices and unlock rules:
it does not force a particular historical successor, override manually selected civilizations,
or automatically choose the human player's next civilization.
The defaults remain editable except for the restricted speed/size choices; existing saves and
saved setup presets are not rewritten.

## Using the map

Open **Map View** from the in-game HUD. Drag or use the arrow keys to pan.
Use the mouse wheel, touchpad or touchscreen pinch, controller zoom actions,
or the `+` and `-` keys (including the numeric keypad) to zoom. The timeline
and playback controls support recorded
turns; `Home`/`End` jump to the ends, `Page Up`/`Page Down` step, `Space`
plays or pauses, and `[`/`]` change playback speed.

With the default controller bindings, press the right stick to open the map from the world or open
its control navigator. Use the D-pad to select a control, A to activate it, and
B to return to the map. The navigator includes the visibility and history
panels, playback controls, and exit. Use the camera stick and zoom controls
for map navigation; stepping through turns also provides timeline navigation.

The Borders and Continent boundaries controls also show small names aligned
with their respective outlines.
On river and mountain tiles, clipped territory meets adjacent civilizations'
colors; at an unclaimed outer edge, the exposed part remains terrain.

The map can be panned and zoomed beyond the game camera's limits, down to 1%
of its base scale. The game camera attempts to follow after navigation settles,
using projected tile positions and the measured game zoom when available. When
the screen center is outside the map, it can still follow the zoom. Native world
interactions and tooltips may not align while navigating or when the two views
diverge beyond the game camera's limits.
During a horizontal wrap, territory and markers may briefly disappear while
their new positions are drawn.

The historical minimap is contained within the game's minimap image, so its
normal buttons remain accessible. A white outline shows the game camera's
viewport projected onto the map plane; it is hidden when that projection
cannot be resolved.

The map stays in place when the game selects a unit or settlement. A pulsing
arrow at the unobstructed map edge points toward a selection outside the view.
It is hidden while any part of the selected tile is on screen.
During a 3D leader scene the map is temporarily hidden so the scene is visible,
then restored when the scene ends.

During settlement expansion, the map switches to the latest recorded turn and
shows the game's eligible expansion and specialist plots and their yields.
Building and wonder placement displays the native eligible plots and projected
yield changes. Yield labels use bounded, zoom-aware icons and are built in
small batches. Clicking a local city-center tile selects that city without
closing Map View. Mouse and touch placement clicks are sent to the game's
plot-selection handler, subject to its selection permissions. Other native plot
selection modes, including movement, attacks, and building placement, also
switch to the latest turn and pass map coordinates to the game's controls.
Right-clicking with a selected unit likewise returns to the latest turn.
Marker layouts are reused across map-wrap shifts, and existing natural-feature
markers remain visible while replacement layouts are prepared. Stale markers
are hidden when needed to preserve fog or correct wrap alignment.

The eye and clock buttons independently collapse or reopen the visibility and
map-history controls. Both start minimized; the history panel also has its own minimize button.
The Population Panel, Leaders Panel and Family Tree also start minimized and each has a header
restore/minimize button. Population hierarchy, building-people sections, and leadership groups
(including pinned leaders) start collapsed; expanding one does not expand the others.
It hides the body without closing the panel or clearing its contents; use the header's restore
button to expand it again.
An alternating toothed scale bar measures distance in miles, anchored to Giant Earth's
100 miles across a tile and adjusted to each recorded map's tile area.
Its length follows the map zoom, and it moves to free screen space to avoid the visible map panels
and controls. It hides behind game menus and when no unobstructed space remains.
The visibility controls include civilization and settlement labels, river
names, natural features, continent boundaries, and other layers. Fog of War is
off on opening, except during active multiplayer games, where it remains
enabled and locked.

Country labels use the capital's name while it is the only settlement and has
population two or less. Once it grows or a second town or city is founded,
government and civilization naming rules apply. A civilization with no
government yet uses a historical pre-state name, such as the Latin League for
Rome or the Gallic Tribes for the Gauls. "Empire" is used only by a despotism
with more than three settlements; larger oligarchies and monarchies are named
as leagues, confederations or kingdoms. Oligarchic Gauls form a tribe
or, with four settlements, a tribal alliance; an oligarchic Greece with at
least four settlements and an Athens or Sparta capital becomes the Delian or
Peloponnesian League. Greek and Roman names can also derive from their capital.
Only identical fully generated country names receive geographic qualifiers.
Unique names and distinct government titles do not count as duplicates.
Colliding names receive directional qualifiers when they occupy the same
continent; otherwise continent or capital names distinguish them.
East is to the right and west to the left on the map.

Generated names and historical frames are stored with the game. Older
recordings may not include independent peoples' names or belief data. The
current mod is non-save-affecting, but saves made with older save-affecting
versions may still require those versions.
Maps whose selected or localized name contains "earth" (case-insensitively)
retain their map-provided river names, except Random Earth, whose rivers are
generated. The fixed built-in Earth map also uses nearby historical-start
landmarks for some land-region labels. When available, YnAMP's validated Earth
map context and geographic-region data provide land-region labels, including
regional crops. Other labels still use generated names: map names alone do not
identify a projection, and not every map supplies real-world feature locations.
Geography generation caches tile adjacency, and sequential history playback
reuses the previous reconstructed state while preserving snapshots and seeks.
Large maps reuse unchanged geographic-label layouts and limit exceptionally
large canvas backing stores to reduce memory pressure. Crowded tiles use a
cached overlapping-marker fallback rather than repeatedly retrying impossible
layouts. Natural-feature shapes
are hidden when their projected size is below one screen pixel and return when
zoomed in. Sparse coastal islets are hidden when individual tiles are subpixel-sized;
decorative islets are not generated in open water.
Natural-feature decoration is limited to 5,000 shapes per view (10,000 at townscape zoom for denser small trees) to reduce rendering
and marker-layout costs on large maps; the underlying terrain and map layers are unchanged.
Slow city-selection and placement-overlay updates are reported in the game's UI log.
When zoomed in far enough for per-building icons, each icon's tooltip shows a
generated historical-site name instead of the game's constructible name, for
example "The Julii Wheat Farm" or "The Claudii Farmhand Commonhouse" for Rome. Every
civilization has its own family, clan or house names, naming pattern and a few
native words, the tile's owner at the viewed turn picks the culture, and no two icons
on a tile share a name. The game's own name and the constructible type appear on the
second line. Constructible tooltips end with "(Population: n)" and unit tooltips with
"(Manpower: n)": the estimated world population at the viewed in-game year, shared out by
weight among the units, constructibles, wonders and specialists on the map: a settlement's
centre holds about 20 times, its urban buildings about 11 times, specialists 12 times and units
2.5 times as many people as an improvement in the fields, with each icon varying by up to about
Â±70%, as a whole number.
Unit icons are named for the nearest city of their owner and a formation, using the
owner's own formation words where known ("The Second Roma Slingers", "The First Roma
Centuria"). While the map is zoomed out but still legible, each unit carries a floating
icon circle above it; hovering shows its name and clicking your own unit selects it in
the game, opening its control panel. When the map is zoomed in extremely far, the icons
sit on procedural layouts. Each civilization has its own street plan (grid, radial, round,
linear, mandala, terraced, ring or organic), houses, monuments (temples, ziggurats, pyramids,
stupas, pagodas, domes, churches, mounds, castles, amphitheatres...), walls and signature
features (aqueducts, gardens, reservoirs, harbours, plazas...). The age and how far into it
the game is change what exists: palisades and huts early, stone walls, temples and aqueducts
later, castles and star forts in the exploration age, then factories, railways, parks and
skyscrapers. Each lot around the centre holds a cluster of ten small buildings (each a tenth of the area one
building used to have, laid out over about the same ground, so the streets and spacing are unchanged), and the
innermost lot holds the layout's one large central building (its main temple, palace, castle or hall). One tile is 100 miles across;
each townscape has a nominal diameter of 10 miles, with its buildings, decorations, roads and creeks at that scale.
Townscapes only appear when a tile's projected width and height both exceed the viewport, including the current map aspect ratio.
The toothed map scale and its distance labels appear directly over the map without a background panel.
Road, creek and building labels are slightly enlarged for readability. Buildings keep clear of trees and other
map shapes, rivers, roads and each other. Hovering a building shows its own name and resident count.
While townscapes show, city details cannot open from map clicks; buildings instead open their population view.
Non-resource icon circles and their underlying civ-coloured markers are hidden at this zoom.
All non-townscape map labels hide automatically while townscapes are visible and return when
zooming back out without changing their checkbox settings. **Townscape labels** controls the
townscape label layer; **Settlements**, **Building and improvement labels**, and **River names**
also control its Home Location titles, building names, and creek/river names respectively.
Changes apply immediately, including while reusing a cached label layout.
Zoomed in far enough for the townscapes, tiny people walk slowly between the buildings and
along the roads, drawn on their own screen-space layer. Dots have a minimum physical diameter of
**0.0003 miles**, with a readability floor of 3.2 UI-scaled pixels at lower zoom.
Maximum zoom derives from that physical diameter and the 100-mile tile width: at the limit the
minimum-size dot is 12 UI-scaled pixels across. Fading changes opacity, not diameter.
Selection rings and hit areas follow the scaled dot size. Each
dot is a real person from the Population Panel: person *n* of an icon circle is the panel's person *n* of that
icon, with the same name and trade, and a townscape never has more people than its icon's population. Hovering
one shows their name, gender, numeric age, what they are doing, occupation, home (the icon circle's name),
civilization, era, faith and two personality traits; the name comes from the
culture of the civilization controlling the tile, with era-flavoured
by-names; the trade follows what the person is part of (the improvement, building, quarter or unit) and the age.
What they are doing follows their trip, trade, gender and the age: "Heading Home", "Traveling to Antium" along a
road or to another townscape, an errand of their trade ("Tending to Grounds", "Buying Supplies"), a visit
("Visiting Her Family", "Going to the Baths", later the Cafe), or work at a spot beside a tree, riverbank, field or
resource ("Pruning Trees", "Fishing", "Mining Iron"). People head out to those spots, linger there a few seconds, and
walk home, along the roads and between townscapes more often.
Walkers also leave streets to approach real building doors, meander between open spots in the square,
approach stationary neighbours for a chat, and sometimes pause
briefly in the middle of a walk. Formations and supply/message runners retain their duties instead of
taking these casual detours. These activities do not spend command actions or grant yields.
**Clicking a dot** opens the Population Panel, opens the levels above that person, scrolls to them and selects
them (it never opens the city view). **Clicking a person's row** in the panel selects them instead: the row is highlighted and, while that
townscape is showing, a blinking ring marks their dot and the slowly blinking arrow hangs above it (otherwise
the arrow points at their tile). Their routes are only calculated while townscapes are shown.
The top-center map controls place walker **Play/Pause** and **Speed** beside **Leaders**.
Speed cycles through **1x, 2x, 3x, 4x, 5x**; the default **5x** preserves the original walking pace,
and 1x is one fifth of that pace. Speed affects both autonomous and commanded movement, including
formation and runner travel. Pause shares the Population Panel's pause state; as before, explicit
commanded and autonomous walkers both wait while paused. These controls hide behind game menus.
They accept mouse releases, keyboard activation and game-engine release events without counting
the same physical click twice. Browser fixtures validate these input paths; live Civ VII verification
is still needed after restarting the game.

At distant townscape zoom, nearby walkers from the same Home Location share destination-route searches
and appear as scattered groups with exactly one dot per represented person, rather than numbered circles.
Each group uses one cached SVG path and one retained element. Click a clump to open a paginated member picker, then select an individual
or double-click to travel to them. Ordinary civilian clumps split back into individual dots at close zoom without
replacing people or snapping them to new positions; civilian unit groups can keep their shared travel formation.
Military clumps retain formations at close zoom;
their Supply runners and Message runners remain individual walkers and repeatedly visit the nearest
reachable friendly encampment before returning to the formation. A missing reachable camp is reported
in their activity text. Selected, pinned and commanded people remain individual. Clumping reduces shared
route searches and rendered dots, not every per-person simulation update.
Display crowds are rebuilt from nearby visible walkers independently of route-sharing cooldowns,
arrivals and departures. Zooming out immediately hides their individual circles, even while paused;
selected, pinned, commanded and runner walkers intentionally remain individual.
Crowds break into individuals when a tile reaches 24 viewport heights (twice the former threshold),
accounting for the map aspect ratio and capped at attainable maximum zoom. Decorations
appear throughout townscape zoom with a smaller budget while crowds show.
Crowd movement/rendering updates at up to 20 Hz and individual walkers at up to 30 Hz;
elapsed-time movement preserves their speed, and changing between crowd and individual zoom bypasses
the update cadence immediately. Camera zooms and pans refresh the screen-space walkers and crowd paths
synchronously, including while paused, so old crowd graphics cannot linger over a newly zoomed-in town.
Isolated ordinary walkers also use the coarse display path; only the intentional exemptions retain
individual circle elements at crowd zoom.

Townscape scenes prioritize homes in the actual viewport before nearby offscreen homes, within the
24-home scene budget. Small pans reuse the scene until an omitted home could enter view, avoiding
the old coarse sorting center that could exclude visible townscapes. Nearby homes remain candidates
for road and waterfront continuity. Heavy town entries, decoded layouts and path sets each use a
24-entry least-recently-used cache rather than retaining hundreds of layouts. The encoded layout
library is capped at eight entries and its byte budget is enforced immediately, even during playback.
Natural-decoration markers retain at most the live marker budget and 64 tile lists; scattered geometry
retains at most 64 tiles. Decoration placement stops at the remaining budget and releases temporary
town candidate arrays after viewport placement; tile-decoration candidates retain 32 patches.
Walking networks join through street nodes, not building doors, so cross-town search work does not
grow quadratically with the number of roofs. Panel minimization uses basic class selectors supported
by the game UI rather than unsupported structural pseudo-classes.
An earlier packaged crash dump reports V8 process out of memory near its 128 MB heap ceiling.
In an identical 150-tile forest pan, bounded caches retain 8,960 markers instead of 193,280 without
reducing visible density. Dense-town panning regressions also pass with a 96 MB heap limit.
These checks address demonstrated mod memory growth; live-game validation remains necessary because
other game UI and mods share the heap.
The latest 03:35 crash log instead ends during native map generation with missing oversized
dimensions; version 35 addresses that separate failure above. Relationship recording now snapshots
each major player's diplomacy handle once per capture. In a 63-major-player regression, this reduces
player lookups from 2,017 to 64 and diplomacy-handle reads from 1,953 to 63, with identical relationship
records. The snapshot is released after each capture, so deaths and age changes cannot leave a
stale persistent player cache.

Military formations include pointed cavalry skeins, loose long rectangles for ranged and siege units,
and compact rectangular shield walls for infantry recorded as alert, sleeping or fortified.
Other inactive military units scatter loosely and hold their assembly rather than repeatedly marching.
Moving civilians form organized caravans on road segments and irregular streams on paths; stationary
or meandering groups scatter loosely. Formations face their direction of travel and use shared cached
templates; close-up offsets respect walker obstacles rather than moving simulated positions through them.
New recordings store optional unit activity alongside the existing unit fields. Older recordings remain
compatible but do not reconstruct missing activity; fortification operations are captured when observed
after recording starts, so an already-fortified unit in a loaded save may need a new activity event.

While the map loading/error message is displayed, a fullscreen black backdrop hides the main game view.
It disappears with the message when the map finishes displaying or is closed.

Autonomous occupations and activities can reflect recorded discoveries, war, celebrations, crises and
family relationships. Discovery records unlock additional occupations and actions without consulting
the current game state during historical playback. Visible people rows can show plausible offscreen
activities without an extra prefix; these are not measurements of unseen walker travel.
Autonomous work and family meetings do not spend command actions or grant command yields.
People go into buildings and tents: reaching a door they shrink and fade out, stay out of sight for a few
seconds, then come out again; at street corners and road ends they stay in plain sight (and a person indoors can't be hovered or clicked).
Each townscape represents up to 480 of its icon's people (all of them when the icon's population is smaller),
with a shared limit of 7,200 walkers, and between
30% and 60% of them are in sight at any moment: someone only goes in if enough others stay out, and only comes out
when there is room, so the crowd keeps changing without ever emptying or filling the streets (a townscape of one
or two people always shows them, and trades places between indoors and out). While townscapes show, the rectangles
under them are left out too: the squares for buildings and improvements, the blocks under units, and the
decorative unit dots (a city's specialists), whose people walk the townscapes instead. Non-resource icon circles,
city dots and wonder triangles are hidden too. Encampment tents are detailed building shapes at 1/40 of the old
tents' width and length, using the same doors, collision and command targeting as other townscape buildings.
Natural features include oasis pools and vegetation, cliffs, floodplains, scrub and other recorded features.
New captures record cliffs independently of other features, so a forest can also show cliffs; older saves
upgrade when recording resumes.
People go round trees and other natural features and buildings wherever there is another way (a route
through one costs many times its length, so it is taken only when nothing else connects); a building's own door
is always walkable. Townscape creeks and connecting mini-rivers cannot be walked across or along unless the
entire wet stretch is covered by a visible minor road, major road, map road or bridge. This also applies to
commanded walkers' off-network target legs; an unreachable water crossing stops the walker and shows a notice.
Townscapes are joined to each other and to the map: each one is connected by a road, gate to gate, to the nearest
few adjacent townscapes (ones that neither overlap nor lie far apart) and to the map's roads that pass it;
a townscape's major street ends additionally extend to available map roads or other townscape streets,
and its creeks join other townscape waterways or the map's rivers, including navigable rivers and connections
beyond the old neighbour-distance cutoff. Extensions prefer continuing forward rather than doubling back.
Minor, major and connecting road strokes stop short of townscape pools, creeks, map rivers and nearby water tiles;
intentional bridges and waterfront decks remain visible over water.
If no compatible destination exists, an isolated line is not given an
invented connection. Nearby road ends that face each other across water receive bounded plank-and-rail
bridges after road clipping, reconnecting their walking routes. Water tiles and townscape pools can
only be crossed within the actual bridge deck; a nearby bridge does not permit crossing elsewhere.
Quays, harbors, docks, ports and similar waterfront homes have multi-pier decks and dockhouses
aligned with nearby coastal/lake water or navigable and non-navigable rivers. Other waterside
townscapes get smaller landings. Waterfront structures are short and concentrated at the shore;
neighbouring waterfront decks and their buildings cannot overlap. Decks extend over the water, but are visual only: they do not
permit walkers or ordinary connecting roads to cross water tiles.
All the visible townscapes share one walking network, so people are not tied to their own townscape: they walk
into the townscapes on the same tile (joined at their nearest streets) and along the roads to adjacent ones, going
in and out of their doors, without despawning. Nobody ever walks over water (ocean, coast, lake or navigable-river
tiles), and a river is crossed only on a bridge. Link roads are not built across water either. When the set of
townscapes changes, the people already showing are set down on the nearest street of the rebuilt network.
The highlight on a townscape lasts only while the cursor is over it or its icon.
Hover anywhere inside a townscape's Home Location grounds to see its name and total population, or hover an
individual building to see its own name and resident count alongside the Home Location total.
Each person's ID deterministically assigns them to one roof of their Home Location's layout, without
storing an additional record for every person. The same layout reconstructs the same assignments after reload.
Home Location rows in the Population Panel also show their
name and population in their tooltips. Buildings and roof details draw above the townscape's roads, creeks,
decorations, walls and battle ground effects. Each townscape has its Home Location name written above it.
Click a building to display its name above the roof and filter the Population Panel into
**Currently inside**, **Currently outside** and **Lives here** sections for that specific roof.
Click any section header to collapse or expand it independently. The outside section lists that roof's
active resident walkers who are outdoors, not residents visiting another building.
Occupants include visitors
from other buildings and Home Locations; residents remain listed while outdoors or visiting elsewhere.
Residents without an active walker stay indoors at home. Occupancy updates twice per second.
These are modeled assignments, not household data recorded by Civilization VII.
Town layouts add roofs toward normal Antiquity/Exploration/Modern capacities of
3/4/6 residents per small building and 15/20/30 per large building. Layouts are capped at
1,000 original roofs. Each original is split into **four inset buildings** sharing its former
footprint and aggregate capacity, with margins between them. Their IDs are deterministic but
differ from older releases' unsplit building IDs. Whole four-building groups are accepted or
rejected together, with at most 6,000 accepted roofs across a visible scene. When geometry budgets or
placement constraints limit the available roofs, occupancy increases instead: the **Lives here**
counts of the accepted buildings still add up exactly to the Home Location population.
Cached layouts keep their original unsplit footprints. Subdivided roofs and approach/walking
geometry are retained only for the current scene and an inspected home, not every previously visited town.
Offscreen and subpixel roofs retain their identities and residents without submitting their SVG paths;
nearby roofs appear as the camera approaches or zooms closer.
Ordinary roofs are inset rectangles, with a small gap between accepted buildings and their attached parts;
central landmarks and culture-specific monuments retain their distinctive shapes.
Every accepted roof and filled attached part has at least four distinct vertices and nonzero area;
invalid footprints are rejected with an error. SVG polygons close explicitly and retain coordinate
precision so tiny roofs cannot collapse into lines. A roof waits until both dimensions are at least
half a screen pixel before being drawn, without changing its residents.
Townscape decorations appear as soon as townscapes do, with additional detail at
individual-walker zoom. Their denser candidate layouts include tables, carts, wells,
statues, market stalls and baskets; furniture is scenery rather than an autonomous
walker destination. Map-anchored scene bounds and geometry-aware caches
reduce rebuilding and layout changes during small camera movements.
Grass and bushes use their full reserved decoration scale and matching stroke widths, so they remain
visible at maximum zoom instead of being reduced by an additional factor of 20.
Waterfront landings and their connected piers/dockhouses start at an actual dry-to-wet shoreline,
even when the home marker itself is on water. They are omitted if no nearby land connection exists.
Thin deterministic meandering access roads branch from miniature streets to building doors and harbor
landings/dockhouses. Drawing and walker routing use the same paths; decorations reserve their
footprints. Each parent group's central gap gets one shared approach before branching to its four doors.
Obstructed approaches try nearby streets and bounded corner detours, and report any
entrances with no clear route rather than drawing a road through a roof or water.
Harbor walking is restricted to continuous connected deck surfaces, never open-water shortcuts.
In every era, **Early** means era-local turns **1-149**, **Middle** means **150-299**,
and **Late** means **300 onward**, until that era ends. These stages use recorded turn
numbers, not the number of replay frames or the era's eventual length.
All sections page through people in ID order, with bounded search and explicit search limits;
the normal occupation-sort controls return after **Show all homes** clears the building filter.
Circular district walls are limited to palaces, forts and urban centres.
The bumpy circular palisade rings are removed, including their camp variant.
Other stone walls, bastions and recorded tile-edge fortifications remain.
Recorded wall constructibles also draw walls along their tile's outside edges, omitting shared
edges between adjoining same-owner walled tiles.
At the closest zoom, decoration footprints keep clear of buildings, road and creek strokes,
water, quay decks, walls, natural features and other decorations across neighbouring townscapes.
Pink flower circles are removed. A shared spatial index, cached placements and viewport-culled
SVG paths reduce decoration work without introducing additional canvas drawing.
The outer ring of rectangular field plots is hidden. Townscape pools, creeks and connected
waterways draw beneath roads, waterfront decks, decorations and buildings.
Building footprints and attached parts are excluded from local minor/major roads and connecting-road
strokes before residents and decorations are assigned. Water may cross part of a building footprint,
but sampled coverage above three quarters is rejected, including combined pools and creeks.
Ground collision queries use a spatial grid rather than scanning every townscape road per roof.
Minor-road drawing also trims stretches beneath accepted roofs and their attached parts, including
neighboring townscapes, with clearance for road strokes and rounded caps. Labels and decoration
reservations use these same cleared road fragments; the work is cached with the town scene.
Road names use slightly larger labels. Local creeks and connected townscape rivers have named,
prioritized labels, subject to the same viewport and label-overlap limits.
Panning within a padded view reuses townscape scenes, walking networks and label placement.
Labels translate as one layer rather than being re-positioned and collision-tested on every pan frame,
and unchanged walker size/opacity attributes are not re-submitted.
Population follows the world: a unit's people fall in direct proportion to its health and rise with any strength
bonus it has over its type's base (promotions, commanders...); a pillaged building or improvement keeps a quarter
of its people; and a settlement whose constructibles are pillaged loses up to half of the people of everything
built for it and of its specialists. (Pillaged state and strength bonuses are recorded from this version on;
earlier recordings show no pillage or bonus.)
Names are more varied for every culture: about half of the given names and family names come from the
civilization's hand-written lists and the rest are generated from its own sounds (22 culture families, from Latin
and Greek to Maya, Andean, Mande and Polynesian), and full names follow culture-typical forms (Roman three-part
names, Arab *ibn/bint*, Russian patronymics, Greek "son of", Spanish *de* places, Prussian *von*...). Site names
gain generated family names and places, culture-typical modifiers ("Fundus Vetus", "Upper Mill") and a wider set
of nouns.
The circular **Population Panel** button (a three-people icon) sits at the top centre of Map View, moved
down below anything already there (the view and playback controls, the Victories tabs) so it
never overlaps other UI, and it hides whenever a game screen or menu opens over Map View. It opens or closes a panel on the right (hidden, with every level collapsed, each time Map View
opens). It lists, for the viewed turn, Civilization (each major civilization by the country name the map gives it with
the fog of war off, followed in parentheses by the name it goes by with the fog on when that differs, e.g. "The South
American Gallic Kingdom (The Gallics)") > Continent > Tile > kind of icon ("Farm", "Warrior") >
**Home Location** (one per icon circle: constructible, unit, wonder, or a settlement's specialists), with the total
population beside every group and each Home Location expanding into one row per person: first and last name,
gender, occupation and the Home Location's name, for example "Brutus Brutii / Male / Farmer / The Brutii Wheat Farm".
**Hovering any heading row** (civilization, continent, tile, kind of icon, Home Location or occupation group) shows
a tooltip counting how many of its people have each occupation, commonest first. The **pause/play** button in the
header stops the people walking on the map where they stand (they stay drawn and clickable) and starts them again. The
**Sort** toggle in the panel's header cycles Default (the home's own order), Occupation (people ordered by
occupation) and Occupation Groups (each Home Location split into one heading per occupation, with its count). The
names are made the same way as the townscape people, and every list is shown a page at a time ("Show more") so
very large populations stay fast; sorting a home of millions is arithmetic, not a real sort. Click a
tile or a Home Location to select it: it is highlighted in the panel and a slowly blinking black,
white-outlined arrow points at it, hanging above the tile when it is on screen and otherwise sitting at the
edge of the map, pointing towards it, clear of other UI. Click anywhere else (the map, or a civilization, continent, kind or occupation heading)
to deselect it. **Hovering a person's row** moves the same arrow to that person while the hover lasts: onto their
dot while townscapes show and they are outdoors, or above the roof they currently occupy when indoors
(including buildings they are visiting). Otherwise it points onto their Home Location's icon circle while icon
circles show, otherwise onto their home tile (at the screen edge when off screen). The other way round, with the
panel open, **hovering a person dot, icon circle or tile on the map** highlights the matching rows in the panel:
the person, their Home Location and their tile. City-centre dots are hidden while townscapes show. Townscapes are drawn fully opaque, with thin streets, link roads and creeks.
The list rebuilds shortly after the turn or fog setting changes.
Each person row also shows an **age category** (Child, Youth, Adult or Elder) beside the gender. People **age every
turn** by the recorded Realistic duration, or, for older recordings, at least one and at most four
years a turn (two when the calendar can't be read), and
each person's place is a lifetime: they **die** of old age, illness in infancy, disease (with occasional outbreaks,
worse in big cities and early ages), battle (wounded units on or beside their home) or pillaging (their home or a
neighbouring tile pillaged), and someone takes their place, either a child **born** into the family (more likely
when the home city has food to spare and is growing) or a newcomer starting a new family. A person's tooltip shows
their age and what happened this turn ("Born this turn", "Moved here this turn", "Took the place of Brutus Brutii,
who died this turn of disease"); every heading's tooltip adds about how many were born and died this turn. Children
are listed as "Infant" or as their family trade's child, and about one or two people in a hundred **change trade**
each turn (a new age reshuffles the trades). Lives are worked out deterministically from the recorded turns (a slot's
life is stepped turn by turn and kept), so they are the same every time a turn is viewed and survive reloads without
being saved.
The **search box** under the header filters the panel: typing a name, occupation, age category or the name of any
level (civilization, continent, tile, kind of icon, Home Location) lists matching rows, people first from the open
Home Locations and then from up to 150 people of every other one (2,000 people per search, at most 200 results;
a note says when not everyone was searched). Clicking a result clears the search and opens the panel at it; Escape
or the Clear button clears the search.
The **pin** button at the start of each person row pins that person: pinned people are listed in their own section
at the top of the panel (kept there through collapsing, sorting and searching), and their walker always stays in
sight on the map while their townscape is shown (going past doors instead of in, and given a walker of their own
if they are not among the townscape's usual few). Pins are saved with the game (up to 40) and kept from turn to turn:
a pinned soldier stays pinned as their unit marches, upgrades or stacks with others (units have no saved id, so the
mod follows each unit from the tile it moved from, which can lose track of one in a crowded stack), and a unit's
people keep their names and lives wherever it goes. A pinned person who isn't
there on the viewed turn is listed greyed as "Died", "Not yet born" or "Not here this turn".
The Leaders Panel also has a collapsible **Pinned people** section showing these same pins, including
nonleaders and unavailable people, on every civilization tab.
The **Follow camera** crosshair beside each person's pin keeps that walker centered and outdoors,
and adds them to the pinned walkers list. Click it again to stop, or click another person's crosshair
to stop following the previous walker and follow the new one. Following also saves a pin when a slot is
available; at the 40-pin limit, the followed person has an extra temporary row without evicting any saved pin.
Stopping the camera keeps saved pins; unpinning the followed person stops the camera.
Without a visible townscape walker, the camera follows their home tile instead. Following continues with a
moving unit across turns, pauses under game menus and while dragging, and stops if the person dies,
their home disappears, or Map View closes. An unavailable pinned person's follow button is disabled.
The **Family Tree** icon beside a person's pin toggles a separate panel with individual boxes for spouses,
parents and children, showing ages and deaths. Pink paths join marriages; green branching paths connect
parents and children across generations. Its square viewport fits the full tree initially.
Drag inside it to pan and use the wheel to zoom around the pointer. The header's **-**, **+** and **[]**
buttons zoom out, zoom in and fit the whole tree. With the viewport focused, arrow keys pan, +/- zoom
and 0 fits. Dragging a box pans without triggering its double-click follow action.
Hover a person row, family box or map walker to highlight that same person everywhere in both panels
and the tree, including duplicate pinned rows. Past lives highlight only their own generation.
The Population Panel's name rows also show marriage status and child counts;
hover the name to read the full summary, including the spouse's name.
The panel uses a wider share of the screen and retains full person-row text instead of ellipsizing it.
Use Shift+wheel, a horizontal touchpad gesture or its horizontal scrollbar to reveal long rows on
smaller screens. Each person's **Action** line updates while walkers move and uses the same activity text
as walker and Population-row tooltips, including command destinations and blocked commands.
People outside the active walking scene are explicitly marked as not currently simulated.
Relationships are automatically modeled between existing person entries in cohorts of at most eight
within a Home Location, using their retained lives. Marriages require adults, living together at the time,
without known shared ancestors; children link to eligible married parents present at their birth.
Existing modeled parent links remain. Newcomers are not assigned invented local parents, and military
entries do not gain modeled infant children. Marriage and child links reference specific slot generations,
so replacements do not inherit their predecessor's marriage. Widowed people keep their retained spouse link.
The tree follows the selected person after death, with up to 64 past lives per slot retained.
The pin in the Family Tree header pins every living member of the displayed family, or unpins them when
all are already pinned. This uses the shared saved pins and 40-person limit; if the whole family cannot
fit, a notice appears and no partial changes are made. Deceased relatives are excluded.
These are reproducible relationships among the viewed turn's represented people, not genealogy recorded by
Civilization VII or a complete population-wide household simulation. Changing home membership can change
the reconstructed household; absent or pruned relatives cannot be recovered.
**Double-click a living person's Family Tree box** to camera-follow them and add them to the pinned
walkers list. Following the same person again keeps following rather than toggling it off.
**Double-click a living person in the Population Panel** to animate the camera:
slowly zoom out, pan to their location, then zoom fully in and settle on the walker or occupied roof's centre.
Without an active walker, use their accepted home roof when available, otherwise their tile until it loads.
The bounded walking scene is retained through the zoom-out so indoor visitors can keep their occupied building.
The trip stops camera-follow first and cancels on manual navigation, a game overlay, changing turns,
death, closing Map View or starting another trip. Deceased relatives cannot be flown to on the viewed turn.
While townscapes show, every townscape building, road and creek has a civ-specific name matching its Home
Location, written along its length, as are rivers (navigable or not), mountain ranges and forests; trees are drawn
25x smaller and the settlement, country, region and improvement labels much smaller.
These small trees have twice their previous density while townscapes are visible; normal map trees are unchanged.
Minor-road and creek names have greater label coverage, with smaller type where a short line needs it,
more repeated labels along long lines, and a shared budget of up to 600 labels. Lines too short to fit names
legibly on screen are still omitted; Home Location titles do not require a long line to be displayed.
**Commands.** On the live turn (not while replaying older turns) you can direct your own people, each once per turn
(leaders three times).
Pick people with the **checkbox** at the start of their row, or by **dragging a selection box** over the townscapes
(Ctrl adds to the selection; with townscapes shown, Shift+drag or middle-drag pans the map). Then **right-click** a
townscape building, a tree or another person: while the right button is held, meandering arrows show each picked
person's way to the target along roads, creeks and bridges, and on release a menu lists the actions that fit who is
picked and what was clicked, with each action's chance of success (for example a Caretaker can "Tend to grounds" at
the Palace, a Warrior can attack an enemy walker whose unit is fighting theirs). Every occupation has at least two
actions tied to a yield; how much it gives and how likely it is to work depend on how many people take part and how
many allied buildings or enemy walkers are nearby, and a risky action can kill some of them (their place in the
panel passes on, as with any other death) or draw newcomers to the home, changing its population on the map and in
the panel. A command can only be aimed at something on the tile a picked person stands on or a tile next to it
(people too far away are left out, and the menu says so). Chances are low: most actions come off one time in five
or less, never more than 60% without a leader (80% with one). All command rewards, including healing, are about
one tenth of their former amounts. Small groups receive a further cut unless a **leader** takes part or a
**great crowd** does it: one to six people earn 2% of the reduced full amount, rising with the square of the
crowd (25% for twenty) to all of it for forty or more; any leader taking part earns the reduced full amount.
Amounts retain three decimal places, so even tiny rewards accumulate; only whole yields are paid at the
end of the turn and fractions carry over. Every trade has a dozen or more actions (over 250 in
all), each tied to a yield (Food, Production, Gold, Science, Culture, Happiness, Influence or **Unit Health**), plus
a few anyone can do. What commands earn is queued (saved with the game) and **paid into your civilization when your
turn ends** with the game's `Players.grantYield` (Gold and Influence fall back to the treasury calls); a queue left
unpaid, e.g. by a reload, is paid when the next turn begins. Unit Health heals the unit of the walker it was aimed at
(or the picked people's own unit, or one of yours on that tile) when the turn ends, and a risky action that fails
wounds the doers' unit; this uses whichever health call the game exposes to the interface, so it may not apply in
every version. Each payment is logged to `UI.log` as `[ANTHROPROCENIA] commands paid (...)`.
When a walker finishes a rewarded command at its destination, a **yield icon and amount** rise above them,
slowly fading over 3.6 seconds before being removed, like pillage yield feedback. A group's reward is divided
between its walkers without multiplying the total. These popups show earnings queued for turn end, not a
second payment, and do not replay after loading a save.
For balance, every living **AI major civilization** gets a bonus to **each civilization yield** equal to
the sum of your walkers' civilization-yield earnings that turn. For example, 0.1 Food plus 0.2 Gold earns each
AI major 0.3 of each yield. Other human players, minor civilizations and independents are excluded; healing
and wounds do not count toward this bonus. Rival bonuses are saved, paid at turn end and carry fractional
amounts across turns too. Failed payments remain queued for retry without repeating successful payments.
People who acted walk to the target at walking pace along roads, creeks and bridges (from wherever they stand, even
after a reload) and stay there for the rest of the turn, even while walking is unpaused. People who aren't soldiers
keep away from tiles and townscapes where units are fighting. Escape or a click elsewhere closes the menu.
Command gestures, menu choices and selection-box releases do not open the city details behind them.
Each of your **Home Location** rows has a checkbox to select all its people without constructing millions
of selection records; click again to clear that home, or use **Select none** at the panel's bottom.
Spent command allowances are excluded. Commands still act on the selected walkers currently represented
on the map, not every abstract person in a selected home.
While anyone is picked, the narrow, scrollable **Command Panel** on the left lists what the picked people can do,
grouped by trade, with each action's yield, rough chance and the kinds of target it needs.
Hover a command row to highlight it and all matching on-screen buildings, trees or people within
reach of that row's eligible walkers. Moving off removes these highlights immediately.
Click a row (or focus it and press Enter/Space) to keep it selected and keep its targets highlighted.
Hover a valid target to preview those walkers' routes, then left- or right-click it to issue the command
and clear the row selection. Escape cancels targeting. Invalid targets do not issue commands;
without a selected row, the existing right-click target menu remains available.
**Leaders.** The first people of some Home Locations hold leadership roles: the royal family at the Palace (King or
Queen, consort, the heir - even as a child - and two more princes or princesses), the Governor and Deputy Governor
at a settlement's urban centre, a Commander with their Scribe and Aide in an Army or Fleet Commander, a Centurion
and Optio in Roman military units (a Captain and Sergeant in other civilizations', a Ship's Captain and First Mate
at sea). Their role shows in gold in their tooltip. The **Leaders** button beside the Population button at the top
centre opens the Leaders Panel, which lists them (palace first) with checkboxes to pick them; hovering a row points
the selection arrow at them. Its tabs show **Your civ**, **Met civs** (other civilizations the recorded
observer had met on that turn), or **All civs**. All tabs respect Fog of War; an older recording without
contact history explicitly says so in the Met civs tab.
Click a civilization's Royal Court, Governors or Officers section header to collapse or expand its rows.
Collapsed sections stay collapsed when switching tabs; selecting a map walker reveals their section.
Both panels have icons on their action buttons, circular people/crown opening buttons, and circular
**X** close buttons. Leader rows also provide pin, follow and family-tree controls.
Clicking a walker reveals and highlights their Population Panel row (and their Leaders Panel row when open);
eligible player-owned walkers are checked for commands immediately. Repeated clicks keep them checked.
A leader can be given **three commands a turn**, has extra actions of their own (Hold
Court, Levy Taxes, Inspect the Troops, Lead the Charge, ...), and greatly raises the chance of any action they take
part in, as well as keeping the others safer.
While townscapes show, the **Territory** checkbox is switched off (tick it back on at any time) and switched back
on when they go. Every building, wonder, improvement and unit type of the base game and its DLC has a semi-unique
townscape layout (an archetype for its kind of type - a granary, aqueduct, temple, mine or harbour each look
different - varied by the type itself). Zoomed in far closer than the townscapes need, **mini-decorations** -
tufts of grass, bushes, rocks and pebbles, plus lampposts, benches, barrels and crates - appear across them
in much greater numbers, with the same placement rules keeping them out of buildings, streets and water.
Vegetation and stones also scatter across ordinary land tiles without a townscape, at that same
close-zoom threshold. Vegetation is more frequent. Only padded visible tile patches are generated;
candidate caches and per-view placement budgets bound the work. Fog-hidden tiles are excluded.
Mini-decorations are 20% smaller, with twice as many placement candidates in towns and ordinary land patches.
The ordinary-land placement budget is capped at 24,000 accepted decorations; collision checks, shared SVG
paths and padded-view caches remain in use.
The maximum map zoom is four times deeper, with an allowance of 80 nominal screen heights per tile.
A person is stored as four small ids: a first name and a last name from their civilization's name lists (its
hand-written names followed by names generated from its culture's sounds and baked into the lists, plus every
faith's given names), and two different personality traits from one game-wide list (shown in the person's tooltip).
Their home is the Home Location and tile they are listed under, and their occupation comes from that home's mix of
trades. Every person also gets a deterministic workplace: their trade chooses an appropriate same-civilization
Home Location on their tile or a neighbouring tile, then their ID distributes them among suitable accepted
buildings there. Workshops, markets, shrines, halls, forts and other building forms are matched to occupations;
where no specialised building exists, an available local building is used. Workplaces appear beside homes
in person rows and in tooltips, and walkers sometimes commute to their assigned workplace door along the
walking network. Children use their household trade for this modeled assignment.
On an autonomous trip, a walker can stop at an occupation-compatible building whose door branches
directly off the route, carry out a fitting ambient action, then resume the original destination.
These visits do not issue commands, consume command allowances or generate command yields.
Walkers sometimes share destinations and similar paces with nearby companions, favoring living
modeled relatives and people from the same unit and home roof. Commands take priority over these trips.
Small, person-specific bends make routes less rigid, but a bend is used only when both of its segments
remain clear of trees/buildings and obey the same water, road and bridge restrictions.
No population-sized workplace arrays or extra per-person save records are created. An unrendered workplace
keeps its Home Location assignment and explicitly says "townscape not loaded"; its particular roof is resolved
when that townscape loads, using the same accepted-building mechanism as residences.
Packed together the four ids fit in at most seven characters (`packPerson`/`encodePeople` store people as
id lists under their tile and Home Location), and names are rebuilt from the ids, so no name is ever stored as
text. People are still worked out from their home's seed rather than written one by one (a home can hold millions);
the name lists' version is part of the saved panel's signature, so changed lists rebuild the panel.
The people in the Population Panel and the townscape layouts are **saved with the save game** (in the same
game-configuration store as the recorded history) and loaded back instead of being worked out again. For the
viewed turn the panel saves every icon circle's name, population and kind, with the civilization, belief and
era its people are generated from, so the people stay identical after a reload. Each townscape layout is saved
once in a shared, compact library (coordinates are whole numbers, delta-coded) and, per turn, a small record notes
which of its buildings, tents, fields and parks cleared the map's trees, rivers and roads. A saved record is used
only while the recorded turn, map zoom tier and size still match it; otherwise it is rebuilt and saved again.
Saving happens a few seconds after something is worked out, one record at a time, never while the replay is
playing, and is flushed when the game saves. With Map View open, the viewed turn's people are saved even if the
panel is closed, so each new turn is stored as you reach it; turns that pass while Map View stays closed are
stored the first time you view them. Only the newest 64 turns of these records are kept (older ones are blanked
and simply rebuilt if you scrub back to them), and a record over about 600,000 characters (a very large map) is
not saved. Clearing the recorded history also clears these records.
The population figure is scaled by the population of the city the unit came from or
the constructible belongs to, divided by 50, then divided by 5 for the individual icon. Units are encampments (or opposing battle lines while wounded or next to an
enemy at war). The selected-entity arrow now hangs above it, pointing down, while it is
on screen. Constructible labels are drawn at their real on-screen size so the text
stays sharp, and shrink (to a floor of 9px) as you zoom in.
Holding the right mouse button with one of your units selected draws a
semi-transparent arrow along the game's path to the hovered tile, with the number of
turns marked at the end of each turn and at the destination (and on every tile when
zoomed in closely).
While Map View is open, city banners, unit flags and health bars are hidden.
While a townscape layout is showing, the
buildings' decorative squares underneath it are left out. All map layers, including every label inside them,
are hidden while a leader scene (such as diplomacy) is on screen. Roads that
follow a river are drawn beside it, rejoining it at tile centres.
Generated Great/Greater/Lesser and cardinal-direction qualifiers are retained
only when comparable features support their relative sizes or positions.
Ambiguous or unsupported qualifiers are removed, including from saved names.

## Development

The installable mod is in `anthroprocenia/`. The manifest defines script load
order; capture, geography, and rendering code live under `ui/history`,
`ui/geography`, and `ui/map`. The included deployment script supports
Linux/Proton. Restart Civilization VII after deploying changes.

Development tests require Node.js 22.13 or newer (calendar SQL tests use built-in `node:sqlite`).
To prepare a release, run `Prepare Publish.bat`. It tests the mod and rebuilds
`Publish/` with the Steam Workshop upload folder and the CivFanatics zip.
Upload steps are in [Publish/PUBLISHING.md](Publish/PUBLISHING.md).

## License

[MIT](LICENSE) Â© 2026 SLIM_AL

## Expanded research: three times the technologies and civics

Every installed native/DLC research tree and every Anthroprocenia civilization
civic tree now has exactly three times its original node count. Attribute trees
are deliberately unchanged. Each original subject is followed by two related
applications or institutions; successors retain their original AND/OR choice
semantics through those applications. Original node IDs, names, icons, quotes,
unlock rows, civilization traits and tree-reveal modifiers are retained.

With all currently installed official DLC, the counts are:

| Age | Technologies | Common main civics | Other common civic branches | Test of Time civics | Civilization-specific civics |
| --- | ---: | ---: | ---: | ---: | --- |
| Antiquity | 16 → **48** | 14 → **42** | — | 35 → **105** | 12 native/DLC trees: 3 → **9** each; 5 native/DLC trees: 4 → **12** each; 13 Anthroprocenia trees: 6 → **18** each |
| Exploration | 15 → **45** | 13 → **39** | Theology: 2 → **6** | 34 → **102** | 13 native/DLC trees: 3 → **9** each; 5 native/DLC trees: 4 → **12** each; 17 Anthroprocenia trees: 6 → **18** each |
| Modern | 17 → **51** | 10 → **30** | Democracy, Fascism, Communism: 3 → **9** each | 37 → **111** | 6 native/DLC trees: 3 → **9** each; 9 native/DLC trees: 4 → **12** each; 17 Anthroprocenia trees: 6 → **18** each |

Total civic nodes, including common branches and Test of Time: Antiquity
**183 → 549**, Exploration **210 → 630**, Modern **212 → 636**. There are
**1,306 new nodes** across **110 research trees**. Optional DLC is not required:
an extension is created only if its original node is present.

### Exactly retained budgets, useful additional unlocks

The original raw integer research budget is split across each expanded tree.
Both the base-research sum and the cost-weighted mastery budget are exactly
retained. Costs remain positive; one-point starting nodes remain one point.
Repeatable originals keep their original cost, repeat flag and escalation
parameters, with the two minimum-cost companions funded from the same tree's
finite budget. Existing mastery unlock depths are unchanged. New companions
have mastery only where the loaded original has mastery, including DLC-specific
mastery additions. Difficulty/speed multipliers and engine per-node rounding
can still cause small differences in actual turn counts.

New content includes **12 trainable units** and **18 ordinary urban buildings**
(four units and six buildings per Age), plus **1,726 policy definitions** when
all DLC and all Ages are represented, including **420 mastery refinements**.
Companion policies provide different, complementary yields from a named
building, not unbounded empire-wide flat yields; their effects apply only
while slotted. Refinements obsolete their own earlier policy. New units trade
two points of armed combat strength for one movement point, cost 20% more,
inherit native AI/abilities and upgrade destinations, and replace no existing
units. Buildings have authored roles and mixed local yields. Examples include
Seed Houses, Rigging Lofts, Computing Bureaux, Coastal Cutters and Motor Scouts.

Artwork uses **36 original white geometric PNG symbols** mounted under
`fs://game/anthroprocenia/art/progression/`; physical units/buildings remap to
installed native meshes. Existing civilization/background art is not changed.
Every new node has a unique `VO_ANTHRO_*` TypeQuotes identifier and authored
quote localization. Its `LOC_NODE_ANTHRO_*_NAME` and matching `_DESCRIPTION`,
along with new unit/building/policy descriptions and Civilopedia histories,
are automatically included in `tools\build-narration.py`'s existing inventory.
This adds **4,398 authored recording scripts** (descriptions and histories).
Generating this content does not record or overwrite narration audio.
Original Anthroprocenia civic nodes also register unique
`VO_ANTHRO_ORIGINAL_*` TypeQuotes identifiers. Their quotes reference only
their existing authored `_DESCRIPTION` localization, allowing the same
completion hook to play existing recordings without adding narration scripts
or changing native quotations.

The game-only `ui\progression\anthroprocenia-progression-icons.js` bridge
resolves Anthroprocenia node/tree `IconString` identifiers through
`UI.getIconURL` to their registered PNGs rather than treating them as native
`blp:` textures. It wraps the shared culture-node, technology-node and
culture-tree image helpers used by completion panels, choosers and tree-grid
delegates. Native IDs and civilization-injected icons keep their native
behavior; invalid custom lookups fall back to the original helpers. No
tree-grid CSS override or native file replacement is needed. The progression
generator does not overwrite this bridge or its manifest UIScript registration.

### Rebuilding and validation

```powershell
python tools\build-progression.py
python tests\progression-native.py
node --test tests\progression-icons.test.mjs
```

Both commands default to the installed Steam game's `Base` directory; the
generator accepts `--base PATH`, and the tests accept `PATH` as their first
argument. `tools\progression-inventory.json` records every original/added node,
its tree, costs and unlocks; authored subjects are in
`tools\progression-content.py`. Generated gameplay files are
`anthroprocenia\data\progression-expansion.sql` and the three
`progression-content-AGE.sql` files; localization/art registrations are
`ProgressionExpansion.xml`, `progression-icons.xml` and `progression-remaps.xml`.
`anthroprocenia\config\ProgressionExpansion.sql` keeps registered civilization
selection-screen research previews at the same expanded counts and budgets,
without changing existing civilization items or native frontend node IDs.

Focused tests load installed native schemas/data for all three Ages with and
without DLC, verify exact per-tree tripling and budgets, retained unlocks and
traits, DAG reachability, original AND/OR prerequisite order, functional policy
effect/argument contracts, unit statistics/upgrades, building placement/yields,
art mounts, narration inventory and stable save/replay type IDs. They also
verify that rerunning the generated SQL is idempotent. Native cross-Age
references to unloaded Ages and engine-expanded GameEffects are compared
against the baseline rather than mistaken for new content failures.

Native in-game verification still needs fresh campaigns in each Age to check
long-tree layout/scrolling, technology and civic completion/mastery, policy
slotting/refinement, civilization-selection previews, unit production/upgrades, building placement/models,
TypeQuotes narration, DLC enable/disable and Test of Time choices. Existing
save IDs are retained, but saves with partial research need actual load/resave
testing because costs and intervening prerequisites change. Back up campaigns
before enabling the expanded progression; stable database IDs are not a claim
that an old partial research queue has been tested in the engine.
