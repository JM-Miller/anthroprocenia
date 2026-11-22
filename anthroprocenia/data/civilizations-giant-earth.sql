-- Giant Earth uses a hand-drawn 180x94 grid, not a longitude/latitude projection.
-- These IDs belong to the Anthroprocenia expansion, not community civilizations.
-- Capital regions use nearby land where map scale places the named city on water or mountains.
DELETE FROM StartPosition
WHERE MapName = 'GiantEarth'
  AND Civilization IN (
    'CIVILIZATION_ANTHRO_BRITONS', 'CIVILIZATION_ANTHRO_SUEBI',
    'CIVILIZATION_ANTHRO_XIONGNU', 'CIVILIZATION_ANTHRO_CARALANS',
    'CIVILIZATION_ANTHRO_WAGADU', 'CIVILIZATION_ANTHRO_JAVANESE',
    'CIVILIZATION_ANTHRO_SLAVIC', 'CIVILIZATION_ANTHRO_TAINO',
    'CIVILIZATION_ANTHRO_IBERIA', 'CIVILIZATION_ANTHRO_THRACE',
    'CIVILIZATION_ANTHRO_SCYTHIA', 'CIVILIZATION_ANTHRO_NORDIC',
    'CIVILIZATION_ANTHRO_PICTISH', 'CIVILIZATION_ANTHRO_ZIMBABWE',
    'CIVILIZATION_ANTHRO_BYZANTIUM', 'CIVILIZATION_ANTHRO_AYUTTHAYA',
    'CIVILIZATION_ANTHRO_AZTEC', 'CIVILIZATION_ANTHRO_MOHAWK',
    'CIVILIZATION_ANTHRO_FRANKS', 'CIVILIZATION_ANTHRO_SELJUK',
    'CIVILIZATION_ANTHRO_RUS', 'CIVILIZATION_ANTHRO_LOMBARDS',
    'CIVILIZATION_ANTHRO_TIMURIDS', 'CIVILIZATION_ANTHRO_VENICE',
    'CIVILIZATION_ANTHRO_ALMOHADS', 'CIVILIZATION_ANTHRO_KHWARAZMIANS',
    'CIVILIZATION_ANTHRO_PAPAL_STATES', 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION',
    'CIVILIZATION_ANTHRO_ASHANTI', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT',
    'CIVILIZATION_ANTHRO_SERBIA', 'CIVILIZATION_ANTHRO_INDONESIA',
    'CIVILIZATION_ANTHRO_PORTUGAL', 'CIVILIZATION_ANTHRO_HUNGARY',
    'CIVILIZATION_ANTHRO_TAHITI', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA',
    'CIVILIZATION_ANTHRO_VATICAN', 'CIVILIZATION_ANTHRO_BERBER',
    'CIVILIZATION_ANTHRO_SWEDEN', 'CIVILIZATION_ANTHRO_AFGHANISTAN',
    'CIVILIZATION_ANTHRO_KAZAKH', 'CIVILIZATION_ANTHRO_SCOTLAND',
    'CIVILIZATION_ANTHRO_DOMINICAN', 'CIVILIZATION_ANTHRO_HAITI',
    'CIVILIZATION_ANTHRO_BRAZIL', 'CIVILIZATION_ANTHRO_LAKHOTA', 'CIVILIZATION_ANTHRO_NAVAJO'
  );

INSERT INTO StartPosition (MapName, Civilization, X, Y) VALUES
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LAKHOTA', 139, 67), -- Black Hills / northern Plains; nearby Rapid City landmark.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NAVAJO', 136, 62), -- Northeastern Arizona canyon / plateau regional approximation.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRITONS',   12, 73), -- Eastern Britain.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SUEBI',     20, 71), -- Elbe homeland, not Galicia.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_XIONGNU',   75, 72), -- Orkhon-Selenga, Mongolia.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_CARALANS', 151, 27), -- Supe/Huacho coastal valleys.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAGADU',     9, 42), -- Koumbi Saleh, not modern Ghana.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_JAVANESE',  82, 25), -- Central Java.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SLAVIC',    31, 70), -- Polesia; origins are debated.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO',    161, 39), -- Lower Orinoco regional approximation; internal ID retained.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_IBERIA',    10, 57), -- Northeastern Iberian Peninsula, Tarragona region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_THRACE',    29, 60), -- Upper Hebros, Plovdiv region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCYTHIA',   37, 67), -- Lower Dnieper steppe, Kamyanka region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NORDIC',    20, 74), -- Funen, Voldtofte/Odense region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PICTISH',    9, 81), -- Moray Firth/Inverness region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ZIMBABWE',  30, 16), -- Great Zimbabwe/Masvingo.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BYZANTIUM', 31, 60), -- European shore beside Constantinople's water tile.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AYUTTHAYA',  75, 42), -- Chao Phraya basin, Ayutthaya.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AZTEC',    138, 49), -- Tenochtitlan, Valley of Mexico.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_MOHAWK',   154, 68), -- Mohawk Valley, west of Albany.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_FRANKS',    16, 69), -- Aachen, Carolingian heartland.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SELJUK',    35, 57), -- Konya region, central Anatolia.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_RUS',       33, 69), -- Kyiv, middle Dnieper.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LOMBARDS',  18, 62), -- Pavia, western Po valley.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TIMURIDS',  55, 60), -- Samarkand.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VENICE',    21, 62), -- Venetian lagoon land tile.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ALMOHADS',   7, 47), -- Marrakesh, north of the High Atlas.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KHWARAZMIANS', 50, 61), -- Lower Oxus, Gurganj/Urgench region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PAPAL_STATES', 20, 58), -- Rome region; separate from Vatican's tile.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION', 155, 47), -- Central Hispaniola.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ASHANTI',   11, 34), -- Kumasi, not Wagadu's Sahelian homeland.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT', 30, 47), -- Cairo, Nile floodplain.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SERBIA',    27, 62), -- Belgrade.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_INDONESIA', 80, 26), -- Jakarta, western Java.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PORTUGAL',   4, 55), -- Lisbon, Atlantic Iberia.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HUNGARY',   26, 64), -- Budapest, middle Danube.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAHITI',   123, 23), -- Tahiti itself, not Hawaii or a mainland fallback.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA', 156, 37), -- Bogota region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VATICAN',   20, 57), -- Rome region, neighboring Papal States' land tile.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BERBER',    10, 46), -- Tafilalt/Erfoud, southeastern Moroccan Atlas foothills.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SWEDEN',    24, 79), -- Stockholm.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AFGHANISTAN', 53, 57), -- Kabul-region valley beside the mountain city marker.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KAZAKH',    55, 62), -- Turkistan, Syr Darya region.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCOTLAND',  10, 78), -- Edinburgh, distinct from the northern Picts.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_DOMINICAN', 156, 47), -- Santo Domingo, eastern Hispaniola.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HAITI',    155, 46), -- Port-au-Prince, western Hispaniola.
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRAZIL',   167, 22); -- Rio de Janeiro.

-- Nearby alternatives generated by tools/build-giant-earth-starts.mjs.
-- Preserve the primary homeland; all pairs are 2-4 hex tiles apart on existing land.
-- Small islands retain fewer candidates rather than adding land or moving abroad.
INSERT INTO StartPosition (MapName, Civilization, X, Y, AlternateStart) VALUES
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LAKHOTA', 137, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LAKHOTA', 138, 65, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LAKHOTA', 138, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LAKHOTA', 140, 65, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NAVAJO', 134, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NAVAJO', 134, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NAVAJO', 136, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NAVAJO', 136, 64, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRITONS', 10, 73, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRITONS', 11, 75, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRITONS', 12, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRITONS', 10, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SUEBI', 18, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SUEBI', 19, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SUEBI', 21, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SUEBI', 22, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_XIONGNU', 73, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_XIONGNU', 73, 73, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_XIONGNU', 75, 70, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_XIONGNU', 76, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_CARALANS', 150, 29, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_CARALANS', 152, 25, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_CARALANS', 153, 27, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_CARALANS', 154, 29, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAGADU', 7, 41, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAGADU', 7, 43, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAGADU', 9, 44, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAGADU', 10, 40, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_JAVANESE', 81, 26, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_JAVANESE', 84, 24, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_JAVANESE', 82, 28, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_JAVANESE', 84, 28, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SLAVIC', 29, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SLAVIC', 29, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SLAVIC', 31, 68, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SLAVIC', 31, 72, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO', 159, 39, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO', 160, 37, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO', 163, 38, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO', 162, 36, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_IBERIA', 8, 57, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_IBERIA', 9, 55, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_IBERIA', 9, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_IBERIA', 11, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_THRACE', 27, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_THRACE', 27, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_THRACE', 29, 58, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_THRACE', 29, 62, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCYTHIA', 35, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCYTHIA', 36, 65, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCYTHIA', 36, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCYTHIA', 38, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NORDIC', 20, 76, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NORDIC', 22, 76, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NORDIC', 19, 78, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_NORDIC', 22, 78, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PICTISH', 8, 80, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PICTISH', 8, 82, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PICTISH', 9, 79, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PICTISH', 9, 83, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ZIMBABWE', 28, 15, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ZIMBABWE', 28, 17, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ZIMBABWE', 30, 14, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ZIMBABWE', 30, 18, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BYZANTIUM', 29, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BYZANTIUM', 29, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BYZANTIUM', 31, 62, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BYZANTIUM', 28, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AYUTTHAYA', 73, 41, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AYUTTHAYA', 75, 40, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AYUTTHAYA', 75, 44, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AYUTTHAYA', 76, 41, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AZTEC', 136, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AZTEC', 137, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AZTEC', 137, 51, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AZTEC', 139, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_MOHAWK', 152, 68, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_MOHAWK', 153, 66, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_MOHAWK', 155, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_MOHAWK', 154, 65, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_FRANKS', 15, 68, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_FRANKS', 15, 70, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_FRANKS', 16, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_FRANKS', 13, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SELJUK', 33, 57, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SELJUK', 34, 55, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SELJUK', 34, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SELJUK', 36, 55, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_RUS', 31, 69, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_RUS', 32, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_RUS', 32, 71, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_RUS', 34, 67, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LOMBARDS', 16, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LOMBARDS', 19, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LOMBARDS', 19, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_LOMBARDS', 17, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TIMURIDS', 53, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TIMURIDS', 53, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TIMURIDS', 55, 58, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TIMURIDS', 55, 62, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VENICE', 19, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VENICE', 19, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VENICE', 21, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VENICE', 22, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ALMOHADS', 5, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ALMOHADS', 6, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ALMOHADS', 7, 45, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ALMOHADS', 8, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KHWARAZMIANS', 48, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KHWARAZMIANS', 49, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KHWARAZMIANS', 49, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KHWARAZMIANS', 51, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PAPAL_STATES', 19, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PAPAL_STATES', 21, 57, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PAPAL_STATES', 21, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PAPAL_STATES', 20, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION', 154, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION', 153, 46, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAINO_EXPLORATION', 153, 48, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ASHANTI', 9, 33, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ASHANTI', 9, 35, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ASHANTI', 11, 36, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_ASHANTI', 12, 33, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT', 28, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT', 29, 45, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT', 29, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_WAFDIST_EGYPT', 31, 45, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SERBIA', 25, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SERBIA', 25, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SERBIA', 27, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SERBIA', 27, 64, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_INDONESIA', 78, 25, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_INDONESIA', 78, 27, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_INDONESIA', 81, 25, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_INDONESIA', 78, 23, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PORTUGAL', 4, 53, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PORTUGAL', 4, 57, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PORTUGAL', 6, 54, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_PORTUGAL', 6, 56, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HUNGARY', 24, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HUNGARY', 24, 65, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HUNGARY', 26, 62, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HUNGARY', 26, 66, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_TAHITI', 120, 22, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA', 154, 37, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA', 155, 35, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA', 155, 39, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_GRAN_COLOMBIA', 157, 39, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VATICAN', 19, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VATICAN', 22, 56, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VATICAN', 22, 58, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_VATICAN', 21, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BERBER', 8, 45, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BERBER', 8, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BERBER', 10, 44, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BERBER', 10, 48, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SWEDEN', 22, 79, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SWEDEN', 23, 77, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SWEDEN', 23, 81, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SWEDEN', 25, 77, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AFGHANISTAN', 52, 56, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AFGHANISTAN', 52, 58, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AFGHANISTAN', 53, 59, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_AFGHANISTAN', 55, 58, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KAZAKH', 53, 61, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KAZAKH', 53, 63, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KAZAKH', 55, 60, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_KAZAKH', 55, 64, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCOTLAND', 8, 78, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCOTLAND', 9, 80, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCOTLAND', 10, 76, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_SCOTLAND', 8, 76, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_DOMINICAN', 154, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_DOMINICAN', 154, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_DOMINICAN', 153, 46, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_DOMINICAN', 153, 48, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HAITI', 153, 46, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HAITI', 156, 47, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HAITI', 153, 48, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_HAITI', 154, 49, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRAZIL', 165, 22, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRAZIL', 166, 20, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRAZIL', 166, 24, 1),
  ('GiantEarth', 'CIVILIZATION_ANTHRO_BRAZIL', 168, 23, 1);
