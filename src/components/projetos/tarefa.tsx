'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import {
  addBusinessDays, calendarInvite, dia, gmailCompose, isLate, quando,
  type Contato, type Projeto, type Tarefa, type TarefaStatus,
} from '@/lib/projetos';

export type Pessoa = { id: string; name: string; nickname: string; owner: boolean };
export const nomeDe = (p: Pessoa) => (p.nickname || '').trim() || p.name.trim().split(/\s+/)[0];
/** Pessoa ainda sem login: a tarefa guarda só o nome. */
const contaId = (p: Pessoa | undefined) => (p && !p.id.startsWith('nome:') ? p.id : null);

type Ctx = { projeto: Projeto; today: string; pessoas: Pessoa[] };

/** Atualiza a tarefa e (quando há) registra a movimentação. */
export function useTarefaActions() {
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  async function update(t: Pick<Tarefa, 'id'>, patch: Partial<Tarefa>, mov?: string, ok?: string) {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from('projeto_tarefas').update({ ...patch, updated_at: now }).eq('id', t.id);
    if (error) { toast('Não foi possível salvar. Tente de novo.', 'err'); return false; }
    if (mov) await supabase.from('projeto_movs').insert({ tarefa_id: t.id, author_name: me.name, text: mov.slice(0, 2000) });
    if (ok) toast(ok);
    router.refresh();
    return true;
  }
  return { update, me };
}

const contatoDe = (p: Projeto, nome: string): Contato | null =>
  (p.contatos ?? []).find((c) => c.nome.toLowerCase() === nome.trim().toLowerCase()) ?? null;

/** Status com a cor do painel. */
export function StatusPill({ t, today }: { t: Tarefa; today: string }) {
  const late = isLate(t, today);
  if (t.status === 'saiu') return <span className="status aprovado">Já saiu{t.done_at ? ` · ${t.done_at.slice(8, 10)}/${t.done_at.slice(5, 7)}` : ''}</span>;
  if (t.status === 'travado') return <span className={`status ${late ? 'atraso' : 'pendente'}`}>{late ? 'Cobrar' : 'Esperando'} {t.waiting_on || 'resposta'}{t.cobrar_em ? ` · ${dia(t.cobrar_em)}` : ''}</span>;
  if (late) return <span className="status atraso">Atrasada · era {dia(t.due_date)}</span>;
  if (t.due_date === today) return <span className="status ajustes">Prazo hoje</span>;
  if (t.status === 'andamento') return <span className="status ajustes">Em andamento{t.due_date ? ` · ${dia(t.due_date)}` : ''}</span>;
  return <span className="status alt-wait">{t.due_date ? `Prazo ${dia(t.due_date)}` : 'Sem prazo'}</span>;
}

/** Cartão de tarefa com os botões do status (Em andamento, Feito, Travou, Cobrar, Chegou). */
export function TarefaCard({ t, ctx, compact, onOpen }: { t: Tarefa; ctx: Ctx; compact?: boolean; onOpen: (t: Tarefa) => void }) {
  const { update } = useTarefaActions();
  const [feito, setFeito] = useState(false);
  const [travou, setTravou] = useState(false);
  const [delegar, setDelegar] = useState(false);
  const late = isLate(t, ctx.today);
  const itens = t.projeto_itens ?? [];
  const done = itens.filter((i) => i.done).length;
  const cont = contatoDe(ctx.projeto, t.waiting_on);

  function cobrar() {
    const url = gmailCompose({
      to: cont?.email ?? '', cc: cont?.cc ?? ctx.projeto.report_cc,
      subject: `${ctx.projeto.name} · ${t.title}`,
      body: `Olá${cont ? `, ${cont.nome}` : ''}! Tudo bem?\n\nPassando para lembrar: ${t.title}.\nConsegue nos dar um retorno até ${dia(addBusinessDays(ctx.today, 1))}?\n\nObrigada!`,
    });
    window.open(url, '_blank', 'noopener');
    void update(t, { cobrar_em: addBusinessDays(ctx.today, 2) }, `Cobrado${cont ? ` ${cont.nome}` : ''} pelo Gmail. Próxima cobrança ${dia(addBusinessDays(ctx.today, 2))}.`, 'Cobrança registrada');
  }

  return (
    <div className={`pj-card${late ? ' late' : ''}${t.status === 'saiu' ? ' quiet' : ''}${compact ? ' compact' : ''}`}>
      <button type="button" className="pj-title" onClick={() => onOpen(t)}>{t.title}</button>
      <div className="pj-meta">
        <span>{t.owner_name || 'sem responsável'}{t.kind === 'rotina' ? ' · rotina' : ''}{t.internal ? ' · interno' : ''}{itens.length ? ` · ${done} de ${itens.length}` : ''}</span>
        <StatusPill t={t} today={ctx.today} />
      </div>
      {itens.length > 0 && <div className="pj-bar" aria-hidden="true"><i style={{ width: `${Math.round((done / itens.length) * 100)}%` }} /></div>}
      <div className="pj-actions">
        {t.status === 'a_fazer' && <button type="button" className="btn sm line" onClick={() => update(t, { status: 'andamento' }, 'Começou.', 'Em andamento')}>Em andamento</button>}
        {(t.status === 'a_fazer' || t.status === 'andamento') && <button type="button" className="btn sm ok" onClick={() => setFeito(true)}><Icon name="check" />Feito</button>}
        {t.status === 'andamento' && <button type="button" className="btn sm line" onClick={() => setTravou(true)}>Travou</button>}
        {t.status === 'travado' && <>
          <button type="button" className="btn sm" onClick={cobrar}>Cobrar no Gmail</button>
          <button type="button" className="btn sm line" onClick={() => update(t, { status: 'saiu', done_at: new Date().toISOString() }, `Chegou a resposta${t.waiting_on ? ` de ${t.waiting_on}` : ''}.`, 'Marcado como resolvido')}>Chegou</button>
          <button type="button" className="btn sm ghost" onClick={() => update(t, { status: 'andamento', waiting_on: '', cobrar_em: null }, `${t.waiting_on || 'O cliente'} pediu ajuste.`, 'Voltou para em andamento')}>Pediu ajuste</button>
        </>}
        {t.status !== 'saiu' && ctx.pessoas.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setDelegar(true)} title="Não é você quem faz? Passe para outra pessoa">Delegar</button>}
      </div>
      {feito && <ProximoPasso t={t} ctx={ctx} onClose={() => setFeito(false)} />}
      {travou && <Travou t={t} ctx={ctx} onClose={() => setTravou(false)} />}
      {delegar && <Delegar t={t} ctx={ctx} onClose={() => setDelegar(false)} />}
    </div>
  );
}

/** "Boa! Qual é o próximo passo?" — aparece ao clicar em Feito. O Aprova nunca envia e-mail: abre o Gmail. */
export function ProximoPasso({ t, ctx, onClose }: { t: Tarefa; ctx: Ctx; onClose: () => void }) {
  const { update, me } = useTarefaActions();
  const p = ctx.projeto;
  const cliente = p.client_name || 'o cliente';
  const cobrar = addBusinessDays(ctx.today, 2);
  const now = new Date().toISOString();
  const kim = ctx.pessoas.find((x) => x.owner);
  const souKim = kim?.id === me.id;
  const [body, setBody] = useState(`Olá, ${cliente}! Tudo bem?\n\nSegue ${t.title} para a sua análise e aprovação.${t.link_url ? `\n\nLink: ${t.link_url}` : ''}\n\nConseguimos ter o seu retorno até ${dia(cobrar)}?\n\nObrigada!`);

  async function entregar() {
    window.open(gmailCompose({ to: p.report_to, cc: p.report_cc, subject: `${p.name} · ${t.title}`, body }), '_blank', 'noopener');
    if (await update(t, { status: 'travado', waiting_on: cliente, cobrar_em: cobrar, done_by: me.name }, `Entrega enviada a ${cliente} pelo Gmail. Cobrar em ${dia(cobrar)} se não responder.`, `Foi para “Travado · esperando ${cliente}”`)) onClose();
  }
  async function reuniao() {
    const guests = [p.report_to, p.report_cc].filter(Boolean).join(',');
    window.open(calendarInvite({ title: `${p.name} · ${t.title}`, details: t.detail, guests }), '_blank', 'noopener');
    if (await update(t, { status: 'saiu', done_at: now, done_by: me.name }, `Feito. Reunião com ${cliente} marcada pela Agenda.`, 'Feito e reunião aberta na Agenda')) onClose();
  }
  async function paraKim() {
    if (await update(t, { status: 'travado', waiting_on: kim ? nomeDe(kim) : 'Kim', cobrar_em: addBusinessDays(ctx.today, 1), done_by: me.name }, `Pronto e enviado para ${kim ? nomeDe(kim) : 'a Kim'} aprovar.`, `Foi para a aprovação de ${kim ? nomeDe(kim) : 'Kim'}`)) onClose();
  }
  async function soFeito() {
    if (await update(t, { status: 'saiu', done_at: now, done_by: me.name }, 'Feito.', 'Feito!')) onClose();
  }

  return (
    <Modal title={`Boa${me.name ? `, ${me.name.split(' ')[0]}` : ''}! Qual é o próximo passo?`} wide onClose={onClose}>
      <p className="muted small" style={{ margin: '0 0 12px' }}>“{t.title}” está pronto. Escolha o que acontece agora: você decide e já resolve daqui.</p>
      <div className="pj-next">
        <button type="button" className="pj-opt on" onClick={entregar}>
          <b>Enviar e-mail de entrega para {cliente}</b>
          <span>Abre o seu Gmail já escrito{p.report_cc ? ', com as cópias de sempre' : ''}. Depois vai para “Travado · esperando {cliente}” e o Aprova lembra de cobrar em {dia(cobrar)}.</span>
        </button>
        <button type="button" className="pj-opt" onClick={reuniao}>
          <b>Agendar uma reunião com {cliente}</b>
          <span>Abre o convite na Agenda do Google. A tarefa vai para “Já saiu”.</span>
        </button>
        {!souKim && <button type="button" className="pj-opt" onClick={paraKim}>
          <b>Mandar para {kim ? nomeDe(kim) : 'a Kim'} aprovar antes</b>
          <span>Só se precisar de direção ou for decisão de gestão.</span>
        </button>}
        <button type="button" className="pj-opt" onClick={soFeito}>
          <b>Só marcar como feito</b>
          <span>Não precisa enviar nada: vai direto para “Já saiu”.</span>
        </button>
      </div>
      <div className="field" style={{ margin: '14px 0 0' }}>
        <label>Texto do e-mail de entrega (dá para mudar antes de abrir no Gmail)</label>
        <textarea className="textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="hint">Para: {p.report_to || '—'}{p.report_cc ? ` · Cc: ${p.report_cc}` : ''}</span>
      </div>
    </Modal>
  );
}

/** "Delegar": não sou eu que faço, é outra pessoa (com recado e, se quiser, novo prazo). */
export function Delegar({ t, ctx, onClose }: { t: Tarefa; ctx: Ctx; onClose: () => void }) {
  const { update, me } = useTarefaActions();
  const outras = ctx.pessoas.filter((p) => !(t.owner_id ? p.id === t.owner_id : nomeDe(p).toLowerCase() === t.owner_name.toLowerCase()));
  const [quem, setQuem] = useState(outras[0]?.id ?? '');
  const [prazo, setPrazo] = useState(t.due_date ?? '');
  const [recado, setRecado] = useState('');
  async function save() {
    const p = ctx.pessoas.find((x) => x.id === quem);
    if (!p) return;
    const nome = nomeDe(p);
    const ok = await update(t, { owner_id: contaId(p), owner_name: nome, ...(prazo && prazo !== t.due_date ? { due_date: prazo } : {}) },
      `${me.name.split(' ')[0]} delegou para ${nome}${t.owner_name ? ` (estava com ${t.owner_name})` : ''}.${recado.trim() ? ` Recado: ${recado.trim()}` : ''}${prazo && prazo !== t.due_date ? ` Novo prazo: ${dia(prazo)}.` : ''}`,
      `Agora está com ${nome}`);
    if (ok) onClose();
  }
  return (
    <Modal title="Delegar: quem faz esta tarefa?" onClose={onClose} foot={<><button className="btn ghost" onClick={onClose}>Voltar</button><button className="btn" disabled={!quem} onClick={save}>Delegar</button></>}>
      <p className="small muted" style={{ margin: '0 0 12px' }}>“{t.title}” está com <b>{t.owner_name || 'ninguém'}</b>. Ela sai da lista de quem está e vai para a de quem você escolher.</p>
      <div className="field"><label>Passar para</label>
        <div className="chips">{outras.map((p) => <button key={p.id} type="button" className={`chip-opt${quem === p.id ? ' on' : ''}`} onClick={() => setQuem(p.id)}>{nomeDe(p)}</button>)}</div>
      </div>
      <div className="field"><label>Prazo</label><input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>Recado (opcional)</label><input className="input" value={recado} onChange={(e) => setRecado(e.target.value)} placeholder="ex.: é decisão de gestão, contrato" /></div>
    </Modal>
  );
}

/** "Travou": de quem estamos esperando e quando cobrar. */
export function Travou({ t, ctx, onClose }: { t: Tarefa; ctx: Ctx; onClose: () => void }) {
  const { update } = useTarefaActions();
  const nomes = [...new Set([...(ctx.projeto.contatos ?? []).map((c) => c.nome), ...ctx.pessoas.filter((x) => x.owner).map(nomeDe)])];
  const [quem, setQuem] = useState(nomes[0] ?? '');
  const [data, setData] = useState(addBusinessDays(ctx.today, 2));
  const [obs, setObs] = useState('');
  async function save() {
    if (!quem.trim()) return;
    if (await update(t, { status: 'travado', waiting_on: quem.trim(), cobrar_em: data || null }, `Travou: esperando ${quem.trim()}.${obs.trim() ? ` ${obs.trim()}` : ''} Cobrar em ${dia(data)}.`, 'Foi para “Travado”')) onClose();
  }
  return (
    <Modal title="Travou: estamos esperando quem?" onClose={onClose} foot={<><button className="btn ghost" onClick={onClose}>Voltar</button><button className="btn" onClick={save}>Salvar</button></>}>
      <div className="field"><label>Esperando</label>
        <div className="chips">{nomes.map((n) => <button key={n} type="button" className={`chip-opt${quem === n ? ' on' : ''}`} onClick={() => setQuem(n)}>{n}</button>)}</div>
        <input className="input" value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="ou escreva outro nome" />
      </div>
      <div className="field"><label>Cobrar em</label><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>O que falta (opcional)</label><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: validação jurídica da promoção" /></div>
    </Modal>
  );
}

/** Detalhe da tarefa: dados, lista de itens (ex.: influenciadores) e movimentações. */
export function TarefaDetalhe({ t, ctx, onClose }: { t: Tarefa; ctx: Ctx; onClose: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const { update, me } = useTarefaActions();
  const [f, setF] = useState({ title: t.title, detail: t.detail, owner: t.owner_id ?? (t.owner_name ? `nome:${t.owner_name}` : ''), due: t.due_date ?? '', link: t.link_url, internal: t.internal, priority: t.priority });
  const [mov, setMov] = useState('');
  const [novos, setNovos] = useState('');
  const itens = [...(t.projeto_itens ?? [])].sort((a, b) => a.position - b.position);
  const movs = [...(t.projeto_movs ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function save() {
    const owner = ctx.pessoas.find((x) => x.id === f.owner);
    const ok = await update(t, {
      title: f.title.trim() || t.title, detail: f.detail, due_date: f.due || null, link_url: f.link.trim(), internal: f.internal, priority: f.priority,
      ...(owner ? { owner_id: contaId(owner), owner_name: nomeDe(owner) } : {}),
    }, undefined, 'Tarefa salva');
    if (ok) onClose();
  }
  async function addMov() {
    if (!mov.trim()) return;
    const { error } = await createClient().from('projeto_movs').insert({ tarefa_id: t.id, author_name: me.name, text: mov.trim().slice(0, 2000) });
    if (error) return toast('Não foi possível salvar.', 'err');
    await createClient().from('projeto_tarefas').update({ updated_at: new Date().toISOString() }).eq('id', t.id);
    setMov('');
    router.refresh();
  }
  async function toggle(id: string, done: boolean) {
    await createClient().from('projeto_itens').update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? me.name : '' }).eq('id', id);
    router.refresh();
  }
  async function note(id: string, text: string) {
    await createClient().from('projeto_itens').update({ note: text.slice(0, 300) }).eq('id', id);
  }
  async function addItens() {
    const labels = novos.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 200);
    if (!labels.length) return;
    const start = itens.length ? Math.max(...itens.map((i) => i.position)) + 1 : 0;
    const { error } = await createClient().from('projeto_itens').insert(labels.map((label, k) => ({ tarefa_id: t.id, label: label.slice(0, 200), position: start + k })));
    if (error) return toast('Não foi possível adicionar.', 'err');
    setNovos('');
    router.refresh();
  }
  async function cancel() {
    if (!(await confirm({ title: 'Cancelar esta tarefa?', text: 'Ela sai dos painéis.', okLabel: 'Cancelar tarefa', danger: true }))) return;
    if (await update(t, { status: 'cancelada' as TarefaStatus }, 'Tarefa cancelada.', 'Tarefa cancelada')) onClose();
  }

  return (
    <Modal title="Tarefa" wide onClose={onClose} foot={<>
      <button className="btn ghost" onClick={cancel}><Icon name="trash" />Cancelar tarefa</button>
      {t.status === 'saiu' && <button className="btn line" onClick={() => update(t, { status: 'andamento', done_at: null }, 'Reaberta.', 'Reaberta').then((ok) => ok && onClose())}>Reabrir</button>}
      <button className="btn" onClick={save}>Salvar</button>
    </>}>
      <div className="field"><label>O que fazer</label><input className="input" value={f.title} maxLength={300} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="row2">
        <div className="field"><label>Quem faz</label>
          <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
            {!t.owner_id && !t.owner_name && <option value="">Escolha…</option>}
            {ctx.pessoas.map((x) => <option key={x.id} value={x.id}>{nomeDe(x)}</option>)}
          </select>
        </div>
        <div className="field"><label>Prazo</label><input className="input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
      </div>
      <div className="field"><label>Detalhes</label><textarea className="textarea" rows={4} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></div>
      <div className="row2">
        <div className="field"><label>Link (Drive, Docs)</label><input className="input" type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></div>
        <div className="field"><label>Prioridade</label>
          <select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Tarefa['priority'] })}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>
        </div>
      </div>
      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 14px' }}>
        <input type="checkbox" checked={f.internal} onChange={(e) => setF({ ...f, internal: e.target.checked })} /> Só interno (não entra no relatório de sexta)
      </label>
      {t.source_url && <p className="small" style={{ margin: '0 0 12px' }}><a href={t.source_url} target="_blank" rel="noopener noreferrer">Ver a origem ({t.source})</a></p>}

      {(itens.length > 0 || t.kind === 'tarefa') && (
        <div className="pj-sub">
          <b>Lista {itens.length ? `· ${itens.filter((i) => i.done).length} de ${itens.length}` : ''}</b>
          {itens.map((i) => (
            <div key={i.id} className={`pj-item${i.done ? ' done' : ''}`}>
              <label><input type="checkbox" checked={i.done} onChange={(e) => toggle(i.id, e.target.checked)} /> {i.label}</label>
              <input className="input sm" defaultValue={i.note} placeholder="observação (respondeu? topa permuta?)" onBlur={(e) => e.target.value !== i.note && note(i.id, e.target.value)} />
            </div>
          ))}
          <textarea className="textarea" rows={2} value={novos} onChange={(e) => setNovos(e.target.value)} placeholder="Adicionar itens: um por linha" />
          {novos.trim() && <div><button className="btn sm line" onClick={addItens}><Icon name="plus" />Adicionar à lista</button></div>}
        </div>
      )}

      <div className="pj-sub">
        <b>Movimentações</b>
        <div className="row" style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={mov} onChange={(e) => setMov(e.target.value)} placeholder="Comentário curto: ex. enviado ao Rafa em 12/11, aguardando" onKeyDown={(e) => { if (e.key === 'Enter') void addMov(); }} />
          <button className="btn sm" onClick={addMov}>Registrar</button>
        </div>
        {movs.map((m) => <div key={m.id} className="pj-mov"><b>{m.author_name.split(' ')[0]} · {quando(m.created_at, ctx.projeto.timezone)}</b> {m.text}</div>)}
        {!movs.length && <span className="small muted">Nenhuma movimentação ainda.</span>}
      </div>
    </Modal>
  );
}

/** Nova tarefa ("Anotar pedido novo"): toda solicitação vira tarefa no mesmo dia, com responsável e prazo. */
export function NovaTarefa({ ctx, defaultOwner, initial, onClose, onSaved }: {
  ctx: Ctx; defaultOwner: string; initial?: { title?: string; detail?: string }; onClose: () => void; onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { toast } = useUI();
  const me = useMe();
  const [f, setF] = useState({ title: initial?.title ?? '', detail: initial?.detail ?? '', owner: defaultOwner, due: '', link: '', internal: false });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.title.trim()) return toast('Escreva o que precisa ser feito.', 'err');
    if (!f.owner) return toast('Escolha quem faz.', 'err');
    if (!f.due) return toast('Toda tarefa tem prazo: escolha a data.', 'err');
    const owner = ctx.pessoas.find((x) => x.id === f.owner);
    setBusy(true);
    const { data, error } = await createClient().from('projeto_tarefas').insert({
      projeto_id: ctx.projeto.id, title: f.title.trim().slice(0, 300), detail: f.detail, owner_id: contaId(owner), owner_name: owner ? nomeDe(owner) : '',
      due_date: f.due, link_url: f.link.trim(), internal: f.internal, created_by_name: me.name,
    }).select('id').single();
    setBusy(false);
    if (error) return toast('Não foi possível salvar.', 'err');
    toast('Tarefa anotada');
    onSaved?.(data.id as string);
    router.refresh();
    onClose();
  }
  return (
    <Modal title="Anotar pedido novo" onClose={onClose} foot={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={save}>Salvar</button></>}>
      <div className="field"><label>O que precisa ser feito</label><input className="input" value={f.title} maxLength={300} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="row2">
        <div className="field"><label>Quem faz</label>
          <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
            <option value="">Escolha…</option>
            {ctx.pessoas.map((x) => <option key={x.id} value={x.id}>{nomeDe(x)}</option>)}
          </select>
        </div>
        <div className="field"><label>Prazo</label><input className="input" type="date" min={ctx.today} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
      </div>
      <div className="field"><label>Detalhes (opcional)</label><textarea className="textarea" rows={3} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></div>
      <div className="field"><label>Link (opcional)</label><input className="input" type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></div>
      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={f.internal} onChange={(e) => setF({ ...f, internal: e.target.checked })} /> Só interno (não entra no relatório de sexta)
      </label>
    </Modal>
  );
}

export function Section({ title, tone, children, empty }: { title: string; tone?: 'late' | 'warn' | 'wait' | 'ok'; children: ReactNode; empty?: string }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  if (!has && !empty) return null;
  return (
    <section className="pj-section">
      <h2 className={tone ? `t-${tone}` : ''}>{title}</h2>
      {has ? <div className="pj-list">{children}</div> : <p className="small muted" style={{ margin: 0 }}>{empty}</p>}
    </section>
  );
}
