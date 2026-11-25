-- Aguiar&Co Aprova · Editar a observação para quem agenda depois de enviar
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- A equipe pode corrigir ou completar a observação (ressalva ou "combinado pelo WhatsApp") de um
-- conteúdo já aprovado. Na observação do WhatsApp, o cabeçalho "Combinado com o cliente pelo WhatsApp (...)"
-- é mantido, para ela continuar em vermelho. A fila mostra que a observação foi atualizada.
alter table public.posts add column if not exists schedule_note_updated_at timestamptz;
alter table public.posts add column if not exists schedule_note_updated_by text;

create or replace function public.team_update_schedule_note(p_post_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.posts; who text; body text := nullif(btrim(coalesce(p_note, '')), ''); head text; v_new text;
begin
  if not public.is_editor() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into p from public.posts where id = p_post_id for update;
  if not found then raise exception 'Conteúdo não encontrado.' using errcode = 'P0002'; end if;
  if p.status <> 'approved' then
    raise exception 'Só conteúdos aprovados têm observação para o agendamento.' using errcode = '22023';
  end if;
  who := public._team_name();
  if coalesce(p.schedule_note, '') like 'Combinado com o cliente pelo WhatsApp%' then
    if body is null then
      raise exception 'A observação do WhatsApp não pode ficar vazia.' using errcode = '22023';
    end if;
    head := split_part(p.schedule_note, E'\n', 1);
    v_new := left(head || E'\n' || body, 5000);
  else
    v_new := left(body, 5000);
  end if;
  update public.posts
     set schedule_note = v_new, schedule_note_updated_at = now(), schedule_note_updated_by = who
   where id = p.id;
  insert into public.activity_logs (client_id, post_id, type, actor, action_text)
  values (p.client_id, p.id, 'observacao_editada', who, who || ' editou a observação para o agendamento de ' || p.title);
end;
$$;
revoke all on function public.team_update_schedule_note(uuid, text) from public, anon;
grant execute on function public.team_update_schedule_note(uuid, text) to authenticated;
