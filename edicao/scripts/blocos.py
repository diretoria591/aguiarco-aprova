#!/usr/bin/env python3
"""Agrupa as palavras em blocos curtos de legenda (3 a 5 palavras, cabendo na largura).

Uso: python3 blocos.py PALAVRAS.json SAIDA.json [--fonte edicao/fontes/Nunito-900.ttf]
Quebra em pontuação, em pausa > 0,35 s, ao passar de 5 palavras ou da largura máxima.
Cada bloco: {"id": "l001", "a": ini, "b": fim, "pt": "...", "en": ""}. O Claude revisa o "pt"
(grafia, nomes) e preenche o "en" com a tradução natural do bloco, sem mudar os tempos.
"""
import argparse, json, os
from PIL import ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument("palavras"); ap.add_argument("saida")
ap.add_argument("--fonte", default=os.path.join(AQUI, "..", "fontes", "Nunito-900.ttf"))
ap.add_argument("--tam", type=int, default=72); ap.add_argument("--largura", type=int, default=860)
a = ap.parse_args()
F = ImageFont.truetype(a.fonte, a.tam)
W = json.load(open(a.palavras))
blocos, cur = [], []

def fecha():
    if cur:
        blocos.append({"a": cur[0]["a"], "b": cur[-1]["b"], "pt": " ".join(x["w"] for x in cur)})
        cur.clear()

for i, w in enumerate(W):
    txt = " ".join([x["w"] for x in cur] + [w["w"]])
    if cur and (len(cur) >= 5 or F.getlength(txt) > a.largura or w["a"] - cur[-1]["b"] > 0.35):
        fecha()
    cur.append(w)
    if w["w"][-1:] in ".?!,;:" and len(cur) >= 2:
        fecha()
fecha()
# cada bloco fica na tela até o próximo começar (sem piscar), no máximo 0,6 s depois da fala
for i, bl in enumerate(blocos):
    nxt = blocos[i + 1]["a"] if i + 1 < len(blocos) else bl["b"] + 0.6
    bl["b"] = round(min(nxt, bl["b"] + 0.6), 3)
    bl["pt"] = bl["pt"].strip(" ,;:")
    bl["id"] = f"l{i + 1:03d}"; bl["en"] = ""
json.dump([{k: b[k] for k in ("id", "a", "b", "pt", "en")} for b in blocos],
          open(a.saida, "w"), ensure_ascii=False, indent=1)
print(len(blocos), "blocos ->", a.saida)
