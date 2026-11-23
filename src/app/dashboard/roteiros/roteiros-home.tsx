'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { firstName, greet } from '@/lib/format';
import {
  LEVEL_LABEL, STATUS_TEXT, levelOf, whenText, type Equipe, type Roteiro, type RtClient,
} from '@/lib/roteiros';
import { Icon } from '@/components/icon';
import { Mono, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { useMe } from '@/components/admin/me';
import { RoteirosLive } from '@/components/admin/roteiros-live';
import { PhaseBar, PhaseLegend, Pill } from '@/components/roteiros/parts';

type Tone = 'risk' | 'late' | 'high' | 'info';
type Alert = { key: string; tone: Tone; title: string; text: string; href: string };

const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400e3) : 0);

export function RoteirosHome({ clients, roteiros, teams, error }: {
  clients: RtClient[]; roteiros: Roteiro[]; teams: Equipe[]; error: string | null;
}) {
  const me = useMe();
  const router = useRouter();
  const { toast } = useUI();
  const admin = me.role === 'admin';
  const [busy, setBusy] = useState<string | null>(null);

  const cname = new Map(clients.map((c) => [c.client_id, c.clients!.name]));
  const teamOf = new Map(clients.map((c) => [c.client_id, teams.find((t) => t.id === c.team_id) ?? null]));
  const href = (r: Roteiro) => `/dashboard/roteiros/${r.client_id}?mes=${r.month}`;

  /* ---- Sinalizações completas: quem planeja (Renata, Eduarda) ---- */
  const planning: Alert[] = roteiros
    .filter((r) => ['risk', 'late', 'high'].includes(levelOf(r) ?? ''))
    .sort((a, b) => (a.pub_date ?? '9').localeCompare(b.pub_date ?? '9'))
    .map((r) => {
      const L = levelOf(r) as 'risk' | 'late' | 'high';
      return {
        key: `p-${r.id}`, tone: L, title: `${LEVEL_LABEL[L]} · ${cname.get(r.client_id)}`,
        text: `“${r.title}” — ${whenText(r.pub_date)}. ${STATUS_TEXT[r.status]}.`, href: href(r),
      };
    });

  /* ---- Pendências da operação: Kimberly e João (objetivo, sem calendário) ---- */
  const ops: Alert[] = [];
  roteiros.forEach((r) => {
    const L = levelOf(r);
    const cn = cname.get(r.client_id);
    const who = teamOf.get(r.client_id)?.name ?? null;
    if (r.status === 'grav') {
      if (L === 'late' || L === 'risk') {
        ops.push({ key: `o-${r.id}`, tone: 'late', title: 'Entrega pendente',
          text: who ? `${who} ainda não entregou “${r.title}” (${cn}). Conferir.` : `“${r.title}” (${cn}) está sem equipe de gravação definida.`, href: href(r) });
      } else if (L === 'high') {
        ops.push({ key: `o-${r.id}`, tone: 'high', title: 'Prioritário',
          text: `Vídeo prioritário ainda não recebido: “${r.title}” (${cn})${who ? ' · ' + who : ''}.`, href: href(r) });
      }
    }
    if ((r.status === 'edit' || r.status === 'alt') && daysAgo(r.brenda_at ?? r.delivered_at) >= 3) {
      ops.push({ key: `a-${r.id}`, tone: 'info', title: 'Acompanhar',
        text: `${r.status === 'alt' ? 'Alteração pendente' : 'Em edição'} com a Brenda há ${daysAgo(r.brenda_at ?? r.delivered_at)} dias: “${r.title}” (${cn}).`, href: href(r) });
    }
  });
  clients.forEach((c) => {
    const pend = roteiros.filter((r) => r.client_id === c.client_id && r.status === 'grav');
    if (pend.length >= 3) {
      ops.push({ key: `c-${c.client_id}`, tone: 'info', title: 'Captação pendente',
        text: `${c.clients!.name} tem ${pend.length} vídeos aguardando gravação.`, href: `/dashboard/roteiros/${c.client_id}` });
    }
  });

  /* ---- Aviso da Brenda: vale para todos ---- */
  const brenda = roteiros.filter((r) => r.status === 'bruto');

  async function signalBrenda(r: Roteiro) {
    setBusy(r.id);
    const { error: e } = await createClient().from('roteiros')
      .update({ status: 'edit', brenda_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id);
    setBusy(null);
    if (e) return toast(errMsg(e), 'err');
    toast('Brenda sinalizada para editar');
    router.refresh();
  }

  const alerts = admin ? ops : planning;

  return (
    <>
      <RoteirosLive />
      <div className="hello">
        <div>
          <p className="eyebrow">Roteiros e captações</p>
          <h1 suppressHydrationWarning>{greet()}, <b>{firstName(me.name)}</b></h1>
        </div>
        <div className="rt-actions">
          {admin && <Link className="btn line" href="/dashboard/roteiros/equipe"><Icon name="users" />Equipes e clientes</Link>}
          <Link className="btn" href="/dashboard/roteiros/novo"><Icon name="plus" />Novos roteiros</Link>
        </div>
      </div>

      {error && <div className="card empty" style={{ marginBottom: 24 }}><h3>Algo não <b>carregou</b></h3><p>{error}</p></div>}

      {brenda.map((r) => (
        <div key={r.id} className="rt-alert">
          <div>
            <div className="t">Vídeo bruto · {cname.get(r.client_id)}</div>
            <div className="d">“{r.title}” chegou como <Pill tone="br">vídeo bruto</Pill>. Inclua no calendário de conteúdo e sinalize a Brenda para editar.</div>
            <div className="rt-row">
              <button className="btn sm" disabled={busy === r.id} onClick={() => signalBrenda(r)}>Sinalizei a Brenda</button>
              <Link className="btn sm line" href={href(r)}>Abrir roteiro</Link>
            </div>
          </div>
        </div>
      ))}

      {alerts.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="sec-head"><h2>{admin ? <>Pendências da <b>operação</b></> : <>Seu <b>planejamento</b></>}</h2></div>
          <div className="rt-alerts">
            {alerts.map((a) => (
              <Link key={a.key} href={a.href} className={`rt-alert ${a.tone}`}>
                <div><div className="t">{a.title}</div><div className="d">{a.text}</div></div>
                <Icon name="right" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="sec-head">
        <h2>Clientes</h2>
        <span className="muted small">{clients.length} com roteiros</span>
      </div>
      {clients.length === 0 && !error && (
        <div className="card empty">
          <h3>Nenhum cliente em <b>Roteiros</b> ainda</h3>
          <p>{admin ? 'Escolha os clientes e quem grava cada um em “Equipes e clientes”.' : 'Peça para um admin escolher os clientes que usam Roteiros.'}</p>
        </div>
      )}
      <div className="rt-grid">
        {clients.map((c) => {
          const mine = roteiros.filter((r) => r.client_id === c.client_id);
          const pend = mine.filter((r) => r.status === 'grav').length;
          const rk = mine.filter((r) => levelOf(r) === 'risk').length;
          const lt = mine.filter((r) => levelOf(r) === 'late').length;
          const team = teamOf.get(c.client_id);
          return (
            <Link key={c.client_id} href={`/dashboard/roteiros/${c.client_id}`} className="card rt-ccard">
              <div className="rt-ctop">
                <Mono name={c.clients!.name} logo={c.clients!.logo_url} />
                <div className="rt-cname"><h3>{c.clients!.name}</h3><span className="muted small">{team ? `Grava: ${team.name}` : 'Sem equipe de gravação'}</span></div>
              </div>
              <PhaseBar items={mine} />
              <div className="muted small">{mine.length} roteiros</div>
              <div className="rt-row" style={{ marginTop: 8 }}>
                <Pill>{pend} aguardando gravação</Pill>
                {!admin && rk > 0 && <Pill tone="risk">{rk} em risco</Pill>}
                {!admin && lt > 0 && <Pill tone="late">{lt} atrasado{lt > 1 ? 's' : ''}</Pill>}
              </div>
            </Link>
          );
        })}
      </div>
      {clients.length > 0 && <PhaseLegend />}
    </>
  );
}
