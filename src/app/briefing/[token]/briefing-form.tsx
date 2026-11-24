'use client';

import { useEffect, useState } from 'react';
import { firstName } from '@/lib/format';
import { portalSupabase } from '@/lib/portal';
import {
  BRIEFING, BRIEFING_THANKS, BRIEFING_WELCOME, answerFor, personalize, type BriefingAnswers, type BriefingQuestion,
} from '@/lib/briefing';
import { Icon } from '@/components/icon';
import { Mono, Wordmark, useUI } from '@/components/ui';

export type BriefingData = {
  name: string; contact_name: string; logo_url: string | null;
  email?: string; whatsapp?: string; instagram?: string;
  answers: BriefingAnswers; answered_at: string | null;
};

const draftKey = (t: string) => `briefing-rascunho-${t.slice(0, 12)}`;

/** Briefing Estratégico em etapas: boas-vindas → 7 etapas → agradecimento. */
export function BriefingForm({ token, initial }: { token: string; initial: BriefingData }) {
  const { toast } = useUI();
  const nome = firstName(initial.contact_name) || initial.name;
  const [a, setA] = useState<BriefingAnswers>(() => {
    const base: BriefingAnswers = { ...(initial.answers ?? {}) };
    const pre: Record<string, string | undefined> = {
      contact_name: initial.contact_name, name: initial.name, instagram: initial.instagram,
      email: initial.email, whatsapp: initial.whatsapp,
    };
    for (const q of BRIEFING.flatMap((s) => s.questions)) {
      if (q.prefill && !base[q.id] && pre[q.prefill]) base[q.id] = String(pre[q.prefill]);
    }
    return base;
  });
  // 0 = boas-vindas, 1..N = etapas, N+1 = agradecimento
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const total = BRIEFING.length;

  // rascunho no próprio aparelho, para não perder o que já foi digitado
  useEffect(() => {
    if (initial.answered_at) return;
    try {
      const d = localStorage.getItem(draftKey(token));
      if (d) setA((x) => ({ ...x, ...JSON.parse(d) }));
    } catch { /* sem armazenamento local: segue sem rascunho */ }
  }, [token, initial.answered_at]);
  useEffect(() => {
    try { localStorage.setItem(draftKey(token), JSON.stringify(a)); } catch { /* idem */ }
  }, [a, token]);

  const set = (id: string, v: string | string[]) => setA((x) => ({ ...x, [id]: v }));
  const toggle = (id: string, opt: string) => {
    const cur = Array.isArray(a[id]) ? (a[id] as string[]) : [];
    set(id, cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt]);
  };
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  function missingIn(qs: BriefingQuestion[]) {
    return qs.find((q) => q.required && !answerFor(a, q));
  }
  function next() {
    const sec = BRIEFING[step - 1];
    const miss = sec && missingIn(sec.questions);
    if (miss) {
      toast(`Falta responder: ${miss.label}`, 'err');
      document.getElementById(`q-${miss.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (step < total) go(step + 1); else void send();
  }
  async function send() {
    const miss = missingIn(BRIEFING.flatMap((s) => s.questions));
    if (miss) {
      const idx = BRIEFING.findIndex((s) => s.questions.includes(miss));
      go(idx + 1);
      toast(`Falta responder: ${miss.label}`, 'err');
      return;
    }
    setBusy(true);
    const { error } = await portalSupabase(token).rpc('briefing_submit', { p_token: token, p_answers: a });
    setBusy(false);
    if (error) { toast('Não foi possível enviar. Tente de novo em instantes.', 'err'); return; }
    try { localStorage.removeItem(draftKey(token)); } catch { /* idem */ }
    go(total + 1);
  }

  const sec = step >= 1 && step <= total ? BRIEFING[step - 1] : null;

  return (
    <>
      <header className="ptop">
        <div className="in">
          <span className="brand"><Wordmark /></span>
          <div className="client">Briefing Estratégico<b>{initial.name}</b></div>
        </div>
      </header>
      <main className="pmain">
        {step === 0 && (
          <div className="card bf-sec">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div className="bf-mono"><Mono name={initial.name} logo={initial.logo_url} /></div>
              <p className="eyebrow" style={{ margin: 0 }}>Aguiar&amp;Co · {initial.name}</p>
            </div>
            <h1 className="bf-title">{personalize(BRIEFING_WELCOME.title, nome)}</h1>
            <div className="bf-text">{BRIEFING_WELCOME.body}</div>
            {initial.answered_at && <p className="small muted">Você já respondeu este briefing. Pode revisar e enviar de novo se quiser ajustar algo.</p>}
            <button className="btn bf-next" onClick={() => go(1)}>Começar</button>
          </div>
        )}

        {sec && (
          <>
            <div className="bf-progress" aria-label={`Etapa ${step} de ${total}`}>
              <i style={{ width: `${(step / total) * 100}%` }} />
            </div>
            <p className="eyebrow" style={{ margin: '0 0 6px' }}>Etapa {step} de {total}</p>
            <section className="card bf-sec">
              <h2>{sec.title}</h2>
              {sec.intro && <div className="bf-text bf-intro">{sec.intro}</div>}
              {sec.questions.map((q) => (
                <div className="field" key={q.id} id={`q-${q.id}`}>
                  <label>{q.label}{q.required && ' *'}</label>
                  {q.hint && <span className="hint" style={{ whiteSpace: 'pre-wrap' }}>{q.hint}</span>}
                  {q.kind === 'short' && <input className="input" value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} />}
                  {q.kind === 'long' && <textarea className="textarea" value={String(a[q.id] ?? '')} onChange={(e) => set(q.id, e.target.value)} />}
                  {(q.kind === 'single' || q.kind === 'multi') && (
                    <div className="bf-chips">
                      {q.options!.map((o) => {
                        const on = q.kind === 'single' ? a[q.id] === o : Array.isArray(a[q.id]) && (a[q.id] as string[]).includes(o);
                        return (
                          <button type="button" key={o} className={on ? 'on' : ''} aria-pressed={on}
                            onClick={() => (q.kind === 'single' ? set(q.id, on ? '' : o) : toggle(q.id, o))}>{o}</button>
                        );
                      })}
                    </div>
                  )}
                  {q.other && (
                    <input className="input" style={{ marginTop: 6 }} placeholder="Outro (escreva aqui)"
                      value={String(a[`${q.id}_outro`] ?? '')} onChange={(e) => set(`${q.id}_outro`, e.target.value)} />
                  )}
                </div>
              ))}
              <p className="small muted" style={{ margin: '0 0 12px' }}>Perguntas com * são obrigatórias. O que você digitar fica salvo neste aparelho até enviar.</p>
              <div className="bf-nav">
                <button className="btn line" onClick={() => go(step - 1)}><Icon name="left" />Voltar</button>
                <button className="btn" disabled={busy} onClick={next}>
                  {step < total ? 'Próximo' : busy ? 'Enviando…' : 'Enviar briefing'}
                </button>
              </div>
            </section>
          </>
        )}

        {step === total + 1 && (
          <div className="card bf-sec" style={{ textAlign: 'center' }}>
            <div className="success" style={{ display: 'grid', justifyItems: 'center', marginBottom: 8 }}><div className="ring"><Icon name="check" /></div></div>
            <h1 className="bf-title">{personalize(BRIEFING_THANKS.title, nome)}</h1>
            <div className="bf-text" style={{ textAlign: 'left' }}>{BRIEFING_THANKS.body}</div>
            <button className="btn line sm" onClick={() => go(1)}>Revisar respostas</button>
          </div>
        )}
      </main>
    </>
  );
}
