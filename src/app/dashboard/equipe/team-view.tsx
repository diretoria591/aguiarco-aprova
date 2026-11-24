'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import type { Profile, TeamRole } from '@/lib/types';

const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', team: 'Equipe', scheduler: 'Agendamento' };
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import { addMember, removeMember } from './actions';
import { SECTIONS, allowedSections } from '@/lib/sections';

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
              <b style={{ color: 'var(--ink)', fontWeight: 500 }}>Agendamento</b>: marca como agendado e avisa o cliente. Só a dona da conta muda funções e permissões.
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
