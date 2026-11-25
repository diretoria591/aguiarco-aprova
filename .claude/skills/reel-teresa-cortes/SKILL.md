---
name: reel-teresa-cortes
description: "Corta o reel da Teresa: tira pausas, respirações, tentativas e repetições mantendo sempre a última versão da frase, e aplica o zoom seco de 5% em 3 a 4 ênfases. Use em /reel-teresa-cortes, após a reel-teresa-preparar."
---

# reel-teresa-cortes

Entrega o vídeo cortado (`corte_vNN.mp4`), ainda sem legenda, fotos ou sons. As regras de corte são as mesmas da skill `edicao-reels-falados`: **leia a seção "Regras editoriais da cliente" e os passos 2 a 6 de lá** e siga, com as diferenças abaixo.

- **Lê:** `<pasta>/work/regions.txt` e `full.txt`, `rosto_y` do estado.
- **Escreve:** `<pasta>/edit.json`, `<pasta>/corte_vNN.mp4`, `<pasta>/work/segments.json`, `<pasta>/work/edit_audio.wav`.
- **Próximo passo:** `reel-teresa-legenda`.

## Diferenças em relação à edicao-reels-falados
- Scripts em `edicao/scripts/` (`analyze.py`, `probe.py`, `render.py`, `verify.py`, cópias dos da skill original).
- `anchor` do zoom: `[0.5, rosto_y]`.
- **Zoom e destaque não coincidem:** escolha as ênfases do zoom pensando que as palavras-chave em destaque (etapa visuais) também caem em frases de impacto. Zoom em 3–4 momentos; os destaques podem cair nos mesmos momentos, porque um reforça o outro.
- Saída: `python3 -I edicao/scripts/render.py <pasta>/video.mp4 <pasta>/work <pasta>/edit.json <pasta>/corte_v01.mp4`.

## Conferir (obrigatório, porque a pessoa só vê o final)
`verify.py` e leitura da transcrição final inteira: nenhuma frase repetida, nenhuma palavra comida, nenhuma frase sem sentido. A primeira versão quase sempre tem 2 ou 3 ajustes: corrija e renderize de novo antes de seguir.
Anote no estado as aparas duvidosas (ex.: "Bom..." solto, um CTA que parecia regravação) com `--set duvidas_cortes "[...]"`, para contar no resumo final.

`estado.py <pasta> --set corte "corte_v01.mp4" --etapa cortes=concluido`.

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
