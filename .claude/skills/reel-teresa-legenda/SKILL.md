---
name: reel-teresa-legenda
description: "Cria a legenda do reel da Teresa: português da fala em cima, na caixa verde, e a tradução em inglês embaixo, na caixa clara, em blocos de 3 a 5 palavras sincronizados com a fala. Use em /reel-teresa-legenda, após a reel-teresa-cortes."
---

# reel-teresa-legenda

Gera os blocos de legenda (texto e tempo) do vídeo cortado. O desenho (cores, fonte, posição) é do perfil e é aplicado no render.

- **Lê:** `<pasta>/work/edit_audio.wav` (áudio do corte), `edicao/perfis/teresa-melo/identidade.md`.
- **Escreve:** `<pasta>/work/palavras.json`, `<pasta>/legendas.json`.
- **Próximo passo:** `reel-teresa-visuais`.

## Passo a passo
1. `python3 -I edicao/scripts/palavras.py <pasta>/work/edit_audio.wav <pasta>/work/palavras.json --model /root/whisper-large-v3 --lingua <en|pt>` (tempo por palavra no tempo do corte).
2. `python3 -I edicao/scripts/blocos.py <pasta>/work/palavras.json <pasta>/legendas.json` (blocos de até 5 palavras que cabem na largura).
0. **Línguas:** o português fica sempre em cima (caixa verde) e o inglês embaixo. A fala dela vai para o campo da língua em que ela falou (`pt` ou `en`); o outro campo é a tradução. O `blocos.py` põe o texto falado em `pt`: se ela falou inglês, mova para `en` e traduza para `pt`.
3. **Revisar o texto falado** de cada bloco, lendo o `legendas.json`: grafia correta, nomes próprios e termos de saúde (a Teresa é farmacêutica: nomes de substâncias, sintomas, suplementos). O texto é o que ela falou: corrige-se a grafia, nunca o conteúdo. Muletas que sobraram no corte ("né", "tá") podem sair da legenda.
4. **Traduzir** cada bloco para a outra língua. Tradução natural, como um nativo diria, mas que acompanhe o bloco (o inglês aparece junto com o português daquele trecho). Se uma frase se dividir em dois blocos, divida a tradução no ponto equivalente. Termos técnicos com o nome usado em inglês.
5. **Conferir largura:** nenhum bloco em inglês pode ser bem mais longo que o português (a caixa não pode passar de ~900 px). Se passar, encurte a tradução ou divida o bloco em dois (dividindo o tempo pela palavra do meio em `palavras.json`).
6. Maiúscula só no começo de frase e em nomes. Sem ponto final no fim do bloco; interrogação e exclamação ficam.
7. `estado.py <pasta> --etapa legenda=concluido`.

## Revisão
Por id (`l014 corrige para ...`) ou pelo tempo do vídeo final (é o mesmo tempo do corte).

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
