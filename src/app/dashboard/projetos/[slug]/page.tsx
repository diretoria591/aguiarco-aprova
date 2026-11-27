import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSection } from '@/lib/auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { googleConfigured } from '@/lib/gmail';
import { ymdIn } from '@/lib/projetos';
import { ensureRotinas, loadGmailStatus, loadPessoas, loadProjeto, loadProjetoData } from '@/lib/projetos-server';
import { ProjetoView, type Aba } from './projeto-view';

export const metadata: Metadata = { title: 'Projeto' };
export const dynamic = 'force-dynamic';

const ABAS: Aba[] = ['agora', 'painel', 'minhas', 'emails', 'sexta'];

export default async function ProjetoPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ aba?: string; quem?: string; gmail?: string }>;
}) {
  const v = await requireSection('projetos');
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const projeto = await loadProjeto(supabase, slug);
  if (!projeto) notFound();
  const contas = await loadPessoas(supabase);
  await ensureRotinas(supabase, projeto, contas);
  const [data, gmail, prof] = await Promise.all([
    loadProjetoData(supabase, projeto),
    loadGmailStatus(createAdminClient(), projeto.id, googleConfigured()),
    supabase.from('profiles').select('tutorial_projetos_at').eq('id', v.view.id).maybeSingle(),
  ]);
  // quem ainda não tem login (tarefas só com o nome) também aparece, para a dona acompanhar
  const semConta = [...new Set(data.tarefas.filter((t) => !t.owner_id && t.owner_name).map((t) => t.owner_name))]
    .filter((n) => !contas.some((c) => ((c.nickname || '').trim() || c.name.split(/\s+/)[0]).toLowerCase() === n.toLowerCase()));
  const pessoas = [...contas, ...semConta.map((n) => ({ id: `nome:${n}`, name: n, nickname: '', owner: false }))];
  // quem não é a dona começa pelas próprias tarefas
  const owner = v.view.owner;
  const aba = ABAS.find((a) => a === sp.aba) ?? (owner ? 'agora' : 'minhas');
  const tutorial = !owner && v.view.id === v.real.id && !(prof.data as { tutorial_projetos_at?: string | null } | null)?.tutorial_projetos_at;
  return (
    <ProjetoView projeto={projeto} pessoas={pessoas} tarefas={data.tarefas} emails={data.emails} error={data.error}
      gmail={gmail} aba={aba} quem={sp.quem ?? null} gmailMsg={sp.gmail ?? null} today={ymdIn(projeto.timezone)}
      viewId={v.view.id} isOwner={owner} tutorial={tutorial} />
  );
}
