#!/usr/bin/env python3
"""Gera a apresentação (.pptx) do relatório mensal de um cliente, no visual da Aguiar&Co.

Uso:  python3 scripts/apresentacao.py dados.json saida.pptx
dados.json é o resultado de scripts/apresentacao.sql (o objeto "data").
O .pptx sobe no Google Drive convertido em Google Slides para a estrategista editar.
Requer: pip install python-pptx pillow
"""
import io
import json
import sys
import urllib.request
from datetime import datetime

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Inches, Pt

INK, INK2, MUTED = RGBColor(0x2C, 0x2C, 0x2C), RGBColor(0x55, 0x52, 0x50), RGBColor(0x8C, 0x87, 0x81)
LINE, BG, SAND = RGBColor(0xE8, 0xE4, 0xE0), RGBColor(0xF7, 0xF6, 0xF4), RGBColor(0xE1, 0xCA, 0xBA)
SAND3, BROWN, WHITE = RGBColor(0xFA, 0xF6, 0xF2), RGBColor(0x7A, 0x5A, 0x47), RGBColor(0xFF, 0xFF, 0xFF)
OK, FIX = RGBColor(0x55, 0x70, 0x4F), RGBColor(0xA6, 0x5F, 0x3E)
FONT = 'Poppins'
W, H = Inches(13.333), Inches(7.5)

MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
          'outubro', 'novembro', 'dezembro']
MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
TYPES = {'foto': 'Foto', 'video': 'Vídeo', 'reels': 'Reels', 'carrossel': 'Carrossel', 'arte': 'Arte',
         'stories': 'Stories', 'texto': 'Texto'}
METRICS = [('seguidores', 'Seguidores no fim do mês'), ('novos_seguidores', 'Novos seguidores'),
           ('alcance', 'Contas alcançadas'), ('visualizacoes', 'Visualizações'), ('interacoes', 'Interações'),
           ('visitas_perfil', 'Visitas ao perfil'), ('cliques_link', 'Cliques no link')]


def month_label(key):
    y, m = key.split('-')
    return f'{MONTHS[int(m) - 1].capitalize()} {y}'


def day_label(ymd):
    if not ymd:
        return ''
    y, m, d = ymd[:10].split('-')
    return f'{int(d)} {MON[int(m) - 1]}'


def fetch_cover(url, cache):
    """Baixa a capa, corta em 4:5 e reduz (deixa o arquivo leve para subir no Drive)."""
    if not url:
        return None
    if url in cache:
        return cache[url]
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            im = Image.open(io.BytesIO(r.read())).convert('RGB')
        w, h = im.size
        tw = min(w, int(h * 4 / 5))
        th = int(tw * 5 / 4)
        left, top = (w - tw) // 2, (h - th) // 2
        im = im.crop((left, top, left + tw, top + th)).resize((480, 600))
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=80)
        buf.seek(0)
        cache[url] = buf.getvalue()
    except Exception as e:  # capa inacessível: usa o bloco vazio
        print(f'aviso: capa não baixou ({e})', file=sys.stderr)
        cache[url] = None
    return cache[url]


class Deck:
    def __init__(self):
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = W, H
        self.blank = self.prs.slide_layouts[6]
        self.covers = {}

    def slide(self, dark=False):
        s = self.prs.slides.add_slide(self.blank)
        s.background.fill.solid()
        s.background.fill.fore_color.rgb = INK if dark else WHITE
        return s

    def text(self, s, x, y, w, h, txt, size=16, color=INK, bold=False, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.TOP, spacing=None, light=False):
        tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = anchor
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        for i, line in enumerate(str(txt).split('\n')):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = align
            if spacing:
                p.space_after = Pt(spacing)
            r = p.add_run()
            r.text = line
            f = r.font
            f.name, f.size, f.bold, f.color.rgb = FONT, Pt(size), bold, color
            if light:
                f.name = 'Poppins Light'
        return tb

    def rect(self, s, x, y, w, h, fill, line=None, rounded=True):
        shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE,
                                 Inches(x), Inches(y), Inches(w), Inches(h))
        if rounded:
            shp.adjustments[0] = 0.08
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
        if line:
            shp.line.color.rgb = line
            shp.line.width = Pt(0.75)
        else:
            shp.line.fill.background()
        shp.shadow.inherit = False
        return shp

    def header(self, s, eyebrow, title, client, month):
        self.text(s, 0.7, 0.55, 8, 0.3, eyebrow.upper(), size=11, color=BROWN, bold=True)
        self.text(s, 0.7, 0.85, 11.5, 0.8, title, size=30, color=INK)
        self.text(s, 8.6, 0.55, 4.0, 0.3, f'{client} · {month}', size=10, color=MUTED, align=PP_ALIGN.RIGHT)
        self.text(s, 0.7, 6.95, 4, 0.3, 'Aguiar&co', size=10, color=MUTED, bold=True)

    def thumb(self, s, post, x, y, w, show_caption=False):
        h = w * 5 / 4
        data = fetch_cover(post.get('cover'), self.covers)
        if data:
            s.shapes.add_picture(io.BytesIO(data), Inches(x), Inches(y), Inches(w), Inches(h))
        else:
            box = self.rect(s, x, y, w, h, BG)
            box.text_frame.text = TYPES.get(post['format'], post['format'])
            for p in box.text_frame.paragraphs:
                p.alignment = PP_ALIGN.CENTER
                for r in p.runs:
                    r.font.name, r.font.size, r.font.color.rgb = FONT, Pt(11), MUTED
        meta = TYPES.get(post['format'], post['format'])
        if post.get('scheduled_date'):
            meta += ' · ' + day_label(post['scheduled_date'])
        self.text(s, x, y + h + 0.08, w, 0.25, meta.upper(), size=8, color=MUTED)
        self.text(s, x, y + h + 0.3, w, 0.45, post['title'], size=11, color=INK, bold=True)
        if show_caption and post.get('caption'):
            cap = ' '.join(post['caption'].split())
            cap = cap[:110] + ('…' if len(cap) > 110 else '')
            self.text(s, x, y + h + 0.62, w, 0.6, cap, size=8, color=INK2)


def build(data, out):
    client, month = data['client'], data['month']
    rep = data.get('report') or {}
    posts = [p for p in data['posts'] if p['status'] == 'approved']
    marks = rep.get('post_marks') or {}
    metrics = rep.get('metrics') or {}
    label = month_label(month)
    name = client['name']
    d = Deck()

    # 1. capa
    s = d.slide(dark=True)
    d.text(s, 0.8, 0.7, 6, 0.5, 'Aguiar&co', size=22, color=WHITE, bold=True)
    d.text(s, 0.8, 1.2, 6, 0.3, 'RELATÓRIO MENSAL', size=11, color=SAND, bold=True)
    d.text(s, 0.8, 3.6, 11.5, 1.2, name, size=48, color=WHITE)
    ig = client.get('instagram') or ''
    d.text(s, 0.8, 4.75, 11.5, 0.5, label + (f'  ·  @{ig.lstrip("@")}' if ig else ''), size=18, color=SAND)

    # 2. estratégia
    s = d.slide()
    d.header(s, 'Estratégia do mês', 'O que buscamos neste mês', name, label)
    d.text(s, 0.7, 1.9, 11.9, 4.8, rep.get('strategy') or 'Escreva aqui a estratégia do mês.', size=18,
           color=INK if rep.get('strategy') else MUTED, spacing=8)

    # 3. resumo e números do Aprova
    approved = len(posts)
    published = len([p for p in posts if p.get('scheduled_at')])
    first_try = len([p for p in posts if not p.get('adjustments')])
    rounds = sum(int(p.get('adjustments') or 0) for p in data['posts'])
    hours = [(datetime.fromisoformat(p['approved_at'].replace('Z', '+00:00')) -
              datetime.fromisoformat(p['created_at'].replace('Z', '+00:00'))).total_seconds() / 3600
             for p in posts if p.get('approved_at')]
    hours = [h for h in hours if h >= 0]
    avg = sum(hours) / len(hours) if hours else None
    avg_txt = '—' if avg is None else ('menos de 1 h' if avg < 1 else f'{round(avg)} h' if avg < 48 else f'{round(avg / 24)} dias')
    s = d.slide()
    d.header(s, 'Resumo do mês', f'{published} conteúdos publicados', name, label)
    kpis = [(str(published), 'publicados e agendados'),
            (f'{first_try}/{approved}' if approved else '—', 'aprovados sem alteração'),
            (avg_txt, 'tempo médio até a aprovação'),
            (str(rounds), 'rodadas de alteração')]
    for i, (n, l) in enumerate(kpis):
        x = 0.7 + i * 3.03
        d.rect(s, x, 1.9, 2.83, 1.45, SAND3, LINE)
        d.text(s, x + 0.25, 2.05, 2.4, 0.7, n, size=32, color=INK)
        d.text(s, x + 0.25, 2.8, 2.4, 0.45, l, size=11, color=MUTED)
    fmts = {}
    for p in posts:
        fmts[p['format']] = fmts.get(p['format'], 0) + 1
    if fmts:
        d.text(s, 0.7, 3.55, 11.9, 0.3, '  ·  '.join(f'{n} {TYPES.get(f, f)}' for f, n in sorted(fmts.items(), key=lambda x: -x[1])),
               size=12, color=BROWN, bold=True)
    d.text(s, 0.7, 4.05, 11.9, 2.7, rep.get('summary') or 'Escreva aqui o resumo do mês.', size=15,
           color=INK if rep.get('summary') else MUTED, spacing=6)

    # 4. instagram
    s = d.slide()
    d.header(s, 'Instagram', 'Números do mês', name, label)
    for i, (k, l) in enumerate(METRICS):
        x = 0.7 + (i % 4) * 3.03
        y = 1.95 + (i // 4) * 1.75
        d.rect(s, x, y, 2.83, 1.5, SAND3, LINE)
        v = (metrics.get(k) or '').strip()
        d.text(s, x + 0.25, y + 0.2, 2.4, 0.7, v or '—', size=30, color=INK if v else MUTED)
        d.text(s, x + 0.25, y + 0.95, 2.4, 0.4, l, size=11, color=MUTED)
    d.text(s, 0.7, 5.75, 11.9, 0.9, 'Fonte: Insights do Instagram, período de ' + label.lower() + '.', size=10, color=MUTED)

    # 5 e 6. performaram / não performaram
    for mark, eyebrow, title, key, color in (
            ('top', 'Destaques', 'Conteúdos que performaram', 'highlights', OK),
            ('low', 'Aprendizados', 'Conteúdos que não performaram', 'low_text', FIX)):
        chosen = [p for p in posts if marks.get(p['id']) == mark][:4]
        s = d.slide()
        d.header(s, eyebrow, title, name, label)
        for i, p in enumerate(chosen):
            d.thumb(s, p, 0.7 + i * 1.95, 1.9, 1.75)
        tx = 0.7 + max(len(chosen), 0) * 1.95 if chosen else 0.7
        tw = 12.6 - tx
        body = rep.get(key) or ('Marque os posts no Aprova ou escreva aqui a análise.' if not chosen else '')
        d.text(s, tx + (0.2 if chosen else 0), 1.95, tw - 0.2, 4.8, body, size=15,
               color=INK if rep.get(key) else MUTED, spacing=6)
        d.rect(s, 0.7, 1.75, 0.6, 0.06, color, rounded=False)

    # 7+. todos os conteúdos (6 por slide)
    per = 6
    for start in range(0, len(posts), per):
        chunk = posts[start:start + per]
        s = d.slide()
        page = f' ({start // per + 1}/{(len(posts) + per - 1) // per})' if len(posts) > per else ''
        d.header(s, 'Conteúdos do mês', f'Tudo o que foi ao ar{page}', name, label)
        for i, p in enumerate(chunk):
            d.thumb(s, p, 0.7 + i * 2.05, 1.85, 1.85, show_caption=True)

    # próximos passos
    s = d.slide()
    d.header(s, 'Próximos passos', 'O que vem no próximo mês', name, label)
    d.text(s, 0.7, 1.9, 11.9, 4.8, rep.get('next_steps') or 'Escreva aqui os próximos passos.', size=18,
           color=INK if rep.get('next_steps') else MUTED, spacing=8)

    # encerramento
    s = d.slide(dark=True)
    d.text(s, 0.8, 3.0, 11.7, 1.0, 'Obrigada!', size=48, color=WHITE)
    d.text(s, 0.8, 4.1, 11.7, 0.5, 'Aguiar&co  ·  ' + label, size=16, color=SAND)

    d.prs.save(out)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    with open(sys.argv[1], encoding='utf-8') as f:
        raw = json.load(f)
    build(raw.get('data', raw), sys.argv[2])
    print('ok', sys.argv[2])
