-- Aguiar&Co Aprova · Permissões por pessoa
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo.
--
-- owner: a dona da conta. Vê tudo, usa o "Ver como" e é a única que muda funções e permissões.
-- sections: abas que a pessoa vê (null = padrão da função). Valores: clientes, agendamento,
--   roteiros, cobrar, numeros, relatorios, lembretes, rodadas, equipe.
-- Observação: as permissões escondem e bloqueiam as páginas; os dados continuam com acesso da equipe no banco.

alter table public.profiles add column if not exists owner boolean not null default false;
alter table public.profiles add column if not exists sections text[];

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select p.owner from public.profiles p where p.id = auth.uid()), false); $$;

-- Ninguém muda função, abas ou dona pela API, a não ser a dona (o SQL Editor continua podendo).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.sections is distinct from old.sections or new.owner is distinct from old.owner)
     and auth.uid() is not null and not public.is_owner() then
    raise exception 'Só a dona da conta pode mudar funções e permissões da equipe.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop policy if exists "admin updates profiles" on public.profiles;
drop policy if exists "owner updates profiles" on public.profiles;
create policy "owner updates profiles" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Ponto de partida (a dona ajusta na aba Equipe)
update public.profiles set owner = true, sections = null where email = 'diretoria@aguiareco.com.br';
update public.profiles set sections = array['clientes','agendamento','roteiros','cobrar','lembretes'] where email = 'supervisao@aguiareco.com.br' and sections is null;
update public.profiles set sections = array['relatorios','numeros','lembretes'] where email = 'contatorenata11@gmail.com' and sections is null;
update public.profiles set sections = array['agendamento','roteiros','numeros'] where email = 'socialmedia@aguiareco.com.br' and sections is null;
