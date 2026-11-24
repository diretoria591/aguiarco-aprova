'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addMonths, currentMonth, fmtDate, monthLabel } from '@/lib/format';
import { METRICS, type MetricKey } from '@/lib/relatorio';
import { Icon } from '@/components/icon';
import { Mono, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';

type Metrics = Partial<Record<MetricKey, string>>;
export type NumerosRow = {
  id: string; name: string; logo_url: string | null; instagram: string; posts: number;
  metrics: Metrics; prev: Metrics; by: string; at: string | null; ready: boolean;
};

const filled = (m: Metrics) => METRICS.filter((x) => (m[x.key] ?? '').trim()).length;

export function NumerosView({ month, rows, error }: { month: string; rows: NumerosRow[]; error: string | null }) {
  const now = currentMonth();
  const active = rows.filter((r) => r.posts > 0);
  const others = rows.filter((r) => r.posts === 0);
  const [showOthers, setShowOthers] = useState(false);
  const done = active.filter((r) => r.at).length;
  const label = monthLabel(month);

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Instagram · Meta Business</p><h1>Números <b>do mês</b></h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn line sm" href={`/dashboard/numeros?mes=${addMonths(month, -1)}`}>←</Link>
          <b suppressHydrationWarning>{label}</b>
          <Link className="btn line sm" href={`/dashboard/numeros?mes=${addMonths(month, 1)}`} style={month >= now ? { visibility: 'hidden' } : undefined}>→</Link>
        </div>
      </div>
      <div className="numeros" style={{ display: 'grid', gap: 12, maxWidth: 980 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Copie os números do Meta Business Suite (período: {label.toLowerCase()}) para cada cliente. <b>Prazo: dia 3.</b>{' '}
          Eles entram direto no relatório e na apresentação, e a Renata faz a leitura estratégica.
          {' '}{done}/{active.length} cliente{active.length === 1 ? '' : 's'} preenchido{active.length === 1 ? '' : 's'}.
        </p>
        {error && <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>}
        {active.map((r) => <Row key={r.id} row={r} month={month} />)}
        {others.length > 0 && (
          <button className="btn line sm" style={{ justifySelf: 'start' }} onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? 'Esconder' : 'Mostrar'} clientes sem conteúdo no mês ({others.length})
          </button>
        )}
        {showOthers && others.map((r) => <Row key={r.id} row={r} month={month} />)}
      </div>
    </>
  );
}

function Row({ row, month }: { row: NumerosRow; month: string }) {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const [m, setM] = useState<Metrics>(row.metrics);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await createClient().from('relatorios').upsert({
      client_id: row.id, ref_month: month, metrics: m, metrics_by: me.name, metrics_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,ref_month' });
    setBusy(false);
    if (error) { toast(`Não foi possível salvar: ${error.message}`, 'err'); return; }
    setDirty(false);
    toast(`Números de ${row.name} salvos`);
    router.refresh();
  }

  const n = filled(m);
  return (
    <section className="card" style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mono name={row.name} logo={row.logo_url} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <b style={{ fontWeight: 600 }}>{row.name}</b>
          <div className="small muted" suppressHydrationWarning>
            {row.instagram ? `@${row.instagram.replace(/^@/, '')} · ` : ''}
            {row.posts} conteúdo{row.posts === 1 ? '' : 's'} no mês
            {row.at ? ` · preenchido por ${row.by || 'equipe'} ${fmtDate(row.at, false)}` : ''}
          </div>
        </div>
        {row.ready ? <span className="status aprovado">Relatório pronto</span>
          : n === METRICS.length ? <span className="status aprovado"><Icon name="check" />Completo</span>
          : n ? <span className="status pendente">{n}/{METRICS.length}</span>
          : <span className="status atraso">Não preenchido</span>}
        <button className="btn sm" disabled={busy || !dirty} onClick={save}>{dirty ? 'Salvar' : 'Salvo'}</button>
      </div>
      <div className="rp-metrics">
        {METRICS.map((x) => {
          const p = (row.prev[x.key] ?? '').trim();
          return (
            <label key={x.key} className="rp-metric">
              <input value={m[x.key] ?? ''} inputMode="numeric" placeholder="—"
                onChange={(e) => { setM((v) => ({ ...v, [x.key]: e.target.value })); setDirty(true); }} />
              <span>{x.label}{p ? ` · mês anterior: ${p}` : ''}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
