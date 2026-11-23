'use client';

import type { ReactNode } from 'react';
import { PHASE_COLOR, phaseOf, type Phase, type Roteiro } from '@/lib/roteiros';

export const PHASE_LABEL: Record<Phase, string> = {
  grav: 'Aguardando gravação', gravado: 'Vídeo bruto', edicao: 'Edição', alter: 'Alteração', pronto: 'Pronto',
};

/** Barra com a proporção de cada fase. */
export function PhaseBar({ items }: { items: Pick<Roteiro, 'status'>[] }) {
  const cnt: Partial<Record<Phase, number>> = {};
  items.forEach((r) => { const p = phaseOf(r); cnt[p] = (cnt[p] ?? 0) + 1; });
  return (
    <div className="rt-sbar">
      {(Object.keys(PHASE_COLOR) as Phase[]).filter((p) => cnt[p]).map((p) => (
        <i key={p} style={{ flex: cnt[p], background: PHASE_COLOR[p] }} />
      ))}
    </div>
  );
}

export function PhaseLegend() {
  return (
    <div className="rt-legend">
      {(Object.keys(PHASE_COLOR) as Phase[]).map((p) => (
        <span key={p}><i style={{ background: PHASE_COLOR[p] }} />{PHASE_LABEL[p]}</span>
      ))}
    </div>
  );
}

/** Gravação → Edição → Calendário */
export function Stepper({ r }: { r: Pick<Roteiro, 'status'> }) {
  const s = r.status;
  const t = [
    s === 'grav' ? 'cur' : 'done',
    s === 'rec' || s === 'pronto' ? 'done' : s === 'alt' ? 'warn' : s === 'bruto' || s === 'edit' ? 'cur' : '',
    s === 'pronto' ? 'done' : s === 'rec' ? 'cur' : '',
  ];
  return (
    <div className="rt-stp">
      {['Gravação', 'Edição', 'Calendário'].map((l, i) => (
        <div key={l} className={t[i]}><i /><span>{l}</span></div>
      ))}
    </div>
  );
}

export function Pill({ tone, children }: { tone?: 'risk' | 'late' | 'high' | 'ok' | 'br' | 'ed' | 'dk'; children: ReactNode }) {
  return <span className={`rt-pill${tone ? ' ' + tone : ''}`}>{children}</span>;
}

export const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
