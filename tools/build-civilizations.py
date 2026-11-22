"""Generate original civilization definitions and references to installed native art."""
import argparse
import json
import re
from pathlib import Path
import sqlite3
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "anthroprocenia"
DEFAULT_BASE = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII\Base")
CONTENT = json.loads((Path(__file__).with_name("civilizations.json")).read_text(encoding="utf-8"))
KITS = json.loads((Path(__file__).with_name("civilization-kits.json")).read_text(encoding="utf-8"))
for era in ["antiquity", "exploration", "modern"]:
    CONTENT.extend(json.loads(Path(__file__).with_name(f"civilizations-{era}-additions.json").read_text(encoding="utf-8")))
    KITS.update(json.loads(Path(__file__).with_name(f"civilization-kits-{era}-additions.json").read_text(encoding="utf-8")))

AGE_ROOTS = {
    "ANTIQUITY": "NODE_CIVIC_AQ_MAIN_CHIEFDOM",
    "EXPLORATION": "NODE_CIVIC_EX_MAIN_PIETY",
    "MODERN": "NODE_CIVIC_MO_MAIN_MODERNIZATION",
}
LEADER_MATCHES = {
    "BRITONS": [("CATHERINE", "CULTURAL"), ("CHARLEMAGNE", "MILITARISTIC")],
    "SUEBI": [("FRIEDRICH", "MILITARISTIC"), ("CHARLEMAGNE", "EXPANSIONIST")],
    "XIONGNU": [("XERXES", "EXPANSIONIST"), ("AMINA", "ECONOMIC")],
    "CARALANS": [("PACHACUTI", "GEOGRAPHIC"), ("HATSHEPSUT", "CULTURAL")],
    "WAGADU": [("AMINA", "ECONOMIC"), ("IBN_BATTUTA", "GEOGRAPHIC")],
    "JAVANESE": [("JOSE_RIZAL", "GEOGRAPHIC"), ("HATSHEPSUT", "ECONOMIC")],
    "SLAVIC": [("CATHERINE", "GEOGRAPHIC"), ("AUGUSTUS", "EXPANSIONIST")],
    "TAINO": [("PACHACUTI", "GEOGRAPHIC"), ("JOSE_RIZAL", "ECONOMIC")],
    "IBERIA": [("ISABELLA", "GEOGRAPHIC"), ("AMINA", "ECONOMIC")],
    "THRACE": [("XERXES", "GEOGRAPHIC"), ("CHARLEMAGNE", "MILITARISTIC")],
    "SCYTHIA": [("XERXES", "MILITARISTIC"), ("CATHERINE", "GEOGRAPHIC")],
    "NORDIC": [("CHARLEMAGNE", "GEOGRAPHIC"), ("HATSHEPSUT", "ECONOMIC")],
    "PICTISH": [("CHARLEMAGNE", "MILITARISTIC"), ("CATHERINE", "CULTURAL")],
    "ZIMBABWE": [("AMINA", "ECONOMIC"), ("HATSHEPSUT", "CULTURAL")],
    "BYZANTIUM": [("AUGUSTUS", "GEOGRAPHIC"), ("MACHIAVELLI", "CULTURAL")],
    "AYUTTHAYA": [("TRUNG_TRAC", "GEOGRAPHIC"), ("HATSHEPSUT", "ECONOMIC")],
    "AZTEC": [("PACHACUTI", "MILITARISTIC"), ("XERXES", "EXPANSIONIST")],
    "MOHAWK": [("HARRIET_TUBMAN", "DIPLOMATIC"), ("LAFAYETTE", "DIPLOMATIC")],
    "LAKHOTA": [("HARRIET_TUBMAN", "EXPANSIONIST"), ("PACHACUTI", "CULTURAL")],
    "NAVAJO": [("HATSHEPSUT", "ECONOMIC"), ("HARRIET_TUBMAN", "CULTURAL")],
    "FRANKS": [("CHARLEMAGNE", "HISTORICAL"), ("AUGUSTUS", "EXPANSIONIST")],
    "SELJUK": [("IBN_BATTUTA", "GEOGRAPHIC"), ("XERXES", "MILITARISTIC")],
    "RUS": [("CATHERINE", "GEOGRAPHIC"), ("AMINA", "ECONOMIC")],
    "LOMBARDS": [("CHARLEMAGNE", "GEOGRAPHIC"), ("MACHIAVELLI", "GEOGRAPHIC")],
    "TIMURIDS": [("XERXES", "MILITARISTIC"), ("BENJAMIN_FRANKLIN", "SCIENTIFIC")],
    "VENICE": [("MACHIAVELLI", "GEOGRAPHIC"), ("IBN_BATTUTA", "ECONOMIC")],
    "ALMOHADS": [("IBN_BATTUTA", "GEOGRAPHIC"), ("AMINA", "MILITARISTIC")],
    "KHWARAZMIANS": [("IBN_BATTUTA", "ECONOMIC"), ("BENJAMIN_FRANKLIN", "SCIENTIFIC")],
    "PAPAL_STATES": [("MACHIAVELLI", "HISTORICAL"), ("CHARLEMAGNE", "DIPLOMATIC")],
    "TAINO_EXPLORATION": [("JOSE_RIZAL", "ECONOMIC"), ("HARRIET_TUBMAN", "DIPLOMATIC")],
    "ASHANTI": [("AMINA", "ECONOMIC"), ("CATHERINE", "CULTURAL")],
    "WAFDIST_EGYPT": [("HATSHEPSUT", "GEOGRAPHIC"), ("LAFAYETTE", "DIPLOMATIC")],
    "SERBIA": [("LAFAYETTE", "DIPLOMATIC"), ("FRIEDRICH", "MILITARISTIC")],
    "INDONESIA": [("JOSE_RIZAL", "GEOGRAPHIC"), ("HATSHEPSUT", "ECONOMIC")],
    "PORTUGAL": [("ISABELLA", "GEOGRAPHIC"), ("IBN_BATTUTA", "ECONOMIC")],
    "HUNGARY": [("FRIEDRICH", "MILITARISTIC"), ("BENJAMIN_FRANKLIN", "SCIENTIFIC")],
    "TAHITI": [("JOSE_RIZAL", "ECONOMIC"), ("HIMIKO", "CULTURAL")],
    "GRAN_COLOMBIA": [("LAFAYETTE", "DIPLOMATIC"), ("PACHACUTI", "GEOGRAPHIC")],
    "VATICAN": [("MACHIAVELLI", "GEOGRAPHIC"), ("ASHOKA", "DIPLOMATIC")],
    "BERBER": [("IBN_BATTUTA", "GEOGRAPHIC"), ("AMINA", "ECONOMIC")],
    "SWEDEN": [("BENJAMIN_FRANKLIN", "SCIENTIFIC"), ("CATHERINE", "CULTURAL")],
    "AFGHANISTAN": [("XERXES", "GEOGRAPHIC"), ("IBN_BATTUTA", "GEOGRAPHIC")],
    "KAZAKH": [("XERXES", "MILITARISTIC"), ("AMINA", "ECONOMIC")],
    "SCOTLAND": [("BENJAMIN_FRANKLIN", "SCIENTIFIC"), ("CATHERINE", "CULTURAL")],
    "DOMINICAN": [("LAFAYETTE", "DIPLOMATIC"), ("JOSE_RIZAL", "CULTURAL")],
    "HAITI": [("HARRIET_TUBMAN", "DIPLOMATIC"), ("LAFAYETTE", "DIPLOMATIC")],
    "BRAZIL": [("BENJAMIN_FRANKLIN", "SCIENTIFIC"), ("HATSHEPSUT", "ECONOMIC")],
}


def icon_text(value):
    icons = {name.title(): "YIELD_" + name for name in
             ["FOOD", "PRODUCTION", "GOLD", "SCIENCE", "CULTURE", "HAPPINESS"]}
    icons.update({"Specialist": "SPECIALIST", "growth": "GROWTH_RATE",
                  "Trade Route": "TRADE_ROUTE", "Settlement Limit": "SETTLEMENT_LIMIT",
                  "Combat Strength": "NAR_REW_COMBAT", "Movement": "Action_Move",
                  "Sight": "Action_Showall", "healing": "Action_Heal", "Resource": "RADIAL_RESOURCES"})
    return re.sub(r"\b(" + "|".join(icons) + r")\b",
                  lambda match: f"[icon:{icons[match[0]]}] {match[0]}", value)


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, **values):
    return f'INSERT INTO "{table}" ({",".join(values)}) VALUES ({",".join(map(quote, values.values()))});'


def row(root, table, **values):
    element = root.find(table)
    if element is None:
        element = ET.SubElement(root, table)
    return ET.SubElement(element, "Row", {key: str(value) for key, value in values.items()})


def xml(root):
    ET.indent(root, space="  ")
    return '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def generate(base):
    db = sqlite3.connect(":memory:")
    db.executescript((base / "Assets/schema/gameplay/01_GameplaySchema.sql").read_text(encoding="utf-8-sig"))
    icons = []
    modules = ["base-standard"] + ["age-" + era.lower() for era in AGE_ROOTS]
    for folder in [base / "modules" / module / "data/icons" for module in modules]:
        for path in sorted(folder.glob("*.xml")):
            for item in ET.parse(path).getroot().findall("IconDefinitions/Row"):
                icons.append({**item.attrib, **{child.tag: child.text for child in item}})
    tables_by_module = {}
    for module in modules:
        tables = tables_by_module[module] = {}
        for path in sorted((base / "modules" / module / "data").glob("*.xml")):
            document = ET.parse(path).getroot()
            if document.tag != "Database":
                continue
            for table in document:
                tables.setdefault(table.tag, []).extend(
                    {**item.attrib, **{child.tag: child.text for child in item}}
                    for item in table if item.tag in ["Row", "InsertOrIgnore"])

    def columns(table):
        fields = [r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
        if not fields:
            raise ValueError(f"Unknown native table: {table}")
        return fields

    def copy(table, key, donor, overrides):
        fields = columns(table)
        matches = [item for item in native_tables.get(table, []) if item.get(key) == donor]
        if not matches:
            raise ValueError(f"Missing native donor: {table}.{key}={donor}")
        # Materialize shared definitions so other Ages never depend on an unloaded donor.
        return "\n".join(insert(table, **{
            field: 1 if value == "true" else 0 if value == "false" else value
            for field, value in {**item, **overrides}.items() if field in fields
        }) for item in matches)

    shared, menu_styles = [], []
    ages = {era: [] for era in AGE_ROOTS}
    shell, text, art, remaps = (ET.Element("Database") for _ in range(4))
    texts = {}
    def loc(key, value):
        texts[key] = icon_text(value) if key.endswith(("_DESCRIPTION", "_PREVIEW")) else value
        return key
    def history(page, section, value):
        shared.append(insert("CivilopediaPageChapterParagraphs", ChapterID="HISTORY", PageID=page,
                             SectionID=section, Paragraph=loc("LOC_PEDIA_" + page + "_HISTORY", value)))
    def kind(target, value):
        shared.append(insert("Types", Type=target, Kind="KIND_" + value))
    def modifier(target, collection, effect, arguments, requirements=None):
        dynamic = target + "_TYPE"
        kind(dynamic, "MODIFIER")
        shared.extend([insert("DynamicModifiers", ModifierType=dynamic, CollectionType=collection, EffectType=effect),
                       insert("Modifiers", ModifierId=target, ModifierType=dynamic, SubjectRequirementSetId=target + "_REQS" if requirements else None)])
        for name, value in arguments.items():
            shared.append(insert("ModifierArguments", ModifierId=target, Name=name, Value=str(value)))
        if requirements:
            shared.append(insert("RequirementSets", RequirementSetId=target + "_REQS", RequirementSetType="REQUIREMENTSET_TEST_ALL"))
            for number, (req_type, args, inverse) in enumerate(requirements):
                req = target + f"_REQ_{number}"
                shared.extend([insert("Requirements", RequirementId=req, RequirementType=req_type, Inverse=int(inverse)),
                               insert("RequirementSetRequirements", RequirementSetId=target + "_REQS", RequirementId=req)])
                for name, value in args.items():
                    shared.append(insert("RequirementArguments", RequirementId=req, Name=name, Value=value))

    def effect_data(spec, scope):
        effect, *values = spec
        city = "COLLECTION_OWNER" if scope == "city" else "COLLECTION_PLAYER_CITIES"
        unit = "COLLECTION_OWNER" if scope == "unit" else "COLLECTION_PLAYER_UNITS"
        reqs = []
        if effect in ["yield", "connected", "worker"]:
            suffix = {"yield": "YIELD", "connected": "YIELD_PER_CONNECTED_CITY", "worker": "WORKER_YIELD"}[effect]
            yield_name, amount = values
            text = {"yield": f"+{amount} {yield_name.title()} per settlement",
                    "connected": f"+{amount} {yield_name.title()} per connected settlement",
                    "worker": f"+{amount} {yield_name.title()} per Specialist"}[effect]
            return city, "EFFECT_CITY_ADJUST_" + suffix, {"YieldType": "YIELD_" + yield_name, "Amount": amount}, reqs, text
        if effect == "plot":
            yield_name, amount, terrain = values
            conditions = {
                "vegetated": ("REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES", {"FeatureClassType": "FEATURE_CLASS_VEGETATED"}, False),
                "river": ("REQUIREMENT_PLOT_IS_RIVER", {"Minor": "true", "Navigable": "true"}, False),
                "farm": ("REQUIREMENT_PLOT_HAS_CONSTRUCTIBLE", {"ConstructibleType": "IMPROVEMENT_FARM"}, False),
                "pasture": ("REQUIREMENT_PLOT_HAS_CONSTRUCTIBLE", {"ConstructibleType": "IMPROVEMENT_PASTURE"}, False),
                "fishing": ("REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES", {"TerrainType": "TERRAIN_COAST"}, False),
            }
            labels = {"vegetated": "vegetated tiles", "river": "river tiles", "farm": "Farms",
                      "pasture": "Pastures", "fishing": "Coast tiles"}
            collection = "COLLECTION_CITY_PLOT_YIELDS" if scope == "city" else "COLLECTION_PLAYER_PLOT_YIELDS"
            return collection, "EFFECT_PLOT_ADJUST_YIELD", {"YieldType": "YIELD_" + yield_name, "Amount": amount}, [conditions[terrain]], f"+{amount} {yield_name.title()} on {labels[terrain]}"
        if effect in ["growth", "wonder", "resource", "production"]:
            amount = values[-1]
            suffix = {"growth": "GROWTH", "wonder": "WONDER_PRODUCTION", "resource": "RESOURCE_CAP", "production": "UNIT_PRODUCTION"}[effect]
            args = {"Amount" if effect == "resource" else "Percent": amount}
            if effect == "production":
                if values[0] not in ["LAND", "SEA", "AIR"]:
                    raise ValueError(f"Unknown unit production domain: {values[0]}")
                args["Domain"] = "DOMAIN_" + values[0]
            text = {"growth": f"+{amount}% growth", "wonder": f"+{amount}% Wonder Production",
                    "resource": f"+{amount} Resource slots", "production": f"+{amount}% {str(values[0]).lower()} unit Production"}[effect]
            return city, "EFFECT_CITY_ADJUST_" + suffix, args, reqs, text
        if effect in ["trade", "settlements"]:
            if scope != "player":
                raise ValueError(f"{effect} requires a player owner")
            amount = values[0]
            args = {"Amount": amount}
            if effect == "trade":
                args["MajorsOnly"] = "true"
            return "COLLECTION_OWNER", "EFFECT_PLAYER_ADJUST_" + ("TRADE_CAPACITY" if effect == "trade" else "SETTLEMENT_CAP"), args, reqs, f"+{amount} " + ("Trade Route capacity with each major civilization" if effect == "trade" else "Settlement Limit")
        if effect == "combat":
            amount, condition = values
            conditions = {
                "attack": ("REQUIREMENT_PLAYER_IS_ATTACKING", {}, False),
                "defend": ("REQUIREMENT_PLAYER_IS_ATTACKING", {}, True),
                "coast": ("REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES", {"TerrainType": "TERRAIN_COAST"}, False),
            }
            labels = {"attack": "when attacking", "defend": "when defending", "coast": "on Coast tiles"}
            return "COLLECTION_UNIT_COMBAT", "EFFECT_ADJUST_UNIT_STRENGTH_MODIFIER", {"Amount": amount}, [conditions[condition]], f"+{amount} Combat Strength {labels[condition]}"
        if effect in ["move", "sight", "heal", "ignore"]:
            suffix = {"move": "EFFECT_UNIT_ADJUST_MOVEMENT", "sight": "EFFECT_ADJUST_UNIT_SIGHT",
                      "heal": "EFFECT_UNIT_ADJUST_HEAL_PER_TURN", "ignore": "EFFECT_UNIT_ADJUST_IGNORE_MOVEMENT_OBSTACLE"}[effect]
            value = values[0]
            args = {"Obstacle": "FEATURE_" + value} if effect == "ignore" else {"Amount": value}
            text = f"Ignore {value.replace('_', ' ').title()} movement penalties" if effect == "ignore" else f"+{value} " + {"move": "Movement", "sight": "Sight", "heal": "healing per turn"}[effect]
            return unit, suffix, args, reqs, text
        raise ValueError(f"Unknown effect: {effect}")

    def describe(specs, scope="player"):
        return "; ".join(effect_data(spec, scope)[4] for spec in specs) + "."

    def attach_effects(target, specs, scope, table, fields, gate=None):
        for number, spec in enumerate(specs, 1):
            mod = target + f"_MOD_{number}"
            collection, effect, args, reqs, text_value = effect_data(spec, scope)
            if gate:
                city_requirements = [("REQUIREMENT_CITY_HAS_UNIQUE_QUARTER", {"UniqueQuarterType": gate, "ConqueredValid": "false"}, False)]
                if spec[0] == "plot":
                    nested = mod + "_PLOTS"
                    modifier(nested, "COLLECTION_CITY_PLOT_YIELDS", effect, args, reqs)
                    collection, effect, args = "COLLECTION_PLAYER_CITIES", "EFFECT_ATTACH_MODIFIERS", {"ModifierId": nested}
                    reqs = city_requirements
                else:
                    reqs = reqs + city_requirements
            modifier(mod, collection, effect, args, reqs)
            shared.append(insert("ModifierStrings", ModifierId=mod, Context="Description",
                                 Text=loc("LOC_" + mod + "_DESCRIPTION", text_value + ".")))
            shared.append(insert("ModifierStrings", ModifierId=mod, Context="Preview",
                                 Text=loc("LOC_" + mod + "_PREVIEW", text_value + ".")))
            shared.append(insert(table, **fields, ModifierId=mod))
            if gate:
                shared.append(insert("UniqueQuarterModifiers", UniqueQuarterType=gate, ModifierId=mod))

    def original_icon(target):
        image = f"art/civilizations/icons/{target.lower()}.png"
        path = MOD / image
        if not path.is_file():
            raise FileNotFoundError(f"Import the original white element icon before generating {target}: {path}")
        row(art, "IconDefinitions", ID=target, Path="fs://game/anthroprocenia_map_history/" + image)

    def art_alias(target, donor, art_kind):
        matches = [item for item in icons if item.get("ID") == donor]
        if not matches:
            raise ValueError(f"No native icon for {donor}")
        original_icon(target)
        row(remaps, "VisualRemaps", ID="REMAP_" + target, DisplayName="LOC_" + target + "_NAME",
            Kind=art_kind, From=donor, To=target)
    def item(civ, target, type_kind, name, description, icon):
        row(shell, "CivilizationItems", CivilizationDomain=domain, CivilizationType=civ,
            AgeType=age_type, Type=target, Kind="KIND_" + type_kind,
            Name=name, Description=description, Icon=icon)

    for index, civ in enumerate(CONTENT):
        era = civ.get("age", "ANTIQUITY")
        age_type, domain = "AGE_" + era, era.title() + "AgeCivilizations"
        age = ages[era]
        native_tables = {}
        for module in ["base-standard", "age-" + era.lower()]:
            for table, records in tables_by_module[module].items():
                native_tables.setdefault(table, []).extend(records)
        cost_scale = {"ANTIQUITY": 1, "EXPLORATION": 5, "MODERN": 10}[era]
        key, donor = civ["key"], "CIVILIZATION_" + civ["donor"]
        kit = KITS[key]
        civ_id, trait = "CIVILIZATION_ANTHRO_" + key, "TRAIT_ANTHRO_" + key
        tree, ability = "TREE_ANTHRO_" + key, trait + "_ABILITY"
        prefix = "LOC_" + civ_id
        name = loc(prefix + "_NAME", civ["name"])
        adjective = loc(prefix + "_ADJECTIVE", civ["adjective"])
        description = loc(prefix + "_DESCRIPTION", civ["overview"])
        intro = loc(prefix + "_INTRO", civ["intro"])
        history(civ_id, "CIVILIZATIONS", kit["history"])
        image = f"art/civilizations/{key.lower()}.png"
        path = MOD / image
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.is_file():
            raise FileNotFoundError(f"Import the original historical emblem before generating {key}: {path}")
        emblem_bytes = path.read_bytes()
        path.write_bytes(emblem_bytes)
        # Some native image consumers strip the file extension before lookup.
        path.with_suffix("").write_bytes(emblem_bytes)
        row(art, "IconDefinitions", ID=civ_id, Path="fs://game/anthroprocenia_map_history/" + image)
        row(art, "IconDefinitions", ID="cult_anthro_" + key.lower(), Path="fs://game/anthroprocenia_map_history/" + image)
        for icon in icons:
            if icon.get("ID") == donor and icon.get("Context") in ["BACKGROUND", "BACKGROUND_VERT"]:
                row(art, "IconDefinitions", **{**icon, "ID": civ_id,
                    "Path": f"fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_{key.lower()}.png"})
        # Native selection cards and panels use filenames, bypassing IconDefinitions.
        for layout in ["card", "panel"]:
            target_image = f"bg-{layout}-anthro_{key.lower()}"
            donor_image = f"fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_{key.lower()}.png"
            menu_styles.append(
                f'.img-{target_image}, [style*="{target_image}"] {{ '
                f'background-image: url("{donor_image}") !important; '
                'background-size: cover !important; background-position: center !important; '
                'background-repeat: no-repeat !important; }')
        symbol = f"civ_sym_anthro_{key.lower()}"
        menu_styles.append(
            f'.img-{symbol}, [style*="{symbol}"] {{ '
            f'background-image: url("fs://game/anthroprocenia_map_history/{image}") !important; '
            'background-size: contain !important; background-position: center !important; '
            'background-repeat: no-repeat !important; }')
        row(shell, "Civilizations", Domain=domain, CivilizationType=civ_id,
            CivilizationName=name, CivilizationFullName=name, CivilizationDescription=description,
            CivilizationIcon="fs://game/anthroprocenia_map_history/" + image, CivilizationIntroText=intro)
        for tag in ["TAG_APEX_" + age_type] + ["TAG_TRAIT_" + a for a in civ["attributes"]]:
            row(shell, "CivilizationTags", CivilizationDomain=domain, CivilizationType=civ_id, TagType=tag)
        for leader, connection in LEADER_MATCHES[key]:
            choice = connection if connection in ["HISTORICAL", "GEOGRAPHIC"] else "STRATEGIC"
            reason = loc(f"LOC_ANTHRO_{key}_{leader}_RECOMMENDATION",
                         f"{civ['name']}: " + {
                             "HISTORICAL": "a direct historical connection.",
                             "GEOGRAPHIC": "a regional connection, not a claim that this leader ruled this civilization.",
                         }.get(connection, f"a complementary {connection.lower()} playstyle."))
            row(shell, "LeaderCivilizationBias", LeaderDomain="StandardLeaders", LeaderType="LEADER_" + leader,
                CivilizationDomain=domain, CivilizationType=civ_id, Bias=4 if choice == "HISTORICAL" else 2,
                ReasonType=reason, ChoiceType="LOC_CREATE_GAME_" + choice + "_CHOICE")
            shared.append(insert("LeaderCivPriorities", Civilization=civ_id, Leader="LEADER_" + leader,
                                 Priority=3 if choice == "HISTORICAL" else 2))
        if era != "ANTIQUITY":
            unlock = "UNLOCK_" + civ_id
            kind(unlock, "UNLOCK")
            shared.extend([
                insert("Unlocks", UnlockType=unlock),
                insert("UnlockConfigurationValues", UnlockType=unlock, ConfigurationValue=civ_id),
                insert("UnlockRewards", UnlockType=unlock, Name=name,
                       Description="LOC_UNLOCK_" + era + "_CIV_DESCRIPTION", Icon=civ_id,
                       UnlockRewardType=civ_id, UnlockRewardKind="KIND_CIVILIZATION"),
            ])
            for requirement in native_tables.get("UnlockRequirements", []):
                if requirement.get("UnlockType") == "UNLOCK_" + donor and str(requirement.get("GameplayUnlock")).lower() == "true":
                    shared.append(insert("UnlockRequirements", UnlockType=unlock,
                                         RequirementSetId=requirement["RequirementSetId"],
                                         Description=requirement.get("Description"), GameplayUnlock=1))
            for leader, _ in LEADER_MATCHES[key]:
                shared.append(insert("UnlockRequirements", UnlockType=unlock,
                                     RequirementSetId="REQSET_LEADER_IS_" + leader,
                                     Description="LOC_UNLOCK_PLAY_AS_" + leader + "_DESCRIPTION"))
                row(shell, "LeaderUnlocks", LeaderDomain="StandardLeaders", LeaderType="LEADER_" + leader,
                    AgeType=age_type, Type=civ_id, Kind="KIND_CIVILIZATION", Name=name,
                    Description="LOC_UNLOCK_" + era + "_CIV_DESCRIPTION", Icon=civ_id)
        for target, target_kind in [(civ_id, "CIVILIZATION"), (trait, "TRAIT"), (ability, "TRAIT"), (tree, "TREE")]:
            kind(target, target_kind)
        capital = loc(prefix + "_CITY_1", civ["cities"][0])
        shared.append(insert("Civilizations", CivilizationType=civ_id, Name=name, FullName=name, Description=description,
                             Adjective=adjective, StartingCivilizationLevelType="CIVILIZATION_LEVEL_FULL_CIV",
                             ApexAge=age_type, CapitalName=capital, RandomCityNameDepth=len(civ["cities"]),
                             UniqueCultureProgressionTree=tree))
        for number, city in enumerate(civ["cities"], 1):
            shared.append(insert("CityNames", CivilizationType=civ_id, CityName=loc(prefix + f"_CITY_{number}", city), SortIndex=number))
        shared.append(insert("LegacyCivilizations", CivilizationType=civ_id, Name=name, FullName=name, Adjective=adjective, Age=age_type))
        shared.append(insert("LegacyCivilizationTraits", CivilizationType=civ_id, TraitType=trait))
        for target in [trait, ability]:
            shared.append(insert("Traits", TraitType=target, Name=name, Description=description, InternalOnly=1))
        for target in [trait, ability, "TRAIT_" + era + "_CIV"] + ["TRAIT_ATTRIBUTE_" + a for a in civ["attributes"]]:
            shared.append(insert("CivilizationTraits", CivilizationType=civ_id, TraitType=target))
        for table, field in [("VisArt_CivilizationUnitCultures", "UnitCulture"), ("VisArt_CivilizationBuildingCultures", "BuildingCulture")]:
            culture_donor = "CIVILIZATION_" + kit.get("culture", civ["donor"])
            shared.append(copy(table, "CivilizationType", culture_donor, {"CivilizationType": civ_id}))
        scene = f"fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_{key.lower()}.png"
        shared.append(copy("LoadingInfo_Civilizations", "CivilizationType", donor,
                           {"CivilizationType": civ_id, "CivilizationText": intro, "Subtitle": name, "Tip": description,
                            "BackgroundImageHigh": scene, "BackgroundImageLow": scene, "ForegroundImage": None, "Audio": None}))
        ability_name = civ["ability"][0]
        ability_desc = loc("LOC_" + ability + "_DESCRIPTION", describe(kit["ability"]))
        ability_loc = loc("LOC_" + ability + "_NAME", ability_name)
        shared.append(f"UPDATE Traits SET Name={quote(ability_loc)},Description={quote(ability_desc)} WHERE TraitType={quote(ability)};")
        attach_effects(ability, kit["ability"], "player", "TraitModifiers", {"TraitType": ability})
        item(civ_id, ability, "TRAIT", ability_loc, ability_desc, civ_id)
        shared.append(insert("CivilizationInfo", CivilizationType=civ_id, Header="LOC_CIVILIZATION_INFO_UNIQUE_ABILITY", Caption=ability_desc))
        shared.append(insert("ProgressionTrees", ProgressionTreeType=tree, AgeType=age_type, SystemType="SYSTEM_CULTURE",
                             Name=loc("LOC_" + tree + "_NAME", civ["name"] + " Civics"), IconString="cult_anthro_" + key.lower()))
        reveal = "MOD_ANTHRO_" + key + "_REVEAL_TREE"
        modifier(reveal, "COLLECTION_OWNER", "EFFECT_PLAYER_REVEAL_CULTURE_TREE", {"ProgressionTreeType": tree})
        age.append(insert("ProgressionTreeNodeUnlocks", ProgressionTreeNodeType=AGE_ROOTS[era],
                          TargetType=reveal, TargetKind="KIND_MODIFIER", RequiredTraitType=trait, Hidden=1))
        building_ids = []
        for number, (building, native_building, yield_name) in enumerate(civ["buildings"], 1):
            target = f"BUILDING_ANTHRO_{key}_{number}"
            building_ids.append(target)
            kind(target, "CONSTRUCTIBLE")
            building_name = loc("LOC_" + target + "_NAME", building)
            building_desc = loc("LOC_" + target + "_DESCRIPTION", f"Ageless unique building. +3 {yield_name.title()}. {describe(kit['buildings'][number-1], 'city')} Applies in this settlement. Combine with the other unique building to form {civ['quarter']}.")
            shared.append(copy("Constructibles", "ConstructibleType", "BUILDING_" + native_building,
                               {"ConstructibleType": target, "Name": building_name, "Description": building_desc,
                                "Tooltip": building_desc, "Cost": (110 + number * 15) * cost_scale, "RequiresUnlock": 1,
                                "AdjacentRiver": 0, "Age": age_type}))
            shared.append(insert("Buildings", ConstructibleType=target, Movable=0, TraitType=trait, PurchaseYield="YIELD_GOLD"))
            for district in ["DISTRICT_CITY_CENTER", "DISTRICT_URBAN"]:
                shared.append(insert("Constructible_ValidDistricts", ConstructibleType=target, DistrictType=district))
            shared.append(insert("Constructible_YieldChanges", ConstructibleType=target, YieldType="YIELD_" + yield_name, YieldChange=3))
            for tag in ["UNIQUE", "AGELESS", yield_name]:
                shared.append(insert("TypeTags", Type=target, Tag=tag))
            attach_effects(target, kit["buildings"][number-1], "city", "ConstructibleModifiers", {"ConstructibleType": target})
            art_alias(target, "BUILDING_" + native_building, "BUILDING")
            item(civ_id, target, "BUILDING", building_name, building_desc, "ICON_" + target)
            if "elementHistory" in kit:
                history(target, "BUILDINGS", kit["elementHistory"][f"building{number}"])
        quarter = "QUARTER_ANTHRO_" + key
        quarter_name = loc("LOC_" + quarter + "_NAME", civ["quarter"])
        quarter_desc = loc("LOC_" + quarter + "_DESCRIPTION", f"Place both unique buildings in one district. {describe(kit['quarter'])} Applies only in settlements containing your quarter.")
        kind(quarter, "QUARTER")
        shared.append(insert("UniqueQuarters", UniqueQuarterType=quarter, BuildingType1=building_ids[0], BuildingType2=building_ids[1],
                             TraitType=trait, Name=quarter_name, Description=quarter_desc, Tooltip=quarter_desc))
        attach_effects(quarter, kit["quarter"], "player", "TraitModifiers", {"TraitType": trait}, quarter)
        original_icon(quarter)
        item(civ_id, quarter, "QUARTER", quarter_name, quarter_desc, quarter)
        if "elementHistory" in kit:
            history(quarter, "BUILDINGS", kit["elementHistory"]["quarter"])
        improvement = f"IMPROVEMENT_ANTHRO_{key}"
        improvement_name, improvement_donor, improvement_yield, improvement_amount, improvement_effect = kit["improvement"]
        kind(improvement, "CONSTRUCTIBLE")
        improvement_loc = loc("LOC_" + improvement + "_NAME", improvement_name)
        improvement_desc = loc("LOC_" + improvement + "_DESCRIPTION",
                               f"Ageless unique rural improvement. One per settlement. +{improvement_amount} {improvement_yield.title()}. {describe([improvement_effect], 'city')} Applies in this settlement.")
        shared.append(copy("Constructibles", "ConstructibleType", "IMPROVEMENT_" + improvement_donor,
                           {"ConstructibleType": improvement, "Name": improvement_loc, "Description": improvement_desc,
                            "Tooltip": improvement_desc, "RequiresUnlock": 1, "Age": age_type, "Cost": 65 * cost_scale}))
        shared.append(copy("Improvements", "ConstructibleType", "IMPROVEMENT_" + improvement_donor,
                           {"ConstructibleType": improvement, "TraitType": trait, "OnePerSettlement": 1, "CityBuildable": 1}))
        shared.append(insert("Constructible_ValidDistricts", ConstructibleType=improvement, DistrictType="DISTRICT_RURAL"))
        for table in ["Constructible_ValidTerrains", "Constructible_ValidFeatures"]:
            if any(r.get("ConstructibleType") == "IMPROVEMENT_" + improvement_donor for r in native_tables.get(table, [])):
                shared.append(copy(table, "ConstructibleType", "IMPROVEMENT_" + improvement_donor, {"ConstructibleType": improvement}))
        if not any(r.get("ConstructibleType") == "IMPROVEMENT_" + improvement_donor for r in native_tables.get("Constructible_ValidTerrains", [])):
            for terrain in ["TERRAIN_FLAT", "TERRAIN_HILL"]:
                shared.append(insert("Constructible_ValidTerrains", ConstructibleType=improvement, TerrainType=terrain))
        for tag in ["UNIQUE_IMPROVEMENT", "AGELESS"]:
            shared.append(insert("TypeTags", Type=improvement, Tag=tag))
        shared.append(insert("Constructible_YieldChanges", ConstructibleType=improvement, YieldType="YIELD_" + improvement_yield, YieldChange=improvement_amount))
        attach_effects(improvement, [improvement_effect], "city", "ConstructibleModifiers", {"ConstructibleType": improvement})
        art_alias(improvement, "IMPROVEMENT_" + improvement_donor, "IMPROVEMENT")
        item(civ_id, improvement, "IMPROVEMENT", improvement_loc, improvement_desc, improvement)
        if "elementHistory" in kit:
            history(improvement, "IMPROVEMENTS", kit["elementHistory"]["improvement"])
        for number, (civic, prereqs, civic_effects) in enumerate(kit["civics"], 1):
            node = f"NODE_ANTHRO_{key}_{number}"
            kind(node, "TREE_NODE")
            column, layout_row = [(0, 1), (1, 0), (1, 2), (2, 0), (2, 2), (3, 1)][number-1]
            node_values = dict(ProgressionTreeNodeType=node, ProgressionTree=tree, Cost=[100, 160, 160, 260, 260, 420][number - 1] * cost_scale,
                               Name=loc("LOC_" + node + "_NAME", civic),
                               Description=loc("LOC_" + node + "_DESCRIPTION", describe(civic_effects)),
                               IconString="cult_anthro_" + key.lower(), UILayoutColumn=column, UILayoutRow=layout_row)
            shared.extend([insert("ProgressionTreeNodes", **node_values), insert("ProgressionTreeNodeTraits", ProgressionTreeNodeType=node, RequiredTraitType=trait)])
            row(shell, "ProgressionTreeNodes", **node_values)
            if "civicHistory" in kit:
                history(node, "CULTURE", kit["civicHistory"][number - 1])
            for prerequisite in prereqs:
                shared.append(insert("ProgressionTreePrereqs", Node=node, PrereqNode=f"NODE_ANTHRO_{key}_{prerequisite}"))
            for depth, effects_to_unlock in [(1, civic_effects), (2, [civic_effects[0]])] if number in [2, 3, 6] else [(1, civic_effects)]:
                for effect_number, spec in enumerate(effects_to_unlock, 1):
                    target = f"MOD_{node}_{depth}_{effect_number}"
                    collection, effect, args, reqs, text_value = effect_data(spec, "player")
                    modifier(target, collection, effect, args, reqs)
                    shared.append(insert("ProgressionTreeNodeUnlocks", ProgressionTreeNodeType=node, TargetType=target,
                                         TargetKind="KIND_MODIFIER", RequiredTraitType=trait, UnlockDepth=depth,
                                         IconString="cult_anthro_" + key.lower()))
                    row(shell, "ProgressionTreeNodeUnlocks", ProgressionTreeNodeType=node, TargetType=target,
                        TargetKind="KIND_MODIFIER", RequiredTraitType=trait, UnlockDepth=depth)
                    for context in ["Description", "Preview"]:
                        shared.append(insert("ModifierStrings", ModifierId=target, Context=context,
                                             Text=loc("LOC_" + target + "_" + context.upper(), text_value + ".")))
            if number <= 2:
                shared.append(insert("ProgressionTreeNodeUnlocks", ProgressionTreeNodeType=node, TargetType=building_ids[number - 1],
                                     TargetKind="KIND_CONSTRUCTIBLE", RequiredTraitType=trait))
            if number == 3:
                shared.append(insert("ProgressionTreeNodeUnlocks", ProgressionTreeNodeType=node, TargetType=improvement,
                                     TargetKind="KIND_CONSTRUCTIBLE", RequiredTraitType=trait))
        for number, (trad_name, civic_number, tradition_effects) in enumerate(kit["traditions"], 1):
            tradition, node = f"TRADITION_ANTHRO_{key}_{number}", f"NODE_ANTHRO_{key}_{civic_number}"
            kind(tradition, "TRADITION")
            tradition_name = loc("LOC_" + tradition + "_NAME", trad_name)
            tradition_desc = loc("LOC_" + tradition + "_DESCRIPTION", describe(tradition_effects) + " While this Tradition is slotted.")
            trad_values = dict(TraditionType=tradition, AgeType=age_type, CultureSlotType="POLICY_CULTURE_SLOT", TraitType=trait,
                               Name=tradition_name, Description=tradition_desc)
            shared.append(insert("Traditions", **trad_values))
            row(shell, "Traditions", **trad_values)
            unlock = dict(ProgressionTreeNodeType=node, TargetType=tradition, TargetKind="KIND_TRADITION", RequiredTraitType=trait)
            shared.append(insert("ProgressionTreeNodeUnlocks", **unlock))
            row(shell, "ProgressionTreeNodeUnlocks", **unlock)
            attach_effects(tradition, tradition_effects, "player", "TraditionModifiers", {"TraditionType": tradition})
        unit_ids = []
        recon = "EXPLORER" if era == "MODERN" else "SCOUT"
        donors = civ["donors"] + [recon]
        models = civ.get("models", civ["donors"]) + [recon]
        for number, (unit_donor, model) in enumerate(zip(donors, models), 1):
            target = f"UNIT_ANTHRO_{key}_{number}"
            unit_ids.append(target)
            is_scout = number == len(donors)
            unit_name = loc("LOC_" + target + "_NAME", civ["scout"] if is_scout else civ["unit"])
            unit_effects = kit["scout" if is_scout else "military"]
            unit_desc = loc("LOC_" + target + "_DESCRIPTION", (f"Unique {recon.title()} with +1 base Movement. " if is_scout else
                            "Unique military unit with +1 base Combat Strength. ") + describe(unit_effects, "unit"))
            kind(target, "UNIT")
            overrides = {"UnitType": target, "Name": unit_name, "Description": unit_desc, "TraitType": trait}
            if is_scout:
                native_unit = next(item for item in native_tables["Units"] if item.get("UnitType") == "UNIT_" + unit_donor)
                overrides["BaseMoves"] = int(native_unit.get("BaseMoves", 2)) + 1
            if civ.get("mounted") and not is_scout:
                overrides.update(UnitMovementClass="UNIT_MOVEMENT_CLASS_MOUNTED", BaseMoves=4)
            age.append(copy("Units", "UnitType", "UNIT_" + unit_donor, overrides))
            for table in ["Unit_Stats", "Unit_Costs"]:
                fields = columns(table)
                expressions = [quote(target) if f == "UnitType" else f'CASE WHEN "{f}">0 THEN "{f}"+1 ELSE "{f}" END'
                               if f in ["Combat", "RangedCombat", "Bombard"] and not is_scout else f'"{f}"' for f in fields]
                age.append(f'INSERT INTO {table} ({",".join(fields)}) SELECT {",".join(expressions)} FROM {table} WHERE UnitType={quote("UNIT_" + unit_donor)};')
            tag_donor = model if civ.get("mounted") and not is_scout else unit_donor
            age.append(f"INSERT INTO TypeTags (Type,Tag) SELECT {quote(target)},Tag FROM TypeTags WHERE Type={quote('UNIT_' + tag_donor)};")
            age.append(insert("TypeTags", Type=target, Tag="UNIT_CLASS_UNIQUE"))
            age.append(insert("UnitReplaces", CivUniqueUnitType=target, ReplacesUnitType="UNIT_" + unit_donor))
            age.append(f"INSERT INTO ProgressionTreeNodeUnlocks (ProgressionTreeNodeType,TargetType,TargetKind,UnlockDepth,RequiredTraitType) SELECT ProgressionTreeNodeType,{quote(target)},TargetKind,UnlockDepth,{quote(trait)} FROM ProgressionTreeNodeUnlocks WHERE TargetType={quote('UNIT_' + unit_donor)} AND TargetKind='KIND_UNIT' AND RequiredTraitType IS NULL;")
            if number > 1 and not is_scout:
                age.append(insert("UnitUpgrades", Unit=unit_ids[-2], UpgradeUnit=target))
            for table in ["Unit_Abilities", "UnitAiInfos", "Unit_Advisories"]:
                if any(r.get("UnitType") == "UNIT_" + unit_donor for r in native_tables.get(table, [])):
                    age.append(copy(table, "UnitType", "UNIT_" + unit_donor, {"UnitType": target}))
            unit_ability = "ABILITY_" + target
            unit_class = "UNIT_CLASS_" + target.removeprefix("UNIT_")
            kind(unit_ability, "ABILITY")
            shared.append(insert("UnitAbilities", UnitAbilityType=unit_ability, Name=unit_name, Description=unit_desc))
            # Native effect initialization needs class scoping as well as Unit_Abilities.
            shared.append(insert("Tags", Tag=unit_class, Category="UNIT_CLASS"))
            shared.append(insert("UnitClass_Abilities", UnitClassType=unit_class, UnitAbilityType=unit_ability))
            age.append(insert("TypeTags", Type=target, Tag=unit_class))
            age.append(insert("Unit_Abilities", UnitType=target, UnitAbilityType=unit_ability))
            attach_effects(unit_ability, unit_effects, "unit", "UnitAbilityModifiers", {"UnitAbilityType": unit_ability})
            art_alias(target, "UNIT_" + model, "UNIT")
            if number == 1 or is_scout:
                item(civ_id, target, "UNIT", unit_name, unit_desc, "ICON_" + target)
            if "elementHistory" in kit:
                history(target, "UNITS", kit["elementHistory"]["scout" if is_scout else "military"])
        # Reused assets are named explicitly; no native textures or models are redistributed.
        shared.append(copy("CivilizationFavoredWonders", "CivilizationType", donor, {"CivilizationType": civ_id}))

    language = ET.SubElement(text, "EnglishText")
    for key, value in sorted(texts.items()):
        entry = ET.SubElement(language, "Row", {"Tag": key})
        ET.SubElement(entry, "Text").text = value
    portrait_map = {f"UNIT_ANTHRO_{c['key']}_{i}": "UNIT_" + donor
                    for c in CONTENT for i, donor in enumerate(c.get("models", c["donors"]) + [
                        "EXPLORER" if c.get("age") == "MODERN" else "SCOUT"], 1)}
    outputs = {
        "config/Civilizations.xml": xml(shell),
        "data/civilizations.sql": "-- Generated by tools/build-civilizations.py; edit tools/civilizations.json.\n" + "\n".join(shared) + "\n",
        "text/en_us/Civilizations.xml": xml(text),
        "data/civilization-icons.xml": xml(art),
        "data/civilization-visual-remaps.xml": xml(remaps),
        "ui/map/anthroprocenia-unit-art.js":
            "export const UNIT_ART_DONORS = " + json.dumps(portrait_map, indent=2) + ";\n"
            "export const CIVILIZATION_BACKGROUNDS = " + json.dumps({
                "anthro_" + c["key"].lower(): f"fs://game/anthroprocenia_map_history/art/civilizations/scenes/scene_anthro_{c['key'].lower()}.png"
                for c in CONTENT}, indent=2) + ";\n",
        "ui/map/anthroprocenia-civilization-backgrounds.js":
            "// Generated by tools/build-civilizations.py.\n"
            "import '/core/ui-next/screens/create-game/create-game-stage.js';\n"
            "import { ComponentRegistry } from '/core/ui-next/services/component-registry.js';\n"
            "import { createRenderEffect } from '/core/vendor/solid-js/dist/solid.js';\n"
            "import { civilizationBackgroundTexture } from './anthroprocenia-civilization-art.js';\n"
            "const style = document.createElement('style');\n"
            "style.textContent = " + json.dumps("\n".join(menu_styles)) + ";\n"
            "document.head.appendChild(style);\n"
            "const stage = ComponentRegistry.get('CreateGameStage');\n"
            "const original = stage.factory();\n"
            "ComponentRegistry.register('CreateGameStage', props => {\n"
            "  const background = document.createElement('div');\n"
            "  background.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;background-size:cover;background-position:center;background-repeat:no-repeat;';\n"
            "  createRenderEffect(() => {\n"
            "    const texture = civilizationBackgroundTexture(props.backgroundImage);\n"
            "    const custom = texture !== props.backgroundImage;\n"
            "    background.style.display = custom ? 'block' : 'none';\n"
            "    background.style.backgroundImage = custom ? `url(\"${texture}\")` : '';\n"
            "    background.style.opacity = String(props.backgroundOpacity ?? 0.15);\n"
            "  });\n"
            "  return [background, original(props)];\n"
            "}, stage.overridePriority + 1);\n",
    }
    for era, statements in ages.items():
        outputs[f"data/civilizations-{era.lower()}.sql"] = "-- Generated by tools/build-civilizations.py.\n" + "\n".join(statements) + "\n"
    return outputs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--art-atlas", type=Path, help="Original 4-column, 2-row artwork atlas; cropped once into eight scenes.")
    parser.add_argument("--atlas-era", choices=["original", *[era.lower() for era in AGE_ROOTS]], default="original")
    parser.add_argument("--atlas-keys", nargs="+", help="Explicit civilization keys in artwork reading order.")
    parser.add_argument("--atlas-grid", nargs=2, type=int, metavar=("COLUMNS", "ROWS"))
    args = parser.parse_args()
    if args.art_atlas:
        atlas = Image.open(args.art_atlas).convert("RGB")
        folder = MOD / "art/civilizations/scenes"
        folder.mkdir(parents=True, exist_ok=True)
        selected = CONTENT[:8] if args.atlas_era == "original" else [
            civ for civ in CONTENT[8:] if civ["age"].lower() == args.atlas_era]
        if args.atlas_keys:
            by_key = {civ["key"]: civ for civ in CONTENT}
            selected = [by_key[key] for key in args.atlas_keys]
        cols, rows = (4, 2) if args.atlas_era == "original" else (3, 2) if args.atlas_era == "antiquity" else (4, 4)
        if args.atlas_grid:
            cols, rows = args.atlas_grid
        if min(cols, rows) < 1:
            raise ValueError("Artwork grid dimensions must be positive")
        if len(selected) > cols * rows:
            raise ValueError("Artwork atlas has fewer cells than civilizations")
        for index, civ in enumerate(selected):
            x, y = index % cols, index // cols
            atlas.crop((round(x*atlas.width/cols), round(y*atlas.height/rows),
                        round((x+1)*atlas.width/cols), round((y+1)*atlas.height/rows))).save(folder / ("scene_anthro_" + civ["key"].lower() + ".png"))
            legacy = folder / (civ["key"].lower() + ".png")
            if legacy.exists():
                legacy.unlink()
    outputs = generate(args.base)
    for relative, content in outputs.items():
        path = MOD / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    manifest_path = MOD / "anthroprocenia.modinfo"
    ET.register_namespace("", "ModInfo")
    manifest = ET.parse(manifest_path)
    namespace = {"m": "ModInfo"}
    for group in manifest.getroot().findall("m:ActionGroups/m:ActionGroup", namespace):
        if group.attrib["id"] not in ["civilizations-shell", "civilizations-shared"]:
            continue
        imported = group.find("m:Actions/m:ImportFiles", namespace)
        for item in list(imported):
            if item.text.startswith("art/civilizations/") and not (MOD / item.text).is_file():
                imported.remove(item)
        existing = {item.text for item in imported}
        for image in sorted((MOD / "art/civilizations").rglob("*.png")):
            relative = image.relative_to(MOD).as_posix()
            if relative not in existing:
                ET.SubElement(imported, "{ModInfo}Item").text = relative
    ET.indent(manifest, space="\t")
    manifest.write(manifest_path, encoding="utf-8", xml_declaration=True)
    print(f"Generated {len(CONTENT)} civilizations, {len(outputs)} definition files and {len(CONTENT)} original emblems.")
