-- Aguiar&Co Aprova · Contrato de cada cliente (para o lembrete de renovação)
-- A rotina de segunda avisa a dona da conta 30 dias antes do fim do contrato, com o resumo das entregas.
alter table public.clients add column if not exists contract_start date;
alter table public.clients add column if not exists contract_end date;
alter table public.clients add column if not exists contract_value text not null default '';
alter table public.clients add column if not exists contract_doc_url text not null default '';
alter table public.clients add column if not exists contract_notified_at timestamptz;
