-- Aguiar&Co Aprova · "Cliente aprovou no WhatsApp"
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- Quando o cliente combina pelo WhatsApp (sem usar o link), a equipe marca o conteúdo como aprovado
-- e escreve a observação obrigatória para quem agenda. A observação aparece em vermelho na fila de
-- agendamento e no e-mail de aviso (que vai para quem agenda, como na aprovação pelo link). Vale para conteúdos aguardando aprovação ou em ajuste.
create or replace function public.team_approve_whatsapp(p_post_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text; v_approved timestamptz; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_editor() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if note is null then
    raise exception 'Escreva a observação para quem vai agendar.' using errcode = '22023';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
  if p.status not in ('pending', 'adjustment_requested') then
    raise exception 'Só conteúdos aguardando aprovação ou em ajuste podem ser marcados assim.' using errcode = '22023';
  end if;
  who := public._team_name();
  -- o prefixo "Combinado com o cliente pelo WhatsApp" é o que deixa a observação em vermelho no painel e no e-mail
  update public.posts
     set status = 'approved', decided_at = now(), decided_by = who || ' (cliente pelo WhatsApp)',
         schedule_note = left('Combinado com o cliente pelo WhatsApp (' || who || '):' || E'\n' || note, 5000)
   where id = p.id
  returning approved_at into v_approved;
  -- aprovação feita pela equipe não avisa sozinha (só a do cliente pelo link): aqui avisa a Duda por e-mail
  insert into public.notification_outbox (post_id, client_id, channel, approved_at)
  values (p.id, p.client_id, 'email', v_approved)
  on conflict (post_id, channel, approved_at) do nothing;
  insert into public.comments (post_id, author_name, author_role, kind, content, version)
  values (p.id, who, 'agency', 'comment', 'Combinado pelo WhatsApp ✓ Vamos publicar com o que conversamos.', p.version);
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'aprovado_whatsapp', who, who || ' marcou ' || p.title || ' como aprovado pelo cliente no WhatsApp');
  -- chama o servidor para enviar o e-mail (falha de rede nunca derruba a aprovação)
  perform public._dispatch_notifications();
end;
$$;
revoke all on function public.team_approve_whatsapp(uuid, text) from public, anon;
grant execute on function public.team_approve_whatsapp(uuid, text) to authenticated;
