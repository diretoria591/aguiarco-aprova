'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TYPES } from '@/lib/constants';
import { monthLabel, monthName } from '@/lib/format';
import { embedThumb, isEmbed, splitMedia } from '@/lib/media';
import type { PostFormat } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, copyText, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import type { AgendaPost } from './agenda-view';

/* ------------------------------------------------------------------ datas (fuso da agência) */
const TZ = process.env.NEXT_PUBLIC_TIMEZONE || 'America/Sao_Paulo';
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MON_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const pad = (n: number) => String(n).padStart(2, '0');

function partsOf(iso: string) {
  const o: Record<string, number> = {};
  fmt.formatToParts(new Date(iso)).forEach((p) => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute };
}
const ymdOf = (iso: string) => { const p = partsOf(iso); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const hmOf = (iso: string) => { const p = partsOf(iso); return `${pad(p.h)}:${pad(p.min)}`; };
/** "2026-11-26" + "18:00" → instante (horário de Brasília, sem horário de verão). */
const toISO = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00-03:00`).toISOString();

/** "Quarta, 26/11 às 18:00" */
function whenLabel(iso: string) {
  const p = partsOf(iso);
  const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${pad(p.d)}/${pad(p.m)} às ${pad(p.h)}:${pad(p.min)}`;
}

type Period = 'week' | 'month';

function periodLabel(period: Period, isos: string[]) {
  const ps = isos.map(partsOf).sort((a, b) => a.y - b.y || a.m - b.m || a.d - b.d);
  const a = ps[0], b = ps[ps.length - 1];
  const sameMonth = a.y === b.y && a.m === b.m;
  if (period === 'month' && sameMonth) return monthLabel(`${a.y}-${pad(a.m)}`).replace(/^(\S+) /, '$1 de ');
  if (a.d === b.d && sameMonth) return `${a.d} de ${monthName(`${a.y}-${pad(a.m)}`)}`;
  if (sameMonth) return `${a.d} a ${b.d} de ${monthName(`${a.y}-${pad(a.m)}`)}`;
  return `${a.d} de ${MON_SHORT[a.m - 1]} a ${b.d} de ${MON_SHORT[b.m - 1]}`;
}

/* ------------------------------------------------------------------ modelo */
type Row = {
  key: string;
  postId: string | null; // null = extra (fora da aprovação)
  title: string;
  format: PostFormat;
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  imageUrl: string | null;
};

function postImage(p: AgendaPost): string | null {
  const { cover, items } = splitMedia(p.post_media);
  const f = items[0];
  return cover?.file_url ?? (f && isEmbed(f) ? embedThumb(f.file_url) : f?.file_type.startsWith('image/') ? f.file_url : null);
}
function rowFromPost(p: AgendaPost): Row {
  const iso = p.publish_at ?? null;
  return {
    key: p.id, postId: p.id, title: p.title, format: p.format, imageUrl: postImage(p),
    date: iso ? ymdOf(iso) : p.scheduled_date?.slice(0, 10) ?? '',
    time: iso ? hmOf(iso) : '',
  };
}
const validRow = (r: Row) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && /^\d{2}:\d{2}$/.test(r.time) && r.title.trim().length > 0;

/* ------------------------------------------------------------------ imagem do mockup (canvas) */
function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    if (!url) return res(null);
    const img = new Image();
    if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    keep[maxLines - 1] = `${last}…`;
    return keep;
  }
  return lines;
}

type Item = { title: string; format: PostFormat; whenISO: string; img: HTMLImageElement | null; extra: boolean };

async function renderMockup(opts: { clientName: string; period: Period; rows: (Row & { img: HTMLImageElement | null })[] }): Promise<Blob> {
  const fam = getComputedStyle(document.body).fontFamily || 'sans-serif';
  await Promise.all(['300', '400', '500', '600'].map((w) => document.fonts.load(`${w} 20px ${fam}`).catch(() => null)));

  const items: Item[] = opts.rows
    .map((r) => ({ title: r.title.trim(), format: r.format, whenISO: toISO(r.date, r.time), img: r.img, extra: r.postId === null }))
    .sort((a, b) => a.whenISO.localeCompare(b.whenISO));
  const hasExtra = items.some((i) => i.extra);

  const W = 1080, PAD = 56, GAP = 22;
  const cols = items.length <= 4 ? 2 : items.length <= 9 ? 3 : 4;
  const k = cols === 2 ? 1.3 : cols === 3 ? 1 : 0.8;
  const cardW = (W - PAD * 2 - GAP * (cols - 1)) / cols;
  const imgH = Math.round(cardW * 1.25);
  const textH = Math.round(190 * k);
  const cardH = imgH + textH;
  const rowsN = Math.ceil(items.length / cols);
  const top = 300;
  const footer = hasExtra ? 90 : 40;
  const H = top + rowsN * cardH + (rowsN - 1) * GAP + footer + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (w: number, px: number) => `${w} ${px}px ${fam}`;
  const spaced = (v: string) => { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = v; };

  // fundo
  ctx.fillStyle = '#F3EAE3'; ctx.fillRect(0, 0, W, H);

  // marca + período
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2C2C2C'; ctx.font = font(300, 40);
  ctx.fillText('Aguiar', PAD, PAD + 36);
  const aw = ctx.measureText('Aguiar').width;
  ctx.font = font(600, 40); ctx.fillText('&co', PAD + aw, PAD + 36);
  const plabel = periodLabel(opts.period, items.map((i) => i.whenISO));
  ctx.font = font(400, 26); ctx.fillStyle = '#555250'; ctx.textAlign = 'right';
  ctx.fillText(plabel, W - PAD, PAD + 34); ctx.textAlign = 'left';

  // cliente + título
  ctx.font = font(500, 22); ctx.fillStyle = '#7A5A47'; spaced('4px');
  ctx.fillText(opts.clientName.toUpperCase(), PAD, 184); spaced('0px');
  ctx.fillStyle = '#2C2C2C'; ctx.font = font(300, 58);
  ctx.fillText('Conteúdos ', PAD, 252);
  const cw = ctx.measureText('Conteúdos ').width;
  ctx.font = font(600, 58);
  ctx.fillText(`agendados ${opts.period === 'week' ? 'da semana' : 'do mês'}`, PAD + cw, 252);

  // cartões
  items.forEach((it, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = PAD + c * (cardW + GAP), y = top + r * (cardH + GAP);
    ctx.fillStyle = '#FFFFFF'; rr(ctx, x, y, cardW, cardH, 22); ctx.fill();

    // arte (corta em 4:5)
    ctx.save(); rr(ctx, x, y, cardW, imgH, [22, 22, 0, 0]); ctx.clip();
    ctx.fillStyle = '#FAF6F2'; ctx.fillRect(x, y, cardW, imgH);
    if (it.img) {
      const s = Math.max(cardW / it.img.width, imgH / it.img.height);
      const dw = it.img.width * s, dh = it.img.height * s;
      ctx.drawImage(it.img, x + (cardW - dw) / 2, y + (imgH - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#7A5A47'; ctx.font = font(500, Math.round(24 * k)); ctx.textAlign = 'center';
      ctx.fillText(TYPES[it.format]?.label ?? it.format, x + cardW / 2, y + imgH / 2 + 8); ctx.textAlign = 'left';
    }
    ctx.restore();

    // textos
    const tx = x + 20 * k + 4, tw = cardW - (20 * k + 4) * 2;
    let ty = y + imgH + 36 * k;
    ctx.fillStyle = '#7A5A47'; ctx.font = font(500, Math.round(15 * k) + 1); spaced('2.5px');
    ctx.fillText((TYPES[it.format]?.label ?? it.format).toUpperCase(), tx, ty); spaced('0px');
    ty += 30 * k;
    ctx.fillStyle = '#2C2C2C'; ctx.font = font(500, Math.round(22 * k));
    const lines = wrap(ctx, it.title, tw, 2);
    lines.forEach((ln) => { ctx.fillText(ln, tx, ty); ty += 28 * k; });
    ctx.fillStyle = '#555250'; ctx.font = font(400, Math.round(18 * k));
    ctx.fillText(whenLabel(it.whenISO), tx, y + imgH + textH - 50 * k - 6);

    // selo
    const label = it.extra ? 'Extra' : 'Agendado';
    ctx.font = font(500, Math.round(15 * k) + 1);
    const lw = ctx.measureText(label).width, ch = 32 * k, cwid = lw + 40 * k;
    const cy = y + imgH + textH - ch - 18 * k;
    ctx.fillStyle = it.extra ? '#F7E6DC' : '#E5ECE1'; rr(ctx, tx, cy, cwid, ch, ch / 2); ctx.fill();
    ctx.fillStyle = it.extra ? '#8F4F31' : '#476543';
    ctx.beginPath(); ctx.arc(tx + 15 * k, cy + ch / 2, 4 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(label, tx + 27 * k, cy + ch / 2 + 5 * k);
  });

  if (hasExtra) {
    ctx.fillStyle = '#555250'; ctx.font = font(400, 20);
    ctx.fillText('Extra: conteúdo agendado fora da plataforma de aprovação.', PAD, H - PAD - 6);
  }

  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível gerar a imagem.'))), 'image/png'));
}

/* ------------------------------------------------------------------ modal */
type Step = 'details' | 'extras' | 'result';

export function MockupModal({ clientName, posts, onClose, onChanged }: {
  clientName: string;
  posts: AgendaPost[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useUI();
  const [step, setStep] = useState<Step>('details');
  const [period, setPeriod] = useState<Period>(posts.length > 5 ? 'month' : 'week');
  const [rows, setRows] = useState<Row[]>(() => posts.map(rowFromPost));
  const [extras, setExtras] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { extras.forEach((e) => e.imageUrl?.startsWith('blob:') && URL.revokeObjectURL(e.imageUrl)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setExtra = (key: string, patch: Partial<Row>) => setExtras((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const detailsOk = rows.every(validRow);
  const extrasOk = extras.length > 0 && extras.every(validRow);
  const message = useMemo(
    () => `Oi! Seguem os conteúdos já agendados ${period === 'week' ? 'da semana' : 'do mês'}, com data e horário. Qualquer ajuste é só avisar.`,
    [period],
  );

  async function generate(withExtras: boolean) {
    setBusy(true);
    try {
      const sb = createClient();
      // grava data/hora de cada aprovado (e marca como agendado quem ainda estava na fila)
      for (const r of rows) {
        const { error } = await sb.rpc('team_set_schedule', { p_post_id: r.postId, p_publish_at: toISO(r.date, r.time) });
        if (error) throw error;
      }
      const all = withExtras ? [...rows, ...extras] : rows;
      const withImg = await Promise.all(all.map(async (r) => ({ ...r, img: await loadImage(r.imageUrl) })));
      const b = await renderMockup({ clientName, period, rows: withImg });
      if (preview) URL.revokeObjectURL(preview);
      setBlob(b); setPreview(URL.createObjectURL(b));
      setStep('result');
      onChanged();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  const fileName = `agendados-${clientName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${period === 'week' ? 'semana' : 'mes'}.png`;

  function save() {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  }
  async function copyImage() {
    try {
      if (!blob || !navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('sem suporte');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Imagem copiada');
    } catch { toast('Não foi possível copiar a imagem. Use “Salvar imagem”.', 'err'); }
  }
  async function copyMsg() {
    const ok = await copyText(message);
    toast(ok ? 'Mensagem copiada' : 'Não foi possível copiar', ok ? undefined : 'err');
  }
  async function markNotified() {
    setBusy(true);
    try {
      const sb = createClient();
      for (const r of rows) {
        const { error } = await sb.rpc('team_mark_client_notified', { p_post_id: r.postId });
        if (error) throw error;
      }
      toast('Marcado como cliente avisado');
      onChanged(); onClose();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }

  function addExtra() {
    seq.current += 1;
    setExtras((xs) => [...xs, { key: `extra-${seq.current}`, postId: null, title: '', format: 'stories', date: '', time: '', imageUrl: null }]);
  }
  function pickArt(key: string, f: File | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    const prev = extras.find((x) => x.key === key)?.imageUrl;
    if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
    setExtra(key, { imageUrl: URL.createObjectURL(f) });
  }

  const inp: React.CSSProperties = { padding: '9px 11px' };

  return (
    <Modal
      wide={step === 'result'}
      onClose={onClose}
      title={step === 'result' ? <>Mockup <b>pronto</b></> : step === 'extras' ? <>Conteúdo <b>fora da aprovação</b></> : <>Mockup para <b>{clientName}</b></>}
      foot={
        step === 'details' ? (
          <>
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
          </>
        ) : step === 'extras' ? (
          <>
            <button className="btn ghost" onClick={() => setStep('details')} disabled={busy}>Voltar</button>
            <button className="btn" onClick={() => generate(true)} disabled={busy || !extrasOk}>{busy ? 'Gerando…' : 'Gerar mockup para o cliente'}</button>
          </>
        ) : (
          <button className="btn ghost" onClick={() => setStep('details')} disabled={busy}>Voltar e editar</button>
        )
      }
    >
      {step === 'details' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>Esse mockup é</p>
            <div className="chips">
              <button type="button" className={`chip-opt ${period === 'week' ? 'on' : ''}`} onClick={() => setPeriod('week')}>Conteúdos da semana</button>
              <button type="button" className={`chip-opt ${period === 'month' ? 'on' : ''}`} onClick={() => setPeriod('month')}>Conteúdos do mês</button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <p className="eyebrow">Confirme data e horário de cada publicação</p>
            {rows.map((r) => (
              <div key={r.key} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', flexWrap: 'wrap', boxShadow: 'none' }}>
                <span style={{ flex: '1 1 200px', fontSize: 14, fontWeight: 500 }}>
                  {r.title} <span className="muted" style={{ fontWeight: 400 }}>· {TYPES[r.format]?.label}</span>
                </span>
                <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Data
                  <input className="input" type="date" value={r.date} onChange={(e) => setRow(r.key, { date: e.target.value })} style={{ ...inp, width: 150 }} />
                </label>
                <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Hora
                  <input className="input" type="time" value={r.time} onChange={(e) => setRow(r.key, { time: e.target.value })} style={{ ...inp, width: 110 }} />
                </label>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'grid', gap: 10 }}>
            <b style={{ fontWeight: 500, fontSize: 15 }}>Você agendou algum conteúdo além dos aprovados?</b>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn sand" disabled={!detailsOk || busy} onClick={() => { if (!extras.length) addExtra(); setStep('extras'); }}>Sim, tem extras</button>
              <button className="btn" disabled={!detailsOk || busy} onClick={() => generate(false)}>{busy ? 'Gerando…' : 'Não, só os aprovados'}</button>
            </div>
            {!detailsOk && <span className="small muted">Preencha data e horário de todos os conteúdos para continuar.</span>}
          </div>
        </div>
      )}

      {step === 'extras' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <p className="small muted" style={{ margin: 0 }}>Eles entram no mockup com a marca “Extra”, para o cliente saber que não passaram pela plataforma.</p>
          {extras.map((x, i) => (
            <div key={x.key} className="card" style={{ padding: 16, display: 'grid', gap: 12, boxShadow: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow">Extra {i + 1}</span>
                <button className="more" onClick={() => setExtras((xs) => xs.filter((e) => e.key !== x.key))}>Remover</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14 }}>
                <label className="drop" style={{ padding: 8, display: 'grid', placeItems: 'center', minHeight: 150, fontSize: 12.5, color: 'var(--ink-2)', overflow: 'hidden' }}>
                  {x.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={x.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                    : <span><Icon name="upload" /><br />Enviar arte</span>}
                  <input type="file" accept="image/*" hidden onChange={(e) => pickArt(x.key, e.target.files?.[0])} />
                </label>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="field" style={{ margin: 0 }}><label>Nome do conteúdo</label>
                    <input className="input" value={x.title} onChange={(e) => setExtra(x.key, { title: e.target.value })} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}><label>Formato</label>
                      <select className="input" value={x.format} onChange={(e) => setExtra(x.key, { format: e.target.value as PostFormat })}>
                        {(['stories', 'reels', 'carrossel', 'foto', 'arte', 'video', 'destaque'] as PostFormat[]).map((f) => <option key={f} value={f}>{TYPES[f].label}</option>)}
                      </select></div>
                    <div className="field" style={{ margin: 0 }}><label>Data</label>
                      <input className="input" type="date" value={x.date} onChange={(e) => setExtra(x.key, { date: e.target.value })} /></div>
                    <div className="field" style={{ margin: 0 }}><label>Hora</label>
                      <input className="input" type="time" value={x.time} onChange={(e) => setExtra(x.key, { time: e.target.value })} /></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button className="more" style={{ justifySelf: 'start' }} onClick={addExtra}>+ Adicionar outro extra</button>
        </div>
      )}

      {step === 'result' && preview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 20, alignItems: 'start' }} className="mockup-result">
          <div style={{ background: 'var(--sand-2)', borderRadius: 16, padding: 10, maxHeight: '70vh', overflow: 'auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`Conteúdos agendados de ${clientName}`} style={{ width: '100%', borderRadius: 10 }} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button className="btn block" onClick={save}><Icon name="download" />Salvar imagem</button>
            <button className="btn line block" onClick={copyImage}><Icon name="copy" />Copiar imagem</button>
            <div className="card" style={{ padding: 14, display: 'grid', gap: 8, boxShadow: 'none' }}>
              <span className="eyebrow">Mensagem sugerida</span>
              <span className="small" style={{ color: 'var(--ink)' }}>{message}</span>
              <button className="more" onClick={copyMsg}><Icon name="copy" />Copiar mensagem</button>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'grid', gap: 8 }}>
              <span className="small muted">Depois de mandar no grupo do cliente, marque aqui.</span>
              <button className="btn sand block" onClick={markNotified} disabled={busy}><Icon name="bell" />Cliente avisado</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
