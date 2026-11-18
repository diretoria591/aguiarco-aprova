-- Aguiar&Co Aprova · opção "Reprovar" (conteúdo não será publicado)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.

-- 1. Novo status do post e novo tipo de mensagem
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('pending', 'adjustment_requested', 'approved', 'rejected'));

alter table public.comments drop constraint if exists comments_kind_check;
alter table public.comments add constraint comments_kind_check
  check (kind in ('comment', 'approval', 'adjustment', 'version', 'rejection'));

-- 2. Função usada pelo link do cliente
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

grant execute on function public.portal_reject(text, uuid, text, text) to anon, authenticated;
