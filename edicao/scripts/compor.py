#!/usr/bin/env python3
"""Monta o vídeo final da /reel-teresa-melo: corte + fotos + destaques + legenda PT/EN + sons.

Uso: python3 compor.py CORTE.mp4 PLANO.json SAIDA.mp4 [--rascunho]
Todos os tempos do PLANO estão no tempo do vídeo cortado (CORTE.mp4).

PLANO.json:
{
  "perfil": "edicao/perfis/teresa-melo/estilo.json",
  "rosto_y": 0.42,                       # altura do rosto no quadro (fração), para descer a câmera nas fotos
  "legenda_y": 1460, "legenda_y_com_foto": 1530,   # opcional: muda a altura da legenda só neste vídeo
  "legendas": [{"id": "l001", "a": 0.0, "b": 1.2, "pt": "...", "en": "..."}],
  "fotos":    [{"id": "f01", "a": 5.0, "b": 8.0, "arquivo": "caminho.jpg", "foco_y": 0.5}],
  "destaques":[{"id": "d01", "a": 12.0, "b": 13.6, "texto": "3 SINAIS"}],
  "sons":     [{"id": "sfx01", "t": 5.0, "arquivo": "whoosh.wav", "db": -20, "alinhar": "inicio"}]
}
Como funciona: o Python lê o corte quadro a quadro, desenha tudo por cima (PIL/numpy) e manda os
quadros para o FFmpeg. Depois o FFmpeg mistura os sons sob a voz. --rascunho sai em 540x960, mais rápido.
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
corte, planof, saida = sys.argv[1:4]
RASC = "--rascunho" in sys.argv
P = json.load(open(planof))
EST = json.load(open(P.get("perfil") or os.path.join(AQUI, "..", "perfis", "teresa-melo", "estilo.json")))
W, H = 1080, 1920
fps = eval(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                    "stream=r_frame_rate", "-of", "csv=p=0", corte]).decode().strip())
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", corte]))
N = int(round(dur * fps))
fonte = lambda tam: ImageFont.truetype(os.path.join(AQUI, "..", EST["fonte"]), tam)
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def caixa_texto(txt, tam, cor_txt, cor_cx, padx, pady, raio, sombra=True):
    """Uma caixa arredondada com o texto, numa imagem RGBA recortada (com sombra suave)."""
    while tam > 30 and fonte(tam).getlength(txt) + 2 * padx > EST["legenda"].get("largura_max", 900) + 60:
        tam -= 2  # nunca deixar a caixa passar da tela: diminui a letra até caber
    f = fonte(tam)
    l, t, r, b = f.getbbox(txt)
    tw, th = r - l, f.getbbox("Hg")[3] - f.getbbox("Hg")[1]
    bw, bh = int(tw + 2 * padx), int(th + 2 * pady)
    m = 24
    im = Image.new("RGBA", (bw + 2 * m, bh + 2 * m), (0, 0, 0, 0))
    if sombra:
        s = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(s).rounded_rectangle([m, m + 6, m + bw, m + bh + 6], raio, fill=(0, 0, 0, 90))
        im = Image.alpha_composite(im, s.filter(ImageFilter.GaussianBlur(8)))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([m, m, m + bw, m + bh], raio, fill=hexrgb(cor_cx) + (255,))
    d.text((m + padx - l, m + pady - f.getbbox("Hg")[1]), txt, font=f, fill=hexrgb(cor_txt) + (255,))
    return im, m


# ---------- pré-desenho: legendas, destaques e fotos ----------
L = EST["legenda"]
leg_imgs = {}
def camada_legenda(lg, centro):
    pt, m1 = caixa_texto(lg["pt"], L["pt_tam"], L["pt_texto"], L["pt_caixa"], L["padx"], L["pady"], L["raio"])
    camada = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    y_pt = int(centro - pt.height / 2)
    camada.alpha_composite(pt, (int((W - pt.width) / 2), y_pt))
    if lg.get("en"):
        en, m2 = caixa_texto(lg["en"], L["en_tam"], L["en_texto"], L["en_caixa"], L["padx"], L["pady"], L["raio"])
        y_en = y_pt + pt.height - m1 - m2 + L["espaco"]
        camada.alpha_composite(en, (int((W - en.width) / 2), y_en))
    return camada


# o plano pode mudar a altura da legenda neste vídeo (ex.: ela se enquadrou mais baixo)
y_sem, y_com = P.get("legenda_y", L["pt_centro_y"]), P.get("legenda_y_com_foto", L["pt_centro_y_com_foto"])
for lg in P.get("legendas", []):
    leg_imgs[lg["id"]] = (camada_legenda(lg, y_sem), camada_legenda(lg, y_com))

D = EST["destaque"]
dest_imgs = {d["id"]: caixa_texto(d["texto"], D["tam"], D["texto_cor"], D["caixa"], D["padx"], D["pady"], D["raio"])[0]
             for d in P.get("destaques", [])}

F = EST["foto"]
foto_imgs = {}
for ft in P.get("fotos", []):
    im = Image.open(ft["arquivo"]).convert("RGB")
    fh = F["altura"]
    esc = max(W / im.width, fh / im.height)
    im = im.resize((int(im.width * esc + 0.5), int(im.height * esc + 0.5)), Image.LANCZOS)
    fy = ft.get("foco_y", 0.5)
    y0 = int(min(max(0, im.height * fy - fh / 2), im.height - fh)); x0 = int((im.width - W) / 2)
    foto_imgs[ft["id"]] = np.asarray(im.crop((x0, y0, x0 + W, y0 + fh)))


def ativo(lista, t):
    return [x for x in lista if x["a"] <= t < x["b"]]


def anim_escala(dt):
    """Entrada 'pop' do destaque: 0,7 -> 1,08 -> 1,0 em ~0,25 s (curva suave, sem quique longo)."""
    if dt >= 0.25: return 1.0
    if dt < 0.15: x = dt / 0.15; return 0.7 + 0.38 * (1 - (1 - x) ** 3)
    x = (dt - 0.15) / 0.10; return 1.08 - 0.08 * x


rosto_y = P.get("rosto_y", 0.42)
fh = F["altura"]
# na foto, a câmera desce para o rosto ficar logo abaixo da foto (rosto_alvo_y do perfil)
desloc = int(min(max(0, F.get("rosto_alvo_y", 1080) - rosto_y * H), fh))

dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", corte, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                       stdout=subprocess.PIPE)
ow, oh = (540, 960) if RASC else (W, H)
tmp_video = saida + ".video.mp4"
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                        "-r", str(fps), "-i", "-", "-vf", f"scale={ow}:{oh}:flags=lanczos,format=yuv420p",
                        "-c:v", "libx264", "-preset", "veryfast" if RASC else "medium", "-crf", "26" if RASC else "17",
                        tmp_video], stdin=subprocess.PIPE)
for i in range(N + 5):
    raw = dec.stdout.read(W * H * 3)
    if len(raw) < W * H * 3: break
    t = i / fps
    fr = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
    fotos = ativo(P.get("fotos", []), t)
    if fotos:
        novo = np.empty_like(fr)
        novo[desloc:] = fr[:H - desloc]; novo[:desloc] = fr[0]
        novo[:fh] = foto_imgs[fotos[0]["id"]]
        fr = novo
    im = Image.fromarray(fr).convert("RGBA")
    for d in ativo(P.get("destaques", []), t):
        di = dest_imgs[d["id"]]
        k = anim_escala(t - d["a"])
        dj = di.resize((max(1, int(di.width * k)), max(1, int(di.height * k))), Image.BILINEAR) if k != 1 else di
        cy = D["centro_y_com_foto"] if fotos else D["centro_y"]
        im.alpha_composite(dj, (int((W - dj.width) / 2), int(cy - dj.height / 2)))
    for lg in ativo(P.get("legendas", []), t):
        im.alpha_composite(leg_imgs[lg["id"]][1 if fotos else 0])
    enc.stdin.write(im.convert("RGB").tobytes())
enc.stdin.close(); enc.wait(); dec.wait()

# ---------- áudio: voz do corte + efeitos sonoros ----------
sons = P.get("sons", [])
ins, flt = ["-i", tmp_video, "-i", corte], []
for k, s in enumerate(sons):
    ins += ["-i", s["arquivo"]]
    ms = max(0, int(s["t"] * 1000))
    flt.append(f"[{k + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={s.get('db', -18)}dB,adelay={ms}|{ms}[s{k}]")
if sons:
    mix = "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[v];" + ";".join(flt) + ";" + \
          "[v]" + "".join(f"[s{k}]" for k in range(len(sons))) + \
          f"amix=inputs={len(sons) + 1}:normalize=0:duration=first,alimiter=limit=0.89[a]"
    amap = ["-filter_complex", mix, "-map", "0:v", "-map", "[a]"]
else:
    amap = ["-map", "0:v", "-map", "1:a"]
subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, *amap, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", saida], check=True)
os.remove(tmp_video)
print(f"{N} quadros, {len(P.get('legendas', []))} legendas, {len(P.get('fotos', []))} fotos, "
      f"{len(P.get('destaques', []))} destaques, {len(sons)} sons -> {saida}")
