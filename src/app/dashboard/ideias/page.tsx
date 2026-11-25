import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { monthLabel } from '@/lib/format';
import { loadIdeas, type Idea } from '@/lib/ideias';
import { SEGMENTS, segmentLabel } from '@/lib/segments';
import { Icon } from '@/components/icon';

export const metadata: Metadata = { title: 'Banco de ideias' };
export const dynamic = 'force-dynamic';

export default async function IdeiasPage({ searchParams }: { searchParams: Promise<{ area?: string; formato?: string }> }) {
  await requireSection('ideias');
  const sp = await searchParams;
  const area = SEGMENTS.some(([k]) => k === sp.area) || sp.area === 'sem' ? sp.area! : '';
  const formato = sp.formato ?? '';

  let ideas: Idea[] = [];
  let error: string | null = null;
  try { ideas = await loadIdeas(await createClient()); } catch (e) { error = e instanceof Error ? e.message : 'Falha ao carregar.'; }

  const inArea = ideas.filter((i) => !area || (area === 'sem' ? !i.segment : i.segment === area));
  const formats = [...new Map(inArea.map((i) => [i.format, i.formatLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = inArea.filter((i) => !formato || i.format === formato);
  const areaCount = (k: string) => ideas.filter((i) => (k === 'sem' ? !i.segment : i.segment === k)).length;
  const href = (a: string, f: string) => {
    const q = new URLSearchParams();
    if (a) q.set('area', a);
    if (f) q.set('formato', f);
    const s = q.toString();
    return `/dashboard/ideias${s ? `?${s}` : ''}`;
  };

  // sem filtro de área: agrupa por área
  const groups = area
    ? [{ key: area, items: shown }]
    : [...SEGMENTS.map(([k]) => k as string), ''].map((k) => ({ key: k || 'sem', items: shown.filter((i) => i.segment === k || (!k && !SEGMENTS.some(([s]) => s === i.segment))) }))
      .filter((g) => g.items.length);

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">O que funcionou</p><h1>Banco de <b>ideias</b></h1></div>
      </div>
      <div style={{ display: 'grid', gap: 16, maxWidth: 1040 }}>
        <p className="muted small" style={{ margin: 0, maxWidth: 820 }}>
          Os conteúdos marcados como <b>Performou</b> nos relatórios mensais entram aqui sozinhos, separados pela área do cliente.
          Use para reaproveitar o formato com outros clientes da mesma área. A área de cada cliente fica no cadastro do cliente.
        </p>

        <div className="chips">
          <Link className={`chip-opt ${!area ? 'on' : ''}`} href={href('', '')}>Todas ({ideas.length})</Link>
          {SEGMENTS.filter(([k]) => areaCount(k)).map(([k, l]) => (
            <Link key={k} className={`chip-opt ${area === k ? 'on' : ''}`} href={href(k, '')}>{l} ({areaCount(k)})</Link>
          ))}
          {areaCount('sem') > 0 && <Link className={`chip-opt ${area === 'sem' ? 'on' : ''}`} href={href('sem', '')}>Sem área ({areaCount('sem')})</Link>}
        </div>
        {formats.length > 1 && (
          <div className="chips">
            <Link className={`chip-opt ${!formato ? 'on' : ''}`} href={href(area, '')}>Todos os formatos</Link>
            {formats.map(([k, l]) => <Link key={k} className={`chip-opt ${formato === k ? 'on' : ''}`} href={href(area, k)}>{l}</Link>)}
          </div>
        )}

        {error ? (
          <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>
        ) : !shown.length ? (
          <div className="card empty">
            <h3>Nenhuma ideia {ideas.length ? 'com esse filtro' : 'ainda'}</h3>
            <p style={{ margin: 0 }}>
              {ideas.length ? 'Tente outra área ou formato.' : <>No relatório de cada cliente, marque os posts que foram bem com <b>Performou</b>. Eles aparecem aqui.</>}
            </p>
          </div>
        ) : groups.map((g) => (
          <section key={g.key} className="card" style={{ padding: '18px 20px' }}>
            <h2 style={{ fontSize: 12, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--brown)', fontWeight: 600, margin: '0 0 14px' }}>
              {g.key === 'sem' ? 'Sem área definida' : segmentLabel(g.key)} · {g.items.length}
            </h2>
            <div className="rp-grid idea-grid">
              {g.items.map((i) => (
                <div key={i.id} className="rp-post">
                  <div className="rp-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {i.cover ? <img src={i.cover} alt="" loading="lazy" /> : <Icon name="image" />}
                  </div>
                  <div className="rp-meta" suppressHydrationWarning>{i.formatLabel} · {monthLabel(i.month)}</div>
                  <b>{i.title}</b>
                  <Link className="small" href={`/dashboard/relatorios/${i.clientId}?mes=${i.month}`} style={{ color: 'var(--brown)' }}>{i.clientName}</Link>
                  {i.caption && <p>{i.caption}</p>}
                  {i.why && (
                    <details className="small" style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--ink-2)' }}>Por que funcionou</summary>
                      <p style={{ whiteSpace: 'pre-wrap', WebkitLineClamp: 'unset', display: 'block', marginTop: 6 }}>{i.why}</p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
