#!/usr/bin/env python3
"""Padroniza um som e registra no índice da biblioteca.

Uso: python3 som_novo.py ORIGEM TIPO NOME "fonte e licença" [--max 2.0]
Corta o silêncio do começo, limita a duração, normaliza o pico em -3 dBFS, salva em
edicao/sons/TIPO/NOME.wav (48 kHz estéreo) e anota em edicao/sons/indice.json a duração e o tempo até o pico.
"""
import json, os, subprocess, sys, wave
import numpy as np
AQUI = os.path.dirname(os.path.abspath(__file__)); BASE = os.path.join(AQUI, "..", "sons")
orig, tipo, nome, fonte = sys.argv[1:5]
mx = float(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 2.0
os.makedirs(os.path.join(BASE, tipo), exist_ok=True)
dst = os.path.join(BASE, tipo, nome + ".wav"); tmp = dst + ".tmp.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", orig, "-af",
                f"silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:{mx},afade=t=out:st={mx - 0.05}:d=0.05",
                "-ar", "48000", "-ac", "2", tmp], check=True)
w = wave.open(tmp); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32); w.close()
pico = np.abs(x).max() or 1
g = 20 * np.log10(32767 * 10 ** (-3 / 20) / pico)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", f"volume={g:.2f}dB", dst], check=True); os.remove(tmp)
env = np.abs(x.reshape(-1, 2)).max(1)
t_pico = float(np.argmax(np.convolve(env, np.ones(480) / 480, "same")) / 48000)
dur = len(env) / 48000
idx_f = os.path.join(BASE, "indice.json")
idx = json.load(open(idx_f)) if os.path.exists(idx_f) else []
idx = [i for i in idx if i["arquivo"] != f"{tipo}/{nome}.wav"]
idx.append({"arquivo": f"{tipo}/{nome}.wav", "tipo": tipo, "duracao": round(dur, 3), "pico": round(t_pico, 3), "fonte": fonte})
json.dump(sorted(idx, key=lambda i: i["arquivo"]), open(idx_f, "w"), ensure_ascii=False, indent=1)
print(f"{tipo}/{nome}.wav  {dur:.2f}s  pico {t_pico:.2f}s")
