-- Aguiar&Co Aprova · aba Lembretes (calendário de datas e campanhas)
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema.
--
-- Cada lembrete pertence a um mês (ref_month, "AAAA-MM"). A aba Lembretes mostra, a partir do
-- mês anterior, o que acontece no mês seguinte para a equipe já planejar com antecedência.

create table if not exists public.lembretes (
  id          uuid primary key default gen_random_uuid(),
  ref_month   text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  event_day   date,
  title       text not null check (char_length(title) between 1 and 200),
  theme       text not null default '',
  description text not null default '',
  client_label text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.lembretes enable row level security;
drop policy if exists "team full access lembretes" on public.lembretes;
create policy "team full access lembretes" on public.lembretes
  for all to authenticated using (public.is_team()) with check (public.is_team());

-- Calendário Espaço HI · dez/2026 a jun/2027 (só entra se a tabela estiver vazia)
insert into public.lembretes (ref_month, event_day, title, theme, description, client_label, sort_order)
select * from (values
  ('2026-12', null::date,     'Festas de fim de ano',    'Produções de Fim de Ano', '', 'Espaço HI', 1),
  ('2026-12', date '2026-12-25', 'Natal',                '', 'Conteúdo institucional e oportunidade de trabalhar vouchers ou experiências presenteáveis, caso disponíveis.', 'Espaço HI', 2),
  ('2026-12', date '2026-12-31', 'Réveillon',            '', 'Reforçar agenda e produções para a virada, conectando beleza, autocuidado e início de um novo ciclo.', 'Espaço HI', 3),
  ('2027-01', null,           'Verão e férias',          'Projeto Verão HI', 'Cuidados com os fios no verão, recuperação pós-praia/piscina, tratamentos e Micro Mist.', 'Espaço HI', 1),
  ('2027-01', null,           'Início de ano',           'Renovação de visual', 'Transformações, cores, cortes e Mermaid para trabalhar o desejo de começar o ano com um novo visual.', 'Espaço HI', 2),
  ('2027-02', null,           'Carnaval',                'Carnaval HI', 'Produções para Carnaval, cabelos, unhas e olhar, com abertura antecipada da agenda.', 'Espaço HI', 1),
  ('2027-02', null,           'Verão',                   'Cuidados de verão', 'Manter conteúdos de proteção, tratamento e recuperação dos fios durante a estação.', 'Espaço HI', 2),
  ('2027-03', date '2027-03-08', 'Dia da Mulher',        'Semana da Mulher HI', 'Campanha de conexão e experiência, valorizando clientes, profissionais e mulheres que fazem parte do HI.', 'Espaço HI', 1),
  ('2027-03', null,           'Mês da Mulher',           'Histórias e comunidade', 'Conteúdos mais humanos, histórias reais e fortalecimento do relacionamento com a comunidade HI.', 'Espaço HI', 2),
  ('2027-04', null,           'Outono',                  'Temporada de renovação', 'Tratamentos, cronograma capilar, mudança de cor e recuperação dos fios após o verão.', 'Espaço HI', 1),
  ('2027-04', null,           'Páscoa',                  '', 'Ação de relacionamento no espaço e conteúdo institucional para a data.', 'Espaço HI', 2),
  ('2027-05', date '2027-05-09', 'Dia das Mães',         'Experiência HI para Mães', 'Vouchers, experiências mãe e filha e possibilidades de pacotes especiais.', 'Espaço HI', 1),
  ('2027-05', null,           'Mês das Noivas',          'Especial Noivas HI', 'Produções para noivas, mães e madrinhas: cabelo, unhas, olhar e preparação para eventos.', 'Espaço HI', 2),
  ('2027-06', date '2027-06-12', 'Dia dos Namorados',    'Um momento para você', 'Autocuidado, experiências e oportunidade de trabalhar vouchers/presentes.', 'Espaço HI', 1),
  ('2027-06', null,           'Inverno',                 'Cuidados de inverno', 'Tratamentos de recuperação, hidratação e cuidados específicos para os fios no frio.', 'Espaço HI', 2)
) as v(ref_month, event_day, title, theme, description, client_label, sort_order)
where not exists (select 1 from public.lembretes);
