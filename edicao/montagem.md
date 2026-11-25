# Montagem do fluxo de edição

Fase atual: 3 (referências, aguardando confirmação do perfil) · Atualizado em 2026-11-25

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
- teresa-melo: identidade.md escrito (legenda PT/EN e fotos), a partir de 2 prints. Falta confirmar com a pessoa.

## Fluxo aprovado
<falta>

## Skills escritas
- [ ] regras comuns

## Próximo passo
Fase 3: receber prints ou gravação de tela do reel de referência (legenda) e analisar.
