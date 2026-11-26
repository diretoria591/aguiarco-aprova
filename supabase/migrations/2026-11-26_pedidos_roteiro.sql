-- Aguiar&Co Aprova · Pedidos de roteiro
-- Kim ou João pedem roteiros para quem escreve (Renata, Eduarda, Carol) → a pessoa escreve e
-- entrega pelo Aprova (em Minhas demandas) → Kim ou João revisam → "Enviar para o cliente"
-- vira um material de texto para aprovação no link do cliente.
-- Demandas fixas: roteiros que todo mês saem pelo contrato. O Aprova cria o pedido do mês sozinho.
-- Rode uma vez no Supabase (SQL Editor). Pode rodar de novo.

-- quem aparece na lista de "quem escreve"
alter table public.profiles add column if not exists writes_roteiros boolean not null default false;
update public.profiles set writes_roteiros = true
 where email in ('contatorenata11@gmail.com', 'socialmedia@aguiareco.com.br') or name in ('Renata', 'Eduarda', 'Carol');

-- demanda fixa: todo mês, N roteiros de um cliente para uma pessoa, com prazo no dia X
create table if not exists public.roteiro_fixos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  quantidade  integer not null check (quantidade between 1 and 60),
  due_day     smallint not null default 20 check (due_day between 1 and 28),
  briefing    text not null default '',
  active      boolean not null default true,
  created_by_name text not null default '',
  created_at  timestamptz not null default now(),
  unique (client_id, profile_id)
);

-- um pedido = N roteiros de um cliente para uma pessoa
create table if not exists public.roteiro_pedidos (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  profile_id    uuid references public.profiles (id) on delete set null,
  assignee_name text not null default '',
  -- mês dos roteiros (o mês em que vão ao ar)
  ref_month     text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  quantidade    integer not null default 1 check (quantidade between 1 and 60),
  briefing      text not null default '',
  due_date      date,
  fixo_id       uuid references public.roteiro_fixos (id) on delete set null,
  -- fazendo: com quem escreve · revisao: esperando Kim/João · enviado: foi para o cliente · cancelado
  status        text not null default 'fazendo' check (status in ('fazendo', 'revisao', 'enviado', 'cancelado')),
  -- roteiros escritos: [{ title, content }]
  itens         jsonb not null default '[]'::jsonb,
  doc_url       text not null default '',
  entrega_note  text not null default '',
  delivered_at  timestamptz,
  back_note     text not null default '',
  created_by    uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz,
  sent_by       text not null default '',
  post_ids      uuid[] not null default '{}',
  -- a demanda fixa gera só um pedido por mês
  unique (fixo_id, ref_month)
);
create index if not exists roteiro_pedidos_status_idx on public.roteiro_pedidos (status);
create index if not exists roteiro_pedidos_profile_idx on public.roteiro_pedidos (profile_id, status);

alter table public.roteiro_fixos enable row level security;
alter table public.roteiro_pedidos enable row level security;
drop policy if exists "team full access roteiro_fixos" on public.roteiro_fixos;
create policy "team full access roteiro_fixos" on public.roteiro_fixos
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team full access roteiro_pedidos" on public.roteiro_pedidos;
create policy "team full access roteiro_pedidos" on public.roteiro_pedidos
  for all to authenticated using (public.is_team()) with check (public.is_team());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roteiro_pedidos'
  ) then
    alter publication supabase_realtime add table public.roteiro_pedidos;
  end if;
end $$;

-- roteiro enviado ao cliente vira um material de texto marcado: não entra na fila de Agendamento,
-- no termômetro de entregas nem nos relatórios (não é post publicado)
alter table public.posts add column if not exists is_roteiro boolean not null default false;
