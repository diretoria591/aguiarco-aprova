-- =====================================================================
-- Aguiar&Co · Aprova — schema completo do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase (Project → SQL Editor
-- → New query → colar → Run). Ele é idempotente: pode rodar de novo sem
-- perder dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Equipe (perfis ligados ao Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now()
);

-- Cria o perfil automaticamente quando alguém da equipe é adicionado
-- (Authentication → Users → Add user com "Auto Confirm User", Invite user,
-- ou pelo painel /dashboard/equipe).
-- Proteção extra: um cadastro público (signUp) com confirmação de e-mail
-- pendente NÃO vira equipe. Mesmo assim, desative "Allow new users to sign up"
-- em Authentication → Sign In / Providers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null and new.invited_at is null then
    return new;
  end if;
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuários que já existiam antes deste script também viram equipe.
insert into public.profiles (id, name, email)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
       coalesce(u.email, '')
from auth.users u
where u.email_confirmed_at is not null or u.invited_at is not null
on conflict (id) do nothing;

-- Verdadeiro quando quem chama é alguém da equipe autenticado.
create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Tabelas do produto
-- ---------------------------------------------------------------------

-- Token de acesso: 64 caracteres hexadecimais (≈244 bits aleatórios).
create or replace function public.new_access_token()
returns text
language sql
volatile
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

create table if not exists public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 120),
  logo_url          text,
  logo_path         text,
  contact_name      text not null default '',
  whatsapp          text not null default '',
  email             text not null default '',
  revision_limit    integer not null default 2 check (revision_limit between 0 and 20),
  access_token      text not null unique default public.new_access_token(),
  last_accessed_at  timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists public.posts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  caption          text not null default '',
  format           text not null default 'carrossel'
                   check (format in ('foto', 'video', 'reels', 'carrossel', 'arte', 'stories', 'texto')),
  status           text not null default 'pending'
                   check (status in ('pending', 'adjustment_requested', 'approved', 'rejected')),
  scheduled_date   date,
  version          integer not null default 1,
  sent_at          timestamptz not null default now(),
  first_viewed_at  timestamptz,
  decided_at       timestamptz,
  decided_by       text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists posts_client_idx on public.posts (client_id, sent_at desc);

create table if not exists public.post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts (id) on delete cascade,
  file_url      text not null,
  storage_path  text,
  file_type     text not null default '',
  file_name     text not null default '',
  order_index   integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists post_media_post_idx on public.post_media (post_id, order_index);

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  author_name  text not null default '',
  author_role  text not null check (author_role in ('agency', 'client')),
  kind         text not null default 'comment'
               check (kind in ('comment', 'approval', 'adjustment', 'version', 'rejection')),
  content      text not null check (char_length(content) between 1 and 5000),
  version      integer not null default 1,
  agency_error boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  post_id      uuid references public.posts (id) on delete set null,
  type         text not null default 'info',
  actor        text not null default '',
  meta         text not null default '',
  action_text  text not null,
  created_at   timestamptz not null default now()
);
create index if not exists activity_client_idx on public.activity_logs (client_id, created_at desc);
create index if not exists activity_recent_idx on public.activity_logs (created_at desc);

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    • Equipe autenticada (is_team) → acesso total.
--    • Cliente (anon) → só LÊ o que pertence ao token enviado no cabeçalho
--      HTTP `x-client-token`. Não existe policy de escrita para anon:
--      aprovar, pedir ajuste e comentar passam pelas funções portal_* abaixo,
--      que validam o token antes de gravar.
-- ---------------------------------------------------------------------

-- Lê o token que o navegador do cliente envia no cabeçalho x-client-token.
create or replace function public.request_client_token()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-client-token',
    ''
  );
$$;

-- id do cliente dono do token do cabeçalho (ou null).
create or replace function public.request_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from public.clients c
  where public.request_client_token() is not null
    and c.access_token = public.request_client_token()
  limit 1;
$$;

alter table public.profiles      enable row level security;
alter table public.clients       enable row level security;
alter table public.posts         enable row level security;
alter table public.post_media    enable row level security;
alter table public.comments      enable row level security;
alter table public.activity_logs enable row level security;

-- profiles
drop policy if exists "team reads profiles" on public.profiles;
create policy "team reads profiles" on public.profiles
  for select to authenticated using (public.is_team());
drop policy if exists "user updates own profile" on public.profiles;
create policy "user updates own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- clients
drop policy if exists "team full access clients" on public.clients;
create policy "team full access clients" on public.clients
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "client reads own row" on public.clients;
create policy "client reads own row" on public.clients
  for select to anon using (id = public.request_client_id());

-- posts
drop policy if exists "team full access posts" on public.posts;
create policy "team full access posts" on public.posts
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "client reads own posts" on public.posts;
create policy "client reads own posts" on public.posts
  for select to anon using (client_id = public.request_client_id());

-- post_media
drop policy if exists "team full access media" on public.post_media;
create policy "team full access media" on public.post_media
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "client reads own media" on public.post_media;
create policy "client reads own media" on public.post_media
  for select to anon using (
    exists (select 1 from public.posts p
            where p.id = post_media.post_id and p.client_id = public.request_client_id())
  );

-- comments
drop policy if exists "team full access comments" on public.comments;
create policy "team full access comments" on public.comments
  for all to authenticated using (public.is_team()) with check (public.is_team());
drop policy if exists "client reads own comments" on public.comments;
create policy "client reads own comments" on public.comments
  for select to anon using (
    exists (select 1 from public.posts p
            where p.id = comments.post_id and p.client_id = public.request_client_id())
  );

-- activity_logs (o cliente não lê o feed da agência)
drop policy if exists "team full access activity" on public.activity_logs;
create policy "team full access activity" on public.activity_logs
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- ---------------------------------------------------------------------
-- 4. Funções da área do cliente (chamadas pelo link /aprovar/[token])
--    SECURITY DEFINER: validam o token e só tocam nos dados daquele cliente.
-- ---------------------------------------------------------------------

create or replace function public._portal_client(p_token text)
returns public.clients
language plpgsql
stable
security definer
set search_path = public
as $$
declare c public.clients;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'Link inválido ou expirado.' using errcode = 'P0002';
  end if;
  select * into c from public.clients where access_token = p_token;
  if not found then
    raise exception 'Link inválido ou expirado.' using errcode = 'P0002';
  end if;
  return c;
end;
$$;

create or replace function public._portal_post(p_client uuid, p_post uuid)
returns public.posts
language plpgsql
stable
security definer
set search_path = public
as $$
declare p public.posts;
begin
  select * into p from public.posts where id = p_post and client_id = p_client;
  if not found then
    raise exception 'Conteúdo não encontrado.' using errcode = 'P0002';
  end if;
  return p;
end;
$$;

create or replace function public._clean_name(p_name text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(left(btrim(coalesce(p_name, '')), 80), ''), 'Cliente');
$$;

-- Registra que o cliente abriu o link (no máximo 1 registro a cada 30 min).
create or replace function public.portal_register_access(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; last_at timestamptz;
begin
  c := public._portal_client(p_token);
  select max(created_at) into last_at from public.activity_logs
   where client_id = c.id and type = 'acesso';
  update public.clients set last_accessed_at = now() where id = c.id;
  if last_at is null or last_at < now() - interval '30 minutes' then
    insert into public.activity_logs (client_id, type, action_text)
    values (c.id, 'acesso', 'Acessou a área de aprovação');
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.portal_mark_viewed(p_token text, p_post_id uuid, p_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; p public.posts; who text := public._clean_name(p_name);
begin
  c := public._portal_client(p_token);
  p := public._portal_post(c.id, p_post_id);
  if p.first_viewed_at is null then
    update public.posts set first_viewed_at = now() where id = p.id;
    insert into public.activity_logs (client_id, post_id, type, actor, action_text)
    values (c.id, p.id, 'visualizou', who, 'Visualizou ' || p.title);
  end if;
end;
$$;

create or replace function public.portal_approve(p_token text, p_post_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; p public.posts; who text := public._clean_name(p_name);
begin
  c := public._portal_client(p_token);
  p := public._portal_post(c.id, p_post_id);
  update public.posts
     set status = 'approved', decided_at = now(), decided_by = who,
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = p.id;
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'client', 'approval', 'Aprovado.', p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (c.id, p.id, 'aprovado', who, 'Aprovou ' || p.title);
end;
$$;

create or replace function public.portal_request_changes(p_token text, p_post_id uuid, p_name text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; p public.posts; who text := public._clean_name(p_name);
        body text := left(btrim(coalesce(p_content, '')), 5000); used integer;
begin
  if body = '' then
    raise exception 'Conte o que você gostaria de alterar.' using errcode = '22023';
  end if;
  c := public._portal_client(p_token);
  p := public._portal_post(c.id, p_post_id);
  update public.posts
     set status = 'adjustment_requested', decided_at = now(), decided_by = who,
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = p.id;
  select count(*) into used from public.comments
   where post_id = p.id and author_role = 'client' and kind = 'adjustment' and not agency_error;
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'client', 'adjustment', body, p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text, meta)
  values (c.id, p.id, 'ajustes', who,
          'Pediu alterações em ' || p.title || case when used >= c.revision_limit then ' (rodada extra, cobrada à parte)' else '' end,
          case when used >= c.revision_limit then 'extra' else '' end);
end;
$$;

create or replace function public.portal_comment(p_token text, p_post_id uuid, p_name text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; p public.posts; who text := public._clean_name(p_name);
        body text := left(btrim(coalesce(p_content, '')), 5000);
begin
  if body = '' then
    raise exception 'Escreva seu comentário.' using errcode = '22023';
  end if;
  c := public._portal_client(p_token);
  p := public._portal_post(c.id, p_post_id);
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'client', 'comment', body, p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (c.id, p.id, 'comentario_cliente', who, 'Comentou em ' || p.title);
end;
$$;

create or replace function public.portal_reject(p_token text, p_post_id uuid, p_name text, p_content text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; p public.posts; who text := public._clean_name(p_name);
        body text := left(btrim(coalesce(p_content, '')), 5000);
begin
  c := public._portal_client(p_token);
  p := public._portal_post(c.id, p_post_id);
  update public.posts
     set status = 'rejected', decided_at = now(), decided_by = who,
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = p.id;
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'client', 'rejection',
          case when body = '' then 'Reprovado: não publicar.' else 'Reprovado: ' || body end, p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (c.id, p.id, 'reprovado', who, 'Reprovou ' || p.title);
end;
$$;

-- Funções internas não ficam expostas na API.
revoke all on function public._portal_client(text)       from public, anon, authenticated;
revoke all on function public._portal_post(uuid, uuid)   from public, anon, authenticated;
revoke all on function public.handle_new_user()          from public, anon, authenticated;

grant execute on function public.portal_register_access(text)                     to anon, authenticated;
grant execute on function public.portal_mark_viewed(text, uuid, text)             to anon, authenticated;
grant execute on function public.portal_approve(text, uuid, text)                 to anon, authenticated;
grant execute on function public.portal_request_changes(text, uuid, text, text)   to anon, authenticated;
grant execute on function public.portal_comment(text, uuid, text, text)           to anon, authenticated;
grant execute on function public.portal_reject(text, uuid, text, text)            to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Storage: bucket público "approvals-media"
--    Leitura pública por URL; envio/edição/remoção só pela equipe.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('approvals-media', 'approvals-media', true)
on conflict (id) do update set public = true;

drop policy if exists "team reads approvals-media"   on storage.objects;
drop policy if exists "team uploads approvals-media" on storage.objects;
drop policy if exists "team updates approvals-media" on storage.objects;
drop policy if exists "team deletes approvals-media" on storage.objects;

create policy "team reads approvals-media" on storage.objects
  for select to authenticated using (bucket_id = 'approvals-media' and public.is_team());
create policy "team uploads approvals-media" on storage.objects
  for insert to authenticated with check (bucket_id = 'approvals-media' and public.is_team());
create policy "team updates approvals-media" on storage.objects
  for update to authenticated using (bucket_id = 'approvals-media' and public.is_team());
create policy "team deletes approvals-media" on storage.objects
  for delete to authenticated using (bucket_id = 'approvals-media' and public.is_team());

-- ---------------------------------------------------------------------
-- 6. Realtime: o painel recebe o "Movimento dos clientes" ao vivo
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_logs') then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;
