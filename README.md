# Aguiar&Co · Aprova

Plataforma de aprovação de conteúdo da Aguiar&Co — Next.js 16 (App Router), Tailwind CSS 4 e Supabase.

- **Painel da equipe** (`/login`, `/dashboard`): clientes, envio de peças (carrossel com vários arquivos), conversa, novas versões, aviso por WhatsApp/e-mail e o feed **Movimento dos clientes** em tempo real.
- **Área do cliente** (`/aprovar/[token]`): link exclusivo, sem senha. O cliente vê as peças, navega pelo carrossel, lê a legenda, aprova com 1 clique, pede alterações ou comenta.

## 1. Configurar o Supabase (uma vez)

1. **SQL Editor → New query** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Isso cria tabelas, RLS, funções da área do cliente, o bucket público `approvals-media` e liga o Realtime.
   Depois rode, **na ordem do nome**, cada arquivo de [`supabase/migrations/`](supabase/migrations) (todos podem ser rodados de novo sem problema).
2. **Authentication → Sign In / Providers** → desative **Allow new users to sign up**.
   (Só a equipe tem login; o cliente entra pelo link.)
3. **Authentication → Users → Add user → Create new user** → e-mail e senha da primeira pessoa da equipe, marcando **Auto Confirm User**.
   Se quiser o nome certo no painel, depois rode no SQL Editor:
   `update profiles set name = 'Seu Nome' where email = 'seu@email.com';`
4. **Project Settings → API**: copie a *Project URL* e a *anon public key*.

## 2. Rodar localmente

Edite `.env.local` com as duas chaves (modelo em `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

```bash
npm install
npm run dev
```

Abra http://localhost:3000 → entra em `/login`.

Opcional: `SUPABASE_SERVICE_ROLE_KEY` (somente servidor) libera adicionar/remover pessoas em **Equipe**. Sem ela, crie acessos pelo painel do Supabase.

## 3. Publicar (GitHub + Vercel)

```bash
git remote add origin https://github.com/SEU-USUARIO/aguiarco-aprova.git
git push -u origin main
```

Na Vercel: **Add New → Project → Import** o repositório → em **Environment Variables** adicione
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (ex.: `https://aprova.aguiareco.com.br`) e, se quiser, `SUPABASE_SERVICE_ROLE_KEY` → **Deploy**.

Depois, no Supabase: **Authentication → URL Configuration → Site URL** = o domínio da Vercel.

## Agendamento (fila da Eduarda)

Quando o cliente aprova um post pelo link, ele aparece sozinho na aba **Agendamento**, separado por cliente, com cada material identificado (vídeo, capa, telas do carrossel) e botão para baixar. A pessoa marca **Agendado** e depois **Cliente avisado**; as duas ações ficam em "Movimento dos clientes".

- **Funções** (`profiles.role`): `admin` e `team` veem tudo; `scheduler` vê só a aba Agendamento e, pelo banco, só consegue marcar Agendado / Cliente avisado. Só um admin muda funções (página Equipe).
- **"Ajustado e agendado"**: aprova sem voltar ao cliente e manda para a fila com uma ressalva (o último pedido do cliente + recado opcional), para ajustes que só dá para fazer na hora de agendar (ex.: música).
- **Área da beleza**: no cadastro do cliente, escolha a área e informe o Instagram. No envio, informe (opcional) o @ da profissional que aparece. A fila mostra o lembrete de marcação.
- **Aviso por e-mail** quando o cliente aprova: o banco anota o aviso (`notification_outbox`, 1 por aprovação, sem duplicar) e chama `POST /api/notify/dispatch` via `pg_net`; o servidor envia pela Resend. Falhas ficam em `activity_logs` e são tentadas de novo (até 3 vezes) no próximo disparo. A aprovação do cliente nunca depende do aviso.

Configuração (uma vez, depois da migration `2026-11-23_agendamento.sql`):

1. Vercel → Environment Variables: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `SCHEDULER_EMAIL`, `NOTIFY_WEBHOOK_SECRET` (texto longo aleatório) e `NEXT_PUBLIC_SITE_URL` → Redeploy.
2. Supabase → SQL Editor (não salve no repositório, ele é público):
   ```sql
   select vault.create_secret('https://SEU-DOMINIO/api/notify/dispatch', 'notify_dispatch_url');
   select vault.create_secret('O-MESMO-NOTIFY_WEBHOOK_SECRET', 'notify_webhook_secret');
   update profiles set role = 'admin'     where email = 'email-da-kimberly';
   update profiles set role = 'scheduler' where email = 'email-da-eduarda';
   ```
3. Vídeos no Google Drive: compartilhe como "Qualquer pessoa com o link" para o botão de download funcionar direto.

## Segurança

| Quem | O que acessa |
| --- | --- |
| Equipe autenticada (tem linha em `profiles`) | Tudo (RLS `is_team()`) |
| Cliente com o link | Só lê o próprio cliente, peças, mídias e comentários — o token vai no cabeçalho `x-client-token` e as policies filtram por ele |
| Cliente (escrita) | Só pelas funções `portal_*` (`SECURITY DEFINER`), que validam o token e a peça antes de gravar e registram o `activity_logs` |
| Qualquer outra pessoa | Nada. Storage: leitura pública só por URL; envio/remoção só equipe |

- Tokens de 64 caracteres hexadecimais (~244 bits aleatórios). "Gerar novo link" invalida o anterior na hora.
- Uploads vão direto do navegador para o Supabase Storage (sem o limite de 4,5 MB da Vercel), com barra de progresso real. Limite exibido: `NEXT_PUBLIC_MAX_UPLOAD_MB` (padrão 50 MB, o limite do plano Free).
- Datas exibidas no fuso `America/Sao_Paulo` (mude com `NEXT_PUBLIC_TIMEZONE`).

## Estrutura

```
supabase/schema.sql              banco, RLS, funções, storage, realtime
src/proxy.ts                     protege /dashboard (sessão Supabase)
src/app/login                    login da equipe
src/app/dashboard                painel, página do cliente, equipe
src/app/aprovar/[token]          área do cliente
src/components                   UI compartilhada (modal, toasts, visualizador, timeline)
src/lib                          clientes Supabase, upload, formatação, tipos
```

## Cobrar hoje

Aba **Cobrar hoje** no painel: clientes com conteúdo aguardando aprovação há mais de 2 dias, ou com publicação em até 3 dias (urgente).
Um clique abre o WhatsApp do cliente com o lembrete pronto e registra a cobrança; o cliente sai da lista e volta em 2 dias (1 se urgente) se ainda não respondeu.
O número ao lado da aba mostra quantos clientes estão para cobrar.

## Fechamento do mês (e-mail no dia 1)

Todo dia 1, às 8h (horário de Brasília), a Vercel Cron chama `/api/fechamento` e envia por e-mail as **rodadas extras do mês anterior por cliente**, para ajustar a cobrança.
Configure na Vercel: `FECHAMENTO_EMAIL` (quem recebe), `CRON_SECRET` (senha longa) e as mesmas `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM` e `SUPABASE_SERVICE_ROLE_KEY` dos avisos.
O agendamento está em [`vercel.json`](vercel.json).

Para testar sem esperar o dia 1 (troque o domínio e a senha):

```bash
# só ver o e-mail, sem enviar
curl -H "Authorization: Bearer SEU_CRON_SECRET" "https://SEU-DOMINIO/api/fechamento?mes=2026-11&preview=1" > fechamento.html
# enviar de verdade
curl -H "Authorization: Bearer SEU_CRON_SECRET" "https://SEU-DOMINIO/api/fechamento?mes=2026-11"
```

## Relatórios mensais

Aba **Relatórios**: um relatório por cliente e mês, para a reunião de desempenho. Rode [`supabase/migrations/2026-11-25_relatorios.sql`](supabase/migrations/2026-11-25_relatorios.sql) uma vez.

- **Números do Instagram:** a social media preenche na aba **Números** (todos os clientes do mês numa tela, com o valor do mês anterior ao lado), até o dia 3. Eles entram no relatório e na apresentação; a estrategista faz a leitura estratégica.
- **Datas:** dia 1 o rascunho chega; **prazo até o dia 5** para os relatórios ficarem prontos; dia 4 sai um lembrete com o que ainda está em rascunho. A estrategista marca a reunião com cada cliente (botão **Marcar reunião**).
- No dia 1 o rascunho do mês anterior é preparado (textos de resumo, destaques e próximos passos) e a estrategista recebe o aviso por e-mail.
- Na página do relatório dá para editar os textos, digitar os números do Instagram (até a API da Meta entrar) e **Marcar como pronto**.
- **Baixar PDF** abre a impressão do navegador já no formato A4: escolha "Salvar como PDF". Campos vazios não aparecem no PDF.
- Cada post pode ser marcado como **Performou** ou **Não performou**; eles aparecem nas seções próprias, junto com a **Estratégia do mês**.
- Depois de **Marcar como pronto**, a apresentação editável é gerada no Google Slides (dias úteis, 11h47 e 16h47), compartilhada com a estrategista e o link aparece no relatório. "Gerar de novo" pede uma nova versão.
  A geração usa [`scripts/apresentacao.sql`](scripts/apresentacao.sql) e [`scripts/apresentacao.py`](scripts/apresentacao.py) (`pip install python-pptx pillow`).
- **Posts de outras plataformas** (ex.: Aprova Job) ficam na tabela `posts_externos` ([migration](supabase/migrations/2026-11-25_posts_externos.sql)) e entram só nos relatórios e apresentações: não aparecem no link do cliente nem na fila de agendamento. Novembro/2026 foi importado da planilha do Aprova Job.
- Nada vai para o cliente automaticamente.

## Menu e avisos do mês

- Menu lateral à esquerda no computador; no celular abre pelo botão ☰.
- Do dia 1 ao 10 aparece a aba **Números** (com quantos clientes faltam) e um aviso no topo, só para quem tem a tarefa:
  a social media vê "preencha hoje os números" (dias 1 a 3) e a equipe vê o andamento dos relatórios (dias 1 a 5).

## Permissões por pessoa e "Ver como"

Rode [`supabase/migrations/2026-11-25_permissoes.sql`](supabase/migrations/2026-11-25_permissoes.sql) uma vez.

- **Dona da conta** (`profiles.owner`): vê todas as abas, é a única que muda funções e permissões (o banco recusa de qualquer outra pessoa) e tem o seletor **Ver como** no topo para abrir o painel de qualquer pessoa da equipe sem senha. O que ela faz no "Ver como" fica registrado no nome dela.
- **Demais pessoas**: veem só as abas marcadas em **Equipe → Vê** (`profiles.sections`). Páginas fora da lista redirecionam para a primeira aba liberada.
- As permissões controlam o painel; no banco os dados continuam acessíveis para a equipe.
