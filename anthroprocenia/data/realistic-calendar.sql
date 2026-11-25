INSERT OR REPLACE INTO GlobalParameters (Name, Value) VALUES ('ANTHRO_REALISTIC_CALENDAR', '1');
CREATE TEMP VIEW AnthroCalendarPace AS
SELECT calendar.*, CAST(speed.Value AS INTEGER) AS Factor
FROM AnthroCalendar AS calendar CROSS JOIN GlobalParameters AS speed
WHERE speed.Name = 'ANTHRO_REALISTIC_SPEED_FACTOR';
UPDATE GameSpeeds SET Name = 'LOC_ANTHRO_REALISTIC_SPEED', Description = 'LOC_ANTHRO_REALISTIC_SPEED_HELP'
WHERE GameSpeedType = 'GAMESPEED_STANDARD';

DELETE FROM GameSpeed_Turns WHERE GameSpeedType = 'GAMESPEED_STANDARD' AND Age = (SELECT Age FROM AnthroCalendar);
INSERT INTO GameSpeed_Turns (Age, GameSpeedType, MonthIncrement, TurnsPerIncrement)
SELECT Age, 'GAMESPEED_STANDARD', Months, Turns FROM AnthroCalendar;
DELETE FROM GameSpeed_Turns WHERE GameSpeedType LIKE 'GAMESPEED_ANTHRO_REALISTIC_X%' AND Age = (SELECT Age FROM AnthroCalendar);
INSERT INTO GameSpeed_Turns (Age, GameSpeedType, MonthIncrement, TurnsPerIncrement)
SELECT calendar.Age, speed.GameSpeedType, calendar.Months * CAST(SUBSTR(speed.GameSpeedType, LENGTH('GAMESPEED_ANTHRO_REALISTIC_X') + 1) AS INTEGER),
    (calendar.Turns + CAST(SUBSTR(speed.GameSpeedType, LENGTH('GAMESPEED_ANTHRO_REALISTIC_X') + 1) AS INTEGER) - 1) / CAST(SUBSTR(speed.GameSpeedType, LENGTH('GAMESPEED_ANTHRO_REALISTIC_X') + 1) AS INTEGER)
FROM AnthroCalendar AS calendar CROSS JOIN GameSpeeds AS speed
WHERE speed.GameSpeedType IN ('GAMESPEED_ANTHRO_REALISTIC_X2', 'GAMESPEED_ANTHRO_REALISTIC_X3',
    'GAMESPEED_ANTHRO_REALISTIC_X4', 'GAMESPEED_ANTHRO_REALISTIC_X5', 'GAMESPEED_ANTHRO_REALISTIC_X6',
    'GAMESPEED_ANTHRO_REALISTIC_X10', 'GAMESPEED_ANTHRO_REALISTIC_X20');

UPDATE AgeProgressions
SET MaxPoints_Abbreviated = (SELECT (Turns + Factor - 1) / Factor FROM AnthroCalendarPace),
    MaxPoints_Standard = (SELECT (Turns + Factor - 1) / Factor FROM AnthroCalendarPace),
    MaxPoints_Long = (SELECT (Turns + Factor - 1) / Factor FROM AnthroCalendarPace)
WHERE AgeType = (SELECT Age FROM AnthroCalendar) AND EndsAge = 1;
UPDATE AgeProgressionTurns SET Points = CASE WHEN AgeProgressionTurnType = 'AGE_PROGRESSION_PER_TURN_BASE' THEN 1 ELSE 0 END,
    GameSpeedScaling = 0
WHERE AgeProgressionType IN (SELECT AgeProgressionType FROM AgeProgressions WHERE AgeType = (SELECT Age FROM AnthroCalendar) AND EndsAge = 1);
UPDATE AgeProgressionEvents SET Points = 0, GameSpeedScaling = 0
WHERE AgeProgressionType IN (SELECT AgeProgressionType FROM AgeProgressions WHERE AgeType = (SELECT Age FROM AnthroCalendar) AND EndsAge = 1);
UPDATE AgeProgressionEventMapSizeOverrides SET Points = 0
WHERE AgeProgressionEventType IN (SELECT AgeProgressionEventType FROM AgeProgressionEvents WHERE Points = 0 AND
    AgeProgressionType IN (SELECT AgeProgressionType FROM AgeProgressions WHERE AgeType = (SELECT Age FROM AnthroCalendar) AND EndsAge = 1));

-- Standard ages use 140 points. Cancel native Marathon's 3x research costs; other costs retain Marathon pacing.
UPDATE ProgressionTreeNodes SET Cost = (
    SELECT MIN(next.Cost) FROM ProgressionTreePrereqs AS prereq
    JOIN ProgressionTreeNodes AS next ON next.ProgressionTreeNodeType = prereq.Node
    WHERE prereq.PrereqNode = ProgressionTreeNodes.ProgressionTreeNodeType
      AND next.ProgressionTree = ProgressionTreeNodes.ProgressionTree
)
WHERE ProgressionTreeNodeType IN ('NODE_TECH_AQ_AGRICULTURE', 'NODE_CIVIC_AQ_MAIN_CHIEFDOM')
  AND EXISTS (SELECT 1 FROM ProgressionTreePrereqs AS prereq
    JOIN ProgressionTreeNodes AS next ON next.ProgressionTreeNodeType = prereq.Node
    WHERE prereq.PrereqNode = ProgressionTreeNodes.ProgressionTreeNodeType
      AND next.ProgressionTree = ProgressionTreeNodes.ProgressionTree);
UPDATE ProgressionTreeNodes SET
    Cost = MAX(1, CAST(ROUND(Cost * (SELECT Turns / (420.0 * Factor) FROM AnthroCalendarPace)) AS INTEGER)),
    RepeatableCostProgressionParam1 = CASE WHEN RepeatableCostProgressionModel = 'COST_PROGRESSION_PREVIOUS_COPIES'
      THEN CAST(ROUND(RepeatableCostProgressionParam1 * (SELECT Turns / (420.0 * Factor) FROM AnthroCalendarPace)) AS INTEGER)
      ELSE RepeatableCostProgressionParam1 END
WHERE ProgressionTree IN (SELECT ProgressionTreeType FROM ProgressionTrees WHERE SystemType IN ('SYSTEM_TECH', 'SYSTEM_CULTURE'));
UPDATE ProgressionTreeNodes SET Cost = MAX(1, CAST(ROUND(Cost / 10.0) AS INTEGER))
WHERE ProgressionTreeNodeType IN ('NODE_TECH_AQ_AGRICULTURE', 'NODE_CIVIC_AQ_MAIN_CHIEFDOM');
UPDATE ProgressionTrees SET CostProgressionParam1 = CAST(ROUND(CostProgressionParam1 * (SELECT Turns / (420.0 * Factor) FROM AnthroCalendarPace)) AS INTEGER)
WHERE SystemType IN ('SYSTEM_TECH', 'SYSTEM_CULTURE') AND CostProgressionModel = 'COST_PROGRESSION_PREVIOUS_COPIES';
-- Native compiled defaults; preserve database overrides from earlier-loaded content.
INSERT OR IGNORE INTO GlobalParameters (Name, Value) VALUES
('GOLDEN_AGE_DURATION_IN_TURNS', '6'),
('GOLDEN_AGE_HAPPINESS_CURVE_A', '1'),
('GOLDEN_AGE_HAPPINESS_CURVE_B', '140'),
('GOLDEN_AGE_HAPPINESS_CURVE_C', '70'),
('GOLDEN_AGE_HAPPINESS_CURVE_D', '35');
UPDATE GlobalParameters SET Value = MAX(1, CAST(ROUND(CAST(Value AS REAL) * (SELECT Turns / (140.0 * Factor) FROM AnthroCalendarPace)) AS INTEGER))
WHERE Name = 'GOLDEN_AGE_DURATION_IN_TURNS';
UPDATE GlobalParameters SET Value = CAST(Value AS REAL) * (SELECT Turns / (140.0 * Factor) FROM AnthroCalendarPace)
WHERE Name IN ('GOLDEN_AGE_HAPPINESS_CURVE_A', 'GOLDEN_AGE_HAPPINESS_CURVE_B', 'GOLDEN_AGE_HAPPINESS_CURVE_C', 'GOLDEN_AGE_HAPPINESS_CURVE_D');
DROP VIEW AnthroCalendarPace;
