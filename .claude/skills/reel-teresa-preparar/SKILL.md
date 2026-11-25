---
name: reel-teresa-preparar
description: "Baixa o vídeo da Teresa do Google Drive, confere se está inteiro e transcreve trecho a trecho para achar as retomadas. Use em /reel-teresa-preparar, como primeira etapa da /reel-teresa-melo."
---

# reel-teresa-preparar

Deixa o vídeo pronto para os cortes: original baixado, conferido e transcrito. Não corta nada.

- **Lê:** o link do estado (`origem`).
- **Escreve:** `<pasta>/video.<ext>`, `<pasta>/work/` (audio.wav, db.npy, regions.json, regions.txt, full.txt).
- **Próximo passo:** `reel-teresa-cortes`.

## Passo a passo
1. **Baixar:** pegue o id do link (`/file/d/<ID>/`) e baixe com
   `curl -sSL -o video.mp4 "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t"`.
   O conector do Drive só baixa até 10 MB: não serve para vídeo.
2. **Conferir:** se o download vier como `text/html` (página de login), o arquivo não está público. Explique à pessoa: no Drive, Compartilhar → Acesso geral → tocar no nome do domínio (a linha com a seta) → "Qualquer pessoa com o link" → Leitor. Se a opção não existir (empresa bloqueia), ela faz uma cópia numa conta pessoal com esse acesso. Nunca mudar o compartilhamento por conta própria.
3. `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of compact video.mp4`. Áudio e vídeo com a mesma duração; se diferirem, pedir o original da câmera.
4. **Modelo (só se faltar `/root/whisper-large-v3/model.bin`, ~3 GB):** baixar com curl, que retoma se cair (o download pelo Hugging Face trava e não sobrevive a um reinício do ambiente):
   ```bash
   M=/root/whisper-large-v3; mkdir -p $M; B=https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main
   for f in config.json preprocessor_config.json tokenizer.json vocabulary.json; do curl -sSL -o $M/$f $B/$f; done
   for i in $(seq 30); do curl -sSL -C - --speed-time 30 --speed-limit 50000 -o $M/model.bin $B/model.bin && break; done
   ```
5. **Língua da fala:** a Teresa grava em inglês ou em português. Ouça/transcreva 20 s primeiro se não souber, e grave `estado.py --set lingua en|pt`. Com a língua errada, o Whisper *traduz* em vez de transcrever (aconteceu no 1º vídeo).
   **Transcrever:** `FALA_LINGUA=<en|pt> python3 -I edicao/scripts/analyze.py <pasta>/video.mp4 <pasta>/work --model /root/whisper-large-v3` (alguns minutos em CPU; rodar em segundo plano).
6. Olhar um quadro (`ffmpeg -ss 20 -i video.mp4 -frames:v 1 f.jpg`) e anotar a altura do rosto (`estado.py --set rosto_y 0.49`): ela decide o centro do zoom e quanto a câmera desce nas fotos.
7. `estado.py <pasta> --etapa preparar=concluido`.

## Armadilhas
- O Whisper do arquivo inteiro "funde" frases repetidas. Por isso o `analyze.py` transcreve cada trecho sozinho: é o `regions.txt` que mostra as retomadas.
- Rede bloqueada para o Hugging Face (erro 403 do proxy): o host que falta aparece no erro; pedir a liberação pelo ambiente.

## Regras comuns
Leia `.claude/skills/reel-teresa-melo/regras-comuns.md` (uma vez por sessão).
