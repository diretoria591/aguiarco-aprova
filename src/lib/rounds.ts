import type { Comment } from './types';

export const DEFAULT_REVISION_LIMIT = 2;

const isAsk = (c: Comment) => c.author_role === 'client' && c.kind === 'adjustment';

/** Rodadas já usadas em um conteúdo: pedidos de alteração do cliente, sem os marcados como erro da agência. */
export function roundsUsed(comments: Comment[]): number {
  return comments.filter((c) => isAsk(c) && !c.agency_error).length;
}

export type RoundInfo = { n: number; extra: boolean; free: boolean };

/** Para cada pedido de alteração (id do comentário): número da rodada, se é extra (cobrável) ou se não conta (erro nosso). */
export function roundMap(comments: Comment[], limit: number): Map<string, RoundInfo> {
  const out = new Map<string, RoundInfo>();
  let n = 0;
  for (const c of comments) {
    if (!isAsk(c)) continue;
    if (c.agency_error) { out.set(c.id, { n: 0, extra: false, free: true }); continue; }
    n += 1;
    out.set(c.id, { n, extra: n > limit, free: false });
  }
  return out;
}
