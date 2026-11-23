-- Aguiar&Co Aprova · rodadas de revisão incluídas por conteúdo
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.
--
-- Regra: cada cliente tem N rodadas de revisão por conteúdo (padrão 2). Cada pedido de
-- alteração do cliente conta como uma rodada, exceto os marcados como "erro da agência".
-- Depois do limite o cliente é avisado e pode prosseguir; o pedido fica sinalizado como
-- rodada extra (cobrada à parte) no painel e na linha do tempo.

alter table public.clients
  add column if not exists revision_limit integer not null default 2;
alter table public.clients drop constraint if exists clients_revision_limit_check;
alter table public.clients add constraint clients_revision_limit_check
  check (revision_limit between 0 and 20);

alter table public.comments
  add column if not exists agency_error boolean not null default false;

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
