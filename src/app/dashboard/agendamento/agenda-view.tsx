'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TYPES } from '@/lib/constants';
import { fmtAgo, fmtDate, fmtDay, todayYMD } from '@/lib/format';
import { isVideoLike, materialsOf, splitMedia, embedThumb, isEmbed, type Material } from '@/lib/media';
import type { Client, Post } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, Mono, Viewer, copyText, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { useMe } from '@/components/admin/me';
import { MockupModal } from './mockup';
import { isWhatsappNote } from '@/lib/whatsapp-note';

export type AgendaPost = Post & {
  client: Pick<Client, 'id' | 'name' | 'logo_url' | 'instagram' | 'segment'>;
  scheduled_by_name: string | null;
  client_notified_by_name: string | null;
};
type Filter = 'queue' | 'scheduled' | 'done';

const stateOf = (p: AgendaPost): Filter =>
  !p.scheduled_at ? 'queue' : !p.client_notified_at ? 'scheduled' : 'done';

/** Dias até a publicação prevista, no fuso da agência (null = sem data). */
function dueDays(ymd: string | null): number | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayYMD().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400e3);
}

const sortKey = (p: AgendaPost) => dueDays(p.scheduled_date) ?? 9999;

export function AgendaView({ posts, error }: { posts: AgendaPost[]; error: string | null }) {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const [filter, setFilter] = useState<Filter>('queue');
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AgendaPost | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [mockup, setMockup] = useState<AgendaPost[] | null>(null);

  const by = (f: Filter) => posts.filter((p) => stateOf(p) === f);
  const counts = { queue: by('queue').length, scheduled: by('scheduled').length, done: by('done').length };

  // um cliente por vez: cliente com a publicação mais próxima primeiro
  const groups = (() => {
    const map = new Map<string, AgendaPost[]>();
    by(filter).forEach((p) => { const k = p.client.id; map.set(k, [...(map.get(k) ?? []), p]); });
    return [...map.values()]
      .map((ps) => ps.sort((a, b) => sortKey(a) - sortKey(b) || (a.approved_at ?? '').localeCompare(b.approved_at ?? '')))
      .sort((a, b) => sortKey(a[0]) - sortKey(b[0]) || a[0].client.name.localeCompare(b[0].client.name));
  })();
  const focusOk = focus && groups.some((g) => g[0].client.id === focus) ? focus : null;
  const shown = focusOk ? groups.filter((g) => g[0].client.id === focusOk) : groups;

  // seleção para o mockup: sempre de um cliente só
  function toggleSel(p: AgendaPost) {
    setSel((cur) => {
      const same = cur.filter((id) => posts.find((x) => x.id === id)?.client.id === p.client.id);
      return same.includes(p.id) ? same.filter((id) => id !== p.id) : [...same, p.id];
    });
  }
  const selPosts = posts.filter((p) => sel.includes(p.id) && stateOf(p) === 'queue');

  async function call(fn: string, p: AgendaPost) {
    const { error: e } = await createClient().rpc(fn, { p_post_id: p.id });
    if (e) throw e;
  }

  async function schedule(p: AgendaPost) {
    setBusy(p.id);
    try {
      await call('team_mark_scheduled', p);
      const left = posts.filter((x) => x.client.id === p.client.id && stateOf(x) === 'queue' && x.id !== p.id).length;
      toast(left ? 'Marcado como agendado' : `${p.client.name}: tudo agendado ✓ Pode passar para o próximo cliente`, undefined,
        { label: 'Desfazer', run: () => { call('team_undo_scheduled', p).then(() => router.refresh(), (e) => toast(errMsg(e), 'err')); } });
      router.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(null);
  }

  async function notified(p: AgendaPost) {
    setBusy(p.id);
    try {
      await call('team_mark_client_notified', p);
      toast('Marcado como cliente avisado', undefined,
        { label: 'Desfazer', run: () => { call('team_undo_client_notified', p).then(() => router.refresh(), (e) => toast(errMsg(e), 'err')); } });
      router.refresh();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(null);
  }

  const tabs: [Filter, string][] = [['queue', 'Fila'], ['scheduled', 'Agendados · sem aviso'], ['done', 'Concluídos']];
  const empty = {
    queue: (
      <div className="card celebrate">
        <div className="ring"><Icon name="check" /></div>
        <h3>Fila <b>vazia</b></h3>
        <p className="muted" style={{ margin: 0 }}>Quando um cliente aprovar um conteúdo, ele aparece aqui na hora.</p>
      </div>
    ),
    scheduled: <div className="card empty"><p style={{ margin: 0 }}>Nenhum conteúdo esperando aviso ao cliente.</p></div>,
    done: <div className="card empty"><p style={{ margin: 0 }}>Nada concluído nos últimos 30 dias.</p></div>,
  }[filter];

  return (
    <>
      <LiveRefresh />
      <div className="hello">
        <div>
          <p className="eyebrow">Agendamento{me.role === 'scheduler' && <span className="role-tag">sua área</span>}</p>
          <h1>{me.role === 'scheduler' ? <>Oi, <b>{me.name.split(/\s+/)[0]}</b></> : <>Fila de <b>agendamento</b></>}</h1>
        </div>
        <span className="live"><i />Atualiza sozinho quando um cliente aprova</span>
      </div>

      {error && <div className="card empty" style={{ marginBottom: 24 }}><h3>Algo não <b>carregou</b></h3><p>{error}</p></div>}

      <div className="summary">
        <div className="sum dark"><div className="n">{counts.queue}</div><div className="l">Na fila para agendar</div></div>
        <div className="sum"><div className="n">{counts.scheduled}</div><div className="l"><span className="status pendente" style={{ padding: 0, background: 'none' }} />Agendados · falta avisar o cliente</div></div>
        <div className="sum"><div className="n">{counts.done}</div><div className="l"><span className="status aprovado" style={{ padding: 0, background: 'none' }} />Concluídos (30 dias)</div></div>
      </div>

      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
            {l}<span className="n">{counts[k]}</span>
          </button>
        ))}
      </div>

      {groups.length > 1 && (
        <div className="cfilter">
          <span className="small muted">Cliente:</span>
          <button className={`chip-opt ${!focusOk ? 'on' : ''}`} onClick={() => setFocus(null)}>Todos, um por vez</button>
          {groups.map((g) => (
            <button key={g[0].client.id} className={`chip-opt ${focusOk === g[0].client.id ? 'on' : ''}`} onClick={() => setFocus(g[0].client.id)}>
              {g[0].client.name} · {g.length}
            </button>
          ))}
        </div>
      )}

      <div className="groups">
        {shown.length ? shown.map((ps) => {
          const c = ps[0].client;
          const all = posts.filter((x) => x.client.id === c.id);
          const doneN = all.filter((x) => stateOf(x) !== 'queue').length;
          const next = dueDays(ps[0].scheduled_date);
          return (
            <section className="cgroup" key={c.id}>
              <header className="ghead">
                <Mono name={c.name} logo={c.logo_url} />
                <div className="gtitle">
                  <h2><b>{c.name}</b></h2>
                  <div className="gsub" suppressHydrationWarning>
                    {filter === 'queue'
                      ? `${ps.length} para agendar${next !== null ? ` · próxima publicação ${next <= 0 ? 'hoje' : next === 1 ? 'amanhã' : fmtDay(ps[0].scheduled_date)}` : ''}`
                      : `${ps.length} conteúdo${ps.length > 1 ? 's' : ''}`}
                    {c.segment === 'beleza' && <span className="seg-tag"><Icon name="at" />Área da beleza</span>}
                  </div>
                </div>
                {filter === 'queue' && (
                  <button className="more" onClick={() => setSel(ps.map((x) => x.id))}>Selecionar todos</button>
                )}
                {filter === 'scheduled' && (
                  <button className="btn sand sm" onClick={() => setMockup(ps)}><Icon name="image" />Gerar mockup para o cliente</button>
                )}
                {filter === 'queue' && (
                  <div className="gprog" title="Aprovados deste cliente que já saíram da fila">
                    <span>{doneN} de {all.length} agendados</span>
                    <div className="bar"><i style={{ width: `${all.length ? (doneN / all.length) * 100 : 0}%` }} /></div>
                  </div>
                )}
              </header>
              <div className="queue">
                {ps.map((p) => (
                  <Row key={p.id} p={p} busy={busy === p.id} selected={sel.includes(p.id)} onToggle={() => toggleSel(p)} onSchedule={() => schedule(p)} onNotified={() => notified(p)} onView={() => setViewing(p)} />
                ))}
              </div>
            </section>
          );
        }) : empty}
      </div>

      {viewing && <MediaModal p={viewing} onClose={() => setViewing(null)} />}

      {filter === 'queue' && selPosts.length > 0 && !mockup && (
        <div className="selbar" role="region" aria-label="Seleção para o mockup">
          <span><b>{selPosts.length}</b> {selPosts.length === 1 ? 'conteúdo selecionado' : 'conteúdos selecionados'} · {selPosts[0].client.name}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost sm" onClick={() => setSel([])}>Limpar</button>
            <button className="btn sm" onClick={() => setMockup(selPosts)}><Icon name="calendar" />Marcar como agendado e gerar mockup</button>
          </span>
        </div>
      )}
      {mockup && (
        <MockupModal
          clientName={mockup[0].client.name}
          posts={mockup}
          onClose={() => { setMockup(null); setSel([]); }}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

function DueLabel({ ymd }: { ymd: string | null }) {
  const d = dueDays(ymd);
  if (d === null) return <span><Icon name="calendar" />Sem data prevista</span>;
  if (d < 0) return <span className="due"><Icon name="calendar" />Data prevista já passou · {fmtDay(ymd)}</span>;
  if (d === 0) return <span className="due"><Icon name="calendar" />Publica hoje</span>;
  if (d === 1) return <span className="due"><Icon name="calendar" />Publica amanhã · {fmtDay(ymd)}</span>;
  return <span><Icon name="calendar" />Publicação prevista {fmtDay(ymd)}</span>;
}

function thumbOf(p: AgendaPost) {
  const { cover, items } = splitMedia(p.post_media);
  const f = items[0];
  const video = !!f && isVideoLike(f);
  const bg = cover?.file_url ?? (f && isEmbed(f) ? embedThumb(f.file_url) : f?.file_type.startsWith('image/') ? f.file_url : null);
  return { bg, video, count: items.length, tall: video };
}

function Row({ p, busy, selected, onToggle, onSchedule, onNotified, onView }: {
  p: AgendaPost; busy: boolean; selected: boolean; onToggle: () => void; onSchedule: () => void; onNotified: () => void; onView: () => void;
}) {
  const { toast } = useUI();
  const [expanded, setExpanded] = useState(false);
  const st = stateOf(p);
  const t = TYPES[p.format] ?? { label: p.format, icon: 'image' as const };
  const th = thumbOf(p);
  const mats = materialsOf(p);
  const hasCover = mats.some((m) => m.kind === 'cover');
  const needsCover = p.format === 'reels' && mats.some((m) => m.kind === 'video') && !hasCover;
  const bulk = mats.filter((m) => m.source === 'upload' && m.downloadUrl);
  const long = p.caption.length > 120;
  const note = (p.schedule_note ?? '').trim();
  const wa = isWhatsappNote(note);
  const beauty = p.client.segment === 'beleza';
  const approvedAt = p.approved_at ?? p.decided_at;

  async function copyCaption() {
    const ok = await copyText(p.caption);
    toast(ok ? 'Legenda copiada' : 'Não foi possível copiar', ok ? undefined : 'err');
  }
  function downloadAll() {
    bulk.forEach((m, i) => setTimeout(() => {
      const a = document.createElement('a');
      a.href = m.downloadUrl!; a.rel = 'noopener'; a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 500));
  }

  return (
    <article className="card srow">
      <button type="button" className={`sthumb ${th.tall ? 'tall' : ''}`} onClick={onView} aria-label={`Ver mídia de ${p.title}`}
        style={th.bg ? { backgroundImage: `url("${th.bg}")` } : undefined}>
        {!th.bg && !th.video && <Icon name="text" />}
        {th.count > 1 && <span className="multi">1/{th.count}</span>}
        {th.video && <span className="play"><Icon name="play" /></span>}
      </button>

      <div className="sbody">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="type-badge" style={{ background: 'var(--line-2)' }}><Icon name={t.icon} />{t.label}</span>
          {st === 'queue' && (
            <label className="selbox"><input type="checkbox" checked={selected} onChange={onToggle} />Selecionar para o mockup</label>
          )}
        </div>
        <h3>{p.title}</h3>
        <div className="smeta" suppressHydrationWarning>
          <DueLabel ymd={p.scheduled_date} />
          {note
            ? wa
              ? <span style={{ color: 'var(--late)', fontWeight: 600 }}><Icon name="chat" />Cliente aprovou pelo WhatsApp · {fmtAgo(approvedAt)}</span>
              : <span><Icon name="edit" />Aprovado com ressalva{p.decided_by ? ` por ${p.decided_by}` : ''} · {fmtAgo(approvedAt)}</span>
            : <span><Icon name="check" />Cliente aprovou{p.decided_by ? ` (${p.decided_by})` : ''} · {fmtAgo(approvedAt)}</span>}
        </div>

        {note && st !== 'done' && (
          <div className={`note${wa ? ' red' : ''}`}><span className="h"><Icon name="alert" />{wa ? 'Atenção: combinado pelo WhatsApp. Agende exatamente assim' : 'Antes de agendar, leia'}</span>{note}</div>
        )}

        {beauty && st !== 'done' && (
          <div className="tagnote">
            <span className="h"><Icon name="at" />Marcar na publicação</span>
            <span className="tags">
              {p.client.instagram
                ? <><span className="tagchip">{p.client.instagram}</span><span className="small">perfil do cliente</span></>
                : <><span className="tagchip empty">@ do cliente?</span><span className="small">Instagram não cadastrado no cliente</span></>}
            </span>
            <span className="tags">
              {p.featured_professional
                ? <><span className="tagchip">{p.featured_professional}</span><span className="small">profissional que aparece{th.video ? ' no vídeo' : ''}</span></>
                : <><span className="tagchip empty">profissional?</span><span className="small">não informado no envio: confira quem aparece{th.video ? ' no vídeo' : ''}</span></>}
            </span>
            <small>Área da beleza: marcar o salão e a profissional gera mais engajamento.</small>
          </div>
        )}

        <div className="mats-box">
          <div className="mhead">
            <span>Materiais para agendar <span className="muted">· {mats.length} arquivo{mats.length === 1 ? '' : 's'}</span></span>
            {bulk.length > 1 && <button className="more" onClick={downloadAll}><Icon name="download" />Baixar todos ({bulk.length})</button>}
          </div>
          {mats.length > 0 && <ul className="mlist">{mats.map((m) => <MaterialItem key={m.key} m={m} />)}</ul>}
          {needsCover && (
            <ul className="mlist"><li className="mitem nocover">
              <span className="mthumb"><Icon name="alert" /></span>
              <span className="minfo"><b>Sem capa enviada</b><small>Use um quadro do vídeo como capa</small></span>
            </li></ul>
          )}
          <div className="mcap">
            <div className="mhead">
              <span>Legenda</span>
              <span style={{ display: 'flex', gap: 14 }}>
                {long && !expanded && <button className="more" onClick={() => setExpanded(true)}>ver completa</button>}
                {p.caption && <button className="more" onClick={copyCaption}><Icon name="copy" />Copiar legenda</button>}
              </span>
            </div>
            <div className={`scap${long && !expanded ? ' clamp' : ''}`}>{p.caption || 'Sem legenda.'}</div>
          </div>
        </div>
      </div>

      <div className="sact" suppressHydrationWarning>
        {st === 'queue' && (
          <>
            <button className="btn ok2" onClick={onSchedule} disabled={busy}><Icon name="calendar" />Marcar como Agendado</button>
            <div className="steps"><span className="step">Agendado</span><span className="step">Cliente avisado</span></div>
          </>
        )}
        {st === 'scheduled' && (
          <>
            <div className="who">Agendado por <b>{p.scheduled_by_name}</b><br />{fmtDate(p.scheduled_at)}</div>
            <button className="btn sand" onClick={onNotified} disabled={busy}><Icon name="bell" />Cliente avisado</button>
            <div className="steps"><span className="step done"><Icon name="check" />Agendado</span><span className="step">Cliente avisado</span></div>
          </>
        )}
        {st === 'done' && (
          <>
            <div className="who">
              Agendado{p.scheduled_by_name ? <> por <b>{p.scheduled_by_name}</b></> : ''} · {fmtDate(p.scheduled_at)}<br />
              Cliente avisado{p.client_notified_by_name ? <> por <b>{p.client_notified_by_name}</b></> : ''} · {fmtDate(p.client_notified_at)}
            </div>
            <div className="steps"><span className="step done"><Icon name="check" />Agendado</span><span className="step done"><Icon name="check" />Cliente avisado</span></div>
          </>
        )}
      </div>
    </article>
  );
}

function MaterialItem({ m }: { m: Material }) {
  const tag = m.kind === 'cover' ? <span className="mtag cover">Capa</span> : m.kind === 'video' ? <span className="mtag vid">Vídeo</span> : null;
  return (
    <li className={`mitem ${m.kind}`}>
      <span className={`mthumb ${m.kind === 'video' ? 'tall' : ''}`} style={m.thumb ? { backgroundImage: `url("${m.thumb}")` } : undefined}>
        {!m.thumb && <Icon name={m.kind === 'video' ? 'video' : 'doc'} />}
      </span>
      <span className="minfo"><b>{tag}{m.label}</b><small title={m.detail}>{m.detail}</small></span>
      <span className="mbtns">
        {m.downloadUrl ? (
          <a className={`btn sm ${m.kind === 'cover' ? 'dl cover' : m.kind === 'video' ? '' : 'line'}`} href={m.downloadUrl}
            target={m.source === 'drive' ? '_blank' : undefined} rel="noopener noreferrer" download={m.source === 'upload' ? '' : undefined}>
            <Icon name="download" />{m.downloadLabel}
          </a>
        ) : (
          <span className="small muted">Este link não permite baixar direto</span>
        )}
        {m.openUrl && (
          <a className="more" href={m.openUrl} target="_blank" rel="noopener noreferrer">
            <Icon name={m.source === 'drive' ? 'ext' : 'eye'} />{m.source === 'drive' ? 'Abrir no Drive' : m.kind === 'video' && m.source === 'link' ? 'Abrir vídeo' : 'Ver'}
          </a>
        )}
      </span>
    </li>
  );
}

function MediaModal({ p, onClose }: { p: AgendaPost; onClose: () => void }) {
  const { cover, items } = splitMedia(p.post_media);
  const video = items.length > 0 && items.every(isVideoLike);
  return (
    <Modal onClose={onClose} bodyStyle={{ padding: 0 }}>
      <Viewer
        files={items.map((f) => ({ url: f.file_url, mime: f.file_type, name: f.file_name }))}
        cover={cover?.file_url}
        caption={p.caption}
        ratio={video ? '9 / 16' : '4 / 5'}
        maxHeight="80vh"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
        <b style={{ fontWeight: 500, fontSize: 14 }}>{p.title}</b>
        <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
      </div>
    </Modal>
  );
}
