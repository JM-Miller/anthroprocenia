INSERT OR IGNORE INTO GlobalParameters (Name, Value) VALUES ('ANTHRO_REALISTIC_SPEED_FACTOR', '1');
INSERT OR IGNORE INTO Types (Type, Kind) VALUES
('GAMESPEED_ANTHRO_REALISTIC_X2', 'KIND_GAMESPEED'),
('GAMESPEED_ANTHRO_REALISTIC_X3', 'KIND_GAMESPEED'),
('GAMESPEED_ANTHRO_REALISTIC_X4', 'KIND_GAMESPEED'),
('GAMESPEED_ANTHRO_REALISTIC_X5', 'KIND_GAMESPEED'),
('GAMESPEED_ANTHRO_REALISTIC_X6', 'KIND_GAMESPEED');
INSERT OR REPLACE INTO GameSpeeds (GameSpeedType, Name, Description, CostMultiplier)
SELECT Type, 'LOC_ANTHRO_REALISTIC_SPEED_X' || SUBSTR(Type, -1),
    'LOC_ANTHRO_REALISTIC_SPEED_X' || SUBSTR(Type, -1) || '_HELP', 300
FROM Types WHERE Type IN ('GAMESPEED_ANTHRO_REALISTIC_X2', 'GAMESPEED_ANTHRO_REALISTIC_X3',
    'GAMESPEED_ANTHRO_REALISTIC_X4', 'GAMESPEED_ANTHRO_REALISTIC_X5', 'GAMESPEED_ANTHRO_REALISTIC_X6');
UPDATE GameSpeeds SET CostMultiplier = 300 WHERE GameSpeedType = 'GAMESPEED_STANDARD';
INSERT OR REPLACE INTO GameSpeed_Scalings (GameSpeedScalingType, GameSpeedType, ScalingType, DefaultCostMultiplier)
SELECT target.GameSpeedType || '_' || source.ScalingType, target.GameSpeedType, source.ScalingType, source.DefaultCostMultiplier
FROM GameSpeeds AS target CROSS JOIN GameSpeed_Scalings AS source
WHERE source.GameSpeedType = 'GAMESPEED_MARATHON'
  AND (target.GameSpeedType = 'GAMESPEED_STANDARD' OR target.GameSpeedType LIKE 'GAMESPEED_ANTHRO_REALISTIC_X%');
INSERT OR REPLACE INTO GameSpeed_Durations (GameSpeedScalingType, NumberOfTurnsOnStandard, NumberOfTurnsScaled)
SELECT target.GameSpeedScalingType, duration.NumberOfTurnsOnStandard, duration.NumberOfTurnsScaled
FROM GameSpeed_Scalings AS target
JOIN GameSpeed_Scalings AS source ON source.ScalingType = target.ScalingType AND source.GameSpeedType = 'GAMESPEED_MARATHON'
JOIN GameSpeed_Durations AS duration ON duration.GameSpeedScalingType = source.GameSpeedScalingType
WHERE target.GameSpeedType = 'GAMESPEED_STANDARD' OR target.GameSpeedType LIKE 'GAMESPEED_ANTHRO_REALISTIC_X%';
