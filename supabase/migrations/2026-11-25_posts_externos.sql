-- Aguiar&Co Aprova · Posts publicados fora do Aprova (ex.: Aprova Job), só para os relatórios
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo.
-- Não aparecem no link do cliente nem na fila de agendamento: entram só nos relatórios mensais.

create table if not exists public.posts_externos (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  publish_date date not null,
  title        text not null default '',
  caption      text not null default '',
  format       text not null default 'outro',   -- foto | carrossel | reels | video | outro
  format_label text not null default '',        -- como veio da origem, ex.: "Carrossel (5)"
  image_url    text not null default '',
  approved_on  date,
  source       text not null default 'Aprova Job',
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists posts_externos_client_idx on public.posts_externos (client_id, publish_date);
alter table public.posts_externos enable row level security;
drop policy if exists "team full access posts_externos" on public.posts_externos;
create policy "team full access posts_externos" on public.posts_externos
  for all to authenticated using (public.is_team()) with check (public.is_team());
