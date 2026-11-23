'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { addMonths, currentMonth, fmtDate, monthLabel } from '@/lib/format';
import {
  FILTERS, LEAD, LEVEL_LABEL, PHASE_COLOR, STATUS_TEXT, addDaysYMD, levelOf, phaseOf, whenText,
  type Equipe, type Roteiro,
} from '@/lib/roteiros';
import { gravacaoLink } from '@/lib/roteiros';
import { Icon } from '@/components/icon';
import { Modal, Mono, copyText, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { useMe } from '@/components/admin/me';
import { RoteirosLive } from '@/components/admin/roteiros-live';
import { MONTHS_SHORT, Pill, Stepper } from '@/components/roteiros/parts';

type C = { id: string; name: string; logo_url: string | null };

export function ClientArea({ client, team, selfRecord, justSaved, roteiros, initialMonth }: {
  client: C; team: Equipe | null; selfRecord: boolean; justSaved: boolean; roteiros: Roteiro[]; initialMonth: string;
}) {
  const me = useMe();
  const router = useRouter();
  const { toast, confirm } = useUI();
  const admin = me.role === 'admin';
  const [mo, setMo] = useState(initialMonth);
  const [f, setF] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [alt, setAlt] = useState<Roteiro | null>(null);
  const [altText, setAltText] = useState('');
  const [edit, setEdit] = useState<Roteiro | null>(null);
  const [reg, setReg] = useState<Roteiro | null>(null);

  const base = currentMonth();
  const keys = [...new Set([...roteiros.map((r) => r.month), base, addMonths(base, 1), addMonths(base, 2), initialMonth])].sort();
  const inMonth = roteiros.filter((r) => r.month === mo);
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  const list = inMonth.filter(filter.test);

  function link() { return team ? gravacaoLink(team.access_token, window.location.origin) : ''; }
  function whats() {
    if (!team) return;
    const msg = `Oi, ${team.first_name || team.name}! Já cadastrei os roteiros de ${client.name}. Você vê tudo e entrega por aqui: ${link()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }
  async function copyTeamLink() {
    const ok = await copyText(link());
    toast(ok ? 'Link copiado' : 'Não deu para copiar. Tente de novo.', ok ? undefined : 'err');
  }

  async function patch(r: Roteiro, values: Partial<Roteiro>, msg: string) {
    setBusy(r.id);
    const { error } = await createClient().from('roteiros').update({ ...values, updated_at: new Date().toISOString() }).eq('id', r.id);
    setBusy(null);
    if (error) return toast(errMsg(error), 'err');
    toast(msg);
    router.refresh();
  }

  async function remove(r: Roteiro) {
    const ok = await confirm({ title: 'Excluir este roteiro?', text: `“${r.title}” sai da lista e o histórico dele também.`, okLabel: 'Excluir', danger: true });
    if (!ok) return;
    const { error } = await createClient().from('roteiros').delete().eq('id', r.id);
    if (error) return toast(errMsg(error), 'err');
    await removeFiles([r.content_url ? r.content_url.split('/approvals-media/')[1] : null]).catch(() => {});
    toast('Roteiro excluído');
    router.refresh();
  }

  async function sendAlt() {
    if (!alt) return;
    const n = altText.trim();
    if (!n) return toast('Explique o que precisa mudar.', 'err');
    await patch(alt, { status: 'alt', alt_note: n }, 'Alteração solicitada');
    setAlt(null);
    setAltText('');
  }

  return (
    <>
      <RoteirosLive />
      <Link href="/dashboard/roteiros" className="rt-back"><Icon name="left" />Todos os clientes</Link>
      <div className="rt-head">
        <Mono name={client.name} logo={client.logo_url} />
        <div>
          <div className="rt-eyebrow">Você está vendo</div>
          <h1>{client.name}</h1>
          <div className="rt-sub">{selfRecord ? 'Grava: o próprio cliente' : team ? `Grava: ${team.name}` : 'Sem equipe de gravação definida'} · {roteiros.length} roteiros no total</div>
        </div>
        <Link className="btn sand" href={`/dashboard/roteiros/novo?cliente=${client.id}&mes=${mo}`}><Icon name="plus" />Novo roteiro</Link>
      </div>

      {team && !selfRecord && (
        <div className={`rt-send${justSaved ? ' hot' : ''}`}>
          <div>
            <b>{justSaved ? 'Roteiros cadastrados! ' : ''}Avise {team.first_name || team.name}</b>
            <div className="rt-meta">Mande o link da área de gravação de {team.name}. É o mesmo link sempre, não precisa gerar outro.</div>
          </div>
          <div className="rt-row">
            <button className="btn sm" onClick={whats}>Enviar no WhatsApp</button>
            <button className="btn sm line" onClick={copyTeamLink}><Icon name="copy" />Copiar link</button>
          </div>
        </div>
      )}

      <div className="rt-months">
        {keys.map((k) => (
          <button key={k} className={k === mo ? 'on' : ''} onClick={() => { setMo(k); setF('all'); }}>
            Roteiros {monthLabel(k)} <span>{roteiros.filter((r) => r.month === k).length}</span>
          </button>
        ))}
      </div>

      <div className="rt-tiles">
        {FILTERS.map((x) => (
          <button key={x.key} className={`rt-tile${f === x.key ? ' on' : ''}`} onClick={() => setF(x.key)}>
            <div className="n">{inMonth.filter(x.test).length}</div>
            <div className="l">{x.label}</div>
          </button>
        ))}
      </div>

      <div className="sec-head"><h2>{f === 'all' ? 'Todos de' : `${filter.label} em`} <b>{monthLabel(mo)}</b></h2></div>

      {list.length === 0 && <div className="card empty"><h3>Nenhum roteiro {f === 'all' ? `em ${monthLabel(mo)}` : 'com esse filtro'}</h3></div>}
      <div className="rt-list">
        {list.map((r) => {
          const L = admin ? null : levelOf(r);
          const own = admin || r.author_id === me.id;
          const type = r.video_type;
          const d = r.pub_date;
          return (
            <article key={r.id} className={`rt-rc${type === 'bruto' && (r.status === 'bruto' || r.status === 'edit') ? ' br' : type === 'editado' || r.status === 'rec' || r.status === 'alt' ? ' ed' : ''}`}>
              <div className="rt-date">
                {d ? <><b>{d.slice(8, 10)}</b><span>{MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}</span></> : <><b>–</b><span>SEM DATA</span></>}
              </div>
              <div className="rt-body">
                <h3>{r.title}</h3>
                <div className="rt-row">
                  <span className="rt-ph"><i style={{ background: PHASE_COLOR[phaseOf(r)] }} />{STATUS_TEXT[r.status]}</span>
                  {L && L !== 'wait' && <Pill tone={L}>{LEVEL_LABEL[L]}</Pill>}
                  {type && <Pill tone={type === 'bruto' ? 'br' : 'ed'}>Vídeo {type}</Pill>}
                </div>
                <Stepper r={r} />
                <div className="rt-meta">
                  {d ? (admin ? `Publicação prevista ${d.slice(8, 10)}/${d.slice(5, 7)}` : `${whenText(d)} · captar até ${addDaysYMD(d, -LEAD).slice(8, 10)}/${addDaysYMD(d, -LEAD).slice(5, 7)}`) + ' · ' : ''}
                  Roteiro de {r.author_name || 'equipe'}{r.batch_size > 1 ? ` · leva de ${r.batch_size}` : ''}
                </div>
                {r.content && <div className="rt-text">{r.content}</div>}
                {r.notes && <div className="rt-meta">Obs.: {r.notes}</div>}
                {r.status === 'alt' && r.alt_note && <div className="rt-note"><b>Alteração pedida:</b> {r.alt_note}</div>}
                {r.delivered_at && <div className="rt-meta">Entregue por {r.delivered_by || 'equipe'} {fmtDate(r.delivered_at)}{r.delivery_note ? ` · “${r.delivery_note}”` : ''}</div>}
                <div className="rt-links">
                  {r.content_url && <a href={r.content_url} target="_blank" rel="noreferrer"><Icon name="doc" />{r.content_name || 'Roteiro'}</a>}
                  {r.ref_url && <a href={r.ref_url} target="_blank" rel="noreferrer"><Icon name="ext" />Inspiração</a>}
                  {r.video_url && <a href={r.video_url} target="_blank" rel="noreferrer"><Icon name="video" />Vídeo {type ?? ''}</a>}
                  {r.photos_url && <a href={r.photos_url} target="_blank" rel="noreferrer"><Icon name="image" />Fotos</a>}
                  {r.cover_url && <a href={r.cover_url} target="_blank" rel="noreferrer"><Icon name="image" />Capa</a>}
                </div>
                <div className="rt-acts">
                  {r.status === 'bruto' && <button className="btn sm" disabled={busy === r.id} onClick={() => patch(r, { status: 'edit', brenda_at: new Date().toISOString() }, 'Brenda sinalizada para editar')}>Incluí no calendário e sinalizei a Brenda</button>}
                  {own && r.status === 'grav' && <button className="btn sm line" onClick={() => setEdit(r)}><Icon name="edit" />Editar</button>}
                  {own && selfRecord && r.status === 'grav' && <button className="btn sm" onClick={() => setReg(r)}>Registrar gravação do cliente</button>}
                  {own && ['edit', 'rec', 'alt'].includes(r.status) && (
                    <>
                      <button className="btn sm" disabled={busy === r.id} onClick={() => patch(r, { status: 'pronto' }, 'Pronto para entrar no calendário')}>Pronto para o calendário</button>
                      <button className="btn sm line" onClick={() => { setAlt(r); setAltText(''); }}>Solicitar alteração</button>
                    </>
                  )}
                  {own && <button className="btn sm ghost" onClick={() => remove(r)} aria-label="Excluir roteiro"><Icon name="trash" /></button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {edit && <EditModal r={edit} months={keys} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />}
      {reg && <RegisterModal r={reg} onClose={() => setReg(null)} onSaved={() => { setReg(null); router.refresh(); }} />}
      {alt && (
        <Modal title={<>Solicitar <b>alteração</b></>} onClose={() => setAlt(null)}
          foot={<><button className="btn line" onClick={() => setAlt(null)}>Cancelar</button><button className="btn" onClick={sendAlt}>Enviar</button></>}>
          <p className="muted" style={{ margin: '0 0 12px' }}>{alt.title}</p>
          <div className="field"><label>O que precisa mudar?</label>
            <textarea className="textarea" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Ex.: cortar o início e subir o áudio" />
          </div>
        </Modal>
      )}
    </>
  );
}

function EditModal({ r, months, onClose, onSaved }: { r: Roteiro; months: string[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
  const [t, setT] = useState(r.title);
  const [tx, setTx] = useState(r.content);
  const [ref, setRef] = useState(r.ref_url ?? '');
  const [pub, setPub] = useState(r.pub_date ?? '');
  const [notes, setNotes] = useState(r.notes);
  const [month, setMonth] = useState(r.month);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!t.trim()) return toast('O roteiro precisa de um título.', 'err');
    setBusy(true);
    try {
      const v: Partial<Roteiro> = {
        title: t.trim(), content: tx.trim(), ref_url: ref.trim() || null, pub_date: pub || null,
        notes: notes.trim(), month: pub ? pub.slice(0, 7) : month,
      };
      if (file) { v.content_url = await uploadFile(safePath(`roteiros/${r.client_id}`, file, 0), file); v.content_name = file.name; }
      const { error } = await createClient().from('roteiros').update({ ...v, updated_at: new Date().toISOString() }).eq('id', r.id);
      if (error) throw error;
      toast('Roteiro atualizado');
      onSaved();
    } catch (e) { toast(errMsg(e), 'err'); setBusy(false); }
  }
  return (
    <Modal title={<>Editar <b>roteiro</b></>} onClose={onClose}
      foot={<><button className="btn line" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="field"><label>Título</label><input className="input" value={t} maxLength={200} onChange={(e) => setT(e.target.value)} /></div>
      <div className="field"><label>Roteiro (texto ou link do Doc)</label><textarea className="textarea" value={tx} onChange={(e) => setTx(e.target.value)} /></div>
      <div className="field"><label>Trocar arquivo do roteiro{r.content_name ? ` (atual: ${r.content_name})` : ''}</label><input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      <div className="row2">
        <div className="field"><label>Data prevista de publicação</label><input className="input" type="date" value={pub} onChange={(e) => setPub(e.target.value)} /></div>
        <div className="field"><label>Mês</label>
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Link de inspiração</label><input className="input" type="url" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
      <div className="field"><label>Observações</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    </Modal>
  );
}

function RegisterModal({ r, onClose, onSaved }: { r: Roteiro; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
  const me = useMe();
  const [type, setType] = useState<'bruto' | 'editado'>('bruto');
  const [video, setVideo] = useState('');
  const [photos, setPhotos] = useState('');
  const [cover, setCover] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = (u: string) => !u.trim() || /^https?:\/\//i.test(u.trim());

  async function save() {
    if (!/^https?:\/\//i.test(video.trim())) return toast('Cole o link do vídeo (começa com https://).', 'err');
    if (!ok(photos) || !ok(cover)) return toast('Os links de fotos e capa precisam começar com https://.', 'err');
    setBusy(true);
    const { error } = await createClient().from('roteiros').update({
      status: type === 'bruto' ? 'bruto' : 'rec', video_type: type, video_url: video.trim(),
      photos_url: photos.trim() || null, cover_url: cover.trim() || null, delivery_note: note.trim() || null,
      delivered_at: new Date().toISOString(), delivered_by: `Cliente (registrado por ${me.name})`, delivered_team: null,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    toast('Gravação registrada');
    onSaved();
  }
  return (
    <Modal title={<>Registrar <b>gravação do cliente</b></>} onClose={onClose}
      foot={<><button className="btn line" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Registrar'}</button></>}>
      <p className="muted" style={{ margin: '0 0 12px' }}>{r.title}</p>
      <div className="field"><label>Tipo de vídeo</label>
        <div className="rt-opt">
          <button type="button" className={type === 'bruto' ? 'on br' : ''} onClick={() => setType('bruto')}>Vídeo bruto</button>
          <button type="button" className={type === 'editado' ? 'on ed' : ''} onClick={() => setType('editado')}>Vídeo editado</button>
        </div>
      </div>
      <div className="field"><label>Link do vídeo</label><input className="input" type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://drive.google.com/…" /></div>
      <div className="field"><label>Link das fotos (opcional)</label><input className="input" type="url" value={photos} onChange={(e) => setPhotos(e.target.value)} /></div>
      <div className="field"><label>Link da capa (opcional)</label><input className="input" type="url" value={cover} onChange={(e) => setCover(e.target.value)} /></div>
      <div className="field"><label>Observação (opcional)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
    </Modal>
  );
}
