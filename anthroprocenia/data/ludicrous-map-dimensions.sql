UPDATE Maps
SET GridWidth = 128, GridHeight = 80,
    Name = 'LOC_ANTHRO_LUDICROUS_MAP_SIZE',
    Description = 'LOC_ANTHRO_LUDICROUS_MAP_SIZE_HELP'
WHERE MapSizeType = 'MAPSIZE_LUDICROUS';

INSERT OR IGNORE INTO Types (Type, Kind) VALUES ('MAPSIZE_ANTHRO_COLOSSAL', 'KIND_MAPSIZE');
INSERT OR REPLACE INTO Maps (MapSizeType, AllOnLargestLandmass, Continents, DefaultPlayers,
    Description, GridHeight, GridWidth, LakeGenerationFrequency, LakeSizeCutoff, Name,
    NumNaturalWonders, OceanWidth, PlayersLandmass1, PlayersLandmass2, StartSectorCols, StartSectorRows)
SELECT 'MAPSIZE_ANTHRO_COLOSSAL', AllOnLargestLandmass, Continents, DefaultPlayers,
    'LOC_ANTHRO_COLOSSAL_MAP_SIZE_HELP', 129, 128, LakeGenerationFrequency, LakeSizeCutoff,
    'LOC_ANTHRO_COLOSSAL_MAP_SIZE', NumNaturalWonders, OceanWidth, PlayersLandmass1,
    PlayersLandmass2, StartSectorCols, StartSectorRows
FROM Maps WHERE MapSizeType = 'MAPSIZE_LUDICROUS';
