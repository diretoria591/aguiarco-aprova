'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useUI } from '@/components/ui';
import { addMonths, monthLabel } from '@/lib/format';
import { dayLabel, nextWorkday, worksOn } from '@/lib/alteracoes';
import { TIPOS, TIPO_KEYS, qtdTipo, writerName, type PedidoTipo, type Writer } from '@/lib/pedidos-roteiro';
import { createPedido } from '@/app/dashboard/roteiros/pedidos/actions';

export type PedirClient = { id: string; name: string };

/**
 * Pedir roteiro, copy, legenda ou texto para alguém da equipe, com prazo para receber.
 * Kim/João: passa pela revisão deles. As meninas: volta para quem pediu.
 */
export function PedirTexto({ writers, clients, today, month, meId, peer, onDone }: {
  writers: Writer[]; clients: PedirClient[]; today: string; month: string; meId: string; peer: boolean; onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useUI();
  const people = writers.filter((w) => w.id !== meId);
  const months = [0, 1, 2].map((k) => addMonths(month, k));
  const [tipo, setTipo] = useState<PedidoTipo>('roteiro');
  const [clientId, setClientId] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [q, setQ] = useState(1);
  const [ref, setRef] = useState(addMonths(month, 1));
  const [due, setDue] = useState('');
  const [material, setMaterial] = useState('');
  const [briefing, setBriefing] = useState('');
  const [busy, setBusy] = useState(false);
  const w = people.find((x) => x.id === who) ?? null;

  function pick(id: string) {
    setWho(id);
    const x = people.find((y) => y.id === id);
    // sugestão de prazo: roteiro em 3 dias de entrega da pessoa; copy/legenda/texto no próximo dia de entrega
    if (x && !due) { let d = today; for (let i = 0; i < (tipo === 'roteiro' ? 3 : 1); i++) d = nextWorkday(x.days, d); setDue(d); }
  }
  async function submit() {
    if (tipo === 'roteiro' && !clientId) return toast('Escolha o cliente.', 'err');
    if (!who) return toast('Escolha quem faz.', 'err');
    if (!due) return toast('Escolha o prazo para receber.', 'err');
    setBusy(true);
    const r = await createPedido({ tipo, clientId: clientId || null, profileId: who, quantidade: q, refMonth: tipo === 'roteiro' ? ref : null, due, briefing, material });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(`Pedido enviado para ${w ? writerName(w) : 'a pessoa'} · prazo ${dayLabel(due)}`);
    if (r.warning) toast(r.warning, 'err');
    setClientId(''); setWho(null); setQ(1); setDue(''); setBriefing(''); setMaterial('');
    router.refresh();
    onDone?.();
  }

  if (!people.length) {
    return <div className="card empty"><p style={{ margin: 0 }}>Ninguém está marcado como “escreve roteiros e textos”. Marque a pessoa na aba Equipe.</p></div>;
  }
  return (
    <div className="card rt-pad">
      <div className="field"><label>O que você precisa</label>
        <div className="chips">
          {TIPO_KEYS.map((k) => (
            <button key={k} type="button" className={`chip-opt${tipo === k ? ' on' : ''}`} onClick={() => setTipo(k)}>{TIPOS[k].label}</button>
          ))}
        </div>
      </div>
      <div className="row2">
        <div className="field"><label>Cliente{tipo === 'roteiro' ? '' : ' (opcional)'}</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">{tipo === 'roteiro' ? 'Escolha…' : 'Sem cliente / interno'}</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {tipo === 'roteiro' ? (
          <div className="field"><label>Roteiros de (mês em que vão ao ar)</label>
            <select className="input" value={ref} onChange={(e) => setRef(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        ) : (
          <div className="field"><label>Para qual material (opcional)</label>
            <input className="input" value={material} maxLength={200} onChange={(e) => setMaterial(e.target.value)} placeholder="Ex.: carrossel de Natal, anúncio de dezembro" />
          </div>
        )}
      </div>
      <div className="field"><label>Quem faz</label>
        <div className="alt-people">
          {people.map((x) => (
            <button key={x.id} type="button" className={`person${who === x.id ? ' on' : ''}`} onClick={() => pick(x.id)}>
              <b>{writerName(x)}</b><span>{x.hours || 'entrega nos dias marcados'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="row2">
        <div className="field"><label>Quantos</label>
          <input className="input" type="number" min={1} max={60} value={q} onChange={(e) => setQ(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
        </div>
        <div className="field"><label>Prazo para você receber</label>
          <input className="input" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
          {w && due && !worksOn(w.days, due) && <span className="hint" style={{ color: 'var(--late)' }}>{writerName(w)} não entrega nesse dia.</span>}
          {due && <span className="hint">Se passar de {dayLabel(due, true)} sem entrega, {peer ? 'aparece como atrasado para você' : 'você e o João recebem o aviso de atraso'}.</span>}
        </div>
      </div>
      <div className="field"><label>Briefing (tema, objetivo, referências, tom)</label>
        <textarea className="textarea" value={briefing} onChange={(e) => setBriefing(e.target.value)} placeholder={tipo === 'roteiro'
          ? 'Ex.: 2 vídeos sobre cuidados pós-procedimento e 1 de bastidores. Tom leve, até 40 segundos.'
          : 'Ex.: legenda do carrossel de Natal, tom acolhedor, CTA para agendar pelo WhatsApp.'} />
      </div>
      <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Enviando…' : `Pedir ${qtdTipo(q, tipo)}`}</button>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        {peer ? 'Quando ficar pronto, volta para você em Minhas demandas e chega no seu e-mail.' : 'Quando ficar pronto, aparece em “Para revisar” e você recebe um e-mail.'}
      </p>
    </div>
  );
}
