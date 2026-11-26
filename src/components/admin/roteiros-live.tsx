'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Atualiza a seção Roteiros quando alguém cadastra, entrega ou muda um roteiro (ou um pedido de roteiro). */
export function RoteirosLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 500);
    };
    const channel = supabase
      .channel('live-roteiros')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roteiros' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roteiro_pedidos' }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
