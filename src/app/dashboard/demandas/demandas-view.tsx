'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { AskBox, ClientTabs, Thumb, Trail } from '@/components/admin/alteracoes-ui';
import { UploadForm } from '@/components/admin/upload-form';
import { TYPES } from '@/lib/constants';
import { firstName } from '@/lib/format';
import { splitMedia } from '@/lib/media';
import { dayLabel, etapasOf, STAGED_PREFIX, type Alteracao, type Etapa } from '@/lib/alteracoes';
import type { Client, Post, PostFormat, PostMedia } from '@/lib/types';
import { finishEtapa } from '../alteracoes/actions';

type AltRow = Alteracao & { posts: Post; clients: Client };
type State = 'vez' | 'depois' | 'entregue';

/** Conteúdo como está na versão em andamento (o que a pessoa anterior já fez). */
function baseMaterial(a: AltRow): Post {
  if (!a.plan) return a.posts;
  const live = new Map(a.posts.post_media.map((m) => [m.id, m]));
  const staged = new Map((a.alteracao_media ?? []).map((m) => [m.id, m]));
  const pick = (r: { src: 'live' | 'staged'; id: string }): PostMedia | null => {
    if (r.src === 'live') return live.get(r.id) ?? null;
    const m = staged.get(r.id);
    return m ? { ...m, id: `${STAGED_PREFIX}${m.id}` } : null;
  };
  const items = a.plan.items.flatMap((r, i) => { const m = pick(r); return m ? [{ ...m, order_index: i }] : []; });
  const cover = a.plan.cover ? pick(a.plan.cover) : null;
  return { ...a.posts, caption: a.plan.caption, post_media: [...items, ...(cover ? [{ ...cover, order_index: -1 }] : [])] };
}

export function DemandasView({ rows, error, meId, name, cliente, today }: {
  rows: AltRow[]; error: string | null; meId: string; name: string; cliente: string | null; today: string;
}) {
  const list = useMemo(() => rows.map((a) => {
    const mine = etapasOf(a).filter((e) => e.profile_id === meId);
    const vez = mine.find((e) => e.status === 'fazendo' && a.status === 'fazendo');
    const etapa = vez ?? mine.find((e) => e.status === 'aguardando') ?? mine[mine.length - 1];
    const state: State = vez ? 'vez' : etapa?.status === 'aguardando' ? 'depois' : 'entregue';
    return { a, etapa: etapa!, state };
  }).filter((x) => x.etapa), [rows, meId]);

  const clients = useMemo(() => {
    const m = new Map<string, { id: string; name: string; logo_url: string | null; n: number; late: number }>();
    for (const { a, etapa, state } of list) {
      const c = m.get(a.client_id) ?? { id: a.client_id, name: a.clients.name, logo_url: a.clients.logo_url, n: 0, late: 0 };
      if (state === 'vez') { c.n++; if (etapa.due_date && etapa.due_date < today) c.late++; }
      m.set(a.client_id, c);
    }
    // quem tem coisa para fazer aparece primeiro
    return [...m.values()].sort((x, y) => (y.n - x.n) || x.name.localeCompare(y.name, 'pt-BR'));
  }, [list, today]);
  const current = clients.find((c) => c.id === cliente)?.id ?? clients[0]?.id ?? null;
  const total = list.filter((x) => x.state === 'vez').length;
  const order: Record<State, number> = { vez: 0, depois: 1, entregue: 2 };
  const shown = list.filter((x) => x.a.client_id === current).sort((x, y) => order[x.state] - order[y.state] || (x.etapa.due_date ?? '').localeCompare(y.etapa.due_date ?? ''));

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Para você</p><h1>Minhas <b>demandas</b></h1></div>
      </div>
      {error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>}
      <p className="muted small" style={{ margin: '-14px 0 16px' }}>
        {total ? `${firstName(name)}, você tem ${total} alteraç${total > 1 ? 'ões' : 'ão'} para fazer. Escolha o cliente.` : 'Nada para fazer agora.'}
        {' '}O cliente só vê depois da revisão da Kim ou do João.
      </p>
      <ClientTabs clients={clients} current={current} hrefFor={(id) => `/dashboard/demandas?cliente=${id}`} />
      {!current && <div className="card empty"><p style={{ margin: 0 }}>Quando a Kim ou o João encaminharem uma alteração para você, ela aparece aqui e chega no seu e-mail.</p></div>}
      <div className="alt-list">
        {shown.map(({ a, etapa, state }) => <DemandaCard key={a.id} a={a} etapa={etapa} state={state} meId={meId} today={today} />)}
      </div>
    </>
  );
}

function DemandaCard({ a, etapa, state, meId, today }: { a: AltRow; etapa: Etapa; state: State; meId: string; today: string }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const etapas = etapasOf(a);
  const prev = etapas.filter((e) => e.ordem < etapa.ordem && e.status === 'feita');
  const next = etapas.find((e) => e.ordem > etapa.ordem && e.status === 'aguardando');
  const before = etapas.find((e) => e.ordem < etapa.ordem);
  const late = state === 'vez' && !!etapa.due_date && etapa.due_date < today;
  const material = useMemo(() => baseMaterial(a), [a]);
  const first = splitMedia([...material.post_media].sort((x, y) => x.order_index - y.order_index)).items[0] ?? null;
  const fmt = TYPES[a.posts.format as PostFormat]?.label ?? a.posts.format;

  const status = state === 'vez'
    ? <span className={`status ${late ? 'atraso' : 'ajustes'}`}>{late ? 'Atrasada · era ' : 'Sua vez · prazo '}{dayLabel(etapa.due_date)}</span>
    : state === 'depois'
      ? <span className="status alt-wait">Depois de {before?.name ?? 'outra pessoa'}</span>
      : <span className="status alt-rev">{a.status === 'revisao' ? 'Em revisão' : 'Entregue'}</span>;

  return (
    <section className={`card alt-card${state !== 'vez' ? ' quiet' : ''}`}>
      <div className="alt-row">
        <Thumb m={first} tag={`v${a.posts.version}`} />
        <div className="alt-body">
          <div className="alt-head">
            <div style={{ minWidth: 0 }}>
              <div className="alt-title">{fmt} “{a.posts.title}”</div>
              <div className="small muted">Encaminhado por {a.created_by_name}{a.publish_date ? <> · Publicação {dayLabel(a.publish_date, true)}</> : null}</div>
            </div>
            {status}
          </div>
          <Trail etapas={a.alteracao_etapas} review={a.status === 'revisao'} today={today} meId={meId} />
          {state === 'vez' && etapa.back_note && <div className="alt-back"><b>Recado da revisão:</b> {etapa.back_note}</div>}
          {state === 'vez' && prev.map((p) => (
            <div key={p.id} className="alt-hand"><b>{p.name} já fez a parte dela.</b>{p.note ? ` “${p.note}”` : ''}</div>
          ))}
          {state === 'depois' && <p className="small muted" style={{ margin: '0 0 8px' }}>Vem para você quando {before?.name ?? 'a outra pessoa'} terminar. Você recebe um e-mail.</p>}
          <AskBox text={a.request_text} />
          <div className="row">
            {state === 'vez' && (
              <button type="button" className="btn" onClick={() => setOpen(true)}>
                <Icon name="edit" />Fazer a alteração
              </button>
            )}
            <Link className="btn line sm" href={`/dashboard/clientes/${a.client_id}?post=${a.post_id}`}><Icon name="eye" />Ver conteúdo e conversa</Link>
          </div>
          {state === 'vez' && (
            <p className="small muted" style={{ margin: '8px 0 0' }}>
              Quando terminar, {next ? <>passa sozinho para <b>{next.name}</b></> : <>vai para a <b>revisão da Kim ou do João</b></>}.
            </p>
          )}
        </div>
      </div>
      {open && (
        <UploadForm
          client={a.clients}
          material={material}
          onClose={() => setOpen(false)}
          stage={{
            alteracaoId: a.id,
            submitLabel: next ? `Terminei, passar para ${next.name}` : 'Entregar para revisão',
            goesTo: next ? `para ${next.name}` : 'para a revisão da Kim ou do João',
            onFinish: async (plan, note, summary) => {
              const r = await finishEtapa({ etapaId: etapa.id, plan, note, summary });
              if (!r.ok) { toast(r.error, 'err'); return false; }
              toast(next ? `Passou para ${next.name}` : 'Entregue para revisão');
              if (r.warning) toast(r.warning, 'err');
              return true;
            },
          }}
        />
      )}
    </section>
  );
}
