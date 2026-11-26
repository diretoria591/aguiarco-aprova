/* Pedidos de roteiro: Kim/João pedem, quem escreve entrega, Kim/João revisam e enviam ao cliente. */
import { addMonths } from './format';

export type PedidoStatus = 'fazendo' | 'revisao' | 'enviado' | 'cancelado';
export type RoteiroItem = { title: string; content: string };

export interface PedidoRoteiro {
  id: string;
  client_id: string;
  profile_id: string | null;
  assignee_name: string;
  ref_month: string;
  quantidade: number;
  briefing: string;
  due_date: string | null;
  fixo_id: string | null;
  status: PedidoStatus;
  itens: RoteiroItem[];
  doc_url: string;
  entrega_note: string;
  delivered_at: string | null;
  back_note: string;
  created_by_name: string;
  created_at: string;
  sent_at: string | null;
  sent_by: string;
  post_ids: string[];
  clients?: { id: string; name: string; logo_url: string | null } | null;
}

export interface RoteiroFixo {
  id: string;
  client_id: string;
  profile_id: string;
  quantidade: number;
  due_day: number;
  briefing: string;
  active: boolean;
}

export type Writer = { id: string; name: string; nickname: string; days: number[]; hours: string };
export const writerName = (w: { name: string; nickname?: string | null }) =>
  (w.nickname || '').trim() || w.name.trim().split(/\s+/)[0] || 'Equipe';

/**
 * Demanda fixa do mês `month` (o mês em que estamos): os roteiros são do mês seguinte
 * (o que vai ao ar) e o prazo é o dia combinado do mês atual.
 */
export function fixoPeriod(month: string, dueDay: number) {
  const day = String(Math.min(Math.max(dueDay, 1), 28)).padStart(2, '0');
  return { ref_month: addMonths(month, 1), due_date: `${month}-${day}` };
}

/** Roteiros entregues com conteúdo (título ou texto). */
export const filledItems = (itens: RoteiroItem[] | null | undefined) =>
  (itens ?? []).filter((i) => i.title.trim() || i.content.trim());
