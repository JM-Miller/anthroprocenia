"""Generate research expansion against installed data, without modifying native assets."""
import argparse
from collections import defaultdict
import importlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

native = importlib.import_module("progression-native")
content = importlib.import_module("progression-content")
MOD, ROOT = native.MOD, native.ROOT


def q(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert(table, values, gate=None):
    tail = "VALUES (" + ",".join(map(q, values.values())) + ")"
    if gate:
        node, depth = gate if isinstance(gate, tuple) else (gate, 1)
        tail = "SELECT " + ",".join(map(q, values.values())) + \
               " WHERE EXISTS (SELECT 1 FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=" + q(node) + ")"
        if depth > 1:
            tail += " AND EXISTS (SELECT 1 FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=" + \
                    q(node) + " AND UnlockDepth>=" + str(depth) + ")"
    return f'INSERT OR IGNORE INTO "{table}" ({",".join(values)}) {tail};'


def xml_write(path, root):
    ET.indent(root, space="  ")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<?xml version="1.0" encoding="utf-8"?>\n' +
                    ET.tostring(root, encoding="unicode") + "\n", encoding="utf-8")


def xml_row(root, table, **attrs):
    parent = root.find(table)
    if parent is None:
        parent = ET.SubElement(root, table)
    return ET.SubElement(parent, "Row", {k: str(v) for k, v in attrs.items()})


def draw_icon(path, motif, variant):
    """Original white symbols drawn from geometry; no borrowed illustration or font."""
    image = Image.new("RGBA", (256, 256))
    d = ImageDraw.Draw(image)
    white = (255, 255, 255, 255)
    def line(points, width=10):
        d.line(points, fill=white, width=width, joint="curve")
    def oval(box, width=9):
        d.ellipse(box, outline=white, width=width)
    if motif == "grain":
        line([(128, 212), (128, 46)])
        for y in (76, 112, 148):
            d.polygon([(125, y + 24), (84, y + 2), (83, y - 23), (119, y - 2)], fill=white)
            d.polygon([(131, y + 24), (172, y + 2), (173, y - 23), (137, y - 2)], fill=white)
    elif motif == "kiln":
        line([(53, 205), (53, 107), (76, 58), (180, 58), (203, 107), (203, 205), (53, 205)])
        line([(100, 205), (100, 155), (128, 134), (156, 155), (156, 205)])
        line([(70, 107), (185, 107)])
    elif motif == "sail":
        d.polygon([(39, 181), (217, 181), (186, 209), (69, 209)], fill=white)
        line([(126, 180), (126, 39)])
        d.polygon([(113, 49), (58, 163), (113, 163)], fill=white)
        d.polygon([(140, 62), (196, 163), (140, 163)], fill=white)
    elif motif == "book":
        line([(128, 209), (128, 59)])
        line([(128, 65), (53, 48), (53, 190), (128, 209), (203, 190), (203, 48), (128, 65)])
        for y in (92, 123, 154):
            line([(69, y), (112, y + 10)], 6)
            line([(144, y + 10), (187, y)], 6)
    elif motif == "water":
        line([(65, 58), (191, 58), (191, 105), (65, 105), (65, 58)])
        line([(128, 38), (128, 138)])
        for y in (151, 180, 209):
            line([(39, y), (69, y - 12), (99, y), (129, y - 12), (159, y), (189, y - 12), (219, y)], 8)
    elif motif == "arch":
        line([(51, 211), (51, 97), (77, 57), (128, 39), (179, 57), (205, 97), (205, 211)])
        line([(89, 211), (89, 111), (105, 88), (128, 81), (151, 88), (167, 111), (167, 211)])
        for y in (139, 178):
            line([(53, y), (86, y)], 7)
            line([(170, y), (202, y)], 7)
    elif motif == "coin":
        oval((50, 50, 206, 206), 12)
        oval((69, 69, 187, 187), 5)
        line([(104, 90), (153, 90), (153, 127), (104, 127), (104, 163), (153, 163)])
    elif motif == "wheel":
        oval((49, 49, 207, 207), 12)
        oval((109, 109, 147, 147))
        for p in ((128, 51), (128, 205), (51, 128), (205, 128), (73, 73), (183, 183), (73, 183), (183, 73)):
            line([(128, 128), p], 8)
    elif motif == "shield":
        line([(128, 35), (201, 62), (192, 151), (163, 193), (128, 221),
              (93, 193), (64, 151), (55, 62), (128, 35)])
        line([(128, 60), (128, 190)])
        line([(85, 122), (171, 122)])
    elif motif == "scales":
        line([(128, 43), (128, 211), (83, 211), (173, 211)])
        line([(52, 82), (204, 82)])
        for x in (72, 184):
            line([(x, 82), (x - 28, 143), (x + 28, 143), (x, 82)], 7)
            d.arc((x - 29, 120, x + 29, 167), 0, 180, fill=white, width=8)
    elif motif == "council":
        for x, y in ((128, 69), (69, 121), (187, 121)):
            oval((x - 17, y - 17, x + 17, y + 17))
            line([(x - 26, y + 48), (x - 19, y + 27), (x + 19, y + 27), (x + 26, y + 48)])
        line([(69, 208), (128, 166), (187, 208)])
    elif motif in ("compass", "sun"):
        oval((63, 63, 193, 193))
        if motif == "compass":
            d.polygon([(143, 70), (147, 139), (111, 186), (109, 116)], fill=white)
        else:
            oval((99, 99, 157, 157))
        for a, b in [((128, 27), (128, 51)), ((128, 205), (128, 229)),
                     ((27, 128), (51, 128)), ((205, 128), (229, 128))]:
            line([a, b], 8)
    elif motif == "circuit":
        line([(83, 83), (173, 83), (173, 173), (83, 173), (83, 83)])
        for x in (102, 128, 154):
            for y1, y2 in ((47, 82), (174, 209)):
                line([(x, y1), (x, y2)], 7)
                line([(y1, x), (y2, x)], 7)
        line([(108, 147), (108, 109), (147, 109), (147, 147)], 7)
    elif motif == "signal":
        line([(128, 103), (128, 211), (96, 211), (160, 211)])
        oval((116, 85, 140, 109), 8)
        for box in ((82, 55, 174, 147), (48, 22, 208, 182)):
            d.arc(box, 210, 330, fill=white, width=9)
            d.arc(box, 30, 150, fill=white, width=9)
    elif motif == "wing":
        d.polygon([(128, 40), (140, 113), (221, 153), (219, 171), (141, 149),
                   (140, 197), (168, 212), (128, 207), (88, 212), (116, 197),
                   (115, 149), (37, 171), (35, 153), (116, 113)], fill=white)
    elif motif == "rocket":
        line([(102, 169), (102, 77), (128, 36), (154, 77), (154, 169), (102, 169)])
        d.polygon([(102, 116), (71, 171), (102, 157)], fill=white)
        d.polygon([(154, 116), (185, 171), (154, 157)], fill=white)
        line([(111, 181), (128, 222), (145, 181)])
        oval((115, 82, 141, 108), 6)
    elif motif == "atom":
        for angle in (0, 60, 120):
            layer = Image.new("RGBA", image.size)
            ImageDraw.Draw(layer).ellipse((39, 95, 217, 161), outline=white, width=8)
            image.alpha_composite(layer.rotate(angle))
        ImageDraw.Draw(image).ellipse((115, 115, 141, 141), fill=white)
        d = ImageDraw.Draw(image)
    else:
        raise ValueError(motif)
    if variant == 2:
        d.polygon([(210, 25), (219, 43), (238, 47), (223, 61), (226, 81),
                   (208, 72), (189, 81), (193, 61), (178, 47), (200, 43)], fill=white)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def generate(base):
    db = native.database(base)
    frontend = native.frontend_database(base)
    frontend_columns = {table: {r[1] for r in frontend.execute(f"PRAGMA table_info({table})")}
                        for table in ("ProgressionTreeNodes", "ProgressionTreeNodeUnlocks", "Traditions")}
    originals = native.research_nodes(db)
    texts = {}
    for folder in [base / "modules", base.parent / "DLC", MOD]:
        for path in sorted(folder.rglob("*.xml")):
            if "en_us" not in path.parts:
                continue
            for r in ET.parse(path).getroot().findall("EnglishText/Row"):
                if r.get("Tag") and r.find("Text") is not None:
                    texts[r.get("Tag")] = "".join(r.find("Text").itertext())
    authored, icons, remaps = (ET.Element("Database") for _ in range(3))
    out = ["-- Generated by tools/build-progression.py. Original IDs and unlocks remain intact."]
    shell_out = ["-- Generated research-node and policy previews for registered frontend trees."]
    age_out = {a: ["-- Generated age-local trainable units and constructible buildings."] for a in native.AGES}
    models, plans = [], []
    icon_ids = set()

    def loc(key, text):
        xml_row(authored, "EnglishText", Tag=key)
        ET.SubElement(authored.find("EnglishText")[-1], "Text").text = text
        return key

    def kind(target, kind_name, gate=None, output=out):
        output.append(insert("Types", {"Type": target, "Kind": "KIND_" + kind_name}, gate))

    def art(target, motif, variant=1, donor=None, art_kind=None):
        if target not in icon_ids:
            image = f"art/progression/{motif}-{variant}.png"
            draw_icon(MOD / image, motif, variant)
            xml_row(icons, "IconDefinitions", ID=target, Path="fs://game/anthroprocenia/" + image)
            icon_ids.add(target)
        if donor:
            xml_row(remaps, "VisualRemaps", ID="REMAP_" + target, DisplayName="LOC_" + target + "_NAME",
                    Kind=art_kind, From=donor, To=target)

    def modifier(target, yield_name, building, amount, description, gate):
        kind(target + "_TYPE", "MODIFIER", gate)
        out.extend([
            insert("DynamicModifiers", {"ModifierType": target + "_TYPE", "CollectionType": "COLLECTION_OWNER",
                                         "EffectType": "EFFECT_PLAYER_ADJUST_CONSTRUCTIBLE_YIELD"}, gate),
            insert("Modifiers", {"ModifierId": target, "ModifierType": target + "_TYPE"}, gate),
        ])
        for name, value in {"ConstructibleType": building, "YieldType": "YIELD_" + yield_name,
                            "Amount": amount}.items():
            out.append(insert("ModifierArguments", {"ModifierId": target, "Name": name, "Value": str(value)}, gate))
        tag = loc("LOC_" + target + "_DESCRIPTION", description)
        for context in ("Description", "Preview"):
            out.append(insert("ModifierStrings", {"ModifierId": target, "Context": context, "Text": tag}, gate))

    depths = {r["ProgressionTreeNodeType"]: max(1, db.execute(
        "SELECT COALESCE(MAX(UnlockDepth),1) FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=?",
        (r["ProgressionTreeNodeType"],)).fetchone()[0]) for r in originals}
    allocations = {}
    buckets = defaultdict(list)
    for r in originals:
        node, cost = r["ProgressionTreeNodeType"], r["Cost"]
        allocations[node] = [cost, 1, 1] if r["Repeatable"] else [
            max(1, cost - 2 * (cost // 3)), max(1, cost // 3), max(1, cost // 3)]
        buckets[r["ProgressionTree"], depths[node]].append(r)
    for rows in buckets.values():
        debt = sum(sum(allocations[r["ProgressionTreeNodeType"]]) - r["Cost"] for r in rows)
        for r in sorted(rows, key=lambda r: (-r["Cost"], r["ProgressionTreeNodeType"])):
            if r["Repeatable"]:
                continue
            costs = allocations[r["ProgressionTreeNodeType"]]
            for i in (2, 1, 0):
                payment = min(debt, costs[i] - 1)
                costs[i] -= payment
                debt -= payment
        if debt:
            raise ValueError(f"Cannot preserve depth-specific budget: {rows[0]['ProgressionTree']} debt={debt}")

    fallback_buildings = {
        "antiquity": dict(zip(content.DOMAINS, ("BUILDING_GRANARY", "BUILDING_BLACKSMITH", "BUILDING_MARKET",
                                               "BUILDING_LIBRARY", "BUILDING_AMPHITHEATER", "BUILDING_BATH"))),
        "exploration": dict(zip(content.DOMAINS, ("BUILDING_HOSPITAL", "BUILDING_GUILDHALL", "BUILDING_BANK",
                                                 "BUILDING_UNIVERSITY", "BUILDING_PAVILION", "BUILDING_TAVERN"))),
        "modern": dict(zip(content.DOMAINS, ("BUILDING_CANNERY", "BUILDING_FACTORY", "BUILDING_STOCK_EXCHANGE",
                                            "BUILDING_LABORATORY", "BUILDING_MUSEUM", "BUILDING_CITY_PARK"))),
    }
    kits = {}
    civs = {}
    for suffix in ("", *("-" + a + "-additions" for a in native.AGES)):
        kits.update(json.loads((ROOT / "tools" / f"civilization-kits{suffix}.json").read_text(encoding="utf-8")))
        for civ in json.loads((ROOT / "tools" / f"civilizations{suffix}.json").read_text(encoding="utf-8")):
            civs[civ["key"]] = civ

    def details(r):
        node, tree = r["ProgressionTreeNodeType"], r["ProgressionTree"]
        title = texts.get(r["Name"], r["Name"].removeprefix("LOC_").removesuffix("_NAME").replace("_", " ").title())
        title = re.sub(r"\[.*?\]|\{.*?\}", "", title).strip()
        age = r["AgeType"].removeprefix("AGE_").lower()
        if tree.startswith("TREE_ANTHRO_"):
            key = tree.removeprefix("TREE_ANTHRO_")
            spec = kits[key]["civics"][int(node.rsplit("_", 1)[1]) - 1][2][0]
            yield_name = spec[1] if len(spec) > 1 and spec[1] in content.DOMAINS else "PRODUCTION"
            domain = content.DOMAINS[yield_name]
            profile = {"first": domain[0], "second": domain[1],
                       "history": domain[2], "yield": yield_name, "motif": domain[3]}
            history = kits[key].get("civicHistory", [])
            if history:
                profile["history"] = history[int(node.rsplit("_", 1)[1]) - 1]
            context = civs[key]["name"] + " institutions"
            building = "BUILDING_ANTHRO_" + key + "_" + str(1 + (int(node.rsplit("_", 1)[1]) % 2))
            return title, profile, context, building
        suffix = node.split("_MAIN_", 1)[-1] if "_MAIN_" in node else (
            node.split("_BRANCH_", 1)[-1] if "_BRANCH_" in node else node.split("_", 3)[-1])
        if r["SystemType"] == "SYSTEM_TECH":
            suffix = node.split("_", 3)[-1]
        if suffix in content.SUBJECTS:
            return title, content.SUBJECTS[suffix], None, fallback_buildings[age][content.SUBJECTS[suffix]["yield"]]
        key = next((key for key in sorted(content.CONTEXTS, key=len, reverse=True)
                    if "_" + key + "_" in node or tree.endswith("_" + key)), None)
        if not key:
            raise ValueError(f"Missing civilization context for {node}")
        first, second, context = content.CONTEXTS[key]
        unlocks = [dict(u) for u in db.execute(
            "SELECT * FROM ProgressionTreeNodeUnlocks WHERE ProgressionTreeNodeType=?", (node,))]
        search = (title + " " + " ".join(u["TargetType"] for u in unlocks)).upper()
        domains = [
            ("FOOD", ("HARVEST", "FARM", "GRAIN", "RAIN", "HAPI", "FERTIL", "WATER", "GARDEN")),
            ("SCIENCE", ("SCIENCE", "SCHOLAR", "LEARN", "BOOK", "CALENDAR", "PRINT", "REN", "ZHI", "STUDY")),
            ("GOLD", ("GOLD", "TRADE", "MERCHANT", "PORT", "MARKET", "TAX", "REVENUE", "PERIPLUS", "CARAVAN")),
            ("PRODUCTION", ("MILITARY", "ARMY", "WAR", "SPADA", "AGOGE", "EXERCITUS", "SPEAR", "HORSE", "WORK", "FORGE")),
            ("HAPPINESS", ("HAPPINESS", "LAW", "CITIZEN", "JUSTICE", "PIETY", "LI", "PEACE")),
        ]
        yield_name = next((y for y, words in domains if any(re.search(r"\b" + word, search) for word in words)), "CULTURE")
        building = next((u["TargetType"] for u in unlocks if u["TargetKind"] == "KIND_CONSTRUCTIBLE"
                         and u["TargetType"].startswith("BUILDING_")), fallback_buildings[age][yield_name])
        return title, {"first": first, "second": second, "history": content.DOMAINS[yield_name][2],
                       "yield": yield_name, "motif": content.DOMAINS[yield_name][3]}, context, building

    for r in originals:
        original, tree = r["ProgressionTreeNodeType"], r["ProgressionTree"]
        if original.startswith("NODE_ANTHRO_"):
            description = r["Name"].removesuffix("_NAME") + "_DESCRIPTION"
            if description != r["Description"] or not texts.get(description):
                raise ValueError(f"Missing original authored narration description for {original}")
            out.append(insert("TypeQuotes", {
                "Type": original, "Quote": description,
                "QuoteAudio": "VO_ANTHRO_ORIGINAL_" + original.removeprefix("NODE_ANTHRO_"),
            }, original))
        preview_original = frontend.execute(
            "SELECT ProgressionTreeNodeType FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType=? "
            "OR (Name=? AND ProgressionTree=?) ORDER BY ProgressionTreeNodeType=? DESC LIMIT 1",
            (original, r["Name"], tree, original)).fetchone()
        preview_original = preview_original[0] if preview_original else original
        title, profile, context, building = details(r)
        age = r["AgeType"].removeprefix("AGE_").lower()
        traits = [dict(t) for t in db.execute(
            "SELECT * FROM ProgressionTreeNodeTraits WHERE ProgressionTreeNodeType=?", (original,))]
        trait = traits[0]["RequiredTraitType"] if traits else None
        children = ["NODE_ANTHRO_EXP_" + original.removeprefix("NODE_") + "_" + str(i) for i in (1, 2)]
        columns = [c[1] for c in db.execute("PRAGMA table_info(ProgressionTreeNodes)")]
        costs = allocations[original]
        out.append(f"UPDATE ProgressionTreeNodes SET Cost={costs[0]} WHERE ProgressionTreeNodeType={q(original)};")
        shell_out.append(f"UPDATE ProgressionTreeNodes SET Cost={costs[0]} WHERE ProgressionTreeNodeType={q(preview_original)};")
        for i, child in enumerate(children, 1):
            label = profile["first" if i == 1 else "second"]
            yield_name = profile["yield"] if i == 1 else {
                "FOOD": "HAPPINESS", "PRODUCTION": "GOLD", "GOLD": "CULTURE",
                "SCIENCE": "PRODUCTION", "CULTURE": "HAPPINESS", "HAPPINESS": "FOOD",
            }[profile["yield"]]
            name = label if context is None else title + ": " + label
            key = loc("LOC_" + child + "_NAME", name)
            building_name = texts.get("LOC_" + building + "_NAME", building.replace("BUILDING_", "").replace("_", " ").title())
            benefit = f"Unlocks the {name} Policy: +2 [icon:YIELD_{yield_name}] {yield_name.title()} from {building_name} while slotted."
            history = profile["history"]
            if context:
                history = f"{title} is examined through {context}. " + history
                history += " " + ({
                    "FOOD": "Harvest obligations spread the burden of scarcity beyond a single household.",
                    "PRODUCTION": "Recorded commissions link skilled work to the exchange that sustains its workshops.",
                    "GOLD": "Merchants' shared customs become part of a community's public identity.",
                    "SCIENCE": "Methods preserved in records can be put to work by builders and craftspeople.",
                    "CULTURE": "Public patronage gives shared memory a place in everyday community life.",
                    "HAPPINESS": "Agreed responsibilities help communities maintain their food reserves.",
                }[profile["yield"]] if i == 2 else content.DOMAINS[profile["yield"]][2])
            elif "histories" in profile:
                history = profile["histories"][i - 1]
            elif " and " in history:
                first, second = history.split(" and ", 1)
                history = (first.rstrip(".") + ".") if i == 1 else second[0].upper() + second[1:]
            description = loc("LOC_" + child + "_DESCRIPTION", history + " " + benefit)
            values = {c: r[c] for c in columns}
            values.update(ProgressionTreeNodeType=child, Name=key, Description=description, Cost=costs[i],
                          IconString=child, Repeatable=0, RepeatableCostProgressionModel="NO_PROGRESSION_MODEL",
                          RepeatableCostProgressionParam1=0, StartingUnlockDepth=-1,
                          CivInjectedName=None, CivInjectedIcon=0)
            values["UILayoutColumn"] = None if r["UILayoutColumn"] is None else 3 * r["UILayoutColumn"] + i
            values["UILayoutRow"] = r["UILayoutRow"]
            kind(child, "TREE_NODE", original)
            out.append(insert("ProgressionTreeNodes", values, original))
            shell_out.append(insert("ProgressionTreeNodes", {k: v for k, v in values.items()
                                                             if k in frontend_columns["ProgressionTreeNodes"]}, preview_original))
            for t in traits:
                out.append(insert("ProgressionTreeNodeTraits", {**t, "ProgressionTreeNodeType": child}, original))
            out.append(insert("ProgressionTreePrereqs", {"Node": child, "PrereqNode": original if i == 1 else children[0]}, original))
            art(child, profile["motif"], i)
            loc("LOC_PEDIA_" + child + "_HISTORY", history)
            quote = loc("LOC_" + child + "_QUOTE", [
                "A method becomes an inheritance when its workings can be taught.",
                "Let public duty be measured by what it preserves, not by what it proclaims.",
            ][i - 1])
            out.append(insert("TypeQuotes", {"Type": child, "Quote": quote,
                                             "QuoteAuthor": loc("LOC_" + child + "_QUOTE_AUTHOR", "Anthroprocenia"),
                                             "QuoteAudio": "VO_ANTHRO_" + child.removeprefix("NODE_")}, original))
            policy_ids = []
            for depth in range(1, depths[original] + 1):
                policy_gate = (original, depth)
                preview_gate = (preview_original, depth)
                policy = "TRADITION_ANTHRO_EXP_" + child.removeprefix("NODE_ANTHRO_EXP_") + "_" + str(depth)
                policy_name = name + (" — Refined Practice" if depth > 1 else "")
                policy_desc = f"+{depth + 1} [icon:YIELD_{yield_name}] {yield_name.title()} from {building_name} while this Policy is slotted."
                kind(policy, "TRADITION", policy_gate)
                tradition_values = {
                    "TraditionType": policy, "AgeType": r["AgeType"], "CultureSlotType": "POLICY_CULTURE_SLOT",
                    "TraitType": trait, "Name": loc("LOC_" + policy + "_NAME", policy_name),
                    "Description": loc("LOC_" + policy + "_DESCRIPTION", policy_desc),
                    "ObsoletesTraditionType": policy_ids[-1] if policy_ids else None,
                }
                out.append(insert("Traditions", tradition_values, policy_gate))
                shell_out.append(insert("Traditions", {k: v for k, v in tradition_values.items()
                                                       if k in frontend_columns["Traditions"]}, preview_gate))
                modifier_id = "MOD_" + policy
                modifier(modifier_id, yield_name, building, depth + 1, policy_desc, policy_gate)
                out.append(insert("TraditionModifiers", {"TraditionType": policy, "ModifierId": modifier_id}, policy_gate))
                unlock_values = {
                    "ProgressionTreeNodeType": child, "TargetType": policy, "TargetKind": "KIND_TRADITION",
                    "UnlockDepth": depth, "RequiredTraitType": trait, "IconString": child,
                }
                out.append(insert("ProgressionTreeNodeUnlocks", unlock_values, policy_gate))
                shell_out.append(insert("ProgressionTreeNodeUnlocks", unlock_values, preview_gate))
                policy_ids.append(policy)
                art(policy, profile["motif"], i)
            plans.append({"original": original, "node": child, "tree": tree, "age": age,
                          "cost": costs[i], "name": name, "depth": depths[original],
                          "building": building, "yield": yield_name, "policies": policy_ids})
        if r["UILayoutColumn"] is not None:
            out.append(f"UPDATE ProgressionTreeNodes SET UILayoutColumn={3 * r['UILayoutColumn']} WHERE ProgressionTreeNodeType={q(original)};")
            shell_out.append(f"UPDATE ProgressionTreeNodes SET UILayoutColumn={3 * r['UILayoutColumn']} "
                             f"WHERE ProgressionTreeNodeType={q(preview_original)};")
        successors = [edge[0] for edge in db.execute("SELECT Node FROM ProgressionTreePrereqs WHERE PrereqNode=?", (original,))]
        for successor in successors:
            out.append(f"DELETE FROM ProgressionTreePrereqs WHERE Node={q(successor)} AND PrereqNode={q(original)} "
                       f"AND EXISTS(SELECT 1 FROM ProgressionTreeNodes WHERE ProgressionTreeNodeType={q(children[1])});")
            out.append(insert("ProgressionTreePrereqs", {"Node": successor, "PrereqNode": children[1]}, original))

    def clone(output, table, key, donor, overrides):
        rows = [dict(r) for r in db.execute(f'SELECT * FROM "{table}" WHERE "{key}"=?', (donor,))]
        for r in rows:
            output.append(insert(table, {**r, **overrides}))
        return rows

    for age in native.AGES:
        output = age_out[age]
        prefix = {"antiquity": "AQ", "exploration": "EX", "modern": "MO"}[age]
        for key, name, donor_key, subject, stage, yields, history in content.BUILDINGS[age]:
            target, donor = "BUILDING_ANTHRO_RESEARCH_" + key, "BUILDING_" + donor_key
            node = f"NODE_ANTHRO_EXP_TECH_{prefix}_{subject}_{stage}"
            desc = history + " " + "; ".join(f"+{amount} [icon:YIELD_{y}] {y.title()}" for y, amount in yields.items()) + "."
            kind(target, "CONSTRUCTIBLE", output=output)
            donor_rows = clone(output, "Constructibles", "ConstructibleType", donor, {
                "ConstructibleType": target, "Name": loc("LOC_" + target + "_NAME", name),
                "Description": loc("LOC_" + target + "_DESCRIPTION", desc),
                "Tooltip": "LOC_" + target + "_DESCRIPTION", "RequiresUnlock": 1,
                "Age": "AGE_" + age.upper(), "Cost": {"antiquity": 125, "exploration": 300, "modern": 620}[age],
                "AdjacentRiver": 0, "AdjacentLake": 0, "AdjacentDistrict": None, "AdjacentTerrain": None,
                "RequiresDistantLands": 0, "RequiresHomeland": 0, "RequiresAppealPlacement": 0,
            })
            if not donor_rows:
                raise ValueError(donor)
            output.append(insert("Buildings", {"ConstructibleType": target, "TraitType": None, "PurchaseYield": "YIELD_GOLD"}))
            for district in ("DISTRICT_CITY_CENTER", "DISTRICT_URBAN"):
                output.append(insert("Constructible_ValidDistricts", {"ConstructibleType": target, "DistrictType": district}))
            for y, amount in yields.items():
                output.append(insert("Constructible_YieldChanges", {"ConstructibleType": target, "YieldType": "YIELD_" + y, "YieldChange": amount}))
                output.append(insert("TypeTags", {"Type": target, "Tag": y}))
            output.append(insert("ProgressionTreeNodeUnlocks", {"ProgressionTreeNodeType": node, "TargetType": target, "TargetKind": "KIND_CONSTRUCTIBLE"}))
            out.append(insert("CivilopediaPageChapterParagraphs", {"ChapterID": "HISTORY", "PageID": target, "SectionID": "BUILDINGS",
                                                                  "Paragraph": loc("LOC_PEDIA_" + target + "_HISTORY", history)}, node))
            art(target, content.SUBJECTS[subject]["motif"], stage, donor, "BUILDING")
            models.append({"age": age, "target": target, "donor": donor, "node": node, "kind": "building", "yields": yields})
        for key, name, donor_key, subject, stage, motif in content.UNITS[age]:
            target, donor = "UNIT_ANTHRO_RESEARCH_" + key, "UNIT_" + donor_key
            node = f"NODE_ANTHRO_EXP_TECH_{prefix}_{subject}_{stage}"
            history = f"{name} favour rapid reconnaissance and screening over a sustained clash. Their lighter equipment trades staying power for mobility."
            desc = history + " +1 base Movement; -2 Combat Strength in each armed combat statistic relative to " + donor_key.replace("_", " ").title() + ". Production cost is 20% higher. Does not replace existing units."
            kind(target, "UNIT", output=output)
            unit = dict(db.execute("SELECT * FROM Units WHERE UnitType=?", (donor,)).fetchone())
            clone(output, "Units", "UnitType", donor, {"UnitType": target, "Name": loc("LOC_" + target + "_NAME", name),
                                                      "Description": loc("LOC_" + target + "_DESCRIPTION", desc),
                                                      "TraitType": None, "BaseMoves": unit["BaseMoves"] + 1})
            for table in ("Unit_Stats", "Unit_Costs", "Unit_Abilities", "UnitAiInfos", "Unit_Advisories", "Unit_RequiredConstructibles"):
                for r in [dict(r) for r in db.execute(f'SELECT * FROM "{table}" WHERE UnitType=?', (donor,))]:
                    r["UnitType"] = target
                    for stat in ("Combat", "RangedCombat", "Bombard"):
                        if stat in r and r[stat] > 0:
                            r[stat] = max(1, r[stat] - 2)
                    if table == "Unit_Costs":
                        r["Cost"] = (r["Cost"] * 120 + 99) // 100
                    output.append(insert(table, r))
            clone(output, "TypeTags", "Type", donor, {"Type": target})
            clone(output, "UnitUpgrades", "Unit", donor, {"Unit": target})
            output.append(insert("ProgressionTreeNodeUnlocks", {"ProgressionTreeNodeType": node, "TargetType": target, "TargetKind": "KIND_UNIT"}))
            out.append(insert("CivilopediaPageChapterParagraphs", {"ChapterID": "HISTORY", "PageID": target, "SectionID": "UNITS",
                                                                  "Paragraph": loc("LOC_PEDIA_" + target + "_HISTORY", history)}, node))
            art(target, motif, stage, donor, "UNIT")
            models.append({"age": age, "target": target, "donor": donor, "node": node, "kind": "unit"})

    (MOD / "data" / "progression-expansion.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
    (MOD / "config" / "ProgressionExpansion.sql").write_text("\n".join(shell_out) + "\n", encoding="utf-8")
    for age, statements in age_out.items():
        (MOD / "data" / f"progression-content-{age}.sql").write_text("\n".join(statements) + "\n", encoding="utf-8")
    xml_write(MOD / "text" / "en_us" / "ProgressionExpansion.xml", authored)
    xml_write(MOD / "data" / "progression-icons.xml", icons)
    xml_write(MOD / "data" / "progression-remaps.xml", remaps)
    tree_report = {}
    for r in originals:
        record = tree_report.setdefault(r["ProgressionTree"], {
            "age": r["AgeType"], "system": r["SystemType"], "original_nodes": 0,
            "expanded_nodes": 0, "base_cost_total": 0, "mastery_cost_weight": 0,
        })
        record["original_nodes"] += 1
        record["expanded_nodes"] += 3
        record["base_cost_total"] += r["Cost"]
        record["mastery_cost_weight"] += r["Cost"] * (depths[r["ProgressionTreeNodeType"]] - 1)
    report = {"trees": tree_report, "originals": originals, "nodes": plans, "models": models,
              "costs": allocations, "schema": "01_GameplaySchema.sql"}
    (ROOT / "tools" / "progression-inventory.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    imports = sorted({r.get("Path").removeprefix("fs://game/anthroprocenia/") for r in icons.findall("IconDefinitions/Row")})
    print(f"Generated {len(plans)} nodes, {len(models)} physical unlocks and {len(imports)} original symbols.")
    print("ImportFiles:", ", ".join(imports))
    frontend.close()
    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, default=native.DEFAULT_BASE)
    generate(parser.parse_args().base)
