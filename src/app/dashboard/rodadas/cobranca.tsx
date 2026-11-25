'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fmtDate, fmtDay } from '@/lib/format';
import {
  EXTRA_ROUND_PRICE, REGION_CURRENCY, REGION_LABEL, money, priceOf, regionOf, round2,
  type BillingClient, type BillingRegion, type ExtraCharge,
} from '@/lib/cobranca';
import type { Extra } from '@/lib/rodadas-extras';
import { useUI } from '@/components/ui';

/** Rodadas extras de um cliente no mês, com a cobrança (Asaas na mensalidade ou Wise). */
export function ClientExtras({ client, items, charge, month, owner }: {
  client: BillingClient; items: Extra[]; charge: ExtraCharge | null; month: string; owner: boolean;
}) {
  const router = useRouter();
  const { toast, confirm } = useUI();
  const region = regionOf(client);
  const cur = REGION_CURRENCY[region];
  const unit = priceOf(client);
  const done = charge && charge.status !== 'falhou' ? charge : null;
  const [picked, setPicked] = useState<Set<string>>(() => new Set(done ? done.comment_ids : items.map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const total = round2(unit * picked.size);

  async function charge_(via: 'asaas' | 'wise') {
    if (!picked.size) return toast('Marque ao menos uma rodada para cobrar.', 'err');
    const ok = await confirm(via === 'asaas'
      ? {
        title: `Somar ${money(total, cur)} na mensalidade?`,
        text: `${picked.size} rodada${picked.size > 1 ? 's' : ''} extra${picked.size > 1 ? 's' : ''} de ${client.name} entram na próxima mensalidade em aberto no Asaas, no mesmo vencimento, com a descrição dos pedidos. O Asaas avisa o cliente do novo valor.`,
        okLabel: 'Somar na mensalidade',
      }
      : { title: `Marcar ${money(total, cur)} como cobrado?`, text: `Registra que as rodadas extras de ${client.name} foram cobradas pelo Wise.`, okLabel: 'Marcar como cobrado' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/rodadas/cobrar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, month, commentIds: [...picked], via }),
      });
      const j = await r.json().catch(() => ({})) as { error?: string; status?: string; dueDate?: string; newValue?: number };
      if (!r.ok) toast(j.error ?? 'Não foi possível cobrar.', 'err');
      else if (j.status === 'mensalidade') toast(`Somado na mensalidade de ${fmtDay(j.dueDate)}: agora ${money(j.newValue ?? 0, cur)}`);
      else if (j.status === 'avulsa') toast(`Cobrança criada no Asaas com vencimento em ${fmtDay(j.dueDate)}`);
      else toast('Marcado como cobrado pelo Wise');
      router.refresh();
    } catch {
      toast('Sem conexão. Tente de novo.', 'err');
    } finally {
      setBusy(false);
    }
  }

  async function undoWise() {
    if (!charge || !(await confirm({ title: 'Desfazer a marcação?', text: 'As rodadas voltam a aparecer como não cobradas.', okLabel: 'Desfazer' }))) return;
    const { error } = await createClient().from('extra_charges').delete().eq('id', charge.id).eq('status', 'wise');
    if (error) toast(error.message, 'err'); else router.refresh();
  }

  return (
    <section className="card" style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <b>{client.name}</b>
        <span className="muted small">{items.length} extra{items.length > 1 ? 's' : ''} · {REGION_LABEL[region]} · {money(unit, cur)} por rodada</span>
      </div>
      {items.map((it) => (
        <label key={it.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: owner && !done ? 'pointer' : 'default' }}>
          {owner && (
            <input type="checkbox" style={{ marginTop: 4 }} disabled={!!done || busy} checked={picked.has(it.id)}
              onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(it.id); else n.delete(it.id); return n; })} />
          )}
          <div style={{ flex: 1, opacity: owner && !picked.has(it.id) ? 0.5 : 1 }}>
            <div style={{ fontWeight: 500 }}>{it.title}</div>
            <div className="small muted" suppressHydrationWarning>
              {it.n}ª rodada (limite {it.limit}) · {it.by ? `${it.by} · ` : ''}{fmtDate(it.at)}
            </div>
            <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{it.content}</div>
          </div>
        </label>
      ))}

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {done ? (
          <>
            <span className="status aprovado">
              {done.status === 'wise' ? 'Cobrado pelo Wise'
                : done.status === 'mensalidade' ? 'Somado na mensalidade'
                : done.status === 'avulsa' ? 'Cobrança criada no Asaas' : 'Cobrando…'}
            </span>
            <span className="small" suppressHydrationWarning>
              <b>{money(Number(done.total), done.currency)}</b> · {done.rounds} rodada{done.rounds > 1 ? 's' : ''}
              {done.asaas_due_date ? ` · vence ${fmtDay(done.asaas_due_date)}` : ''}
              {done.status === 'mensalidade' && done.previous_value !== null ? ` · mensalidade era ${money(Number(done.previous_value), 'BRL')}` : ''}
              {done.charged_at ? ` · ${done.charged_by || 'equipe'}, ${fmtDate(done.charged_at, false)}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            {done.asaas_invoice_url && <a className="btn line sm" href={done.asaas_invoice_url} target="_blank" rel="noopener noreferrer">Ver fatura</a>}
            {owner && done.status === 'wise' && <button className="btn line sm" onClick={undoWise}>Desfazer</button>}
          </>
        ) : (
          <>
            <span className="small">
              Total: <b>{money(total, cur)}</b>{picked.size !== items.length ? ` (${picked.size} de ${items.length})` : ''}
            </span>
            {charge?.status === 'falhou' && <span className="small" style={{ color: 'var(--late)' }}>Última tentativa falhou: {charge.error}</span>}
            <span style={{ flex: 1 }} />
            {!owner ? <span className="small muted">Só a dona da conta gera a cobrança.</span>
              : region === 'europa'
                ? <button className="btn sm" disabled={busy || !picked.size} onClick={() => charge_('wise')}>Marcar como cobrado no Wise</button>
                : !client.asaas_customer_id
                  ? <span className="small muted">Ligue o cliente ao Asaas em “Configurar cobrança”, no fim da página.</span>
                  : <button className="btn sm" disabled={busy || !picked.size} onClick={() => charge_('asaas')}>{busy ? 'Cobrando…' : 'Somar na mensalidade'}</button>}
          </>
        )}
      </div>
    </section>
  );
}

type Customer = { id: string; name: string; doc: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Região, valor da rodada e cliente do Asaas de cada cliente (só a dona da conta). */
export function BillingSetup({ clients }: { clients: BillingClient[] }) {
  const router = useRouter();
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [rows, setRows] = useState(() => clients.map((c) => ({
    id: c.id, name: c.name, region: regionOf(c),
    price: c.extra_round_price === null || c.extra_round_price === undefined ? '' : String(c.extra_round_price),
    asaas: c.asaas_customer_id ?? '',
  })));
  const [busy, setBusy] = useState(false);

  async function openPanel() {
    setOpen((o) => !o);
    if (customers || open) return;
    try {
      const r = await fetch('/api/asaas/clientes');
      const j = await r.json() as { customers?: Customer[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? 'Falha ao buscar no Asaas.');
      const list = j.customers ?? [];
      setCustomers(list);
      // sugere pelo nome quem ainda não está ligado
      setRows((rs) => rs.map((r) => {
        if (r.asaas || r.region !== 'brasil') return r;
        const n = norm(r.name);
        const hit = list.filter((c) => norm(c.name) === n || norm(c.name).includes(n) || n.includes(norm(c.name)));
        return hit.length === 1 ? { ...r, asaas: hit[0].id } : r;
      }));
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Falha ao buscar no Asaas.');
    }
  }

  async function save() {
    setBusy(true);
    const supabase = createClient();
    for (const r of rows) {
      const price = r.price.trim() === '' ? null : Number(r.price.replace(',', '.'));
      if (price !== null && !(price >= 0)) { setBusy(false); return toast(`Valor inválido em ${r.name}.`, 'err'); }
      const { error } = await supabase.from('clients').update({
        billing_region: r.region, extra_round_price: price, asaas_customer_id: r.region === 'brasil' ? r.asaas : '',
      }).eq('id', r.id);
      if (error) { setBusy(false); return toast(`${r.name}: ${error.message}`, 'err'); }
    }
    setBusy(false);
    toast('Configuração de cobrança salva');
    router.refresh();
  }

  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const suggested = (id: string) => !clients.find((c) => c.id === id)?.asaas_customer_id && !!rows.find((r) => r.id === id)?.asaas;

  return (
    <section className="card" style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
      <button className="btn line sm" style={{ justifySelf: 'start' }} onClick={openPanel}>{open ? 'Fechar' : 'Configurar cobrança'}</button>
      {open && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Brasil: as rodadas extras são somadas na próxima mensalidade do Asaas (padrão {money(EXTRA_ROUND_PRICE.brasil, 'BRL')} por rodada).
            Europa: o valor aparece aqui e no e-mail do fechamento para cobrar pelo Wise (padrão {money(EXTRA_ROUND_PRICE.europa, 'EUR')}).
            Deixe o valor vazio para usar o padrão.
          </p>
          {loadErr && <p className="small" style={{ margin: 0, color: 'var(--late)' }}>Asaas: {loadErr}</p>}
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.2fr) 150px 110px minmax(180px,2fr)', gap: 8, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 10 }} className="bill-row">
              <b className="small">{r.name}</b>
              <select className="input" value={r.region} onChange={(e) => set(r.id, { region: e.target.value as BillingRegion })}>
                <option value="brasil">Brasil · Asaas</option>
                <option value="europa">Europa · Wise</option>
              </select>
              <input className="input" inputMode="decimal" placeholder={String(EXTRA_ROUND_PRICE[r.region]).replace('.', ',')}
                value={r.price} onChange={(e) => set(r.id, { price: e.target.value })} aria-label={`Valor da rodada de ${r.name}`} />
              {r.region === 'brasil' ? (
                <select className="input" value={r.asaas} onChange={(e) => set(r.id, { asaas: e.target.value })} aria-label={`Cliente no Asaas de ${r.name}`}>
                  <option value="">{customers ? 'Escolha o cliente no Asaas' : r.asaas ? `Ligado (${r.asaas})` : 'Carregando o Asaas…'}</option>
                  {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.doc ? ` · ${c.doc}` : ''}</option>)}
                </select>
              ) : <span className="small muted">Cobrança manual pelo Wise</span>}
              {suggested(r.id) && <span className="small" style={{ gridColumn: '1 / -1', color: 'var(--brown)' }}>Sugerido pelo nome. Confira antes de salvar.</span>}
            </div>
          ))}
          <button className="btn sm" style={{ justifySelf: 'start' }} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>
        </>
      )}
    </section>
  );
}
