/* Briefing inicial do cliente novo: perguntas usadas na página do cliente, no Aprova e no Google Doc. */

export type BriefingQuestion = {
  id: string;
  label: string;
  hint?: string;
  /** short = uma linha; long = texto livre; choices = marcar opções (pode várias). */
  kind: 'short' | 'long' | 'choices';
  options?: string[];
  required?: boolean;
};
export type BriefingSection = { title: string; questions: BriefingQuestion[] };

export const BRIEFING: BriefingSection[] = [
  {
    title: 'Sobre o seu negócio',
    questions: [
      { id: 'negocio', label: 'Conte um pouco sobre o seu negócio', hint: 'O que vocês fazem, há quanto tempo, onde atendem.', kind: 'long', required: true },
      { id: 'redes', label: 'Quais são os seus perfis nas redes sociais?', hint: 'Instagram, TikTok, site, Google…', kind: 'short', required: true },
      { id: 'servicos', label: 'Quais produtos ou serviços são prioridade para divulgar?', kind: 'long', required: true },
      { id: 'diferenciais', label: 'O que diferencia vocês da concorrência?', kind: 'long' },
    ],
  },
  {
    title: 'Seu público',
    questions: [
      { id: 'publico', label: 'Quem é o seu cliente ideal?', hint: 'Idade, região, estilo de vida, o que busca.', kind: 'long', required: true },
      { id: 'dores', label: 'Quais dúvidas, desejos ou problemas esse cliente costuma trazer?', kind: 'long' },
    ],
  },
  {
    title: 'Comunicação',
    questions: [
      { id: 'objetivos', label: 'O que você mais quer alcançar com as redes?', kind: 'choices', required: true,
        options: ['Vender mais', 'Encher a agenda', 'Ser referência / autoridade', 'Ser mais conhecido(a)', 'Lançar algo novo', 'Fidelizar quem já é cliente'] },
      { id: 'tom', label: 'Como você quer que a marca fale?', kind: 'choices',
        options: ['Acolhedora', 'Divertida', 'Sofisticada', 'Técnica / especialista', 'Próxima, como amiga', 'Direta e objetiva'] },
      { id: 'referencias', label: 'Perfis que você admira ou usa como referência', hint: 'Podem ser de qualquer área.', kind: 'long' },
      { id: 'concorrentes', label: 'Principais concorrentes', kind: 'long' },
      { id: 'evitar', label: 'Tem algo que não podemos falar ou mostrar?', hint: 'Assuntos, palavras, imagens, regras do conselho profissional…', kind: 'long' },
    ],
  },
  {
    title: 'Dia a dia',
    questions: [
      { id: 'datas', label: 'Datas importantes e campanhas do ano', hint: 'Aniversário da marca, promoções, eventos, sazonalidade.', kind: 'long' },
      { id: 'aprovacao', label: 'Quem aprova os conteúdos e qual o melhor contato?', kind: 'short', required: true },
      { id: 'gravacao', label: 'Disponibilidade para gravar vídeos e fotos', hint: 'Dias, horários, quem aparece nos conteúdos.', kind: 'long' },
      { id: 'identidade', label: 'Logo, manual de marca ou fotos que já existem', hint: 'Cole um link do Drive, se tiver. Também pode mandar depois.', kind: 'long' },
      { id: 'extra', label: 'Quer contar mais alguma coisa para a equipe?', kind: 'long' },
    ],
  },
];

export const BRIEFING_QUESTIONS = BRIEFING.flatMap((s) => s.questions);
export type BriefingAnswers = Record<string, string | string[]>;

export const answerText = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.join(', ') : (v ?? '').trim();
