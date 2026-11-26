'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icon';
import { Modal } from '@/components/ui';
import { WEEKDAYS } from '@/lib/alteracoes';
import { DayStrip } from './alteracoes-ui';

/**
 * Tutorial de "Minhas demandas": abre sozinho no primeiro acesso de quem faz alterações
 * e pode ser revisto pelo botão "Como funciona".
 */
export function DemandasTutorial({ name, days, hours, profileId, save, onClose }: {
  name: string; days: number[]; hours: string; profileId: string;
  /** grava que a pessoa já viu (não grava quando a Kim está no "Ver como") */
  save: boolean; onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const dias = WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.long);
  const diasTxt = dias.length > 1 ? `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}` : dias[0] ?? 'segunda a sexta';

  async function done() {
    if (save) await createClient().from('profiles').update({ tutorial_demandas_at: new Date().toISOString() }).eq('id', profileId);
    onClose();
  }

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: `Oi, ${name}! Bem-vinda ao Aprova`,
      body: (
        <>
          <p>Aqui chegam as <b>alterações que os clientes pedem</b> e que a Kim ou o João passaram para você.</p>
          <p>Você vê só o que é seu, separado por cliente. Vamos ver como funciona? São 6 passos rápidos.</p>
        </>
      ),
    },
    {
      title: 'Como você fica sabendo',
      body: (
        <>
          <p>Quando uma alteração é passada para você, chegam <b>duas coisas</b>:</p>
          <ul>
            <li>um <b>e-mail</b> com o que o cliente pediu e o prazo;</li>
            <li>um <b>aviso no topo</b> do Aprova e o número em <b>Minhas demandas</b>, no menu.</li>
          </ul>
          <div className="tut-demo">
            <div className="task-banner" style={{ margin: 0 }}>
              <span><b>{name}, você tem 1 alteração para fazer.</b> Veja o prazo em Minhas demandas.</span>
              <span className="btn sm">Ver agora</span>
            </div>
          </div>
        </>
      ),
    },
    {
      title: 'Escolha o cliente e veja o prazo',
      body: (
        <>
          <p>Em <b>Minhas demandas</b>, clique no cliente no topo. Aparecem só as alterações dele, com <b>o que o cliente pediu</b> e o <b>prazo</b>.</p>
          <div className="tut-demo">
            <div className="alt-clients" style={{ margin: 0 }}>
              <span className="alt-cl on"><span className="alt-mono">HI</span><span className="nm">Espaço HI</span><span className="n">1</span></span>
              <span className="alt-cl"><span className="alt-mono">TM</span><span className="nm">Teresa Mello</span><span className="n">1</span></span>
            </div>
            <div className="alt-ask">O cliente pediu: “Trocar a foto 3 pela fachada nova.”</div>
            <span className="status ajustes">Sua vez · prazo ter, 16/12</span>
          </div>
          <p>O prazo é marcado nos seus dias de entrega: <b>{diasTxt}</b>{hours ? <>, {hours}</> : null}.</p>
          <DayStrip days={days} hours={hours} />
          <p className="small muted">Se passar do prazo, o card fica vermelho para todo mundo ver.</p>
        </>
      ),
    },
    {
      title: 'Faça só o que o cliente pediu',
      body: (
        <>
          <p>Clique em <b>Fazer a alteração</b>. Abre o conteúdo como ele está.</p>
          <ol>
            <li>Na foto ou vídeo que vai mudar, clique em <b>Trocar</b> e escolha o arquivo novo. O resto fica como está.</li>
            <li>Se for texto, altere a <b>legenda</b>.</li>
            <li>Escreva em poucas palavras <b>o que você fez</b>. Ex.: “Troquei a foto 3”.</li>
          </ol>
          <div className="tut-note"><Icon name="eye" /> <span><b>O cliente ainda não vê nada.</b> A versão nova só vai para ele depois da revisão da Kim ou do João.</span></div>
        </>
      ),
    },
    {
      title: 'Quando tem duas pessoas',
      body: (
        <>
          <p>Às vezes a alteração passa por duas pessoas, por exemplo o texto e depois a arte. A trilha mostra onde está:</p>
          <div className="tut-demo">
            <div className="alt-trail">
              <span className="t done">✓ Renata</span><span className="sep">→</span>
              <span className="t now">● Você · prazo ter, 16/12</span><span className="sep">→</span>
              <span className="t">Revisão</span><span className="sep">→</span><span className="t">Cliente</span>
            </div>
          </div>
          <ul>
            <li>Se você for a <b>primeira</b>, o botão é <b>“Terminei, passar para…”</b>. A segunda pessoa recebe na hora.</li>
            <li>Se você for a <b>segunda</b>, aparece o que a primeira já fez. Você continua de onde ela parou.</li>
            <li>Se for só você, o botão é <b>“Entregar para revisão”</b>.</li>
          </ul>
        </>
      ),
    },
    {
      title: 'Revisão e pronto',
      body: (
        <>
          <p>A Kim ou o João conferem. Se estiver tudo certo, <b>vai direto para o cliente</b>, e você não precisa fazer mais nada.</p>
          <p>Se faltar algo, a alteração <b>volta para você</b> com um recado e você recebe um e-mail:</p>
          <div className="tut-demo"><div className="alt-back"><b>Recado da revisão:</b> “A foto 3 ficou escura, pode clarear?”</div></div>
          <p>Ajuste e entregue de novo. Para ver este tutorial outra vez, clique em <b>Como funciona</b> em Minhas demandas.</p>
        </>
      ),
    },
  ];
  const last = i === steps.length - 1;
  const s = steps[i];

  return (
    <Modal
      title={<>{s.title}</>}
      onClose={done}
      foot={
        <>
          <span className="tut-dots" aria-label={`Passo ${i + 1} de ${steps.length}`}>
            {steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}
          </span>
          {i > 0 && <button className="btn line" onClick={() => setI(i - 1)}><Icon name="left" />Voltar</button>}
          {last
            ? <button className="btn" onClick={done}><Icon name="check" />Entendi, começar</button>
            : <button className="btn" onClick={() => setI(i + 1)}>Próximo<Icon name="right" /></button>}
        </>
      }
    >
      <div className="tut-body">{s.body}</div>
    </Modal>
  );
}
