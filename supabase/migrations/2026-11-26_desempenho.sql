-- Aguiar&Co Aprova · Desempenho da equipe
-- A Kim vê o resumo do mês de cada pessoa (agendamentos, alterações, pedidos de texto, relatórios e
-- números, no prazo ou não) com uma mensagem pronta (parabéns ou alerta), revisa e envia.
-- A pessoa vê o recado no topo do Aprova (e por e-mail, se a Kim quiser).
-- Rode uma vez no Supabase (SQL Editor). Pode rodar de novo.

create table if not exists public.feedbacks (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  ref_month     text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tone          text not null default 'bom' check (tone in ('otimo', 'bom', 'atencao', 'neutro')),
  message       text not null check (char_length(message) between 1 and 4000),
  metrics       jsonb not null default '{}'::jsonb,
  sent_by       uuid references public.profiles (id) on delete set null,
  sent_by_name  text not null default '',
  email_sent_at timestamptz,
  seen_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists feedbacks_profile_idx on public.feedbacks (profile_id, created_at desc);

-- recado é pessoal: a pessoa vê o dela; quem tem a aba Desempenho (ou a dona) vê e envia todos
create or replace function public.can_feedback()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select p.owner or 'desempenho' = any(coalesce(p.sections, '{}')) from public.profiles p where p.id = auth.uid()), false);
$$;

alter table public.feedbacks enable row level security;
drop policy if exists "feedbacks read" on public.feedbacks;
create policy "feedbacks read" on public.feedbacks
  for select to authenticated using (profile_id = auth.uid() or public.can_feedback());
drop policy if exists "feedbacks insert" on public.feedbacks;
create policy "feedbacks insert" on public.feedbacks
  for insert to authenticated with check (public.can_feedback());
drop policy if exists "feedbacks update" on public.feedbacks;
create policy "feedbacks update" on public.feedbacks
  for update to authenticated using (profile_id = auth.uid() or public.can_feedback())
  with check (profile_id = auth.uid() or public.can_feedback());
drop policy if exists "feedbacks delete" on public.feedbacks;
create policy "feedbacks delete" on public.feedbacks
  for delete to authenticated using (public.can_feedback());
