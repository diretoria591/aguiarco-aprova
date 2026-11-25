#!/usr/bin/env python3
"""Transcribe the edited audio so the result can be read end to end for leftover
repetitions, clipped words or broken sentences. Usage: python3 verify.py WORKDIR"""
import os, sys, wave
import numpy as np
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
w = wave.open(os.path.join(sys.argv[1], "edit_audio.wav"))
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
from faster_whisper import WhisperModel
m = WhisperModel("large-v3", device="cpu", compute_type="int8")
segs, _ = m.transcribe(x, language="pt", condition_on_previous_text=False, beam_size=5)
for s in segs:
    print(f"[{s.start:6.2f}-{s.end:6.2f}] {s.text.strip()}")
