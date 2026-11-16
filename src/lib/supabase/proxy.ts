import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from './env';

/** Renova a sessão e protege as rotas da equipe. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const isAdmin = pathname.startsWith('/dashboard');
  const isLogin = pathname === '/login';

  let env: { url: string; anonKey: string };
  try {
    env = supabaseEnv();
  } catch {
    if (isAdmin) {
      const u = request.nextUrl.clone();
      u.pathname = '/login';
      u.search = '';
      return NextResponse.redirect(u);
    }
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const redirect = (path: string, next?: string) => {
    const u = request.nextUrl.clone();
    u.pathname = path;
    u.search = next ? `?next=${encodeURIComponent(next)}` : '';
    const r = NextResponse.redirect(u);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (isAdmin && !user) return redirect('/login', pathname);
  if (isLogin && user) return redirect('/dashboard');
  return response;
}
