-- Aguiar&Co Aprova · Acesso previsto
-- Quando a dona combina antes as abas de alguém (ex.: só "projetos"), o perfil já nasce assim
-- no cadastro pela aba Equipe, sem ver nada da equipe por engano. O e-mail fica só no Supabase.
create table if not exists public.acesso_previsto (
  email    text primary key,
  sections text[] not null,
  nickname text not null default ''
);
alter table public.acesso_previsto enable row level security;
drop policy if exists "owner manages acesso_previsto" on public.acesso_previsto;
create policy "owner manages acesso_previsto" on public.acesso_previsto
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create or replace function public.apply_acesso_previsto()
returns trigger language plpgsql security definer set search_path = public
as $$
declare a public.acesso_previsto;
begin
  select * into a from public.acesso_previsto where email = lower(coalesce(new.email, ''));
  if found then
    new.sections := a.sections;
    if a.nickname <> '' then new.nickname := a.nickname; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_acesso_previsto on public.profiles;
create trigger profiles_acesso_previsto before insert on public.profiles
  for each row execute function public.apply_acesso_previsto();
