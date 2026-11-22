"""Exercise expansion files against the locally installed native game schema and data."""
import json
import hashlib
import re
from pathlib import Path
import sqlite3
import sys
import zlib
import xml.etree.ElementTree as ET
from PIL import Image

root = Path(__file__).resolve().parents[1]
mod = root / "anthroprocenia"
base = Path(sys.argv[1])
content = json.loads((root / "tools/civilizations.json").read_text(encoding="utf-8"))
kits = json.loads((root / "tools/civilization-kits.json").read_text(encoding="utf-8"))
for era in ["antiquity", "exploration", "modern"]:
    content.extend(json.loads((root / f"tools/civilizations-{era}-additions.json").read_text(encoding="utf-8")))
    kits.update(json.loads((root / f"tools/civilization-kits-{era}-additions.json").read_text(encoding="utf-8")))
active_age = sys.argv[2] if len(sys.argv) > 2 else "antiquity"
roots = {"antiquity": "NODE_CIVIC_AQ_MAIN_CHIEFDOM", "exploration": "NODE_CIVIC_EX_MAIN_PIETY",
         "modern": "NODE_CIVIC_MO_MAIN_MODERNIZATION"}
manifest = ET.parse(mod / "anthroprocenia.modinfo").getroot()
ns = {"m": "ModInfo"}


def action_files(scope, action, criteria):
    groups = manifest.findall("m:ActionGroups/m:ActionGroup", ns)
    return [mod / item.text for group in groups
            if group.attrib["scope"] == scope and group.attrib["criteria"] in criteria
            for item in group.findall(f"m:Actions/m:{action}/m:Item", ns)
            if item.text in {
                "config/Civilizations.xml", "data/civilizations.sql", *[
                    f"data/civilizations-{era}.sql" for era in roots],
                "data/civilization-icons.xml", "data/civilization-visual-remaps.xml", "text/en_us/Civilizations.xml",
                "data/starter-content.xml", "data/land-privateers-common.xml",
                *[f"data/land-privateers-{era}.xml" for era in roots],
                "data/early-content-icons.xml", "data/early-content-remaps.xml", "text/en_us/EarlyContent.xml",
                "data/immediate-peace.sql",
            }]


def load_xml(db, path, strict=False):
    document = ET.parse(path).getroot()
    if document.tag != "Database":
        return
    for table in document:
        column_types = {r[1]: r[2] for r in db.execute(f'PRAGMA table_info("{table.tag}")')}
        columns = set(column_types)
        canonical_columns = {column.casefold(): column for column in columns}
        if strict and not columns:
            raise AssertionError(f"Unknown mod table: {table.tag} in {path}")
        if not columns:
            continue
        for item in table:
            if item.tag not in ["Row", "InsertOrIgnore"]:
                continue
            attributes = {canonical_columns.get(name.casefold(), name): value
                          for name, value in {**item.attrib, **{child.tag: child.text for child in item}}.items()}
            if strict and set(attributes) - columns:
                raise AssertionError(f"Unknown mod columns: {set(attributes) - columns} in {table.tag}")
            values = {k: (1 if v.lower() == "true" else 0)
                      if column_types[k].upper() == "BOOLEAN" and v.lower() in ["true", "false"] else v
                      for k, v in attributes.items() if k in columns}
            if not values:
                continue
            operation = "INSERT" if strict else "INSERT OR IGNORE"
            db.execute(f'{operation} INTO "{table.tag}" ({",".join(values)}) VALUES ({",".join("?" for _ in values)})', list(values.values()))


game = sqlite3.connect(":memory:")
game.row_factory = sqlite3.Row
game.create_function("Make_Hash", 1, lambda value: zlib.crc32(str(value).upper().encode()))
game.executescript((base / "Assets/schema/gameplay/01_GameplaySchema.sql").read_text(encoding="utf-8-sig"))
for module in ["base-standard", "age-" + active_age]:
    for path in sorted((base / "modules" / module / "data").glob("*.xml")):
        load_xml(game, path)
original_privateers = [tuple(row) for row in game.execute("SELECT * FROM Units WHERE UnitType LIKE 'UNIT_PRIVATEER%'")]
for path in action_files("game", "UpdateDatabase", {"always", active_age}):
    if path.suffix == ".xml":
        load_xml(game, path, strict=True)
    else:
        game.executescript(path.read_text(encoding="utf-8"))

shell = sqlite3.connect(":memory:")
shell.row_factory = sqlite3.Row
for schema in ["schema-frontend-10-setup-parameters.sql", "schema-frontend-50-setup-data.sql"]:
    shell.executescript((base / "Assets/schema/frontend" / schema).read_text(encoding="utf-8-sig"))
shell.executescript((base / "modules/core/config/config-schema.sql").read_text(encoding="utf-8-sig"))
for module in ["base-standard", *["age-" + era for era in roots]]:
    for path in sorted((base / "modules" / module / "config").glob("*.xml")):
        load_xml(shell, path)
original_recommendations = set(map(tuple, shell.execute("SELECT * FROM LeaderCivilizationBias")))
shell.commit()
shell.execute("PRAGMA foreign_keys=ON")
for path in action_files("shell", "UpdateDatabase", {"always"}):
    load_xml(shell, path, strict=True)
localized = {}
art, remaps = [], []
for scope in ["shell", "game"]:
    localized[scope] = {item.attrib["Tag"]
                        for path in action_files(scope, "UpdateText", {"always"})
                        for item in ET.parse(path).getroot().findall("EnglishText/Row")}
    scope_art = [item.attrib for path in action_files(scope, "UpdateIcons", {"always"})
                 for item in ET.parse(path).getroot().findall("IconDefinitions/Row")]
    scope_remaps = [item.attrib for path in action_files(scope, "UpdateVisualRemaps", {"always"})
                    for item in ET.parse(path).getroot().findall("VisualRemaps/Row")]
    assert scope_art and scope_remaps, f"Missing {scope} art registration"
    art.extend(scope_art)
    remaps.extend(scope_remaps)
native_icons = []
for module in ["base-standard", *["age-" + era for era in roots]]:
    for path in sorted((base / "modules" / module / "data/icons").glob("*.xml")):
        native_icons.extend({**item.attrib, **{child.tag: child.text for child in item}}
                            for item in ET.parse(path).getroot().findall("IconDefinitions/Row"))
native_paths = {item.get("Path") for item in native_icons}
native_effects, native_requirements = {}, {}
for module in ["base-standard", *["age-" + era for era in roots]]:
    for path in (base / "modules" / module / "data").glob("*gameeffects*.xml"):
        for element in ET.parse(path).getroot().iter():
            tag = element.tag.rsplit("}", 1)[-1]
            if tag in ["Modifier", "Requirement"]:
                definition = element.get("effect" if tag == "Modifier" else "type")
                if definition:
                    target = native_effects if tag == "Modifier" else native_requirements
                    target.setdefault(definition, set()).update(child.get("name") for child in element
                                                               if child.tag.rsplit("}", 1)[-1] == "Argument")
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def one(db, query, *args):
    result = db.execute(query, args).fetchone()
    check(result is not None, f"Missing row: {query} {args}")
    return result


translations = {item.attrib["Tag"]: item.findtext("Text", "")
                for file in ["Civilizations.xml", "EarlyContent.xml"]
                for item in ET.parse(mod / "text/en_us" / file).getroot().findall("EnglishText/Row")}
check(one(game, "SELECT Value FROM GlobalParameters WHERE Name = 'DIPLOMACY_WAR_MIN_TURNS'")[0] == "0",
      "Immediate peace must load in every native Age database")
localization = sqlite3.connect(":memory:")
localization.executescript((base / "Assets/schema/localization/schema-loc-10.sql").read_text(encoding="utf-8-sig"))
advice_tags = {
    "LOC_ADVICE_ANTIQUITY_MILITARY_DECLARING_WAR_MESSAGE",
    "LOC_ADVICE_EXPLORATION_MILITARY_PEACE_DEALS_MESSAGE",
}
for row in ET.parse(base / "modules/base-standard/text/en_us/AdvisorText.xml").getroot().findall("EnglishText/Row"):
    if row.get("Tag") in advice_tags:
        localization.execute("INSERT INTO EnglishText(Tag,Text) VALUES (?,?)", (row.get("Tag"), row.findtext("Text")))
localization.executescript((mod / "text/en_us/ImmediatePeace.sql").read_text(encoding="utf-8"))
war_advice = one(localization, "SELECT Text FROM EnglishText WHERE Tag = ?", "LOC_ADVICE_ANTIQUITY_MILITARY_DECLARING_WAR_MESSAGE")[0]
peace_advice = one(localization, "SELECT Text FROM EnglishText WHERE Tag = ?", "LOC_ADVICE_EXPLORATION_MILITARY_PEACE_DEALS_MESSAGE")[0]
check("Propose Peace immediately" in war_advice and "minimum of 10 turns" not in war_advice
      and "war will not end until an agreement is made" in war_advice,
      "Native war advice must explain immediate negotiations without removing consent")
check("as soon as War begins" in peace_advice and "after ten turns" not in peace_advice
      and "accept or reject" in peace_advice,
      "Native peace advice must preserve acceptance and settlement trade explanations")
localization.close()
starters = {
    "PASTURAL_ENCLOSURE": {"YIELD_FOOD": 1, "YIELD_PRODUCTION": 1},
    "FIRE_PIT": {"YIELD_FOOD": 1, "YIELD_HAPPINESS": 1},
    "TOOLMAKERS_HUT": {"YIELD_PRODUCTION": 2},
    "BARTER_POST": {"YIELD_GOLD": 2},
    "STORY_CIRCLE": {"YIELD_CULTURE": 1, "YIELD_HAPPINESS": 1},
}
starter_units = {"LATCHED_REED_OARBOAT": "GALLEY", "CLUBMAN": "WARRIOR", "STONE_THROWER": "SLINGER"}
for key, yields in starters.items():
    target = "BUILDING_ANTHRO_" + key
    building = game.execute("SELECT * FROM Constructibles WHERE ConstructibleType=?", (target,)).fetchone()
    if active_age != "antiquity":
        check(building is None, target + ": only added to Antiquity")
        continue
    check(building is not None, target + ": available in Antiquity")
    check(not building["RequiresUnlock"] and building["Age"] == "AGE_ANTIQUITY",
          target + ": no technology or civic gate")
    check(not any(building[field] for field in ["AdjacentDistrict", "AdjacentLake", "AdjacentRiver", "AdjacentTerrain",
                                               "RequiresAppealPlacement", "RequiresDistantLands", "RequiresHomeland",
                                               "ExistingDistrictOnly", "IslandSettlement", "NoFeature", "NoRiver"]),
          target + ": no extra placement prerequisites")
    check(dict(game.execute("SELECT YieldType,YieldChange FROM Constructible_YieldChanges WHERE ConstructibleType=?",
                            (target,))) == yields, target + ": exact base yields")
    check(one(game, "SELECT * FROM Buildings WHERE ConstructibleType=?", target)["TraitType"] is None,
          target + ": not civilization restricted")
    check({row[0] for row in game.execute("SELECT DistrictType FROM Constructible_ValidDistricts WHERE ConstructibleType=?",
                                        (target,))} == {"DISTRICT_CITY_CENTER", "DISTRICT_URBAN"},
          target + ": valid normal urban placement")
    check(not game.execute("SELECT 1 FROM ProgressionTreeNodeUnlocks WHERE TargetType=?", (target,)).fetchone(),
          target + ": no hidden progression gate")
for key, donor_key in starter_units.items():
    target, donor = "UNIT_ANTHRO_" + key, "UNIT_" + donor_key
    unit = game.execute("SELECT * FROM Units WHERE UnitType=?", (target,)).fetchone()
    if active_age != "antiquity":
        check(unit is None, target + ": only added to Antiquity")
        continue
    check(unit is not None and unit["CanTrain"] and unit["CanPurchase"] and not unit["MustPurchase"],
          target + ": buildable starter")
    check(unit["TraitType"] is None and unit["StrategicResource"] is None and not unit["PrereqPopulation"],
          target + ": no civilization, resource or population unlock")
    check(not game.execute("SELECT 1 FROM ProgressionTreeNodeUnlocks WHERE TargetType=?", (target,)).fetchone()
          and not game.execute("SELECT 1 FROM Unit_RequiredConstructibles WHERE UnitType=?", (target,)).fetchone(),
          target + ": no technology, civic or building gate")
    stats = one(game, "SELECT * FROM Unit_Stats WHERE UnitType=?", target)
    native = one(game, "SELECT * FROM Unit_Stats WHERE UnitType=?", donor)
    check(all(stats[field] < native[field] for field in ["Combat", "RangedCombat", "Bombard"] if native[field] > 0),
          target + ": strictly weaker than its native counterpart")
    check(unit["Domain"] == ("DOMAIN_SEA" if key == "LATCHED_REED_OARBOAT" else "DOMAIN_LAND"),
          target + ": correct domain")
    cost = one(game, "SELECT Cost FROM Unit_Costs WHERE UnitType=? AND YieldType='YIELD_PRODUCTION'", target)[0]
    check(0 < cost < one(game, "SELECT Cost FROM Unit_Costs WHERE UnitType=? AND YieldType='YIELD_PRODUCTION'", donor)[0],
          target + ": cheaper than native counterpart")
land_privateers = {
    "antiquity": ("RAIDER", "NODE_TECH_AQ_BRONZE_WORKING"),
    "exploration": ("HIGHWAYMEN", "NODE_TECH_EX_HERALDRY"),
    "modern": ("PARTISAN", "NODE_TECH_MO_INDUSTRIALIZATION"),
}
for age, (key, node) in land_privateers.items():
    target = "UNIT_ANTHRO_" + key
    unit = game.execute("SELECT * FROM Units WHERE UnitType=?", (target,)).fetchone()
    if age != active_age:
        check(unit is None, target + ": isolated to its own Age")
        continue
    check(unit is not None and unit["Domain"] == "DOMAIN_LAND"
          and unit["UnitMovementClass"] == "UNIT_MOVEMENT_CLASS_FOOT", target + ": land unit")
    check(unit["CanTrain"] and unit["CanPurchase"] and unit["MustPurchase"]
          and unit["PurchaseYield"] == "YIELD_GOLD", target + ": gold purchase only")
    if active_age == "exploration":
        corsair = one(game, "SELECT * FROM Units WHERE UnitType='UNIT_CORSAIR'")
        check(all(unit[field] == corsair[field] for field in ["CanTrain", "CanPurchase", "MustPurchase"]),
              target + ": same native purchase-only gates as Corsairs")
    check(unit["TraitType"] is None, target + ": all civilizations")
    unlock = one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=?", target)
    check(unlock["ProgressionTreeNodeType"] == node and unlock["UnlockDepth"] == 1
          and unlock["RequiredTraitType"] is None, target + ": correct common technology unlock")
    one(game, "SELECT * FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=?", node)
    one(game, "SELECT * FROM Unit_Abilities WHERE UnitType=? AND UnitAbilityType='ABILITY_ANTHRO_PIRATE'", target)
    one(game, """SELECT * FROM TypeTags t JOIN UnitClass_Abilities c ON t.Tag=c.UnitClassType
        WHERE t.Type=? AND c.UnitAbilityType='ABILITY_ANTHRO_PIRATE'""", target)
    check({row[0] for row in game.execute("SELECT Type FROM TypeTags WHERE Tag='UNIT_CLASS_ANTHRO_LAND_PRIVATEER'")}
          == {target}, target + ": ability scoped only to new land privateers")
    check(one(game, "SELECT Cost FROM Unit_Costs WHERE UnitType=? AND YieldType='YIELD_PRODUCTION'", target)[0] > 0,
          target + ": native purchase-cost scaling base")
pirate = one(game, """SELECT d.* FROM UnitAbilityModifiers a JOIN Modifiers m ON a.ModifierId=m.ModifierId
    JOIN DynamicModifiers d ON m.ModifierType=d.ModifierType WHERE a.UnitAbilityType='ABILITY_ANTHRO_PIRATE'""")
check(pirate["EffectType"] == "EFFECT_UNIT_SET_PRIVATEER" and pirate["CollectionType"] == "COLLECTION_OWNER",
      "Pirate uses the native Privateer engine effect")
check(one(game, "SELECT Value FROM ModifierArguments WHERE ModifierId='MODIFIER_ANTHRO_PIRATE' AND Name='Privateer'")[0]
      == "true", "Pirate flag enabled")
one(game, """SELECT * FROM UnitAbilityModifiers WHERE UnitAbilityType='ABILITY_ANTHRO_PIRATE'
    AND ModifierId='ENTER_FOREIGN_MOD_ADJUST_UNIT_ENTER_FOREIGN_LANDS'""")
check(original_privateers == [tuple(row) for row in game.execute("SELECT * FROM Units WHERE UnitType LIKE 'UNIT_PRIVATEER%'")],
      "native naval Privateers are unchanged")
check(translations["LOC_BUILDING_ANTHRO_PASTURAL_ENCLOSURE_NAME"] == "Pastural Enclosure"
      and translations["LOC_UNIT_ANTHRO_LATCHED_REED_OARBOAT_NAME"] == "Latched Reed Oarboat",
      "requested starter names preserved exactly")
for target in [*["BUILDING_ANTHRO_" + key for key in starters],
               *["UNIT_ANTHRO_" + key for key in starter_units],
               *["UNIT_ANTHRO_" + row[0] for row in land_privateers.values()]]:
    check("LOC_" + target + "_NAME" in localized["game"]
          and "LOC_" + target + "_DESCRIPTION" in localized["game"], target + ": localized")
    check(any(row["ID"] == target for row in art) and any(row["To"] == target for row in remaps),
          target + ": icon and native model registered")
    check(not game.execute("""SELECT 1 FROM TypeTags t LEFT JOIN Tags tags ON t.Tag=tags.Tag
        WHERE t.Type=? AND tags.Tag IS NULL""", (target,)).fetchone(), target + ": all class/yield tags exist")
for civ in content:
    key = civ["key"]
    era = civ.get("age", "ANTIQUITY").lower()
    kit = kits[key]
    civ_id, trait, tree = "CIVILIZATION_ANTHRO_" + key, "TRAIT_ANTHRO_" + key, "TREE_ANTHRO_" + key
    selected = one(shell, "SELECT * FROM Civilizations WHERE CivilizationType=?", civ_id)
    check(selected["Domain"] == era.title() + "AgeCivilizations", civ_id + ": selectable Age domain")
    check(translations[selected["CivilizationName"]] == civ["name"]
          and not re.match(r"the\s", translations[selected["CivilizationName"]], re.I),
          civ_id + ": selection names consistently omit a leading article")
    check(translations[selected["CivilizationIntroText"]] == civ["intro"]
          and re.sub(r"\[icon:[^\]]+\] ", "", translations[selected["CivilizationDescription"]]) == civ["overview"],
          civ_id + ": selection uses the authored narrative, not generic fallback prose")
    recommendations = list(shell.execute("SELECT * FROM LeaderCivilizationBias WHERE CivilizationType=?", (civ_id,)))
    check(len(recommendations) >= 2, civ_id + ": multiple existing leader recommendations")
    for recommendation in recommendations:
        check(recommendation["CivilizationDomain"] == selected["Domain"], civ_id + ": recommendation in correct Age")
        check(recommendation["Bias"] >= 2, civ_id + ": native recommended/highlight threshold")
        check(recommendation["ReasonType"] in localized["shell"], civ_id + ": localized recommendation reason")
        check(recommendation["ChoiceType"] in {
            "LOC_CREATE_GAME_HISTORICAL_CHOICE", "LOC_CREATE_GAME_GEOGRAPHIC_CHOICE",
            "LOC_CREATE_GAME_STRATEGIC_CHOICE"}, civ_id + ": native recommendation category")
        one(game, "SELECT * FROM Leaders WHERE LeaderType=? AND IsMajorLeader=1", recommendation["LeaderType"])
        one(game, "SELECT * FROM LeaderCivPriorities WHERE Civilization=? AND Leader=?", civ_id, recommendation["LeaderType"])
    if era != "antiquity":
        one(game, "SELECT * FROM UnlockRewards WHERE UnlockRewardType=? AND UnlockRewardKind='KIND_CIVILIZATION'", civ_id)
        one(game, "SELECT * FROM UnlockConfigurationValues WHERE ConfigurationValue=?", civ_id)
        one(game, "SELECT * FROM UnlockRequirements WHERE UnlockType=?", "UNLOCK_" + civ_id)
    for field in ["CivilizationName", "CivilizationFullName", "CivilizationDescription", "CivilizationIntroText"]:
        check(selected[field] in localized["shell"], civ_id + ": localized shell " + field)
    definition = one(game, "SELECT * FROM Civilizations WHERE CivilizationType=?", civ_id)
    for field in ["Name", "FullName", "Description", "Adjective", "CapitalName"]:
        check(definition[field] in localized["game"], civ_id + ": localized gameplay " + field)
    check(definition["StartingCivilizationLevelType"] == "CIVILIZATION_LEVEL_FULL_CIV", civ_id + ": major civilization")
    check(definition["UniqueCultureProgressionTree"] == tree, civ_id + ": unique civic tree")
    check(game.execute("SELECT COUNT(*) FROM CityNames WHERE CivilizationType=?", (civ_id,)).fetchone()[0] == len(civ["cities"]), civ_id + ": city names")
    for table in ["VisArt_CivilizationUnitCultures", "VisArt_CivilizationBuildingCultures", "LoadingInfo_Civilizations"]:
        one(game, f"SELECT * FROM {table} WHERE CivilizationType=?", civ_id)
    loading = one(game, "SELECT * FROM LoadingInfo_Civilizations WHERE CivilizationType=?", civ_id)
    check(translations[loading["CivilizationText"]] == civ["intro"],
          civ_id + ": loading and selection share the authored introduction")
    scene = f"fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_{key.lower()}.png"
    check(all(loading[field] == scene for field in ["BackgroundImageHigh", "BackgroundImageLow"]), civ_id + ": original loading art")
    check(loading["ForegroundImage"] is None, civ_id + ": no unrelated donor foreground")
    emblem = {r["Path"] for r in art if r["ID"] == civ_id and not r.get("Context")}
    check(len(emblem) == 1 and next(iter(emblem)).endswith(f"/civilizations/{key.lower()}.png"),
          civ_id + ": default emblem is distinct from scene art")
    for context in ["BACKGROUND", "BACKGROUND_VERT"]:
        expected = {(r.get("IconSize"), scene) for r in native_icons
                    if r["ID"] == "CIVILIZATION_" + civ["donor"] and r.get("Context") == context}
        actual = {(r.get("IconSize"), r["Path"]) for r in art
                  if r["ID"] == civ_id and r.get("Context") == context}
        check(bool(expected) and actual == expected, civ_id + ": original " + context + " art")
    check(loading["Audio"] is None, civ_id + ": no incorrect donor narration")
    one(game, "SELECT * FROM TraitModifiers WHERE TraitType=?", trait + "_ABILITY")
    if era == active_age:
        reveal = one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=?", "MOD_ANTHRO_" + key + "_REVEAL_TREE")
        check(reveal["ProgressionTreeNodeType"] == roots[era] and reveal["RequiredTraitType"] == trait, civ_id + ": reveal tree at Age root only for owner")
    else:
        check(not game.execute("SELECT 1 FROM ProgressionTreeNodeUnlocks WHERE TargetType=?",
                               ("MOD_ANTHRO_" + key + "_REVEAL_TREE",)).fetchone(), civ_id + ": inactive Age root remains unloaded")
    civ_history = one(game, "SELECT * FROM CivilopediaPageChapterParagraphs WHERE PageID=? AND SectionID='CIVILIZATIONS' AND ChapterID='HISTORY'", civ_id)
    check(civ_history["Paragraph"] in localized["game"], civ_id + ": localized Civilopedia history")
    if "elementHistory" in kit:
        pages = [(f"BUILDING_ANTHRO_{key}_{n}", "BUILDINGS") for n in [1, 2]]
        pages += [(f"QUARTER_ANTHRO_{key}", "BUILDINGS"), (f"IMPROVEMENT_ANTHRO_{key}", "IMPROVEMENTS")]
        pages += [(f"NODE_ANTHRO_{key}_{n}", "CULTURE") for n in range(1, 7)]
        for page, section in pages:
            paragraph = one(game, "SELECT * FROM CivilopediaPageChapterParagraphs WHERE PageID=? AND SectionID=? AND ChapterID='HISTORY'", page, section)
            check(paragraph["Paragraph"] in localized["game"], page + ": reachable localized history")
    for number, (_, prerequisites, _) in enumerate(kit["civics"], 1):
        node = f"NODE_ANTHRO_{key}_{number}"
        one(game, "SELECT * FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=? AND ProgressionTree=?", node, tree)
        one(game, "SELECT * FROM ProgressionTreeNodeTraits WHERE ProgressionTreeNodeType=? AND RequiredTraitType=?", node, trait)
        one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=? AND TargetKind='KIND_MODIFIER' AND RequiredTraitType=?", node, trait)
        actual_prerequisites = {row[0] for row in game.execute("SELECT PrereqNode FROM ProgressionTreePrereqs WHERE Node=?", (node,))}
        check(actual_prerequisites == {f"NODE_ANTHRO_{key}_{i}" for i in prerequisites}, node + ": branching prerequisites")
        for prerequisite in prerequisites:
            check(prerequisite < number, node + ": acyclic progression")
        if number in [2, 3, 6]:
            one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=? AND UnlockDepth=2", node)
        if number < 3:
            building = f"BUILDING_ANTHRO_{key}_{number}"
            one(game, "SELECT * FROM Buildings WHERE ConstructibleType=? AND TraitType=?", building, trait)
            one(game, "SELECT * FROM Constructible_YieldChanges WHERE ConstructibleType=?", building)
            one(game, "SELECT * FROM TypeTags WHERE Type=? AND Tag='AGELESS'", building)
            one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=? AND ProgressionTreeNodeType=?", building, node)
            check(any(r["To"] == building and r["Kind"] == "BUILDING" for r in remaps), building + ": native building model")
            one(game, "SELECT * FROM ConstructibleModifiers WHERE ConstructibleType=?", building)
    check(len(kit["civics"]) == 6 and len(kit["civics"][-1][1]) == 2, civ_id + ": six-civic branching tree and converging capstone")
    for number, (_, civic_number, _) in enumerate(kit["traditions"], 1):
        tradition = f"TRADITION_ANTHRO_{key}_{number}"
        one(shell, "SELECT * FROM Traditions WHERE TraditionType=?", tradition)
        one(game, "SELECT * FROM TraditionModifiers WHERE TraditionType=?", tradition)
        one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=? AND ProgressionTreeNodeType=?",
            tradition, f"NODE_ANTHRO_{key}_{civic_number}")
    quarter = one(game, "SELECT * FROM UniqueQuarters WHERE UniqueQuarterType=?", "QUARTER_ANTHRO_" + key)
    quarter_mods = list(game.execute("SELECT ModifierId FROM UniqueQuarterModifiers WHERE UniqueQuarterType=?", (quarter["UniqueQuarterType"],)))
    check(len(quarter_mods) == len(kit["quarter"]), civ_id + ": quarter AI evaluation matches effects")
    for quarter_mod in quarter_mods:
        one(game, "SELECT * FROM TraitModifiers WHERE TraitType=? AND ModifierId=?", trait, quarter_mod[0])
        one(game, """SELECT d.* FROM Modifiers m JOIN DynamicModifiers d ON m.ModifierType=d.ModifierType
            WHERE m.ModifierId=? AND d.CollectionType='COLLECTION_PLAYER_CITIES'""", quarter_mod[0])
        one(game, """SELECT r.* FROM Modifiers m JOIN RequirementSetRequirements s ON m.SubjectRequirementSetId=s.RequirementSetId
            JOIN Requirements r ON s.RequirementId=r.RequirementId JOIN RequirementArguments a ON r.RequirementId=a.RequirementId
            WHERE m.ModifierId=? AND r.RequirementType='REQUIREMENT_CITY_HAS_UNIQUE_QUARTER' AND a.Name='UniqueQuarterType' AND a.Value=?""",
            quarter_mod[0], quarter["UniqueQuarterType"])
        nested = game.execute("SELECT Value FROM ModifierArguments WHERE ModifierId=? AND Name='ModifierId'", (quarter_mod[0],)).fetchone()
        if nested:
            one(game, """SELECT d.* FROM Modifiers m JOIN DynamicModifiers d ON m.ModifierType=d.ModifierType
                WHERE m.ModifierId=? AND d.CollectionType='COLLECTION_CITY_PLOT_YIELDS' AND d.EffectType='EFFECT_PLOT_ADJUST_YIELD'""", nested[0])
    improvement = "IMPROVEMENT_ANTHRO_" + key
    one(game, "SELECT * FROM Improvements WHERE ConstructibleType=? AND TraitType=? AND OnePerSettlement=1 AND CityBuildable=1", improvement, trait)
    one(game, "SELECT * FROM Constructible_ValidDistricts WHERE ConstructibleType=? AND DistrictType='DISTRICT_RURAL'", improvement)
    one(game, "SELECT * FROM ConstructibleModifiers WHERE ConstructibleType=?", improvement)
    one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=? AND RequiredTraitType=?", improvement, trait)
    if era != active_age:
        continue
    recon = "EXPLORER" if era == "modern" else "SCOUT"
    for number, donor in enumerate(civ["donors"] + [recon], 1):
        unit = f"UNIT_ANTHRO_{key}_{number}"
        unit_row = one(game, "SELECT * FROM Units WHERE UnitType=?", unit)
        check(unit_row["TraitType"] == trait, unit + ": exclusive civilization trait")
        one(game, "SELECT * FROM UnitReplaces WHERE CivUniqueUnitType=? AND ReplacesUnitType=?", unit, "UNIT_" + donor)
        one(game, "SELECT * FROM Unit_Costs WHERE UnitType=? AND Cost>0", unit)
        one(game, "SELECT * FROM TypeTags WHERE Type=?", unit)
        tag_donor = (civ.get("models", civ["donors"])[number - 1]
                     if civ.get("mounted") and donor != recon else donor)
        for tag in game.execute("SELECT Tag FROM TypeTags WHERE Type=?", ("UNIT_" + tag_donor,)):
            one(game, "SELECT * FROM TypeTags WHERE Type=? AND Tag=?", unit, tag[0])
        native = one(game, "SELECT * FROM Units WHERE UnitType=?", "UNIT_" + donor)
        if donor == recon:
            check(unit_row["BaseMoves"] == native["BaseMoves"] + 1, unit + ": unique scout movement")
        else:
            stats = one(game, "SELECT * FROM Unit_Stats WHERE UnitType=?", unit)
            original = one(game, "SELECT * FROM Unit_Stats WHERE UnitType=?", "UNIT_" + donor)
            check(stats["Combat"] == original["Combat"] + 1, unit + ": base bonus complements situational ability")
            if number > 1:
                one(game, "SELECT * FROM UnitUpgrades WHERE Unit=? AND UpgradeUnit=?", f"UNIT_ANTHRO_{key}_{number-1}", unit)
            for unlock in game.execute("SELECT * FROM ProgressionTreeNodeUnlocks WHERE TargetType=? AND RequiredTraitType IS NULL", ("UNIT_" + donor,)):
                one(game, "SELECT * FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=? AND TargetType=? AND RequiredTraitType=?",
                    unlock["ProgressionTreeNodeType"], unit, trait)
        check(any(r["To"] == unit and r["Kind"] == "UNIT" for r in remaps), unit + ": native unit model")
        check(any(r["ID"] == unit for r in art), unit + ": unit icon")
        one(game, "SELECT * FROM Unit_Abilities WHERE UnitType=? AND UnitAbilityType=?", unit, "ABILITY_" + unit)
        unit_class = "UNIT_CLASS_" + unit.removeprefix("UNIT_")
        one(game, "SELECT * FROM UnitClass_Abilities WHERE UnitClassType=? AND UnitAbilityType=?",
            unit_class, "ABILITY_" + unit)
        check([r[0] for r in game.execute("SELECT Type FROM TypeTags WHERE Tag=?", (unit_class,))] == [unit],
              unit + ": ability class excludes every other unit")
        one(game, "SELECT * FROM UnitAbilityModifiers WHERE UnitAbilityType=?", "ABILITY_" + unit)
        for ability in game.execute("SELECT UnitAbilityType FROM Unit_Abilities WHERE UnitType=?", ("UNIT_" + donor,)):
            one(game, "SELECT * FROM Unit_Abilities WHERE UnitType=? AND UnitAbilityType=?", unit, ability[0])

for dynamic in game.execute("SELECT * FROM DynamicModifiers WHERE ModifierType LIKE '%ANTHRO%'"):
    one(game, "SELECT * FROM Types WHERE Type=? AND Kind='KIND_MODIFIER'", dynamic["ModifierType"])
    check(dynamic["EffectType"] in native_effects, dynamic["EffectType"] + ": supported native effect")
    for argument in game.execute("""SELECT a.Name FROM ModifierArguments a JOIN Modifiers m ON a.ModifierId=m.ModifierId
            WHERE m.ModifierType=?""", (dynamic["ModifierType"],)):
        check(argument[0] in native_effects[dynamic["EffectType"]], dynamic["EffectType"] + ": native argument " + argument[0])
for requirement in game.execute("SELECT * FROM Requirements WHERE RequirementId LIKE '%ANTHRO%'"):
    check(requirement["RequirementType"] in native_requirements, requirement["RequirementType"] + ": native requirement")
    for argument in game.execute("SELECT Name FROM RequirementArguments WHERE RequirementId=?", (requirement["RequirementId"],)):
        check(argument[0] in native_requirements[requirement["RequirementType"]], requirement["RequirementType"] + ": native argument " + argument[0])
for argument in game.execute("SELECT Value FROM ModifierArguments WHERE ModifierId LIKE '%ANTHRO%' AND Name='Domain'"):
    one(game, "SELECT * FROM Units WHERE Domain=? AND UnitType NOT LIKE '%ANTHRO%' LIMIT 1", argument[0])
for ability in game.execute("SELECT UnitAbilityType FROM UnitAbilities WHERE UnitAbilityType LIKE 'ABILITY_UNIT_ANTHRO_%'"):
    one(game, "SELECT * FROM UnitClass_Abilities WHERE UnitAbilityType=?", ability[0])

images = list((mod / "art/civilizations").rglob("*.png"))
check(original_recommendations.issubset(set(map(tuple, shell.execute("SELECT * FROM LeaderCivilizationBias")))),
      "official leader recommendations are preserved")
for civ_id, leader in [("FRANKS", "CHARLEMAGNE"), ("PAPAL_STATES", "MACHIAVELLI")]:
    one(shell, """SELECT * FROM LeaderCivilizationBias WHERE CivilizationType=? AND LeaderType=?
        AND Bias>2 AND ChoiceType='LOC_CREATE_GAME_HISTORICAL_CHOICE'""",
        "CIVILIZATION_ANTHRO_" + civ_id, "LEADER_" + leader)
history_pages = {}
for section in ["CIVILIZATIONS", "CULTURE", "BUILDINGS", "IMPROVEMENTS", "UNITS"]:
    history_pages[section] = {
        row["PageID"] for query in game.execute("SELECT SQL FROM CivilopediaPageQueries WHERE SectionID=?", (section,))
        for row in game.execute(query[0])
    }
for paragraph in game.execute("SELECT * FROM CivilopediaPageChapterParagraphs WHERE PageID LIKE '%ANTHRO%'"):
    if paragraph["SectionID"] == "UNITS" and not game.execute("SELECT 1 FROM Units WHERE UnitType=?", (paragraph["PageID"],)).fetchone():
        continue
    check(paragraph["PageID"] in history_pages[paragraph["SectionID"]],
          paragraph["PageID"] + ": History attaches to a native-discovered page")
for key, value in translations.items():
    if re.match(r"LOC_(BUILDING|IMPROVEMENT|QUARTER|UNIT)_ANTHRO_.*_DESCRIPTION$", key):
        check("[icon:" in value, key + ": icon-rich mechanical description")
check(len({image.name.casefold() for image in images}) == len(images),
      "original image basenames are unique across scene, emblem and item folders")
element_silhouettes = set()
for file in [*(mod / "art/civilizations").glob("*.png"),
             *(mod / "art/civilizations/icons").glob("*.png")]:
    image = Image.open(file).convert("RGBA")
    pixels = list(image.getdata())
    check(all(pixel[:3] == (255, 255, 255) for pixel in pixels if pixel[3]),
          file.name + ": white recolorable artwork")
    check(image.getpixel((0, 0))[3] == 0 and sum(pixel[3] > 128 for pixel in pixels) > 40,
          file.name + ": transparent background and visible artwork")
    silhouette = hashlib.sha256(image.getchannel("A").tobytes()).digest()
    check(silhouette not in element_silhouettes, file.name + ": individually drawn silhouette")
    element_silhouettes.add(silhouette)
for icon in art:
    path = icon["Path"]
    if path.startswith("fs://game/anthroprocenia_map_history/"):
        file = mod / path.removeprefix("fs://game/anthroprocenia_map_history/")
        check(file.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"), str(file) + ": valid original PNG")
        for scope in ["shell", "game"]:
            imports = {item.text for group in manifest.findall("m:ActionGroups/m:ActionGroup", ns)
                       if group.attrib["scope"] == scope for item in group.findall("m:Actions/m:ImportFiles/m:Item", ns)}
            check(file.relative_to(mod).as_posix() in imports, str(file) + ": imported in " + scope)
    else:
        check(path in native_paths, path + ": native icon asset exists")
for row in ET.parse(mod / "config/Civilizations.xml").getroot().findall("CivilizationItems/Row"):
    check(row.attrib["Name"] in localized["shell"] and row.attrib["Description"] in localized["shell"], "all selection item text resolves")
print(f"{checks} native-schema checks passed: all {len(content)} selectable civs; isolated {active_age} kits, civic gates, model and icon references.")
