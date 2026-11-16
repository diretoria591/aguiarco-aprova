'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import { addMember, removeMember } from './actions';

export function TeamView({ team, canManage }: { team: Profile[]; canManage: boolean }) {
  const me = useMe();
  const router = useRouter();
  const { toast, confirm } = useUI();
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

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
              {u.id === me.id
                ? <button className="btn sm line" onClick={() => setPwOpen(true)}><Icon name="key" />Trocar senha</button>
                : <button className="btn sm danger" onClick={() => del(u)}>Remover</button>}
            </div>
          ))}
        </section>
        <aside className="side">
          <div className="card">
            <h3>Como funciona</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Todas as pessoas da equipe veem todos os clientes, enviam materiais e respondem comentários. Clientes não precisam de senha: cada um acessa pelo próprio link.
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
