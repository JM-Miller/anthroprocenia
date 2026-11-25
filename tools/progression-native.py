"""Local native database loader shared by progression generation and verification."""
from pathlib import Path
import sqlite3
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "anthroprocenia"
DEFAULT_BASE = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Sid Meier's Civilization VII\Base")
AGES = ("antiquity", "exploration", "modern")


def load_xml(db, path, strict=False):
    """Match the representative native loader in tests/civilizations-native.py."""
    root = ET.parse(path).getroot()
    if root.tag != "Database":
        return
    for table in root:
        types = {r[1]: r[2] for r in db.execute(f'PRAGMA table_info("{table.tag}")')}
        if not types:
            if strict:
                raise AssertionError(f"Unknown table {table.tag}: {path}")
            continue
        canonical = {c.casefold(): c for c in types}
        for item in table:
            if item.tag not in ("Row", "InsertOrIgnore"):
                continue
            values = {canonical.get(k.casefold(), k): v for k, v in
                      {**item.attrib, **{c.tag: c.text for c in item}}.items()}
            if strict and set(values) - set(types):
                raise AssertionError(f"Unknown columns {table.tag}: {set(values) - set(types)}")
            values = {k: (int(v.lower() == "true") if types[k].upper() == "BOOLEAN"
                          and v.lower() in ("true", "false") else v)
                      for k, v in values.items() if k in types}
            if values:
                operation = "INSERT" if strict else "INSERT OR IGNORE"
                db.execute(f'{operation} INTO "{table.tag}" ({",".join(values)}) '
                           f'VALUES ({",".join("?" for _ in values)})', list(values.values()))


def native_paths(base, age=None, dlc=True):
    modules = ["base-standard"] + ["age-" + a for a in (AGES if age is None else (age,))]
    paths = [p for module in modules for p in sorted((base / "modules" / module / "data").glob("*.xml"))]
    if dlc:
        paths.extend(sorted((base.parent / "DLC").glob("*/modules/data/*.xml")))
    return paths


def database(base=DEFAULT_BASE, age=None, dlc=True, anthro=True):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.create_function("Make_Hash", 1, lambda v: zlib.crc32(str(v).upper().encode()))
    db.executescript((base / "Assets" / "schema" / "gameplay" / "01_GameplaySchema.sql")
                    .read_text(encoding="utf-8-sig"))
    for path in native_paths(base, age, dlc):
        load_xml(db, path)
    if anthro:
        db.executescript((MOD / "data" / "civilizations.sql").read_text(encoding="utf-8"))
        for a in AGES if age is None else (age,):
            db.executescript((MOD / "data" / f"civilizations-{a}.sql").read_text(encoding="utf-8"))
    return db


def research_nodes(db):
    return [dict(r) for r in db.execute(
        "SELECT n.*,t.AgeType,t.SystemType FROM ProgressionTreeNodes n JOIN ProgressionTrees t "
        "ON n.ProgressionTree=t.ProgressionTreeType WHERE t.SystemType IN "
        "('SYSTEM_TECH','SYSTEM_CULTURE') ORDER BY t.AgeType,n.ProgressionTree,n.ProgressionTreeNodeType")]


def frontend_database(base=DEFAULT_BASE, dlc=True):
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    for schema in ("schema-frontend-10-setup-parameters.sql", "schema-frontend-50-setup-data.sql"):
        db.executescript((base / "Assets" / "schema" / "frontend" / schema).read_text(encoding="utf-8-sig"))
    db.executescript((base / "modules" / "core" / "config" / "config-schema.sql").read_text(encoding="utf-8-sig"))
    modules = ["base-standard"] + ["age-" + a for a in AGES]
    paths = [p for module in modules for p in sorted((base / "modules" / module / "config").glob("*.xml"))]
    if dlc:
        paths.extend(sorted((base.parent / "DLC").glob("*/modules/config/*.xml")))
    for path in paths:
        load_xml(db, path)
    load_xml(db, MOD / "config" / "Civilizations.xml", strict=True)
    return db
