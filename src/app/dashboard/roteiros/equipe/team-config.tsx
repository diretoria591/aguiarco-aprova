'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentMonth, monthOf } from '@/lib/format';
import { gravacaoLink, type Equipe, type Roteiro, type RtClient } from '@/lib/roteiros';
import { Icon } from '@/components/icon';
import { copyText, useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import type { Client } from '@/lib/types';

export function TeamConfig({ clients, allClients, roteiros, teams, error }: {
  clients: RtClient[]; allClients: Pick<Client, 'id' | 'name' | 'logo_url'>[];
  roteiros: Roteiro[]; teams: Equipe[]; error: string | null;
}) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [name, setName] = useState('');
  const [first, setFirst] = useState('');
  const [add, setAdd] = useState('');
  const month = currentMonth();

  const done = (t: Equipe) => roteiros.filter((r) => r.delivered_team === t.id && r.delivered_at && monthOf(r.delivered_at) === month).length;
  const max = Math.max(10, ...teams.map(done));
  const free = allClients.filter((c) => !clients.some((x) => x.client_id === c.id));

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error: e } = await p;
    if (e) return toast(errMsg(e), 'err');
    toast(ok);
    router.refresh();
  }
  const sb = () => createClient();

  async function addTeam() {
    if (!name.trim()) return toast('Dê um nome à equipe.', 'err');
    await run(sb().from('roteiro_equipes').insert({ name: name.trim(), first_name: (first || name).trim().split(/\s+/).pop() ?? '' }), 'Equipe criada');
    setName(''); setFirst('');
  }
  async function copyLink(t: Equipe) {
    const ok = await copyText(gravacaoLink(t.access_token, window.location.origin));
    toast(ok ? 'Link copiado' : 'Não deu para copiar. Selecione e copie manualmente.', ok ? undefined : 'err');
  }
  async function newLink(t: Equipe) {
    const ok = await confirm({ title: 'Gerar novo link?', text: `O link atual de ${t.name} deixa de funcionar na hora.`, okLabel: 'Gerar novo link' });
    if (!ok) return;
    await run(sb().rpc('roteiro_new_token', { p_team: t.id }), 'Novo link gerado');
  }
  async function delTeam(t: Equipe) {
    const ok = await confirm({ title: `Remover ${t.name}?`, text: 'Os clientes dessa equipe ficam sem equipe de gravação. Os roteiros já entregues continuam.', okLabel: 'Remover', danger: true });
    if (!ok) return;
    await run(sb().from('roteiro_equipes').delete().eq('id', t.id), 'Equipe removida');
  }
  async function enroll() {
    if (!add) return;
    await run(sb().from('roteiro_clientes').insert({ client_id: add }), 'Cliente adicionado em Roteiros');
    setAdd('');
  }
  const setTeam = (c: RtClient, team: string) =>
    run(sb().from('roteiro_clientes').update({ team_id: team || null }).eq('client_id', c.client_id), 'Quem grava foi atualizado');
  async function unenroll(c: RtClient) {
    const ok = await confirm({ title: `Tirar ${c.clients!.name} de Roteiros?`, text: 'Os roteiros dele serão apagados. O cliente continua normal no Aprova.', okLabel: 'Tirar', danger: true });
    if (!ok) return;
    const a = await sb().from('roteiros').delete().eq('client_id', c.client_id);
    if (a.error) return toast(errMsg(a.error), 'err');
    await run(sb().from('roteiro_clientes').delete().eq('client_id', c.client_id), 'Cliente removido de Roteiros');
  }

  return (
    <>
      <Link href="/dashboard/roteiros" className="rt-back"><Icon name="left" />Roteiros</Link>
      <div className="hello"><div><p className="eyebrow">Só admin</p><h1>Equipes e <b>clientes</b></h1></div></div>
      {error && <div className="card empty" style={{ marginBottom: 20 }}><h3>Algo não <b>carregou</b></h3><p>{error}</p></div>}

      <div className="sec-head"><h2>Produtividade <b>do mês</b></h2></div>
      <div className="card rt-pad" style={{ marginBottom: 28 }}>
        {teams.length === 0 && <p className="muted" style={{ margin: 0 }}>Crie uma equipe de gravação abaixo.</p>}
        {teams.map((t) => (
          <div key={t.id} className="rt-prod">
            <div className="rt-prodtop"><span>{t.name}</span><b>{done(t)} vídeos</b></div>
            <div className="rt-bar"><i style={{ width: `${Math.min(100, (done(t) / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="sec-head"><h2>Equipes de <b>gravação</b></h2></div>
      <p className="muted small" style={{ marginTop: -8 }}>Cada equipe entra por um link exclusivo, sem senha. Ela só vê os clientes dela.</p>
      <div className="rt-stack">
        {teams.map((t) => (
          <div key={t.id} className="card rt-pad">
            <div className="rt-rowhead">
              <div><b>{t.name}</b><div className="muted small">“Oi, filmmaker da {t.first_name || t.name}!”</div></div>
              <div className="rt-row">
                <button className="btn sm line" onClick={() => copyLink(t)}><Icon name="copy" />Copiar link</button>
                <button className="btn sm ghost" onClick={() => newLink(t)}><Icon name="refresh" />Novo link</button>
                <button className="btn sm ghost" onClick={() => delTeam(t)} aria-label="Remover equipe"><Icon name="trash" /></button>
              </div>
            </div>
          </div>
        ))}
        <div className="card rt-pad">
          <div className="row2">
            <div className="field"><label>Nome da equipe</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Equipe da Vivi" /></div>
            <div className="field"><label>Como chamar na mensagem</label><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Ex.: Vivi" /></div>
          </div>
          <button className="btn sm" onClick={addTeam}><Icon name="plus" />Criar equipe</button>
        </div>
      </div>

      <div className="sec-head" style={{ marginTop: 32 }}><h2>Quem <b>grava</b> cada cliente</h2></div>
      <p className="muted small" style={{ marginTop: -8 }}>Escolha a equipe de cada cliente. Os roteiros novos aparecem direto para ela.</p>
      <div className="rt-stack">
        {clients.map((c) => (
          <div key={c.client_id} className="card rt-pad">
            <div className="rt-rowhead">
              <b>{c.clients!.name}</b>
              <div className="rt-row">
                <select className="input rt-sel" value={c.team_id ?? ''} onChange={(e) => setTeam(c, e.target.value)}>
                  <option value="">Sem equipe definida</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn sm ghost" onClick={() => unenroll(c)} aria-label="Tirar de Roteiros"><Icon name="trash" /></button>
              </div>
            </div>
          </div>
        ))}
        <div className="card rt-pad">
          <div className="rt-row">
            <select className="input rt-sel" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Adicionar cliente do Aprova…</option>
              {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn sm" disabled={!add} onClick={enroll}><Icon name="plus" />Adicionar</button>
          </div>
        </div>
      </div>
    </>
  );
}
