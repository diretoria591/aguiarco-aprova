/* Briefing Estratégico da Aguiar&Co (cliente novo). Usado na página do cliente, no Aprova e no Google Doc. */

export type BriefingQuestion = {
  id: string;
  label: string;
  hint?: string;
  /** short = uma linha; long = texto livre; single = escolha única; multi = várias opções. */
  kind: 'short' | 'long' | 'single' | 'multi';
  options?: string[];
  /** Mostra um campo "Outro" (guardado em `<id>_outro`). */
  other?: boolean;
  required?: boolean;
  /** Já vem preenchido com o cadastro do cliente. */
  prefill?: 'contact_name' | 'name' | 'instagram' | 'email' | 'whatsapp';
};
export type BriefingSection = { title: string; intro?: string; questions: BriefingQuestion[] };

/** Página de boas-vindas; {nome} vira o primeiro nome do contato. */
export const BRIEFING_WELCOME = {
  title: '✨ {nome}, boas-vindas ao seu Briefing Estratégico ✨',
  body: `Antes de começar, um recado importante 💬

Este briefing foi criado para pensarmos a sua marca não só no Instagram, mas de forma estratégica e sustentável 💡

Aqui não existem respostas certas ou erradas. Quanto mais clara e honesta você for nas respostas, mais assertivo, coerente e estratégico será todo o nosso planejamento.

Algumas perguntas podem fazer você pensar um pouco mais, e isso é ótimo ✨ Elas existem para alinhar:
• posicionamento
• objetivos reais
• conteúdo
• estética
• vendas

⚠️ Importante saber:
• Este briefing é a base oficial da estratégia
• Ele orienta decisões criativas, comerciais e de posicionamento
• Mudanças importantes depois do envio podem exigir ajustes na estratégia

👉 Dica importante: reserve um momento tranquilo, responda com calma e detalhe tudo o que achar relevante. Quanto mais você se entrega aqui, mais o Instagram passa a trabalhar ✨`,
};

export const BRIEFING_THANKS = {
  title: '✨ Briefing finalizado, {nome}!',
  body: `Obrigada por dedicar o seu tempo e atenção ao preenchimento deste briefing.

As informações compartilhadas aqui serão utilizadas como base estratégica para análise da marca, definição de posicionamento, planejamento de conteúdo, comunicação e decisões relacionadas ao Instagram. Quanto mais detalhadas e consistentes forem as respostas, mais alinhado e assertivo será todo o desenvolvimento do trabalho.

A partir deste material, iniciaremos a análise estratégica da marca. Caso seja necessário aprofundar algum ponto ou esclarecer informações, entraremos em contato.

Este briefing marca o início de um processo estruturado, pensado para crescimento, clareza e resultados.`,
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const BRIEFING: BriefingSection[] = [
  {
    title: 'Sobre sua empresa',
    questions: [
      { id: 'nome_completo', label: 'Nome completo', kind: 'short', required: true, prefill: 'contact_name' },
      { id: 'marca', label: 'Nome da marca/negócio', kind: 'short', required: true, prefill: 'name' },
      { id: 'instagram', label: '@ do Instagram', kind: 'short', prefill: 'instagram' },
      { id: 'site', label: 'Tem site? Se sim, insira aqui', kind: 'short' },
      { id: 'equipe', label: 'Atua sozinha ou tem equipe? Se sim, quem faz o quê?', kind: 'long' },
      { id: 'email', label: 'E-mail', kind: 'short', prefill: 'email' },
      { id: 'telefone', label: 'Número para contato', kind: 'short', prefill: 'whatsapp' },
      { id: 'objetivo', label: 'Qual é o seu objetivo com o Instagram hoje?', kind: 'single', required: true,
        options: ['Vender mais', 'Ser mais reconhecida(o)', 'Atrair parceria', 'Fortalecer a minha marca'] },
      { id: 'historia', label: 'Conte a história da marca', kind: 'long' },
      { id: 'seis_meses', label: 'Se o Instagram funcionasse perfeitamente, o que mudaria no seu negócio em 6 meses?', kind: 'long' },
      { id: 'gera_vendas', label: 'Hoje, o Instagram gera vendas?', kind: 'single',
        options: ['Sim, de forma previsível', 'Às vezes', 'Não gera vendas'] },
      { id: 'por_que_nao', label: 'Se não gera, por que você acredita que isso acontece?', kind: 'long' },
    ],
  },
  {
    title: 'Cliente ideal',
    intro: `Respire fundo e leia com atenção.

Aqui, não estamos falando de quem te segue ou de quem curte suas publicações. Estamos falando de quem paga (ou deveria pagar) pelo seu produto ou serviço ✨`,
    questions: [
      { id: 'cliente_ideal', label: 'Quem é o seu cliente ideal? Coloque aqui: a idade, a profissão, o nível financeiro, a principal dor e o principal desejo.', kind: 'long', required: true,
        hint: `Pense em quem realmente compra, valoriza o seu trabalho e tem perfil para o seu negócio hoje. Exemplos:
• Idade: 25 a 35 anos | 30 a 45 anos | acima de 40
• Profissão: empresária do setor de estética | médica | dona de loja física | prestadora de serviços | executiva | autônoma
• Quem realmente compra: consegue investir mensalmente no seu serviço | compra produtos premium | busca soluções mais acessíveis | decide pelo valor, não só pelo preço
• Principal dor: falta de posicionamento | dificuldade em vender | pouca autoridade | Instagram não gera retorno | excesso de concorrência
• Principal desejo: vender com constância | ser reconhecida como referência | atrair clientes certos | profissionalizar o negócio | crescer com previsibilidade
👉 Quanto mais específica for a resposta, mais clara, estratégica e assertiva será toda a comunicação depois.` },
      { id: 'fala_com', label: 'O seu conteúdo hoje fala mais com você ou com quem você quer vender? Explique', kind: 'long' },
      { id: 'percebida_desejo', label: 'Como a marca deseja ser percebida?', hint: 'Ex.: premium, acessível, técnica, moderna, inovadora', kind: 'long' },
      { id: 'percebida_hoje', label: 'Como acredita que a marca é percebida hoje?', kind: 'long' },
    ],
  },
  {
    title: 'Concorrência e referências',
    intro: `🔎 Por que esta etapa é importante?

Esta parte não é para comparar a marca com outras nem para copiar estratégias prontas. Analisar concorrência e referências serve para:
• entender o posicionamento do mercado
• identificar oportunidades de diferenciação
• evitar erros já cometidos por outras marcas
• alinhar expectativas estéticas e estratégicas`,
    questions: [
      { id: 'concorrentes', label: 'Principais concorrentes', kind: 'long' },
      { id: 'concorrentes_ig', label: '@ do Instagram de cada concorrente', kind: 'long' },
      { id: 'fazem_bem', label: 'O que fazem bem? (cada um)', kind: 'long' },
      { id: 'nao_faria', label: 'O que a sua marca não faria igual?', kind: 'long' },
      { id: 'fazem_diferente', label: 'O que fazem diferente de você?', kind: 'long' },
      { id: 'referencias', label: 'Agora, liste marcas que servem como referência para você (mesmo fora do nicho)', kind: 'long' },
    ],
  },
  {
    title: 'Identidade visual e estética',
    intro: 'Esta etapa serve para alinhar a aparência da marca com o posicionamento que ela deseja transmitir. A identidade visual influencia diretamente a percepção de valor, profissionalismo e confiança. Aqui, o objetivo não é apenas "gostar" de uma estética, mas garantir coerência entre cores, estilo, composição e o público que a marca pretende atrair. As referências visuais ajudam a entender o nível de sofisticação, a linguagem estética e o tipo de comunicação visual que faz sentido para o negócio.',
    questions: [
      { id: 'estilo', label: 'Estilo visual desejado', kind: 'multi', options: ['Minimalista', 'Sofisticado', 'Clean', 'Criativo', 'Editorial', 'Comercial'] },
      { id: 'cores', label: 'Coloque aqui as cores principais da marca', kind: 'short' },
      { id: 'identidade_link', label: 'Link da identidade visual da marca (se houver)', kind: 'short' },
      { id: 'manual_link', label: 'Link do manual da marca (se houver)', kind: 'short' },
      { id: 'cores_evitar', label: 'Cores que devem ser evitadas', kind: 'short' },
      { id: 'feed', label: 'Tipo de feed desejado', kind: 'multi', options: ['Organizado', 'Espontâneo', 'Editorial', 'Conversacional'] },
      { id: 'perfis_beleza', label: 'Envie links de perfis que você gosta pela beleza', kind: 'long' },
      { id: 'conteudos', label: 'Tipos de conteúdo prioritários', kind: 'multi', other: true,
        options: ['Educacional', 'Institucional', 'Bastidores', 'Provas sociais', 'Conteúdo de vendas'] },
      { id: 'tom', label: 'Tom de comunicação da marca', kind: 'multi', other: true, options: ['Formal', 'Próximo', 'Técnico'] },
      { id: 'nao_abordar', label: 'Existe algum assunto que a marca não deve abordar? Se sim, qual?', kind: 'long' },
    ],
  },
  {
    title: 'Processos, rotinas e execução',
    intro: 'Esta etapa tem como objetivo compreender a estrutura operacional da marca e como a execução acontece no dia a dia. Entender processos, rotinas, responsáveis e limitações é essencial para criar uma estratégia que seja viável, consistente e sustentável. Aqui analisamos quem executa, quais recursos estão disponíveis, como os conteúdos são produzidos e quais são as restrições operacionais. Uma boa estratégia não depende apenas de boas ideias, mas da capacidade real da marca de executar o que foi planejado com qualidade e constância.',
    questions: [
      { id: 'responsavel', label: 'Quem será responsável pelo Instagram? Por aprovar os conteúdos e campanhas?', hint: 'Insira o nome e o número.', kind: 'long', required: true },
      { id: 'materiais', label: 'A marca possui materiais próprios (fotos, vídeos, banco de imagens)? Em caso positivo, coloque o link aqui', kind: 'long' },
    ],
  },
  {
    title: 'Ações previstas para o ano',
    intro: 'Este bloco tem como objetivo mapear todas as ações estratégicas previstas para a marca ao longo do ano. Aqui entram lançamentos, campanhas, eventos, parcerias, promoções, expansões ou qualquer movimento relevante do negócio. Essas informações são essenciais para que o planejamento de conteúdo e comunicação seja alinhado ao calendário real da empresa, permitindo que o Instagram seja usado de forma estratégica, com antecedência, coerência e foco em resultados. Sem essa visão anual, o conteúdo tende a ser pontual, reativo e desconectado dos objetivos do negócio.',
    questions: MESES.map((m) => ({
      id: `mes_${m.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`,
      label: m, hint: 'O que tem de programação, quando acontecerá e objetivo principal', kind: 'long' as const,
    })),
  },
  {
    title: 'Produtos e serviços',
    intro: 'Este espaço é dedicado ao mapeamento completo dos produtos e serviços da marca. O objetivo é entender o portfólio atual, os níveis de oferta, o ticket médio e quais soluções são prioritárias para o crescimento do negócio. Essas informações orientam decisões de comunicação, conteúdo, campanhas e foco de vendas, evitando que o Instagram divulgue tudo ao mesmo tempo sem uma estratégia clara. Identificar o produto ou serviço estratégico principal permite direcionar esforços para aquilo que realmente sustenta e impulsiona a marca no momento atual.',
    questions: [
      { id: 'portfolio', label: 'Liste aqui todos os seus serviços e/ou produtos (nome e preço)', kind: 'long', required: true },
      { id: 'prioridade', label: 'Qual deles é a prioridade de venda?', kind: 'long', required: true },
      { id: 'faltou', label: 'Nesse formulário, tem algo importante que não foi perguntado?', kind: 'long' },
    ],
  },
];

export const BRIEFING_QUESTIONS = BRIEFING.flatMap((s) => s.questions);
export type BriefingAnswers = Record<string, string | string[]>;

/** Resposta em texto (listas viram "a, b"; o campo "Outro" entra junto). */
export function answerFor(a: BriefingAnswers, q: BriefingQuestion): string {
  const v = a[q.id];
  const base = Array.isArray(v) ? v.filter(Boolean).join(', ') : (v ?? '').trim();
  const other = q.other ? String(a[`${q.id}_outro`] ?? '').trim() : '';
  return [base, other && `Outro: ${other}`].filter(Boolean).join(', ');
}
export const answerText = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.join(', ') : (v ?? '').trim();

export const personalize = (s: string, nome: string) => s.replaceAll('{nome}', nome);
