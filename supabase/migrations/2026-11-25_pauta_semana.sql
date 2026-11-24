-- Aguiar&Co Aprova · Pautas do mês diluídas aos sábados
-- Cada cliente recorrente tem um sábado fixo do mês (1 a 4) para receber a pauta do mês seguinte.
-- Clientes novos recebem um grupo automaticamente (o que tiver menos clientes) pela rotina de sábado.
alter table public.clients add column if not exists pauta_semana smallint check (pauta_semana between 1 and 4);
with r as (
  select id, (row_number() over (order by lower(name)) - 1) % 4 + 1 as g
  from public.clients where client_type <> 'pontual'
)
update public.clients c set pauta_semana = r.g from r where r.id = c.id and c.pauta_semana is null;
