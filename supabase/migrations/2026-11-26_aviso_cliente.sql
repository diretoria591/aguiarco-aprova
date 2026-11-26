-- Aguiar&Co Aprova · Aviso por e-mail quando o cliente pede alteração, reprova ou comenta.
-- Pode rodar de novo sem problema.
--
-- Usa a mesma fila (notification_outbox) e o mesmo disparo da aprovação.
-- Os destinatários ficam na Vercel: CLIENT_ALERT_EMAIL (vários separados por vírgula).

alter table public.notification_outbox add column if not exists kind text not null default 'approval';
alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval', 'adjustment', 'rejection', 'comment'));
alter table public.notification_outbox add column if not exists comment_id uuid references public.comments (id) on delete cascade;
alter table public.notification_outbox alter column approved_at drop not null;
-- 1 aviso por mensagem do cliente
create unique index if not exists notification_outbox_comment_uq
  on public.notification_outbox (comment_id, channel) where comment_id is not null;

create or replace function public.on_client_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_outbox (post_id, client_id, channel, kind, comment_id)
  select new.post_id, p.client_id, 'email', new.kind, new.id
    from public.posts p where p.id = new.post_id
  on conflict do nothing;
  perform public._dispatch_notifications();
  return null;
exception when others then
  return null;  -- aviso nunca bloqueia o pedido do cliente
end;
$$;
revoke all on function public.on_client_comment_notify() from public, anon, authenticated;

drop trigger if exists comments_client_notify on public.comments;
create trigger comments_client_notify
  after insert on public.comments
  for each row
  when (new.author_role = 'client' and new.kind in ('adjustment', 'rejection', 'comment'))
  execute function public.on_client_comment_notify();
