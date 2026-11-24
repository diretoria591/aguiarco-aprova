'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtDate } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import { addMonths, currentMonth, monthLabel } from '@/lib/format';
import { STATUS_INFO, metaText, type EntregaRow, type EntregaStatus } from '@/lib/entregas';
import { Mono } from '@/components/ui';

export function EntregasView({ month, progress, rows, error }: {
  month: string; progress: number; rows: EntregaRow[]; error: string | null;
}) {
  const now = currentMonth();
  const count = (s: EntregaStatus) => rows.filter((r) => r.status === s).length;
  const pct = Math.round(progress * 100);

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Contrato × entregue</p><h1>Termômetro de <b>entregas</b></h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn line sm" href={`/dashboard/entregas?mes=${addMonths(month, -1)}`}>←</Link>
          <b suppressHydrationWarning>{monthLabel(month)}</b>
          <Link className="btn line sm" href={`/dashboard/entregas?mes=${addMonths(month, 1)}`} style={month >= now ? { visibility: 'hidden' } : undefined}>→</Link>
        </div>
      </div>
      {error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>}

      <div className="summary" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="sum"><div className="n" style={{ color: 'var(--late)' }}>{count('atrasado')}</div><div className="l">atrasados</div></div>
        <div className="sum"><div className="n" style={{ color: 'var(--wait)' }}>{count('atencao')}</div><div className="l">em atenção</div></div>
        <div className="sum"><div className="n" style={{ color: 'var(--ok)' }}>{count('em_dia')}</div><div className="l">em dia</div></div>
        <div className="sum"><div className="n" style={{ color: 'var(--fix)' }}>{count('acima')}</div><div className="l">acima do contrato</div></div>
      </div>
      <p className="muted small" style={{ margin: '-14px 0 18px' }} suppressHydrationWarning>
        {progress >= 1 ? 'Mês fechado.' : `${pct}% do mês já passou.`} Conta o que foi aprovado no Aprova (e no Aprova Job) com data neste mês, mais as entregas avulsas registradas aqui.
        O que está em aprovação aparece à parte. Metas tiradas dos contratos.
      </p>

      <div className="ent-list">
        {rows.map((r) => {
          const target = r.metaMin || r.metaMax || 0;
          const max = Math.max(target, r.metaMax ?? 0, r.delivered + r.inProgress, 1);
          const info = STATUS_INFO[r.status];
          return (
            <section key={r.id} className={`card ent ent-${r.status}`}>
              <div className="ent-head">
                <Mono name={r.name} logo={r.logo_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/dashboard/clientes/${r.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{r.name}</Link>
                  <div className="small muted">{r.strategist ? `Estratégia: ${r.strategist} · ` : ''}{r.obs || 'Sem meta cadastrada'}</div>
                </div>
                {info.cls ? <span className={`status ${info.cls}`}>{info.label}</span> : <span className="muted small">{info.label}</span>}
              </div>
              {target > 0 && (
                <>
                  <div className="ent-bar" aria-hidden>
                    <i className="done" style={{ width: `${Math.min(100, (r.delivered / max) * 100)}%` }} />
                    <i className="prog" style={{ left: `${Math.min(100, (r.delivered / max) * 100)}%`, width: `${Math.min(100, (r.inProgress / max) * 100)}%` }} />
                    {progress < 1 && !!r.metaMin && <b className="exp" style={{ left: `${Math.min(100, (r.expected / max) * 100)}%` }} title="Esperado até hoje" />}
                    <b className="goal" style={{ left: `${Math.min(100, (target / max) * 100)}%` }} title="Meta do mês" />
                  </div>
                  <div className="ent-nums small" suppressHydrationWarning>
                    <span><b>{r.delivered}</b> entregue{r.delivered === 1 ? '' : 's'} de <b>{metaText(r.metaMin, r.metaMax)}</b></span>
                    {r.inProgress > 0 && <span>+{r.inProgress} em aprovação</span>}
                    {progress < 1 && r.metaMin ? <span>esperado até hoje: {r.expected}</span> : null}
                    {r.videosMin ? <span style={r.videos < Math.round(r.videosMin * progress) ? { color: 'var(--late)' } : undefined}>vídeos: {r.videos} de {r.videosMin}</span> : null}
                    {r.status === 'acima' && <span style={{ color: 'var(--fix)' }}>{r.delivered - (r.metaMax ?? 0)} além do contratado</span>}
                  </div>
                </>
              )}
              <Extras row={r} month={month} />
            </section>
          );
        })}
        {!rows.length && !error && <div className="card empty"><p style={{ margin: 0 }}>Nenhum cliente para acompanhar.</p></div>}
      </div>
    </>
  );
}

/** Entregas fora do Aprova (ex.: cliente pediu para agendar um post avulso): entram na conta do mês. */
function Extras({ row, month }: { row: EntregaRow; month: string }) {
  const router = useRouter();
  const me = useMe();
  const { toast, confirm } = useUI();
  const [open, setOpen] = useState(false);
  const [qtd, setQtd] = useState('1');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const total = row.extras.reduce((s, e) => s + e.quantidade, 0);

  async function save() {
    const n = Math.round(Number(qtd));
    if (!n || n < 1) return toast('Informe a quantidade.', 'err');
    if (!nota.trim()) return toast('Conte o que foi entregue (ex.: post agendado a pedido do cliente).', 'err');
    setBusy(true);
    const { error } = await createClient().from('entregas_manuais').insert({
      client_id: row.id, ref_month: month, quantidade: n, nota: nota.trim(), created_by: me.name,
    });
    setBusy(false);
    if (error) return toast('Não foi possível registrar.', 'err');
    toast('Entrega avulsa registrada');
    setOpen(false); setQtd('1'); setNota('');
    router.refresh();
  }
  async function remove(id: string) {
    if (!(await confirm({ title: 'Remover esta entrega avulsa?', text: 'Ela deixa de contar no termômetro do mês.', okLabel: 'Remover', danger: true }))) return;
    const { error } = await createClient().from('entregas_manuais').delete().eq('id', id);
    if (error) return toast('Não foi possível remover.', 'err');
    router.refresh();
  }

  return (
    <div className="ent-extras">
      {row.extras.length > 0 && (
        <ul>
          {row.extras.map((e) => (
            <li key={e.id} className="small" suppressHydrationWarning>
              <b>+{e.quantidade}</b> avulso{e.quantidade > 1 ? 's' : ''}: {e.nota}
              <span className="muted">{e.created_by ? ` · ${e.created_by}` : ''} · {fmtDate(e.created_at, false)}</span>
              <button className="ent-x" onClick={() => remove(e.id)} aria-label="Remover"><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="ent-form">
          <input className="input" type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ width: 80 }} aria-label="Quantidade" />
          <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi entregue? Ex.: post agendado a pedido da cliente"
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
          <button className="btn sm" disabled={busy} onClick={save}>Registrar</button>
          <button className="btn line sm" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
      ) : (
        <button className="btn line sm" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>
          <Icon name="plus" />Entrega avulsa{total ? ` (${total} no mês)` : ''}
        </button>
      )}
    </div>
  );
}
