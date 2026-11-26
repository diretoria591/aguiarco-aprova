-- Pedidos de alteração encaminhados pela equipe.
-- O cliente pede alteração → Kim ou João escolhem quem faz (1ª pessoa e, se precisar, a 2ª),
-- com prazo para cada uma → a pessoa monta a nova versão (fica guardada, o cliente não vê)
-- → passa para a 2ª pessoa → Kim ou João revisam → "Tudo certo" publica a versão para o cliente.

-- Dias e horário de entrega de cada pessoa (1 = segunda … 5 = sexta).
alter table public.profiles add column if not exists does_changes boolean not null default false;
alter table public.profiles add column if not exists job text not null default '';
alter table public.profiles add column if not exists delivery_days smallint[] not null default '{1,2,3,4,5}';
alter table public.profiles add column if not exists delivery_hours text not null default '';
alter table public.profiles add column if not exists nickname text not null default '';

create table if not exists public.alteracoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  request_comment_id uuid references public.comments(id) on delete set null,
  request_text text not null default '',
  -- fazendo: com a equipe · revisao: esperando Kim/João · enviada: foi para o cliente · cancelada
  status text not null default 'fazendo' check (status in ('fazendo', 'revisao', 'enviada', 'cancelada')),
  -- versão montada até agora: { caption, items: [{src:'live'|'staged', id}], cover: {src,id}|null }
  plan jsonb,
  publish_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  review_note text not null default '',
  sent_at timestamptz,
  sent_by text not null default ''
);
create index if not exists alteracoes_post_idx on public.alteracoes (post_id);
create index if not exists alteracoes_status_idx on public.alteracoes (status);

create table if not exists public.alteracao_etapas (
  id uuid primary key default gen_random_uuid(),
  alteracao_id uuid not null references public.alteracoes(id) on delete cascade,
  ordem smallint not null check (ordem in (1, 2)),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null default '',
  email text not null default '',
  due_date date,
  -- aguardando: esperando a 1ª terminar · fazendo: vez dela · feita
  status text not null default 'aguardando' check (status in ('aguardando', 'fazendo', 'feita')),
  note text not null default '',
  summary text not null default '',
  -- recado da Kim/João quando a revisão devolve para a pessoa
  back_note text not null default '',
  started_at timestamptz,
  done_at timestamptz,
  unique (alteracao_id, ordem)
);
create index if not exists alteracao_etapas_profile_idx on public.alteracao_etapas (profile_id, status);

-- arquivos novos da versão em andamento (só a equipe vê; vão para post_media no "Tudo certo")
create table if not exists public.alteracao_media (
  id uuid primary key default gen_random_uuid(),
  alteracao_id uuid not null references public.alteracoes(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  file_url text not null,
  storage_path text,
  file_type text not null default '',
  file_name text not null default '',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists alteracao_media_alt_idx on public.alteracao_media (alteracao_id);

alter table public.alteracoes enable row level security;
alter table public.alteracao_etapas enable row level security;
alter table public.alteracao_media enable row level security;

drop policy if exists "team full access alteracoes" on public.alteracoes;
create policy "team full access alteracoes" on public.alteracoes
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team full access alteracao_etapas" on public.alteracao_etapas;
create policy "team full access alteracao_etapas" on public.alteracao_etapas
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "team full access alteracao_media" on public.alteracao_media;
create policy "team full access alteracao_media" on public.alteracao_media
  for all to authenticated using (public.is_team()) with check (public.is_team());
