/* Termômetro de entregas: o que o contrato promete por mês × o que foi aprovado no Aprova (e no Aprova Job). */

export type EntregaStatus = 'sem_meta' | 'em_dia' | 'atencao' | 'atrasado' | 'acima';

export type EntregaRow = {
  id: string; name: string; logo_url: string | null; strategist: string;
  metaMin: number | null; metaMax: number | null; videosMin: number | null; obs: string;
  /** Aprovados no mês (Aprova + outras plataformas). */
  delivered: number;
  /** Vídeos/Reels aprovados no mês. */
  videos: number;
  /** Ainda em aprovação ou em ajuste, com data no mês. */
  inProgress: number;
  /** Quanto já deveria ter saído até hoje, no ritmo da meta. */
  expected: number;
  status: EntregaStatus;
};

/** Fração do mês já passada (1 para meses anteriores, 0 para futuros). */
export function monthProgress(month: string, today: string): number {
  const cur = today.slice(0, 7);
  if (month < cur) return 1;
  if (month > cur) return 0;
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Number(today.slice(8, 10)) / days;
}

/**
 * Situação do cliente no mês.
 * Meta mínima (ou máxima quando o contrato diz "até") × ritmo: abaixo de 70% do esperado = atrasado,
 * abaixo de 90% = atenção. Passou do máximo contratado = acima do contrato (trabalho a mais).
 */
export function entregaStatus(r: Pick<EntregaRow, 'metaMin' | 'metaMax' | 'delivered' | 'inProgress'>, progress: number): { status: EntregaStatus; expected: number } {
  const target = r.metaMin || r.metaMax || 0;
  if (!target) return { status: 'sem_meta', expected: 0 };
  if (r.metaMax && r.delivered > r.metaMax) return { status: 'acima', expected: r.metaMax };
  // contrato "até N": não existe mínimo, então só vale o teto
  if (!r.metaMin) return { status: 'em_dia', expected: 0 };
  const expected = Math.round(target * progress);
  // o que está em aprovação conta metade: já foi produzido, mas ainda não está garantido
  const done = r.delivered + r.inProgress * 0.5;
  if (expected === 0 || done >= expected * 0.9) return { status: 'em_dia', expected };
  if (done >= expected * 0.7) return { status: 'atencao', expected };
  return { status: 'atrasado', expected };
}

export const STATUS_INFO: Record<EntregaStatus, { label: string; cls: string }> = {
  em_dia: { label: 'Em dia', cls: 'aprovado' },
  atencao: { label: 'Atenção', cls: 'pendente' },
  atrasado: { label: 'Atrasado', cls: 'atraso' },
  acima: { label: 'Acima do contrato', cls: 'ajustes' },
  sem_meta: { label: 'Sem meta', cls: '' },
};

export const metaText = (min: number | null, max: number | null) =>
  !min && !max ? '—' : !min ? `até ${max}` : max && max !== min ? `${min} a ${max}` : String(min);
