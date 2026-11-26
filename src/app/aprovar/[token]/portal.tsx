'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPortal, portalSupabase, rpcError, type PortalData } from '@/lib/portal';
import { STATUS_CLASS, TYPES, countStatuses } from '@/lib/constants';
import { currentMonth, fmtDate, fmtDay, monthLabel, monthName, sentMonth } from '@/lib/format';
import { isVideoLike, splitMedia } from '@/lib/media';
import type { Post, PostStatus } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, Viewer, Wordmark, useUI } from '@/components/ui';
import { Thread } from '@/components/thread';
import { roundsUsed } from '@/lib/rounds';

type Tab = 'todos' | PostStatus;

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* noop */ } },
};

export function Portal({ token, initial }: { token: string; initial: PortalData }) {
  const supabase = useMemo(() => portalSupabase(token), [token]);
  const { toast } = useUI();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>(() => {
    const c = countStatuses(monthPosts(initial.posts));
    return c.pendente ? 'pending' : c.ajustes ? 'adjustment_requested' : 'todos';
  });
  const [askingName, setAskingName] = useState<((v: string | null) => void) | null>(null);
  const myName = useRef('');
  const seen = useRef(new Set<string>());
  const feed = useRef<HTMLDivElement>(null);

  useEffect(() => { myName.current = store.get('ac_name_' + token) || ''; }, [token]);

  const load = useCallback(async () => {
    try {
      const d = await fetchPortal(supabase);
      if (d) setData(d);
    } catch (e) {
      toast(rpcError(e), 'err');
    }
  }, [supabase, toast]);

  const askName = useCallback((): Promise<string | null> => {
    if (myName.current) return Promise.resolve(myName.current);
    return new Promise((resolve) => setAskingName(() => resolve));
  }, []);

  // o cliente só vê o mês atual (+ o que ainda estiver pendente de meses anteriores)
  const month = currentMonth();
  const posts = monthPosts(data.posts);
  const c = countStatuses(posts);
  const name = data.client.contact_name ? data.client.contact_name.split(/\s+/)[0] : data.client.name;
  const list = posts.filter((m) => tab === 'todos' || m.status === tab);
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null) fresh.current = new Set(posts.filter(isNew).map((m) => m.id));
  posts.forEach((m) => { if (isNew(m)) fresh.current!.add(m.id); });
  const newCount = posts.filter((m) => m.status === 'pending' && fresh.current!.has(m.id)).length;
  const tabs: [Tab, string, number][] = [
    ['pending', 'Para aprovar', c.pendente],
    ['adjustment_requested', 'Em ajuste', c.ajustes],
    ['approved', 'Aprovados', c.aprovado],
    ...(c.reprovado ? [['rejected', 'Reprovados', c.reprovado] as [Tab, string, number]] : []),
    ['todos', 'Todos', posts.length],
  ];
  const toPublish = posts.length - c.reprovado; // reprovados não entram na conta

  // marca como "visto" quando a peça aparece na tela
  useEffect(() => {
    if (!('IntersectionObserver' in window) || !feed.current) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = (en.target as HTMLElement).dataset.id!;
      io.unobserve(en.target);
      const m = data.posts.find((x) => x.id === id);
      if (m && !m.first_viewed_at && !seen.current.has(id)) {
        seen.current.add(id);
        supabase.rpc('portal_mark_viewed', { p_token: token, p_post_id: id, p_name: myName.current || null }).then(() => {}, () => {});
      }
    }), { threshold: 0.45 });
    feed.current.querySelectorAll<HTMLElement>('.post').forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [data, tab, supabase, token]);

  return (
    <>
      <header className="ptop">
        <div className="in">
          <span className="brand"><Wordmark /></span>
          <div className="client">Área de aprovação<b>{data.client.name}</b></div>
        </div>
      </header>
      <main className="pmain">
        <section className="phero">
          <p className="eyebrow">Seus conteúdos</p>
          <h1>Olá, <b>{name}</b></h1>
          <span className="pmonth" suppressHydrationWarning>{monthLabel(month)}</span>
        </section>
        {toPublish > 0 && (
          <section className="card pprog" suppressHydrationWarning>
            <p>
              {c.pendente
                ? <>Você já aprovou <b>{c.aprovado} de {toPublish}</b> conteúdo{toPublish > 1 ? 's' : ''} de {monthName(month)}. Falta{c.pendente > 1 ? 'm' : ''} <b>{c.pendente}</b>.</>
                : <>Você já aprovou <b>{c.aprovado} de {toPublish}</b> conteúdo{toPublish > 1 ? 's' : ''} de {monthName(month)}. {c.ajustes ? 'Estamos ajustando o restante.' : 'Tudo em dia, obrigada pela parceria!'}</>}
            </p>
            <div className="bar"><i style={{ width: `${(c.aprovado / toPublish) * 100}%` }} /></div>
          </section>
        )}
        {newCount > 0 && (
          <div className="pnew"><Icon name="bell" /><span>Chegaram <b>{newCount} novo{newCount > 1 ? 's' : ''} conteúdo{newCount > 1 ? 's' : ''}</b> para você aprovar.</span></div>
        )}
        <nav className="ptabs">
          {tabs.map(([k, l, n]) => (
            <button key={k} className={`ptab ${tab === k ? 'on' : ''}`}
              onClick={() => { setTab(k); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              {l}<span className="n">{n}</span>
            </button>
          ))}
        </nav>
        <div className="feed" ref={feed}>
          {list.length ? list.map((m) => (
            <PostCard key={`${m.id}-${m.version}-${m.status}`} m={m} isNew={m.status === 'pending' && fresh.current!.has(m.id)}
              token={token} supabase={supabase} askName={askName} reload={load} limit={data.client.revision_limit} />
          )) : tab === 'pending' ? (
            <div className="card celebrate">
              <div className="ring"><Icon name="check" /></div>
              <h3>Tudo <b>aprovado</b></h3>
              <p className="muted" style={{ margin: 0 }}>Nenhum conteúdo aguardando você agora. Avisaremos quando chegarem os próximos.</p>
            </div>
          ) : (
            <div className="card empty"><p style={{ margin: 0 }}>Nenhum conteúdo aqui.</p></div>
          )}
        </div>
        <footer className="pfoot">
          <Wordmark />
          <div>Inovação através da criatividade.</div>
        </footer>
      </main>

      {askingName && (
        <NameModal
          onDone={(v) => {
            if (v) { myName.current = v; store.set('ac_name_' + token, v); }
            askingName(v);
            setAskingName(null);
          }}
        />
      )}
    </>
  );
}

function NameModal({ onDone }: { onDone: (v: string | null) => void }) {
  const [v, setV] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const go = () => { const n = v.trim(); if (!n) return input.current?.focus(); onDone(n); };
  return (
    <Modal title={<>Antes de <b>continuar</b></>} onClose={() => onDone(null)}
      foot={<button className="btn block" onClick={go}>Continuar</button>}>
      <p className="muted" style={{ margin: '0 0 16px' }}>Como você se chama? Assim a equipe sabe quem aprovou ou comentou.</p>
      <div className="field">
        <input ref={input} className="input" placeholder="Seu nome" autoComplete="name" maxLength={80}
          value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      </div>
    </Modal>
  );
}

/** Conteúdos enviados no mês atual + pendências de meses anteriores (para nada ficar esquecido). */
function monthPosts(all: Post[]): Post[] {
  const month = currentMonth();
  return all.filter((m) => sentMonth(m) === month || m.status === 'pending' || m.status === 'adjustment_requested');
}
const isNew = (m: Post) => m.status === 'pending' && !m.first_viewed_at;

function PostCard({
  m, isNew, token, supabase, askName, reload, limit,
}: {
  limit: number;
  m: Post;
  isNew: boolean;
  token: string;
  supabase: ReturnType<typeof portalSupabase>;
  askName: () => Promise<string | null>;
  reload: () => Promise<void>;
}) {
  const { toast } = useUI();
  const t = TYPES[m.format] ?? { label: m.format, icon: 'image' as const };
  const { cover, items } = splitMedia(m.post_media);
  const isVideo = m.format === 'reels' || m.format === 'stories' || m.format === 'destaque' || (items.length > 0 && items.every(isVideoLike));
  const [panel, setPanel] = useState<null | 'changes' | 'comment' | 'reject'>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fading, setFading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const long = m.caption.length > 260;
  const used = roundsUsed(m.comments);
  const overLimit = used >= limit; // próxima alteração já é rodada extra (cobrada à parte)

  useEffect(() => { if (panel) ta.current?.focus(); }, [panel]);

  async function approve() {
    const name = await askName();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc('portal_approve', { p_token: token, p_post_id: m.id, p_name: name });
    if (error) { setBusy(false); return toast(rpcError(error), 'err'); }
    toast('Aprovado! Obrigada 🤍');
    setFading(true);
    setTimeout(() => { reload(); }, 350);
  }

  async function submitPanel() {
    const body = text.trim();
    if (panel === 'reject') return reject(body);
    if (!body) return ta.current?.focus();
    const name = await askName();
    if (!name) return;
    setBusy(true);
    const isChange = panel === 'changes';
    const { error } = await supabase.rpc(isChange ? 'portal_request_changes' : 'portal_comment', {
      p_token: token, p_post_id: m.id, p_name: name, p_content: body,
    });
    if (error) { setBusy(false); return toast(rpcError(error), 'err'); }
    toast(isChange ? 'Pedido de alteração enviado' : 'Comentário enviado');
    reload();
  }

  async function reject(reason: string) {
    const name = await askName();
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.rpc('portal_reject', { p_token: token, p_post_id: m.id, p_name: name, p_content: reason || null });
    if (error) { setBusy(false); return toast(rpcError(error), 'err'); }
    toast('Conteúdo reprovado. Ele não será publicado.');
    setFading(true);
    setTimeout(() => { reload(); }, 350);
  }

  const toggle = (k: 'changes' | 'comment' | 'reject') => setPanel((p) => (p === k ? null : k));
  const msgs = m.comments.length;

  return (
    <article className="card post" data-id={m.id} style={fading ? { transition: 'opacity .3s', opacity: 0.3 } : undefined}>
      <div className="ph">
        <div className="t">
          <span className="ic"><Icon name={t.icon} /></span>
          <div className="lbl" suppressHydrationWarning>
            <b>{t.label}{m.version > 1 ? ` · versão ${m.version}` : ''}</b>Enviado {fmtDate(m.sent_at, false)}
          </div>
        </div>
        <div className="badges">
          {isNew && <span className="newtag">Novo</span>}
          {m.status !== 'pending'
            ? <span className={`status ${STATUS_CLASS[m.status]}`}>{m.status === 'approved' ? 'Aprovado' : m.status === 'rejected' ? 'Reprovado' : 'Em ajuste'}</span>
            : <span className="status pendente">Aguardando você</span>}
        </div>
      </div>
      <div className="vw">
        <Viewer
          files={items.map((f) => ({ url: f.file_url, mime: f.file_type, name: f.file_name }))}
          cover={cover?.file_url}
          caption={m.caption}
          ratio={isVideo ? '9 / 16' : '4 / 5'}
          maxHeight={isVideo ? '78vh' : undefined}
        />
      </div>
      <div className="pb">
        <h2>{m.title}</h2>
        {m.scheduled_date && (
          <div className="pdate"><span><Icon name="calendar" />Publicação prevista: {fmtDay(m.scheduled_date)}</span></div>
        )}
        {m.caption && items.length > 0 && (
          <>
            <div className={`cap${long && !expanded ? ' clamp' : ''}`}>{m.caption}</div>
            {long && !expanded && <button className="more" onClick={() => setExpanded(true)}>ver legenda completa</button>}
          </>
        )}
        {m.status === 'approved' && (
          <div className="decision aprovado" suppressHydrationWarning>
            <Icon name="check" />
            <div>Aprovado{m.decided_by ? ` por ${m.decided_by}` : ''} · {fmtDate(m.decided_at)}</div>
          </div>
        )}
        {m.status === 'rejected' && (
          <div className="decision reprovado"><Icon name="x" /><div>Você reprovou este conteúdo · ele não será publicado.</div></div>
        )}
        {m.status === 'adjustment_requested' && (
          <div className="decision ajustes"><Icon name="edit" /><div>Você pediu alterações · nossa equipe já está ajustando.</div></div>
        )}
      </div>
      <div className="pactions">
        {m.status === 'approved' ? (
          <button className="btn line" style={{ gridColumn: 'span 2' }} onClick={() => toggle('changes')}><Icon name="edit" />Precisa mudar algo?</button>
        ) : m.status === 'rejected' ? (
          <button className="btn line" style={{ gridColumn: 'span 2' }} onClick={approve} disabled={busy}><Icon name="check" />Mudei de ideia: aprovar</button>
        ) : (
          <>
            <button className="btn ok" onClick={approve} disabled={busy}><Icon name="check" />Aprovar</button>
            <button className="btn line" onClick={() => toggle('changes')}><Icon name="edit" />Alterar</button>
          </>
        )}
        <button className="btn line" aria-label="Comentar" title="Comentar" onClick={() => toggle('comment')}><Icon name="chat" /></button>
      </div>
      {(m.status === 'pending' || m.status === 'adjustment_requested') && panel !== 'reject' && (
        <button className="preject" onClick={() => toggle('reject')}>Não quero publicar este conteúdo</button>
      )}
      {panel && (
        <div className="panel">
          <label className="small" style={{ fontWeight: 500 }}>
            {panel === 'changes' ? 'O que você gostaria de alterar?' : panel === 'reject' ? 'Reprovar: este conteúdo não será publicado. Quer contar o motivo? (opcional)' : 'Seu comentário'}
          </label>
          {panel === 'changes' && (overLimit ? (
            <div className="note" role="alert" style={{ margin: '8px 0' }}><span>
              <b>Atenção:</b> {limit === 1 ? 'a rodada de revisão incluída' : `as ${limit} rodadas de revisão incluídas`} neste conteúdo já {limit === 1 ? 'foi utilizada' : 'foram utilizadas'}.
              Esta nova alteração será <b>cobrada à parte</b>. Se mesmo assim quiser prosseguir, é só enviar.
            </span></div>
          ) : limit > 0 ? (
            <p className="small muted" style={{ margin: '4px 0 8px' }}>Esta será a rodada {used + 1} de {limit} incluídas neste conteúdo.</p>
          ) : null)}
          <textarea ref={ta} className="textarea" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)}
            placeholder={panel === 'changes' ? 'Ex.: Trocar a foto da 3ª tela e deixar o título mais curto.' : panel === 'reject' ? 'Ex.: Não combina com a campanha deste mês.' : 'Escreva para a equipe…'} />
          <div className="row">
            <button className="btn line sm" onClick={() => setPanel(null)}>Cancelar</button>
            <button className={`btn sm${panel === 'reject' ? ' danger' : ''}`} onClick={submitPanel} disabled={busy}>
              {panel === 'changes' ? (overLimit ? 'Solicitar mesmo assim (cobrada à parte)' : 'Solicitar alteração') : panel === 'reject' ? 'Reprovar conteúdo' : 'Enviar comentário'}
            </button>
          </div>
        </div>
      )}
      {msgs > 0 && (
        <details className="convo" open={m.status === 'adjustment_requested'}>
          <summary><Icon name="chat" />{msgs} mensage{msgs > 1 ? 'ns' : 'm'} sobre este conteúdo</summary>
          <Thread comments={m.comments} />
        </details>
      )}
    </article>
  );
}
