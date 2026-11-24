'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TeamRole } from '@/lib/types';

/** id/name/email: quem está logado (as ações ficam no nome dessa pessoa). role: de quem é a visão. */
export type Me = {
  id: string; name: string; email: string; role: TeamRole;
  /** Dona da conta (vê tudo, usa "Ver como", muda permissões). */
  owner?: boolean;
  /** Abas que a visão atual libera. */
  sections?: string[];
  viewingAs?: { id: string; name: string };
};
const MeCtx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeCtx.Provider value={me}>{children}</MeCtx.Provider>;
}
export function useMe(): Me {
  const m = useContext(MeCtx);
  if (!m) throw new Error('useMe fora do MeProvider');
  return m;
}
