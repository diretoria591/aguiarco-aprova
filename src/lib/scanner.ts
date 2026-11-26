/**
 * Scanner do calendário: lê o Markdown que o Google Docs exporta
 * (docs.google.com/document/d/<id>/export?format=md) e monta os posts.
 *
 * O calendário de cada cliente é escrito à mão, então a leitura é tolerante:
 * cada post começa por uma data (dd/mm) e tem campos como Formato, Material,
 * Capa, Card N e Legenda. O que o scanner não tiver certeza vira aviso na revisão.
 *
 * Sem imports de runtime: dá para testar com `node` direto.
 */
import type { PostFormat } from './types';

export type ScanFile = { id: string; name: string; folder?: boolean };
export type ScanState = 'ok' | 'raw' | 'gone' | 'fix' | 'dup';
export type ScanPost = {
  key: string;
  /** AAAA-MM-DD */
  date: string;
  format: PostFormat;
  formatText: string;
  title: string;
  caption: string;
  media: ScanFile[];
  cover: ScanFile | null;
  coverOptions: ScanFile[];
  state: ScanState;
  /** Por que ficou nesse estado (mostrado na revisão). */
  why: string;
  flags: string[];
  /** Status escrito no doc (ex.: "aprovado — agendado dia 12/11"). */
  docStatus: string;
};
export type ScanResult = { title: string; month: string; posts: ScanPost[]; files: ScanFile[] };

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const FORMAT_LABEL: Record<PostFormat, string> = {
  foto: 'Foto', video: 'Vídeo', reels: 'Reels', carrossel: 'Carrossel', arte: 'Arte', stories: 'Stories', destaque: 'Destaque', texto: 'Texto',
};

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');

/** Id de um arquivo ou pasta do Drive a partir do link. */
export function driveRef(url: string): { id: string; folder: boolean } | null {
  let m = url.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/);
  if (m) return { id: m[1], folder: true };
  m = url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) || url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/)
    || url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([\w-]{10,})/);
  if (m) return { id: m[1], folder: false };
  return null;
}

type Link = { text: string; url: string };
type Line = { text: string; links: Link[]; bold: boolean; hr: boolean };

/** Tira a marcação do Markdown de uma linha e separa os links. */
function cleanLine(raw: string): Line {
  let s = raw.replace(/ /g, ' ');
  const hr = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(s);
  s = s.replace(/~~[\s\S]*?~~/g, ''); // texto riscado não vale
  const links: Link[] = [];
  // [texto](url) — o texto pode ter colchetes escapados
  s = s.replace(/\[((?:\\.|[^\]\\])*)\]\((\S+?)\)/g, (_, t: string, u: string) => {
    const text = t.replace(/\\(.)/g, '$1').replace(/\*+/g, '').trim();
    links.push({ text, url: u.replace(/\\(.)/g, '$1') });
    return text;
  });
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u: string) => { links.push({ text: u, url: u }); return u; });
  const t0 = s.trim();
  const bold = /^\*\*[\s\S]+\*\*$/.test(t0) || /^#{1,6}\s/.test(t0);
  s = s.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*[*-]\s+(?=\S)/, '').replace(/\*+/g, '');
  s = s.replace(/\\(.)/g, '$1').replace(/[ \t]+/g, ' ').trim();
  return { text: s, links, bold, hr };
}

const FIELD_RE = /^(formato|materia(?:l|is)|capa|legenda|copy|texto(?: do v[ií]deo| da arte)?|card\s*\d+|inspira[cç][aã]o|tema|op[cç][oõ]es|link do conte[uú]do|status|final|arte final|v[ií]deo final)\b\s*(?:\(([^)]*)\))?\s*:{0,2}\s*(.*)$/i;
const DATE_RE = /^(?:post\s+)?(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])(.*)$/i;

type Field = { name: string; lines: Line[] };
type Block = { day: number; month: number; head: Line; pre: Line[]; fields: Field[] };

function fieldKey(label: string): string {
  const f = fold(label).replace(/\s+/g, ' ');
  if (f.startsWith('card')) return `card${f.replace(/\D/g, '')}`;
  if (f.startsWith('materia') || f === 'link do conteudo') return 'material';
  if (f === 'final' || f === 'arte final' || f.startsWith('video final')) return 'final';
  if (f.startsWith('texto') || f === 'copy') return 'copy';
  if (f.startsWith('inspira')) return 'inspiracao';
  if (f.startsWith('op')) return 'opcoes';
  return f;
}

/** Junta as linhas do doc em blocos, um por post (cada um começa por uma data). */
function blocks(md: string): { title: string; blocks: Block[] } {
  const lines = md.split(/\r?\n/).map(cleanLine);
  const out: Block[] = [];
  let title = '';
  let cur: Block | null = null;
  let field: Field | null = null;
  for (const ln of lines) {
    if (ln.hr) { field = null; continue; }
    if (!ln.text && !ln.links.length) { if (field) field.lines.push(ln); continue; }
    const d = ln.text.match(DATE_RE);
    const rest = d?.[3] ?? '';
    const looksHead = d && +d[1] >= 1 && +d[1] <= 31 && +d[2] >= 1 && +d[2] <= 12 && ln.text.length <= 260
      && (ln.bold || /^\s*([-–—|(:>]|$)/.test(rest) || /^post\s/i.test(ln.text));
    if (looksHead) {
      // "POST 06/11 – carrossel" logo depois da data é só um subtítulo do mesmo post
      if (cur && /^post\s/i.test(ln.text) && !cur.fields.length) { cur.pre.push(ln); continue; }
      cur = { day: +d![1], month: +d![2], head: ln, pre: [], fields: [] };
      out.push(cur);
      field = null;
      continue;
    }
    if (!cur) { if (!title) title = ln.text; continue; }
    const f = ln.text.match(FIELD_RE);
    if (f) {
      field = { name: fieldKey(f[1]), lines: [] };
      const first = { ...ln, text: [f[2] ? `(${f[2]})` : '', f[3]].filter(Boolean).join(' ').trim() };
      if (first.text || first.links.length) field.lines.push(first);
      cur.fields.push(field);
      continue;
    }
    if (field) field.lines.push(ln);
    else cur.pre.push(ln);
  }
  return { title, blocks: out };
}

function detectMonth(title: string, md: string, today: Date): string {
  const head = fold(`${title}\n${md.slice(0, 400)}`);
  const idx = MONTHS.findIndex((m) => head.includes(m));
  const cm = today.getMonth() + 1;
  if (idx < 0) return `${today.getFullYear()}-${pad(cm)}`;
  const m = idx + 1;
  let y = today.getFullYear();
  if (m - cm > 6) y -= 1;
  if (cm - m > 6) y += 1;
  return `${y}-${pad(m)}`;
}

function toFormat(text: string, hasCards: boolean, media: ScanFile[]): PostFormat {
  const f = fold(text);
  if (/destaque|highlight/.test(f)) return 'destaque';
  if (/reel/.test(f)) return 'reels';
  if (/carross|carousel/.test(f)) return 'carrossel';
  if (/stor/.test(f)) return 'stories';
  if (/estatic|arte|post unico|antes e depois/.test(f)) return 'arte';
  if (/foto/.test(f)) return 'foto';
  if (/video/.test(f)) return 'video';
  if (hasCards) return 'carrossel';
  if (media.some((m) => isVideoName(m.name))) return 'reels';
  return 'arte';
}

export const isVideoName = (n: string) => /\.(mp4|mov|m4v|avi|webm|mkv)$/i.test(n);
const EDIT_RE = /edit|audio|camera lenta|musica|face ?app|cortar|melhorar|tratar|colocar|adicionar|incluir|legendar|acelerar|lettering|trilha/;

const fileOf = (l: Link): ScanFile | null => {
  const r = driveRef(l.url);
  if (!r) return null;
  return { id: r.id, name: l.text && !/^https?:/.test(l.text) ? l.text : (r.folder ? 'Pasta do Drive' : 'Arquivo do Drive'), ...(r.folder ? { folder: true } : {}) };
};
const filesIn = (ls: Line[]) => ls.flatMap((l) => l.links.map(fileOf).filter((x): x is ScanFile => !!x));
const textOf = (ls: Line[]) => ls.map((l) => l.text).join('\n').replace(/\n{3,}/g, '\n\n').trim();

function classifyStatus(s: string): { state: ScanState | null; why: string } {
  const f = fold(s);
  if (/declin|descartad|cancelad|nao vai (mais )?(sair|postar)/.test(f)) return { state: 'gone', why: 'O doc diz que esse post foi descartado' };
  if (/postad|postamos|postei|publicad/.test(f)) return { state: 'gone', why: 'O doc diz que já foi postado' };
  if (/agendad|programad/.test(f)) return { state: 'gone', why: 'O doc diz que já foi agendado' };
  if (/reprovad/.test(f)) return { state: 'fix', why: 'O doc diz que foi reprovado' };
  if (/em altera|alterar|alteracao|ajust/.test(f)) return { state: 'fix', why: 'O doc diz que está em alteração' };
  if (/\baprovad/.test(f)) return { state: 'gone', why: 'O doc diz que já foi aprovado' };
  return { state: null, why: '' };
}

/** Lê o Markdown do calendário. `today` só serve para descobrir o ano. */
export function parseCalendar(md: string, today = new Date()): ScanResult {
  const { title, blocks: bs } = blocks(md);
  const month = detectMonth(title, md, today);
  const [by, bm] = month.split('-').map(Number);
  const all = new Map<string, ScanFile>();
  const posts: ScanPost[] = bs.map((b, i) => {
    const get = (k: string) => b.fields.filter((f) => f.name === k).flatMap((f) => f.lines);
    const flags: string[] = [];
    const headRest = b.head.text.replace(DATE_RE, '$3').replace(/^\s*[-–—|:>]+\s*/, '').trim();
    const docStatus = [headRest, ...b.pre.map((l) => l.text), textOf(get('status'))].filter(Boolean).join(' · ');

    // formato e instruções depois do "|"
    const fmtLine = textOf(get('formato')).split('\n')[0] ?? '';
    const [fmtWord, ...instr] = fmtLine.split('|');
    const instruction = instr.join('|').replace(/https?:\/\/\S+/g, '').trim();

    const cardKeys = Array.from(new Set(b.fields.map((f) => f.name).filter((n) => n.startsWith('card'))));
    const cards = cardKeys.map((k) => ({ k, files: filesIn(get(k)).filter((f) => !f.folder) }));
    const finalFiles = filesIn(get('final'));
    const material = filesIn(get('material'));
    const copyFiles = filesIn(get('copy')).filter((f) => !f.folder);
    let media: ScanFile[] = finalFiles.length ? finalFiles
      : material.length ? material
      : cards.some((c) => c.files.length) ? cards.flatMap((c) => c.files)
      : copyFiles;
    // tira repetidos (mesmo link duas vezes)
    const seen = new Set<string>();
    const before = media.length;
    media = media.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    if (media.length < before) flags.push('O mesmo link aparece mais de uma vez no doc');

    const capaFiles = filesIn(get('capa')).filter((f) => !f.folder);
    const options = capaFiles.length > 1 ? capaFiles : filesIn(get('opcoes')).filter((f) => !f.folder);
    let cover: ScanFile | null = capaFiles.length === 1 ? capaFiles[0] : null;
    let coverOptions: ScanFile[] = [];
    if (!cover && options.length) { coverOptions = options; flags.push('Capa com mais de uma opção: escolha uma'); }
    const capaText = fold(textOf(get('capa')));
    if (/reprovad|trocar|tira print|print/.test(capaText)) { flags.push('Tem um recado sobre a capa no doc'); }

    const format = toFormat(fmtWord ?? '', cards.length > 0, media);
    if (format !== 'reels' && format !== 'video' && format !== 'destaque') { cover = null; coverOptions = []; }

    // data (se a data do título parece errada e há um "POST dd/mm" do mês do doc logo abaixo, vale o POST)
    let day = b.day, mon = b.month;
    const sub = b.pre.map((l) => l.text.match(/^post\s+(\d{1,2})\s*\/\s*(\d{1,2})/i)).find(Boolean);
    if (sub && mon !== bm && +sub[2] === bm) {
      flags.push(`No doc a data está ${pad(b.day)}/${pad(b.month)}, mas o subtítulo diz ${pad(+sub[1])}/${pad(+sub[2])}: confira`);
      day = +sub[1]; mon = +sub[2];
    } else if (mon !== bm && mon < 10 && bm >= 10 && String(bm).startsWith(String(mon))) {
      // "22/1" num calendário de novembro: faltou um dígito do mês
      flags.push(`No doc a data está ${pad(b.day)}/${b.month}: entendi ${pad(b.day)}/${pad(bm)}, confira`);
      mon = bm;
    } else if (mon !== bm) flags.push(`Data fora de ${MONTHS[bm - 1].replace('marco', 'março')}: confira`);
    let y = by;
    if (mon - bm > 6) y -= 1;
    if (bm - mon > 6) y += 1;
    const date = `${y}-${pad(mon)}-${pad(day)}`;

    const caption = textOf(get('legenda'));
    [...media, ...(cover ? [cover] : []), ...coverOptions].forEach((m) => all.set(m.id, m));
    if (media.some((m) => /\.heic$/i.test(m.name)) || (cover && /\.heic$/i.test(cover.name))) flags.push('Foto em HEIC: vira JPG na importação');
    if (media.some((m) => /\.(cr2|cr3|nef|arw|raw|dng)$/i.test(m.name))) flags.push('Foto em formato RAW de câmera: troque por JPG ou PNG');

    // estado: já foi / em alteração / bruto / pronto
    const st = classifyStatus(docStatus);
    let state: ScanState = 'ok';
    let why = finalFiles.length ? 'Tem o link da arte final' : 'Sem instrução de edição no doc';
    const allText = fold([docStatus, fmtLine, textOf(get('material')), textOf(get('copy'))].join(' '));
    const missingCards = cards.filter((c) => !c.files.length).map((c) => c.k.replace('card', ''));
    const folders = media.filter((m) => m.folder);
    if (st.state) { state = st.state; why = st.why; }
    else if (finalFiles.length) { /* pronto */ }
    else if (/precisa editar|editar|em edicao/.test(fold(instruction + ' ' + allText))) { state = 'raw'; why = 'O doc pede edição'; }
    else if (instruction && EDIT_RE.test(fold(instruction))) { state = 'raw'; why = `Instrução de edição: “${instruction}”`; }
    else if (!media.length) { state = 'raw'; why = format === 'arte' || format === 'foto' ? 'Sem a arte no doc' : 'Sem arquivo no doc'; }
    else if (folders.length && (format === 'reels' || format === 'video')) { state = 'raw'; why = 'O material é uma pasta (material bruto)'; }
    else if ((format === 'reels' || format === 'video') && media.filter((m) => isVideoName(m.name)).length > 1) { state = 'raw'; why = 'Vários vídeos soltos (material bruto)'; }
    else if (format === 'carrossel' && missingCards.length && !material.length) {
      state = 'raw'; why = missingCards.length === 1 ? `O card ${missingCards[0]} não tem imagem` : `Os cards ${missingCards.join(', ')} não têm imagem`;
    }
    if (state === 'ok' && folders.length) flags.push('Os arquivos vêm de uma pasta: confira a ordem');
    if (state === 'ok' && material.length && cards.length && missingCards.length) flags.push('Confira se a pasta tem a arte final dos cards');

    const firstLine = caption.split('\n').find((l) => l.trim()) ?? '';
    const short = firstLine.length > 42 ? `${firstLine.slice(0, 40).trim()}…` : firstLine;
    const title = `${FORMAT_LABEL[format]} ${pad(day)}/${pad(mon)}${short ? ` · ${short}` : ''}`;
    return {
      key: `${i}-${date}`, date, format, formatText: fmtLine, title, caption, media, cover, coverOptions,
      state, why, flags, docStatus,
    };
  });
  return { title, month, posts, files: Array.from(all.values()).filter((f) => !f.folder) };
}

/** Id do doc a partir do link colado. */
export function docIdFromUrl(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{20,})/);
  return m ? m[1] : null;
}

export { FORMAT_LABEL };
