# Regras comuns das skills reel-teresa-*

Lidas uma vez por sessão por todas as skills de edição dos reels da Teresa Mello. Mudou uma regra geral? Mude aqui, não em cada skill.

- Ferramentas: `edicao/` na raiz do repositório aguiarco-aprova (scripts em `edicao/scripts/`, fontes em `edicao/fontes/`, sons em `edicao/sons/`).
- Perfil: `edicao/perfis/teresa-melo/` (`identidade.md` explica, `estilo.json` são os números que o `compor.py` usa).
- Pasta de cada vídeo: no scratchpad da sessão, `<scratchpad>/<AAAA-MM-DD>_<nome>/`. Vídeo não vai para o git.
- Python: `python3 -I` ao rodar scripts sobre arquivos baixados. Transcrição: faster-whisper large-v3 (CPU).

## 1. Conversa e segurança
- Falar com a pessoa em português, curto, sem jargão. Ela não é técnica.
- Nunca mover, renomear ou apagar o original no Drive nem mudar o compartilhamento dele.
- Nunca sobrescrever uma entrega: `<nome>_final_v01.mp4`, `_v02`…
- Rede: o ambiente libera Drive, Hugging Face, Google Fonts, Openverse, Wikimedia, Flickr, Mixkit e Pixabay. Host novo bloqueado: pedir pelo ambiente, nunca contornar.

## 2. Estado do vídeo
`python3 edicao/scripts/estado.py <pasta> status` mostra onde o vídeo está. Mudar com `--etapa cortes=concluido`, `--set chave valor`, `--pendencia etapa "texto"`, `--resolver p01`, `--entrega arquivo`.
Status: `pendente`, `em_andamento`, `concluido`, `aguardando_aprovacao` (só no render final).

## 3. Revisão só no final
A pessoa escolheu revisar **só o vídeo pronto**. As etapas rodam em sequência, sem parar para aprovar, e cada uma confere o próprio trabalho antes de passar. Só se pergunta no meio quando faltar algo que só ela tem (vídeo inacessível, foto pessoal).
Na revisão, ela cita o tempo do vídeo final ("em 0:42 troca a foto") ou o id (`f03`, `d02`, `l015`, `sfx04`). Agrupar todos os pedidos e fazer **um** render novo.

## 4. Tempos
- Cortes (`edit.json`) ficam no tempo do vídeo **original**.
- Legenda, fotos, destaques e sons (`plano.json`) ficam no tempo do vídeo **cortado** (`corte_vNN.mp4`). Se o corte mudar, refazer legenda (transcrever de novo) e reposicionar os outros itens pela frase em que estavam.

## 5. Caderno de aprendizados (`edicao/aprendizados.md`)
Na revisão, toda correção ou preferência que vale para outros vídeos vira uma linha: `- [ ] <etapa> · <pedido, com contexto> · <dd/mm>`. "Tira essa frase" não entra (é só deste vídeo). Anotar não é mudar: as skills e o perfil só mudam quando a pessoa pedir "aplica os aprendizados" (ver a skill mestra).

## 6. Git
Mudança em skill, script ou perfil: commit e push no branch de trabalho. Vídeos, fotos baixadas e renders nunca entram no git.
