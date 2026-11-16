'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Escuta o Supabase Realtime e atualiza a página quando um cliente acessa,
 * aprova, pede ajuste ou comenta — o "Movimento dos clientes" ao vivo.
 */
export function LiveRefresh({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const filter = clientId ? `client_id=eq.${clientId}` : undefined;
    const channel = supabase
      .channel(`live-${clientId ?? 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', ...(filter ? { filter } : {}) }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', ...(filter ? { filter } : {}) }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [clientId, router]);

  return null;
}
