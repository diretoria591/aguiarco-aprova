'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { copyText, useUI } from '@/components/ui';
import { fmtDate, monthLabel } from '@/lib/format';
import { TONE_LABEL, type PersonPerf, type Tone } from '@/lib/desempenho';
import { sendFeedback } from './actions';

const TONE_CLASS: Record<Tone, string> = { otimo: 'aprovado', bom: 'ajustes', atencao: 'atraso', neutro: 'alt-wait' };

export function DesempenhoView({ month, months, current, people, queueStuck, error }: {
  month: string; months: string[]; current: boolean; people: PersonPerf[]; queueStuck: number; error: string | null;
}) {
  const sorted = [...people].sort((a, b) => order(a.tone) - order(b.tone) || a.nick.localeCompare(b.nick, 'pt-BR'));
  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Resumo das entregas</p><h1><b>Desempenho</b> da equipe</h1></div>
      </div>
      {error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar tudo: {error}</p></div>}
      <div className="tabs" role="tablist">
        {months.map((m) => (
          <Link key={m} href={`/dashboard/desempenho?mes=${m}`} className={`tab${m === month ? ' on' : ''}`} role="tab" aria-selected={m === month}>
            {monthLabel(m)}{m === months[0] ? ' (até agora)' : ''}
          </Link>
        ))}
      </div>
      <p className="muted small" style={{ margin: '-8px 0 14px' }}>
        No prazo: agendamento até o próximo dia de entrega da pessoa depois da aprovação (e antes da publicação); alterações e pedidos de texto até o prazo combinado;
        relatórios até o dia 5 e números até o dia 3. A mensagem é uma sugestão: ajuste antes de enviar.
      </p>
      {queueStuck > 0 && current && (
        <div className="alt-back" style={{ marginBottom: 14 }}>
          <b>{queueStuck} post{queueStuck > 1 ? 's' : ''} aprovado{queueStuck > 1 ? 's' : ''} há mais de 2 dias</b> ainda sem agendar. <Link href="/dashboard/agendamento">Ver a fila</Link>
        </div>
      )}
      <div className="alt-list">
        {sorted.map((p) => <PersonCard key={p.id} p={p} month={month} />)}
      </div>
    </>
  );
}
const order = (t: Tone) => ({ atencao: 0, bom: 1, otimo: 2, neutro: 3 }[t]);

function PersonCard({ p, month }: { p: PersonPerf; month: string }) {
  const router = useRouter();
  const { toast } = useUI();
  const [msg, setMsg] = useState(p.message);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const metrics = Object.fromEntries(p.areas.map((a) => [a.key, { onTime: a.onTime, late: a.late, openLate: a.openLate }]));
    const r = await sendFeedback({ profileId: p.id, month, tone: p.tone, message: msg, metrics, email });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(`Recado enviado para ${p.nick}`);
    if (r.warning) toast(r.warning, 'err');
    router.refresh();
  }
  async function copy() {
    const ok = await copyText(msg);
    toast(ok ? 'Copiado. Cole no WhatsApp.' : 'Não deu para copiar.', ok ? undefined : 'err');
  }

  return (
    <section className="card alt-card">
      <div className="alt-body">
        <div className="alt-head">
          <div style={{ minWidth: 0 }}>
            <div className="alt-title">{p.nick}{p.job ? <span className="muted" style={{ fontWeight: 400 }}> · {p.job}</span> : null}</div>
            <div className="small muted">
              {p.total ? <>{p.rate}% no prazo · {p.onTime} de {p.total} entregas{p.openLate ? ` · ${p.openLate} atrasada${p.openLate > 1 ? 's' : ''} agora` : ''}</> : 'Nenhuma entrega registrada no Aprova neste mês'}
              {p.last ? ` · último recado ${fmtDate(p.last.created_at, false)}${p.last.seen_at ? ' (lido)' : ' (ainda não lido)'}` : ''}
            </div>
          </div>
          <span className={`status ${TONE_CLASS[p.tone]}`}>{TONE_LABEL[p.tone]}</span>
        </div>
        {p.areas.length > 0 && (
          <div className="perf-areas">
            {p.areas.map((a) => {
              const tot = a.onTime + a.late + a.openLate;
              const bad = a.late + a.openLate;
              return (
                <div key={a.key} className={`perf-area${bad === 0 ? ' ok' : bad / tot > 0.3 || a.openLate ? ' late' : ''}`}>
                  <b>{a.label}</b>
                  <span>{a.onTime} de {tot} no prazo</span>
                  {a.openLate > 0 && <span className="perf-open">{a.openLate} atrasada{a.openLate > 1 ? 's' : ''} agora</span>}
                  {a.extra && <small>{a.extra}</small>}
                </div>
              );
            })}
          </div>
        )}
        {p.areas.some((a) => a.openList.length) && (
          <div className="alt-back"><b>Atrasado agora:</b> {p.areas.flatMap((a) => a.openList).join(' · ')}</div>
        )}
        <div className="field" style={{ marginBottom: 0 }}><label>Recado para {p.nick}</label>
          <textarea className="textarea" rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={send}><Icon name="send" />{busy ? 'Enviando…' : `Enviar para ${p.nick}`}</button>
          <button className="btn line" onClick={copy}><Icon name="whats" />Copiar para o WhatsApp</button>
          <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> também por e-mail
          </label>
          {msg !== p.message && <button className="btn sm ghost" onClick={() => setMsg(p.message)}>Voltar para a sugestão</button>}
        </div>
        <p className="small muted" style={{ margin: 0 }}>{p.nick} vê o recado no topo do Aprova até marcar como lido.</p>
      </div>
    </section>
  );
}
