#!/usr/bin/env python3
"""Monta legendas.json a partir de blocos escritos à mão por índice de palavra.

Uso: python3 blocos_por_indice.py PALAVRAS.json BLOCOS.json SAIDA.json
BLOCOS.json: [[i, j, "texto em inglês", "texto em português"], ...] cobrindo as palavras 0..N-1 em ordem.
(Veja os índices com: python3 -c "import json;W=json.load(open('palavras.json'));print(' '.join(f'{i}:{w[\"w\"]}' for i,w in enumerate(W)))")
Avisa os blocos largos demais para a tela.
"""
import json, os, sys
from PIL import ImageFont
AQUI = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2]))
E = json.load(open(os.path.join(AQUI, "..", "perfis", "teresa-melo", "estilo.json")))["legenda"]
fonte = os.path.join(AQUI, "..", "fontes", "Nunito-900.ttf")
FP, FE = ImageFont.truetype(fonte, E["pt_tam"]), ImageFont.truetype(fonte, E["en_tam"])
assert B[0][0] == 0 and B[-1][1] == len(W) - 1, "os blocos precisam cobrir todas as palavras"
out = []
for k, (i, j, en, pt) in enumerate(B):
    if k: assert i == B[k - 1][1] + 1, f"buraco ou sobreposição antes do bloco {k + 1}"
    out.append({"id": f"l{k + 1:03d}", "a": round(max(0, W[i]["a"] - 0.05), 3), "b": W[j]["b"], "pt": pt, "en": en})
for k, o in enumerate(out):
    nxt = out[k + 1]["a"] if k + 1 < len(out) else o["b"] + 0.6
    o["b"] = round(min(nxt, o["b"] + 0.6), 3)
    if FP.getlength(o["pt"]) > E["largura_max"] or FE.getlength(o["en"]) > E["largura_max"]:
        print("LARGO DEMAIS (divida o bloco):", o["id"], o["pt"], "|", o["en"])
json.dump(out, open(sys.argv[3], "w"), ensure_ascii=False, indent=1)
print(len(out), "blocos ->", sys.argv[3])
