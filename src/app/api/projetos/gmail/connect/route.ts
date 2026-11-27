import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { authUrl, googleConfigured } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const site = (req: NextRequest) => (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');

/** Só a dona conecta o Gmail dela ao projeto (somente leitura). */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('p') ?? '';
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ error: 'Projeto inválido.' }, { status: 400 });
  if (!(await requireOwner())) return NextResponse.redirect(`${site(req)}/dashboard/projetos/${slug}?gmail=sem-permissao`);
  if (!googleConfigured()) return NextResponse.redirect(`${site(req)}/dashboard/projetos/${slug}?aba=emails&gmail=sem-config`);
  const state = `${slug}.${randomBytes(24).toString('hex')}`;
  const res = NextResponse.redirect(authUrl(`${site(req)}/api/projetos/gmail/callback`, state));
  res.cookies.set('aprova_gmail_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/projetos/gmail', maxAge: 600 });
  return res;
}
