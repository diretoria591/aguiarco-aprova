-- =====================================================================
-- Aguiar&Co Aprova · Mockup de agendamento para o cliente
--
-- Guarda a DATA E HORA em que cada conteúdo vai ao ar no Instagram
-- (publish_at). É isso que alimenta o mockup "conteúdos agendados da
-- semana / do mês" que a Duda salva e manda no grupo do cliente.
--
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

alter table public.posts add column if not exists publish_at timestamptz;

-- Marca como agendado (se ainda não estiver) e grava data/hora da publicação.
-- Também serve para corrigir a data de quem já está agendado e ainda sem aviso.
create or replace function public.team_set_schedule(p_post_id uuid, p_publish_at timestamptz)
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
  who := public._team_name();
  if p.scheduled_at is null then
    update public.posts
       set scheduled_at = now(), scheduled_by = auth.uid(), publish_at = p_publish_at
     where id = p.id;
    insert into public.activity_logs (client_id, post_id, type, actor, action_text)
    values (p.client_id, p.id, 'agendado', who, who || ' agendou ' || p.title);
  else
    update public.posts set publish_at = p_publish_at where id = p.id;
  end if;
end;
$$;

revoke all on function public.team_set_schedule(uuid, timestamptz) from public, anon;
grant execute on function public.team_set_schedule(uuid, timestamptz) to authenticated;

-- Quando o conteúdo sai de "aprovado" (ajuste, reprovação, nova versão), a
-- data de publicação também é zerada junto com o agendamento.
create or replace function public.on_post_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
    new.scheduled_at := null; new.scheduled_by := null; new.publish_at := null;
    new.client_notified_at := null; new.client_notified_by := null;
  elsif new.status <> 'approved' and old.status = 'approved' then
    new.approved_at := null; new.schedule_note := null;
    new.scheduled_at := null; new.scheduled_by := null; new.publish_at := null;
    new.client_notified_at := null; new.client_notified_by := null;
  end if;
  return new;
end;
$$;
