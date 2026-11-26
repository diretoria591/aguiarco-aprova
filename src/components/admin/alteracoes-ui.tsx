'use client';

import Link from 'next/link';
import { Icon } from '@/components/icon';
import { Mono } from '@/components/ui';
import { embedThumb, isCover, isEmbed } from '@/lib/media';
import { dayLabel, etapasOf, WEEKDAYS, type Etapa } from '@/lib/alteracoes';
import type { PostMedia } from '@/lib/types';

/** Abas de cliente: só os clientes com algo na lista, cada um com o número de pendências. */
export function ClientTabs({ clients, current, hrefFor }: {
  clients: { id: string; name: string; logo_url: string | null; n: number; late?: number }[];
  current: string | null;
  hrefFor: (id: string) => string;
}) {
  if (!clients.length) return null;
  return (
    <nav className="alt-clients" aria-label="Clientes">
      {clients.map((c) => (
        <Link key={c.id} href={hrefFor(c.id)} scroll={false} className={`alt-cl${c.id === current ? ' on' : ''}`} aria-current={c.id === current ? 'page' : undefined}>
          <Mono name={c.name} logo={c.logo_url} className="alt-mono" />
          <span className="nm">{c.name}</span>
          <span className={`n${c.late ? ' late' : ''}`}>{c.n}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Miniatura de um arquivo (foto, vídeo, link ou PDF). */
export function Thumb({ m, tag }: { m: Pick<PostMedia, 'file_url' | 'file_type' | 'file_name'> | null; tag?: string }) {
  let inner: React.ReactNode = <Icon name="image" />;
  if (m) {
    if (m.file_type.startsWith('image/') || isCover(m)) {
      // eslint-disable-next-line @next/next/no-img-element
      inner = <img src={m.file_url} alt="" loading="lazy" />;
    } else if (m.file_type.startsWith('video/')) {
      inner = <video src={`${m.file_url}#t=0.5`} muted preload="metadata" playsInline />;
    } else if (isEmbed(m)) {
      const t = embedThumb(m.file_url);
      // eslint-disable-next-line @next/next/no-img-element
      inner = t ? <img src={t} alt="" loading="lazy" /> : <Icon name="video" />;
    } else inner = <Icon name="doc" />;
  }
  return <span className="alt-thumb">{inner}{tag && <small>{tag}</small>}</span>;
}

/** Trilha do pedido: 1ª pessoa → 2ª → revisão → cliente. */
export function Trail({ etapas, review, today, meId }: { etapas: Etapa[]; review: boolean; today: string; meId?: string }) {
  const list = etapasOf({ alteracao_etapas: etapas });
  return (
    <div className="alt-trail">
      {list.map((e) => {
        const late = e.status === 'fazendo' && !!e.due_date && e.due_date < today;
        const who = meId && e.profile_id === meId ? 'Você' : e.name;
        return (
          <span key={e.id} className="seg">
            <span className={`t ${e.status === 'feita' ? 'done' : e.status === 'fazendo' ? (late ? 'late' : 'now') : ''}`}>
              {e.status === 'feita' ? '✓' : e.status === 'fazendo' ? '●' : '○'} {who}
              {e.due_date && e.status !== 'feita' && <em> · {late ? 'atrasada desde ' : 'prazo '}{dayLabel(e.due_date)}</em>}
            </span>
            <span className="sep" aria-hidden>→</span>
          </span>
        );
      })}
      <span className={`t ${review ? 'rev' : ''}`}>{review ? '●' : '○'} Revisão</span>
      <span className="sep" aria-hidden>→</span>
      <span className="t">Cliente</span>
    </div>
  );
}

/** Dias da semana em que a pessoa entrega. */
export function DayStrip({ days, hours }: { days: number[]; hours?: string }) {
  return (
    <span className="alt-days" title="Dias de entrega">
      {WEEKDAYS.map((w) => <span key={w.n} className={days.includes(w.n) ? '' : 'no'}>{w.short}</span>)}
      {hours ? <span className="hrs">{hours}</span> : null}
    </span>
  );
}

/** Observação de quem encaminhou: "traduz" o pedido do cliente para quem vai fazer. */
export function ObsBox({ text, by }: { text: string; by?: string }) {
  if (!text) return null;
  return <div className="alt-obs"><b>Observação{by ? ` da ${by.trim().split(/\s+/)[0]}` : ''}:</b> {text}</div>;
}

export function AskBox({ text }: { text: string }) {
  if (!text) return null;
  return <div className="alt-ask"><b>O cliente pediu:</b> “{text}”</div>;
}
