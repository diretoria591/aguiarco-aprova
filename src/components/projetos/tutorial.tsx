'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { Modal } from '@/components/ui';
import { tutorialSeen } from '@/app/dashboard/projetos/actions';

/**
 * Tutorial da área do projeto: abre sozinho no primeiro acesso (menos para a dona)
 * e pode ser revisto pelo botão "Como funciona".
 */
export function ProjetoTutorial({ name, projeto, cliente, save, onClose }: {
  name: string; projeto: string; cliente: string; save: boolean; onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const c = cliente || 'o cliente';
  async function done() {
    if (save) await tutorialSeen().catch(() => {});
    onClose();
  }
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: `Oi, ${name}! Esta é a central do ${projeto}`,
      body: (
        <>
          <p>Aqui fica <b>tudo o que é seu no projeto</b>: o que fazer hoje, o que está atrasado, o que está esperando resposta e o que já saiu.</p>
          <p>A ideia é você ter autonomia: decidir, fazer, enviar e cobrar, sem precisar esperar ninguém. São 7 passos rápidos.</p>
        </>
      ),
    },
    {
      title: 'Comece pela aba “Minhas tarefas”',
      body: (
        <>
          <p>Ela mostra a sua lista, em ordem:</p>
          <ul>
            <li><b className="t-late">Atrasadas</b>: o prazo passou. Resolva primeiro.</li>
            <li><b>Para hoje</b> e <b>Próximos 7 dias</b>.</li>
            <li><b>Travadas</b>: esperando resposta de alguém, com a data para cobrar.</li>
          </ul>
          <p>Toda tarefa tem <b>prazo e responsável</b>. As rotinas (stories toda segunda, status de sexta, marcos do mês) aparecem sozinhas.</p>
        </>
      ),
    },
    {
      title: 'Os botões de cada tarefa',
      body: (
        <>
          <div className="tut-demo">
            <div className="pj-actions">
              <span className="btn sm line">Em andamento</span>
              <span className="btn sm ok"><Icon name="check" />Feito</span>
              <span className="btn sm line">Travou</span>
            </div>
          </div>
          <ul>
            <li><b>Em andamento</b>: você começou.</li>
            <li><b>Feito</b>: terminou. O Aprova pergunta o próximo passo (veja a seguir).</li>
            <li><b>Travou</b>: depende de alguém. Você diz de quem e quando cobrar.</li>
          </ul>
          <p>Clique no nome da tarefa para ver os detalhes, a lista (ex.: os influenciadores para contatar) e para registrar um comentário curto, como “enviado ao Rafa em 12/11, aguardando”.</p>
        </>
      ),
    },
    {
      title: 'Feito? Escolha o próximo passo',
      body: (
        <>
          <p>Ao clicar em <b>Feito</b>, aparecem as opções:</p>
          <ul>
            <li><b>Enviar e-mail de entrega para {c}</b>: abre o <b>seu Gmail</b> com o e-mail já escrito e as cópias de sempre. Você revisa e envia de lá.</li>
            <li><b>Agendar uma reunião</b>: abre o convite na Agenda do Google.</li>
            <li><b>Mandar para a Kim aprovar</b>: só quando for decisão de gestão.</li>
            <li><b>Só marcar como feito</b>.</li>
          </ul>
          <div className="tut-note"><Icon name="check" />Depois do e-mail de entrega, a tarefa vai sozinha para “Travado · esperando {c}” e o Aprova lembra você de cobrar em 2 dias úteis.</div>
        </>
      ),
    },
    {
      title: 'Travado: você cobra no dia certo',
      body: (
        <>
          <p>No painel “Travado · esperando resposta” fica tudo que depende do cliente, da Saliva ou de outra pessoa.</p>
          <ul>
            <li><b>Cobrar no Gmail</b>: abre o e-mail de cobrança pronto no seu Gmail.</li>
            <li><b>Chegou</b>: a resposta veio, a tarefa vai para “Já saiu”.</li>
            <li><b>Pediu ajuste</b>: volta para “Em andamento”.</li>
          </ul>
          <p>Venceu a data de cobrar? A tarefa fica vermelha: cobre no mesmo dia.</p>
        </>
      ),
    },
    {
      title: 'Os e-mails do projeto chegam aqui',
      body: (
        <>
          <p>Na aba <b>E-mails</b> aparecem as mensagens do projeto (você sempre coloca a Kim em cópia, e o Aprova lê a caixa dela, só para leitura).</p>
          <ul>
            <li><b>Precisa de resposta</b>: alguém escreveu e ainda ninguém respondeu. Clique em <b>Responder no Gmail</b>.</li>
            <li>Tem um pedido no e-mail? <b>Virar tarefa</b> com prazo, na hora.</li>
          </ul>
          <p>O Aprova <b>nunca envia e-mail</b>: todo botão abre o seu Gmail.</p>
        </>
      ),
    },
    {
      title: 'Toda sexta: o resumo da semana',
      body: (
        <>
          <p>Na aba <b>Relatório de sexta</b>, o resumo para {c} já vem montado com o que saiu, o que está em andamento, o que vem na próxima semana e o que precisamos deles.</p>
          <p>Você revisa, clica em <b>Abrir no Gmail</b> e envia. Quando a cópia chegar na caixa da Kim, aparece como enviado.</p>
          <div className="tut-note"><Icon name="check" />Dúvida? O botão “Como funciona”, no topo, abre este tutorial de novo.</div>
        </>
      ),
    },
  ];
  const s = steps[i];
  const last = i === steps.length - 1;
  return (
    <Modal title={s.title} wide onClose={done} foot={
      <>
        <div className="tut-dots" aria-hidden="true">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Voltar</button>}
        <button className="btn" onClick={() => (last ? done() : setI(i + 1))}>{last ? 'Começar' : 'Próximo'}</button>
      </>
    }>
      <div className="tut-body">{s.body}</div>
    </Modal>
  );
}
