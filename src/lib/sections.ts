/* Abas do painel e quem vê cada uma (permissões por pessoa). */
import type { TeamRole } from './types';

export const SECTIONS = [
  { key: 'clientes', label: 'Clientes', href: '/dashboard' },
  { key: 'alteracoes', label: 'Alterações', href: '/dashboard/alteracoes' },
  { key: 'agendamento', label: 'Agendamento', href: '/dashboard/agendamento' },
  { key: 'roteiros', label: 'Roteiros', href: '/dashboard/roteiros' },
  { key: 'cobrar', label: 'Cobrar hoje', href: '/dashboard/cobrar' },
  { key: 'entregas', label: 'Entregas', href: '/dashboard/entregas' },
  { key: 'numeros', label: 'Números', href: '/dashboard/numeros' },
  { key: 'relatorios', label: 'Relatórios', href: '/dashboard/relatorios' },
  { key: 'ideias', label: 'Banco de ideias', href: '/dashboard/ideias' },
  { key: 'lembretes', label: 'Lembretes', href: '/dashboard/lembretes' },
  { key: 'rodadas', label: 'Rodadas extras', href: '/dashboard/rodadas' },
  { key: 'projetos', label: 'Projetos', href: '/dashboard/projetos' },
  { key: 'desempenho', label: 'Desempenho', href: '/dashboard/desempenho' },
  { key: 'equipe', label: 'Equipe', href: '/dashboard/equipe' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];
export const ALL_SECTIONS = SECTIONS.map((s) => s.key) as SectionKey[];

/** Abas de quem ainda não tem permissões marcadas, pela função. */
export function defaultSections(role: TeamRole): SectionKey[] {
  if (role === 'scheduler') return ['agendamento', 'roteiros', 'numeros'];
  if (role === 'admin') return ['clientes', 'agendamento', 'roteiros', 'cobrar', 'lembretes', 'ideias', 'rodadas'];
  return ['clientes', 'agendamento', 'roteiros', 'cobrar', 'lembretes', 'ideias'];
}

/** A dona vê tudo; os outros, o que foi marcado (ou o padrão da função). Equipe é só da dona. */
export function allowedSections(p: { owner?: boolean; sections?: string[] | null; role: TeamRole }): SectionKey[] {
  if (p.owner) return ALL_SECTIONS;
  const list = (p.sections ?? defaultSections(p.role)).filter((k): k is SectionKey => (ALL_SECTIONS as string[]).includes(k));
  return list.filter((k) => k !== 'equipe');
}

export const sectionHref = (k: SectionKey) => SECTIONS.find((s) => s.key === k)!.href;
