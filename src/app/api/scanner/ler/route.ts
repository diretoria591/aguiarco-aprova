import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { DriveError, fetchDocMarkdown, listFolder } from '@/lib/drive';
import { docIdFromUrl, parseCalendar } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scanner: lê o calendário do Google Docs e devolve os posts para a revisão.
 * Body: { clientId, url }. Não grava nada.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const clientId = String(body.clientId ?? '');
  const docId = docIdFromUrl(String(body.url ?? ''));
  if (!docId) return NextResponse.json({ error: 'Cole o link de um documento do Google Docs (docs.google.com/document/…).' }, { status: 400 });

  // a política do banco só mostra o cliente para a equipe
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });

  let md: string;
  try {
    md = await fetchDocMarkdown(docId);
  } catch (e) {
    const msg = e instanceof DriveError ? e.message : 'Não consegui falar com o Google agora. Tente de novo em instantes.';
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const result = parseCalendar(md, new Date());

  // pastas: abre e usa os arquivos de dentro (na ordem dos nomes) nos posts que vão entrar
  const withFolder = result.posts.filter((p) => p.state === 'ok' && p.media.some((m) => m.folder)).slice(0, 12);
  await Promise.all(withFolder.map(async (p) => {
    const expanded = [];
    for (const m of p.media) {
      if (!m.folder) { expanded.push(m); continue; }
      const files = await listFolder(m.id).catch(() => []);
      if (!files.length) {
        p.state = 'raw';
        p.why = `Não consegui abrir a pasta “${m.name}” (ela precisa estar aberta para quem tem o link)`;
        return;
      }
      expanded.push(...files);
    }
    p.media = expanded;
    expanded.forEach((f) => { if (!result.files.some((x) => x.id === f.id)) result.files.push(f); });
  }));

  // já existe no Aprova? (mesmo cliente, mesma data e mesmo formato)
  const dates = Array.from(new Set(result.posts.map((p) => p.date)));
  if (dates.length) {
    const { data: existing } = await supabase
      .from('posts').select('title, format, scheduled_date, status')
      .eq('client_id', clientId).in('scheduled_date', dates);
    for (const p of result.posts) {
      if (p.state === 'gone') continue;
      const hit = (existing ?? []).find((e) => e.scheduled_date === p.date && e.format === p.format && e.status !== 'rejected');
      if (hit) { p.state = 'dup'; p.why = `Já está no Aprova: “${hit.title}”`; }
    }
  }

  return NextResponse.json({ docId, ...result });
}
