'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type Me = { id: string; name: string; email: string };
const MeCtx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeCtx.Provider value={me}>{children}</MeCtx.Provider>;
}
export function useMe(): Me {
  const m = useContext(MeCtx);
  if (!m) throw new Error('useMe fora do MeProvider');
  return m;
}
