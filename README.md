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

## Onboarding de cliente novo

Rode [`supabase/migrations/2026-11-25_onboarding.sql`](supabase/migrations/2026-11-25_onboarding.sql) uma vez.

1. A equipe cadastra o cliente (nome, e-mail, WhatsApp).
2. A rotina de onboarding (a cada hora, das 8h às 20h) cria a pasta do cliente no Drive (Briefing, Materiais, Relatórios), manda o e-mail de boas-vindas com o link do briefing e avisa a equipe.
3. O cliente responde o briefing em `/briefing/<token>` (mesmo token do link de aprovação, sem senha). As perguntas ficam em [`src/lib/briefing.ts`](src/lib/briefing.ts).
4. A rotina salva as respostas como Google Doc na pasta do cliente e manda para a equipe. Na página do cliente aparecem as etapas, a pasta, o link do briefing e as respostas.

**Tipo de cliente** (no cadastro): *recorrente* (mensal) passa por tudo; *pontual* (vídeo ou posts avulsos) fica só com o link de aprovação e o Cobrar hoje, sem onboarding, números ou relatórios.

Clientes cadastrados antes do onboarding ficam como "antigo": não recebem nada, mas dá para mandar o briefing pelo botão na página deles.

## Estrategista responsável

No cadastro de cliente recorrente escolhe-se a **estrategista responsável** (`clients.strategist_id`). Pautas, relatórios, lembretes e avisos de números prontos desse cliente vão para ela; em Relatórios cada estrategista vê só os próprios clientes (a dona da conta vê todos). Migration: [`2026-11-25_estrategista.sql`](supabase/migrations/2026-11-25_estrategista.sql).

## Termômetro de entregas

Aba **Entregas**: para cada cliente recorrente, a meta mensal do contrato (`clients.meta_posts_min/max`, `meta_videos_min`) × o que foi aprovado no mês (Aprova + posts_externos), com o que está em aprovação à parte e o esperado até hoje. Status: em dia, atenção (abaixo de 90% do ritmo), atrasado (abaixo de 70%) e acima do contrato (passou do máximo). A dona da conta vê todos; quem acompanha as entregas (`delivery_supervisor_id`) vê só os seus. Aviso fixo no topo do Aprova para quem acompanha entregas (ex.: João) e e-mail toda segunda (na reta final do mês, "falta conteúdo de…").

## Pedidos de alteração (Alterações e Minhas demandas)

Quando o cliente pede alteração, o pedido aparece na aba **Alterações** (Kim e quem tiver a aba, como o João), separado por cliente.

1. **Para encaminhar:** escolha quem altera primeiro e, se precisar, quem altera depois (opcional), com o prazo de cada pessoa. O Aprova sugere o próximo dia de entrega da pessoa e avisa quando o prazo cai num dia em que ela não entrega, num fim de semana, no dia da publicação ou depois dele ("Tudo bem, seguir assim" confirma).
2. A pessoa recebe um e-mail (Resend) e vê o pedido em **Minhas demandas**, também por cliente. Ela troca só o que o cliente pediu. A versão fica guardada em `alteracao_media`/`alteracoes.plan` e **o cliente não vê nada**. Quando a primeira pessoa termina, o pedido passa sozinho para a segunda (com e-mail).
3. **Para revisar:** antes e depois, o recado de cada pessoa e o pedido do cliente. Basta uma pessoa clicar em **Tudo certo, enviar ao cliente**: a versão entra no conteúdo (nova versão, aguardando aprovação). **Voltar para…** devolve para uma das pessoas com recado (e-mail).

Quem faz alterações e os dias e horário de entrega ficam na aba **Equipe** (linha "Alterações"). Ninguém entrega no sábado nem no domingo. Tabelas: `supabase/migrations/2026-11-26_alteracoes.sql`.

## Pedidos de texto (roteiro, copy, legenda, texto)

- **Kim e João** pedem em **Roteiros → Pedir roteiro ou copy** (`/dashboard/roteiros/pedidos`): tipo (roteiro de vídeo, copy, legenda ou texto), cliente (opcional fora roteiro), para qual material, quem faz, quantos, **prazo para receber** (obrigatório) e briefing. A pessoa recebe por e-mail e em **Minhas demandas → Para escrever**. Ao entregar, quem pediu recebe um e-mail. Em **Para revisar**: ajustar o texto, **Enviar para o cliente** (cada texto vira um material de texto no link de aprovação, marcado `is_roteiro`: fica fora de Agendamento, termômetro e relatórios), **Recebido, não enviar** (para usar num material) ou **Pedir ajuste**. Prazo vencido aparece no aviso do topo e no menu da Kim e do João.
- **Entre a equipe**: em Minhas demandas, **Pedir … para alguém** — o pedido não passa pela revisão; volta para quem pediu em **Pedidos que eu fiz** (Recebido / Pedir ajuste / Cancelar).
- **Demandas fixas** (roteiros do contrato): cliente, quem escreve, quantos, prazo no dia X. No mês corrente o Aprova cria sozinho o pedido dos roteiros do mês seguinte, uma vez só.
- Quem aparece em "quem faz" é marcado na aba Equipe (**Escreve roteiros e textos**). Migration: `2026-11-26_pedidos_roteiro.sql`.

## Desempenho da equipe

Aba **Desempenho** (`/dashboard/desempenho`, só a dona; libere para outra pessoa na aba Equipe). Para cada pessoa, no mês atual ou nos dois anteriores: agendamentos (no prazo = até o próximo dia de entrega da pessoa depois da aprovação e antes da publicação), alterações e pedidos de texto (até o prazo combinado, e os abertos com prazo vencido), relatórios (dia 5) e números (dia 3). O Aprova sugere a mensagem — parabéns, bom com pontos de atenção ou alerta — e a Kim ajusta e envia: a pessoa vê o recado no topo do Aprova até clicar em "Li, obrigada!" (e por e-mail, se marcado). Também dá para copiar para o WhatsApp. Recados ficam na tabela `feedbacks` (cada pessoa só lê os dela). Migration: `2026-11-26_desempenho.sql`.

## Projetos especiais (ex.: JAH Portugal)

Aba **Projetos** (`/dashboard/projetos`): só a dona e quem tem a aba liberada na Equipe. Abas: **Agora**, **Painel** (a fazer · em andamento · travado/esperando resposta · já saiu), **Minhas tarefas** (o que cada pessoa tem que fazer), **E-mails** e **Relatório de sexta**.

- Cada tarefa tem responsável e prazo, botões **Em andamento**, **Feito** e **Travou**, lista de itens (ex.: influenciadores para contatar) e movimentações. **Feito** pergunta o próximo passo: e-mail de entrega (abre o Gmail já escrito e a tarefa vai para "Travado · esperando o cliente", com data para cobrar em 2 dias úteis), reunião (abre a Agenda), mandar para a Kim aprovar ou só concluir.
- **O Aprova não envia e-mail nesta área**: todo botão abre o Gmail de quem clicou.
- **Rotinas** (stories toda segunda, relatório de sexta, marcos do mês) ficam em `projetos.rotinas` e viram tarefa sozinhas.
- **Tutorial** no primeiro acesso de quem não é a dona (botão "Como funciona" para rever).
- Dados do projeto (contatos, tarefas) ficam só no Supabase, nunca no repositório. Valores e pagamentos não entram.

### Gmail (só leitura)

O Gmail da Kim é lido a cada 10 minutos (pg_cron → `POST /api/projetos/sync`, com os mesmos segredos do Vault dos avisos). Entram só e-mails dos domínios do projeto (`projetos.gmail_domains`); guarda remetente, assunto, data e um trecho. Conversa em que a última mensagem veio do cliente aparece em "Precisa de resposta".

Configuração (uma vez):
1. Google Cloud → novo projeto → **APIs e serviços → Biblioteca** → ative a **Gmail API**.
2. **Tela de consentimento OAuth** → tipo **Interno** (conta Google Workspace da agência).
3. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web** → URI de redirecionamento: `https://SEU-DOMINIO/api/projetos/gmail/callback`.
4. Vercel → Environment Variables: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` → Redeploy.
5. No Aprova, aba **E-mails** do projeto → **Conectar o Gmail** (só a dona). Migration: `2026-11-27_projetos.sql`.
