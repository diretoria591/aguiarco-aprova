'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const params = useSearchParams();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(f.get('email') || '').trim(),
        password: String(f.get('password') || ''),
      });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
      const next = params.get('next');
      // navegação completa para o proxy ler os cookies novos
      window.location.assign(next && next.startsWith('/dashboard') ? next : '/dashboard');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} autoComplete="on">
      <h2>Entrar na <b>equipe</b></h2>
      <p className="muted" style={{ margin: '0 0 24px' }}>Acesso exclusivo da Aguiar&amp;Co.</p>
      <div className="field">
        <label htmlFor="em">E-mail</label>
        <input className="input" id="em" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="pw">Senha</label>
        <input className="input" id="pw" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div className="err-msg">{err}</div>
      <button className="btn block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
