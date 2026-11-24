'use client';

import { useState } from 'react';
import { fmtDate, firstName } from '@/lib/format';
import { BRIEFING, answerFor, type BriefingAnswers } from '@/lib/briefing';
import type { Client } from '@/lib/types';
import { Icon } from '@/components/icon';
import { copyText, useUI } from '@/components/ui';

export function briefingLink(token: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return `${base}/briefing/${token}`;
}

/** Onboarding do cliente: etapas, pasta do Drive, link do briefing e respostas. */
export function OnboardingCard({ client }: { client: Client }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const status = client.onboarding_status ?? 'antigo';
  const answers = (client.briefing ?? {}) as BriefingAnswers;
  const answered = !!client.briefing_answered_at;
  const link = briefingLink(client.access_token);
  const nome = firstName(client.contact_name) || client.name;
  const msg = `Oi, ${nome}! Tudo bem? 🤍\n\nPara começarmos do jeito certo, preparamos um briefing rápido (uns 10 minutos) para conhecer melhor o seu negócio:\n${link}\n\nQualquer dúvida, estamos por aqui!\nEquipe Aguiar&Co`;

  async function copy() {
    const ok = await copyText(link);
    toast(ok ? 'Link do briefing copiado' : 'Não foi possível copiar', ok ? undefined : 'err');
  }
  function whats() {
    const n = String(client.whatsapp || '').replace(/\D/g, '');
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }

  // cliente antigo sem briefing: só oferece o link, sem ocupar espaço
  if (status === 'antigo' && !answered) {
    return (
      <div className="card onb" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
        <span className="small muted">Briefing ainda não respondido. Quer mandar para {nome}?</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn line sm" onClick={copy}><Icon name="copy" />Copiar link</button>
          <button className="btn line sm" onClick={whats}><Icon name="whats" />WhatsApp</button>
        </div>
      </div>
    );
  }

  const steps = [
    { label: 'Cadastrado', done: true },
    { label: 'Pasta no Drive', done: !!client.drive_url },
    { label: 'Boas-vindas enviadas', done: !!client.welcome_sent_at },
    { label: 'Briefing respondido', done: answered },
    { label: 'Briefing com a equipe', done: !!client.briefing_shared_at },
  ];

  return (
    <div className="card onb">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ flex: 1 }}>Onboarding</b>
        {client.drive_url && <a className="btn line sm" href={client.drive_url} target="_blank" rel="noopener noreferrer"><Icon name="ext" />Pasta no Drive</a>}
        {client.briefing_doc_url && <a className="btn line sm" href={client.briefing_doc_url} target="_blank" rel="noopener noreferrer"><Icon name="doc" />Briefing (Doc)</a>}
        <button className="btn line sm" onClick={copy}><Icon name="copy" />Link do briefing</button>
        {!answered && <button className="btn line sm" onClick={whats}><Icon name="whats" />Mandar no WhatsApp</button>}
      </div>
      <div className="onb-steps">
        {steps.map((s) => <span key={s.label} className={s.done ? 'done' : ''}>{s.done ? '✓ ' : ''}{s.label}</span>)}
      </div>
      {status === 'novo' && (
        <p className="small muted" style={{ margin: 0 }}>
          Em até 1 hora: pasta no Drive, e-mail de boas-vindas com o briefing{client.email ? ` para ${client.email}` : ''} e aviso para a equipe.
          {!client.email && ' Este cliente está sem e-mail: mande o briefing pelo WhatsApp.'}
        </p>
      )}
      {answered && (
        <>
          <button className="btn line sm" style={{ justifySelf: 'start' }} onClick={() => setOpen((v) => !v)}>
            {open ? 'Esconder respostas' : 'Ver respostas do briefing'}
          </button>
          {open && (
            <dl>
              <dd className="small muted" style={{ margin: 0 }} suppressHydrationWarning>Respondido {fmtDate(client.briefing_answered_at)}</dd>
              {BRIEFING.map((sec) => {
                const qs = sec.questions.filter((q) => answerFor(answers, q));
                if (!qs.length) return null;
                return (
                  <div key={sec.title} style={{ display: 'grid', gap: 8 }}>
                    <dt style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brown)' }}>{sec.title}</dt>
                    {qs.map((q) => <div key={q.id}><dt>{q.label}</dt><dd>{answerFor(answers, q)}</dd></div>)}
                  </div>
                );
              })}
            </dl>
          )}
        </>
      )}
    </div>
  );
}
