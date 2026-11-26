'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeFiles } from '@/lib/upload';
import { STATUS_CLASS, STATUS_LABEL, STATUS_SHORT, TYPES, countStatuses, portalLink } from '@/lib/constants';
import { addMonths, currentMonth, fmtAgo, fmtDate, fmtDay, firstName, monthLabel, planMonth, sentMonth } from '@/lib/format';
import { embedThumb, isEmbed, isVideoLike, splitMedia } from '@/lib/media';
import type { ActivityLog, Client, Comment, Post, PostStatus } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, Mono, Viewer, copyText, useUI } from '@/components/ui';
import { Thread, Timeline } from '@/components/thread';
import { DEFAULT_REVISION_LIMIT } from '@/lib/rounds';
import { ClientForm, errMsg } from '@/components/admin/client-form';
import { UploadForm } from '@/components/admin/upload-form';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { OnboardingCard } from '@/components/admin/onboarding-card';
import { useMe } from '@/components/admin/me';
import { isWhatsappNote, noteBody } from '@/lib/whatsapp-note';

type Filter = 'todos' | PostStatus;

export function ClientView({ client, posts, events }: { client: Client; posts: Post[]; events: ActivityLog[] }) {
  const { toast, confirm } = useUI();
  const [filter, setFilter] = useState<Filter>('todos');
  const [editOpen, setEditOpen] = useState(false);
  const [upload, setUpload] = useState<{ material?: Post } | null>(null);
  const [choose, setChoose] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    // volta do scanner com ?avisar=1: já abre o aviso ao cliente
    const q = new URLSearchParams(window.location.search);
    // link do e-mail de aviso (?post=<id>): já abre o conteúdo
    const postId = q.get('post');
    if (postId) {
      setDetailId(postId);
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (q.get('avisar') === '1') {
      setNotifyOpen(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // organização por mês (mês de publicação; sem data, vale o mês de envio)
  const nowMonth = currentMonth();
  const [month, setMonth] = useState(nowMonth);
  const months = Array.from(new Set([...posts.map(planMonth), nowMonth, addMonths(nowMonth, 1)])).sort();
  const monthList = posts.filter((p) => planMonth(p) === month);
  // o que o cliente enxerga hoje no link: enviados neste mês + pendências anteriores
  const clientSees = posts.filter((p) => sentMonth(p) === nowMonth || p.status === 'pending' || p.status === 'adjustment_requested');
  const seen = countStatuses(clientSees);

  const counts = countStatuses(monthList);
  const link = portalLink(client.access_token, origin);
  const list = monthList.filter((p) => filter === 'todos' || p.status === filter);
  const tabs: [Filter, string, number][] = [
    ['todos', 'Todos', monthList.length],
    ['pending', 'Aguardando', counts.pendente],
    ['adjustment_requested', 'Em ajuste', counts.ajustes],
    ['approved', 'Aprovados', counts.aprovado],
    ...(counts.reprovado ? [['rejected', 'Reprovados', counts.reprovado] as [Filter, string, number]] : []),
  ];
  const detail = detailId ? posts.find((p) => p.id === detailId) ?? null : null;

  async function copyLink() {
    const ok = await copyText(link);
    toast(ok ? 'Link copiado' : 'Não foi possível copiar', ok ? undefined : 'err');
  }

  async function askNotify() {
    const ok = await confirm({
      title: `Avisar ${client.name}?`,
      text: 'Preparamos uma mensagem personalizada com o link da área de aprovação. Você revisa e envia pelo WhatsApp ou e-mail.',
      okLabel: 'Preparar aviso',
    });
    if (ok) setNotifyOpen(true);
  }

  return (
    <>
      <LiveRefresh clientId={client.id} />
      <Link className="back" href="/dashboard"><Icon name="left" />Todos os clientes</Link>
      <div className="chead">
        <Mono name={client.name} logo={client.logo_url} />
        <div>
          <h1><b>{client.name}</b>{client.client_type === 'pontual' && <span className="role-tag" style={{ verticalAlign: 'middle' }}>Pontual</span>}</h1>
          <div className="sub">
            {client.contact_name && <span>{client.contact_name}</span>}
            <span suppressHydrationWarning>
              {client.last_accessed_at ? `Último acesso ${fmtAgo(client.last_accessed_at)}` : 'Ainda não acessou a área de aprovação'}
            </span>
          </div>
        </div>
        <div className="actions">
          <button className="btn line" title="Editar cliente" onClick={() => setEditOpen(true)}><Icon name="edit" />Editar</button>
          <button className="btn line" onClick={() => setNotifyOpen(true)}><Icon name="bell" />Avisar cliente</button>
          <button className="btn" onClick={() => setChoose(true)}><Icon name="upload" />Enviar material</button>
        </div>
      </div>

      <OnboardingCard client={client} />

      <div className="layout">
        <section>
          <div className="months">
            {months.map((k) => {
              const ps = posts.filter((p) => planMonth(p) === k);
              const c = countStatuses(ps);
              const info = !ps.length ? 'Nada ainda'
                : c.pendente || c.ajustes
                  ? [`${c.aprovado} aprovado${c.aprovado === 1 ? '' : 's'}`, c.pendente && `${c.pendente} aguardando`, c.ajustes && `${c.ajustes} em ajuste`, c.reprovado && `${c.reprovado} reprovado${c.reprovado === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
                  : `${c.aprovado}/${ps.length - c.reprovado} aprovados ✓${c.reprovado ? ` · ${c.reprovado} reprovado${c.reprovado === 1 ? '' : 's'}` : ''}`;
              return (
                <button key={k} className={`mchip ${month === k ? 'on' : ''}`} onClick={() => { setMonth(k); setFilter('todos'); }} suppressHydrationWarning>
                  <b>{monthLabel(k)}{k === nowMonth && <span className="pill">atual</span>}</b>
                  <small>{info}</small>
                  {ps.length > c.reprovado && <div className="bar"><i style={{ width: `${(c.aprovado / (ps.length - c.reprovado)) * 100}%` }} /></div>}
                </button>
              );
            })}
          </div>
          <div className="tabs">
            {tabs.map(([k, l, n]) => (
              <button key={k} className={`tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {l}<span className="n">{n}</span>
              </button>
            ))}
          </div>
          {list.length ? (
            <div className="mats">
              {list.map((m) => <MaterialCard key={m.id} m={m} onOpen={() => setDetailId(m.id)} />)}
            </div>
          ) : posts.length ? (
            <div className="empty"><p>{monthList.length ? 'Nada por aqui neste filtro.' : `Nenhum conteúdo de ${monthLabel(month).toLowerCase()} ainda.`}</p></div>
          ) : (
            <div className="card empty">
              <h3>Primeiro <b>envio</b></h3>
              <p>Envie fotos, vídeos, carrosséis, artes ou textos para {client.name} aprovar.</p>
              <button className="btn" onClick={() => setChoose(true)}><Icon name="upload" />Enviar material</button>
            </div>
          )}
        </section>

        <aside className="side" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16 }}>
          <div className="card cnow" suppressHydrationWarning>
            <h3>O cliente está vendo agora</h3>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
              <b>{monthLabel(nowMonth)}</b><br />
              {clientSees.length
                ? `${seen.aprovado} de ${clientSees.length - seen.reprovado} aprovados · ${seen.pendente} aguardando${seen.ajustes ? ` · ${seen.ajustes} em ajuste` : ''}${seen.reprovado ? ` · ${seen.reprovado} reprovado${seen.reprovado === 1 ? '' : 's'}` : ''}`
                : 'Nada enviado neste mês ainda.'}
            </p>
            <p className="small muted" style={{ margin: '8px 0 0' }}>No link, o cliente vê só o que foi enviado neste mês (e o que ainda estiver pendente). Os outros meses ficam só aqui no painel.</p>
          </div>
          <div className="card">
            <h3>Link do cliente</h3>
            <div className="linkbox">
              <code>{link}</code>
              <button className="btn sm sand" onClick={copyLink}><Icon name="copy" />Copiar</button>
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>Cada cliente tem um link exclusivo e só enxerga os próprios materiais.</p>
            <a className="btn sm ghost" style={{ marginTop: 6, paddingLeft: 0 }} href={`/aprovar/${client.access_token}?preview=1`} target="_blank" rel="noopener noreferrer">
              <Icon name="eye" />Ver como o cliente vê
            </a>
          </div>
          <div className="card">
            <h3>Linha do tempo</h3>
            {events.length ? <Timeline events={events} /> : <p className="muted small" style={{ margin: 0 }}>Ainda sem movimentações.</p>}
          </div>
        </aside>
      </div>

      {editOpen && <ClientForm client={client} onClose={() => setEditOpen(false)} />}
      {choose && (
        <Modal title={<>Enviar para <b>{client.name}</b></>} onClose={() => setChoose(false)}>
          <p className="muted" style={{ margin: '0 0 14px' }}>Como você quer cadastrar?</p>
          <div className="send-choices">
            <button className="send-choice" onClick={() => { setChoose(false); setUpload({}); }}>
              <span className="tag">Um post por vez</span>
              <span className="t">Cadastrar <b>manualmente</b></span>
              <span className="d">Você sobe os arquivos, escreve a legenda e escolhe a data.</span>
            </button>
            <Link className="send-choice" href={`/dashboard/clientes/${client.id}/scanner`} onClick={() => setChoose(false)}>
              <span className="tag">Vários posts de uma vez</span>
              <span className="t">Cadastrar <b>pelo scanner</b></span>
              <span className="d">Cole o link do calendário no Google Docs e o Aprova monta os posts sozinho.</span>
              <span className="warn"><b>Exige mais atenção.</b> O scanner pode ler algo errado. Você vai conferir post por post antes de enviar.</span>
            </Link>
            <Link className="send-choice" href={`/dashboard/clientes/${client.id}/scanner/destaques`} onClick={() => setChoose(false)}>
              <span className="tag">Destaques</span>
              <span className="t">Destaques <b>pelo scanner</b></span>
              <span className="d">Cole o link da pasta de destaques no Drive e o Aprova monta cada destaque com a capa e os stories na ordem.</span>
            </Link>
          </div>
        </Modal>
      )}
      {upload && (
        <UploadForm
          client={client}
          material={upload.material}
          onClose={() => setUpload(null)}
          onDone={askNotify}
        />
      )}
      {notifyOpen && <NotifyForm client={client} posts={posts} link={link} onClose={() => setNotifyOpen(false)} />}
      {detail && (
        <PostDetail
          m={detail}
          limit={client.revision_limit ?? DEFAULT_REVISION_LIMIT}
          onClose={() => setDetailId(null)}
          onNewVersion={() => { setDetailId(null); setUpload({ material: detail }); }}
        />
      )}
    </>
  );
}

function MaterialCard({ m, onOpen }: { m: Post; onOpen: () => void }) {
  const { cover, items } = splitMedia(m.post_media);
  const f = items[0];
  const t = TYPES[m.format] ?? { label: m.format, icon: 'image' as const };
  const badge = <span className="type-badge"><Icon name={t.icon} />{t.label}</span>;
  const multi = items.length > 1 ? <span className="multi">1/{items.length}</span> : null;
  const play = <span className="play"><Icon name="video" /></span>;
  const cc = m.comments.filter((x) => x.author_role === 'client' && x.kind !== 'approval').length;

  let thumb;
  if (cover) thumb = <div className="thumb" style={{ backgroundImage: `url("${cover.file_url}")` }}>{f && isVideoLike(f) ? play : null}{badge}{multi}</div>;
  else if (!f) thumb = <div className="thumb"><div className="txt">{m.caption}</div>{badge}</div>;
  else if (isEmbed(f)) {
    const th = embedThumb(f.file_url);
    thumb = <div className="thumb" style={th ? { backgroundImage: `url("${th}")` } : { background: '#2b2a29' }}>{play}{badge}{multi}</div>;
  }
  else if (f.file_type.startsWith('image/')) thumb = <div className="thumb" style={{ backgroundImage: `url("${f.file_url}")` }}>{badge}{multi}</div>;
  else if (f.file_type.startsWith('video/')) thumb = <div className="thumb"><video muted preload="metadata" src={`${f.file_url}#t=0.1`} />{badge}{multi}</div>;
  else thumb = (
    <div className="thumb">
      <div style={{ textAlign: 'center', color: 'var(--brown)' }}><Icon name="doc" /><div className="small">{f.file_name}</div></div>
      {badge}{multi}
    </div>
  );

  return (
    <article className="card mcard" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      {thumb}
      <div className="mb">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className={`status ${STATUS_CLASS[m.status]}`}>{STATUS_SHORT[m.status]}</span>
          {m.version > 1 && <span className="small muted">v{m.version}</span>}
        </div>
        <h4>{m.title}</h4>
        <div className="meta">
          <span suppressHydrationWarning>
            {m.scheduled_date ? <><Icon name="calendar" />{fmtDay(m.scheduled_date)}</> : `Enviado ${fmtDate(m.sent_at, false)}`}
          </span>
          <span>
            {cc > 0 && <><Icon name="chat" />{cc}</>}{' '}
            {m.first_viewed_at ? <><Icon name="eye" />visto</> : <span className="muted">não visto</span>}
          </span>
        </div>
      </div>
    </article>
  );
}

function PostDetail({ m, limit, onClose, onNewVersion }: { m: Post; limit: number; onClose: () => void; onNewVersion: () => void }) {
  const router = useRouter();
  const me = useMe();
  const { toast, confirm } = useUI();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const t = TYPES[m.format] ?? { label: m.format };

  useEffect(() => {
    const th = threadEnd.current?.querySelector('.thread');
    th?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [m.comments.length]);

  async function toggleError(c: Comment) {
    const { error } = await createClient().from('comments').update({ agency_error: !c.agency_error }).eq('id', c.id);
    if (error) return toast(errMsg(error), 'err');
    toast(c.agency_error ? 'Voltou a contar como rodada' : 'Marcado como erro da agência: não conta como rodada');
    router.refresh();
  }

  async function send() {
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from('comments').insert({
      post_id: m.id, author_name: me.name, author_role: 'agency', kind: 'comment', content: body, version: m.version,
    });
    if (error) { setSending(false); return toast(errMsg(error), 'err'); }
    await supabase.from('activity_logs').insert({
      client_id: m.client_id, post_id: m.id, type: 'resposta', actor: me.name, action_text: `${me.name} respondeu em ${m.title}`,
    });
    setReply('');
    setSending(false);
    toast('Resposta enviada');
    router.refresh();
  }

  // ajuste simples feito internamente (ex.: só enquadrar a imagem): não precisa voltar para o cliente
  // ajuste que só dá para fazer na hora de agendar (ex.: colocar música):
  // aprova sem voltar ao cliente e manda para a fila da Duda com ressalva
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjNote, setAdjNote] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const lastAsk = [...m.comments].reverse().find((c) => c.author_role === 'client' && c.kind === 'adjustment');

  // editar a observação para quem agenda depois de aprovado (o cabeçalho do WhatsApp é mantido)
  const curNote = (m.schedule_note ?? '').trim();
  const curWa = isWhatsappNote(curNote);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  function openNote() { setNoteText(noteBody(curNote)); setNoteOpen(true); }
  async function saveNote() {
    if (curWa && !noteText.trim()) return toast('A observação do WhatsApp não pode ficar vazia.', 'err');
    setNoteBusy(true);
    const { error } = await createClient().rpc('team_update_schedule_note', { p_post_id: m.id, p_note: noteText.trim() });
    setNoteBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Observação atualizada');
    setNoteOpen(false);
    router.refresh();
  }

  // cliente combinou pelo WhatsApp (sem usar o link): aprova e manda para a fila com observação em vermelho
  const [waOpen, setWaOpen] = useState(false);
  const [waNote, setWaNote] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  async function markWhatsapp() {
    if (!waNote.trim()) return toast('Escreva a observação para a Duda.', 'err');
    setWaBusy(true);
    const { error } = await createClient().rpc('team_approve_whatsapp', { p_post_id: m.id, p_note: waNote.trim() });
    setWaBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Aprovado pelo WhatsApp e enviado para a fila de agendamento');
    setWaOpen(false);
    onClose();
    router.refresh();
  }
  async function markAdjusted() {
    setAdjBusy(true);
    const { error } = await createClient().rpc('team_approve_with_note', { p_post_id: m.id, p_extra: adjNote.trim() || null });
    setAdjBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast('Aprovado e enviado para a fila de agendamento');
    setAdjOpen(false);
    onClose();
    router.refresh();
  }

  async function del() {
    const ok = await confirm({
      title: 'Excluir material?',
      text: `“${m.title}” e os comentários dele serão apagados.`,
      okLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { error } = await createClient().from('posts').delete().eq('id', m.id);
    if (error) return toast(errMsg(error), 'err');
    await removeFiles(m.post_media.map((x) => x.storage_path)).catch(() => {});
    toast('Material excluído');
    onClose();
    router.refresh();
  }

  const { cover, items } = splitMedia(m.post_media);
  const isVideo = m.format === 'reels' || m.format === 'stories' || m.format === 'destaque' || (items.length > 0 && items.every(isVideoLike));

  return (
    <>
      <Modal wide onClose={onClose} bodyStyle={{ padding: 0 }}>
        <div className="mdetail">
          <div className="media">
            <Viewer
              files={items.map((f) => ({ url: f.file_url, mime: f.file_type, name: f.file_name }))}
              cover={cover?.file_url}
              caption={m.caption}
              ratio={isVideo ? '9 / 16' : '4 / 5'}
            />
          </div>
          <div className="info">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 6px' }}>{t.label}{m.version > 1 ? ` · versão ${m.version}` : ''}</p>
                <h2>{m.title}</h2>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
            </div>
            <div><span className={`status ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span></div>
            <div className="facts" suppressHydrationWarning>
              <div className="fact"><div className="k">Enviado</div><div className="v">{fmtDate(m.sent_at)}</div></div>
              <div className="fact"><div className="k">Cliente viu</div><div className="v">{m.first_viewed_at ? fmtDate(m.first_viewed_at) : '—'}</div></div>
              <div className="fact">
                <div className="k">{m.status === 'adjustment_requested' ? 'Ajuste pedido' : m.status === 'rejected' ? 'Reprovado' : 'Aprovado'}</div>
                <div className="v">
                  {m.decided_at && m.status !== 'pending' ? (
                    <>{fmtDate(m.decided_at)}{m.decided_by && <><br /><span className="muted" style={{ fontWeight: 400 }}>por {m.decided_by}</span></>}</>
                  ) : '—'}
                </div>
              </div>
              <div className="fact"><div className="k">Publicação</div><div className="v">{m.scheduled_date ? fmtDay(m.scheduled_date) : '—'}</div></div>
            </div>
            {m.caption && items.length > 0 && (
              <div><p className="eyebrow" style={{ margin: '0 0 8px' }}>Legenda / texto</p><div className="caption">{m.caption}</div></div>
            )}
            <div ref={threadEnd}>
              <p className="eyebrow" style={{ margin: '0 0 12px' }}>Conversa</p>
              {m.comments.length ? <Thread comments={m.comments} admin={{ limit, onToggleError: toggleError }} /> : <p className="muted small" style={{ margin: 0 }}>Nenhum comentário ainda.</p>}
            </div>
            <div className="reply">
              <textarea className="textarea" placeholder="Responder ao cliente…" value={reply} onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
              <button className="btn" onClick={send} disabled={sending} aria-label="Enviar"><Icon name="send" /></button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 6 }}>
              {m.status === 'adjustment_requested' && (
                <button className="btn ok" onClick={() => setAdjOpen(true)} title="Para ajustes que só dá para fazer na hora de agendar (ex.: música)">
                  <Icon name="check" />Ajustado e agendado
                </button>
              )}
              {(m.status === 'pending' || m.status === 'adjustment_requested') && (
                <button className="btn ok" onClick={() => setWaOpen(true)} title="O cliente combinou pelo WhatsApp e não usou o link">
                  <Icon name="chat" />Cliente aprovou no WhatsApp
                </button>
              )}
              {m.status === 'approved' && (
                <button className="btn line" onClick={openNote}><Icon name="edit" />{curNote ? 'Editar observação para a Duda' : 'Adicionar observação para a Duda'}</button>
              )}
              <button className="btn sand" onClick={onNewVersion}><Icon name="refresh" />Enviar nova versão</button>
              <button className="btn danger" onClick={del}><Icon name="trash" />Excluir</button>
            </div>
          </div>
        </div>
      </Modal>
      {noteOpen && (
        <Modal
          title={<>Observação para a <b>Duda</b></>}
          onClose={() => setNoteOpen(false)}
          foot={
            <>
              <button className="btn line" onClick={() => setNoteOpen(false)}>Cancelar</button>
              <button className="btn" onClick={saveNote} disabled={noteBusy || (curWa && !noteText.trim())}><Icon name="check" />Salvar observação</button>
            </>
          }
        >
          {m.scheduled_at ? (
            <div className="note red" style={{ marginBottom: 14 }}>
              <span className="h"><Icon name="alert" />A Duda já marcou este post como agendado</span>
              Depois de salvar, avise ela para conferir a mudança.
            </div>
          ) : (
            <p className="muted" style={{ margin: '0 0 14px' }}>
              A mudança aparece na hora na fila de agendamento, marcada como “Atualizada”.
              {curWa ? ' Continua em vermelho, como combinado pelo WhatsApp.' : ''}
            </p>
          )}
          <div className="field">
            <label htmlFor="note-edit">O que a Duda precisa fazer ao agendar</label>
            <textarea id="note-edit" className="textarea" rows={6} value={noteText} onChange={(e) => setNoteText(e.target.value)} autoFocus
              placeholder="Ex.: usar a versão instrumental e marcar a maquiadora Amanda." />
            {!curWa && <span className="hint">Deixe vazio para tirar a observação.</span>}
          </div>
        </Modal>
      )}
      {waOpen && (
        <Modal
          title={<>Cliente aprovou no <b>WhatsApp</b></>}
          onClose={() => setWaOpen(false)}
          foot={
            <>
              <button className="btn line" onClick={() => setWaOpen(false)}>Cancelar</button>
              <button className="btn" onClick={markWhatsapp} disabled={waBusy || !waNote.trim()}><Icon name="check" />Aprovar e mandar para a Duda</button>
            </>
          }
        >
          <p className="muted" style={{ margin: '0 0 14px' }}>
            “{m.title}” passa a contar como aprovado e vai para a fila de agendamento. A observação aparece <b style={{ color: 'var(--late)' }}>em vermelho</b> para
            a Duda, na fila e no e-mail de aviso.
          </p>
          {lastAsk && m.status === 'adjustment_requested' && (
            <div className="note" style={{ marginBottom: 14 }}>
              <span className="h"><Icon name="alert" />Último pedido do cliente no Aprova</span>{lastAsk.content}
            </div>
          )}
          <div className="field">
            <label htmlFor="wa-note">O que a Duda precisa fazer ao agendar</label>
            <textarea id="wa-note" className="textarea" rows={5} value={waNote} onChange={(e) => setWaNote(e.target.value)} autoFocus
              placeholder="Ex.: Duda, conversei com a cliente pelo WhatsApp. Cortar o trecho em que o cabelo aparece cortado (do segundo 3 ao 6) e publicar." />
          </div>
          {waNote.trim() && (
            <div className="note red" style={{ marginTop: 4 }}>
              <span className="h"><Icon name="alert" />Atenção: combinado pelo WhatsApp. Agende exatamente assim</span>{waNote.trim()}
            </div>
          )}
        </Modal>
      )}
      {adjOpen && (
        <Modal
          title={<>Ajustado e <b>agendado</b></>}
          onClose={() => setAdjOpen(false)}
          foot={
            <>
              <button className="btn line" onClick={() => setAdjOpen(false)}>Cancelar</button>
              <button className="btn" onClick={markAdjusted} disabled={adjBusy}><Icon name="check" />Aprovar e mandar para a fila</button>
            </>
          }
        >
          <p className="muted" style={{ margin: '0 0 14px' }}>
            “{m.title}” passa a contar como aprovado, sem voltar para o cliente, e entra na fila de agendamento com uma ressalva para quem for agendar.
          </p>
          {lastAsk && (
            <div className="note" style={{ marginBottom: 14 }}>
              <span className="h"><Icon name="alert" />Pedido do cliente (vai junto)</span>{lastAsk.content}
            </div>
          )}
          <div className="field">
            <label htmlFor="adj-note">Recado para quem agenda <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
            <textarea id="adj-note" className="textarea" value={adjNote} onChange={(e) => setAdjNote(e.target.value)}
              placeholder="Ex.: usar a versão instrumental e cortar os 2 primeiros segundos." />
          </div>
        </Modal>
      )}
    </>
  );
}

function defaultMessage(c: Client, pend: Post[], link: string) {
  const n = pend.length;
  const nome = firstName(c.contact_name) || c.name;
  const lista = pend.slice(0, 6).map((p) => `• ${p.title}`).join('\n');
  return `Olá, ${nome}! Tudo bem? 🤍\n\n${n === 1 ? 'Temos 1 conteúdo novo' : `Temos ${n} conteúdos`} aguardando a sua aprovação na sua área exclusiva da Aguiar&Co:\n\n${lista}${n > 6 ? `\n• e mais ${n - 6}` : ''}\n\nÉ só acessar o link abaixo para visualizar, comentar e aprovar:\n${link}\n\nQualquer dúvida, estamos por aqui!\nEquipe Aguiar&Co`;
}

function NotifyForm({ client, posts, link, onClose }: { client: Client; posts: Post[]; link: string; onClose: () => void }) {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const pend = posts.filter((x) => x.status === 'pending');
  const [msg, setMsg] = useState(() => defaultMessage(client, pend, link));
  const LABEL = { whatsapp: 'WhatsApp', email: 'e-mail', copia: 'mensagem copiada' } as const;

  async function go(ch: keyof typeof LABEL) {
    if (ch === 'whatsapp') {
      const n = String(client.whatsapp || '').replace(/\D/g, '');
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    } else if (ch === 'email') {
      window.location.href = `mailto:${encodeURIComponent(client.email || '')}?subject=${encodeURIComponent('Novos conteúdos aguardando sua aprovação · Aguiar&Co')}&body=${encodeURIComponent(msg)}`;
    } else {
      const ok = await copyText(msg);
      toast(ok ? 'Mensagem copiada' : 'Não foi possível copiar', ok ? undefined : 'err');
    }
    onClose();
    await createClient().from('activity_logs').insert({
      client_id: client.id, type: 'aviso', actor: me.name, meta: LABEL[ch], action_text: `${me.name} avisou o cliente (${LABEL[ch]})`,
    });
    router.refresh();
  }

  return (
    <Modal title={<>Avisar <b>{client.name}</b></>} onClose={onClose}>
      <p className="muted small" style={{ margin: '0 0 14px' }}>
        {pend.length
          ? `${pend.length} ${pend.length > 1 ? 'materiais' : 'material'} aguardando aprovação.`
          : 'Não há materiais aguardando no momento — a mensagem leva o cliente para a área dele mesmo assim.'}{' '}
        Revise o texto antes de enviar.
      </p>
      <div className="field">
        <textarea className="textarea" style={{ minHeight: 240 }} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </div>
      <div className="channels">
        <button className="btn" onClick={() => go('whatsapp')}><Icon name="whats" />WhatsApp</button>
        <button className="btn line" onClick={() => go('email')}><Icon name="mail" />E-mail</button>
        <button className="btn line" onClick={() => go('copia')}><Icon name="copy" />Copiar</button>
      </div>
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        {client.whatsapp
          ? `O WhatsApp abre na conversa com ${client.whatsapp}.`
          : 'Sem número cadastrado: o WhatsApp abre para você escolher o contato ou o grupo do cliente.'}{' '}
        Nada é enviado sem você confirmar no aplicativo.
      </p>
    </Modal>
  );
}
