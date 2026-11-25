-- Aguiar&Co Aprova · Cobrança das rodadas extras
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar de novo sem problema.
--
-- Clientes do Brasil: as rodadas extras do mês são somadas na próxima mensalidade do Asaas
-- (mesmo vencimento), com a descrição dos pedidos. Clientes da Europa: a dona da conta cobra pelo Wise
-- e marca como cobrado no Aprova. Só a dona da conta gera cobranças (conferido no servidor).

alter table public.clients add column if not exists billing_region text not null default 'brasil';
alter table public.clients drop constraint if exists clients_billing_region_check;
alter table public.clients add constraint clients_billing_region_check check (billing_region in ('brasil', 'europa'));
-- valor de uma rodada extra só deste cliente (vazio = padrão da região: R$ 30 / € da Europa)
alter table public.clients add column if not exists extra_round_price numeric(10, 2);
-- cliente correspondente no Asaas (cus_...)
alter table public.clients add column if not exists asaas_customer_id text not null default '';

-- Uma cobrança de rodadas extras por cliente e mês
create table if not exists public.extra_charges (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  ref_month        text not null check (ref_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- pedidos de alteração (comments.id) cobrados
  comment_ids      uuid[] not null default '{}',
  rounds           int not null default 0,
  unit_price       numeric(10, 2) not null default 0,
  currency         text not null default 'BRL' check (currency in ('BRL', 'EUR')),
  total            numeric(10, 2) not null default 0,
  -- cobrando (em andamento) → mensalidade | avulsa (Asaas) | wise (Europa, marcado à mão) | falhou
  status           text not null default 'cobrando' check (status in ('cobrando', 'mensalidade', 'avulsa', 'wise', 'falhou')),
  asaas_payment_id text not null default '',
  asaas_due_date   date,
  asaas_invoice_url text not null default '',
  -- valor da mensalidade antes de somar as extras (para conferir ou desfazer no Asaas)
  previous_value   numeric(10, 2),
  error            text not null default '',
  charged_by       text not null default '',
  charged_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (client_id, ref_month)
);

alter table public.extra_charges enable row level security;
drop policy if exists "team full access extra_charges" on public.extra_charges;
create policy "team full access extra_charges" on public.extra_charges
  for all to authenticated using (public.is_team()) with check (public.is_team());
