'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { fmtDate, monthLabel } from '@/lib/format';
import { dayLabel } from '@/lib/alteracoes';
import { filledItems, type PedidoRoteiro, type RoteiroItem } from '@/lib/pedidos-roteiro';
import { savePedido } from '../roteiros/pedidos/actions';

/** Pedidos de roteiro da pessoa: escrever, salvar rascunho e entregar para a revisão da Kim ou do João. */
export function RoteirosEscrever({ rows, today }: { rows: PedidoRoteiro[]; today: string }) {
  if (!rows.length) return null;
  const vez = rows.filter((r) => r.status === 'fazendo').length;
  return (
    <section className="rp-section">
      <h2>Roteiros para escrever{vez ? ` · ${vez}` : ''}</h2>
      <div className="alt-list">
        {rows.map((p) => <PedidoCard key={p.id} p={p} today={today} />)}
      </div>
    </section>
  );
}

const fill = (p: PedidoRoteiro): RoteiroItem[] => {
  const have = [...(p.itens ?? [])];
  while (have.length < p.quantidade) have.push({ title: '', content: '' });
  return have;
};

function PedidoCard({ p, today }: { p: PedidoRoteiro; today: string }) {
  const router = useRouter();
  const { toast } = useUI();
  const doing = p.status === 'fazendo';
  const [open, setOpen] = useState(false);
  const [itens, setItens] = useState<RoteiroItem[]>(() => fill(p));
  const [doc, setDoc] = useState(p.doc_url ?? '');
  const [note, setNote] = useState(p.entrega_note ?? '');
  const [busy, setBusy] = useState(false);
  const late = doing && !!p.due_date && p.due_date < today;
  const feitos = filledItems(itens).length;
  const set = (i: number, patch: Partial<RoteiroItem>) => setItens((all) => all.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function save(deliver: boolean) {
    setBusy(true);
    const r = await savePedido({ id: p.id, itens, docUrl: doc, note, deliver });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(deliver ? 'Entregue para a revisão da Kim ou do João' : 'Rascunho salvo');
    if (deliver) setOpen(false);
    router.refresh();
  }

  const status = doing
    ? <span className={`status ${late ? 'atraso' : 'ajustes'}`}>{late ? `Atrasado · era ${dayLabel(p.due_date)}` : p.due_date ? `Prazo ${dayLabel(p.due_date)}` : 'Sem prazo'}</span>
    : <span className="status alt-rev">Em revisão · entregue {fmtDate(p.delivered_at)}</span>;

  return (
    <section className={`card alt-card${doing ? '' : ' quiet'}`}>
      <div className="alt-body">
        <div className="alt-head">
          <div style={{ minWidth: 0 }}>
            <div className="alt-title">{p.clients?.name ?? 'Cliente'} · {p.quantidade} roteiro{p.quantidade > 1 ? 's' : ''} de {monthLabel(p.ref_month)}</div>
            <div className="small muted">{p.fixo_id ? 'Demanda fixa do contrato' : `Pedido por ${p.created_by_name || 'Kim ou João'}`}{doing && feitos ? ` · ${feitos} de ${p.quantidade} escritos` : ''}</div>
          </div>
          {status}
        </div>
        {doing && p.back_note && <div className="alt-back"><b>Recado da revisão:</b> {p.back_note}</div>}
        {p.briefing && <div className="alt-ask"><b>Briefing:</b> {p.briefing}</div>}
        {doing && !open && (
          <div className="row">
            <button className="btn" onClick={() => setOpen(true)}><Icon name="pen" />{feitos ? 'Continuar escrevendo' : 'Escrever os roteiros'}</button>
          </div>
        )}
        {doing && open && (
          <>
            {itens.map((it, i) => (
              <div key={i} className="rp-item">
                <div className="rp-head">
                  <span>Roteiro {i + 1}</span>
                  {itens.length > 1 && i >= p.quantidade && <button className="btn sm ghost" onClick={() => setItens((all) => all.filter((_, k) => k !== i))}><Icon name="trash" /></button>}
                </div>
                <input className="input" value={it.title} maxLength={200} onChange={(e) => set(i, { title: e.target.value })} placeholder="Título (ex.: 3 cuidados depois do procedimento)" />
                <textarea className="textarea" rows={7} value={it.content} onChange={(e) => set(i, { content: e.target.value })}
                  placeholder={'Gancho:\nDesenvolvimento:\nCTA:'} />
              </div>
            ))}
            <div className="row"><button className="btn sm line" onClick={() => setItens((all) => [...all, { title: '', content: '' }])}><Icon name="plus" />Mais um roteiro</button></div>
            <div className="field" style={{ marginBottom: 0 }}><label>Ou cole o link do documento (Google Docs)</label>
              <input className="input" type="url" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="https://docs.google.com/…" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>Recado para a revisão (opcional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => save(true)}><Icon name="send" />Entregar para revisão</button>
              <button className="btn line" disabled={busy} onClick={() => save(false)}>Salvar rascunho</button>
              <button className="btn ghost" onClick={() => setOpen(false)}>Fechar</button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>O cliente só vê depois que a Kim ou o João revisarem e enviarem.</p>
          </>
        )}
      </div>
    </section>
  );
}
