UPDATE Parameters SET DefaultValue = 'AGE_COUNTDOWN_LENGTH_NONE' WHERE ParameterID = 'AgeCountdownTimer';
UPDATE Parameters SET DefaultValue = 'AGE_LENGTH_LONG' WHERE ParameterID = 'AgeLength';
UPDATE Parameters SET DefaultValue = 'REALISM_SETTING_HEAVY' WHERE ParameterID = 'DisasterIntensity';
UPDATE Parameters SET DefaultValue = 0 WHERE ParameterID IN ('EnableScoreVictory', 'NoCivUnlocks');
UPDATE Parameters SET DefaultValue = 'AGE_ANTIQUITY' WHERE ParameterID = 'Age';
UPDATE Parameters SET DefaultValue = 'GAME_START_CIV_SELECTION_MODE_APEX' WHERE ParameterID = 'GameStartCivSelectionMode';
UPDATE Parameters SET DefaultValue = 'AGE_TRANSITION_CIV_SELECTION_MODE_SWITCHING' WHERE ParameterID = 'AgeTransitionCivSelectionMode';
UPDATE Parameters SET DefaultValue = 'LEADER_ASSOCIATED_CIV_SELECTION_MODE_HISTORICAL' WHERE ParameterID = 'LeaderAssociatedCivSelectionMode';
UPDATE Parameters SET DefaultValue = 'YNAMP_NW_PLACEMENT_REAL_ONLY' WHERE ParameterID = 'NWPlacementMode';

UPDATE Parameters SET DefaultValue = '{ged-ynamp}maps/giant-earth-map/giant-earth-map.js'
WHERE ParameterID = 'Map' AND EXISTS (
    SELECT 1 FROM Maps WHERE File = '{ged-ynamp}maps/giant-earth-map/giant-earth-map.js'
      AND Domain = Parameters.Domain
);

UPDATE MapSizes SET DefaultPlayers = 63, MaxPlayers = MAX(MaxPlayers, 63)
WHERE MapSizeType IN ('MAPSIZE_GIANT', 'MAPSIZE_GIANT_EARTH', 'MAPSIZE_LUDICROUS', 'MAPSIZE_ANTHRO_COLOSSAL');

-- Giant is supplied by map mods such as YnAMP, not the base game.
UPDATE Parameters SET DefaultValue = 'MAPSIZE_GIANT'
WHERE ParameterID = 'MapSize' AND EXISTS (
    SELECT 1 FROM MapSizes WHERE MapSizeType = 'MAPSIZE_GIANT' AND Domain = Parameters.Domain
);
