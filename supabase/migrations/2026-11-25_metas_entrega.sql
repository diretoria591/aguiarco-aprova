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
