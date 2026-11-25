"""Authenticated, loopback-only playback of the offline Anthroprocenia narrator."""

import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sys
import threading
import time
import uuid
import wave

spec = importlib.util.spec_from_file_location("build_narration", Path(__file__).with_name("build-narration.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
LOG = logging.getLogger("anthroprocenia.narrator")
BRIDGE_PREFIX = "[ANTHRO-NARRATION] "


class Job:
    def __init__(self, sequence, tag, text):
        self.sequence, self.tag, self.text = sequence, tag, text
        self.done = threading.Event()
        self.result = None


class Narrator:
    def __init__(self, audio, cache, playback, synthesize=None):
        self.audio, self.cache, self.playback = Path(audio), Path(cache), playback
        self.cache.mkdir(parents=True, exist_ok=True)
        self.synthesize = synthesize
        self.engine = None
        self.condition = threading.Condition()
        self.sequence = 0
        self.pending = self.active = None
        self.closed = False
        self.clients = {}
        groups = json.loads((self.audio / "scripts.json").read_text(encoding="utf-8"))
        self.scripts = {"ANTHRO_NARRATOR_" + key: text for group in groups.values() for key, text in group.items()}
        self.worker = threading.Thread(target=self.run, name="offline-narrator", daemon=True)
        self.worker.start()

    def accept(self, data, stop=False):
        client, request = data.get("client"), data.get("request")
        if not isinstance(client, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", client):
            raise ValueError("Invalid client.")
        if isinstance(request, bool) or not isinstance(request, int) or not 0 < request < 2**53:
            raise ValueError("Invalid request sequence.")
        tag, text = data.get("tag", ""), data.get("text", "")
        if not isinstance(tag, str) or not re.fullmatch(r"[A-Z0-9_]{0,180}", tag):
            raise ValueError("Invalid narration key.")
        if not isinstance(text, str) or len(text) > 6000:
            raise ValueError("Narration text is too long or invalid.")
        text = self.scripts.get(tag, builder.spoken_text(text))
        if not stop and tag != "NARRATOR_PREVIEW" and not text:
            raise ValueError("Narration text is empty.")
        with self.condition:
            if self.closed:
                raise RuntimeError("Narrator is shutting down.")
            if request <= self.clients.get(client, 0):
                return None
            if client not in self.clients and len(self.clients) >= 16:
                del self.clients[next(iter(self.clients))]
            self.clients[client] = request
            self.sequence += 1
            for job in (self.pending, self.active):
                if job and not job.done.is_set():
                    job.result = {"status": "cancelled"}
                    job.done.set()
            self.playback(None)
            self.pending = None if stop else Job(self.sequence, tag, text)
            self.condition.notify()
            return self.pending

    def recording(self, job):
        filename = "narrator-preview.wav" if job.tag == "NARRATOR_PREVIEW" else job.tag.lower() + ".wav"
        prerecorded = self.audio / filename
        if job.tag and prerecorded.is_file():
            return prerecorded, builder.validate_wav(prerecorded)
        digest = hashlib.sha256((builder.VOICE + str(builder.SPEED) + job.text).encode()).hexdigest()
        target = self.cache / (digest + ".wav")
        if not target.is_file():
            if self.synthesize:
                self.synthesize(job.text, target)
            else:
                if self.engine is None:
                    self.engine = builder.model()
                builder.record(self.engine, job.text, target)
        return target, builder.validate_wav(target)

    def cancel(self, job):
        with self.condition:
            if job.sequence == self.sequence:
                self.sequence += 1
                self.pending = None
                self.playback(None)
            if not job.done.is_set():
                job.result = {"status": "cancelled"}
                job.done.set()

    def run(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.closed or self.pending is not None)
                if self.closed:
                    return
                job, self.pending = self.pending, None
                self.active = job
            try:
                path, duration = self.recording(job)
                with self.condition:
                    if job.sequence != self.sequence or self.closed:
                        continue
                    self.playback(path)
                    job.result = {"status": "playing", "duration": duration}
                    job.done.set()
                    LOG.info("Playing %s (%.2fs)", path.name, duration)
            except (OSError, ValueError, RuntimeError, wave.Error) as error:
                LOG.exception("Narration playback/synthesis failed")
                with self.condition:
                    if not job.done.is_set():
                        job.result = {"status": "error", "message": str(error)}
                        job.done.set()
            finally:
                with self.condition:
                    if self.active is job:
                        self.active = None

    def close(self):
        with self.condition:
            self.closed = True
            self.sequence += 1
            self.playback(None)
            for job in (self.pending, self.active):
                if job and not job.done.is_set():
                    job.result = {"status": "cancelled"}
                    job.done.set()
            self.condition.notify()
        self.worker.join(timeout=60)
        if self.worker.is_alive():
            LOG.error("Synthesis did not stop within the shutdown deadline.")


def handler(narrator, token):
    class Handler(BaseHTTPRequestHandler):
        def response(self, code, value):
            body = json.dumps(value).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Anthro-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                LOG.info("Narration client disconnected before receiving its response.")

        def authorized(self):
            supplied = self.headers.get("X-Anthro-Token", "")
            if not secrets.compare_digest(supplied, token):
                self.response(403, {"error": "Unauthorized"})
                return False
            return True

        def do_OPTIONS(self):
            self.response(200, {})

        def do_GET(self):
            if self.authorized():
                self.response(200 if self.path == "/health" else 404,
                              {"ready": not narrator.closed and narrator.worker.is_alive()} if self.path == "/health" else {"error": "Unknown route"})

        def do_POST(self):
            if not self.authorized():
                return
            if self.path not in ("/speak", "/stop"):
                self.response(404, {"error": "Unknown route"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 32768:
                    raise ValueError("Invalid request length.")
                self.connection.settimeout(5)
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError("Expected a narration request object.")
                job = narrator.accept(data, self.path == "/stop")
            except (ValueError, UnicodeError) as error:
                LOG.warning("Rejected invalid narration request: %s", error)
                self.response(400, {"error": str(error)})
                return
            except (OSError, RuntimeError) as error:
                LOG.error("Cannot accept narration request: %s", error)
                self.response(503, {"error": str(error)})
                return
            if job is None:
                self.response(200, {"status": "stopped" if self.path == "/stop" else "cancelled"})
            elif not job.done.wait(45):
                narrator.cancel(job)
                LOG.error("Narration request timed out before playback.")
                self.response(504, {"error": "Synthesis timed out"})
            else:
                result = job.result
                self.response(500 if result["status"] == "error" else 200, result)

        def log_message(self, format_, *args):
            LOG.info(format_, *args)
    return Handler


class LogBridge:
    def __init__(self, narrator, log, connection, config):
        self.narrator, self.log, self.connection, self.config = narrator, Path(log), Path(connection), config
        self.closed = threading.Event()
        self.jobs, self.states = {}, {}
        self.offset = self.log.stat().st_size if self.log.is_file() else 0
        self.worker = threading.Thread(target=self.run, name="native-narration-bridge", daemon=True)
        self.worker.start()

    def receive(self, line):
        if BRIDGE_PREFIX not in line:
            return
        try:
            data = json.loads(line.split(BRIDGE_PREFIX, 1)[1])
            if not isinstance(data, dict) or data.get("bridge") != self.config["bridge"]:
                return
            action = data.get("action")
            if action not in ("speak", "stop", "ping"):
                raise ValueError("Unknown native narration action.")
            client = data.get("client")
            previous = self.states.get(client, {}).get("request", 0) if isinstance(client, str) else 0
            if isinstance(data.get("request"), int) and data["request"] <= previous:
                return
            job = self.narrator.accept(data, action != "speak")
            if client not in self.states and len(self.states) >= 16:
                oldest = next(iter(self.states))
                del self.states[oldest]
                self.jobs.pop(oldest, None)
            self.states[client] = {"request": data["request"],
                                   "status": "pending" if job else ("ready" if action == "ping" else "stopped")}
            if job:
                self.jobs[client] = job
            else:
                self.jobs.pop(client, None)
        except (ValueError, RuntimeError, OSError) as error:
            LOG.error("Rejected native narration request: %s", error)

    def run(self):
        offset = self.offset
        buffer = b""
        written = None
        while not self.closed.wait(0.1):
            try:
                if self.log.is_file():
                    size = self.log.stat().st_size
                    if size < offset:
                        offset, buffer = 0, b""
                    with self.log.open("rb") as source:
                        source.seek(offset)
                        chunk = source.read(65536)
                        offset = source.tell()
                    buffer += chunk
                    lines = buffer.split(b"\n")
                    buffer = lines.pop()
                    if len(buffer) > 65536:
                        LOG.error("Native UI log contains an oversized incomplete line.")
                        buffer = b""
                    for line in lines:
                        self.receive(line.decode("utf-8"))
                for client, job in list(self.jobs.items()):
                    if job.done.is_set():
                        self.states[client] = {"request": self.states[client]["request"], **job.result}
                        del self.jobs[client]
                state = json.dumps(self.states, sort_keys=True)
                now = int(time.time() * 1000)
                if state != written:
                    self.config.update(states=self.states, updated=now,
                                       ready=not self.narrator.closed and self.narrator.worker.is_alive())
                    builder.save_index(self.config, self.connection)
                    written = state
            except (OSError, UnicodeError) as error:
                LOG.error("Native narration bridge I/O failed: %s", error)
                self.closed.wait(2)

    def close(self):
        self.closed.set()
        self.worker.join(timeout=5)


def main():
    import winsound

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=48731)
    parser.add_argument("--mod", type=Path, default=Path(os.environ["LOCALAPPDATA"]) /
                        "Firaxis Games" / "Sid Meier's Civilization VII" / "Mods" / "anthroprocenia")
    args = parser.parse_args()
    connection = args.mod / "ui" / "narration" / "connection.json"
    if not connection.parent.is_dir():
        parser.error("Install the narration UI before starting its companion.")
    token = secrets.token_urlsafe(32)

    def playback(path):
        winsound.PlaySound(str(path) if path else None,
                           winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT)

    narrator = Narrator(builder.OUTPUT, builder.CACHE.parent / "recordings", playback)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(narrator, token))
    server.daemon_threads = True
    config = {"endpoint": f"http://127.0.0.1:{server.server_port}", "token": token,
              "bridge": uuid.uuid4().hex, "ready": True, "updated": int(time.time() * 1000), "states": {}}
    builder.save_index(config, connection)
    log = args.mod.parents[1] / "Logs" / "UI.log"
    bridge = LogBridge(narrator, log, connection, config)
    LOG.info("Offline narrator ready on loopback port %s", server.server_port)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        bridge.close()
        narrator.close()
        builder.save_index({"endpoint": config["endpoint"], "token": "", "bridge": "", "ready": False}, connection)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    main()
