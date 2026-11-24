-- Aguiar&Co Aprova · Relatórios mensais por cliente
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.
--
-- Um relatório por cliente e mês (AAAA-MM). O rascunho é gerado no dia 1; a estrategista
-- revisa os textos, preenche os números do Instagram e marca como pronto. Só a equipe vê.

create table if not exists public.relatorios (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  ref_month   text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status      text not null default 'rascunho' check (status in ('rascunho', 'pronto')),
  summary     text not null default '',
  highlights  text not null default '',
  next_steps  text not null default '',
  -- números do Instagram digitados pela equipe (alcance, seguidores...), até a API da Meta entrar
  metrics     jsonb not null default '{}'::jsonb,
  reviewed_by text not null default '',
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, ref_month)
);

alter table public.relatorios enable row level security;
drop policy if exists "team full access relatorios" on public.relatorios;
create policy "team full access relatorios" on public.relatorios
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- Estratégia do mês, análise dos conteúdos que não performaram e marcação por post
-- (post_marks: { "<post_id>": "top" | "low" })
alter table public.relatorios add column if not exists strategy text not null default '';
alter table public.relatorios add column if not exists low_text text not null default '';
alter table public.relatorios add column if not exists post_marks jsonb not null default '{}'::jsonb;

-- Apresentação editável (Google Slides) gerada depois que o relatório fica pronto
alter table public.relatorios add column if not exists slides_url text not null default '';
alter table public.relatorios add column if not exists slides_at timestamptz;
