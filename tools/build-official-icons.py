#!/usr/bin/env python3
"""Inventory and integrate ORIGINAL official-content replacement icons.

Usage (from the repository root):
  python tools\\build-official-icons.py --inventory-only
  python tools\\build-official-icons.py --chunks civ --chunk-size 24
  python tools\\build-official-icons.py --check
  python tools\\build-official-icons.py

Put original RGBA PNG artwork at each catalog entry's art path. No stock art is
read, copied, synthesized, recolored, or used as a fallback. Inventory mode only
writes the catalog; normal generation validates EVERY image before writing.

Normal generation also registers this integration in the manifest:
* Run UpdateIcons(data/official-icon-overrides.xml) in BOTH shell and game,
  after official UpdateIcons actions (including optional DLC). Use LoadOrder
  10000 and References for the installed official module IDs in the catalog.
  Keep the base-standard dependency; do not make optional DLC dependencies.
* Run UpdateDatabase(config/OfficialIcons.xml) in shell, after official config.
  It changes CivilizationItems.Icon only, never domains or gameplay.
* Run UIScripts(ui/map/anthroprocenia-official-icons.js) in shell AND game;
  ImportFiles every catalog art path in both scopes. The script handles native
  filename-based civilization emblems, not shared gameplay stock filenames.
* Do not register this integration as complete until --check passes and native
  menu/game smoke testing confirms DLC ordering. Higher LoadOrder is not a
  substitute for testing the installed engine's cross-module ordering.
  The inspected install has 90 official UpdateIcons action groups, all with
  implicit LoadOrder 0. Installed ui-next registers Icon (with props.mask), not
  a separately named CivSymbol component.

Native evidence: Base/Assets/schema/icons/IconManager.sql gives IconDefinitions
PK (ID, Context, IconSize). Updates set Path for DEFAULT and gameplay FONTICON
contexts, preserving sizes, tint metadata, and civ loading-screen backgrounds. Missing quarter
definitions are inserted with Row (trigger creates Icons); existing IDs use
Update, never Delete+Row, which could cascade aliases. A quarter's shell Icon
is frequently a shared placeholder: config updates must be by Type, not URL.
The installed Icon component uses alpha masks; replacing a mask URL must retain
mask rendering (the white RGB is ignored when the UI supplies an owner tint).
The standalone renderer updates mask-image as well as background-image.

Wonders (ConstructibleClass=WONDER), leaders, resources, generic UI slot buttons,
and city-state definitions without an actual civilization emblem are outside
the requested categories. Their artwork is not remapped.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "anthroprocenia"
CATALOG = ROOT / "tools" / "official-icon-catalog.json"
DEFAULT_BASE = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII\Base")
PREFIXES = {"unit": "UNIT_", "building": "BUILDING_", "improvement": "IMPROVEMENT_", "quarter": "QUARTER_"}
CATEGORIES = ("civ", "unit", "building", "improvement", "quarter")
CIV_SUBJECTS = {
    "ABBASID": "an Abbasid brass astrolabe with interlaced geometric rays",
    "AKSUM": "a carved Aksumite stela with recessed false doors",
    "AMERICA": "an early American liberty bell and oak leaves",
    "ASSYRIA": "an Assyrian winged sun disk above a stepped rosette",
    "BABYLON": "a Babylonian mushhushshu dragon in profile",
    "BUGANDA": "a royal Buganda drum with woven lashings",
    "BULGARIA": "a medieval Bulgarian lion with an interlaced mane",
    "CARTHAGE": "a Carthaginian merchant prow beneath a Tanit sign",
    "CHOLA": "a Chola tiger beside a ceremonial bow",
    "DAI_VIET": "a Dong Son bronze drum seen from above",
    "EGYPT": "an Egyptian lotus capital with a rising solar disk",
    "ENGLAND": "a Tudor rose with individually engraved petals",
    "FRENCH_EMPIRE": "a Napoleonic imperial bee in a laurel ring",
    "GAUL": "a La Tene boar standard with spiraling bristles",
    "GORYEO": "a Goryeo celadon crane medallion",
    "GREAT_BRITAIN": "a heraldic British lion holding a maritime trident",
    "GREECE": "an ancient Greek owl standing on an olive branch",
    "HAN": "a Han bronze bi disk with cloud-scroll engraving",
    "HAWAII": "a Hawaiian feathered kahili and canoe sail",
    "HEIAN": "a Heian folding fan with flowing stream engraving",
    "ICELAND": "a Norse longship prow with interlaced wood carving",
    "INCA": "an Inca stepped chakana with a woven central knot",
    "JOSEON": "a Joseon royal phoenix above a tiled palace ridge",
    "KHMER": "a Khmer stone lotus tower with naga balustrade",
    "MAJAPAHIT": "a Majapahit split gateway around a rising sun",
    "MAURYA": "an Ashokan wheel framed by a stone lion capital",
    "MAYA": "a Maya carved jade maize deity profile",
    "MEIJI": "a Meiji chrysanthemum with finely incised layered petals",
    "MEXICO": "a Mexican eagle perched on a prickly pear cactus",
    "MING": "a Ming porcelain dragon curling around a pearl",
    "MISSISSIPPIAN": "a Mississippian engraved shell gorget with a falcon",
    "MONGOLIA": "a Mongol horse-head standard with flowing horsetail",
    "MUGHAL": "a Mughal garden cypress within a scalloped arch",
    "NEPAL": "a Nepalese tiered pagoda with a Himalayan peak",
    "NORMAN": "a Norman kite shield and nasal-guard helmet",
    "OTTOMANS": "an Ottoman tulip medallion with restrained arabesques",
    "PERSIA": "an Achaemenid winged disk above a lotus",
    "PIRATE_REPUBLIC": "an eighteenth-century sailing sloop and ship's wheel",
    "PRUSSIA": "a Prussian eagle with sharply engraved wing feathers",
    "QAJAR": "a Qajar lion and radiant sun with Persian floral detail",
    "QING": "a Qing coiling dragon clasping a flaming pearl",
    "ROME": "a Roman aquila above a civic oak wreath",
    "RUSSIA": "a Russian double-headed eagle with ornate breast shield",
    "SENGOKU": "a Sengoku kabuto helmet with a crescent crest",
    "SHAWNEE": "a Shawnee-inspired river turtle and woven river pattern",
    "SIAM": "a Siamese three-headed elephant beneath a tiered parasol",
    "SILLA": "a Silla branching ceremonial crown with comma-shaped pendants",
    "SONGHAI": "a Niger river canoe beneath a Sahelian earthen arch",
    "SPAIN": "a Spanish castle and lion within a rope border",
    "TONGA": "a Tongan double-hulled voyaging canoe and woven sail",
    "RANDOM": "a compass rose with several branching historical paths",
}
GAMEPLAY_SUBJECTS = {
    "UNIT_AUDIO_SANDBOX_MELEE": "a wooden training sword and practice shield",
    "UNIT_AUDIO_SANDBOX_RANGED": "an archery target pierced by one arrow",
    "UNIT_SANDBOX": "a military drill field with a training banner",
    "IMPROVEMENT_REPAIR_ALL": "a carpenter's mallet above repaired masonry",
}


def fields(element):
    return {**element.attrib, **{c.tag: c.text or "" for c in element}}


def plain(text):
    text = re.sub(r"\[(?:/?TIP[^\]]*|icon:[^\]]*)\]", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


def installed_tables(base):
    if not (base / "modules").is_dir():
        raise ValueError(f"Installed Base modules not found: {base}")
    paths = sorted((base / "modules").rglob("*.xml"))
    dlc = base.parent / "DLC"
    if dlc.is_dir():
        paths += sorted(dlc.glob("*/modules/**/*.xml"))
    tables = defaultdict(list)
    modules = set()
    for path in paths:
        if "l10n" in path.parts:
            continue
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError as exc:
            raise ValueError(f"Cannot inventory installed XML {path}: {exc}") from exc
        if root.tag != "Database":
            continue
        source = path.relative_to(base.parent).as_posix()
        module = path.relative_to(base / "modules").parts[0] if path.is_relative_to(base / "modules") else path.relative_to(dlc).parts[0]
        for table in root:
            for element in table:
                if element.tag in ("Row", "Replace"):
                    tables[table.tag].append((fields(element), source, module))
                    if table.tag == "IconDefinitions":
                        modules.add(module)
    return tables, sorted(modules)


def inventory(base):
    tables, modules = installed_tables(base)
    english = {}
    for table in ("EnglishText", "LocalizedText"):
        for data, _, _ in tables[table]:
            if data.get("Language", "en_US").lower() == "en_us" and data.get("Tag"):
                english[data["Tag"]] = plain(data.get("Text", ""))
    definitions = defaultdict(list)
    for data, source, module in tables["IconDefinitions"]:
        id_ = data.get("ID", "")
        if data.get("Context", "DEFAULT") == "DEFAULT" or any(id_.startswith(prefix) for prefix in PREFIXES.values()):
            definitions[data.get("ID")].append((data, source, module))
    culture_filenames = {
        value for table in tables.values() for data, _, _ in table for value in data.values()
        if isinstance(value, str) and value.startswith("cult_")
    }
    entities = {}

    def add(category, id_, data, source, module):
        if not id_:
            return
        entry = entities.setdefault(id_, {"category": category, "data": {}, "sources": set(), "modules": set()})
        entry["data"].update({key: value for key, value in data.items() if value != ""})
        entry["sources"].add(source)
        entry["modules"].add(module)

    for category, table, column in (
        ("unit", "Units", "UnitType"), ("building", "Buildings", "ConstructibleType"),
        ("improvement", "Improvements", "ConstructibleType"), ("quarter", "UniqueQuarters", "UniqueQuarterType"),
    ):
        for data, source, module in tables[table]:
            add(category, data.get(column), data, source, module)
    for data, source, module in tables["Constructibles"]:
        if data.get("ConstructibleType") in entities:
            add(entities[data["ConstructibleType"]]["category"], data["ConstructibleType"], data, source, module)
    for id_, icons in definitions.items():
        if id_ and id_.startswith("CIVILIZATION_"):
            for data, source, module in icons:
                add("civ", id_, {}, source, module)
    for data, source, module in tables["Civilizations"]:
        if data.get("CivilizationType") in entities:
            add("civ", data["CivilizationType"], data, source, module)
    config = defaultdict(list)
    for data, source, module in tables["CivilizationItems"]:
        id_ = data.get("Type")
        kind = data.get("Kind", "").removeprefix("KIND_").lower()
        if kind in PREFIXES:
            add(kind, id_, {"Name": data.get("Name", "")}, source, module)
            config[id_].append(data)
    ui_only = {
        "UNIT_CAUTION", "UNIT_CITY_DISTRICT", "UNIT_FOUND_CITY_ICON", "UNIT_MOVEMENT_ICON", "UNIT_SIGHT",
        "BUILDING_ADD", "BUILDING_EMPTY", "BUILDING_OPEN", "BUILDING_PLACE", "BUILDING_UNFILLED", "BUILDING_WARNING",
    }
    for id_, icons in definitions.items():
        if id_ in ui_only:
            continue
        category = next((category for category, prefix in PREFIXES.items() if id_ and id_.startswith(prefix)), None)
        if category and id_ not in entities:
            for _, source, module in icons:
                add(category, id_, {}, source, module)
    gp_roots = {
        data["GreatPersonClassType"]: data["UnitType"]
        for data, _, _ in tables["GreatPersonClasses"] if data.get("UnitType") in entities
    }
    gp_units = {}
    for data, _, _ in tables["GreatPersonIndividuals"]:
        unit = data.get("UnitType", "")
        parent = gp_roots.get(data.get("GreatPersonClassType"), "")
        if parent and unit.startswith(parent + "_"):
            gp_units[unit] = parent
    # Numeric upgrade tiers share the base type's art, but unrelated units that
    # merely reuse a native texture remain separate entries.
    groups = defaultdict(list)
    for id_, entity in entities.items():
        canonical = id_
        if entity["category"] == "unit":
            stripped = re.sub(r"_\d+$", "", id_)
            if stripped in entities:
                canonical = stripped
            canonical = gp_units.get(canonical, canonical)
            if canonical == id_ and not entity["data"]:
                canonical = next((parent for parent in gp_roots.values() if id_.startswith(parent + "_")), canonical)
        groups[canonical].append(id_)
    entries = []
    for canonical, ids in sorted(groups.items(), key=lambda pair: (CATEGORIES.index(entities[pair[0]]["category"]), pair[0])):
        entity = entities[canonical]
        category = entity["category"]
        data = entity["data"]
        name_key = data.get("Name", "")
        name = english.get(name_key) or canonical.split("_", 1)[-1].replace("_", " ").title()
        if name.startswith("LOC_"):
            name = canonical.split("_", 1)[-1].replace("_", " ").title()
        all_sources, all_modules, native, menu_icons = set(), set(), [], set()
        for id_ in sorted(ids):
            all_sources.update(entities[id_]["sources"])
            all_modules.update(entities[id_]["modules"])
            for icon, source, module in definitions.get(id_, []):
                native.append({"id": id_, "context": icon.get("Context", "DEFAULT"), "size": int(icon.get("IconSize", 0)), "path": icon["Path"]})
                all_sources.add(source)
                all_modules.add(module)
                if category == "civ" and icon.get("Context", "DEFAULT") == "DEFAULT":
                    menu_icons.add(icon["Path"].split("/")[-1].removeprefix("blp:").removesuffix(".png"))
        if category == "civ":
            key = canonical.removeprefix("CIVILIZATION_")
            menu_icons.update(filename for filename in culture_filenames if filename[5:].upper() == key)
            subject = CIV_SUBJECTS.get(key, f"a historically grounded emblem for {name}")
            brief = f"Original white engraved emblem: {subject}; transparent background, no lettering."
        else:
            context = english.get(data.get("Description", ""), "")
            context = re.split(r"(?<=[.!?])\s", context)[0][:190]
            subject = GAMEPLAY_SUBJECTS.get(canonical, name)
            if category == "quarter":
                components = [data.get("BuildingType1"), data.get("BuildingType2")]
                component_names = [
                    english.get(entities[c]["data"].get("Name", ""), c.removeprefix("BUILDING_").replace("_", " ").title())
                    for c in components if c in entities
                ]
                if component_names:
                    subject += ": a compact architectural group combining " + " and ".join(component_names)
            brief = f"Original white engraved {category} icon of {subject}; clear historical silhouette, transparent background, no lettering."
            if context:
                brief += " Reference: " + context
        entry = {
            "key": canonical, "ids": sorted(ids), "category": category, "name": name,
            "name_key": name_key,
            "art": f"art/official-icons/official_{category}_{canonical.split('_', 1)[-1].lower()}.png",
            "brief": brief, "modules": sorted(all_modules), "sources": sorted(all_sources),
            "native_icons": sorted({(x["id"], x["context"], x["size"], x["path"]): x for x in native}.values(), key=lambda x: (x["id"], x["context"], x["size"], x["path"])),
        }
        if menu_icons:
            entry["menu_filenames"] = sorted(menu_icons)
        if category == "unit":
            entry["domain"] = data.get("Domain", "")
        if any(id_ in config for id_ in ids):
            entry["config_types"] = sorted(id_ for id_ in ids if id_ in config)
        if category == "quarter":
            entry["civilizations"] = sorted({item["CivilizationType"] for id_ in ids for item in config[id_] if item.get("CivilizationType")})
        entries.append(entry)
    return {
        "version": 1,
        "scope": "Installed official Base/modules and DLC/*/modules; original art only; no gameplay changes.",
        "integration": {
            "load_order": 10000, "reference_modules": modules,
            "shell": {"UpdateIcons": "data/official-icon-overrides.xml", "UpdateDatabase": "config/OfficialIcons.xml", "UIScripts": "ui/map/anthroprocenia-official-icons.js"},
            "game": {"UpdateIcons": "data/official-icon-overrides.xml", "UIScripts": "ui/map/anthroprocenia-official-icons.js"},
            "import_files": "Every entries[].art path in shell and game",
            "art_rules": "Original distinct WHITE RGBA PNGs in ALL categories, including civilization emblems. Preserve native owner tint/mask rendering. Transparent margins and alpha silhouettes required. Upgrade tiers and named individuals of one great-person base unit share one original image.",
            "excluded": "Wonders, leaders, resources, generic UI slot buttons; civ backgrounds and all gameplay preserved.",
        },
        "counts": dict(Counter(entry["category"] for entry in entries)),
        "id_counts": dict(Counter(entry["category"] for entry in entries for _ in entry["ids"])),
        "entries": entries,
    }


def validate_art(catalog, mod=MOD):
    from PIL import Image

    errors, hashes, masks = [], {}, {}
    for entry in catalog["entries"]:
        path = mod / entry["art"]
        if not path.is_file():
            errors.append(f"Missing original art: {entry['art']} ({entry['name']})")
            continue
        try:
            with Image.open(path) as source:
                if source.format != "PNG" or source.mode != "RGBA":
                    raise ValueError("must be an RGBA PNG")
                image = source.copy()
            if image.width != image.height or image.width < 128:
                raise ValueError("must be square and at least 128px")
            alpha = image.getchannel("A")
            if alpha.getextrema() != (0, 255):
                raise ValueError("requires fully transparent AND opaque pixels")
            visible = alpha.point(lambda a: 255 if a >= 32 else 0)
            bbox = visible.getbbox()
            if not bbox or (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) < image.width * image.height * .04:
                raise ValueError("engraving silhouette is empty or too small")
            if any(alpha.getpixel(point) for point in ((0, 0), (image.width-1, 0), (0, image.height-1), (image.width-1, image.height-1))):
                raise ValueError("corners must be transparent")
            bounds = alpha.getbbox()
            if bounds[0] == 0 or bounds[1] == 0 or bounds[2] == image.width or bounds[3] == image.height:
                raise ValueError("requires a transparent outer margin")
            pixels = [rgb[:3] for rgb in image.getdata() if rgb[3] >= 32]
            if sum(max(rgb)-min(rgb) <= 8 and min(rgb) >= 235 for rgb in pixels) / len(pixels) < .98:
                raise ValueError("engraving must be white in every category, including civilization emblems")
            digest = hashlib.sha256(image.tobytes()).hexdigest()
            if digest in hashes:
                raise ValueError(f"duplicates {hashes[digest]}")
            hashes[digest] = entry["art"]
            normalized = alpha.crop(bbox).resize((96, 96))
            variants = (normalized, normalized.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                        normalized.transpose(Image.Transpose.FLIP_TOP_BOTTOM))
            # Identical alpha silhouettes also catch stock recolors and mirrors.
            for variant in variants:
                mask_hash = hashlib.sha256(variant.tobytes()).hexdigest()
                if mask_hash in masks:
                    raise ValueError(f"reuses/mirrors the silhouette of {masks[mask_hash]}")
            masks[hashlib.sha256(normalized.tobytes()).hexdigest()] = entry["art"]
        except (OSError, ValueError) as exc:
            errors.append(f"Invalid original art {entry['art']}: {exc}")
    if errors:
        raise ValueError("\n".join(errors) + f"\nOriginal art validation failed ({len(errors)} files); no integration files written.")


def make_overrides(catalog):
    root = ET.Element("Database")
    icons = ET.SubElement(root, "IconDefinitions")
    config = ET.Element("Database")
    items = ET.SubElement(config, "CivilizationItems")
    for entry in catalog["entries"]:
        path = "fs://game/anthroprocenia_map_history/" + entry["art"]
        for id_ in entry["ids"]:
            contexts = {row["context"] for row in entry["native_icons"]
                        if row["id"] == id_ and row["context"] in ("DEFAULT", "FONTICON")}
            for context in sorted(contexts):
                update = ET.SubElement(icons, "Update")
                ET.SubElement(update, "Where", ID=id_, Context=context)
                ET.SubElement(update, "Set", Path=path)
            if "DEFAULT" not in contexts:
                ET.SubElement(icons, "Row", ID=id_, Context="DEFAULT", IconSize="0", Path=path)
        for id_ in entry.get("config_types", []):
            update = ET.SubElement(items, "Update")
            ET.SubElement(update, "Where", Type=id_)
            ET.SubElement(update, "Set", Icon=path)
    return root, config


def make_renderer(catalog):
    rules = []
    for entry in catalog["entries"]:
        for filename in entry.get("menu_filenames", []):
            url = "fs://game/anthroprocenia_map_history/" + entry["art"]
            # Separate rules: a mask consumer must remain a mask, not gain a
            # colored rectangular background underneath its tinted silhouette.
            rules.append(f'.img-{filename}, [style*="{filename}"] {{ background-image: url("{url}") !important; background-size: contain !important; background-position: center !important; background-repeat: no-repeat !important; }}')
            rules.append(f'[style*="{filename}"][style*="mask"] {{ background-image: none !important; mask-image: url("{url}") !important; -webkit-mask-image: url("{url}") !important; mask-size: contain !important; mask-position: center !important; }}')
    quarters = [{"id": e["key"], "name": e["name"], "nameKey": e["name_key"], "url": "fs://game/anthroprocenia_map_history/" + e["art"]}
                for e in catalog["entries"] if e["category"] == "quarter"]
    return (
        "// Generated by tools/build-official-icons.py; original artwork only.\n"
        "// Alpha-mask consumers intentionally retain their native tint behavior.\n"
        "import { ComponentRegistry, componentRegistered } from '/core/ui-next/services/component-registry.js';\n"
        "import { createRenderEffect } from '/core/vendor/solid-js/dist/solid.js';\n"
        "const id = 'anthroprocenia-official-emblems';\n"
        "if (!document.getElementById(id)) {\n"
        "  const style = document.createElement('style');\n"
        "  style.id = id;\n"
        "  style.textContent = " + json.dumps("\n".join(rules)) + ";\n"
        "  document.head.appendChild(style);\n"
        "  const quarters = " + json.dumps(quarters, ensure_ascii=False) + ";\n"
        + r"""
  const localized = (q) => typeof Locale !== 'undefined' && q.nameKey ? Locale.compose(q.nameKey) : q.name;
  const quarterFor = (item) => {
    if (!item || !['object', 'function'].includes(typeof item)) return undefined;
    const icon = typeof item.icon === 'string' ? item.icon : '';
    if (!(icon === 'CITY_UNIQUE_QUARTER' || item.isUniqueQuarter || icon.includes('city_uniquequarter'))) return undefined;
    return quarters.find((q) => item.name === q.nameKey || item.title === localized(q) || item.name === localized(q));
  };
  const remapItem = (item) => {
    const quarter = quarterFor(item);
    if (!quarter) return item;
    return new Proxy(item, { get(target, key, receiver) {
      if (key === 'icon') return typeof item.icon === 'string' && item.icon.trimStart().startsWith('url(') ? `url("${quarter.url}")` : quarter.id;
      return Reflect.get(target, key, receiver);
    } });
  };
  const patched = new WeakSet();
  createRenderEffect(() => {
    componentRegistered();
    for (const name of ['CivCard', 'BuildingOrUnitInfo']) {
      const registration = ComponentRegistry.get(name);
      const original = registration?.factory();
      if (!original || patched.has(original)) continue;
      const replacement = (props) => original(new Proxy(props, { get(target, key, receiver) {
        if (key === 'buildings') return (Reflect.get(target, key, receiver) ?? []).map(remapItem);
        if (key === 'icon') return remapItem(target).icon;
        return Reflect.get(target, key, receiver);
      } }));
      patched.add(replacement);
      ComponentRegistry.register(name, replacement, (registration.overridePriority ?? 0) + 1);
    }
  });
  // Loading screens and classic city details hard-code a generic quarter icon.
  // Resolve only a nearby, unambiguous localized quarter label; never globally
  // replace city_uniquequarter, which is also a generic UI affordance.
  const genericSelector = '[data-icon-id="CITY_UNIQUE_QUARTER"], [style*="city_uniquequarter"]';
  const imageSource = (value) => /^url\(\s*['"]?([^'")]+)['"]?\s*\)$/.exec(value ?? '')?.[1];
  const remapQuarterElement = (element) => {
    for (let parent = element.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
      const text = parent.textContent ?? '';
      const matches = quarters.filter((q) => {
        const label = localized(q);
        return label && text.includes(label);
      });
      if (matches.length !== 1) continue;
      const url = `url("${matches[0].url}")`;
      const computed = typeof getComputedStyle === 'function' ? getComputedStyle(element) : undefined;
      const maskProperties = ['maskImage', 'webkitMaskImage'].filter((key) => {
        const value = element.style[key] || computed?.[key];
        return value && value !== 'none';
      });
      if (maskProperties.length) {
        for (const key of maskProperties) if (imageSource(element.style[key]) !== matches[0].url) element.style[key] = url;
      } else if (imageSource(element.style.backgroundImage) !== matches[0].url) {
        element.style.backgroundImage = url;
      }
      if (element.getAttribute('data-icon-id') === 'CITY_UNIQUE_QUARTER') element.setAttribute('data-icon-id', matches[0].id);
      return;
    }
  };
  const scan = (root) => {
    if (root.matches?.(genericSelector)) remapQuarterElement(root);
    root.querySelectorAll?.(genericSelector).forEach(remapQuarterElement);
  };
  scan(document);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') scan(change.target);
      else for (const node of change.addedNodes) if (node.nodeType === 1) scan(node.parentElement ?? node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-icon-id'] });
}
"""
    )


def write_xml(path, root):
    path.parent.mkdir(parents=True, exist_ok=True)
    ET.indent(root, space="  ")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def register_manifest(catalog):
    path = MOD / "anthroprocenia.modinfo"
    ET.register_namespace("", "ModInfo")
    manifest = ET.parse(path)
    root = manifest.getroot()
    namespace = {"m": "ModInfo"}
    references = root.find("m:References", namespace)
    existing = {item.get("id") for item in references}
    for module in catalog["integration"]["reference_modules"]:
        if module not in existing and module != "base-standard":
            ET.SubElement(references, "{ModInfo}Mod", {"id": module})
    groups = root.find("m:ActionGroups", namespace)
    for scope in ("shell", "game"):
        group_id = f"official-icons-{scope}"
        previous = groups.find(f"m:ActionGroup[@id='{group_id}']", namespace)
        if previous is not None:
            groups.remove(previous)
        group = ET.SubElement(groups, "{ModInfo}ActionGroup",
                              {"id": group_id, "scope": scope, "criteria": "always"})
        properties = ET.SubElement(group, "{ModInfo}Properties")
        ET.SubElement(properties, "{ModInfo}LoadOrder").text = str(catalog["integration"]["load_order"])
        actions = ET.SubElement(group, "{ModInfo}Actions")
        for action, filename in catalog["integration"][scope].items():
            ET.SubElement(ET.SubElement(actions, "{ModInfo}" + action), "{ModInfo}Item").text = filename
        imported = ET.SubElement(actions, "{ModInfo}ImportFiles")
        for entry in catalog["entries"]:
            ET.SubElement(imported, "{ModInfo}Item").text = entry["art"]
    ET.indent(manifest, space="\t")
    manifest.write(path, encoding="utf-8", xml_declaration=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", type=Path, default=Path(os.environ.get("CIV7_BASE", DEFAULT_BASE)))
    parser.add_argument("--inventory-only", action="store_true", help="Refresh catalog only; no art required and no integration files emitted")
    parser.add_argument("--check", action="store_true", help="Validate installed coverage and all art without writing files")
    parser.add_argument("--chunks", choices=CATEGORIES + ("all",), help="Print compact art batches from the catalog, without requiring art")
    parser.add_argument("--chunk-size", type=int, default=24)
    args = parser.parse_args(argv)
    try:
        catalog = inventory(args.base)
        if args.chunks:
            if args.chunk_size < 1:
                raise ValueError("--chunk-size must be positive")
            entries = [e for e in catalog["entries"] if args.chunks == "all" or e["category"] == args.chunks]
            for offset in range(0, len(entries), args.chunk_size):
                print(json.dumps({"chunk": offset // args.chunk_size + 1, "entries": [{"art": e["art"], "name": e["name"], "brief": e["brief"]} for e in entries[offset:offset+args.chunk_size]]}, ensure_ascii=False))
            return 0
        if args.inventory_only:
            CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("Inventory only; artwork NOT validated; integration NOT generated.")
        else:
            if not CATALOG.is_file() or json.loads(CATALOG.read_text(encoding="utf-8")) != catalog:
                raise ValueError("Catalog differs from installed official data; run --inventory-only and review new artwork requirements.")
            validate_art(catalog)
            if not args.check:
                icons, config = make_overrides(catalog)
                write_xml(MOD / "data" / "official-icon-overrides.xml", icons)
                write_xml(MOD / "config" / "OfficialIcons.xml", config)
                renderer = MOD / "ui" / "map" / "anthroprocenia-official-icons.js"
                renderer.write_text(make_renderer(catalog), encoding="utf-8")
                register_manifest(catalog)
            print("Original artwork validated." + (" No files written." if args.check else " Integration generated and registered."))
        print(json.dumps({"art_counts": catalog["counts"], "official_id_counts": catalog["id_counts"]}))
        return 0
    except (ValueError, ImportError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
