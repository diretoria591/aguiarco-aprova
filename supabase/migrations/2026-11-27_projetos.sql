-- Aguiar&Co Aprova · Projetos especiais (ex.: JAH Portugal, só Kim e Cintia)
-- Painel de tarefas (a fazer, em andamento, travado, já saiu), tarefas de cada pessoa,
-- movimentações, listas dentro da tarefa (ex.: influenciadores para contatar), rotinas
-- que se repetem e os e-mails do projeto lidos do Gmail da Kim (só leitura).
-- O Aprova NUNCA envia e-mail aqui: os botões abrem o Gmail de quem clicou.
-- Valores, mensalidades e pagamentos não entram nestas tabelas.
-- Os dados do projeto (nomes, e-mails, tarefas) NÃO ficam no repositório (ele é público):
-- são cadastrados direto no Supabase.
-- Rode uma vez no Supabase (SQL Editor). Pode rodar de novo.

-- quem vê a aba Projetos: a dona e quem tem 'projetos' nas permissões
create or replace function public.can_projetos()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select p.owner or 'projetos' = any(coalesce(p.sections, '{}')) from public.profiles p where p.id = auth.uid()), false);
$$;

alter table public.profiles add column if not exists tutorial_projetos_at timestamptz;

create table if not exists public.projetos (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  timezone      text not null default 'Europe/Lisbon',
  -- domínios dos e-mails que entram no projeto (ex.: cliente.com, parceiro.com)
  gmail_domains text[] not null default '{}',
  -- para quem vai o e-mail de entrega e o relatório de sexta
  client_name   text not null default '',
  report_to     text not null default '',
  report_cc     text not null default '',
  -- contatos para cobrar e entregar: [{ nome, email, cc }] (cc separado por vírgula)
  contatos      jsonb not null default '[]'::jsonb,
  -- rotinas: [{ key, title, owner, weekday (1=seg) | day (dia do mês), detail }]
  rotinas       jsonb not null default '[]'::jsonb,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.projeto_tarefas (
  id            uuid primary key default gen_random_uuid(),
  projeto_id    uuid not null references public.projetos (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 300),
  detail        text not null default '',
  owner_id      uuid references public.profiles (id) on delete set null,
  owner_name    text not null default '',
  -- a_fazer · andamento · travado (esperando resposta) · saiu (enviado, aprovado ou concluído)
  status        text not null default 'a_fazer' check (status in ('a_fazer', 'andamento', 'travado', 'saiu', 'cancelada')),
  due_date      date,
  -- travado: de quem estamos esperando e quando cobrar
  waiting_on    text not null default '',
  cobrar_em     date,
  kind          text not null default 'tarefa' check (kind in ('tarefa', 'rotina', 'ideia')),
  priority      text not null default 'media' check (priority in ('alta', 'media', 'baixa')),
  source        text not null default 'manual',
  source_url    text not null default '',
  link_url      text not null default '',
  -- só interno: não entra no relatório de sexta para o cliente
  internal      boolean not null default false,
  recur_key     text,
  done_at       timestamptz,
  done_by       text not null default '',
  created_by_name text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (projeto_id, recur_key)
);
create index if not exists projeto_tarefas_status_idx on public.projeto_tarefas (projeto_id, status, due_date);

-- movimentações: "toda movimentação ganha um comentário curto"
create table if not exists public.projeto_movs (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.projeto_tarefas (id) on delete cascade,
  author_name text not null default '',
  text        text not null check (char_length(text) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists projeto_movs_tarefa_idx on public.projeto_movs (tarefa_id, created_at);

-- itens dentro de uma tarefa (ex.: cada influenciador para contatar)
create table if not exists public.projeto_itens (
  id          uuid primary key default gen_random_uuid(),
  tarefa_id   uuid not null references public.projeto_tarefas (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 200),
  note        text not null default '',
  position    integer not null default 0,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     text not null default ''
);
create index if not exists projeto_itens_tarefa_idx on public.projeto_itens (tarefa_id, position);

-- e-mails do projeto lidos do Gmail (só cabeçalho e trecho; nunca a caixa inteira)
create table if not exists public.projeto_emails (
  id           uuid primary key default gen_random_uuid(),
  projeto_id   uuid not null references public.projetos (id) on delete cascade,
  gmail_id     text not null unique,
  thread_id    text not null,
  from_name    text not null default '',
  from_email   text not null default '',
  to_list      text not null default '',
  cc_list      text not null default '',
  subject      text not null default '',
  snippet      text not null default '',
  sent_at      timestamptz not null,
  -- in: veio do cliente/parceiros · out: saiu da Aguiar&Co
  direction    text not null check (direction in ('in', 'out')),
  dismissed_at timestamptz,
  dismissed_by text not null default '',
  tarefa_id    uuid references public.projeto_tarefas (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists projeto_emails_thread_idx on public.projeto_emails (projeto_id, thread_id, sent_at);

-- conexão com o Gmail (só leitura). Sem policies: só o servidor (service role) lê e grava.
create table if not exists public.projeto_gmail (
  projeto_id    uuid primary key references public.projetos (id) on delete cascade,
  account_email text not null default '',
  refresh_token text not null,
  last_sync_at  timestamptz,
  last_error    text not null default '',
  connected_by  text not null default '',
  connected_at  timestamptz not null default now()
);

alter table public.projetos        enable row level security;
alter table public.projeto_tarefas enable row level security;
alter table public.projeto_movs    enable row level security;
alter table public.projeto_itens   enable row level security;
alter table public.projeto_emails  enable row level security;
alter table public.projeto_gmail   enable row level security;

drop policy if exists "projetos access" on public.projetos;
create policy "projetos access" on public.projetos
  for all to authenticated using (public.can_projetos()) with check (public.is_owner());
drop policy if exists "projeto_tarefas access" on public.projeto_tarefas;
create policy "projeto_tarefas access" on public.projeto_tarefas
  for all to authenticated using (public.can_projetos()) with check (public.can_projetos());
drop policy if exists "projeto_movs access" on public.projeto_movs;
create policy "projeto_movs access" on public.projeto_movs
  for all to authenticated using (public.can_projetos()) with check (public.can_projetos());
drop policy if exists "projeto_itens access" on public.projeto_itens;
create policy "projeto_itens access" on public.projeto_itens
  for all to authenticated using (public.can_projetos()) with check (public.can_projetos());
drop policy if exists "projeto_emails access" on public.projeto_emails;
create policy "projeto_emails access" on public.projeto_emails
  for all to authenticated using (public.can_projetos()) with check (public.can_projetos());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projeto_tarefas') then
    alter publication supabase_realtime add table public.projeto_tarefas;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projeto_emails') then
    alter publication supabase_realtime add table public.projeto_emails;
  end if;
end $$;

-- Leitura do Gmail a cada 10 minutos: chama /api/projetos/sync no mesmo site dos avisos
-- (usa os segredos notify_dispatch_url e notify_webhook_secret do Vault).
create extension if not exists pg_cron;

create or replace function public._projetos_sync()
returns void language plpgsql security definer set search_path = public
as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := replace(v_url, '/api/notify/dispatch', '/api/projetos/sync'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body    := '{}'::jsonb
  );
exception when others then null;
end;
$$;
revoke all on function public._projetos_sync() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'projetos-gmail-sync';
select cron.schedule('projetos-gmail-sync', '*/10 * * * *', 'select public._projetos_sync();');
