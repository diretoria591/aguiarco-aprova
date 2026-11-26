/**
 * Scanner de destaques: monta os destaques a partir de uma pasta do Drive.
 *
 * Estrutura esperada (é como a equipe já organiza):
 *   Destaques/                 ← link colado
 *     Bastidores/              ← 1 pasta = 1 destaque (nome = título)
 *       1.jpg, 2.mov, 3.jpg    ← stories, na ordem do número
 *       Bastidores.png         ← arquivo sem número = capa
 *
 * Texto entre parênteses no nome do story vira aviso na revisão
 * (ex.: "2 (aguardando cidade natal).jpg").
 *
 * Sem imports de runtime: dá para testar com `node` direto.
 */
import type { ScanFile } from './scanner';

export type DriveEntry = { id: string; name: string; folder: boolean };
export type HighlightState = 'ok' | 'raw' | 'dup';
export type ScanHighlight = {
  key: string;
  folderId: string;
  /** nome da pasta, limpo (sem numeração na frente) */
  name: string;
  title: string;
  stories: ScanFile[];
  cover: ScanFile | null;
  /** outros arquivos sem número (podem ser a capa) */
  coverOptions: ScanFile[];
  state: HighlightState;
  why: string;
  /** avisos (story com observação, capa incerta…) */
  flags: string[];
};

const VIDEO_EXT = /\.(mp4|mov|m4v|avi|webm|mkv)$/i;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const stripExt = (s: string) => s.replace(/\.[a-z0-9]{2,5}$/i, '');

/** Número do story no começo do nome ("2 (obs).jpg" → 2, "story 3.mp4" → 3). */
export function storyNumber(name: string): number | null {
  const m = stripExt(name).trim().match(/^(?:story|stories|st)?\s*[-_#]?\s*(\d{1,3})(?!\d)/i);
  return m ? Number(m[1]) : null;
}

/** Observação entre parênteses no nome do arquivo. */
export function noteOf(name: string): string {
  return stripExt(name).match(/\(([^)]+)\)/)?.[1]?.trim() ?? '';
}

/** Tira a numeração do começo do nome da pasta ("01 - Bastidores" → "Bastidores"). */
export function cleanName(name: string): string {
  return name.trim().replace(/^\d{1,3}\s*[-_.)]\s*/, '').trim() || name.trim();
}

const natural = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

export function buildHighlight(folder: { id: string; name: string }, entries: DriveEntry[]): ScanHighlight {
  const name = cleanName(folder.name);
  const files = entries.filter((e) => !e.folder).map(({ id, name: n }) => ({ id, name: n.trim() }));
  const subfolders = entries.filter((e) => e.folder);
  const flags: string[] = [];

  const numbered = files.filter((f) => storyNumber(f.name) !== null)
    .sort((a, b) => storyNumber(a.name)! - storyNumber(b.name)! || natural(a.name, b.name));
  const loose = files.filter((f) => storyNumber(f.name) === null).sort((a, b) => natural(a.name, b.name));

  // capa: arquivo sem número que se chama "capa" ou tem o nome do destaque
  const isImage = (f: ScanFile) => !VIDEO_EXT.test(f.name);
  const looksCover = (f: ScanFile) => {
    const n = fold(stripExt(f.name));
    return /\bcapa\b|cover|icone|icon/.test(n) || n === fold(name) || n === fold(folder.name);
  };
  let cover = loose.find((f) => isImage(f) && looksCover(f)) ?? null;
  let stories = numbered;
  let rest = loose.filter((f) => f !== cover);

  if (!numbered.length && rest.length) {
    // ninguém numerou: usa a ordem do nome e avisa
    stories = rest;
    rest = [];
    flags.push('Os stories não têm número: usei a ordem do nome dos arquivos. Confira a sequência.');
  } else if (!cover && rest.length) {
    const imgs = rest.filter(isImage);
    if (imgs.length === 1) { cover = imgs[0]; rest = rest.filter((f) => f !== cover); }
  }
  if (rest.length) flags.push(`Arquivo sem número ficou de fora: ${rest.map((f) => f.name).join(', ')}`);
  if (!cover) flags.push('Não achei a capa. Escolha a capa antes de enviar.');

  // números repetidos ou pulados
  const nums = numbered.map((f) => storyNumber(f.name)!);
  const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dup.length) flags.push(`Tem mais de um arquivo com o número ${Array.from(new Set(dup)).join(', ')}.`);
  const max = nums.length ? Math.max(...nums) : 0;
  const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !nums.includes(n));
  if (missing.length && missing.length <= 5) flags.push(`Falta o story ${missing.join(', ')} na sequência.`);

  stories.forEach((f, i) => {
    const note = noteOf(f.name);
    if (note) flags.push(`Story ${i + 1}: ${note}`);
  });
  if (subfolders.length) flags.push(`Subpasta não lida: ${subfolders.map((f) => f.name.trim()).join(', ')}`);

  const empty = !stories.length;
  return {
    key: folder.id,
    folderId: folder.id,
    name,
    title: `Destaque · ${name}`,
    stories,
    cover,
    coverOptions: rest.filter(isImage),
    state: empty ? 'raw' : 'ok',
    why: empty ? 'Pasta sem stories' : `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}${cover ? ' + capa' : ''}`,
    flags,
  };
}
