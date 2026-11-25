#!/usr/bin/env python3
"""Acha travadas e muletas ("é...", "hum", "ã", sílaba solta) que o Whisper não escreve.

Uso: python3 muletas.py WORKDIR [--min 0.12]
Lê WORKDIR/edit_audio.wav (áudio do corte), WORKDIR/palavras.json (tempo por palavra no corte)
e WORKDIR/segments.json (trechos do original que formam o corte).
Procura trechos com voz (envelope > -45 dB) que não caem em nenhuma palavra transcrita
e palavras alongadas ("ééé"). Imprime cada candidato no tempo do corte E no tempo do original,
pronto para virar um corte no edit.json. Confira cada um com o probe.py antes de cortar.
"""
import json, os, subprocess, sys
import numpy as np
wd = sys.argv[1]; MIN = float(sys.argv[sys.argv.index("--min") + 1]) if "--min" in sys.argv else 0.12
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(wd, "edit_audio.wav"), "-ac", "1", "-ar", "16000",
                      "-f", "s16le", "-"], capture_output=True, check=True).stdout
x = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768
hop = 160; n = len(x) // hop
db = 20 * np.log10(np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
voz = db > -45
W = json.load(open(os.path.join(wd, "palavras.json")))
coberto = np.zeros(n, bool)
for w in W:
    coberto[max(0, int(w["a"] * 100) - 4):int(w["b"] * 100) + 4] = True
segs = json.load(open(os.path.join(wd, "segments.json")))
# tempo do corte -> tempo do original (o render encurta pausas; aqui usamos a soma dos trechos)
acc, mapa = 0.0, []
for s, e in segs:
    mapa.append((acc, acc + e - s, s)); acc += e - s
def orig(t):
    for a, b, s in mapa:
        if a <= t <= b: return s + t - a
    return None
cands, i = [], 0
while i < n:
    if voz[i] and not coberto[i]:
        j = i
        while j < n and voz[j] and not coberto[j]: j += 1
        if (j - i) / 100 >= MIN: cands.append((i / 100, j / 100, "voz sem palavra"))
        i = j
    else:
        i += 1
for w in W:
    d = w["b"] - w["a"]; letras = len(w["w"].strip(".,!?"))
    if d > 0.9 and letras <= 3: cands.append((w["a"], w["b"], f"palavra curta alongada: {w['w']}"))
for a, b, tipo in sorted(cands):
    oa, ob = orig(a), orig(b)
    print(f"corte {a:7.2f}-{b:7.2f} | original {oa if oa is None else round(oa, 2)}-{ob if ob is None else round(ob, 2)} | {tipo}")
