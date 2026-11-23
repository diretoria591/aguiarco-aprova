'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { safePath, uploadFile } from '@/lib/upload';
import { addMonths, currentMonth, monthLabel } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { useMe } from '@/components/admin/me';

type Row = { t: string; tx: string; pub: string; ref: string; notes: string; file: File | null };
const blank = (): Row => ({ t: '', tx: '', pub: '', ref: '', notes: '', file: null });

export function NewForm({ clients, initialClient, initialMonth, error }: {
  clients: { id: string; name: string; team: string | null }[];
  initialClient: string | null; initialMonth: string | null; error: string | null;
}) {
  const me = useMe();
  const router = useRouter();
  const { toast } = useUI();
  const base = currentMonth();
  const months = [0, 1, 2, 3].map((n) => addMonths(base, n));
  const [clientId, setClientId] = useState(clients.find((c) => c.id === initialClient)?.id ?? clients[0]?.id ?? '');
  const [month, setMonth] = useState(initialMonth && months.includes(initialMonth) ? initialMonth : base);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [list, setList] = useState('');
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === clientId);
  const filled = rows.filter((r) => r.t.trim()).length;
  const set = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  function fromList() {
    const titles = list.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!titles.length) return toast('Cole os títulos, um por linha.', 'err');
    setRows((all) => {
      const keep = all.length === 1 && !all[0].t && !all[0].tx ? [] : all;
      return [...keep, ...titles.map((t) => ({ ...blank(), t }))];
    });
    setList('');
    toast(`${titles.length} roteiros adicionados à lista`);
  }

  async function save() {
    const todo = rows.filter((r) => r.t.trim());
    if (!clientId) return toast('Escolha o cliente.', 'err');
    if (!todo.length) return toast('Dê um título a pelo menos um roteiro.', 'err');
    setBusy(true);
    try {
      const batch = crypto.randomUUID();
      const payload = [];
      for (let i = 0; i < todo.length; i++) {
        const r = todo[i];
        let content_url: string | null = null;
        if (r.file) content_url = await uploadFile(safePath(`roteiros/${clientId}`, r.file, i), r.file);
        payload.push({
          client_id: clientId,
          month: r.pub ? r.pub.slice(0, 7) : month,
          title: r.t.trim(),
          content: r.tx.trim(),
          content_url, content_name: r.file?.name ?? null,
          ref_url: r.ref.trim() || null,
          pub_date: r.pub || null,
          notes: r.notes.trim(),
          author_id: me.id, author_name: me.name,
          batch_id: batch, batch_size: todo.length,
        });
      }
      const { error: e } = await createClient().from('roteiros').insert(payload);
      if (e) throw e;
      toast(`${todo.length} roteiro${todo.length > 1 ? 's cadastrados' : ' cadastrado'}. Já aparece${todo.length > 1 ? 'm' : ''} para quem grava.`);
      router.push(`/dashboard/roteiros/${clientId}?mes=${todo[0].pub ? todo[0].pub.slice(0, 7) : month}`);
      router.refresh();
    } catch (e) {
      toast(errMsg(e), 'err');
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/dashboard/roteiros" className="rt-back"><Icon name="left" />Roteiros</Link>
      <div className="hello"><div><p className="eyebrow">Cadastro</p><h1>Novos <b>roteiros</b></h1></div></div>
      {error && <div className="card empty"><h3>Algo não <b>carregou</b></h3><p>{error}</p></div>}
      {!error && clients.length === 0 && <div className="card empty"><h3>Nenhum cliente em <b>Roteiros</b></h3><p>Um admin precisa escolher os clientes em “Equipes e clientes”.</p></div>}

      {clients.length > 0 && (
        <div className="rt-form">
          <div className="card rt-pad">
            <div className="row2">
              <div className="field"><label>Cliente</label>
                <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Mês dos roteiros</label>
                <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </div>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              <b>Quem grava:</b> {client?.team ?? 'ninguém definido ainda'}. Cada roteiro aparece para essa equipe assim que for cadastrado. Se você informar a data de publicação, o mês é o da data.
            </p>
          </div>

          <div className="card rt-pad">
            <b>Colar vários de uma vez</b>
            <p className="muted small" style={{ margin: '2px 0 10px' }}>Um título por linha. Eu crio um roteiro para cada linha e você completa o resto depois.</p>
            <textarea className="textarea" value={list} onChange={(e) => setList(e.target.value)} placeholder={'Dica da semana\nAntes e depois\nVídeo de Natal'} />
            <div style={{ marginTop: 10 }}><button className="btn sm line" onClick={fromList}>Criar roteiros da lista</button></div>
          </div>

          {rows.map((r, i) => (
            <div className="card rt-pad" key={i}>
              <div className="rt-rowhead">
                <b>Roteiro {i + 1}</b>
                {rows.length > 1 && <button className="btn sm ghost" onClick={() => setRows((all) => all.filter((_, k) => k !== i))}><Icon name="trash" />Remover</button>}
              </div>
              <div className="field"><label>Título</label>
                <input className="input" value={r.t} maxLength={200} onChange={(e) => set(i, { t: e.target.value })} placeholder="Ex.: Vídeo de Natal" />
              </div>
              <div className="field"><label>Roteiro (texto ou link do Doc)</label>
                <textarea className="textarea" value={r.tx} onChange={(e) => set(i, { tx: e.target.value })} />
              </div>
              <div className="field"><label>Ou anexe o arquivo do roteiro</label>
                <input type="file" onChange={(e) => set(i, { file: e.target.files?.[0] ?? null })} />
              </div>
              <div className="row2">
                <div className="field"><label>Data prevista de publicação (opcional)</label>
                  <input className="input" type="date" value={r.pub} onChange={(e) => set(i, { pub: e.target.value })} />
                </div>
                <div className="field"><label>Link de inspiração (opcional)</label>
                  <input className="input" type="url" value={r.ref} onChange={(e) => set(i, { ref: e.target.value })} placeholder="https://…" />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}><label>Observações para quem vai gravar</label>
                <input className="input" value={r.notes} onChange={(e) => set(i, { notes: e.target.value })} />
              </div>
            </div>
          ))}

          <div className="rt-submit">
            <button className="btn line" onClick={() => setRows((all) => [...all, blank()])}><Icon name="plus" />Adicionar outro roteiro</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Cadastrando…' : `Cadastrar ${filled > 1 ? filled + ' roteiros' : 'roteiro'}`}</button>
          </div>
        </div>
      )}
    </>
  );
}
