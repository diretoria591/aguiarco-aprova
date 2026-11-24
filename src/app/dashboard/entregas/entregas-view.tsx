'use client';

import Link from 'next/link';
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
        {progress >= 1 ? 'Mês fechado.' : `${pct}% do mês já passou.`} Conta o que foi aprovado no Aprova (e no Aprova Job) com data neste mês.
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
                    <span><b>{r.delivered}</b> aprovado{r.delivered === 1 ? '' : 's'} de <b>{metaText(r.metaMin, r.metaMax)}</b></span>
                    {r.inProgress > 0 && <span>+{r.inProgress} em aprovação</span>}
                    {progress < 1 && r.metaMin ? <span>esperado até hoje: {r.expected}</span> : null}
                    {r.videosMin ? <span style={r.videos < Math.round(r.videosMin * progress) ? { color: 'var(--late)' } : undefined}>vídeos: {r.videos} de {r.videosMin}</span> : null}
                    {r.status === 'acima' && <span style={{ color: 'var(--fix)' }}>{r.delivered - (r.metaMax ?? 0)} além do contratado</span>}
                  </div>
                </>
              )}
            </section>
          );
        })}
        {!rows.length && !error && <div className="card empty"><p style={{ margin: 0 }}>Nenhum cliente para acompanhar.</p></div>}
      </div>
    </>
  );
}
