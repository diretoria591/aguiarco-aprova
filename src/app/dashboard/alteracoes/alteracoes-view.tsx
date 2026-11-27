'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { UploadForm } from '@/components/admin/upload-form';
import { AskBox, ClientTabs, DayStrip, ObsBox, Thumb, Trail } from '@/components/admin/alteracoes-ui';
import { TYPES } from '@/lib/constants';
import { fmtDate } from '@/lib/format';
import { splitMedia } from '@/lib/media';
import {
  addDays, currentEtapa, dayLabel, doerName, dueWarnings, etapasOf, nextWorkday, worksOn,
  type Alteracao, type Doer, type DueWarning,
} from '@/lib/alteracoes';
import type { Client, Post, PostFormat, PostMedia } from '@/lib/types';
import { approveAlteracao, cancelAlteracao, forwardAlteracao, sendBack, validarReeditado } from './actions';

export type Aba = 'encaminhar' | 'equipe' | 'revisar';
type AltRow = Alteracao & { posts: Post & { publish_at?: string | null }; clients: Client };
type Pedido = { post: Post & { publish_at?: string | null }; client: Client; ask: { content: string; author_name: string; created_at: string } | null; publish: string | null };

const ABAS: { key: Aba; label: string; hint: string }[] = [
  { key: 'encaminhar', label: 'Para encaminhar', hint: 'Pedidos do cliente esperando você escolher quem faz.' },
  { key: 'equipe', label: 'Com a equipe', hint: 'Alterações que alguém está fazendo agora.' },
  { key: 'revisar', label: 'Para revisar', hint: 'A equipe terminou: confira e envie ao cliente.' },
];

export function AlteracoesView({ aba, cliente, board, doers, today, counts }: {
  aba: Aba; cliente: string | null; today: string; doers: Doer[];
  board: { pedidos: Pedido[]; fazendo: AltRow[]; revisao: AltRow[]; error: string | null };
  counts: Record<Aba, number>;
}) {
  // clientes da aba atual (com quantos itens cada um tem)
  const list: { client: Client; key: string }[] = aba === 'encaminhar'
    ? board.pedidos.map((p) => ({ client: p.client, key: p.post.id }))
    : (aba === 'equipe' ? board.fazendo : board.revisao).map((a) => ({ client: a.clients, key: a.id }));
  const clients = useMemo(() => {
    const m = new Map<string, { id: string; name: string; logo_url: string | null; n: number; late: number }>();
    for (const { client } of list) {
      const c = m.get(client.id) ?? { id: client.id, name: client.name, logo_url: client.logo_url, n: 0, late: 0 };
      c.n++;
      m.set(client.id, c);
    }
    if (aba === 'equipe') for (const a of board.fazendo) {
      const e = currentEtapa(a);
      if (e?.due_date && e.due_date < today) m.get(a.client_id)!.late++;
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [list, aba, board.fazendo, today]);
  const current = clients.find((c) => c.id === cliente)?.id ?? clients[0]?.id ?? null;
  const href = (a: Aba, c?: string | null) => `/dashboard/alteracoes?aba=${a}${c ? `&cliente=${c}` : ''}`;

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Pedidos dos clientes</p><h1><b>Alterações</b></h1></div>
      </div>
      {board.error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar: {board.error}</p></div>}

      <div className="tabs" role="tablist">
        {ABAS.map((t) => (
          <Link key={t.key} href={href(t.key)} className={`tab${t.key === aba ? ' on' : ''}`} role="tab" aria-selected={t.key === aba}>
            {t.label}<span className={`n${counts[t.key] && t.key !== 'equipe' ? ' hot' : ''}`}>{counts[t.key]}</span>
          </Link>
        ))}
      </div>
      <p className="muted small" style={{ margin: '-8px 0 14px' }}>{ABAS.find((t) => t.key === aba)!.hint}</p>

      <ClientTabs clients={clients} current={current} hrefFor={(id) => href(aba, id)} />

      {!current && (
        <div className="card empty"><p style={{ margin: 0 }}>
          {aba === 'encaminhar' ? 'Nenhum pedido de alteração esperando. Quando um cliente pedir, ele aparece aqui.'
            : aba === 'equipe' ? 'Ninguém está fazendo alteração agora.' : 'Nada para revisar agora.'}
        </p></div>
      )}

      <div className="alt-list">
        {aba === 'encaminhar' && board.pedidos.filter((p) => p.client.id === current).map((p) => (
          <PedidoCard key={p.post.id} p={p} doers={doers} today={today} />
        ))}
        {aba === 'equipe' && board.fazendo.filter((a) => a.client_id === current).map((a) => (
          <EquipeCard key={a.id} a={a} today={today} />
        ))}
        {aba === 'revisar' && board.revisao.filter((a) => a.client_id === current).map((a) => (
          <RevisarCard key={a.id} a={a} today={today} />
        ))}
      </div>
    </>
  );
}

const fmtLabel = (f: string) => TYPES[f as PostFormat]?.label ?? f;
const sortedItems = (media: PostMedia[]) => splitMedia([...media].sort((a, b) => a.order_index - b.order_index));

function PostHead({ post, status }: { post: Post; status: React.ReactNode }) {
  return (
    <div className="alt-head">
      <div style={{ minWidth: 0 }}>
        <div className="alt-title">{fmtLabel(post.format)} “{post.title}”</div>
        <div className="small muted">Versão {post.version}</div>
      </div>
      {status}
    </div>
  );
}

/* ---------- Para encaminhar ---------- */

function PedidoCard({ p, doers, today }: { p: Pedido; doers: Doer[]; today: string }) {
  const { toast } = useUI();
  const [mine, setMine] = useState(false);
  const first = sortedItems(p.post.post_media).items[0] ?? null;
  return (
    <section className="card alt-card">
      <div className="alt-row">
        <Thumb m={first} tag={`v${p.post.version}`} />
        <div className="alt-body">
          <PostHead post={p.post} status={<span className="status pendente">Escolher quem faz</span>} />
          <div className="small muted">
            {p.ask ? <>Pedido {fmtDate(p.ask.created_at)} por {p.ask.author_name}</> : null}
            {p.publish ? <> · Publicação <b>{dayLabel(p.publish, true)}</b></> : <> · Sem data de publicação</>}
            {' · '}<Link href={`/dashboard/clientes/${p.client.id}?post=${p.post.id}`}>Ver conteúdo e conversa</Link>
          </div>
          <AskBox text={p.ask?.content ?? ''} />
          <div className="alt-self">
            <button type="button" className="btn line sm" onClick={() => setMine(true)}><Icon name="check" />Já reeditei o material</button>
            <span className="small muted">Você mesma fez a alteração? Suba a versão nova e escolha: reenviar para o cliente aprovar ou já validar e mandar para agendar.</span>
          </div>
          <ForwardPicker postId={p.post.id} publish={p.publish} doers={doers} today={today} />
        </div>
      </div>
      {mine && (
        <UploadForm
          client={p.client}
          material={p.post}
          onClose={() => setMine(false)}
          direct={{
            onValidate: async (note) => {
              const r = await validarReeditado({ postId: p.post.id, note });
              if (!r.ok) { toast(r.error, 'err'); return false; }
              toast('Validado e enviado para a fila de agendamento');
              if (r.warning) toast(r.warning, 'err');
              return true;
            },
          }}
        />
      )}
    </section>
  );
}

/** Sugestão de prazo: o próximo dia de entrega da pessoa depois de `after`. */
const suggest = (days: number[], after: string) => nextWorkday(days, after);

function ForwardPicker({ postId, publish, doers, today }: { postId: string; publish: string | null; doers: Doer[]; today: string }) {
  const router = useRouter();
  const { toast } = useUI();
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [dueA, setDueA] = useState('');
  const [dueB, setDueB] = useState('');
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const pa = doers.find((d) => d.id === a) ?? null;
  const pb = doers.find((d) => d.id === b) ?? null;

  function pickA(id: string) {
    const d = doers.find((x) => x.id === id)!;
    const due = suggest(d.days, today);
    setA(id); setDueA(due);
    if (b === id) { setB(null); setDueB(''); }
    else if (pb && (!dueB || dueB <= due)) setDueB(suggest(pb.days, due));
  }
  function pickB(id: string | null) {
    setB(id);
    const d = doers.find((x) => x.id === id);
    setDueB(d ? suggest(d.days, dueA || today) : '');
  }
  function changeDueA(v: string) {
    setDueA(v);
    if (pb && v && dueB && dueB <= v) setDueB(suggest(pb.days, v));
  }

  const warns: { who: string; list: DueWarning[]; fix: () => void; fixLabel: string }[] = [];
  if (pa && dueA) {
    const list = dueWarnings({ who: doerName(pa), days: pa.days, due: dueA, publish, today });
    const s = worksOn(pa.days, dueA) && dueA >= today && (!publish || dueA < publish) ? dueA : suggest(pa.days, today);
    if (list.length) warns.push({ who: doerName(pa), list, fix: () => changeDueA(s), fixLabel: `Usar ${dayLabel(s)} para ${doerName(pa)}` });
  }
  if (pb && dueB) {
    const list = dueWarnings({ who: doerName(pb), days: pb.days, due: dueB, publish, today });
    if (dueA && dueB <= dueA) list.unshift({ kind: 'off', text: `O prazo de ${doerName(pb)} precisa ser depois do prazo de ${pa ? doerName(pa) : 'quem vem antes'} (${dayLabel(dueA)}).` });
    const s = suggest(pb.days, dueA || today);
    if (list.length) warns.push({ who: doerName(pb), list, fix: () => setDueB(s), fixLabel: `Usar ${dayLabel(s)} para ${doerName(pb)}` });
  }
  const blocking = !!(pb && dueA && dueB && dueB <= dueA);

  async function go() {
    if (!pa) return toast('Escolha quem altera primeiro.', 'err');
    if (!dueA || (pb && !dueB)) return toast('Escolha o prazo de cada pessoa.', 'err');
    setBusy(true);
    const r = await forwardAlteracao({ postId, note: obs, steps: [{ profileId: pa.id, due: dueA }, ...(pb ? [{ profileId: pb.id, due: dueB }] : [])] });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(`Encaminhado para ${doerName(pa)}${pb ? ` → ${doerName(pb)}` : ''}`);
    if (r.warning) toast(r.warning, 'err');
    router.refresh();
  }

  if (!doers.length) {
    return <p className="small muted alt-pick">Ninguém está marcado para fazer alterações. Marque na aba <Link href="/dashboard/equipe">Equipe</Link>.</p>;
  }

  return (
    <div className="alt-pick">
      <div>
        <p className="q">1º · Quem altera primeiro?</p>
        <div className="alt-people">
          {doers.map((d) => (
            <button key={d.id} type="button" className={`person${a === d.id ? ' on' : ''}`} onClick={() => pickA(d.id)} aria-pressed={a === d.id}>
              <b>{doerName(d)}{a === d.id ? ' ✓' : ''}</b>{d.job && <span>{d.job}</span>}
            </button>
          ))}
        </div>
        {pa && (
          <div className="alt-due">
            <label htmlFor={`due-a-${postId}`}>Prazo de {doerName(pa)}</label>
            <input id={`due-a-${postId}`} className="input" type="date" value={dueA} min={today} onChange={(e) => changeDueA(e.target.value)} />
            <DayStrip days={pa.days} hours={pa.hours} />
          </div>
        )}
      </div>

      {pa && (
        <div>
          <p className="q">2º · Depois passa para… <span>(opcional)</span></p>
          <div className="alt-people">
            {doers.filter((d) => d.id !== a).map((d) => (
              <button key={d.id} type="button" className={`person${b === d.id ? ' on' : ''}`} onClick={() => pickB(d.id)} aria-pressed={b === d.id}>
                <b>{doerName(d)}{b === d.id ? ' ✓' : ''}</b>{d.job && <span>{d.job}</span>}
              </button>
            ))}
            <button type="button" className={`person ghost${!b ? ' on' : ''}`} onClick={() => pickB(null)} aria-pressed={!b}>
              <b>Ninguém{!b ? ' ✓' : ''}</b><span>só uma pessoa</span>
            </button>
          </div>
          {pb && (
            <div className="alt-due">
              <label htmlFor={`due-b-${postId}`}>Prazo de {doerName(pb)}</label>
              <input id={`due-b-${postId}`} className="input" type="date" value={dueB} min={dueA ? addDays(dueA, 1) : today} onChange={(e) => setDueB(e.target.value)} />
              <DayStrip days={pb.days} hours={pb.hours} />
            </div>
          )}
        </div>
      )}

      {pa && (
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`obs-${postId}`}>Observação para a equipe <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
          <textarea id={`obs-${postId}`} className="textarea" rows={2} value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: Quando ela fala “a foto da entrada”, é a fachada nova que está na pasta do Drive." />
          <span className="hint">Use para explicar o que o cliente quis dizer. Aparece no e-mail e na demanda de cada pessoa.</span>
        </div>
      )}

      {warns.length > 0 && (
        <div className="alt-warn" role="alert">
          <b className="t"><Icon name="alert" /> Atenção</b>
          <ul>{warns.flatMap((w) => w.list.map((x, i) => <li key={`${w.who}-${i}`}>{x.text}</li>))}</ul>
          <div className="row">
            {warns.map((w) => <button key={w.who} type="button" className="btn sm" onClick={w.fix}>{w.fixLabel}</button>)}
          </div>
        </div>
      )}

      {pa && (
        <div className="row">
          <button type="button" className="btn" disabled={busy || blocking} onClick={go}>
            <Icon name="send" />{warns.length && !blocking ? 'Tudo bem, seguir assim' : `Encaminhar: ${doerName(pa)}${pb ? ` → ${doerName(pb)}` : ''}`}
          </button>
          <span className="small muted">{doerName(pa)} recebe o e-mail agora.{pb ? ` ${doerName(pb)} recebe quando ${doerName(pa)} terminar.` : ''}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Com a equipe ---------- */

function EquipeCard({ a, today }: { a: AltRow; today: string }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const first = sortedItems(a.posts.post_media).items[0] ?? null;
  const e = currentEtapa(a);
  const late = !!e?.due_date && e.due_date < today;
  async function cancel() {
    if (!(await confirm({ title: 'Cancelar este encaminhamento?', text: 'O que a equipe já fez é descartado e o pedido volta para “Para encaminhar”.', okLabel: 'Cancelar encaminhamento', danger: true }))) return;
    const r = await cancelAlteracao(a.id);
    if (!r.ok) return toast(r.error, 'err');
    toast('Encaminhamento cancelado');
    router.refresh();
  }
  return (
    <section className="card alt-card">
      <div className="alt-row">
        <Thumb m={first} tag={`v${a.posts.version}`} />
        <div className="alt-body">
          <PostHead post={a.posts} status={late ? <span className="status atraso">Atrasada</span> : <span className="status ajustes">Com {e?.name ?? 'a equipe'}</span>} />
          <div className="small muted">Encaminhado por {a.created_by_name} {fmtDate(a.created_at)}{a.publish_date ? <> · Publicação <b>{dayLabel(a.publish_date, true)}</b></> : null}</div>
          <Trail etapas={a.alteracao_etapas} review={false} today={today} />
          <AskBox text={a.request_text} />
          <ObsBox text={a.forward_note} by={a.created_by_name} />
          {a.review_note && <div className="alt-back"><b>Recado da revisão:</b> {a.review_note}</div>}
          <div className="row">
            <Link className="btn line sm" href={`/dashboard/clientes/${a.client_id}?post=${a.post_id}`}><Icon name="eye" />Ver conteúdo e conversa</Link>
            <button type="button" className="btn line sm" onClick={cancel}><Icon name="x" />Cancelar encaminhamento</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Para revisar ---------- */

/** Como fica a versão montada (antes de ir para o cliente). */
function planMedia(a: AltRow): PostMedia[] {
  const live = new Map(a.posts.post_media.map((m) => [m.id, m]));
  const staged = new Map((a.alteracao_media ?? []).map((m) => [m.id, m]));
  return (a.plan?.items ?? []).flatMap((r) => {
    const m = r.src === 'live' ? live.get(r.id) : staged.get(r.id);
    return m ? [m as PostMedia] : [];
  });
}

function RevisarCard({ a, today }: { a: AltRow; today: string }) {
  const router = useRouter();
  const { toast } = useUI();
  const [msg, setMsg] = useState('');
  const [back, setBack] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const before = sortedItems(a.posts.post_media).items;
  const after = planMedia(a);
  const live = new Set(a.posts.post_media.map((m) => m.id));
  const captionChanged = !!a.plan && a.plan.caption !== a.posts.caption;
  const etapas = etapasOf(a);

  async function approve() {
    setBusy(true);
    const r = await approveAlteracao({ alteracaoId: a.id, message: msg });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast('Nova versão enviada ao cliente');
    router.refresh();
  }
  async function sendBackTo() {
    if (!back) return;
    setBusy(true);
    const r = await sendBack({ alteracaoId: a.id, etapaId: back, note });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(`Voltou para ${etapas.find((e) => e.id === back)?.name ?? 'a pessoa'}`);
    if (r.warning) toast(r.warning, 'err');
    router.refresh();
  }

  return (
    <section className="card alt-card">
      <div className="alt-body">
        <PostHead post={a.posts} status={<span className="status alt-rev">Para revisar</span>} />
        <div className="small muted">{a.publish_date ? <>Publicação <b>{dayLabel(a.publish_date, true)}</b> · </> : null}<Link href={`/dashboard/clientes/${a.client_id}?post=${a.post_id}`}>Ver conteúdo e conversa</Link></div>
        <Trail etapas={a.alteracao_etapas} review today={today} />
        <AskBox text={a.request_text} />
        <ObsBox text={a.forward_note} by={a.created_by_name} />

        <div className="alt-compare">
          <div>
            <span className="eyebrow">Antes · v{a.posts.version}</span>
            <div className="strip">{before.length ? before.map((m) => <Thumb key={m.id} m={m} />) : <span className="small muted">Sem arquivos</span>}</div>
          </div>
          <span className="arrow" aria-hidden>→</span>
          <div>
            <span className="eyebrow">Depois · v{a.posts.version + 1}</span>
            <div className="strip">{after.length ? after.map((m) => <Thumb key={m.id} m={m} tag={live.has(m.id) ? undefined : 'novo'} />) : <span className="small muted">Sem arquivos</span>}</div>
          </div>
        </div>
        {captionChanged && (
          <div className="alt-caption">
            <span className="eyebrow">Legenda nova</span>
            <p>{a.plan!.caption || <i className="muted">(sem legenda)</i>}</p>
          </div>
        )}
        <div className="alt-notes">
          {etapas.map((e) => (
            <p key={e.id}><b>{e.name}:</b> {e.note || <span className="muted">sem recado</span>}{e.summary ? <span className="muted"> · {e.summary}</span> : null}</p>
          ))}
        </div>

        <div className="field" style={{ margin: '4px 0 10px' }}>
          <label htmlFor={`msg-${a.id}`}>Recado para o cliente <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
          <input id={`msg-${a.id}`} className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: Fizemos a alteração que você pediu." />
        </div>
        <div className="row">
          <button type="button" className="btn ok2" disabled={busy} onClick={approve}><Icon name="check" />Tudo certo, enviar ao cliente</button>
          {etapas.map((e) => (
            <button key={e.id} type="button" className={`btn line${back === e.id ? ' on' : ''}`} disabled={busy} onClick={() => setBack(back === e.id ? null : e.id)}>
              Voltar para {e.name}
            </button>
          ))}
        </div>
        {back && (
          <div className="alt-backform">
            <label htmlFor={`back-${a.id}`}>O que falta ajustar? <span className="muted">({etapas.find((e) => e.id === back)?.name} recebe por e-mail)</span></label>
            <textarea id={`back-${a.id}`} className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: A foto 3 ficou escura, pode clarear?" />
            <div className="row">
              <button type="button" className="btn" disabled={busy || !note.trim()} onClick={sendBackTo}><Icon name="send" />Devolver</button>
              <button type="button" className="btn line" onClick={() => setBack(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
