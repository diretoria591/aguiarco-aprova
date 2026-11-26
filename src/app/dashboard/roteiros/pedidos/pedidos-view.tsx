'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { RoteirosLive } from '@/components/admin/roteiros-live';
import { addMonths, fmtDate, monthLabel } from '@/lib/format';
import { dayLabel } from '@/lib/alteracoes';
import { TIPOS, filledItems, fixoPeriod, pedidoTitle, qtdTipo, tipoOf, writerName, type PedidoRoteiro, type RoteiroFixo, type RoteiroItem, type Writer } from '@/lib/pedidos-roteiro';
import { useMe } from '@/components/admin/me';
import { PedirTexto } from '@/components/admin/pedir-texto';
import { cancelPedido, concluirPedido, deleteFixo, saveFixo, sendBackPedido, sendPedidoToClient } from './actions';

export type PedidosAba = 'pedir' | 'revisar' | 'equipe' | 'enviados' | 'fixos';
type C = { id: string; name: string; videos: number | null; pontual: boolean };
type Board = { fazendo: PedidoRoteiro[]; revisao: PedidoRoteiro[]; enviados: PedidoRoteiro[]; fixos: RoteiroFixo[]; error: string | null };

const ABAS: { key: PedidosAba; label: string; hint: string }[] = [
  { key: 'pedir', label: 'Pedir', hint: 'Roteiro de vídeo, copy, legenda ou texto: escolha quem faz e o prazo para receber. A pessoa recebe por e-mail e em Minhas demandas.' },
  { key: 'revisar', label: 'Para revisar', hint: 'Entregues: confira, ajuste o texto se quiser e envie para o cliente aprovar, ou marque como recebido para usar num material.' },
  { key: 'equipe', label: 'Com a equipe', hint: 'O que alguém está escrevendo agora, inclusive os pedidos que as meninas fizeram umas para as outras.' },
  { key: 'enviados', label: 'Enviados e recebidos', hint: 'Últimos 45 dias.' },
  { key: 'fixos', label: 'Demandas fixas', hint: 'Roteiros que todo mês saem pelo contrato. No começo de cada mês o Aprova cria o pedido sozinho para quem escreve.' },
];

export function PedidosView({ aba, board, writers, clients, counts, today, month }: {
  aba: PedidosAba; board: Board; writers: Writer[]; clients: C[]; today: string; month: string;
  counts: { revisar: number; equipe: number; enviados: number; fixos: number };
}) {
  const me = useMe();
  const n = (k: PedidosAba) => (k === 'pedir' ? null : counts[k]);
  const late = board.fazendo.filter((p) => p.due_date && p.due_date < today).length;
  const hot = (k: PedidosAba) => (k === 'revisar' && !!counts.revisar) || (k === 'equipe' && late > 0);
  return (
    <>
      <RoteirosLive />
      <Link href="/dashboard/roteiros" className="rt-back"><Icon name="left" />Roteiros</Link>
      <div className="hello">
        <div><p className="eyebrow">Roteiro, copy, legenda e texto</p><h1>Pedidos para a <b>equipe</b></h1></div>
      </div>
      {board.error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar: {board.error}. Rode a migration <code>2026-11-26_pedidos_roteiro.sql</code> no Supabase.</p></div>}
      <div className="tabs" role="tablist">
        {ABAS.map((t) => (
          <Link key={t.key} href={`/dashboard/roteiros/pedidos?aba=${t.key}`} className={`tab${t.key === aba ? ' on' : ''}`} role="tab" aria-selected={t.key === aba}>
            {t.label}{n(t.key) !== null && <span className={`n${hot(t.key) ? ' hot' : ''}`}>{n(t.key)}</span>}
          </Link>
        ))}
      </div>
      <p className="muted small" style={{ margin: '-8px 0 14px' }}>{ABAS.find((t) => t.key === aba)!.hint}</p>
      {late > 0 && aba !== 'equipe' && (
        <div className="alt-back" style={{ marginBottom: 14 }}>
          <b>{late} pedido{late > 1 ? 's' : ''} com prazo vencido.</b> <Link href="/dashboard/roteiros/pedidos?aba=equipe">Ver em Com a equipe</Link>
        </div>
      )}

      {aba === 'pedir' && <PedirTexto writers={writers} clients={clients} today={today} month={month} meId={me.id} peer={false} />}
      {aba === 'revisar' && <List empty="Nada para revisar agora." rows={board.revisao} render={(p) => <RevisarCard key={p.id} p={p} />} />}
      {aba === 'equipe' && <List empty="Ninguém está escrevendo nada agora." rows={board.fazendo} render={(p) => <EquipeCard key={p.id} p={p} today={today} />} />}
      {aba === 'enviados' && <List empty="Nada enviado ou recebido nos últimos 45 dias." rows={board.enviados} render={(p) => <EnviadoCard key={p.id} p={p} />} />}
      {aba === 'fixos' && <Fixos fixos={board.fixos} writers={writers} clients={clients} month={month} />}
    </>
  );
}

function List({ rows, empty, render }: { rows: PedidoRoteiro[]; empty: string; render: (p: PedidoRoteiro) => React.ReactNode }) {
  if (!rows.length) return <div className="card empty"><p style={{ margin: 0 }}>{empty}</p></div>;
  return <div className="alt-list">{rows.map(render)}</div>;
}

const qtd = (n: number) => `${n} roteiro${n > 1 ? 's' : ''}`;

function Head({ p, status }: { p: PedidoRoteiro; status: React.ReactNode }) {
  return (
    <div className="alt-head">
      <div style={{ minWidth: 0 }}>
        <div className="alt-title">{pedidoTitle(p)}</div>
        <div className="small muted">
          {TIPOS[tipoOf(p.tipo)].label} · faz: <b>{p.assignee_name || 'sem pessoa'}</b>
          {p.fixo_id ? ' · demanda fixa do contrato' : p.created_by_name ? ` · pedido por ${p.created_by_name}` : ''}
          {p.due_date ? ` · prazo ${dayLabel(p.due_date, true)}` : ''}
        </div>
      </div>
      {status}
    </div>
  );
}

/* ---------- Revisar ---------- */

function RevisarCard({ p }: { p: PedidoRoteiro }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [itens, setItens] = useState<RoteiroItem[]>(filledItems(p.itens));
  const [back, setBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<RoteiroItem>) => setItens((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const total = filledItems(itens).length || (p.doc_url ? 1 : 0);

  async function done() {
    setBusy(true);
    const r = await concluirPedido({ id: p.id, itens });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast('Marcado como recebido');
    router.refresh();
  }
  async function send() {
    const ok = await confirm({ title: `Enviar ${qtdTipo(total, p.tipo)} para ${p.clients?.name ?? 'o cliente'}?`, text: 'Cada um vira um material de texto no link de aprovação do cliente.', okLabel: 'Enviar' });
    if (!ok) return;
    setBusy(true);
    const r = await sendPedidoToClient({ id: p.id, itens });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast('Enviado para o cliente aprovar');
    router.refresh();
  }
  async function sendBack() {
    setBusy(true);
    const r = await sendBackPedido(p.id, back ?? '');
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(`Voltou para ${p.assignee_name || 'a pessoa'}`);
    if (r.warning) toast(r.warning, 'err');
    setBack(null);
    router.refresh();
  }

  return (
    <section className="card alt-card">
      <div className="alt-body">
        <Head p={p} status={<span className="status alt-rev">Entregue {fmtDate(p.delivered_at)}</span>} />
        {p.briefing && <div className="alt-ask"><b>Briefing:</b> {p.briefing}</div>}
        {p.entrega_note && <div className="alt-hand"><b>{p.assignee_name}:</b> {p.entrega_note}</div>}
        {p.doc_url && <div className="small"><a href={p.doc_url} target="_blank" rel="noopener noreferrer"><Icon name="link" /> Abrir documento dos roteiros</a></div>}
        {itens.map((it, i) => (
          <div key={i} className="rp-item">
            <input className="input" value={it.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} placeholder={`${TIPOS[tipoOf(p.tipo)].item} ${i + 1}`} />
            <textarea className="textarea" value={it.content} onChange={(e) => set(i, { content: e.target.value })} rows={6} />
          </div>
        ))}
        {back !== null && (
          <div className="field" style={{ marginBottom: 0 }}><label>O que precisa ajustar?</label>
            <textarea className="textarea" value={back} onChange={(e) => setBack(e.target.value)} autoFocus />
          </div>
        )}
        <div className="row">
          {back === null ? (
            <>
              {p.client_id && <button className="btn" disabled={busy || !total} onClick={send}><Icon name="send" />Enviar {qtdTipo(total, p.tipo)} para o cliente</button>}
              <button className={`btn${p.client_id ? ' line' : ''}`} disabled={busy} onClick={done}><Icon name="check" />Recebido{p.client_id ? ', não enviar' : ''}</button>
              <button className="btn line" disabled={busy} onClick={() => setBack('')}>Pedir ajuste</button>
              <CancelBtn id={p.id} />
            </>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={sendBack}>Devolver para {p.assignee_name || 'a pessoa'}</button>
              <button className="btn ghost" onClick={() => setBack(null)}>Voltar</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function CancelBtn({ id }: { id: string }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  async function go() {
    const ok = await confirm({ title: 'Cancelar este pedido?', text: 'Ele some de Minhas demandas de quem escreve.', okLabel: 'Cancelar pedido', danger: true });
    if (!ok) return;
    const r = await cancelPedido(id);
    if (!r.ok) return toast(r.error, 'err');
    toast('Pedido cancelado');
    router.refresh();
  }
  return <button className="btn sm ghost" onClick={go}><Icon name="trash" />Cancelar pedido</button>;
}

/* ---------- Com a equipe ---------- */

function EquipeCard({ p, today }: { p: PedidoRoteiro; today: string }) {
  const late = !!p.due_date && p.due_date < today;
  const feitos = filledItems(p.itens).length;
  return (
    <section className="card alt-card">
      <div className="alt-body">
        <Head p={p} status={<span className={`status ${late ? 'atraso' : 'ajustes'}`}>{late ? `Atrasado · era ${dayLabel(p.due_date)}` : p.due_date ? `Prazo ${dayLabel(p.due_date)}` : 'Sem prazo'}</span>} />
        <div className="small muted">{feitos ? `Rascunho: ${feitos} de ${p.quantidade}` : 'Ainda não começou'}{p.peer ? ` · pedido entre a equipe (volta para ${p.created_by_name})` : ''}</div>
        {p.briefing && <div className="alt-ask"><b>Briefing:</b> {p.briefing}</div>}
        {p.back_note && <div className="alt-back"><b>Ajuste pedido:</b> {p.back_note}</div>}
        <div className="row"><CancelBtn id={p.id} /></div>
      </div>
    </section>
  );
}

function EnviadoCard({ p }: { p: PedidoRoteiro }) {
  return (
    <section className="card alt-card quiet">
      <div className="alt-body">
        <Head p={p} status={<span className="status aprovado">{p.status === 'concluido' ? `Recebido ${fmtDate(p.done_at)}` : `Enviado ${fmtDate(p.sent_at)}`}</span>} />
        <div className="small muted">
          {filledItems(p.itens).map((i) => i.title).filter(Boolean).join(' · ')}
          {p.sent_by ? ` · por ${p.sent_by}` : ''}{p.status === 'enviado' && p.client_id ? <> · <Link href={`/dashboard/clientes/${p.client_id}`}>Ver no cliente</Link></> : null}
        </div>
      </div>
    </section>
  );
}

/* ---------- Demandas fixas ---------- */

type FixoDraft = { id?: string; clientId: string; profileId: string; quantidade: number; dueDay: number; briefing: string; active: boolean };
const blankFixo = (): FixoDraft => ({ clientId: '', profileId: '', quantidade: 4, dueDay: 20, briefing: '', active: true });

function Fixos({ fixos, writers, clients, month }: { fixos: RoteiroFixo[]; writers: Writer[]; clients: C[]; month: string }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [edit, setEdit] = useState<FixoDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';
  const wName = (id: string) => { const w = writers.find((x) => x.id === id); return w ? writerName(w) : 'Pessoa'; };
  const per = (d: number) => fixoPeriod(month, d);
  const total = fixos.filter((f) => f.active).reduce((s, f) => s + f.quantidade, 0);
  // clientes com vídeos no contrato que ainda não têm demanda fixa
  const sugestoes = clients.filter((c) => !c.pontual && (c.videos ?? 0) > 0 && !fixos.some((f) => f.client_id === c.id));

  async function save() {
    if (!edit) return;
    setBusy(true);
    const r = await saveFixo(edit);
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(edit.id ? 'Demanda fixa atualizada' : 'Demanda fixa criada. O pedido deste mês já foi para a pessoa.');
    if (r.warning) toast(r.warning, 'err');
    setEdit(null);
    router.refresh();
  }
  async function remove(f: RoteiroFixo) {
    const ok = await confirm({ title: 'Excluir esta demanda fixa?', text: `${cName(f.client_id)} deixa de gerar pedido todo mês para ${wName(f.profile_id)}. Pedidos já criados continuam.`, okLabel: 'Excluir', danger: true });
    if (!ok) return;
    const r = await deleteFixo(f.id);
    if (!r.ok) return toast(r.error, 'err');
    toast('Demanda fixa excluída');
    router.refresh();
  }

  return (
    <>
      <div className="card rt-pad" style={{ marginBottom: 14 }}>
        <p style={{ margin: 0 }}>
          <b>{total} roteiros por mês</b> em {fixos.filter((f) => f.active).length} demandas fixas.
          {' '}Neste mês ({monthLabel(month)}) a equipe escreve os roteiros de <b>{monthLabel(addMonths(month, 1))}</b>.
        </p>
        {sugestoes.length > 0 && (
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Pelo contrato, estes clientes têm vídeos e ainda não têm demanda fixa:{' '}
            {sugestoes.map((c, i) => (
              <span key={c.id}>{i > 0 && ', '}<button className="linkish" onClick={() => setEdit({ ...blankFixo(), clientId: c.id, quantidade: c.videos ?? 4 })}>{c.name} ({c.videos} vídeos)</button></span>
            ))}
          </p>
        )}
      </div>

      {fixos.length > 0 && (
        <div className="alt-list" style={{ marginBottom: 14 }}>
          {fixos.map((f) => (
            <section key={f.id} className={`card alt-card${f.active ? '' : ' quiet'}`}>
              <div className="alt-head">
                <div style={{ minWidth: 0 }}>
                  <div className="alt-title">{cName(f.client_id)} · {qtd(f.quantidade)} por mês</div>
                  <div className="small muted">Escreve: <b>{wName(f.profile_id)}</b> · prazo todo dia {f.due_day} (este mês: {dayLabel(per(f.due_day).due_date)}){f.active ? '' : ' · pausada'}</div>
                  {f.briefing && <div className="small" style={{ marginTop: 4 }}>{f.briefing}</div>}
                </div>
                <div className="row">
                  <button className="btn sm line" onClick={() => setEdit({ id: f.id, clientId: f.client_id, profileId: f.profile_id, quantidade: f.quantidade, dueDay: f.due_day, briefing: f.briefing, active: f.active })}><Icon name="edit" />Editar</button>
                  <button className="btn sm ghost" onClick={() => remove(f)}><Icon name="trash" /></button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {!edit && <button className="btn" onClick={() => setEdit(blankFixo())}><Icon name="plus" />Nova demanda fixa</button>}
      {edit && (
        <div className="card rt-pad">
          <b>{edit.id ? 'Editar demanda fixa' : 'Nova demanda fixa'}</b>
          <div className="row2" style={{ marginTop: 10 }}>
            <div className="field"><label>Cliente</label>
              <select className="input" value={edit.clientId} onChange={(e) => {
                const c = clients.find((x) => x.id === e.target.value);
                setEdit({ ...edit, clientId: e.target.value, ...(c?.videos && !edit.id ? { quantidade: c.videos } : {}) });
              }}>
                <option value="">Escolha…</option>
                {clients.filter((c) => !c.pontual).map((c) => <option key={c.id} value={c.id}>{c.name}{c.videos ? ` · ${c.videos} vídeos no contrato` : ''}</option>)}
              </select>
            </div>
            <div className="field"><label>Quem escreve</label>
              <select className="input" value={edit.profileId} onChange={(e) => setEdit({ ...edit, profileId: e.target.value })}>
                <option value="">Escolha…</option>
                {writers.map((w) => <option key={w.id} value={w.id}>{writerName(w)}</option>)}
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field"><label>Roteiros por mês</label>
              <input className="input" type="number" min={1} max={60} value={edit.quantidade} onChange={(e) => setEdit({ ...edit, quantidade: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })} />
            </div>
            <div className="field"><label>Prazo: todo dia</label>
              <input className="input" type="number" min={1} max={28} value={edit.dueDay} onChange={(e) => setEdit({ ...edit, dueDay: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} />
              <span className="hint">Neste mês: {dayLabel(per(edit.dueDay).due_date, true)}, para os roteiros de {monthLabel(per(edit.dueDay).ref_month)}.</span>
            </div>
          </div>
          <div className="field"><label>Briefing fixo (o que vale todo mês)</label>
            <textarea className="textarea" value={edit.briefing} onChange={(e) => setEdit({ ...edit, briefing: e.target.value })} placeholder="Ex.: 2 educativos, 1 bastidor e 1 depoimento. Seguir a pauta do mês." />
          </div>
          {edit.id && (
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Ativa (gera pedido todo mês)
            </label>
          )}
          <div className="row">
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}
