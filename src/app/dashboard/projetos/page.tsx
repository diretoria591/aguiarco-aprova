import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Projetos' };
export const dynamic = 'force-dynamic';

/** Projetos especiais (ex.: JAH Portugal). Com um só, abre direto nele. */
export default async function ProjetosPage() {
  await requireSection('projetos');
  const supabase = await createClient();
  const { data, error } = await supabase.from('projetos').select('slug, name').eq('active', true).order('name');
  const list = (data ?? []) as { slug: string; name: string }[];
  if (list.length === 1) redirect(`/dashboard/projetos/${list[0].slug}`);
  return (
    <>
      <div className="hello"><div><p className="eyebrow">Só para quem participa</p><h1><b>Projetos</b></h1></div></div>
      {error && <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error.message}. Rode a migration <code>2026-11-27_projetos.sql</code>.</p></div>}
      {!error && !list.length && <div className="card empty"><p style={{ margin: 0 }}>Nenhum projeto cadastrado ainda.</p></div>}
      <div className="alt-list">
        {list.map((p) => <Link key={p.slug} href={`/dashboard/projetos/${p.slug}`} className="card alt-card" style={{ textDecoration: 'none', color: 'inherit' }}><b>{p.name}</b></Link>)}
      </div>
    </>
  );
}
