#!/usr/bin/env python3
"""Transcreve o áudio do corte final com tempo por palavra (para a legenda).

Uso: python3 palavras.py AUDIO.wav SAIDA.json [--model large-v3]
Grava uma lista [{"w": "palavra", "a": inicio, "b": fim}, ...] no tempo do vídeo cortado.
Transcrever o corte final (e não o bruto) evita converter tempos e já vem sem as retomadas.
"""
import argparse, json, os, subprocess
import numpy as np
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
from faster_whisper import WhisperModel

ap = argparse.ArgumentParser(); ap.add_argument("audio"); ap.add_argument("saida")
ap.add_argument("--model", default="large-v3"); ap.add_argument("--lingua", default="pt"); a = ap.parse_args()
m = WhisperModel(a.model, device="cpu", compute_type="int8")
# lê o áudio com o ffmpeg (o decodificador interno do faster-whisper quebra com algumas versões do PyAV)
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", a.audio, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
segs, _ = m.transcribe(audio, language=a.lingua, word_timestamps=True, vad_filter=False,
                       condition_on_previous_text=False, beam_size=5)
out = [{"w": w.word.strip(), "a": round(w.start, 3), "b": round(w.end, 3)} for s in segs for w in s.words]
json.dump(out, open(a.saida, "w"), ensure_ascii=False, indent=0)
print(len(out), "palavras ->", a.saida)
