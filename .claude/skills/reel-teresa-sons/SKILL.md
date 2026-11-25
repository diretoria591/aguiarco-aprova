---
name: reel-teresa-sons
description: "Põe efeitos sonoros curtos (whoosh, pop) na entrada das fotos e dos destaques do reel da Teresa, bem abaixo da voz. Use em /reel-teresa-sons, após a reel-teresa-visuais."
---

# reel-teresa-sons

Decide onde entra cada som e qual. Sem música.

- **Lê:** `<pasta>/visuais.json`, a biblioteca `edicao/sons/` (com `edicao/sons/indice.json`).
- **Escreve:** `<pasta>/sons.json`.
- **Próximo passo:** `reel-teresa-render`.

## Ofício (tendência, não regra)
- **O som segue o que se vê.** Entra foto: whoosh curto, com o pico no frame em que a foto aparece (como a foto entra em corte seco, o whoosh começa ~0,15 s antes). Entra destaque: pop curto, começando no frame dele. Saída de foto: em geral sem som.
- **Pouco:** um som por evento, nunca dois no mesmo instante. Nada nos cortes comuns (jump cuts são para ser invisíveis).
- **Variação:** não repetir o mesmo arquivo em ~20 s; alternar entre as variações de cada tipo.
- **Nível:** bem abaixo da voz. Ponto de partida: whoosh −20 dB, pop −18 dB (o `compor.py` aplica `db` como ganho sobre o arquivo). Ajusta pelo feedback.

## Biblioteca
- `edicao/sons/<tipo>/` (whoosh, pop, clique), com `indice.json`: arquivo, duração, tempo até o pico, fonte e licença.
- Fontes gratuitas com licença de uso livre: Mixkit (assets.mixkit.co) e Pixabay (cdn.pixabay.com). Conferir a licença na página do som.
- Som novo: baixar, cortar o silêncio do começo, normalizar o pico em −3 dBFS, salvar em WAV 48 kHz, medir o tempo até o pico e anotar no índice. Os sons entram no git (são pequenos e reaproveitados em todo vídeo).

## sons.json
```json
[{"id": "sfx01", "t": 6.05, "arquivo": "edicao/sons/whoosh/w01.wav", "db": -20, "evento": "f01"}]
```
`t` é o início do som no tempo do corte (já descontado o tempo até o pico).

`estado.py <pasta> --etapa sons=concluido`.

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
