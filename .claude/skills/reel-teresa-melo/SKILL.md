---
name: reel-teresa-melo
description: "Edita um reel falado da Teresa Mello no estilo completo: cortes (sem erros e pausas), legenda verde em português com a tradução em inglês embaixo, fotos na metade de cima enquanto ela fala, palavras-chave em destaque e efeitos sonoros. Mostra em que etapa o vídeo está e conduz as etapas até o MP4 final. Use em /reel-teresa-melo, quando mandarem um vídeo da Teresa (link do Drive) para editar nesse estilo, ou para retomar ou revisar um vídeo dela. Também aplica os aprendizados (/reel-teresa-melo aprendizados)."
---

# reel-teresa-melo

Fluxo: preparar → cortes → legenda → visuais (fotos e destaques) → sons → render

Antes de tudo, leia `regras-comuns.md` (nesta pasta), uma vez por sessão.
Diferente da `edicao-reels-falados` (vídeo limpo, sem legenda): aqui o vídeo **sempre** tem legenda PT/EN, fotos e destaques.

## /reel-teresa-melo [link ou pasta]
1. **Vídeo novo** (veio um link): crie a pasta do vídeo e o estado (`estado.py <pasta> iniciar <link>`) e comece pela `reel-teresa-preparar`.
2. **Vídeo em andamento:** rode `estado.py <pasta> status` e mostre em 2–3 linhas onde parou e as pendências.
3. **Conduzir:** a pessoa revisa só o final, então siga as etapas em ordem, abrindo a skill de cada uma (`reel-teresa-<etapa>`) e seguindo as instruções dela, sem pedir aprovação entre elas. Dê uma linha de andamento a cada etapa ("cortes prontos: 2:02 → 1:31; agora a legenda").
4. **Revisão do final:** os pedidos voltam para a etapa certa (corte → cortes; texto da legenda → legenda; foto ou destaque → visuais; som → sons). Junte tudo e faça um render novo.
5. **Bloqueio** (vídeo sem acesso, host de rede bloqueado): explique em linguagem simples o que a pessoa precisa fazer.

## /reel-teresa-melo aprendizados
1. Ler as linhas `- [ ]` de `edicao/aprendizados.md`.
2. Propor onde cada uma entra: gosto (cores, tamanhos, posição, quantidade) vai para `edicao/perfis/teresa-melo/`; ofício vai para a skill da etapa; o que vale para todas vai para `regras-comuns.md`.
3. A pessoa filtra. Gravar só o aprovado, marcar a linha (`[x] → onde entrou`), fazer commit e push.

## Regras
- Uma pergunta por vez quando precisar perguntar, com opções e a sugestão primeiro.
- Nunca mover, renomear ou apagar o vídeo original.
