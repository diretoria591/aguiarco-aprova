-- =====================================================================
-- Aguiar&Co Aprova · Agendamento (fila da Duda) + funções na equipe
-- + aviso automático por e-mail quando o cliente aprova
--   (a fila de avisos já aceita WhatsApp para ligar depois).
--
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (idempotente).
--
-- Antes de rodar: Database → Extensions → ative "pg_net" (ou deixe a linha
-- abaixo ativar). Depois de rodar, cadastre os 2 segredos do Vault (seção 7).
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Colunas novas em posts
-- ---------------------------------------------------------------------
alter table public.posts add column if not exists scheduled_at        timestamptz;
alter table public.posts add column if not exists scheduled_by        uuid references auth.users (id) on delete set null;
alter table public.posts add column if not exists client_notified_at  timestamptz;
alter table public.posts add column if not exists client_notified_by  uuid references auth.users (id) on delete set null;
-- quando o post virou "aprovado" pela última vez (base da fila e da deduplicação dos avisos)
alter table public.posts add column if not exists approved_at         timestamptz;
-- ressalva para quem agenda (ex.: "Ajustado e agendado": cliente pediu música,
-- que só dá para colocar na hora de agendar)
alter table public.posts add column if not exists schedule_note       text;

-- área da beleza: @ da profissional que aparece (opcional, preenchido no envio)
alter table public.posts add column if not exists featured_professional text not null default '';

-- clientes: Instagram (para lembrar a marcação) e área de atuação
alter table public.clients add column if not exists instagram text not null default '';
alter table public.clients add column if not exists segment   text not null default '';
alter table public.clients drop constraint if exists clients_segment_check;
alter table public.clients add constraint clients_segment_check
  check (segment in ('', 'saude', 'gastronomia', 'beleza', 'empresas', 'outra'));

create index if not exists posts_schedule_queue_idx
  on public.posts (approved_at)
  where status = 'approved' and scheduled_at is null;

-- ---------------------------------------------------------------------
-- 2. Função de cada pessoa da equipe
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists role text not null default 'team';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'scheduler', 'team'));

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- admin e team: acesso total (igual a hoje). scheduler: lê tudo, mas só
-- escreve pelas funções de agendamento abaixo.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('admin', 'team'), false);
$$;

-- Ninguém muda a própria função pela API. Só admin (ou o SQL Editor /
-- service role, que não têm auth.uid()).
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Só um admin pode mudar a função de alguém da equipe.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- admin pode editar perfis de outras pessoas (para trocar a função)
drop policy if exists "admin updates profiles" on public.profiles;
create policy "admin updates profiles" on public.profiles
  for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------------------------------------------------------------------
-- 3. Policies: leitura igual a hoje para toda a equipe; escrita só
--    admin/team. Para admin e team nada muda.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients', 'posts', 'post_media', 'comments', 'activity_logs'] loop
    execute format('drop policy if exists %I on public.%I',
      case t when 'post_media' then 'team full access media'
             when 'activity_logs' then 'team full access activity'
             else 'team full access ' || t end, t);
    execute format('drop policy if exists %I on public.%I', 'team reads ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'editors write ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_team())',
      'team reads ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_editor()) with check (public.is_editor())',
      'editors write ' || t, t);
  end loop;
end $$;

drop policy if exists "team uploads approvals-media" on storage.objects;
drop policy if exists "team updates approvals-media" on storage.objects;
drop policy if exists "team deletes approvals-media" on storage.objects;
create policy "team uploads approvals-media" on storage.objects
  for insert to authenticated with check (bucket_id = 'approvals-media' and public.is_editor());
create policy "team updates approvals-media" on storage.objects
  for update to authenticated using (bucket_id = 'approvals-media' and public.is_editor());
create policy "team deletes approvals-media" on storage.objects
  for delete to authenticated using (bucket_id = 'approvals-media' and public.is_editor());

-- ---------------------------------------------------------------------
-- 4. Ações da aba Agendamento (qualquer pessoa da equipe, inclusive scheduler)
-- ---------------------------------------------------------------------
create or replace function public._team_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(p.name, ''), p.email, 'Equipe') from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.team_mark_scheduled(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text;
begin
  if not public.is_team() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
  if p.status <> 'approved' then
    raise exception 'Só conteúdos aprovados podem ser agendados.' using errcode = '22023';
  end if;
  if p.scheduled_at is not null then return; end if;  -- clique duplo: nada a fazer
  who := public._team_name();
  update public.posts set scheduled_at = now(), scheduled_by = auth.uid() where id = p.id;
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'agendado', who, who || ' agendou ' || p.title);
end;
$$;

create or replace function public.team_mark_client_notified(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text;
begin
  if not public.is_team() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
  if p.scheduled_at is null then
    raise exception 'Marque como agendado antes de avisar o cliente.' using errcode = '22023';
  end if;
  if p.client_notified_at is not null then return; end if;
  who := public._team_name();
  update public.posts set client_notified_at = now(), client_notified_by = auth.uid() where id = p.id;
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'cliente_avisado', who, who || ' avisou o cliente do agendamento de ' || p.title);
end;
$$;

-- Desfazer (aparece por alguns segundos depois de cada clique)
create or replace function public.team_undo_scheduled(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text;
begin
  if not public.is_team() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found or p.scheduled_at is null then return; end if;
  if p.client_notified_at is not null then
    raise exception 'O cliente já foi avisado. Desfaça o aviso primeiro.' using errcode = '22023';
  end if;
  who := public._team_name();
  update public.posts set scheduled_at = null, scheduled_by = null where id = p.id;
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'agendamento_desfeito', who, who || ' desfez o agendamento de ' || p.title);
end;
$$;

create or replace function public.team_undo_client_notified(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text;
begin
  if not public.is_team() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found or p.client_notified_at is null then return; end if;
  who := public._team_name();
  update public.posts set client_notified_at = null, client_notified_by = null where id = p.id;
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'aviso_desfeito', who, who || ' desfez o aviso ao cliente de ' || p.title);
end;
$$;

revoke all on function public.team_undo_scheduled(uuid)       from public, anon;
revoke all on function public.team_undo_client_notified(uuid) from public, anon;
grant execute on function public.team_undo_scheduled(uuid)       to authenticated;
grant execute on function public.team_undo_client_notified(uuid) to authenticated;

revoke all on function public.team_mark_scheduled(uuid)       from public, anon;
revoke all on function public.team_mark_client_notified(uuid) from public, anon;
grant execute on function public.team_mark_scheduled(uuid)       to authenticated;
grant execute on function public.team_mark_client_notified(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4b. "Ajustado e agendado" (equipe): aprova e manda para a fila com
--     ressalva = último pedido de ajuste do cliente (+ recado opcional).
-- ---------------------------------------------------------------------
create or replace function public.team_approve_with_note(p_post_id uuid, p_extra text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text; ask text; extra text := nullif(btrim(coalesce(p_extra, '')), '');
begin
  if not public.is_editor() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
  if p.status <> 'adjustment_requested' then
    raise exception 'Só conteúdos em ajuste podem ser marcados assim.' using errcode = '22023';
  end if;
  who := public._team_name();
  select c.content into ask from public.comments c
   where c.post_id = p.id and c.author_role = 'client' and c.kind = 'adjustment'
   order by c.created_at desc limit 1;
  update public.posts
     set status = 'approved', decided_at = now(), decided_by = who,
         schedule_note = left(concat_ws(E'\n\n',
           case when ask is not null then 'Pedido do cliente: ' || ask end,
           case when extra is not null then 'Recado de ' || who || ': ' || extra end), 5000)
   where id = p.id;
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'agency', 'comment', 'Anotado! Faremos esse ajuste na hora de agendar. ✓', p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'ajustado_interno', who, who || ' aprovou ' || p.title || ' com ressalva para o agendamento');
end;
$$;
revoke all on function public.team_approve_with_note(uuid, text) from public, anon;
grant execute on function public.team_approve_with_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Fila de avisos (outbox) — o banco anota, o servidor envia
-- ---------------------------------------------------------------------
create table if not exists public.notification_outbox (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  client_id    uuid not null references public.clients (id) on delete cascade,
  channel      text not null check (channel in ('email', 'whatsapp')),
  approved_at  timestamptz not null,
  status       text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  -- 1 aviso por canal por aprovação: aprovar de novo o mesmo post não duplica
  unique (post_id, channel, approved_at)
);
alter table public.notification_outbox enable row level security;
drop policy if exists "team reads outbox" on public.notification_outbox;
create policy "team reads outbox" on public.notification_outbox
  for select to authenticated using (public.is_team());
-- sem policy de escrita: só o servidor (service role) e o trigger mexem

-- Chama o servidor (Vercel) para enviar os avisos pendentes. Nunca derruba a aprovação.
create or replace function public._dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  if v_url is null or v_secret is null then
    return;  -- avisos ficam na fila até o Vault ser configurado
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := '{}'::jsonb
  );
exception when others then
  null;  -- falha de rede/config não pode impedir a aprovação
end;
$$;
revoke all on function public._dispatch_notifications() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Trigger: virou "aprovado" → entra na fila de agendamento + avisos.
--    Saiu de "aprovado" (pediu ajuste, reprovou, nova versão) → sai da fila
--    e o agendamento é zerado (volta para a fila quando aprovar de novo).
-- ---------------------------------------------------------------------
create or replace function public.on_post_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
    new.scheduled_at := null; new.scheduled_by := null;
    new.client_notified_at := null; new.client_notified_by := null;
  elsif new.status <> 'approved' and old.status = 'approved' then
    new.approved_at := null; new.schedule_note := null;
    new.scheduled_at := null; new.scheduled_by := null;
    new.client_notified_at := null; new.client_notified_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_status_change on public.posts;
create trigger posts_status_change
  before update of status on public.posts
  for each row execute function public.on_post_status_change();

create or replace function public.on_post_approved_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- só aprovação feita pelo CLIENTE (link sem login → auth.uid() nulo)
  if auth.uid() is null then
    insert into public.notification_outbox (post_id, client_id, channel, approved_at)
    values (new.id, new.client_id, 'email', new.approved_at)
    on conflict (post_id, channel, approved_at) do nothing;
    perform public._dispatch_notifications();
  end if;
  return null;
exception when others then
  return null;  -- aviso nunca bloqueia a aprovação
end;
$$;

drop trigger if exists posts_approved_notify on public.posts;
create trigger posts_approved_notify
  after update of status on public.posts
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.on_post_approved_notify();

-- ---------------------------------------------------------------------
-- 7. Posts que já estavam aprovados antes desta migration
--    Data prevista de hoje em diante (ou sem data) → fila.
--    Data passada → Concluídos (sem autor, marcado na data da aprovação).
--    Só mexe em quem ainda não tem approved_at (rodar de novo não refaz).
-- ---------------------------------------------------------------------
update public.posts
   set approved_at = coalesce(decided_at, sent_at),
       scheduled_at = case when scheduled_date < (now() at time zone 'America/Sao_Paulo')::date
                           then coalesce(decided_at, sent_at) end,
       client_notified_at = case when scheduled_date < (now() at time zone 'America/Sao_Paulo')::date
                                 then coalesce(decided_at, sent_at) end
 where status = 'approved' and approved_at is null;

-- posts já está na publicação supabase_realtime (schema.sql): a aba
-- Agendamento atualiza sozinha.

-- =====================================================================
-- DEPOIS DE RODAR (uma vez, NÃO salve isto no repositório):
--
--   select vault.create_secret('https://SEU-DOMINIO/api/notify/dispatch', 'notify_dispatch_url');
--   select vault.create_secret('MESMO-VALOR-DO-NOTIFY_WEBHOOK_SECRET-DA-VERCEL', 'notify_webhook_secret');
--
--   update public.profiles set role = 'admin'     where email = 'email-da-kimberly';
--   update public.profiles set role = 'scheduler' where email = 'email-da-eduarda';
-- =====================================================================
