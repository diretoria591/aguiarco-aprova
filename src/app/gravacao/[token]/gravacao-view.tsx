'use client';

import { useState } from 'react';
import { fmtDate } from '@/lib/format';
import {
  DRIVE_SHARE_EMAIL, LEAD, LEVEL_LABEL, addDaysYMD, levelOf, whenText, type RtStatus,
} from '@/lib/roteiros';
import { GRAVACAO_TOKEN_RE, gravacaoSupabase, type GravacaoData, type GravacaoRoteiro } from '@/lib/roteiros-public';
import { Icon } from '@/components/icon';
import { Modal, Wordmark, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { Pill } from '@/components/roteiros/parts';

const fmtYMD = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function GravacaoView({ token, initial }: { token: string; initial: GravacaoData }) {
  const { toast } = useUI();
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<GravacaoRoteiro | null>(null);

  async function reload() {
    if (!GRAVACAO_TOKEN_RE.test(token)) return;
    const { data: d } = await gravacaoSupabase().rpc('gravacao_get', { p_token: token });
    if (d) setData(d as GravacaoData);
  }

  const todo = data.roteiros.filter((r) => r.status === 'grav' || r.status === 'alt');
  const done = data.roteiros.filter((r) => r.delivered_at && r.status !== 'grav' && r.status !== 'alt')
    .sort((a, b) => (b.delivered_at ?? '').localeCompare(a.delivered_at ?? ''));
  const n = data.delivered_month;

  return (
    <>
      <header className="ptop">
        <div className="in">
          <span className="brand"><Wordmark /></span>
          <div className="client">Área de gravação<b>{data.team.name}</b></div>
        </div>
      </header>
      <main className="pmain">
        <div className="rt-hero">
          <div className="s">Oi, filmmaker da {data.team.first_name || data.team.name}!</div>
          <div className="big">{n}</div>
          <div className="s">Você já entregou {n} vídeo{n === 1 ? '' : 's'} este mês.</div>
        </div>

        <h2 className="rt-h2">Para <b>gravar</b></h2>
        {todo.length === 0 && <div className="card empty"><h3>Tudo gravado por <b>enquanto</b></h3><p>Quando houver roteiro novo, ele aparece aqui.</p></div>}
        <div className="rt-stack">
          {todo.map((r) => {
            const L = levelOf({ status: r.status as RtStatus, pub_date: r.pub_date });
            return (
              <div key={r.id} className="card rt-pad">
                <h3 className="rt-title">{r.title}</h3>
                <div className="muted small">
                  {r.client_name}{r.pub_date ? ` · gravar até ${fmtYMD(addDaysYMD(r.pub_date, -LEAD))} · ${whenText(r.pub_date)}` : ''}
                </div>
                <div className="rt-row" style={{ margin: '8px 0' }}>
                  {L && L !== 'wait' && <Pill tone={L}>{LEVEL_LABEL[L]}</Pill>}
                  {r.status === 'alt' && <Pill tone="high">Ajuste pedido</Pill>}
                </div>
                {r.status === 'alt' && r.alt_note && <div className="rt-note"><b>O que ajustar:</b> {r.alt_note}</div>}
                {r.content && <div className="rt-text">{r.content}</div>}
                {r.notes && <div className="muted small" style={{ marginTop: 8 }}>Obs.: {r.notes}</div>}
                <div className="rt-links">
                  {r.content_url && <a href={r.content_url} target="_blank" rel="noreferrer"><Icon name="doc" />{r.content_name || 'Roteiro'}</a>}
                  {r.ref_url && <a href={r.ref_url} target="_blank" rel="noreferrer"><Icon name="ext" />Inspiração</a>}
                </div>
                <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(r)}><Icon name="upload" />Entregar material</button>
              </div>
            );
          })}
        </div>

        {done.length > 0 && (
          <>
            <h2 className="rt-h2">Já <b>entregues</b></h2>
            <div className="card rt-pad">
              {done.map((r) => (
                <div key={r.id} className={`rt-done ${r.video_type === 'bruto' ? 'br' : 'ed'}`}>
                  <div><b>{r.title}</b><div className="muted small">{r.client_name} · {fmtDate(r.delivered_at)}</div></div>
                  <div className="rt-row">
                    <Pill tone={r.video_type === 'bruto' ? 'br' : 'ed'}>Vídeo {r.video_type}</Pill>
                    {r.video_url && <a className="rt-link" href={r.video_url} target="_blank" rel="noreferrer">Link</a>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="pfoot"><Wordmark className="wm" /></div>
      </main>
      {open && <DeliverModal token={token} r={open} onClose={() => setOpen(null)} onDone={async () => { setOpen(null); toast('Entrega enviada. Obrigada!'); await reload(); }} />}
    </>
  );
}

function DeliverModal({ token, r, onClose, onDone }: { token: string; r: GravacaoRoteiro; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [type, setType] = useState<'bruto' | 'editado'>('bruto');
  const [video, setVideo] = useState('');
  const [photos, setPhotos] = useState('');
  const [cover, setCover] = useState('');
  const [note, setNote] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!/^https?:\/\//i.test(video.trim())) return toast('Cole o link do vídeo no Drive (começa com https://).', 'err');
    if (!ok) return toast('Libere o acesso do link e marque a caixinha.', 'err');
    setBusy(true);
    const { error } = await gravacaoSupabase().rpc('gravacao_deliver', {
      p_token: token, p_roteiro: r.id, p_video: video.trim(), p_photos: photos.trim(),
      p_cover: cover.trim(), p_type: type, p_note: note.trim(),
    });
    if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    onDone();
  }

  return (
    <Modal title={<>Entregar <b>material</b></>} onClose={onClose}
      foot={<><button className="btn line" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar entrega'}</button></>}>
      <p className="muted" style={{ margin: '0 0 14px' }}>{r.client_name} · {r.title}</p>
      <div className="field"><label>Tipo de vídeo</label>
        <div className="rt-opt">
          <button type="button" className={type === 'bruto' ? 'on br' : ''} onClick={() => setType('bruto')}>Vídeo bruto</button>
          <button type="button" className={type === 'editado' ? 'on ed' : ''} onClick={() => setType('editado')}>Vídeo editado</button>
        </div>
        <span className="hint">{type === 'bruto' ? 'Vídeo bruto: a equipe é avisada para incluir no calendário e passar para a edição.' : 'Vídeo editado: a equipe de conteúdo recebe para conferir.'}</span>
      </div>
      <div className="field"><label>Link do vídeo no Drive</label>
        <input className="input" type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://drive.google.com/…" /></div>
      <div className="field"><label>Link das fotos usadas ou captadas (opcional)</label>
        <input className="input" type="url" value={photos} onChange={(e) => setPhotos(e.target.value)} placeholder="https://drive.google.com/…" /></div>
      <div className="field"><label>Link da capa do vídeo (opcional)</label>
        <input className="input" type="url" value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://drive.google.com/…" /></div>
      <div className="field"><label>Observação (opcional)</label>
        <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="rt-tip">Libere o acesso do link para <b>{DRIVE_SHARE_EMAIL}</b> (Compartilhar → Adicionar pessoas), senão a equipe não consegue abrir.</div>
      <label className="rt-chk"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Já liberei o acesso do link para a equipe da Aguiar&amp;Co.</label>
    </Modal>
  );
}
