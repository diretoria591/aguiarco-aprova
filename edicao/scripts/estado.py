#!/usr/bin/env python3
"""Lê e muda o estado de um vídeo (_CLAUDE/projeto.json) sem abrir o arquivo inteiro.

Uso:
  estado.py PASTA status                  etapas, pendências e entregas
  estado.py PASTA iniciar URL_OU_ARQUIVO   cria o projeto.json
  estado.py PASTA --etapa cortes=concluido
  estado.py PASTA --set chave valor       (valor em JSON se possível)
  estado.py PASTA --pendencia etapa "texto"   |   --resolver p01
"""
import json, os, sys, datetime
ETAPAS = ["preparar", "cortes", "legenda", "visuais", "sons", "render"]
pasta = sys.argv[1]; f = os.path.join(pasta, "_CLAUDE", "projeto.json")
args = sys.argv[2:]
if args[:1] == ["iniciar"]:
    os.makedirs(os.path.dirname(f), exist_ok=True)
    if os.path.exists(f): sys.exit("já existe: " + f)
    json.dump({"origem": args[1], "perfil": "teresa-melo", "criado": str(datetime.date.today()),
               "etapas": {e: "pendente" for e in ETAPAS}, "entregas": [], "pendencias": []},
              open(f, "w"), ensure_ascii=False, indent=1)
    print("criado", f); sys.exit()
P = json.load(open(f))
if args[:1] == ["status"]:
    print("origem:", P["origem"])
    print("etapas:", " → ".join(f"{e} [{P['etapas'].get(e, '?')}]" for e in ETAPAS))
    for p in P["pendencias"]:
        if not p.get("resolvida"): print(f"pendência {p['id']} ({p['etapa']}): {p['texto']}")
    for e in P["entregas"][-3:]: print("entrega:", e)
    sys.exit()
i = 0
while i < len(args):
    a = args[i]
    if a == "--etapa": k, v = args[i + 1].split("="); P["etapas"][k] = v; i += 2
    elif a == "--set":
        try: v = json.loads(args[i + 2])
        except ValueError: v = args[i + 2]
        P[args[i + 1]] = v; i += 3
    elif a == "--pendencia":
        P["pendencias"].append({"id": f"p{len(P['pendencias']) + 1:02d}", "etapa": args[i + 1], "texto": args[i + 2]}); i += 3
    elif a == "--resolver":
        for p in P["pendencias"]:
            if p["id"] == args[i + 1]: p["resolvida"] = True
        i += 2
    elif a == "--entrega": P["entregas"].append(args[i + 1]); i += 2
    else: sys.exit("não entendi: " + a)
json.dump(P, open(f, "w"), ensure_ascii=False, indent=1); print("ok")
