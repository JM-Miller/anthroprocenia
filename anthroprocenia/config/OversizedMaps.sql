CREATE TEMP TABLE AnthroMapWrappers (Original TEXT PRIMARY KEY, Wrapper TEXT NOT NULL);
INSERT INTO AnthroMapWrappers VALUES
('{base-standard}maps/continents-voronoi.js', '{anthroprocenia_map_history}maps/anthro-continents-voronoi.js'),
('{base-standard}maps/pangaea-voronoi.js', '{anthroprocenia_map_history}maps/anthro-pangaea-voronoi.js'),
('{base-standard}maps/fractal-voronoi.js', '{anthroprocenia_map_history}maps/anthro-fractal-voronoi.js'),
('{base-standard}maps/archipelago-voronoi.js', '{anthroprocenia_map_history}maps/anthro-archipelago-voronoi.js'),
('{base-standard}maps/shattered-seas-voronoi.js', '{anthroprocenia_map_history}maps/anthro-shattered-seas-voronoi.js'),
('{base-standard}maps/shuffle-voronoi.js', '{anthroprocenia_map_history}maps/anthro-shuffle-voronoi.js'),
('{base-standard}maps/terra-incognita-voronoi.js', '{anthroprocenia_map_history}maps/anthro-terra-incognita-voronoi.js'),
('{base-standard}maps/donut-voronoi.js', '{anthroprocenia_map_history}maps/anthro-donut-voronoi.js');

UPDATE Maps SET File = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = File)
WHERE File IN (SELECT Original FROM AnthroMapWrappers);
UPDATE Parameters SET DefaultValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = DefaultValue)
WHERE ParameterID = 'Map' AND DefaultValue IN (SELECT Original FROM AnthroMapWrappers);

-- Keep map-specific options and restrictions attached to the compatibility entry points.
UPDATE Parameters SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainOverrides SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainValues SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainValueUnions SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainValueFilters SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ConfigurationUpdates SET Key2 = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Key2)
WHERE Key1 = 'Map' AND Key2 IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ConfigurationUpdates SET SourceValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = SourceValue)
WHERE SourceGroup = 'Map' AND SourceKey = 'Script' AND SourceValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ConfigurationUpdates SET TargetValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = TargetValue)
WHERE TargetGroup = 'Map' AND TargetKey = 'Script' AND TargetValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainValues SET Value = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Value)
WHERE Value IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainValueFilters SET Value = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Value)
WHERE Value IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ParameterCriteria SET ConfigurationValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = ConfigurationValue)
WHERE ConfigurationGroup = 'Map' AND ConfigurationKey = 'Script' AND ConfigurationValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ParameterDependencies SET ConfigurationValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = ConfigurationValue)
WHERE ConfigurationGroup = 'Map' AND ConfigurationKey = 'Script' AND ConfigurationValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ParameterQueryCriteria SET ConfigurationValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = ConfigurationValue)
WHERE ConfigurationGroup = 'Map' AND ConfigurationKey = 'Script' AND ConfigurationValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE ParameterQueryDependencies SET ConfigurationValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = ConfigurationValue)
WHERE ConfigurationGroup = 'Map' AND ConfigurationKey = 'Script' AND ConfigurationValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE QueryCriteria SET ConfigurationValue = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = ConfigurationValue)
WHERE ConfigurationGroup = 'Map' AND ConfigurationKey = 'Script' AND ConfigurationValue IN (SELECT Original FROM AnthroMapWrappers);
UPDATE MapLeaders SET Map = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Map)
WHERE Map IN (SELECT Original FROM AnthroMapWrappers);
UPDATE DomainOverridesByMap SET Map = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Map)
WHERE Map IN (SELECT Original FROM AnthroMapWrappers);
UPDATE SupportedValuesByMap SET Map = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Map)
WHERE Map IN (SELECT Original FROM AnthroMapWrappers);
UPDATE UnSupportedValuesByMap SET Map = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Map)
WHERE Map IN (SELECT Original FROM AnthroMapWrappers);
UPDATE MapRestrictions SET MapFile = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = MapFile)
WHERE MapFile IN (SELECT Original FROM AnthroMapWrappers);
UPDATE MapStartPositions SET Map = (SELECT Wrapper FROM AnthroMapWrappers WHERE Original = Map)
WHERE Map IN (SELECT Original FROM AnthroMapWrappers);
DROP TABLE AnthroMapWrappers;

UPDATE MapSizes
SET Name = 'LOC_ANTHRO_LUDICROUS_MAP_SIZE',
    Description = 'LOC_ANTHRO_LUDICROUS_MAP_SIZE_HELP'
WHERE MapSizeType = 'MAPSIZE_LUDICROUS';

INSERT OR REPLACE INTO MapSizes (Domain, MapSizeType, Name, Description,
    MinPlayers, MaxPlayers, MaxHumans, DefaultPlayers, SortIndex)
SELECT Domain, 'MAPSIZE_ANTHRO_COLOSSAL', 'LOC_ANTHRO_COLOSSAL_MAP_SIZE',
    'LOC_ANTHRO_COLOSSAL_MAP_SIZE_HELP', MinPlayers, MaxPlayers, MaxHumans,
    DefaultPlayers, SortIndex + 1
FROM MapSizes WHERE MapSizeType = 'MAPSIZE_LUDICROUS';
