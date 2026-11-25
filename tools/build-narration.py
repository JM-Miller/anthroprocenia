"""Record the mod's authored English narration as standalone PCM WAV files."""

import argparse
from array import array
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import time
import urllib.request
import wave
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "anthroprocenia" / "audio" / "narration"
CACHE = Path(os.environ["LOCALAPPDATA"]) / "AnthroproceniaNarrator" / "models"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
VOICE = "bf_emma"
SPEED = 0.94


def spoken_text(text):
    text = html.unescape(re.sub(r"<[^>]*>", " ", text))
    text = re.sub(r"\[icon:[^\]]*\]", " ", text)
    text = re.sub(r"([+-])(\d)", r"\1 \2", text)
    text = text.replace("+ ", "plus ").replace("- ", "minus ")
    text = re.sub(r"(\d)%", r"\1 percent", text)
    return " ".join(text.split())


def scripts():
    texts = {}
    for source in sorted((ROOT / "anthroprocenia" / "text" / "en_us").glob("*.xml")):
        for row in ET.parse(source).getroot().iter("Row"):
            tag = row.get("Tag")
            if tag:
                texts[tag] = "".join(row.find("Text").itertext())
    recordings, dynamic = [], []
    for tag, text in sorted(texts.items()):
        if not tag.endswith(("_DESCRIPTION", "_INTRO", "_HISTORY")) or "_MOD_" in tag:
            continue
        if not tag.startswith(("LOC_CIVILIZATION_ANTHRO_", "LOC_UNIT_ANTHRO_",
                               "LOC_BUILDING_ANTHRO_", "LOC_QUARTER_ANTHRO_",
                               "LOC_IMPROVEMENT_ANTHRO_", "LOC_CIVIC_ANTHRO_",
                               "LOC_TRADITION_ANTHRO_", "LOC_ABILITY_ANTHRO_",
                               "LOC_NODE_ANTHRO_",
                               "LOC_PROGRESSION_TREE_NODE_ANTHRO_")) and not (
                                   tag.startswith("LOC_PEDIA_") and "_ANTHRO_" in tag):
            continue
        if re.search(r"\{[^}]+\}", text):
            dynamic.append(tag)
            continue
        stem = tag.rsplit("_", 1)[0]
        title = texts.get(stem.replace("LOC_PEDIA_", "LOC_") + "_NAME", "")
        if title:
            text = title.rstrip(".") + ". " + text
        text = spoken_text(text)
        if not text:
            raise ValueError(f"Empty narration: {tag}")
        recordings.append({"tag": tag, "text": text, "file": tag.lower() + ".wav"})
    if not recordings:
        raise ValueError("No authored narration found.")
    return recordings, dynamic


def official_scripts():
    source = OUTPUT / "scripts.json"
    groups = json.loads(source.read_text(encoding="utf-8"))
    entries = []
    for group, prefix in (("leaders", "LEADER_"), ("civilizations", "CIVILIZATION_")):
        for type_, text in sorted(groups[group].items()):
            if not type_.startswith(prefix) or not re.fullmatch(r"[A-Z_]+", type_):
                raise ValueError(f"Invalid narrator subject: {type_}")
            tag = "ANTHRO_NARRATOR_" + type_
            entries.append({"tag": tag, "text": spoken_text(text), "file": tag.lower() + ".wav"})
    return entries, []


def model():
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    CACHE.mkdir(parents=True, exist_ok=True)
    for name in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        target = CACHE / name
        if not target.is_file():
            temporary = target.with_suffix(target.suffix + ".download")
            print(f"Downloading official Kokoro model: {name}", flush=True)
            urllib.request.urlretrieve(RELEASE + name, temporary)
            temporary.replace(target)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(CACHE / "kokoro-v1.0.onnx"),
                                  sess_options=options,
                                  providers=["CPUExecutionProvider"])
    return Kokoro.from_session(session, str(CACHE / "voices-v1.0.bin"))


def validate_wav(path):
    with wave.open(str(path), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 24000):
            raise ValueError("Narration must be mono, 24 kHz, 16-bit PCM.")
        frames = audio.getnframes()
        samples = array("h", audio.readframes(frames))
        if frames < 12000 or len(samples) != frames or max(map(abs, samples), default=0) < 33:
            raise ValueError("Narration is truncated, too short, or silent.")
        return frames / 24000


def record(engine, text, target):
    import numpy as np
    import soundfile as sf

    audio, rate = engine.create(text, voice=VOICE, speed=SPEED, lang="en-gb")
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if rate != 24000 or len(audio) < rate // 2 or not np.isfinite(audio).all():
        raise ValueError(f"Invalid synthesized audio for {target.name}")
    peak = float(np.max(np.abs(audio)))
    if peak < 0.001:
        raise ValueError(f"Silent synthesized audio for {target.name}")
    audio *= min(1.0, 0.94 / peak)
    fade = min(240, len(audio) // 2)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    temporary = target.with_suffix(".tmp.wav")
    sf.write(temporary, audio, rate, subtype="PCM_16")
    duration = validate_wav(temporary)
    temporary.replace(target)
    return duration


def save_index(index, path):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(index, indent=2, ensure_ascii=True), encoding="utf-8")
    for attempt in range(6):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 5:
                raise
            time.sleep(0.025 * 2**attempt)


def generate(preview=False, official=False):
    entries, dynamic = official_scripts() if official else scripts()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    engine = model()
    if preview:
        target = OUTPUT / "narrator-preview.wav"
        duration = record(engine, (
            "History is not made by certainty alone. It is shaped by patience, "
            "by courage, and by the quiet resolve to build what others cannot yet imagine. "
            "Across the centuries, your people will remember not merely what you conquered, "
            "but what you chose to preserve."
        ), target)
        print(f"Created {target} ({duration:.2f} seconds)", flush=True)
        return
    index = {"voice": VOICE, "language": "en-gb", "speed": SPEED, "complete": False,
             "total_recordings": len(entries), "format": "PCM_16 mono WAV, 24000 Hz",
             "recordings": [], "dynamic": dynamic}
    prior_path = OUTPUT / ("official-index.json" if official else "index.json")
    prior = {}
    if prior_path.is_file():
        previous = json.loads(prior_path.read_text(encoding="utf-8"))
        if previous.get("voice") == VOICE and previous.get("speed") == SPEED:
            prior = {entry["tag"]: entry for entry in previous["recordings"]}
    expected = {entry["tag"]: entry for entry in entries}
    retained = {tag: old for tag, old in prior.items() if tag in expected and
                old["script_sha256"] == hashlib.sha256((VOICE + str(SPEED) + expected[tag]["text"]).encode()).hexdigest()
                and (OUTPUT / expected[tag]["file"]).is_file()}
    completed = {}
    for number, entry in enumerate(entries, 1):
        digest = hashlib.sha256((VOICE + str(SPEED) + entry["text"]).encode()).hexdigest()
        target = OUTPUT / entry["file"]
        old = prior.get(entry["tag"])
        if old and old["script_sha256"] == digest and target.is_file():
            duration = validate_wav(target)
        elif digest in completed:
            original, duration = completed[digest]
            shutil.copyfile(original, target)
        else:
            duration = record(engine, entry["text"], target)
        completed[digest] = (target, duration)
        current = {**entry, "script_sha256": digest, "duration_seconds": round(duration, 3)}
        changed = retained.get(entry["tag"]) != current
        retained[entry["tag"]] = current
        index["recordings"] = [retained[item["tag"]] for item in entries if item["tag"] in retained]
        if changed:
            save_index(index, prior_path)
        if number == 1 or number % 25 == 0 or number == len(entries):
            print(f"[{number}/{len(entries)}] {target.name}: {duration:.2f}s", flush=True)
    index["complete"] = True
    save_index(index, prior_path)
    print(f"Recorded {len(entries)} descriptions; {len(dynamic)} need runtime text.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("preview", "generate", "inventory", "official"))
    args = parser.parse_args()
    if args.command == "inventory":
        entries, dynamic = scripts()
        print(json.dumps({"recordings": len(entries), "dynamic": dynamic}, indent=2))
    else:
        generate(args.command == "preview", args.command == "official")
