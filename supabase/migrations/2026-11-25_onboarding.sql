-- Aguiar&Co Aprova · Onboarding de cliente novo (boas-vindas, pasta do Drive, briefing)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo.
--
-- onboarding_status: novo (acabou de ser cadastrado) → enviado (boas-vindas, pasta e aviso à equipe feitos)
--   → respondido (cliente respondeu o briefing). Clientes que já existiam ficam como "antigo".
-- O envio dos e-mails e a criação da pasta são feitos pela rotina de onboarding (a cada hora).

alter table public.clients add column if not exists onboarding_status text not null default 'novo';
alter table public.clients drop constraint if exists clients_onboarding_status_check;
alter table public.clients add constraint clients_onboarding_status_check
  check (onboarding_status in ('novo', 'enviado', 'respondido', 'antigo'));
alter table public.clients add column if not exists drive_url text not null default '';
alter table public.clients add column if not exists welcome_sent_at timestamptz;
alter table public.clients add column if not exists briefing jsonb not null default '{}'::jsonb;
alter table public.clients add column if not exists briefing_answered_at timestamptz;
alter table public.clients add column if not exists briefing_doc_url text not null default '';
alter table public.clients add column if not exists briefing_shared_at timestamptz;

-- quem já era cliente não recebe boas-vindas
update public.clients set onboarding_status = 'antigo'
 where onboarding_status = 'novo' and created_at < '2026-11-25';

-- Briefing pelo link do cliente (sem senha): ler o que já foi respondido
create or replace function public.briefing_get(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare c public.clients;
begin
  c := public._portal_client(p_token);
  return json_build_object(
    'name', c.name, 'contact_name', c.contact_name, 'logo_url', c.logo_url,
    'email', c.email, 'whatsapp', c.whatsapp, 'instagram', coalesce(c.instagram, ''),
    'answers', c.briefing, 'answered_at', c.briefing_answered_at);
end;
$$;

-- Briefing pelo link do cliente: salvar respostas (pode reenviar para corrigir)
create or replace function public.briefing_submit(p_token text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c public.clients; first_time boolean;
begin
  c := public._portal_client(p_token);
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Respostas inválidas.' using errcode = '22023';
  end if;
  if octet_length(p_answers::text) > 60000 then
    raise exception 'Respostas muito longas.' using errcode = '22023';
  end if;
  first_time := c.briefing_answered_at is null;
  update public.clients
     set briefing = p_answers,
         briefing_answered_at = now(),
         briefing_shared_at = null,
         onboarding_status = case when onboarding_status = 'antigo' then 'antigo' else 'respondido' end
   where id = c.id;
  insert into public.activity_logs (client_id, type, actor, action_text)
  values (c.id, 'briefing', coalesce(nullif(c.contact_name, ''), c.name),
          case when first_time then 'Respondeu o briefing' else 'Atualizou o briefing' end);
end;
$$;

grant execute on function public.briefing_get(text)           to anon, authenticated;
grant execute on function public.briefing_submit(text, jsonb) to anon, authenticated;
