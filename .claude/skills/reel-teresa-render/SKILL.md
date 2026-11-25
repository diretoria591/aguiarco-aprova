---
name: reel-teresa-render
description: "Monta o MP4 final do reel da Teresa: corte + fotos + destaques + legenda PT/EN + sons, confere e entrega para revisão. Use em /reel-teresa-render, após a reel-teresa-sons, ou para gerar uma versão nova depois da revisão."
---

# reel-teresa-render

Junta tudo num vídeo só e entrega.

- **Lê:** `corte_vNN.mp4`, `legendas.json`, `visuais.json`, `sons.json`, `rosto_y` do estado, `edicao/perfis/teresa-melo/estilo.json`.
- **Escreve:** `<pasta>/plano.json`, `<pasta>/<nome>_final_vNN.mp4`.

## Passo a passo
1. Montar `plano.json` juntando: `rosto_y`, `legendas` (de `legendas.json`), `fotos` e `destaques` (de `visuais.json`, caminhos absolutos), `sons` (de `sons.json`).
2. **Rascunho primeiro:** `python3 -I edicao/scripts/compor.py <corte> <plano> <pasta>/rascunho.mp4 --rascunho`. Tire um quadro em cada foto, em 2 destaques e em 3 legendas, e olhe: rosto visível embaixo da foto, legenda sem cobrir a boca, nada saindo da tela, inglês legível.
3. **Final:** a mesma linha sem `--rascunho`, saída `<nome>_final_vNN.mp4` (nunca sobrescrever).
4. Conferir: `ffprobe` (1080x1920, duração igual à do corte), volume da voz preservado e os sons audíveis, mas baixos.
5. Entregar com SendUserFile. Acima de 10 MB o conector do Drive não sobe: diga isso se ela quiser no Drive.
6. `estado.py <pasta> --entrega <arquivo> --etapa render=aguardando_aprovacao`.

## Resumo para a pessoa (curto, para leiga)
Duração antes e depois; retomadas que saíram (citando a frase que ficou); as fotos (tempo e o que mostram) e os destaques; aparas duvidosas para ela confirmar; créditos de imagem que precisam ir na descrição do post.

## Revisão
Ela cita o tempo do vídeo final ou o id. Mandar cada pedido para a etapa certa (ver a skill mestra), juntar tudo, novo render `_vNN+1`. Toda preferência que vale para outros vídeos vai para `edicao/aprendizados.md`. Aprovado: `--etapa render=concluido`.

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
