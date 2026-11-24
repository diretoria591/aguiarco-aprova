'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtAgo } from '@/lib/format';
import {
  COOLDOWN_HOURS, URGENT_DAYS, WAIT_HOURS, publishLabel, reminderMessage, type CobrarItem,
} from '@/lib/cobrar';
import { Icon } from '@/components/icon';
import { Mono, copyText, useUI } from '@/components/ui';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { useMe } from '@/components/admin/me';

const days = (n: number) => (n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`);

export function CobrarList({ items, error }: { items: CobrarItem[]; error: string | null }) {
  return (
    <>
      <LiveRefresh />
      <div className="hello">
        <div><p className="eyebrow">Aprovações paradas</p><h1>Cobrar <b>hoje</b></h1></div>
      </div>
      <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Entram aqui os clientes com conteúdo aguardando aprovação há mais de {WAIT_HOURS / 24} dias, ou com publicação
          em até {URGENT_DAYS} dias. Depois de cobrar, o cliente sai da lista e volta em {COOLDOWN_HOURS / 24} dias
          (1 dia se for urgente) se ainda não tiver respondido.
        </p>
        {error ? (
          <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>
        ) : !items.length ? (
          <div className="card empty">
            <h3>Ninguém para <b>cobrar</b> hoje</h3>
            <p style={{ margin: 0 }}>Todos os clientes estão em dia ou já foram lembrados recentemente.</p>
          </div>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              <b>{items.length}</b> cliente{items.length > 1 ? 's' : ''} para cobrar
              {items.some((i) => i.urgent) ? `, ${items.filter((i) => i.urgent).length} com publicação chegando` : ''}.
            </p>
            {items.map((it) => <Row key={it.client.id} item={it} />)}
          </>
        )}
      </div>
    </>
  );
}

function Row({ item }: { item: CobrarItem }) {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const c = item.client;

  async function log(meta: string) {
    const { error } = await createClient().from('activity_logs').insert({
      client_id: c.id, type: 'cobranca', actor: me.name, meta,
      action_text: `${me.name} cobrou a aprovação (${meta})`,
    });
    if (error) toast('Não foi possível registrar a cobrança', 'err');
    router.refresh();
  }

  async function go(ch: 'whats' | 'copy' | 'manual') {
    if (busy) return;
    setBusy(true);
    try {
      const msg = reminderMessage(item, window.location.origin);
      if (ch === 'whats') {
        const n = String(c.whatsapp || '').replace(/\D/g, '');
        window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
        await log('WhatsApp');
      } else if (ch === 'copy') {
        const ok = await copyText(msg);
        toast(ok ? 'Mensagem copiada, cole no WhatsApp do cliente' : 'Não foi possível copiar', ok ? undefined : 'err');
        if (ok) await log('mensagem copiada');
      } else {
        await log('por outro meio');
        toast('Marcado como cobrado');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card numeros" style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Mono name={c.name} logo={c.logo_url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/dashboard/clientes/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
          <div className="small muted" suppressHydrationWarning>
            {item.posts.length} aguardando · o mais antigo enviado {days(item.oldestDays)}
            {' · '}
            {item.lastContact ? `última cobrança/aviso ${fmtAgo(item.lastContact.created_at)}` : 'sem cobrança recente'}
          </div>
        </div>
        {item.urgent && <span className="status atraso">Urgente</span>}
      </div>

      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
        {item.posts.map((p) => (
          <li key={p.id} className="small">
            <b style={{ fontWeight: 500 }}>{p.title}</b>
            <span className="muted" suppressHydrationWarning>
              {' · enviado '}<span style={p.waitingDays >= 5 ? { color: 'var(--late)', fontWeight: 500 } : undefined}>{days(p.waitingDays)}</span>
              {' · '}{p.first_viewed_at ? 'cliente já viu' : 'cliente ainda não abriu'}
              {p.daysToPublish !== null ? ' · ' : ''}
            </span>
            {p.daysToPublish !== null && (
              <span style={p.urgent ? { color: 'var(--late)', fontWeight: 500 } : undefined} className={p.urgent ? undefined : 'muted'}>
                {publishLabel(p.daysToPublish, p.scheduled_date)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn sm" disabled={busy} onClick={() => go('whats')}><Icon name="whats" />Cobrar no WhatsApp</button>
        <button className="btn line sm" disabled={busy} onClick={() => go('copy')}><Icon name="copy" />Copiar mensagem</button>
        <button className="btn line sm" disabled={busy} onClick={() => go('manual')}><Icon name="check" />Já cobrei</button>
        {!c.whatsapp && <span className="small muted">Sem número cadastrado: o WhatsApp abre para escolher o contato ou grupo.</span>}
      </div>
    </section>
  );
}
