'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { PedirTexto, type PedirClient } from '@/components/admin/pedir-texto';
import { fmtDate } from '@/lib/format';
import { dayLabel } from '@/lib/alteracoes';
import { TIPOS, filledItems, pedidoTitle, tipoOf, type PedidoRoteiro, type RoteiroItem, type Writer } from '@/lib/pedidos-roteiro';
import { cancelPedido, concluirPedido, savePedido, sendBackPedido } from '../roteiros/pedidos/actions';

/**
 * Pedidos de texto em Minhas demandas: o que a pessoa tem para escrever, o que ela pediu
 * para outra pessoa da equipe e o botão para pedir.
 */
export function PedidosTexto({ rows, asked, today, month, meId, writers, clients }: {
  rows: PedidoRoteiro[]; asked: PedidoRoteiro[]; today: string; month: string; meId: string; writers: Writer[]; clients: PedirClient[];
}) {
  const [pedir, setPedir] = useState(false);
  const vez = rows.filter((r) => r.status === 'fazendo').length;
  const chegou = asked.filter((r) => r.status === 'revisao').length;
  const canAsk = writers.some((w) => w.id !== meId);
  return (
    <>
      {canAsk && (
        <div className="rp-section">
          {!pedir
            ? <button className="btn line" onClick={() => setPedir(true)}><Icon name="plus" />Pedir roteiro, copy, legenda ou texto para alguém</button>
            : (
              <>
                <div className="rp-head" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 16, color: 'var(--ink)' }}>Pedir para alguém da equipe</h2>
                  <button className="btn sm ghost" onClick={() => setPedir(false)}><Icon name="x" />Fechar</button></div>
                <PedirTexto writers={writers} clients={clients} today={today} month={month} meId={meId} peer onDone={() => setPedir(false)} />
              </>
            )}
        </div>
      )}
      {rows.length > 0 && (
        <section className="rp-section">
          <h2>Para escrever{vez ? ` · ${vez}` : ''}</h2>
          <div className="alt-list">{rows.map((p) => <EscreverCard key={p.id} p={p} today={today} />)}</div>
        </section>
      )}
      {asked.length > 0 && (
        <section className="rp-section">
          <h2>Pedidos que eu fiz{chegou ? ` · ${chegou} chegou${chegou > 1 ? 'aram' : ''}` : ''}</h2>
          <div className="alt-list">{asked.map((p) => <PedidoFeitoCard key={p.id} p={p} today={today} />)}</div>
        </section>
      )}
    </>
  );
}

const fill = (p: PedidoRoteiro): RoteiroItem[] => {
  const have = [...(p.itens ?? [])];
  while (have.length < p.quantidade) have.push({ title: '', content: '' });
  return have;
};

function DueStatus({ p, today }: { p: PedidoRoteiro; today: string }) {
  const late = !!p.due_date && p.due_date < today;
  const hoje = p.due_date === today;
  return <span className={`status ${late ? 'atraso' : 'ajustes'}`}>{late ? `Atrasado · era ${dayLabel(p.due_date)}` : hoje ? 'Prazo hoje' : p.due_date ? `Prazo ${dayLabel(p.due_date)}` : 'Sem prazo'}</span>;
}

function EscreverCard({ p, today }: { p: PedidoRoteiro; today: string }) {
  const router = useRouter();
  const { toast } = useUI();
  const t = TIPOS[tipoOf(p.tipo)];
  const doing = p.status === 'fazendo';
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<RoteiroItem[]>(() => fill(p));
  const [doc, setDoc] = useState(p.doc_url ?? '');
  const [note, setNote] = useState(p.entrega_note ?? '');
  const [busy, setBusy] = useState(false);
  const feitos = filledItems(itens).length;
  const backTo = p.peer ? p.created_by_name || 'quem pediu' : 'a revisão da Kim ou do João';
  const set = (i: number, patch: Partial<RoteiroItem>) => setItens((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function save(deliver: boolean) {
    setBusy(true);
    const r = await savePedido({ id: p.id, itens, docUrl: doc, note, deliver });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(deliver ? `Entregue para ${backTo}` : 'Rascunho salvo');
    if (r.warning) toast(r.warning, 'err');
    if (deliver) setOpen(false);
    router.refresh();
  }

  return (
    <section className={`card alt-card${doing ? '' : ' quiet'}`}>
      <div className="alt-body">
        <div className="alt-head">
          <div style={{ minWidth: 0 }}>
            <div className="alt-title">{pedidoTitle(p)}</div>
            <div className="small muted">{t.label} · {p.fixo_id ? 'demanda fixa do contrato' : `pedido por ${p.created_by_name || 'Kim ou João'}`}{doing && feitos ? ` · rascunho: ${feitos} de ${p.quantidade}` : ''}</div>
          </div>
          {doing ? <DueStatus p={p} today={today} /> : <span className="status alt-rev">{p.peer ? `Com ${p.created_by_name || 'quem pediu'}` : 'Em revisão'} · entregue {fmtDate(p.delivered_at)}</span>}
        </div>
        {doing && p.back_note && <div className="alt-back"><b>Ajuste pedido:</b> {p.back_note}</div>}
        {p.briefing && <div className="alt-ask"><b>Briefing:</b> {p.briefing}</div>}
        {doing && !open && (
          <div className="row">
            <button className="btn" onClick={() => setOpen(true)}><Icon name="pen" />{feitos ? 'Continuar escrevendo' : 'Escrever agora'}</button>
          </div>
        )}
        {doing && open && (
          <>
            {itens.map((it, i) => (
              <div key={i} className="rp-item">
                <div className="rp-head">
                  <span>{t.item} {i + 1}</span>
                  {itens.length > 1 && i >= p.quantidade && <button className="btn sm ghost" onClick={() => setItens((all) => all.filter((_, k) => k !== i))}><Icon name="trash" /></button>}
                </div>
                <input className="input" value={it.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })}
                  placeholder={p.tipo === 'roteiro' ? 'Título (ex.: 3 cuidados depois do procedimento)' : 'Título ou para qual post'} />
                <textarea className="textarea" rows={7} value={it.content} onChange={(e) => set(i, { content: e.target.value })} placeholder={t.hint} />
              </div>
            ))}
            <div className="row"><button className="btn sm line" onClick={() => setItens((all) => [...all, { title: '', content: '' }])}><Icon name="plus" />Mais um</button></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Ou cole o link do documento (Google Docs)</label>
              <input className="input" type="url" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="https://docs.google.com/…" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Recado para {p.peer ? p.created_by_name || 'quem pediu' : 'a revisão'} (opcional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => save(true)}><Icon name="send" />Entregar</button>
              <button className="btn line" disabled={busy} onClick={() => save(false)}>Salvar rascunho</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>Fechar</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Ao entregar, vai para {backTo}{p.peer ? '' : ' antes de chegar ao cliente'}, com aviso por e-mail.</p>
          </>
        )}
      </div>
    </section>
  );
}

/** O que a pessoa pediu para outra: acompanhar o prazo e, quando chegar, receber ou pedir ajuste. */
function PedidoFeitoCard({ p, today }: { p: PedidoRoteiro; today: string }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [back, setBack] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chegou = p.status === 'revisao';
  const itens = filledItems(p.itens);

  async function run(fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>, msg: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(msg);
    if (r.warning) toast(r.warning, 'err');
    setBack(null);
    router.refresh();
  }
  async function cancel() {
    const ok = await confirm({ title: 'Cancelar este pedido?', text: `Sai das demandas de ${p.assignee_name || 'quem ia fazer'}.`, okLabel: 'Cancelar pedido', danger: true });
    if (ok) run(() => cancelPedido(p.id), 'Pedido cancelado');
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('Não deu para copiar.', 'err'); }
  }

  return (
    <section className={`card alt-card${chegou ? '' : ' quiet'}`}>
      <div className="alt-body">
        <div className="alt-head">
          <div style={{ minWidth: 0 }}>
            <div className="alt-title">{pedidoTitle(p)}</div>
            <div className="small muted">{TIPOS[tipoOf(p.tipo)].label} · faz: <b>{p.assignee_name}</b></div>
          </div>
          {chegou ? <span className="status aprovado">Chegou {fmtDate(p.delivered_at)}</span> : <DueStatus p={p} today={today} />}
        </div>
        {chegou && p.entrega_note && <div className="alt-hand"><b>{p.assignee_name}:</b> {p.entrega_note}</div>}
        {chegou && p.doc_url && <div className="small"><a href={p.doc_url} target="_blank" rel="noopener noreferrer"><Icon name="link" /> Abrir documento</a></div>}
        {chegou && itens.map((it, i) => (
          <div key={i} className="rp-item">
            <div className="rp-head"><b style={{ color: 'var(--ink)' }}>{it.title || `${TIPOS[tipoOf(p.tipo)].item} ${i + 1}`}</b>
              <button className="btn sm ghost" onClick={() => copy(it.content)}><Icon name="copy" />Copiar</button></div>
            <div className="caption" style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{it.content}</div>
          </div>
        ))}
        {back !== null && (
          <div className="field" style={{ marginBottom: 0 }}><label>O que precisa ajustar?</label>
            <textarea className="textarea" value={back} onChange={(e) => setBack(e.target.value)} autoFocus />
          </div>
        )}
        <div className="row">
          {chegou && back === null && (
            <>
              <button className="btn" disabled={busy} onClick={() => run(() => concluirPedido({ id: p.id }), 'Recebido ✓')}><Icon name="check" />Recebido</button>
              <button className="btn line" disabled={busy} onClick={() => setBack('')}>Pedir ajuste</button>
            </>
          )}
          {back !== null && (
            <>
              <button className="btn" disabled={busy} onClick={() => run(() => sendBackPedido(p.id, back), `Voltou para ${p.assignee_name}`)}>Devolver para {p.assignee_name}</button>
              <button className="btn ghost" onClick={() => setBack(null)}>Voltar</button>
            </>
          )}
          {back === null && <button className="btn sm ghost" onClick={cancel}><Icon name="trash" />Cancelar pedido</button>}
        </div>
      </div>
    </section>
  );
}
