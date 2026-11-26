/* Desempenho da equipe: o que cada pessoa entregou no mês, no prazo ou não, e a mensagem pronta. */
import { firstName, monthName } from './format';

export type Tone = 'otimo' | 'bom' | 'atencao' | 'neutro';
export const TONE_LABEL: Record<Tone, string> = {
  otimo: 'Mandando muito bem', bom: 'Bom, com pontos de atenção', atencao: 'Precisa de atenção', neutro: 'Sem entregas no Aprova',
};

/** Uma frente de trabalho (agendamento, alterações…): quantas no prazo, atrasadas e atrasadas agora. */
export type Area = {
  key: 'agendamento' | 'alteracoes' | 'textos' | 'relatorios' | 'numeros';
  label: string;
  /** "agendou 28 posts" */
  done: string;
  onTime: number;
  late: number;
  /** ainda sem entregar e com prazo vencido */
  openLate: number;
  /** o que está atrasado agora (para a mensagem) */
  openList: string[];
  /** detalhe extra ("avisou os clientes de 27") */
  extra?: string;
  /** "1 alteração" (para listar onde atrasou) */
  unit: (n: number) => string;
};

export type PersonPerf = {
  id: string; name: string; nick: string; email: string; job: string;
  areas: Area[];
  total: number; onTime: number; late: number; openLate: number;
  /** % no prazo (null sem entregas) */
  rate: number | null;
  tone: Tone;
  message: string;
  last: { created_at: string; tone: Tone; seen_at: string | null; sent_by_name: string } | null;
};

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function toneOf(onTime: number, total: number, openLate: number): Tone {
  if (!total && !openLate) return 'neutro';
  const rate = total ? onTime / total : 0;
  if (rate >= 0.9 && openLate === 0) return 'otimo';
  if (rate >= 0.7 && openLate <= 1) return 'bom';
  return 'atencao';
}

const joinPt = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** Mensagem pronta para a Kim revisar: parabéns quando está em dia, alerta com carinho quando não. */
export function buildMessage(p: { nick: string; areas: Area[]; tone: Tone; month: string; current: boolean }): string {
  const nome = p.nick;
  const mes = monthName(p.month);
  const quando = p.current ? `em ${mes} até agora` : `em ${mes}`;
  const feitos = p.areas.filter((a) => a.onTime + a.late > 0).map((a) => (a.extra ? `${a.done} (${a.extra})` : a.done));
  const lateList = p.areas.filter((a) => a.late > 0).map((a) => a.unit(a.late));
  const openList = p.areas.flatMap((a) => a.openList);
  const open = p.areas.reduce((s, a) => s + a.openLate, 0);
  const total = p.areas.reduce((s, a) => s + a.onTime + a.late + a.openLate, 0);
  const late = p.areas.reduce((s, a) => s + a.late + a.openLate, 0);
  const lateTotal = p.areas.reduce((s, a) => s + a.late, 0);
  const good = p.areas.filter((a) => a.onTime > 0 && a.late === 0 && a.openLate === 0).map((a) => a.label.toLowerCase());

  if (p.tone === 'neutro') {
    return `${nome}, ${quando} não apareceram entregas suas no Aprova. Está tudo bem por aí? Se você está fazendo coisas por fora, me conta para a gente registrar.`;
  }
  if (p.tone === 'otimo') {
    return `${nome}, parabéns! 🎉 ${cap(quando)} você ${joinPt(feitos)}, ${late ? 'praticamente tudo' : 'tudo'} dentro do prazo. `
      + 'Obrigada pelo capricho e pela pontualidade, faz muita diferença para os clientes e para a equipe. 💛';
  }
  if (p.tone === 'bom') {
    return `${nome}, obrigada pelas entregas ${quando}: você ${joinPt(feitos)}. `
      + `A maior parte saiu no prazo${lateList.length ? `; ${joinPt(lateList)} ${lateTotal > 1 ? 'passaram' : 'passou'} da data` : ''}`
      + `${open ? ` e tem ${plural(open, 'pendência atrasada', 'pendências atrasadas')} agora (${joinPt(openList.slice(0, 3))})` : ''}. `
      + 'Vamos fechar o próximo mês 100% em dia? 💪';
  }
  return `${nome}, passando para alinhar com carinho: ${quando} ${late} de ${total} entregas passaram do prazo`
    + `${lateList.length ? ` (${joinPt(lateList)})` : ''}`
    + `${open ? `, e hoje ${open === 1 ? 'tem 1 atrasada' : `tem ${open} atrasadas`}: ${joinPt(openList.slice(0, 4))}` : ''}. `
    + `${good.length ? `O que está indo bem: ${joinPt(good)}, obrigada! ` : ''}`
    + 'Me conta se tem algo atrapalhando. Quero te ajudar a organizar a semana para voltar aos prazos. 🙏';
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const displayName = (p: { name: string; nickname?: string | null }) => (p.nickname || '').trim() || firstName(p.name) || 'Equipe';
