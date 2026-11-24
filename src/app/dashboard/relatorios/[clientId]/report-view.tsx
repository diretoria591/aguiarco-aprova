'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TYPES } from '@/lib/constants';
import { fmtDate, fmtDay, monthLabel } from '@/lib/format';
import {
  METRICS, coverOf, fmtHours, reportStats, type MetricKey, type PostMark, type Relatorio, type ReportPost,
} from '@/lib/relatorio';
import { Icon } from '@/components/icon';
import { Mono, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';

type Client = { id: string; name: string; logo_url: string | null; instagram?: string; revision_limit?: number | null };
type Texts = { strategy: string; summary: string; highlights: string; low_text: string; next_steps: string };

const PLACEHOLDER: Record<keyof Texts, string> = {
  strategy: 'Estratégia do mês: objetivo, linha editorial, campanhas e o que queríamos alcançar com os conteúdos.',
  low_text: 'Conteúdos que não performaram: o que pode ter acontecido (tema, formato, horário, gancho) e o que vamos ajustar.',
  summary: 'Resumo do mês: o que foi trabalhado, temas principais, campanhas e como foi a parceria com o cliente.',
  highlights: 'Conteúdos que performaram: por que funcionaram, retorno do público, conquistas do mês.',
  next_steps: 'Próximos passos: o que vamos priorizar no mês seguinte, datas importantes, ajustes de estratégia.',
};

export function ReportView({ client, month, posts, report, error }: {
  client: Client; month: string; posts: ReportPost[]; report: Relatorio | null; error: string | null;
}) {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const stats = useMemo(() => reportStats(posts, client.revision_limit), [posts, client.revision_limit]);
  const [texts, setTexts] = useState<Texts>({
    strategy: report?.strategy ?? '', summary: report?.summary ?? '', highlights: report?.highlights ?? '',
    low_text: report?.low_text ?? '', next_steps: report?.next_steps ?? '',
  });
  const [marks, setMarks] = useState<Record<string, PostMark>>(report?.post_marks ?? {});
  const [metrics, setMetrics] = useState<Partial<Record<MetricKey, string>>>(report?.metrics ?? {});
  const [status, setStatus] = useState(report?.status ?? 'rascunho');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = monthLabel(month);
  const shown = posts.filter((p) => p.status === 'approved');
  const filledMetrics = METRICS.filter((m) => (metrics[m.key] ?? '').trim());
  const tops = shown.filter((p) => marks[p.id] === 'top');
  const lows = shown.filter((p) => marks[p.id] === 'low');
  function toggleMark(id: string, m: PostMark) {
    setMarks((x) => {
      const n = { ...x };
      if (n[id] === m) delete n[id]; else n[id] = m;
      return n;
    });
    setDirty(true);
  }

  async function save(next?: 'rascunho' | 'pronto') {
    setBusy(true);
    const st = next ?? status;
    const row = {
      client_id: client.id, ref_month: month, ...texts, metrics, post_marks: marks, status: st, updated_at: new Date().toISOString(),
      ...(next === 'pronto' ? { reviewed_by: me.name, reviewed_at: new Date().toISOString() } : {}),
    };
    const { error: err } = await createClient().from('relatorios').upsert(row, { onConflict: 'client_id,ref_month' });
    setBusy(false);
    if (err) { toast(`Não foi possível salvar: ${err.message}`, 'err'); return false; }
    setStatus(st);
    setDirty(false);
    toast(next === 'pronto' ? 'Relatório marcado como pronto' : next === 'rascunho' ? 'Voltou para rascunho' : 'Relatório salvo');
    router.refresh();
    return true;
  }

  async function pdf() {
    if (dirty && !(await save())) return;
    const prev = document.title;
    document.title = `Relatório ${client.name} · ${label}`;
    window.print();
    document.title = prev;
  }

  const setText = (k: keyof Texts) => (v: string) => { setTexts((t) => ({ ...t, [k]: v })); setDirty(true); };

  return (
    <>
      <div className="rp-bar no-print">
        <Link className="btn line sm" href={`/dashboard/relatorios?mes=${month}`}>← Relatórios</Link>
        {status === 'pronto'
          ? <span className="status aprovado">Pronto{report?.reviewed_by ? ` · ${report.reviewed_by}` : ''}</span>
          : <span className="status pendente">Rascunho</span>}
        <span style={{ flex: 1 }} />
        <a className="btn line sm" target="_blank" rel="noopener noreferrer" href={meetingLink(client.name, label)}><Icon name="calendar" />Marcar reunião</a>
        <button className="btn line sm" disabled={busy || !dirty} onClick={() => save()}>{dirty ? 'Salvar' : 'Salvo'}</button>
        {status === 'pronto'
          ? <button className="btn line sm" disabled={busy} onClick={() => save('rascunho')}>Voltar para rascunho</button>
          : <button className="btn line sm" disabled={busy} onClick={() => save('pronto')}><Icon name="check" />Marcar como pronto</button>}
        <button className="btn sm" disabled={busy} onClick={pdf}><Icon name="download" />Baixar PDF</button>
      </div>
      <SlidesNote report={report} status={status} onRedo={async () => {
        const { error: err } = await createClient().from('relatorios').update({ slides_url: '', slides_at: null })
          .eq('client_id', client.id).eq('ref_month', month);
        if (err) toast(`Não foi possível pedir: ${err.message}`, 'err'); else { toast('Nova apresentação pedida'); router.refresh(); }
      }} />
      {error && <div className="card empty no-print" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Algo não carregou: {error}</p></div>}
      <p className="small muted no-print" style={{ margin: '0 0 16px', maxWidth: 820 }}>
        Edite os textos e os números direto na página. No PDF, campos vazios não aparecem. Para salvar o PDF, escolha
        &quot;Salvar como PDF&quot; na janela de impressão.
      </p>

      <article className="rp">
        <header className="rp-cover">
          <div className="rp-brand">Aguiar<b>&amp;co</b><span>Relatório mensal</span></div>
          <div className="rp-client">
            <Mono name={client.name} logo={client.logo_url} />
            <div>
              <h1>{client.name}</h1>
              <p suppressHydrationWarning>{label}{client.instagram ? ` · ${client.instagram.startsWith('@') ? '' : '@'}${client.instagram}` : ''}</p>
            </div>
          </div>
        </header>

        <section className="rp-kpis">
          <Kpi n={stats.published} l={`publicado${stats.published === 1 ? '' : 's'} e agendado${stats.published === 1 ? '' : 's'}`} />
          <Kpi n={stats.approved ? `${stats.firstTry}/${stats.approved}` : '—'} l="aprovados sem alteração" />
          <Kpi n={fmtHours(stats.avgApprovalHours)} l="tempo médio até a aprovação" />
          <Kpi n={stats.roundsUsed} l={`rodada${stats.roundsUsed === 1 ? '' : 's'} de alteração${stats.extraRounds ? ` (${stats.extraRounds} extra${stats.extraRounds > 1 ? 's' : ''})` : ''}`} />
        </section>
        {(stats.byFormat.length > 0 || stats.inProgress > 0 || stats.waitingSchedule > 0) && (
          <div className="rp-chips">
            {stats.byFormat.map((f) => <span key={f.format}>{f.n} {TYPES[f.format]?.label ?? f.format}</span>)}
            {stats.waitingSchedule > 0 && <span className="soft">{stats.waitingSchedule} aprovado{stats.waitingSchedule > 1 ? 's' : ''} aguardando agendamento</span>}
            {stats.inProgress > 0 && <span className="soft">{stats.inProgress} em aprovação</span>}
          </div>
        )}

        <TextBlock title="Estratégia do mês" value={texts.strategy} placeholder={PLACEHOLDER.strategy} onChange={setText('strategy')} />

        <TextBlock title="Resumo do mês" value={texts.summary} placeholder={PLACEHOLDER.summary} onChange={setText('summary')} />

        <section className={`rp-sec${filledMetrics.length ? '' : ' print-hide'}`}>
          <h2>Instagram no mês</h2>
          <div className="rp-metrics">
            {METRICS.map((m) => {
              const v = metrics[m.key] ?? '';
              return (
                <label key={m.key} className={`rp-metric${v.trim() ? '' : ' print-hide'}`}>
                  <input className="no-print" value={v} inputMode="numeric" placeholder="—"
                    onChange={(e) => { setMetrics((x) => ({ ...x, [m.key]: e.target.value })); setDirty(true); }} />
                  <b className="print-only">{v}</b>
                  <span>{m.label}</span>
                </label>
              );
            })}
          </div>
          <p className="small muted no-print" style={{ margin: '8px 0 0' }}>Copie os números do Insights do Instagram do cliente (período: {label}).</p>
        </section>

        <PostsBlock title="Conteúdos que performaram" posts={tops} value={texts.highlights} placeholder={PLACEHOLDER.highlights}
          onChange={setText('highlights')} hint="Marque os posts com “Performou” na lista de conteúdos abaixo." />

        <PostsBlock title="Conteúdos que não performaram" posts={lows} value={texts.low_text} placeholder={PLACEHOLDER.low_text}
          onChange={setText('low_text')} hint="Marque os posts com “Não performou” na lista de conteúdos abaixo." />

        <section className="rp-sec">
          <h2>Conteúdos do mês</h2>
          {shown.length ? (
            <div className="rp-grid">
              {shown.map((p) => {
                const cover = coverOf(p);
                const t = TYPES[p.format];
                return (
                  <div key={p.id} className="rp-post">
                    <div className="rp-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cover ? <img src={cover} alt="" loading="eager" /> : t && <Icon name={t.icon} />}
                    </div>
                    <div className="rp-meta" suppressHydrationWarning>
                      {t?.label ?? p.format}{p.scheduled_date ? ` · ${fmtDay(p.scheduled_date)}` : ` · enviado ${fmtDate(p.sent_at, false)}`}
                    </div>
                    <b>{p.title}</b>
                    {p.caption && <p>{p.caption}</p>}
                    <div className="rp-marks no-print">
                      <button type="button" className={marks[p.id] === 'top' ? 'on top' : ''} onClick={() => toggleMark(p.id, 'top')}>Performou</button>
                      <button type="button" className={marks[p.id] === 'low' ? 'on low' : ''} onClick={() => toggleMark(p.id, 'low')}>Não performou</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted">Nenhum conteúdo aprovado neste mês.</p>}
        </section>

        <TextBlock title="Próximos passos" value={texts.next_steps} placeholder={PLACEHOLDER.next_steps} onChange={setText('next_steps')} />

        <footer className="rp-foot">Aguiar&amp;Co · relatório de {label.toLowerCase()}</footer>
      </article>
    </>
  );
}

function Kpi({ n, l }: { n: number | string; l: string }) {
  return <div className="rp-kpi"><div className="n">{n}</div><div className="l">{l}</div></div>;
}

function TextBlock({ title, value, placeholder, onChange }: {
  title: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  const rows = Math.max(4, value.split('\n').length + Math.ceil(value.length / 90));
  return (
    <section className={`rp-sec${value.trim() ? '' : ' print-hide'}`}>
      <h2>{title}</h2>
      <textarea className="textarea no-print" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="rp-text print-only">{value}</div>
    </section>
  );
}

function PostsBlock({ title, posts, value, placeholder, onChange, hint }: {
  title: string; posts: ReportPost[]; value: string; placeholder: string; onChange: (v: string) => void; hint: string;
}) {
  const rows = Math.max(3, value.split('\n').length + Math.ceil(value.length / 90));
  return (
    <section className={`rp-sec${value.trim() || posts.length ? '' : ' print-hide'}`}>
      <h2>{title}</h2>
      {posts.length > 0 && (
        <div className="rp-mini">
          {posts.map((p) => {
            const cover = coverOf(p);
            const t = TYPES[p.format];
            return (
              <div key={p.id} className="rp-mini-item">
                <div className="rp-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover ? <img src={cover} alt="" loading="eager" /> : t && <Icon name={t.icon} />}
                </div>
                <div className="rp-meta" suppressHydrationWarning>{t?.label ?? p.format}{p.scheduled_date ? ` · ${fmtDay(p.scheduled_date)}` : ''}</div>
                <b>{p.title}</b>
              </div>
            );
          })}
        </div>
      )}
      {!posts.length && <p className="small muted no-print" style={{ margin: '0 0 8px' }}>{hint}</p>}
      <textarea className="textarea no-print" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="rp-text print-only">{value}</div>
    </section>
  );
}

function SlidesNote({ report, status, onRedo }: { report: Relatorio | null; status: string; onRedo: () => void }) {
  if (report?.slides_url) {
    return (
      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: 16, maxWidth: 820, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="layers" />
        <span className="small" style={{ flex: 1 }}>Apresentação editável (Google Slides) gerada a partir deste relatório.</span>
        <a className="btn sm" href={report.slides_url} target="_blank" rel="noopener noreferrer"><Icon name="ext" />Abrir apresentação</a>
        <button className="btn line sm" onClick={onRedo}>Gerar de novo</button>
      </div>
    );
  }
  return (
    <p className="small muted no-print" style={{ margin: '0 0 16px', maxWidth: 820 }}>
      {status === 'pronto'
        ? 'Apresentação editável a caminho: ela é gerada no Google Slides até o fim do dia e chega por e-mail.'
        : 'Ao marcar como pronto, a apresentação editável (Google Slides) é gerada até o fim do dia e chega por e-mail.'}
    </p>
  );
}

/** Abre o Google Agenda com a reunião de planejamento já preenchida. */
function meetingLink(name: string, label: string) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Reunião de planejamento estratégico · ${name}`,
    details: `Apresentação do relatório de ${label.toLowerCase()} e do planejamento estratégico do próximo mês. Aguiar&Co.`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
