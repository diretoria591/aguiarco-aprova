#!/usr/bin/env python3
"""Transcribe candidate splices to check a cut before rendering.

Usage: python3 probe.py WORKDIR "a:b,c:d" ["a:b" ...]
Each argument is a comma-separated list of start:end ranges (seconds, source timeline)
that get concatenated and transcribed. Use it to (1) hear what a short span says, and
(2) confirm that a splice keeps every wanted word and drops the retake.
Also: python3 probe.py WORKDIR --db a:b   prints the 10 ms loudness envelope (dBFS);
dips below about -50 are the gaps between words, the safest places to cut.
"""
import os, sys, wave
import numpy as np
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

wd = sys.argv[1]
if sys.argv[2] == "--db":
    db = np.load(os.path.join(wd, "db.npy"))
    for r in sys.argv[3:]:
        t0, t1 = map(float, r.split(":"))
        print(f"{t0}: " + " ".join(f"{int(v)}" for v in db[int(t0 * 100): int(t1 * 100)]))
    sys.exit()
w = wave.open(os.path.join(wd, "audio.wav"))
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
from faster_whisper import WhisperModel
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
for spec in sys.argv[2:]:
    parts = [tuple(map(float, p.split(":"))) for p in spec.split(",")]
    clip = np.concatenate([x[int(s * 16000): int(e * 16000)] for s, e in parts])
    segs, _ = m.transcribe(clip, language=os.environ.get("FALA_LINGUA", "pt"), condition_on_previous_text=False)
    print(spec, "=>", " ".join(s.text.strip() for s in segs))
