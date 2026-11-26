'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Client, Counts, ActivityLog } from '@/lib/types';
import { fmtAgo, firstName, greet } from '@/lib/format';
import { Icon } from '@/components/icon';
import { Mono } from '@/components/ui';
import { Timeline } from '@/components/thread';
import { ClientForm } from '@/components/admin/client-form';
import { LiveRefresh } from '@/components/admin/live-refresh';
import { useMe } from '@/components/admin/me';

export type ClientCard = Client & { counts: Counts; cover: string | null };

export function DashboardHome({ clients, recent, error }: { clients: ClientCard[]; recent: ActivityLog[]; error: string | null }) {
  const me = useMe();
  // "Só vê" (função Agendamento): olha os clientes, mas não cadastra nem edita
  const ro = me.role === 'scheduler';
  const [newOpen, setNewOpen] = useState(false);
  const tot = clients.reduce(
    (a, c) => ({ p: a.p + c.counts.pendente, f: a.f + c.counts.ajustes, o: a.o + c.counts.aprovado }),
    { p: 0, f: 0, o: 0 },
  );

  return (
    <>
      <LiveRefresh />
      <div className="hello">
        <div>
          <p className="eyebrow">Painel da agência</p>
          <h1 suppressHydrationWarning>{greet()}, <b>{firstName(me.name)}</b></h1>
        </div>
        {!ro && <button className="btn" onClick={() => setNewOpen(true)}><Icon name="plus" />Novo cliente</button>}
      </div>

      {error && <div className="card empty" style={{ marginBottom: 24 }}><h3>Algo não <b>carregou</b></h3><p>{error}</p></div>}

      <div className="summary">
        <div className="sum dark"><div className="n">{tot.p}</div><div className="l">Aguardando clientes</div></div>
        <div className="sum"><div className="n">{tot.f}</div><div className="l"><span className="status ajustes" style={{ padding: 0, background: 'none' }} />Pedidos de ajuste</div></div>
        <div className="sum"><div className="n">{tot.o}</div><div className="l"><span className="status aprovado" style={{ padding: 0, background: 'none' }} />Aprovados</div></div>
      </div>

      <div className="layout">
        <section>
          <div className="sec-head">
            <h2>Clientes</h2>
            <span className="muted small">{clients.length} ativo{clients.length === 1 ? '' : 's'}</span>
          </div>
          <div className="clients">
            {clients.map((c) => (
              <Link key={c.id} className="card ccard" href={`/dashboard/clientes/${c.id}`}>
                <div className="cover" style={c.cover ? { backgroundImage: `url("${c.cover}")` } : undefined}>
                  <Mono name={c.name} logo={c.logo_url} />
                </div>
                <div className="cbody">
                  <h3>{c.name}{c.client_type === 'pontual' && <span className="role-tag">Pontual</span>}</h3>
                  <div className="counts">
                    {c.counts.pendente > 0 && <span className="status pendente">{c.counts.pendente} aguardando</span>}
                    {c.counts.ajustes > 0 && <span className="status ajustes">{c.counts.ajustes} em ajuste</span>}
                    {c.counts.aprovado > 0 && <span className="status aprovado">{c.counts.aprovado} aprovado{c.counts.aprovado > 1 ? 's' : ''}</span>}
                    {c.counts.reprovado > 0 && <span className="status reprovado">{c.counts.reprovado} reprovado{c.counts.reprovado > 1 ? 's' : ''}</span>}
                    {!c.counts.pendente && !c.counts.ajustes && !c.counts.aprovado && !c.counts.reprovado && <span className="muted small">Nenhum material ainda</span>}
                  </div>
                  <div className="foot" suppressHydrationWarning>
                    <Icon name="eye" />
                    {c.last_accessed_at ? `Acessou ${fmtAgo(c.last_accessed_at)}` : 'Ainda não acessou'}
                  </div>
                </div>
              </Link>
            ))}
            {!ro && (
              <button className="card ccard add" onClick={() => setNewOpen(true)}>
                <div><div className="plus"><Icon name="plus" /></div>Cadastrar cliente</div>
              </button>
            )}
          </div>
        </section>
        <aside className="side">
          <div className="card">
            <h3>Movimento dos clientes</h3>
            {recent.length
              ? <Timeline events={recent} withClient />
              : <p className="muted small" style={{ margin: 0 }}>Quando os clientes acessarem, aprovarem ou comentarem, aparece aqui.</p>}
          </div>
        </aside>
      </div>

      {newOpen && <ClientForm onClose={() => setNewOpen(false)} />}
    </>
  );
}
