import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { allowedSections, sectionHref, type SectionKey } from './sections';
import type { TeamRole } from './types';

/** Cookie do "Ver como": id do perfil que a dona está visualizando. */
export const VIEW_AS_COOKIE = 'aprova_ver_como';

export type ViewerProfile = {
  id: string; name: string; email: string; role: TeamRole; owner: boolean; sections: SectionKey[];
};
export type Viewer = {
  /** Quem está logado de verdade (as ações ficam no nome dessa pessoa). */
  real: ViewerProfile;
  /** De quem é a visão (menus, avisos, páginas liberadas). Igual a real quando não há "Ver como". */
  view: ViewerProfile;
};

type Row = { id: string; name?: string | null; email?: string | null; role?: string | null; owner?: boolean | null; sections?: string[] | null };
function asProfile(p: Row, fallback = ''): ViewerProfile {
  const role = (p.role as TeamRole) || 'team';
  const owner = !!p.owner;
  return { id: p.id, name: p.name || fallback || 'Equipe', email: p.email || fallback, role, owner, sections: allowedSections({ owner, sections: p.sections, role }) };
}

/** Pessoa logada e, para a dona com "Ver como" ligado, a visão de outra pessoa da equipe. */
export async function currentViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) return null;
  const real = asProfile(data as Row, user.email ?? '');
  if (!real.owner) return { real, view: real };
  const target = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!target || target === real.id) return { real, view: real };
  const { data: other } = await supabase.from('profiles').select('*').eq('id', target).maybeSingle();
  return { real, view: other ? asProfile(other as Row) : real };
}

/** Função de quem está sendo visto (team quando a coluna ainda não existe). */
export async function currentRole(): Promise<TeamRole | null> {
  return (await currentViewer())?.view.role ?? null;
}

/** Libera a página só para quem tem a aba; os outros vão para a primeira aba que têm. */
export async function requireSection(key: SectionKey) {
  const v = await currentViewer();
  if (!v) redirect('/login');
  if (v.view.sections.includes(key)) return v;
  const first = v.view.sections[0];
  redirect(first ? sectionHref(first) : '/login');
}

/** A dona da conta (de verdade, não pelo "Ver como"). */
export async function requireOwner() {
  const v = await currentViewer();
  return v?.real.owner ? v : null;
}
