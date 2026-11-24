'use client';

import { useState } from 'react';
import { firstName } from '@/lib/format';
import { portalSupabase } from '@/lib/portal';
import { BRIEFING, BRIEFING_QUESTIONS, answerText, type BriefingAnswers } from '@/lib/briefing';
import { Icon } from '@/components/icon';
import { Mono, Wordmark, useUI } from '@/components/ui';

export type BriefingData = {
  name: string; contact_name: string; logo_url: string | null;
  answers: BriefingAnswers; answered_at: string | null;
};

export function BriefingForm({ token, initial }: { token: string; initial: BriefingData }) {
  const { toast } = useUI();
  const [a, setA] = useState<BriefingAnswers>(initial.answers ?? {});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const nome = firstName(initial.contact_name) || initial.name;

  const set = (id: string, v: string | string[]) => setA((x) => ({ ...x, [id]: v }));
  const toggle = (id: string, opt: string) => {
    const cur = Array.isArray(a[id]) ? (a[id] as string[]) : [];
    set(id, cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]);
  };

  async function send() {
    const missing = BRIEFING_QUESTIONS.filter((q) => q.required && !answerText(a[q.id]));
    if (missing.length) {
      toast(`Falta responder: ${missing[0].label}`, 'err');
      document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    const { error } = await portalSupabase(token).rpc('briefing_submit', { p_token: token, p_answers: a });
    setBusy(false);
    if (error) { toast('Não foi possível enviar. Tente de novo em instantes.', 'err'); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <header className="ptop">
        <div className="in">
          <span className="brand"><Wordmark /></span>
          <div className="client">Briefing<b>{initial.name}</b></div>
        </div>
      </header>
      <main className="pmain">
        {done ? (
          <div className="card" style={{ padding: 28, textAlign: 'center', display: 'grid', gap: 10, justifyItems: 'center' }}>
            <div className="success"><div className="ring"><Icon name="check" /></div></div>
            <h2 style={{ margin: 0 }}>Obrigada, <b>{nome}</b>!</h2>
            <p className="muted" style={{ margin: 0 }}>Recebemos o seu briefing. A equipe da Aguiar&amp;Co já foi avisada e vai usar essas respostas para planejar os seus conteúdos.</p>
            <button className="btn line sm" onClick={() => setDone(false)}>Revisar respostas</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <div className="bf-mono"><Mono name={initial.name} logo={initial.logo_url} /></div>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Boas-vindas à Aguiar&amp;Co</p>
                <h1 style={{ margin: '2px 0 0', fontSize: 28 }}>Oi, <b>{nome}</b>!</h1>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Para começarmos do jeito certo, queremos conhecer melhor o seu negócio. Leva uns 10 minutos.
              As perguntas com <b>*</b> são obrigatórias; o resto você responde se quiser.
              {initial.answered_at && ' Você já respondeu antes: pode ajustar o que quiser e enviar de novo.'}
            </p>
            {BRIEFING.map((sec) => (
              <section key={sec.title} className="card bf-sec">
                <h2>{sec.title}</h2>
                {sec.questions.map((q) => (
                  <div className="field" key={q.id} id={`q-${q.id}`}>
                    <label>{q.label}{q.required && ' *'}</label>
                    {q.hint && <span className="hint">{q.hint}</span>}
                    {q.kind === 'short' && <input className="input" value={answerText(a[q.id])} onChange={(e) => set(q.id, e.target.value)} />}
                    {q.kind === 'long' && <textarea className="textarea" value={answerText(a[q.id])} onChange={(e) => set(q.id, e.target.value)} />}
                    {q.kind === 'choices' && (
                      <div className="bf-chips">
                        {q.options!.map((o) => {
                          const on = Array.isArray(a[q.id]) && (a[q.id] as string[]).includes(o);
                          return <button type="button" key={o} className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(q.id, o)}>{o}</button>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            ))}
            <button className="btn" style={{ width: '100%', height: 48 }} disabled={busy} onClick={send}>
              {busy ? 'Enviando…' : 'Enviar briefing'}
            </button>
          </>
        )}
      </main>
    </>
  );
}
