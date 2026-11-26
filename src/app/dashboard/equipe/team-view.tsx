'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import type { Profile, TeamRole } from '@/lib/types';

const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', team: 'Equipe', scheduler: 'Só vê e agenda' };
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import { addMember, removeMember } from './actions';
import { SECTIONS, allowedSections } from '@/lib/sections';
import { WEEKDAYS } from '@/lib/alteracoes';

export function TeamView({ team, canManage }: { team: Profile[]; canManage: boolean }) {
  const me = useMe();
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const isAdmin = !!me.owner;

  async function toggleSection(u: Profile, key: string) {
    const cur: string[] = allowedSections({ owner: u.owner, sections: u.sections, role: u.role ?? 'team' });
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    const { error } = await createClient().from('profiles').update({ sections: next }).eq('id', u.id);
    if (error) return toast('Não foi possível mudar as permissões.', 'err');
    router.refresh();
  }
  async function setRole(u: Profile, role: TeamRole) {
    if ((u.role ?? 'team') === role) return;
    const { error } = await createClient().from('profiles').update({ role }).eq('id', u.id);
    if (error) return toast(/função/.test(error.message) ? error.message : 'Não foi possível mudar a função.', 'err');
    toast(`${u.name.split(/\s+/)[0]} agora é ${ROLE_LABEL[role]}`);
    router.refresh();
  }

  async function del(u: Profile) {
    const ok = await confirm({ title: `Remover ${u.name}?`, text: 'A pessoa perde o acesso ao painel imediatamente.', okLabel: 'Remover', danger: true });
    if (!ok) return;
    const r = await removeMember(u.id);
    if (!r.ok) return toast(r.error, 'err');
    toast('Acesso removido');
    router.refresh();
  }

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Acessos</p><h1>Nossa <b>equipe</b></h1></div>
        <button className="btn" onClick={() => setAddOpen(true)}><Icon name="plus" />Adicionar pessoa</button>
      </div>
      <div className="layout">
        <section className="team-list">
          {team.map((u) => (
            <div className="card member" key={u.id}>
              <div className="avatar">{initials(u.name)}</div>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{u.name}{u.id === me.id && <> <span className="muted small">(você)</span></>}</div>
                <div className="small muted">{u.email}</div>
              </div>
              {u.owner ? <span className="role-tag">Dona da conta · vê tudo</span>
                : isAdmin && u.id !== me.id ? (
                <div className="rolepick" role="group" aria-label={`Função de ${u.name}`}>
                  {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => (
                    <button key={r} className={(u.role ?? 'team') === r ? 'on' : ''} onClick={() => setRole(u, r)}>{ROLE_LABEL[r]}</button>
                  ))}
                </div>
              ) : (
                <span className="role-tag">{ROLE_LABEL[u.role ?? 'team']}</span>
              )}
              {u.id === me.id
                ? <button className="btn sm line" onClick={() => setPwOpen(true)}><Icon name="key" />Trocar senha</button>
                : <button className="btn sm danger" onClick={() => del(u)}>Remover</button>}
              {isAdmin && !u.owner && (
                <div className="perm-row" role="group" aria-label={`O que ${u.name} vê`}>
                  <span className="small muted">Vê:</span>
                  {SECTIONS.filter((x) => x.key !== 'equipe').map((x) => {
                    const on = allowedSections({ owner: u.owner, sections: u.sections, role: u.role ?? 'team' }).includes(x.key);
                    return <button key={x.key} className={on ? 'on' : ''} onClick={() => toggleSection(u, x.key)} aria-pressed={on}>{x.label}</button>;
                  })}
                </div>
              )}
              {isAdmin && <DeliveryRow u={u} />}
            </div>
          ))}
        </section>
        <aside className="side">
          <div className="card">
            <h3>Como funciona</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Cada pessoa vê só as abas marcadas em “Vê”. A dona da conta vê tudo, é a única que muda permissões e pode usar o “Ver como” (no topo) para ver o painel de qualquer pessoa sem precisar de senha. Clientes não precisam de senha: cada um acessa pelo próprio link.
            </p>
            <p className="small muted" style={{ margin: '10px 0 0' }}>
              <b style={{ color: 'var(--ink)', fontWeight: 500 }}>Só vê e agenda</b>: vê os clientes, mas não cadastra, não envia material nem edita. Pode agendar (aba Agendamento) e fazer as alterações que forem passadas para ela. Só a dona da conta muda funções e permissões.
            </p>
            {!canManage && (
              <p className="small muted" style={{ margin: '10px 0 0' }}>
                Para adicionar pessoas por aqui, configure a variável <code>SUPABASE_SERVICE_ROLE_KEY</code> no servidor — ou crie o acesso em Authentication → Users no Supabase.
              </p>
            )}
          </div>
        </aside>
      </div>
      {addOpen && <AddMember onClose={() => setAddOpen(false)} />}
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </>
  );
}

function AddMember({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  async function ok() {
    const f = Object.fromEntries(new FormData(ref.current!)) as Record<string, string>;
    setBusy(true);
    const r = await addMember({ name: f.name, email: f.email, password: f.password });
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast('Acesso criado');
    onClose();
    router.refresh();
  }
  return (
    <Modal title={<>Adicionar <b>pessoa</b></>} onClose={onClose}
      foot={<><button className="btn line" onClick={onClose}>Cancelar</button><button className="btn" onClick={ok} disabled={busy}>Adicionar</button></>}>
      <form ref={ref} onSubmit={(e) => { e.preventDefault(); ok(); }}>
        <div className="field"><label>Nome</label><input className="input" name="name" required /></div>
        <div className="field"><label>E-mail</label><input className="input" name="email" type="email" required /></div>
        <div className="field"><label>Senha inicial</label><input className="input" name="password" type="text" minLength={8} required placeholder="mínimo 8 caracteres" /></div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { toast } = useUI();
  const [pw, setPw] = useState('');
  async function ok() {
    if (pw.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', 'err');
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) return toast(error.message, 'err');
    toast('Senha atualizada');
    onClose();
  }
  return (
    <Modal title={<>Trocar <b>senha</b></>} onClose={onClose}
      foot={<><button className="btn line" onClick={onClose}>Cancelar</button><button className="btn" onClick={ok}>Salvar</button></>}>
      <div className="field">
        <label>Nova senha</label>
        <input className="input" type="password" minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ok(); }} />
      </div>
    </Modal>
  );
}

/** Pedidos de alteração: se a pessoa faz alterações e quando entrega (para o prazo sugerido). */
function DeliveryRow({ u }: { u: Profile }) {
  const router = useRouter();
  const { toast } = useUI();
  const [nick, setNick] = useState(u.nickname ?? '');
  const [job, setJob] = useState(u.job ?? '');
  const [hours, setHours] = useState(u.delivery_hours ?? '');
  const days = u.delivery_days ?? [1, 2, 3, 4, 5];
  async function save(patch: Partial<Profile>, msg?: string) {
    const { error } = await createClient().from('profiles').update(patch).eq('id', u.id);
    if (error) return toast('Não foi possível salvar.', 'err');
    if (msg) toast(msg);
    router.refresh();
  }
  const toggleDay = (n: number) => save({ delivery_days: days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort() });
  return (
    <div className="perm-row deliv-row" role="group" aria-label={`Alterações de ${u.name}`}>
      <span className="small muted">Alterações:</span>
      <button className={u.does_changes ? 'on' : ''} aria-pressed={!!u.does_changes}
        onClick={() => save({ does_changes: !u.does_changes }, u.does_changes ? 'Saiu dos botões de alteração' : 'Aparece nos botões de alteração')}>
        {u.does_changes ? 'Faz alterações ✓' : 'Faz alterações'}
      </button>
      {u.does_changes && (
        <>
          <span className="small muted">Entrega:</span>
          {WEEKDAYS.map((w) => (
            <button key={w.n} className={days.includes(w.n) ? 'on' : ''} aria-pressed={days.includes(w.n)} onClick={() => toggleDay(w.n)}>{w.short}</button>
          ))}
          <input className="input sm" aria-label="Horário" placeholder="Horário (ex.: 13h às 19h)" value={hours}
            onChange={(e) => setHours(e.target.value)} onBlur={() => hours !== (u.delivery_hours ?? '') && save({ delivery_hours: hours.trim() })} />
          <input className="input sm" aria-label="Nome no botão" placeholder="Nome no botão (ex.: Duda)" value={nick}
            onChange={(e) => setNick(e.target.value)} onBlur={() => nick !== (u.nickname ?? '') && save({ nickname: nick.trim() })} />
          <input className="input sm" aria-label="O que faz" placeholder="O que faz (ex.: Design)" value={job}
            onChange={(e) => setJob(e.target.value)} onBlur={() => job !== (u.job ?? '') && save({ job: job.trim() })} />
        </>
      )}
    </div>
  );
}
