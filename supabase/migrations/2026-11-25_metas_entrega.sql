-- Aguiar&Co Aprova · Termômetro de entregas: metas mensais de cada cliente (do contrato)
-- meta_posts_min/max: conteúdos de feed por mês (min = max quando o contrato diz um número fechado;
-- min 0 quando o contrato diz "até"). meta_videos_min: vídeos/Reels por mês, quando o contrato pede.
alter table public.clients add column if not exists meta_posts_min integer check (meta_posts_min >= 0);
alter table public.clients add column if not exists meta_posts_max integer check (meta_posts_max >= 0);
alter table public.clients add column if not exists meta_videos_min integer check (meta_videos_min >= 0);
alter table public.clients add column if not exists meta_obs text not null default '';

-- o João (supervisão) vê a aba Entregas
update public.profiles set sections = array_append(sections, 'entregas')
 where email = 'supervisao@aguiareco.com.br' and not ('entregas' = any(coalesce(sections, '{}')));

-- Quem acompanha as entregas do cliente (além da dona da conta, que vê todos)
alter table public.clients add column if not exists delivery_supervisor_id uuid references public.profiles (id) on delete set null;
update public.clients set delivery_supervisor_id = (select id from public.profiles where email = 'supervisao@aguiareco.com.br')
 where name in ('ESPAÇO HI BELEZA', 'Espaço Hi Saude', 'Ellen Amadi', 'Oper Lead') and delivery_supervisor_id is null;

-- Entregas informadas à mão (ex.: itens enviados por outra plataforma sem detalhes): contam só no termômetro
create table if not exists public.entregas_manuais (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  ref_month   text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  quantidade  integer not null check (quantidade >= 0),
  nota        text not null default '',
  created_at  timestamptz not null default now(),
  unique (client_id, ref_month)
);
alter table public.entregas_manuais enable row level security;
drop policy if exists "team full access entregas_manuais" on public.entregas_manuais;
create policy "team full access entregas_manuais" on public.entregas_manuais
  for all to authenticated using (public.is_team()) with check (public.is_team());
