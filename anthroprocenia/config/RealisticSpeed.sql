DELETE FROM GameSpeeds WHERE GameSpeedType <> 'GAMESPEED_STANDARD';
UPDATE GameSpeeds SET Name = 'LOC_ANTHRO_REALISTIC_SPEED', Description = 'LOC_ANTHRO_REALISTIC_SPEED_HELP'
WHERE GameSpeedType = 'GAMESPEED_STANDARD';
UPDATE Parameters SET DefaultValue = 'GAMESPEED_STANDARD' WHERE ParameterID = 'GameSpeeds';
WITH Factors(N) AS (VALUES (2),(3),(4),(5),(6))
INSERT INTO GameSpeeds (Domain, GameSpeedType, Name, Description, SortIndex)
SELECT speed.Domain, 'GAMESPEED_ANTHRO_REALISTIC_X' || N, 'LOC_ANTHRO_REALISTIC_SPEED_X' || N,
    'LOC_ANTHRO_REALISTIC_SPEED_X' || N || '_HELP', 30 + N
FROM GameSpeeds AS speed CROSS JOIN Factors WHERE speed.GameSpeedType = 'GAMESPEED_STANDARD';
