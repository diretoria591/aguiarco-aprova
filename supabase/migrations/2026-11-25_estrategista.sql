-- Aguiar&Co Aprova · Estrategista responsável por cliente
-- Pautas, relatórios e lembretes do cliente vão para a estrategista dele. Cada estrategista vê só os próprios
-- clientes em Relatórios; a dona da conta vê todos.
alter table public.clients add column if not exists strategist_id uuid references public.profiles (id) on delete set null;

update public.clients set strategist_id = (select id from public.profiles where email = 'socialmedia@aguiareco.com.br')
 where lower(name) like 'teresa mello%' and strategist_id is null;
update public.clients set strategist_id = (select id from public.profiles where email = 'contatorenata11@gmail.com')
 where client_type <> 'pontual' and strategist_id is null;

update public.profiles set sections = array_append(sections, 'relatorios')
 where email = 'socialmedia@aguiareco.com.br' and not ('relatorios' = any(coalesce(sections, '{}')));
