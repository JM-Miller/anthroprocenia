"""Executable expansion checks against the installed Civ VII schema and native data."""
from collections import Counter, defaultdict, deque
import importlib
import json
from pathlib import Path
import sqlite3
import sys
import unittest
import xml.etree.ElementTree as ET
import zlib
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
native = importlib.import_module("progression-native")
BASE = Path(sys.argv.pop(1)) if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else native.DEFAULT_BASE
MOD = native.MOD
INVENTORY = json.loads((ROOT / "tools" / "progression-inventory.json").read_text(encoding="utf-8"))
TEXTS = {r.get("Tag"): r.findtext("Text") for r in ET.parse(
    MOD / "text" / "en_us" / "ProgressionExpansion.xml").getroot().findall("EnglishText/Row")}
NS = {"m": "ModInfo"}
MANIFEST = ET.parse(MOD / "anthroprocenia.modinfo").getroot()


def statements(age):
    groups = MANIFEST.findall("m:ActionGroups/m:ActionGroup", NS)
    groups = sorted((g for g in groups if g.get("scope") == "game"
                     and g.get("criteria") in ("always", age) and g.get("id", "").startswith("progression-")),
                    key=lambda g: int(g.findtext("m:Properties/m:LoadOrder", namespaces=NS)))
    return [MOD / r.text for g in groups for r in g.findall("m:Actions/m:UpdateDatabase/m:Item", NS)]


def expand(db, age):
    for path in statements(age):
        db.executescript(path.read_text(encoding="utf-8"))


def snapshot(db, table):
    return set(map(tuple, db.execute('SELECT * FROM "' + table + '"')))


def graph(db):
    nodes = {r[0] for r in db.execute("SELECT ProgressionTreeNodeType FROM ProgressionTreeNodes")}
    edges = {(child, parent) for child, parent in db.execute("SELECT Node,PrereqNode FROM ProgressionTreePrereqs")
             if child in nodes and parent in nodes}
    children, pending = defaultdict(list), Counter()
    for child, parent in edges:
        children[parent].append(child)
        pending[child] += 1
    ready = deque(n for n in nodes if not pending[n])
    reached = set()
    while ready:
        node = ready.popleft()
        reached.add(node)
        for child in children[node]:
            pending[child] -= 1
            if not pending[child]:
                ready.append(child)
    if reached != nodes:
        raise AssertionError(f"Cyclic/unreachable graph: {sorted(nodes - reached)[:10]}")
    return nodes, edges, children


class ProgressionNative(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.samples = {}
        for age in native.AGES:
            for dlc in (False, True):
                before = native.database(BASE, age=age, dlc=dlc)
                after = sqlite3.connect(":memory:")
                after.row_factory = sqlite3.Row
                after.create_function("Make_Hash", 1, lambda v: zlib.crc32(str(v).upper().encode()))
                before.backup(after)
                expand(after, age)
                cls.samples[age, dlc] = before, after
        cls.plans = {r["node"]: r for r in INVENTORY["nodes"]}
        cls.native_icons = []
        cls.native_effects = defaultdict(set)
        for path in native.native_paths(BASE):
            root = ET.parse(path).getroot()
            cls.native_icons.extend({**r.attrib, **{c.tag: c.text for c in r}}
                                    for r in root.findall("IconDefinitions/Row"))
            for r in root.iter():
                if r.tag.rsplit("}", 1)[-1] == "Modifier" and r.get("effect"):
                    cls.native_effects[r.get("effect")].update(c.get("name") for c in r
                        if c.tag.rsplit("}", 1)[-1] == "Argument")
        for path in list((BASE / "modules").glob("*/data/icons/*.xml")) + list(
                (BASE.parent / "DLC").glob("*/modules/data/icons/*.xml")):
            cls.native_icons.extend({**r.attrib, **{c.tag: c.text for c in r}}
                                    for r in ET.parse(path).getroot().findall("IconDefinitions/Row"))

    @classmethod
    def tearDownClass(cls):
        for before, after in cls.samples.values():
            before.close()
            after.close()

    def test_every_tree_exactly_triples_with_and_without_dlc(self):
        for (age, dlc), (before, after) in self.samples.items():
            old = Counter(r["ProgressionTree"] for r in native.research_nodes(before))
            new = Counter(r["ProgressionTree"] for r in native.research_nodes(after))
            self.assertEqual(new, Counter({tree: count * 3 for tree, count in old.items()}), (age, dlc))
            self.assertEqual({r[0] for r in before.execute("SELECT ProgressionTreeType FROM ProgressionTrees")},
                             {r[0] for r in after.execute("SELECT ProgressionTreeType FROM ProgressionTrees")})
        all_data = native.database(BASE)
        self.assertEqual({r["ProgressionTreeNodeType"] for r in INVENTORY["originals"]},
                         {r["ProgressionTreeNodeType"] for r in native.research_nodes(all_data)})
        all_data.close()

    def test_frontend_previews_triple_without_changing_existing_items(self):
        groups = [g for g in MANIFEST.findall("m:ActionGroups/m:ActionGroup", NS)
                  if g.get("scope") == "shell" and g.get("id", "").startswith("progression-")]
        files = [MOD / r.text for g in groups for r in g.findall("m:Actions/m:UpdateDatabase/m:Item", NS)]
        self.assertTrue(files)
        for dlc in (False, True):
            db = native.frontend_database(BASE, dlc=dlc)
            old_counts = Counter()
            old_budgets = Counter()
            for tree, cost in db.execute("SELECT ProgressionTree,Cost FROM ProgressionTreeNodes"):
                old_counts[tree] += 1
                old_budgets[tree] += cost
            old_items = snapshot(db, "CivilizationItems")
            old_unlocks = snapshot(db, "ProgressionTreeNodeUnlocks")
            old_ids = {r[0] for r in db.execute("SELECT ProgressionTreeNodeType FROM ProgressionTreeNodes")}
            for path in files:
                db.executescript(path.read_text(encoding="utf-8"))
            counts, budgets = Counter(), Counter()
            for tree, cost in db.execute("SELECT ProgressionTree,Cost FROM ProgressionTreeNodes"):
                counts[tree] += 1
                budgets[tree] += cost
            self.assertEqual(counts, Counter({tree: count * 3 for tree, count in old_counts.items()}), dlc)
            self.assertEqual(budgets, old_budgets)
            self.assertEqual(snapshot(db, "CivilizationItems"), old_items)
            self.assertTrue(old_unlocks <= snapshot(db, "ProgressionTreeNodeUnlocks"))
            self.assertTrue(old_ids <= {r[0] for r in db.execute("SELECT ProgressionTreeNodeType FROM ProgressionTreeNodes")})
            db.close()

    def test_cost_and_mastery_budgets_and_repeat_semantics(self):
        for key, (before, after) in self.samples.items():
            def budget(db):
                result = Counter()
                for r in native.research_nodes(db):
                    depth = max(1, db.execute("SELECT COALESCE(MAX(UnlockDepth),1) FROM ProgressionTreeNodeUnlocks "
                                             "WHERE ProgressionTreeNodeType=?", (r["ProgressionTreeNodeType"],)).fetchone()[0])
                    result[r["ProgressionTree"], "base"] += r["Cost"]
                    result[r["ProgressionTree"], "mastery"] += r["Cost"] * (depth - 1)
                    self.assertGreater(r["Cost"], 0)
                return result
            self.assertEqual(budget(before), budget(after), key)
            for original in native.research_nodes(before):
                new = dict(after.execute("SELECT * FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=?",
                                         (original["ProgressionTreeNodeType"],)).fetchone())
                for field in ("Repeatable", "RepeatableCostProgressionModel", "RepeatableCostProgressionParam1",
                              "StartingUnlockDepth", "CanBoost", "CanSteal", "CivInjectedIcon", "CivInjectedName"):
                    self.assertEqual(new[field], original[field], (key, original["Name"], field))
                if original["Repeatable"]:
                    self.assertEqual(new["Cost"], original["Cost"])
                    for count in (0, 1, 8, 100):
                        self.assertEqual(new["Cost"] + count * new["RepeatableCostProgressionParam1"],
                                         original["Cost"] + count * original["RepeatableCostProgressionParam1"])

    def test_original_unlocks_traits_art_and_tree_reveals_retained(self):
        for key, (before, after) in self.samples.items():
            self.assertTrue(snapshot(before, "ProgressionTreeNodeUnlocks") <= snapshot(after, "ProgressionTreeNodeUnlocks"), key)
            for table in ("ProgressionTrees", "Traits", "Civilizations", "CivilizationTraits", "TraitModifiers"):
                self.assertEqual(snapshot(before, table), snapshot(after, table), (key, table))
            self.assertTrue(snapshot(before, "ProgressionTreeNodeTraits") <= snapshot(after, "ProgressionTreeNodeTraits"))
            old_quotes = snapshot(before, "TypeQuotes")
            self.assertTrue(old_quotes <= snapshot(after, "TypeQuotes"))
            for old in native.research_nodes(before):
                new = after.execute("SELECT Name,Description,IconString FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=?",
                                    (old["ProgressionTreeNodeType"],)).fetchone()
                self.assertEqual(tuple(new), (old["Name"], old["Description"], old["IconString"]))

    def test_dag_and_original_order_including_or_choice_trees(self):
        for key, (before, after) in self.samples.items():
            old_nodes, old_edges, _ = graph(before)
            _, new_edges, _ = graph(after)
            for child, parent in old_edges:
                extension = "NODE_ANTHRO_EXP_" + parent.removeprefix("NODE_") + "_2"
                first = extension[:-1] + "1"
                if extension in self.plans and parent in old_nodes:
                    self.assertIn((first, parent), new_edges, key)
                    self.assertIn((extension, first), new_edges, key)
                    self.assertIn((child, extension), new_edges, key)
                    self.assertNotIn((child, parent), new_edges, key)
                else:
                    self.assertIn((child, parent), new_edges, key)
            for node, plan in self.plans.items():
                if plan["original"] not in old_nodes:
                    continue
                old_trait = before.execute("SELECT RequiredTraitType FROM ProgressionTreeNodeTraits WHERE ProgressionTreeNodeType=?",
                                           (plan["original"],)).fetchone()
                new_trait = after.execute("SELECT RequiredTraitType FROM ProgressionTreeNodeTraits WHERE ProgressionTreeNodeType=?",
                                          (node,)).fetchone()
                self.assertEqual(tuple(new_trait) if new_trait else None, tuple(old_trait) if old_trait else None)

    def test_new_unlocks_are_functional_valid_and_subject_scoped(self):
        for (age, dlc), (before, db) in self.samples.items():
            active = {r["ProgressionTreeNodeType"] for r in native.research_nodes(db) if r["AgeType"] == "AGE_" + age.upper()}
            for node in active & self.plans.keys():
                plan = self.plans[node]
                original_depth = max(1, before.execute("SELECT COALESCE(MAX(UnlockDepth),1) FROM ProgressionTreeNodeUnlocks "
                                                      "WHERE ProgressionTreeNodeType=?", (plan["original"],)).fetchone()[0])
                unlocks = list(db.execute("SELECT * FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=?", (node,)))
                self.assertTrue(unlocks, node)
                self.assertEqual(max(u["UnlockDepth"] for u in unlocks), original_depth)
                for policy in plan["policies"][:original_depth]:
                    row = db.execute("SELECT * FROM Traditions WHERE TraditionType=?", (policy,)).fetchone()
                    self.assertIsNotNone(row, policy)
                    self.assertEqual(row["CultureSlotType"], "POLICY_CULTURE_SLOT")
                    mods = list(db.execute("SELECT m.* FROM TraditionModifiers t JOIN Modifiers m ON m.ModifierId=t.ModifierId "
                                          "WHERE t.TraditionType=?", (policy,)))
                    self.assertEqual(len(mods), 1)
                    dynamic = db.execute("SELECT * FROM DynamicModifiers WHERE ModifierType=?", (mods[0]["ModifierType"],)).fetchone()
                    args = dict(db.execute("SELECT Name,Value FROM ModifierArguments WHERE ModifierId=?", (mods[0]["ModifierId"],)))
                    self.assertIn(dynamic["EffectType"], self.native_effects)
                    self.assertTrue(set(args) <= self.native_effects[dynamic["EffectType"]])
                    self.assertEqual(dynamic["CollectionType"], "COLLECTION_OWNER")
                    self.assertEqual(args["ConstructibleType"], plan["building"])
                    self.assertEqual(args["YieldType"], "YIELD_" + plan["yield"])
                    self.assertIsNotNone(db.execute("SELECT 1 FROM Constructibles WHERE ConstructibleType=?",
                                                   (args["ConstructibleType"],)).fetchone(), (age, node, args))
                    self.assertIsNotNone(db.execute("SELECT 1 FROM Yields WHERE YieldType=?", (args["YieldType"],)).fetchone())
                    self.assertIn(int(args["Amount"]), (2, 3))
                for policy, previous in zip(plan["policies"][1:original_depth], plan["policies"]):
                    self.assertEqual(db.execute("SELECT ObsoletesTraditionType FROM Traditions WHERE TraditionType=?",
                                                (policy,)).fetchone()[0], previous)
                sibling = node[:-1] + ("2" if node.endswith("1") else "1")
                self.assertNotEqual(plan["yield"], self.plans[sibling]["yield"])

    def test_age_local_units_and_buildings_not_cosmetic_clones(self):
        for (age, _), (before, db) in self.samples.items():
            for model in INVENTORY["models"]:
                table, field = ("Units", "UnitType") if model["kind"] == "unit" else ("Constructibles", "ConstructibleType")
                target = model["target"]
                row = db.execute(f"SELECT * FROM {table} WHERE {field}=?", (target,)).fetchone()
                if model["age"] != age:
                    self.assertIsNone(row, target)
                    continue
                self.assertIsNotNone(row, target)
                self.assertIsNotNone(db.execute("SELECT 1 FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=? AND TargetType=?",
                                               (model["node"], target)).fetchone())
                if model["kind"] == "unit":
                    donor = before.execute("SELECT * FROM Units WHERE UnitType=?", (model["donor"],)).fetchone()
                    self.assertEqual(row["BaseMoves"], donor["BaseMoves"] + 1)
                    self.assertTrue(row["CanTrain"] and row["CanPurchase"])
                    self.assertIsNone(row["TraitType"])
                    for stat in ("Combat", "RangedCombat", "Bombard"):
                        original = before.execute("SELECT " + stat + " FROM Unit_Stats WHERE UnitType=?", (model["donor"],)).fetchone()[0]
                        expanded = db.execute("SELECT " + stat + " FROM Unit_Stats WHERE UnitType=?", (target,)).fetchone()[0]
                        self.assertEqual(expanded, max(1, original - 2) if original > 0 else original)
                    self.assertFalse(db.execute("SELECT 1 FROM UnitReplaces WHERE CivUniqueUnitType=?", (target,)).fetchone())
                    upgrades = {r[0] for r in before.execute("SELECT UpgradeUnit FROM UnitUpgrades WHERE Unit=?", (model["donor"],))}
                    self.assertEqual(upgrades, {r[0] for r in db.execute("SELECT UpgradeUnit FROM UnitUpgrades WHERE Unit=?", (target,))})
                else:
                    self.assertTrue(row["RequiresUnlock"])
                    self.assertEqual(row["Age"], "AGE_" + age.upper())
                    self.assertFalse(row["RequiresDistantLands"] or row["RequiresHomeland"] or row["AdjacentRiver"])
                    self.assertEqual(dict(db.execute("SELECT YieldType,YieldChange FROM Constructible_YieldChanges WHERE ConstructibleType=?",
                                                     (target,))), {"YIELD_" + k: v for k, v in model["yields"].items()})
                    self.assertEqual({r[0] for r in db.execute("SELECT DistrictType FROM Constructible_ValidDistricts WHERE ConstructibleType=?", (target,))},
                                     {"DISTRICT_CITY_CENTER", "DISTRICT_URBAN"})
            for table, prefix in (("Units", "UNIT_"), ("Constructibles", "BUILDING_"), ("UnitUpgrades", "")):
                original = snapshot(before, table)
                self.assertTrue(original <= snapshot(db, table), (age, table, prefix))

    def test_localisation_original_art_and_narration_inventory(self):
        rows = ET.parse(MOD / "text" / "en_us" / "ProgressionExpansion.xml").getroot().findall("EnglishText/Row")
        self.assertEqual(len(rows), len(TEXTS), "duplicate localisation keys")
        narration = importlib.import_module("build-narration")
        scripts, dynamic = narration.scripts()
        tags = {r["tag"] for r in scripts}
        self.assertFalse(set(TEXTS) & set(dynamic))
        icons = {r.get("ID"): r.get("Path") for r in ET.parse(MOD / "data" / "progression-icons.xml").getroot().findall("IconDefinitions/Row")}
        imports = {r.text for r in MANIFEST.findall(".//m:ImportFiles/m:Item", NS)}
        for scope in ("game", "shell"):
            mounted = {r.text for g in MANIFEST.findall("m:ActionGroups/m:ActionGroup", NS)
                       if g.get("scope") == scope and g.get("id", "").startswith("progression-")
                       for r in g.findall("m:Actions/m:ImportFiles/m:Item", NS)}
            self.assertTrue({p.removeprefix("fs://game/anthroprocenia/") for p in icons.values()} <= mounted, scope)
        for identifier, path in icons.items():
            self.assertTrue(path.startswith("fs://game/anthroprocenia/"), identifier)
            relative = path.removeprefix("fs://game/anthroprocenia/")
            self.assertIn(relative, imports)
            with Image.open(MOD / relative) as image:
                self.assertEqual(image.mode, "RGBA")
                self.assertGreater(image.getchannel("A").getextrema()[1], 0)
                self.assertEqual(image.getchannel("A").getextrema()[0], 0)
                extrema = image.convert("RGB").getextrema()
                self.assertTrue(all(high == 255 for _, high in extrema))
                rgb = image.convert("RGB")
                self.assertEqual(rgb.getchannel("R").tobytes(), rgb.getchannel("G").tobytes())
                self.assertEqual(rgb.getchannel("R").tobytes(), rgb.getchannel("B").tobytes())
        native_ids = {r["ID"] for r in self.native_icons}
        for remap in ET.parse(MOD / "data" / "progression-remaps.xml").getroot().findall("VisualRemaps/Row"):
            self.assertIn(remap.get("From"), native_ids, remap.attrib)
            self.assertIn(remap.get("To"), icons)
            self.assertIn(remap.get("DisplayName"), TEXTS)
        all_new = list(self.plans) + [r["target"] for r in INVENTORY["models"]]
        for identifier in all_new:
            for suffix in ("NAME", "DESCRIPTION"):
                self.assertIn("LOC_" + identifier + "_" + suffix, TEXTS)
                self.assertTrue(TEXTS["LOC_" + identifier + "_" + suffix].strip())
            self.assertIn("LOC_" + identifier + "_DESCRIPTION", tags)
            self.assertIn("LOC_PEDIA_" + identifier + "_HISTORY", tags)
            self.assertIn(identifier, icons)
        for (_, _), (_, db) in self.samples.items():
            audio_ids = []
            for node_row in db.execute("SELECT ProgressionTreeNodeType,Name,Description FROM ProgressionTreeNodes "
                                       "WHERE ProgressionTreeNodeType LIKE 'NODE_ANTHRO_%'"):
                node, name, description = node_row
                quote = db.execute("SELECT * FROM TypeQuotes WHERE Type=?", (node,)).fetchone()
                self.assertIsNotNone(quote, node)
                self.assertTrue(quote["QuoteAudio"].startswith("VO_ANTHRO_"))
                if node in self.plans:
                    self.assertIn(quote["Quote"], TEXTS)
                    self.assertIn(quote["QuoteAuthor"], TEXTS)
                else:
                    self.assertEqual(quote["Quote"], description)
                    self.assertIsNone(quote["QuoteAuthor"])
                audio_ids.append(quote["QuoteAudio"])
                self.assertEqual(name.removesuffix("_NAME") + "_DESCRIPTION", description)
                self.assertIn(description, tags)
            self.assertEqual(len(audio_ids), len(set(audio_ids)))

    def test_load_reexecution_and_save_identifier_compatibility(self):
        for (age, _), (before, db) in self.samples.items():
            tables = ("ProgressionTreeNodes", "ProgressionTreePrereqs", "ProgressionTreeNodeUnlocks",
                      "Types", "TypeQuotes", "Traditions", "Modifiers", "ModifierArguments", "Units", "Constructibles")
            saved = {t: snapshot(db, t) for t in tables}
            expand(db, age)
            self.assertEqual(saved, {t: snapshot(db, t) for t in tables}, age)
            # Existing saves/replays refer to stable type IDs, not display names.
            original_ids = {r["ProgressionTreeNodeType"] for r in native.research_nodes(before)}
            persisted = json.loads(json.dumps({"completed": sorted(original_ids), "depth": 1}))
            self.assertTrue(set(persisted["completed"]) <= {r[0] for r in db.execute("SELECT ProgressionTreeNodeType FROM ProgressionTreeNodes")})
            for model in INVENTORY["models"]:
                if model["age"] == age:
                    self.assertIsNotNone(db.execute("SELECT 1 FROM Types WHERE Type=?", (model["target"],)).fetchone())

    def test_no_new_foreign_key_errors(self):
        for key, (before, db) in self.samples.items():
            # Some installed cross-Age XML references unloaded Ages; GameEffects are engine-expanded.
            # Compare the missing target VALUES, not row counts, for precisely the changed tables.
            def missing(db, table):
                fields = {r[0]: r[3] for r in db.execute(f"PRAGMA foreign_key_list({table})")}
                result = set()
                for _, rowid, parent, fk in db.execute(f"PRAGMA foreign_key_check({table})"):
                    value = db.execute(f'SELECT "{fields[fk]}" FROM "{table}" WHERE rowid=?', (rowid,)).fetchone()[0]
                    result.add((parent, fields[fk], value))
                return result
            for table in ("ProgressionTreeNodes", "ProgressionTreeNodeUnlocks", "ProgressionTreePrereqs",
                          "ProgressionTreeNodeTraits", "Traditions", "TraditionModifiers", "Modifiers",
                          "DynamicModifiers", "ModifierArguments", "TypeQuotes", "Constructibles", "Units",
                          "Constructible_YieldChanges", "Constructible_ValidDistricts", "Unit_Stats", "Unit_Costs"):
                introduced = missing(db, table) - missing(before, table)
                if table == "DynamicModifiers":
                    introduced = {r for r in introduced if not (r[1] == "EffectType" and r[2] in self.native_effects)}
                self.assertFalse(introduced, (key, table, introduced))


if __name__ == "__main__":
    unittest.main(verbosity=2)
