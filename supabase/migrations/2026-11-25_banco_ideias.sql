-- Aguiar&Co Aprova · Banco de ideias
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- O banco de ideias não tem tabela própria: ele junta os posts marcados como "Performou"
-- nos relatórios (relatorios.post_marks). Aqui só guardamos o e-mail "Aposte nestes conteúdos",
-- enviado à estrategista quando o relatório fica pronto, para não repetir o mesmo aviso.
alter table public.relatorios add column if not exists ideas_sent_at timestamptz;
-- ids dos posts "Performou" que já foram no e-mail (ordenados, separados por vírgula)
alter table public.relatorios add column if not exists ideas_sent_marks text not null default '';

-- Quem já vê Relatórios passa a ver o Banco de ideias
update public.profiles set sections = array_append(sections, 'ideias')
 where sections is not null and 'relatorios' = any(sections) and not ('ideias' = any(sections));

-- Área nova: marca pessoal e educação (mentoras, comunicação, empreendedorismo)
alter table public.clients drop constraint if exists clients_segment_check;
alter table public.clients add constraint clients_segment_check
  check (segment in ('', 'saude', 'gastronomia', 'beleza', 'empresas', 'marca_pessoal', 'outra'));
