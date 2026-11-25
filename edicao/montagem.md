# Montagem do fluxo de edição

Fase atual: 6 (teste no primeiro vídeo da Teresa) · Atualizado em 2026-11-25

## Ambiente
- Sistema: Linux (sessão na nuvem do Claude Code) · Python: 3.13 · FFmpeg: 6.1 · Node.js: 22 · GPU: não
- Instalado nesta montagem: nada ainda (falta faster-whisper)
- Bloqueio: a rede não libera drive.usercontent.google.com (download de vídeo do Drive) nem o Instagram

## Decisões
- Revisão: vídeo pronto (MP4), ajustes por mensagem
- Tipo e formato: Reels falado, pessoa para a câmera, vertical 9:16, 1 a 3 min
- Pastas: ferramentas neste repositório, em `edicao/` (scripts, perfil, montagem) e skills em `.claude/skills/`
- Transcrição: Whisper local (faster-whisper), grátis
- Notas faladas: não usa por enquanto
- Fotos: quadro na metade de cima, ela continua aparecendo embaixo. Fonte das fotos: bancos gratuitos de licença livre, banco do Canva e imagens geradas por IA (Canva). Aprovação de cada uma antes de montar
- Legenda: ela fala em português; português em cima, inglês (tradução) embaixo. Estilo: copiar o reel de referência (falta print)
- Câmera: base é a skill edicao-reels-falados (zoom seco de 5% em 3 a 4 ênfases)
- Estilos: a skill antiga (edicao-reels-falados, vídeo limpo) continua. A nova sempre tem legenda PT/EN, fotos e destaques, além dos sons
- Destaques: palavra-chave grande na tela, com animação curta, nas frases de impacto
- Som: efeitos sonoros curtos (whoosh, pop, clique) na entrada de fotos e destaques; sem música. Biblioteca: gratuita de licença livre (Pixabay, Mixkit), montada aos poucos em edicao/sons/, por tipo
- Revisões: só o vídeo final (tudo feito de uma vez); ajustes por mensagem
- Nomes: skill mestra /reel-teresa-melo (pedido: "Reel - TERESA MELO"); etapas com prefixo reel-teresa-

## Perfil
- teresa-melo: identidade.md + estilo.json confirmados (legenda no peito, nunca no pescoço)

## Fluxo aprovado
1. preparar — baixa do Drive, confere, transcreve
2. cortes — regras da edicao-reels-falados + zoom seco
3. legenda — PT da fala + tradução EN, blocos de 3–5 palavras
4. visuais — fotos na metade de cima + palavras-chave em destaque
5. sons — whoosh/pop na entrada de fotos e destaques
6. render — compor.py, MP4 final (revisão só aqui)

## Skills escritas (em .claude/skills/)
- [x] regras comuns e skill mestra /reel-teresa-melo
- [x] reel-teresa-preparar, -cortes, -legenda, -visuais, -sons, -render
- Scripts em edicao/scripts/: compor.py, palavras.py, blocos.py e estado.py (testados num trecho de 4 s) + os da edicao-reels-falados

## Próximo passo
1º vídeo (Video 1_nov 2026) entregue em 25/11 como Teresa_Video1_final_v01.mp4. Aguardando a revisão; depois, aplicar os aprendizados e fechar (fase 7).
