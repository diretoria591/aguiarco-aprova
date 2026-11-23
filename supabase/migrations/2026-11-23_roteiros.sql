-- =====================================================================
-- Aguiar&Co Aprova · Roteiros e captações (nova seção)
--
-- Só ADICIONA tabelas, funções e policies novas. Não altera nenhuma
-- tabela, função ou policy que já existe no Aprova.
--
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (idempotente).
-- Depende de: schema.sql e 2026-11-23_agendamento.sql (my_role, is_team).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipes de gravação (cada uma entra por um link, sem senha)
-- ---------------------------------------------------------------------
create table if not exists public.roteiro_equipes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  first_name    text not null default '',          -- "Vivi" → "Oi, filmmaker da Vivi!"
  access_token  text not null unique default public.new_access_token(),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Quais clientes do Aprova usam Roteiros e quem grava cada um
create table if not exists public.roteiro_clientes (
  client_id   uuid primary key references public.clients (id) on delete cascade,
  team_id     uuid references public.roteiro_equipes (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Roteiros (um registro por roteiro, cada um com o próprio andamento)
--    status: grav (aguardando gravação) · bruto (vídeo bruto entregue)
--            edit (em edição com a Brenda) · rec (editado, conferir)
--            alt (alteração pedida) · pronto (pode entrar no calendário)
-- ---------------------------------------------------------------------
create table if not exists public.roteiros (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  month           text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  title           text not null check (char_length(title) between 1 and 200),
  content         text not null default '',
  content_url     text,
  content_name    text,
  ref_url         text,
  pub_date        date,
  notes           text not null default '',
  author_id       uuid references auth.users (id) on delete set null,
  author_name     text not null default '',
  batch_id        uuid,
  batch_size      integer not null default 1,
  status          text not null default 'grav'
                  check (status in ('grav', 'bruto', 'edit', 'rec', 'alt', 'pronto')),
  alt_note        text,
  video_url       text,
  photos_url      text,
  cover_url       text,
  video_type      text check (video_type in ('bruto', 'editado')),
  delivery_note   text,
  delivered_at    timestamptz,
  delivered_by    text,
  delivered_team  uuid references public.roteiro_equipes (id) on delete set null,
  brenda_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists roteiros_client_month_idx on public.roteiros (client_id, month, pub_date);
create index if not exists roteiros_status_idx on public.roteiros (status);

-- ---------------------------------------------------------------------
-- 3. RLS: toda a equipe (inclusive "scheduler") lê e escreve roteiros;
--    só admin muda equipes de gravação e quem grava cada cliente.
-- ---------------------------------------------------------------------
alter table public.roteiro_equipes  enable row level security;
alter table public.roteiro_clientes enable row level security;
alter table public.roteiros         enable row level security;

drop policy if exists "team reads roteiro_equipes" on public.roteiro_equipes;
create policy "team reads roteiro_equipes" on public.roteiro_equipes
  for select to authenticated using (public.is_team());
drop policy if exists "admin writes roteiro_equipes" on public.roteiro_equipes;
create policy "admin writes roteiro_equipes" on public.roteiro_equipes
  for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "team reads roteiro_clientes" on public.roteiro_clientes;
create policy "team reads roteiro_clientes" on public.roteiro_clientes
  for select to authenticated using (public.is_team());
drop policy if exists "admin writes roteiro_clientes" on public.roteiro_clientes;
create policy "admin writes roteiro_clientes" on public.roteiro_clientes
  for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "team full access roteiros" on public.roteiros;
create policy "team full access roteiros" on public.roteiros
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- Arquivos de roteiro (PDF, doc) enviados pela equipe: só a pasta roteiros/
drop policy if exists "team uploads roteiros files" on storage.objects;
create policy "team uploads roteiros files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'approvals-media' and name like 'roteiros/%' and public.is_team());

-- Atualização em tempo real da seção Roteiros
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roteiros'
  ) then
    alter publication supabase_realtime add table public.roteiros;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Novo link para uma equipe de gravação (só admin)
-- ---------------------------------------------------------------------
create or replace function public.roteiro_new_token(p_team uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare t text;
begin
  if coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Só um admin pode gerar um novo link.' using errcode = '42501';
  end if;
  update public.roteiro_equipes set access_token = public.new_access_token()
   where id = p_team returning access_token into t;
  if t is null then raise exception 'Equipe não encontrada.'; end if;
  return t;
end;
$$;
revoke all on function public.roteiro_new_token(uuid) from public, anon;
grant execute on function public.roteiro_new_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Área de gravação (equipe de gravação entra por link, sem senha)
--    Mesmo padrão da área do cliente: funções SECURITY DEFINER que validam
--    o token e só mostram/gravam o que é daquela equipe.
-- ---------------------------------------------------------------------
create or replace function public._gravacao_team(p_token text)
returns public.roteiro_equipes
language plpgsql
stable
security definer
set search_path = public
as $$
declare t public.roteiro_equipes;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'Link inválido ou expirado.' using errcode = '28000';
  end if;
  select * into t from public.roteiro_equipes where access_token = p_token and active;
  if not found then
    raise exception 'Link inválido ou expirado.' using errcode = '28000';
  end if;
  return t;
end;
$$;
revoke all on function public._gravacao_team(text) from public, anon, authenticated;

create or replace function public.gravacao_get(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t public.roteiro_equipes;
  month_start timestamptz;
  res jsonb;
begin
  t := public._gravacao_team(p_token);
  month_start := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  select jsonb_build_object(
    'team', jsonb_build_object('name', t.name, 'first_name', t.first_name),
    'delivered_month', (
      select count(*) from public.roteiros r
      where r.delivered_team = t.id and r.delivered_at >= month_start),
    'roteiros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'client_name', c.name, 'title', r.title, 'content', r.content,
        'content_url', r.content_url, 'content_name', r.content_name,
        'ref_url', r.ref_url, 'pub_date', r.pub_date, 'notes', r.notes,
        'month', r.month, 'status', r.status, 'alt_note', r.alt_note,
        'video_url', r.video_url, 'photos_url', r.photos_url, 'cover_url', r.cover_url,
        'video_type', r.video_type, 'delivered_at', r.delivered_at)
        order by r.pub_date nulls last, r.created_at)
      from public.roteiros r
      join public.roteiro_clientes rc on rc.client_id = r.client_id and rc.team_id = t.id
      join public.clients c on c.id = r.client_id
      where r.status in ('grav', 'alt')
         or (r.delivered_team = t.id and r.delivered_at >= now() - interval '45 days')
    ), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;

create or replace function public.gravacao_deliver(
  p_token text, p_roteiro uuid, p_video text, p_photos text,
  p_cover text, p_type text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.roteiro_equipes;
  v public.roteiros;
begin
  t := public._gravacao_team(p_token);
  select r.* into v
  from public.roteiros r
  join public.roteiro_clientes rc on rc.client_id = r.client_id and rc.team_id = t.id
  where r.id = p_roteiro
  for update of r;
  if not found then raise exception 'Roteiro não encontrado para esta equipe.'; end if;
  if v.status not in ('grav', 'alt') then raise exception 'Este roteiro já foi entregue.'; end if;
  if p_type not in ('bruto', 'editado') then raise exception 'Escolha vídeo bruto ou editado.'; end if;
  if coalesce(p_video, '') !~* '^https?://' then raise exception 'Cole o link do vídeo (começa com https://).'; end if;
  if coalesce(p_photos, '') <> '' and p_photos !~* '^https?://' then raise exception 'O link das fotos precisa começar com https://.'; end if;
  if coalesce(p_cover, '') <> '' and p_cover !~* '^https?://' then raise exception 'O link da capa precisa começar com https://.'; end if;

  update public.roteiros set
    video_url = trim(p_video),
    photos_url = nullif(trim(coalesce(p_photos, '')), ''),
    cover_url = nullif(trim(coalesce(p_cover, '')), ''),
    video_type = p_type,
    delivery_note = left(coalesce(p_note, ''), 500),
    delivered_at = now(),
    delivered_by = t.first_name,
    delivered_team = t.id,
    status = case when p_type = 'bruto' then 'bruto' else 'rec' end,
    alt_note = null,
    updated_at = now()
  where id = v.id;
end;
$$;

grant execute on function public.gravacao_get(text) to anon, authenticated;
grant execute on function public.gravacao_deliver(text, uuid, text, text, text, text, text) to anon, authenticated;
