from array import array
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location(
    "companion", Path(__file__).resolve().parents[1] / "tools" / "narration-companion.py")
companion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(companion)


def write_audio(path):
    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        audio.writeframes(array("h", [1000, -1000] * 12000).tobytes())


class CompanionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.audio = Path(self.temporary.name)
        (self.audio / "scripts.json").write_text(json.dumps({
            "leaders": {"LEADER_TEST": "An original introduction."}, "civilizations": {}
        }), encoding="utf-8")
        self.played = []
        self.narrator = None

    def tearDown(self):
        if self.narrator:
            self.narrator.close()
        self.temporary.cleanup()

    def start(self, synthesize=None):
        self.narrator = companion.Narrator(self.audio, self.audio / "cache",
                                          self.played.append, synthesize)
        return self.narrator

    def request(self, number, **values):
        return {"client": "test-client", "request": number, **values}

    def test_prerecorded_playback_uses_original_script_and_rejects_stale_requests(self):
        target = self.audio / "anthro_narrator_leader_test.wav"
        write_audio(target)
        narrator = self.start()
        job = narrator.accept(self.request(1, tag="ANTHRO_NARRATOR_LEADER_TEST", text="Wrong script"))
        self.assertTrue(job.done.wait(3))
        self.assertEqual(job.text, "An original introduction.")
        self.assertEqual(job.result["status"], "playing")
        self.assertIn(target, self.played)
        self.assertIsNone(narrator.accept(self.request(1, text="Stale")))
        narrator.accept(self.request(2), stop=True)
        self.assertIsNone(self.played[-1])

    def test_new_hover_and_stop_cancel_in_flight_synthesis_before_it_can_play(self):
        entered, release = threading.Event(), threading.Event()

        def synthesize(text, path):
            entered.set()
            self.assertTrue(release.wait(3))
            write_audio(path)

        narrator = self.start(synthesize)
        first = narrator.accept(self.request(1, text="First option"))
        self.assertTrue(entered.wait(3))
        second = narrator.accept(self.request(2, text="Second option"))
        narrator.accept(self.request(3), stop=True)
        self.assertEqual(first.result["status"], "cancelled")
        self.assertEqual(second.result["status"], "cancelled")
        release.set()
        narrator.close()
        self.assertTrue(all(path is None for path in self.played))

    def test_timeout_cancellation_cannot_play_late_or_stop_a_newer_request(self):
        entered, release = threading.Event(), threading.Event()

        def synthesize(text, path):
            entered.set()
            self.assertTrue(release.wait(3))
            write_audio(path)

        narrator = self.start(synthesize)
        old = narrator.accept(self.request(1, text="Expired"))
        self.assertTrue(entered.wait(3))
        narrator.cancel(old)
        new = narrator.accept(self.request(2, text="Current"))
        narrator.cancel(old)
        release.set()
        self.assertTrue(new.done.wait(3))
        self.assertEqual(new.result["status"], "playing")
        self.assertEqual(len([path for path in self.played if path]), 1)

    def test_http_authentication_and_invalid_payloads_fail_explicitly(self):
        narrator = self.start()
        server = ThreadingHTTPServer(("127.0.0.1", 0), companion.handler(narrator, "test-token"))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        endpoint = f"http://127.0.0.1:{server.server_port}"
        try:
            with self.assertRaises(urllib.error.HTTPError) as denied:
                urllib.request.urlopen(endpoint + "/health", timeout=3)
            self.assertEqual(denied.exception.code, 403)
            request = urllib.request.Request(endpoint + "/health", headers={"X-Anthro-Token": "test-token"})
            with urllib.request.urlopen(request, timeout=3) as response:
                self.assertTrue(json.load(response)["ready"])
            for data in [[], self.request(True, text="Invalid"), self.request(1, tag="../../outside", text="Invalid")]:
                request = urllib.request.Request(endpoint + "/speak", json.dumps(data).encode(),
                                                 headers={"X-Anthro-Token": "test-token"})
                with self.assertRaises(urllib.error.HTTPError) as invalid:
                    urllib.request.urlopen(request, timeout=3)
                self.assertEqual(invalid.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)

    def test_native_log_bridge_acknowledges_real_playback_and_ignores_other_sessions(self):
        target = self.audio / "anthro_narrator_leader_test.wav"
        write_audio(target)
        narrator = self.start()
        log, connection = self.audio / "UI.log", self.audio / "connection.json"
        log.touch()
        config = {"bridge": "native-test", "states": {}}
        companion.builder.save_index(config, connection)
        bridge = companion.LogBridge(narrator, log, connection, config)
        try:
            wrong = self.request(1, action="speak", bridge="other-session", text="Ignore")
            actual = self.request(2, action="speak", bridge="native-test", tag="ANTHRO_NARRATOR_LEADER_TEST")
            with log.open("a", encoding="utf-8") as output:
                for data in (wrong, actual):
                    output.write("[timestamp]\t" + companion.BRIDGE_PREFIX + json.dumps(data) + "\n")
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                state = json.loads(connection.read_text())
                if state.get("states", {}).get("test-client", {}).get("status") == "playing":
                    break
                threading.Event().wait(0.05)
            self.assertEqual(state["states"]["test-client"]["request"], 2)
            self.assertEqual(state["states"]["test-client"]["status"], "playing")
            self.assertEqual([path for path in self.played if path], [target])
        finally:
            bridge.close()


if __name__ == "__main__":
    unittest.main()
