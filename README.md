# Aguiar&Co · Aprova

Plataforma de aprovação de conteúdo da Aguiar&Co — Next.js 16 (App Router), Tailwind CSS 4 e Supabase.

- **Painel da equipe** (`/login`, `/dashboard`): clientes, envio de peças (carrossel com vários arquivos), conversa, novas versões, aviso por WhatsApp/e-mail e o feed **Movimento dos clientes** em tempo real.
- **Área do cliente** (`/aprovar/[token]`): link exclusivo, sem senha. O cliente vê as peças, navega pelo carrossel, lê a legenda, aprova com 1 clique, pede alterações ou comenta.

## 1. Configurar o Supabase (uma vez)

1. **SQL Editor → New query** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Isso cria tabelas, RLS, funções da área do cliente, o bucket público `approvals-media` e liga o Realtime.
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
