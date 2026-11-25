#!/usr/bin/env python3
"""Transcreve o áudio do corte final com tempo por palavra (para a legenda).

Uso: python3 palavras.py AUDIO.wav SAIDA.json [--model large-v3]
Grava uma lista [{"w": "palavra", "a": inicio, "b": fim}, ...] no tempo do vídeo cortado.
Transcrever o corte final (e não o bruto) evita converter tempos e já vem sem as retomadas.
"""
import argparse, json, os
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser(); ap.add_argument("audio"); ap.add_argument("saida")
ap.add_argument("--model", default="large-v3"); a = ap.parse_args()
m = WhisperModel(a.model, device="cpu", compute_type="int8")
segs, _ = m.transcribe(a.audio, language="pt", word_timestamps=True, vad_filter=False,
                       condition_on_previous_text=False, beam_size=5)
out = [{"w": w.word.strip(), "a": round(w.start, 3), "b": round(w.end, 3)} for s in segs for w in s.words]
json.dump(out, open(a.saida, "w"), ensure_ascii=False, indent=0)
print(len(out), "palavras ->", a.saida)
