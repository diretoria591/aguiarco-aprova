import { NextResponse, type NextRequest } from 'next/server';
import convert from 'heic-convert';
import { createClient } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/supabase/env';
import { MAX_UPLOAD_MB } from '@/lib/constants';
import { DriveError, downloadDriveFile } from '@/lib/drive';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ID = /^[\w-]{10,}$/;

/**
 * Scanner: baixa um arquivo do Drive e guarda no Storage do Aprova.
 * Body: { postId, driveId, index }. Devolve { url, path, type, name } para a linha de post_media.
 * Fotos HEIC (iPhone) viram JPG, que abre em qualquer navegador.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId ?? '');
  const driveId = String(body.driveId ?? '');
  const index = Number.isFinite(+body.index) ? Math.trunc(+body.index) : 0;
  if (!ID.test(driveId)) return NextResponse.json({ error: 'Link do Drive inválido.' }, { status: 400 });

  // o post precisa existir e ser visível para quem está logado (política do banco)
  const { data: post } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Material não encontrado.' }, { status: 404 });

  try {
    const file = await downloadDriveFile(driveId, MAX_UPLOAD_MB * 1024 * 1024);
    let { buf, name, type } = file;
    let ext = file.ext || type.split('/')[1] || 'bin';
    if (/^image\/hei[cf]$/.test(type) || ext === 'heic' || ext === 'heif') {
      const out = await convert({ buffer: buf, format: 'JPEG', quality: 0.9 });
      buf = new Uint8Array(out);
      type = 'image/jpeg';
      ext = 'jpg';
      name = name.replace(/\.(heic|heif)$/i, '.jpg');
    }
    if (!/^(image|video)\/|application\/pdf/.test(type)) {
      return NextResponse.json({ error: `“${name}” não é foto, vídeo ou PDF.` }, { status: 422 });
    }
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `posts/${postId}/${Date.now()}-${index}-${rand}.${ext.toLowerCase()}`;
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buf, {
      contentType: type, cacheControl: '31536000', upsert: false,
    });
    if (error) {
      const big = /size|large|exceed/i.test(error.message);
      return NextResponse.json({ error: big ? `“${name}” é maior que o limite permitido.` : `Não consegui guardar “${name}”: ${error.message}` }, { status: 500 });
    }
    const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url, path, type, name });
  } catch (e) {
    const msg = e instanceof DriveError ? e.message : 'Não consegui baixar o arquivo do Drive agora. Tente de novo.';
    return NextResponse.json({ error: msg, code: e instanceof DriveError ? e.code : 'fail' }, { status: 422 });
  }
}
