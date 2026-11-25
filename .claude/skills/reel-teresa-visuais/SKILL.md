---
name: reel-teresa-visuais
description: "Escolhe onde entram as fotos (na metade de cima, com a Teresa falando embaixo) e as palavras-chave em destaque, e busca ou gera as imagens (bancos gratuitos, banco do Canva ou IA). Use em /reel-teresa-visuais, após a reel-teresa-legenda."
---

# reel-teresa-visuais

Planeja e consegue os visuais: fotos e destaques. Não renderiza.

- **Lê:** `<pasta>/legendas.json` (o texto com tempos), `edicao/perfis/teresa-melo/identidade.md`.
- **Escreve:** `<pasta>/fotos/fNN.jpg`, `<pasta>/visuais.json` (fotos e destaques), `<pasta>/creditos.txt`.
- **Próximo passo:** `reel-teresa-sons`.

## Ofício (tendência, não regra)
- **Fotos ilustram o que ela está dizendo naquele instante:** a coisa concreta (um alimento, um sintoma, um gesto do dia a dia), nunca uma ideia abstrata. Começam na palavra que a anuncia e **ficam bastante tempo: de 5 a 8 s cada** (pedido em 25/11: "deixa mais tempo as fotos aparecendo"), indo até o fim da ideia.
- **Variar as fotos** (pedido em 25/11): não repetir o mesmo tipo seguido. Alternar close de objeto/alimento, pessoa em situação do dia a dia, ambiente/lugar, mão fazendo algo, vista de cima. Variar também luz (dia, noite, interna, externa) e enquadramento.
- **Legenda e rosto:** se ela se enquadrou mais baixo (rosto abaixo do meio), suba nada e desça a legenda no `plano.json` (`legenda_y`, ex. 1600 no 3º vídeo), sempre abaixo do queixo.
- **Quantidade:** em 1–2 min, de 7 a 10 fotos; somadas, as fotos cobrem cerca de metade do vídeo. Gancho (primeiros 3 s) e CTA final ficam com ela em tela cheia: o rosto prende a atenção e o pedido final precisa dela.
- Entre duas fotos, pelo menos ~1,5 s dela em tela cheia, ou troca direta de uma foto para outra quando a ideia continua.
- **Destaques:** de 3 a 5 por vídeo, nas frases de impacto (o gancho, a tese, a virada, a frase final). De 1 a 3 palavras, em MAIÚSCULAS, a palavra que a pessoa lembraria ("INFLAMAÇÃO", "3 SINAIS", "INTESTINO"). Ficam 1,2–2 s, começando na palavra.
- Destaque e foto ao mesmo tempo: evitar. Se acontecer, o render põe o destaque na borda de baixo da foto.

## Buscar as imagens
Ordem das fontes, para cada foto (registrar a fonte e a licença em `creditos.txt`):
1. **Openverse** (`https://api.openverse.org/v1/images/?q=<termo em inglês>&license_type=commercial&page_size=20`): bancos com licença aberta (Wikimedia, Flickr). Só baixar de hosts liberados (upload.wikimedia.org, live.staticflickr.com). Preferir CC0 e CC BY; CC BY pede crédito na descrição do post.
2. **IA do Canva** (`mcp__Canva__generate-image`, `aspectRatio: LANDSCAPE_3_2`): no 1º vídeo deu fotos muito melhores que os bancos abertos (que vêm com pouca opção e qualidade irregular). A imagem que volta da geração é só uma miniatura (200 px). Para a resolução cheia: `create-design` com as imagens geradas em `references` ("uma foto por página, sangrando, sem texto", formato `Presentation (16:9)`), depois `export-design` em JPG 1920 px e `curl` de cada link (host export-download.canva.com, liberado). Os links expiram em poucas horas. **Confira cada foto exportada** (folha de contato): com muitas imagens num design só (9 no 3º vídeo), o Canva fez colagens com moldura e repetiu a mesma foto em várias páginas. O que funcionou: **um design por foto** (uma referência por `create-design`), todos em paralelo. Foto realista, luz natural, tons quentes, **sem texto na imagem**, sem rostos famosos, sem logotipos. Vertical ou horizontal tanto faz: o render corta para 1080x710.
3. **Pixabay** (cdn.pixabay.com liberado), quando houver um link direto.

Critérios para escolher: realista (não ilustração, salvo pedido), combina com o tom quente do perfil, o assunto aparece claro numa faixa larga e baixa (1080x710), sem marca d'água, sem texto. Abra a imagem e olhe antes de aceitar.
Recorte: `foco_y` (0 a 1) diz qual altura da imagem fica no meio da faixa.

## visuais.json
```json
{"fotos": [{"id": "f01", "a": 6.2, "b": 9.0, "arquivo": "fotos/f01.jpg", "foco_y": 0.45, "frase": "...", "fonte": "openverse CC0"}],
 "destaques": [{"id": "d01", "a": 1.1, "b": 2.6, "texto": "INFLAMAÇÃO", "frase": "..."}]}
```
Tempos no tempo do corte, tirados de `legendas.json` / `work/palavras.json` (início da palavra que anuncia).

`estado.py <pasta> --etapa visuais=concluido`.

## Regras
- Nada de imagem sem licença clara. Na dúvida, gerar no Canva.
- Foto pessoal da Teresa ou de pacientes: só se ela mandar.

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
