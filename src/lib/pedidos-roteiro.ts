/*
 * Pedidos de texto (roteiro de vídeo, copy, legenda, texto): Kim/João pedem para a equipe
 * (revisam e enviam ao cliente) e as meninas pedem umas para as outras (volta para quem pediu).
 */
import { addMonths, monthLabel } from './format';

export type PedidoStatus = 'fazendo' | 'revisao' | 'enviado' | 'concluido' | 'cancelado';
export type PedidoTipo = 'roteiro' | 'copy' | 'legenda' | 'texto';

export const TIPOS: Record<PedidoTipo, { label: string; one: string; many: string; item: string; hint: string }> = {
  roteiro: { label: 'Roteiro de vídeo', one: 'roteiro', many: 'roteiros', item: 'Roteiro', hint: 'Gancho:\nDesenvolvimento:\nCTA:' },
  copy: { label: 'Copy', one: 'copy', many: 'copies', item: 'Copy', hint: 'Texto da arte, do anúncio ou da página' },
  legenda: { label: 'Legenda', one: 'legenda', many: 'legendas', item: 'Legenda', hint: 'Legenda do post, com CTA e hashtags' },
  texto: { label: 'Texto', one: 'texto', many: 'textos', item: 'Texto', hint: 'Texto pedido' },
};
export const TIPO_KEYS = Object.keys(TIPOS) as PedidoTipo[];
export const tipoOf = (t: string | null | undefined): PedidoTipo => (t && t in TIPOS ? (t as PedidoTipo) : 'roteiro');
/** "3 roteiros", "1 legenda" */
export const qtdTipo = (n: number, t: string | null | undefined) => `${n} ${n === 1 ? TIPOS[tipoOf(t)].one : TIPOS[tipoOf(t)].many}`;
export type RoteiroItem = { title: string; content: string };

export interface PedidoRoteiro {
  id: string;
  client_id: string | null;
  tipo: PedidoTipo;
  material: string;
  peer: boolean;
  created_by: string | null;
  done_at: string | null;
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

/** "Valéria · 3 legendas · carrossel de Natal" (roteiro mostra o mês) */
export function pedidoTitle(p: Pick<PedidoRoteiro, 'tipo' | 'quantidade' | 'ref_month' | 'material'> & { clients?: { name: string } | null }) {
  const t = tipoOf(p.tipo);
  return [
    p.clients?.name ?? (t === 'roteiro' ? 'Cliente' : 'Interno'),
    t === 'roteiro' ? `${qtdTipo(p.quantidade, t)} de ${monthLabel(p.ref_month)}` : qtdTipo(p.quantidade, t),
    p.material.trim(),
  ].filter(Boolean).join(' · ');
}
