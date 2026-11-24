-- Aguiar&Co Aprova · Pautas do mês diluídas aos sábados
-- Cada cliente recorrente tem um sábado fixo do mês (1 a 4) para receber a pauta do mês seguinte.
-- Clientes novos recebem um grupo automaticamente (o que tiver menos clientes) pela rotina de sábado.
alter table public.clients add column if not exists pauta_semana smallint check (pauta_semana between 1 and 4);
with r as (
  select id, (row_number() over (order by lower(name)) - 1) % 4 + 1 as g
  from public.clients where client_type <> 'pontual'
)
update public.clients c set pauta_semana = r.g from r where r.id = c.id and c.pauta_semana is null;

-- Pautas enviadas (uma por cliente e mês): o Aprova lembra a estrategista na segunda até ela marcar como revisadas
create table if not exists public.pautas (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  ref_month   text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  doc_url     text not null default '',
  sent_at     timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  unique (client_id, ref_month)
);
alter table public.pautas enable row level security;
drop policy if exists "team full access pautas" on public.pautas;
create policy "team full access pautas" on public.pautas
  for all to authenticated using (public.is_team()) with check (public.is_team());
