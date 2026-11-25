import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import wave

import numpy as np

spec = importlib.util.spec_from_file_location(
    "build_narration", Path(__file__).resolve().parents[1] / "tools" / "build-narration.py")
narration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(narration)


class NarrationFilesTests(unittest.TestCase):
    def test_interrupted_resume_preserves_valid_recordings_not_yet_revisited(self):
        entries = [{"tag": "FIRST", "text": "First narration.", "file": "first.wav"},
                   {"tag": "LATER", "text": "Later narration.", "file": "later.wav"}]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            (output / "later.wav").touch()
            old = {**entries[1], "script_sha256": hashlib.sha256(
                (narration.VOICE + str(narration.SPEED) + entries[1]["text"]).encode()).hexdigest(),
                "duration_seconds": 1.0}
            index = output / "index.json"
            index.write_text(json.dumps({"voice": narration.VOICE, "speed": narration.SPEED,
                                         "recordings": [old]}), encoding="utf-8")
            save = narration.save_index

            def interrupt(value, path):
                save(value, path)
                raise OSError("Interrupted after saving the first new clip")

            with patch.object(narration, "OUTPUT", output), patch.object(narration, "scripts", return_value=(entries, [])), \
                    patch.object(narration, "model"), patch.object(narration, "record", return_value=1.0), \
                    patch.object(narration, "save_index", side_effect=interrupt):
                with self.assertRaises(OSError):
                    narration.generate()
            saved = json.loads(index.read_text())
            self.assertFalse(saved["complete"])
            self.assertEqual({item["tag"] for item in saved["recordings"]}, {"FIRST", "LATER"})

    def test_scripts_include_civics_and_histories_without_markup_or_unresolved_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "anthroprocenia" / "text" / "en_us"
            source.mkdir(parents=True)
            (source / "test.xml").write_text("""<Database><EnglishText>
              <Row Tag="LOC_NODE_ANTHRO_TEST_1_NAME"><Text>Assembly</Text></Row>
              <Row Tag="LOC_NODE_ANTHRO_TEST_1_DESCRIPTION"><Text>+2 [icon:YIELD_CULTURE] Culture; +15% Production.</Text></Row>
              <Row Tag="LOC_PEDIA_NODE_ANTHRO_TEST_1_HISTORY"><Text>Words bind communities.</Text></Row>
              <Row Tag="LOC_CIVILIZATION_ANTHRO_TEST_INTRO"><Text>Beyond the river, a people gathers.</Text></Row>
              <Row Tag="LOC_UNIT_ANTHRO_TEST_DESCRIPTION"><Text>Strength: {1_Value}.</Text></Row>
              <Row Tag="LOC_BUILDING_ANTHRO_TEST_MOD_1_DESCRIPTION"><Text>+1 Food.</Text></Row>
            </EnglishText></Database>""", encoding="utf-8")
            with patch.object(narration, "ROOT", root):
                entries, dynamic = narration.scripts()
            by_tag = {entry["tag"]: entry for entry in entries}
            self.assertEqual(len(entries), 3)
            self.assertEqual(by_tag["LOC_NODE_ANTHRO_TEST_1_DESCRIPTION"]["text"],
                             "Assembly. plus 2 Culture; plus 15 percent Production.")
            self.assertEqual(by_tag["LOC_PEDIA_NODE_ANTHRO_TEST_1_HISTORY"]["text"],
                             "Assembly. Words bind communities.")
            self.assertEqual(dynamic, ["LOC_UNIT_ANTHRO_TEST_DESCRIPTION"])
            self.assertEqual(len({entry["file"] for entry in entries}), len(entries))

    def test_record_produces_playable_pcm_and_rejects_silent_or_corrupt_synthesis(self):
        class Engine:
            def create(self, text, **kwargs):
                return self.audio, 24000

        engine = Engine()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "narration.wav"
            engine.audio = np.sin(np.arange(24000) * 0.05).astype(np.float32) * 0.2
            duration = narration.record(engine, "A people gathers.", target)
            self.assertEqual(duration, 1.0)
            with wave.open(str(target), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getsampwidth(),
                                  audio.getframerate(), audio.getnframes()),
                                 (1, 2, 24000, 24000))
                original = audio.readframes(audio.getnframes())
            for audio in [np.zeros(24000), np.full(24000, np.nan), np.ones(100)]:
                engine.audio = audio
                with self.assertRaises(ValueError):
                    narration.record(engine, "A people gathers.", target)
                with wave.open(str(target), "rb") as preserved:
                    self.assertEqual(preserved.readframes(preserved.getnframes()), original)


if __name__ == "__main__":
    unittest.main()
