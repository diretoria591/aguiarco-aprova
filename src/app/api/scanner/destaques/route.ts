import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFolderEntries } from '@/lib/drive';
import { driveRef, type ScanFile } from '@/lib/scanner';
import { buildHighlight, cleanName, type ScanHighlight } from '@/lib/destaques';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_HIGHLIGHTS = 40;

/**
 * Scanner de destaques: lê a pasta do Drive (1 subpasta = 1 destaque) e
 * devolve os destaques para a revisão. Body: { clientId, url }. Não grava nada.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = String(body.clientId ?? '');
  const ref = driveRef(String(body.url ?? ''));
  if (!ref?.folder) return NextResponse.json({ error: 'Cole o link de uma pasta do Google Drive (drive.google.com/drive/folders/…).' }, { status: 400 });

  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

  const fail = NextResponse.json({ error: 'O Aprova não conseguiu abrir a pasta. No Drive, clique em Compartilhar e deixe "Qualquer pessoa com o link" como Leitor.' }, { status: 422 });
  let root: Awaited<ReturnType<typeof listFolderEntries>>;
  try { root = await listFolderEntries(ref.id); } catch { return fail; }
  if (!root) return fail;

  const folders = root.entries.filter((e) => e.folder)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
    .slice(0, MAX_HIGHLIGHTS);
  let highlights: ScanHighlight[];
  const notes: string[] = [];
  if (folders.length) {
    // cada subpasta é um destaque
    highlights = await Promise.all(folders.map(async (f) => {
      const inner = await listFolderEntries(f.id).catch(() => null);
      if (!inner) {
        const h = buildHighlight(f, []);
        return { ...h, state: 'raw' as const, why: 'Não consegui abrir a pasta', flags: ['A pasta precisa estar aberta para quem tem o link.'] };
      }
      return buildHighlight(f, inner.entries);
    }));
    const loose = root.entries.filter((e) => !e.folder);
    if (loose.length) notes.push(`${loose.length} arquivo(s) solto(s) na pasta principal ficaram de fora (só as subpastas viram destaque).`);
  } else {
    // a pasta colada já é um destaque só
    highlights = [buildHighlight({ id: ref.id, name: root.title || 'Destaque' }, root.entries)];
  }

  // todos os arquivos lidos, para trocar/adicionar na revisão
  const files: ScanFile[] = [];
  for (const h of highlights) for (const f of [...h.stories, ...(h.cover ? [h.cover] : []), ...h.coverOptions]) {
    if (!files.some((x) => x.id === f.id)) files.push(f);
  }

  // já existe no Aprova? (mesmo cliente, formato destaque, mesmo título)
  const titles = highlights.map((h) => h.title);
  const { data: existing } = await supabase.from('posts').select('title, status')
    .eq('client_id', clientId).eq('format', 'destaque').in('title', titles);
  for (const h of highlights) {
    const hit = (existing ?? []).find((e) => e.title === h.title && e.status !== 'rejected');
    if (hit) { h.state = 'dup'; h.why = 'Já está no Aprova'; }
  }

  return NextResponse.json({ title: cleanName(root.title || 'Destaques'), highlights, files, notes });
}
